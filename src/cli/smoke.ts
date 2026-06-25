/**
 * Smoke tests — L1 (driver) and L2 (service) levels.
 * Subcommands are recipe names: l1-{livox|mavros}, l2-slam-{livox|mavros},
 * l2-fov-{livox|mavros}, l2-calib.
 */
import {
  REC_DEVICE_LOC_WS, ROS_DISTRO, REMOTE_USER, REMOTE_HOST_USB, SSH_OPTS,
  DOCKER_IMAGE_BASE, DOCKER_IMAGE_CALIB, DOCKER_IMAGE_SLAM, RECIPES, type RecipeName,
} from "../core/config";
import { deviceRvizMaximizedCommand, launchNoMachineViewer } from "../core/viewer";
import { readdirSync, statSync } from "fs";
import { $ } from "bun";

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

function fzfPick(options: string[]): string | null {
  const input = options.sort().join("\n");
  const proc = Bun.spawnSync(["bash", "-c", `echo "$1" | fzf --height=20% --header="Select recipe"`, "_", input], {
    stdin: "inherit", stdout: "pipe", stderr: "inherit",
  });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim();
}

// ---- results ----

interface SmokeResult {
  level: string; name: string; target: string; expected: string;
  value: number; actual: string; pass: boolean;
}

function parseResults(stdout: string): SmokeResult[] {
  const r: SmokeResult[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("SMOKE_RESULT\t")) continue;
    const [, level, name, target, expected, value, actual, passed] = line.split("\t");
    r.push({ level, name, target, expected, value: Number(value), actual, pass: passed === "1" });
  }
  return r;
}

function printResults(results: SmokeResult[]): void {
  let lv = "";
  for (const r of results) {
    if (r.level !== lv) { lv = r.level; console.log(`\n\x1b[1;36m${lv.toUpperCase()}\x1b[0m`); }
    const mk = r.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${r.name.padEnd(25)} ${r.target.padEnd(35)} ${mk} ${r.actual} (expected ${r.expected})`);
  }
}

// ---- bag auto-detection ----

const BAG_DIR = `${REC_DEVICE_LOC_WS}/bringup/bags`;
const BAG_DIR_CONT = "/catkin_ws/src/bringup/bags";

interface BagEntry {
  platform: string;
  file: string;
  ts: string;
}

function parseBagName(prefix: string, file: string): BagEntry | null {
  if (!file.startsWith(prefix) || !file.endsWith(".bag")) return null;
  const rest = file.slice(prefix.length);
  const sep = rest.indexOf("_");
  if (sep <= 0) {
    const ts = rest.slice(0, -4);
    if (!ts) return null;
    return { platform: "", file, ts };
  }
  const platform = rest.slice(0, sep);
  const ts = rest.slice(sep + 1, -4);
  return { platform, file, ts };
}

function listBagFilesLocal(prefix: string): BagEntry[] {
  const r: BagEntry[] = [];
  try {
    for (const f of readdirSync(BAG_DIR)) {
      const e = parseBagName(prefix, f);
      if (e) r.push(e);
    }
  } catch { /* noop */ }
  return r;
}

function listBagFilesSSH(prefix: string): BagEntry[] {
  const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
  const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
  const p = Bun.spawnSync(["ssh", ...opts, target, `ls -1 ${BAG_DIR}`], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return [];
  const r: BagEntry[] = [];
  for (const line of p.stdout.toString().split("\n").map(s => s.trim()).filter(Boolean)) {
    const e = parseBagName(prefix, line);
    if (e) r.push(e);
  }
  return r;
}

function findLatestBag(prefix: string, platform?: string): BagEntry | null {
  const all = listBagFilesLocal(prefix);
  const filtered = platform ? all.filter(e => e.platform === platform) : all;
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => b.ts.localeCompare(a.ts));
  return filtered[0];
}

function resolveBagPlatform(prefix: string): string | null {
  const entries = onDeviceHost() ? listBagFilesLocal(prefix) : listBagFilesSSH(prefix);
  if (entries.length === 0) return null;
  const platforms = [...new Set(entries.map(e => e.platform))].sort();
  if (platforms.length === 1) return platforms[0];
  if (!process.stdin.isTTY) return platforms[0];
  const input = platforms.join("\n");
  const proc = Bun.spawnSync(
    ["bash", "-c", `echo "$1" | fzf --height=20% --header="Select platform"`, "_", input],
    { stdin: "inherit", stdout: "pipe", stderr: "inherit" },
  );
  if (proc.exitCode !== 0) return platforms[0];
  return proc.stdout.toString().trim();
}

// ---- IMU mapping ----

const SMOKE_IMU: Record<string, string> = {
  "l1-livox": "livox", "l1-mavros": "mavros",
  "l2-slam-livox": "livox", "l2-slam-mavros": "mavros",
  "l2-fov-livox": "livox", "l2-fov-mavros": "mavros",
};

// ---- L1: driver-level (headless) ----

async function doSmokeL1(hw: string, imu: string, useMavros: boolean): Promise<void> {
  const containerName = `fastlio-l1-${hw}-${imu}`;

  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    const rc = `cd ${$.escape(REC_DEVICE_LOC_WS)} && REC_DEVICE_LOC_WS=${$.escape(REC_DEVICE_LOC_WS)} bun run smoke l1-${imu} ${$.escape(hw)}`;
    process.exit(Bun.spawnSync(["ssh", ...opts, target, rc], { stdio: ["inherit", "inherit", "inherit"] }).exitCode);
  }

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  console.log(`[smoke] L1(${imu}): starting '${containerName}' ...`);
  const run = dockerSpawn([
    "docker", "run", "-d",
    "--name", containerName, "--network", "host", "--ipc", "host", "--privileged",
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    DOCKER_IMAGE_BASE,
    "roslaunch", "bringup", "smoke-l1.launch",
  ]);
  if (run.exitCode !== 0) { console.error(run.stderr); process.exit(1); }

  console.log(`[smoke] L1(${imu}): running check-l1.sh (IMU_SRC=${imu}) ...`);
  const imuTopic = imu === "mavros" ? "/mavros/imu/data" : "/livox/imu";
  const exec = dockerSpawn([
    "docker", "exec",
    "-e", `SMOKE_IMU_SRC=${imu}`,
    "-e", `SMOKE_IMU_TOPIC=${imuTopic}`,
    containerName,
    "bash", "/catkin_ws/src/bringup/scripts/check-l1.sh",
  ]);

  const results = parseResults(exec.stdout);
  if (results.length === 0) {
    console.error("[smoke] No SMOKE_RESULT lines. Script output:");
    console.error(exec.stdout || exec.stderr || "(empty)");
    process.exit(1);
  }
  printResults(results);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"—".repeat(55)}`);
  console.log(failed.length === 0
    ? `  \x1b[32mALL ${results.length}/${results.length} PASSED\x1b[0m`
    : `  \x1b[32mPASS ${results.length - failed.length}/${results.length}\x1b[0m  \x1b[31mFAIL ${failed.length}/${results.length}\x1b[0m`);

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);
  if (failed.length > 0) process.exit(1);
}

