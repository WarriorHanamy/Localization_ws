/**
 * FAST-LIO Smoke Test
 *
 * Human-in-the-loop visual tests and automated data-link checks,
 * all launched via Docker containers.
 *
 * Usage:
 *   bun run smoke fov                    # FOV crop visual comparison (RVIZ + VNC)
 *   bun run smoke data_link <recipe>    # data-link frequency check (headless)
 *   bun run smoke                        # show help
 */
import { REC_DEVICE_LOC_WS, ROS_DISTRO, REMOTE_USER, REMOTE_HOST_USB, SSH_OPTS, RECIPES, type RecipeName } from "../core/config";
import { statSync } from "fs";

// ---- utils ----

function onDeviceHost(): boolean {
  if (process.env.LOCALIZATION_DEVICE_HOST === "1") return true;
  if (process.cwd().startsWith(REC_DEVICE_LOC_WS)) return true;
  try { statSync(REC_DEVICE_LOC_WS); return true; } catch { return false; }
}

function dockerSpawn(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const p = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  return { exitCode: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

function recipeLaunch(name: string): { launch: string; fullName: string } | null {
  // Exact match
  const exact = RECIPES[name as RecipeName];
  if (exact) return { launch: exact.launch, fullName: name };
  // Try mapping- prefix (e.g. "mid360" → "mapping-mid360")
  const prefixed = `mapping-${name}`;
  const p = RECIPES[prefixed as RecipeName];
  if (p) return { launch: p.launch, fullName: prefixed };
  return null;
}

function fzfPick(options: string[]): string | null {
  const input = options.sort().join("\n");
  const proc = Bun.spawnSync(["bash", "-c", `echo "$1" | fzf --height=20% --header=Select a recipe`, "_", input], {
    stdout: "pipe",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim();
}

// ---- data_link ----

interface SmokeResult {
  level: string;
  name: string;
  target: string;
  expected: string;
  value: number;
  actual: string;
  pass: boolean;
}

function parseResults(stdout: string): SmokeResult[] {
  const results: SmokeResult[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("SMOKE_RESULT\t")) continue;
    const [, level, name, target, expected, value, actual, passed] = line.split("\t");
    results.push({
      level, name, target, expected,
      value: Number(value), actual,
      pass: passed === "1",
    });
  }
  return results;
}

function printResults(results: SmokeResult[]): void {
  let currentLevel = "";
  for (const r of results) {
    if (r.level !== currentLevel) {
      currentLevel = r.level;
      console.log(`\n\x1b[1;36m${r.level.toUpperCase()}\x1b[0m`);
    }
    const mark = r.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${r.name.padEnd(25)} ${r.target.padEnd(35)} ${mark} ${r.actual} (expected ${r.expected})`);
  }
}

async function doSmokeDataLink(recipeArg: string): Promise<void> {
  // Resolve short name or prompt via fzf
  let resolved: { launch: string; fullName: string } | null = null;
  if (recipeArg) {
    resolved = recipeLaunch(recipeArg);
  } else if (process.stdin.isTTY) {
    const pick = fzfPick(Object.keys(RECIPES));
    if (pick) resolved = recipeLaunch(pick);
  }
  if (!resolved) {
    console.error(`[smoke] Unknown recipe: ${recipeArg || "(none)"}`);
    console.error(`  Known: ${Object.keys(RECIPES).sort().join(" ")}`);
    process.exit(1);
  }

  const { launch, fullName } = resolved;
  const containerName = `fastlio-${fullName}-smoke`;

  // Devel-host: SSH bridge (no TTY needed — headless)
  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    const remoteCmd = `cd ${REC_DEVICE_LOC_WS} && bun run smoke data_link ${recipeArg}`;
    const proc = Bun.spawnSync(["ssh", ...opts, target, remoteCmd], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    process.exit(proc.exitCode);
  }

  // ---- Below runs on device-host ----

  // Clean stale
  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  // Start container
  console.log(`[smoke] Starting container '${containerName}' (${launch}) ...`);
  const run = dockerSpawn([
    "docker", "run", "-d",
    "--name", containerName,
    "--network", "host", "--ipc", "host", "--privileged",
    "-e", "DISPLAY=:0",
    "-v", "/tmp/.X11-unix:/tmp/.X11-unix",
    "-v", `${REC_DEVICE_LOC_WS}/PCD:/catkin_ws/src/fast_lio/PCD`,
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    "fastlio-jetson:latest",
    "roslaunch", "bringup", launch,
  ]);
  if (run.exitCode !== 0) {
    console.error(`[smoke] docker run failed (exit ${run.exitCode})`);
    console.error(run.stderr);
    process.exit(1);
  }

  // Run container-smoke.sh inside Docker (script has its own startup timeout)
  console.log(`[smoke] Running container-smoke.sh inside '${containerName}' ...`);
  const script = "/catkin_ws/src/bringup/scripts/container-smoke.sh";
  const mode = launch.includes("bringup_") ? "mapping" : "driver";
  const exec = dockerSpawn([
    "docker", "exec", containerName,
    "bash", script, mode,
  ]);
  if (exec.exitCode !== 0) {
    console.error(`[smoke] container-smoke.sh failed (exit ${exec.exitCode})`);
    console.error(exec.stderr || exec.stdout);
    process.exit(1);
  }

  const results = parseResults(exec.stdout);
  if (results.length === 0) {
    console.error("[smoke] No SMOKE_RESULT lines in output.");
    console.error(exec.stderr || exec.stdout);
    process.exit(1);
  }

  printResults(results);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"—".repeat(55)}`);
  if (failed.length === 0) {
    console.log(`  \x1b[32mALL ${results.length}/${results.length} PASSED\x1b[0m`);
    Bun.write("/tmp/smoke-hardware", fullName);
  } else {
    console.log(`  \x1b[32mPASS ${results.length - failed.length}/${results.length}\x1b[0m  \x1b[31mFAIL ${failed.length}/${results.length}\x1b[0m`);
    process.exit(1);
  }

  // Clean up
  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);
}

// ---- fov ----

function readHardwareState(): string | null {
  const p = Bun.spawnSync(["cat", "/tmp/smoke-hardware"], {
    stdout: "pipe", stderr: "ignore",
  });
  return (p.exitCode === 0) ? p.stdout.toString().trim() || null : null;
}

async function doSmokeFov(recipeArg?: string): Promise<void> {
  const stateHw = readHardwareState();
  const resolved = recipeLaunch(recipeArg || stateHw || "mid360s");
  if (!resolved) {
    console.error(`[smoke] Unknown recipe: ${recipeArg || "(none)"}`);
    process.exit(1);
  }
  const { fullName } = resolved;
  const hardware = fullName; // "mid360" or "mid360s"

  const SESSION = "smoke-fov";
  const containerName = "fastlio-smoke-fov";
    const rvizCfg = `${REC_DEVICE_LOC_WS}/src/bringup/rviz_cfg/smoke_fov_test.rviz`;

  // Devel-host: open VNC viewer, then SSH bridge with TTY
  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const vncViewer = Bun.which("gvncviewer") || Bun.which("vncviewer");
    if (vncViewer) {
      Bun.spawn([vncViewer, "192.168.55.1:0"], { stdout: "ignore", stderr: "ignore" });
      console.log(`[smoke] VNC viewer opened: ${vncViewer} 192.168.55.1:0`);
    } else {
      console.log("[smoke] Install gvncviewer or vncviewer to see RVIZ remotely.");
      console.log("[smoke]   Arch:  sudo pacman -S gtk-vnc");
      console.log("[smoke]   macOS: brew install tigervnc-viewer");
    }
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    opts.unshift("-t");
    const recipePart = recipeArg ? ` ${recipeArg}` : "";
    const remoteCmd = `cd ${REC_DEVICE_LOC_WS} && bun run smoke fov${recipePart}`;
    const proc = Bun.spawnSync(["ssh", ...opts, target, remoteCmd], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    process.exit(proc.exitCode);
  }

  // ---- Below runs on device-host ----
  Bun.spawnSync(["tmux", "kill-session", "-t", SESSION], { stderr: "ignore" });

  // Ensure x11vnc is sharing display :0 for devel-host VNC viewer
  Bun.spawnSync(["pkill", "x11vnc", "--older", "10"], { stderr: "ignore", stdout: "ignore" });
  const vncCheck = Bun.spawnSync(["pgrep", "x11vnc"], { stderr: "ignore", stdout: "pipe" });
  if (vncCheck.exitCode !== 0) {
    console.log("[smoke] Starting x11vnc for display :0 ...");
    Bun.spawn(["x11vnc", "-display", ":0", "-forever", "-quiet", "-shared"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await Bun.sleep(1);
  }

  // Start Docker container locally
  console.log(`[smoke] Starting container '${containerName}' ...`);
  Bun.spawnSync(["docker", "stop", containerName], { stderr: "ignore", stdout: "ignore" });
  Bun.spawnSync(["docker", "rm", containerName], { stderr: "ignore", stdout: "ignore" });
  const dockerRun = Bun.spawnSync([
    "docker", "run", "-d",
    "--name", containerName,
    "--network", "host", "--ipc", "host", "--privileged",
    "-e", "DISPLAY=:0",
    "-v", "/tmp/.X11-unix:/tmp/.X11-unix",
    "-v", `${REC_DEVICE_LOC_WS}/PCD:/catkin_ws/src/fast_lio/PCD`,
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    "fastlio-jetson:latest",
    "roslaunch", "bringup", "smoke_fov.launch", `hardware:=${hardware}`,
  ]);
  if (dockerRun.exitCode !== 0) {
    console.error(`[smoke] docker run failed (exit ${dockerRun.exitCode})`);
    console.error(dockerRun.stderr.toString());
    process.exit(1);
  }

  // Create tmux session
  console.log(`[smoke] Creating tmux session '${SESSION}' ...`);
  Bun.spawnSync(["tmux", "new-session", "-d", "-s", SESSION, "-n", "slam"]);
  Bun.spawnSync(["tmux", "send-keys", "-t", `${SESSION}:slam`,
    `docker logs -f ${containerName} 2>&1`, "Enter"]);

  // RVIZ window (runs natively on display :0 — viewed via VNC)
  Bun.spawnSync(["tmux", "new-window", "-t", SESSION, "-n", "rviz"]);
  Bun.spawnSync(["tmux", "send-keys", "-t", `${SESSION}:rviz`,
    `sleep 6 && export DISPLAY=:0 && source /opt/ros/${ROS_DISTRO}/setup.bash && rviz -d ${rvizCfg}`, "Enter"]);

  Bun.spawnSync(["tmux", "select-window", "-t", `${SESSION}:slam`]);

  console.log(`[smoke] FOV smoke test started. Session: ${SESSION}`);
  console.log(`[smoke]   Container: ${containerName}`);
  console.log(`[smoke]   Window 'slam': container log`);
  console.log(`[smoke]   Window 'rviz': RViz on display :0 (view via VNC)`);

  if (process.stdin.isTTY) {
    console.log("[smoke] Attaching (detach: Ctrl-B, d) ...");
    Bun.spawnSync(["tmux", "attach-session", "-t", SESSION], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    console.log("[smoke] Detached.");
  }
}

// ---- entry ----

export async function cmdSmoke(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === "fov") {
    await doSmokeFov(args[1]);
    return;
  }

  if (sub === "data_link") {
    await doSmokeDataLink(args[1]);
    return;
  }

  console.log("[smoke] smoke test commands:");
  console.log("  bun run smoke fov                     FOV crop visual check (RVIZ + VNC)");
  console.log("  bun run smoke data_link <recipe>      data-link frequency check (headless)");
  console.log(`  Recipes: ${Object.keys(RECIPES).sort().join(" ")}`);
}
