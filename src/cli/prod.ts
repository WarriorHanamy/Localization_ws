import { RECIPES, type RecipeName, DOCKER_IMAGE, REMOTE_HOST_USB, REMOTE_USER, SSH_OPTS, REC_DEVICE_LOC_WS } from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { mkdirSync } from "fs";
import { $ } from "bun";

const PROD_SESSION = "prod";
const WORKSPACE = getRepoRoot();
const PROD_LOGS = `${WORKSPACE}/logs`;

const USAGE = `
Usage: bun run prod <command> [recipe]

Commands:
  slam [recipe]      Start slam (no map export)
  slam-map [recipe]  Start slam + map export
  reloc [recipe]     Start relocalization on prior map
  start <recipe>     Start with explicit recipe (override)
  stop               Stop production session + containers
  reset              Full reset (stop + kill all processes)
  attach             Attach to production tmux session
  status             Show production status

Recipe naming: <hardware>-<service>-<imu_src>
  hardware: c5v1 | c5pro
  imu_src:  livox | mavros
  example:  c5v1-mavros-map, c5pro-livox-reloc, c5v1-mavros

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

function onDeviceHost(): boolean {
  if (process.env.LOCALIZATION_DEVICE_HOST === "1") return true;
  return process.cwd().startsWith(REC_DEVICE_LOC_WS);
}

function sshVia(args: string[], needsTty = false): never {
  const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
  const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
  if (needsTty) opts.unshift("-t");
  const remoteCmd =
    `cd ${$.escape(REC_DEVICE_LOC_WS)} && ` +
    `REC_DEVICE_LOC_WS=${$.escape(REC_DEVICE_LOC_WS)} bun run prod ${args.map((arg) => $.escape(arg)).join(" ")}`;
  const proc = Bun.spawnSync(["ssh", ...opts, target, remoteCmd], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(proc.exitCode);
}

function containerName(recipe: string): string {
  return `fastlio-${recipe}`;
}

function spawn(cmd: string[], opts: Record<string, unknown> = {}): { exitCode: number; stdout: Buffer; stderr: Buffer } {
  return Bun.spawnSync(cmd, opts as any) as any;
}

function run(cmd: string[]): void {
  spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] });
}

function readHardwareState(): string | null {
  const p = Bun.spawnSync(["cat", "/tmp/smoke-hardware"], {
    stdout: "pipe", stderr: "ignore",
  });
  return (p.exitCode === 0) ? p.stdout.toString().trim() || null : null;
}

async function doStart(recipeName: string): Promise<void> {
  const recipe = RECIPES[recipeName as RecipeName];
  if (!recipe) {
    console.error(`[prod] Unknown recipe: ${recipeName}`);
    console.error(USAGE);
    process.exit(1);
  }
  const { launch, imu_src } = recipe;
  const container = containerName(recipeName);

  mkdirSync(PROD_LOGS, { recursive: true });

  console.log("[prod] Clean start: killing stale session, stopping stale container ...");
  spawn(["tmux", "kill-session", "-t", PROD_SESSION], { stderr: "ignore" });
  spawn(["docker", "stop", container], { stderr: "ignore" });
  spawn(["docker", "rm", container], { stderr: "ignore" });

  console.log(`[prod] Starting container '${container}' (${launch}, imu=${imu_src}) ...`);
  const dockerArgs: string[] = [
    "docker", "run", "-d",
    "--name", container,
    "--network", "host", "--ipc", "host", "--privileged",
  ];
  if (process.env.DISPLAY) {
    dockerArgs.push(
      "-e", `DISPLAY=${process.env.DISPLAY}`,
      "-v", "/tmp/.X11-unix:/tmp/.X11-unix",
    );
  }
  dockerArgs.push(
    "-v", `${WORKSPACE}/bringup:/catkin_ws/src/bringup`,
    DOCKER_IMAGE,
    "roslaunch", "bringup", launch, `imu_src:=${imu_src}`,
  );

  const dockerRun = spawn(dockerArgs);
  if (dockerRun.exitCode !== 0) {
    console.error(`[prod] docker run failed:\n${dockerRun.stderr.toString()}`);
    process.exit(dockerRun.exitCode);
  }

  console.log("[prod] Creating tmux session ...");
  run(["tmux", "new-session", "-d", "-s", PROD_SESSION, "-n", "slam"]);
  run(["tmux", "send-keys", "-t", `${PROD_SESSION}:slam`,
    `docker logs -f ${container} 2>&1 | tee -a ${PROD_LOGS}/${container}.log`, "Enter"]);

  run(["tmux", "new-window", "-t", PROD_SESSION, "-n", "topics"]);
  run(["tmux", "send-keys", "-t", `${PROD_SESSION}:topics`,
    `while true; do clear; date; echo '=== ROS Topics ==='; docker exec ${container} bash -c 'source /opt/ros/noetic/setup.bash 2>/dev/null && source /catkin_ws/devel/setup.bash 2>/dev/null && rostopic list 2>/dev/null' 2>/dev/null || echo '(waiting for container)'; sleep 3; done 2>&1 | tee -a ${PROD_LOGS}/${container}.topics.log`, "Enter"]);

  run(["tmux", "new-window", "-t", PROD_SESSION, "-n", "shell"]);
  run(["tmux", "send-keys", "-t", `${PROD_SESSION}:shell`,
    `docker exec -it ${container} bash`, "Enter"]);

  run(["tmux", "select-window", "-t", `${PROD_SESSION}:slam`]);

  console.log(`[prod] Started: session='${PROD_SESSION}' container='${container}' launch='${launch}'`);
  console.log(`[prod]   Slam log:  ${PROD_LOGS}/${container}.log`);
  console.log(`[prod]   Topics log: ${PROD_LOGS}/${container}.topics.log`);
  console.log("");

  if (process.stdin.isTTY) {
    console.log("[prod] Attaching (detach: Ctrl-B, d) ...");
    run(["tmux", "attach-session", "-t", PROD_SESSION]);
    console.log("[prod] Detached.");
  } else {
    console.log("[prod] Attach:  bun run prod attach");
    console.log("[prod] Stop:    bun run prod stop");
    console.log("[prod] Reset:   bun run prod reset");
  }
}

async function doStop(): Promise<void> {
  console.log("[prod] Stopping tmux session ...");
  spawn(["tmux", "kill-session", "-t", PROD_SESSION], { stderr: "ignore" });

  const ps = spawn(["docker", "ps", "-q", "--filter", "name=fastlio-"]);
  const ids = ps.stdout.toString().trim();
  if (ids) {
    const idList = ids.split(/\s+/);
    console.log("[prod] Stopping containers ...");
    spawn(["docker", "stop", ...idList], { stderr: "ignore" });
    spawn(["docker", "rm", ...idList], { stderr: "ignore" });
  }
  console.log("[prod] Done.");
}

async function doReset(): Promise<void> {
  console.log("[prod] Full reset: stopping production processes ...");
  await doStop();

  console.log("[prod] Killing native LiDAR driver ...");
  spawn(["sudo", "-n", "pkill", "-9", "-f", "livox_ros_driver2"], { stderr: "ignore" });

  console.log("[prod] Killing roslaunch processes ...");
  spawn(["pkill", "-f", "roslaunch"], { stderr: "ignore" });

  console.log("[prod] Killing mqtt_bridge ...");
  spawn(["pkill", "-f", "mqtt_bridge"], { stderr: "ignore" });

  console.log("[prod] Reset complete.");
}

async function doAttach(): Promise<void> {
  const hasSession = spawn(
    ["tmux", "has-session", "-t", PROD_SESSION],
    { stderr: "ignore" },
  );
  if (hasSession.exitCode === 0) {
    run(["tmux", "attach-session", "-t", PROD_SESSION]);
  } else {
    console.log(`[prod] No running session '${PROD_SESSION}'.`);
    process.exit(1);
  }
}

async function doStatus(): Promise<void> {
  console.log("=== tmux ===");
  const tmuxOut = spawn(["tmux", "ls"], { stderr: "ignore" });
  console.log(tmuxOut.stdout.toString().trim() || "(no sessions)");
  console.log("");

  console.log("=== containers ===");
  const dockerOut = spawn([
    "docker", "ps", "-a", "--filter", "name=fastlio-",
    "--format", "table {{.Names}}\t{{.Status}}\t{{.Image}}",
  ], { stderr: "ignore" });
  console.log(dockerOut.stdout.toString().trim() || "(none)");
  console.log("");

  console.log("=== logs ===");
  const { readdirSync } = await import("fs");
  try {
    const entries = readdirSync(PROD_LOGS, { withFileTypes: true });
    const files = entries.filter(e => e.isFile());
    if (files.length > 0) {
      for (const f of files) {
        const stat = (await import("fs")).statSync(`${PROD_LOGS}/${f.name}`);
        console.log(`  ${f.name}  ${(stat.size / 1024).toFixed(1)} KB`);
      }
    } else {
      console.log("(empty)");
    }
  } catch {
    console.log("(directory not found)");
  }
}

async function doProdByMode(mode: string, baseOverride?: string): Promise<void> {
  const base = baseOverride || readHardwareState();
  if (!base) {
    console.error(`[prod] No hardware state and no base specified.`);
    console.error("[prod] Run 'smoke data_link' first to select hardware.");
    process.exit(1);
  }
  const recipe = mode ? `${base}-${mode}` : base;
  await doStart(recipe);
}

export async function cmdProd(args: string[]): Promise<void> {
  const cmd = args[0];

  if (cmd === "--list-recipes") {
    console.log(Object.keys(RECIPES).sort().join(" "));
    process.exit(0);
  }

  if (!onDeviceHost()) {
    const needsTty = process.stdin.isTTY &&
      (["slam", "slam-map", "reloc", "start", "attach"].includes(cmd) || cmd === undefined);
    sshVia(args, needsTty);
  }

  switch (cmd) {
    case "slam":
      await doProdByMode("", args[1]);
      break;
    case "slam-map":
      await doProdByMode("map", args[1]);
      break;
    case "reloc":
      await doProdByMode("reloc", args[1]);
      break;
    case "start": {
      let recipeName = args[1];
      if (!recipeName || !RECIPES[recipeName as RecipeName]) {
        if (process.stdin.isTTY) {
          process.stderr.write("[prod] Choosing recipe via fzf ...\n");
          const fzf = spawn(["fzf", "--height=20%", "--header=Select a recipe"], {
            input: Object.keys(RECIPES).sort().join("\n"),
          });
          if (fzf.exitCode === 0) {
            recipeName = fzf.stdout.toString().trim();
          }
        }
        if (!recipeName || !RECIPES[recipeName as RecipeName]) {
          console.error("[prod] Missing or invalid recipe.");
          console.error(USAGE);
          process.exit(1);
        }
      }
      await doStart(recipeName);
      break;
    }
    case "stop":
      await doStop();
      break;
    case "reset":
      await doReset();
      break;
    case "attach":
      await doAttach();
      break;
    case "status":
      await doStatus();
      break;
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}