// ---- L2 interactive helper ----

function l2Container(session: string, containerName: string, image: string, launch: string, hw: string, imu: string, rvizCfg: string): void {
  const SESSION = `smoke-${session}`;

  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    const rc = `cd ${$.escape(REC_DEVICE_LOC_WS)} && REC_DEVICE_LOC_WS=${$.escape(REC_DEVICE_LOC_WS)} bun run smoke ${session} ${$.escape(hw)}`;
    const p = Bun.spawnSync(["ssh", ...opts, target, rc], { stdio: ["inherit", "inherit", "inherit"] });
    if (p.exitCode !== 0) process.exit(p.exitCode);
    try { launchNoMachineViewer(); } catch (e) { console.error(`[smoke] ${e}`); process.exit(1); }
    if (process.stdin.isTTY) {
      process.exit(Bun.spawnSync(["ssh", "-t", ...opts, target, `tmux attach-session -t ${SESSION}`], { stdio: ["inherit", "inherit", "inherit"] }).exitCode);
    }
    return;
  }

  Bun.spawnSync(["tmux", "kill-session", "-t", SESSION], { stderr: "ignore" });
  Bun.spawnSync(["docker", "stop", containerName], { stderr: "ignore", stdout: "ignore" });
  Bun.spawnSync(["docker", "rm", containerName], { stderr: "ignore", stdout: "ignore" });

  const dockerRun = Bun.spawnSync([
    "docker", "run", "-d",
    "--name", containerName, "--network", "host", "--ipc", "host", "--privileged",
    "-e", "DISPLAY=:0",
    "-v", "/tmp/.X11-unix:/tmp/.X11-unix",
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    image,
    "roslaunch", "bringup", launch,
  ]);
  if (dockerRun.exitCode !== 0) { console.error(dockerRun.stderr.toString()); process.exit(1); }

  Bun.spawnSync(["tmux", "new-session", "-d", "-s", SESSION, "-n", session]);
  Bun.spawnSync(["tmux", "send-keys", "-t", `${SESSION}:${session}`, `docker logs -f ${containerName} 2>&1`, "Enter"]);
  Bun.spawnSync(["tmux", "new-window", "-t", SESSION, "-n", "rviz"]);
  Bun.spawnSync(["tmux", "send-keys", "-t", `${SESSION}:rviz`, `sleep 6 && ${deviceRvizMaximizedCommand(rvizCfg, ROS_DISTRO)}`, "Enter"]);
  Bun.spawnSync(["tmux", "select-window", "-t", `${SESSION}:${session}`]);
  console.log(`[smoke] Session ${SESSION}: container ${containerName}, windows: ${session} + rviz`);
  if (process.stdin.isTTY) {
    Bun.spawnSync(["tmux", "attach-session", "-t", SESSION], { stdio: ["inherit", "inherit", "inherit"] });
  }
}

// ---- L2 handlers ----

function doSmokeL2Slam(hw: string, imu: string): void {
  l2Container(`l2-slam-${imu}`, `fastlio-l2-slam-${imu}`, DOCKER_IMAGE_SLAM, "smoke-l2-slam.launch", hw, imu,
    `${REC_DEVICE_LOC_WS}/bringup/rviz_cfg/fov.rviz`);
}

function doSmokeL2Fov(hw: string, imu: string): void {
  l2Container(`l2-fov-${imu}`, `fastlio-l2-fov-${imu}`, DOCKER_IMAGE_SLAM, "smoke-l2-fov.launch", hw, imu,
    `${REC_DEVICE_LOC_WS}/bringup/rviz_cfg/fov.rviz`);
}

function doSmokeL2Calib(platform?: string): void {
  const containerName = "fastlio-l2-calib";

  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    const p = platform ?? resolveBagPlatform("calib_");
    if (!p) { console.error("[smoke] L2 calib: no calib bag on device"); process.exit(1); }
    const rc = `cd ${$.escape(REC_DEVICE_LOC_WS)} && REC_DEVICE_LOC_WS=${$.escape(REC_DEVICE_LOC_WS)} bun run smoke l2-calib ${$.escape(p)}`;
    process.exit(Bun.spawnSync(["ssh", ...opts, target, rc], { stdio: ["inherit", "inherit", "inherit"] }).exitCode);
  }

  const pf = platform ?? resolveBagPlatform("calib_");
  if (!pf) { console.error("[smoke] L2 calib: no calib bag in bringup/bags/"); process.exit(1); }

  const entry = findLatestBag("calib_", pf);
  if (!entry) { console.error(`[smoke] L2 calib: no 'calib_${pf}_*.bag'`); process.exit(1); }

  const bagArg = `${BAG_DIR_CONT}/${entry.file}`;
  console.log(`[smoke] L2 calib: using ${entry.file}`);

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  console.log(`[smoke] L2 calib: starting '${containerName}' ...`);
  const run = dockerSpawn([
    "docker", "run", "-d",
    "--name", containerName, "--network", "host", "--ipc", "host", "--privileged",
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    DOCKER_IMAGE_CALIB,
    "roslaunch", "bringup", "smoke_l2_calib_bag.launch",
    `bag_file:=${bagArg}`,
  ]);
  if (run.exitCode !== 0) { console.error(run.stderr); process.exit(1); }

  const waitMs = 120_000;
  console.log(`[smoke] L2 calib: waiting ${waitMs / 1000}s (bag loops, accum=200, refine=10s) ...`);
  Bun.sleepSync(waitMs);

  const cat = dockerSpawn([
    "docker", "exec", containerName,
    "cat", "/catkin_ws/src/lidar_imu_init/result/Initialization_result.txt",
  ]);

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  const parsed = parseCalibExtrinsic(cat.stdout);
  if (parsed) {
    const { R, T } = parsed;
    console.log("");
    console.log("───── copy into bringup/config/imu_mavros.yaml ─────");
    console.log("mapping:");
    console.log(`  extrinsic_R: [${R[0].toFixed(6)}, ${R[1].toFixed(6)}, ${R[2].toFixed(6)},`);
    console.log(`                 ${R[3].toFixed(6)}, ${R[4].toFixed(6)}, ${R[5].toFixed(6)},`);
    console.log(`                 ${R[6].toFixed(6)}, ${R[7].toFixed(6)}, ${R[8].toFixed(6)}]`);
    console.log(`  extrinsic_T: [${T[0].toFixed(6)}, ${T[1].toFixed(6)}, ${T[2].toFixed(6)}]`);
    console.log("────────────────────────────────────────────────────");
  } else {
    console.error("[smoke] L2 calib: could not find homogeneous matrix in result file.");
    process.exit(1);
  }
}

// ---- L2: eval (ground plane from /cloud_registered) ----

function doSmokeL2Eval(): void {
  const containerName = "fastlio-l2-eval";

  if (!onDeviceHost()) {
    const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
    const opts = SSH_OPTS.split(/\s+/).filter(Boolean);
    const rc = `cd ${$.escape(REC_DEVICE_LOC_WS)} && REC_DEVICE_LOC_WS=${$.escape(REC_DEVICE_LOC_WS)} bun run smoke l2-eval`;
    process.exit(Bun.spawnSync(["ssh", ...opts, target, rc], { stdio: ["inherit", "inherit", "inherit"] }).exitCode);
  }

  const entry = findLatestBag("calib_eval_");
  if (!entry) { console.error("[smoke] L2 eval: no calib_eval bag in bringup/bags/"); process.exit(1); }

  const bagArg = `${BAG_DIR_CONT}/${entry.file}`;
  console.log(`[smoke] L2 eval: using ${entry.file}`);

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  console.log(`[smoke] L2 eval: starting '${containerName}' ...`);
  const run = dockerSpawn([
    "docker", "run", "-d",
    "--name", containerName, "--network", "host", "--ipc", "host", "--privileged",
    "-v", `${REC_DEVICE_LOC_WS}/bringup:/catkin_ws/src/bringup`,
    DOCKER_IMAGE_BASE,
    "roslaunch", "bringup", "smoke_l2_eval.launch",
    `bag_file:=${bagArg}`,
  ]);
  if (run.exitCode !== 0) { console.error(run.stderr); process.exit(1); }

  const waitSec = 10;
  console.log(`[smoke] L2 eval: waiting ${waitSec}s for bag playback ...`);
  Bun.sleepSync(waitSec * 1000);

  const exec = dockerSpawn([
    "docker", "exec", containerName,
    "bash", "/catkin_ws/src/bringup/scripts/container-smoke-l2-eval.sh",
  ]);

  dockerSpawn(["docker", "stop", containerName]);
  dockerSpawn(["docker", "rm", containerName]);

  const results = parseResults(exec.stdout);
  if (results.length === 0) { console.error("[smoke] L2 eval: no SMOKE_RESULT lines."); process.exit(1); }
  printResults(results);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"—".repeat(55)}`);
  console.log(failed.length === 0
    ? `  \x1b[32mALL ${results.length}/${results.length} PASSED\x1b[0m`
    : `  \x1b[32mPASS ${results.length - failed.length}/${results.length}\x1b[0m  \x1b[31mFAIL ${failed.length}/${results.length}\x1b[0m`);
  if (failed.length > 0) process.exit(1);
}

/** Parse LI-Init's homogeneous transformation matrix from output. */
function parseCalibExtrinsic(output: string): { R: number[]; T: number[] } | null {
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Homogeneous Transformation Matrix from LiDAR to IMU")) {
      const nums: number[] = [];
      for (let j = 1; j <= 3; j++) {
        const vals = lines[i + j]?.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n)) ?? [];
        nums.push(...vals);
      }
      if (nums.length === 12) {
        return {
          R: [nums[0], nums[1], nums[2],  nums[4], nums[5], nums[6],  nums[8], nums[9], nums[10]],
          T: [nums[3], nums[7], nums[11]],
        };
      }
    }
  }
  return null;
}

// ---- entry ----

export async function cmdSmoke(args: string[]): Promise<void> {
  const sub = args[0];
  const hw = args[1];

  if (sub === "l2-calib") {
    doSmokeL2Calib(hw);
    return;
  }

  if (sub === "l2-eval") {
    doSmokeL2Eval();
    return;
  }

  const imu = SMOKE_IMU[sub];
  if (!imu) {
    console.log("[smoke] smoke test commands (recipe <hw>):");
    console.log("  bun run smoke l1-{livox|mavros} <c5v1|c5pro>     L1 驱动频率 (headless)");
    console.log("  bun run smoke l2-slam-{livox|mavros} <c5v1|c5pro> L2 SLAM + RVIZ");
    console.log("  bun run smoke l2-fov-{livox|mavros} <c5v1|c5pro>  L2 FOV 裁剪 + RVIZ");
    console.log("  bun run smoke l2-calib [platform]                   L2 标定 (auto-detect latest calib bag)");
    console.log("  bun run smoke l2-eval                               L2 评估 (auto-detect latest calib_eval bag)");
    return;
  }

  const useMavros = imu === "mavros";
  if (!hw) {
    const all = ["c5v1", "c5pro"].map(h => `${sub} ${h}`);
    const pick = process.stdin.isTTY ? fzfPick(all) : undefined;
    if (!pick) process.exit(1);
    const [s, h] = pick.split(" ");
    await cmdSmoke([s, h]);
    return;
  }

  if (sub.startsWith("l1-"))        { await doSmokeL1(hw, imu, useMavros); return; }
  if (sub.startsWith("l2-slam-"))   { doSmokeL2Slam(hw, imu); return; }
  if (sub.startsWith("l2-fov-"))    { doSmokeL2Fov(hw, imu); return; }
}
