/**
 * FAST-LIO Docker Smoke Test
 *
 * Starts a named container (suffixed with -smoke) and runs a codified checklist.
 * All ROS commands are forwarded through `docker exec` on the remote Jetson.
 *
 * Usage:
 *   bun run docker-smoke <recipe>
 *
 * Example:
 *   bun run docker-smoke mapping-mid360s
 */
import { runSSH, isUSBReachable, checkSSH } from "../core/ssh";
import { startContainer } from "./docker-start";
import type { RecipeName } from "../core/config";
import { RECIPES } from "../core/config";

// ═══════════════════════════════════════════════════════════════
// Smoke Test Checklist (codified)
// level       — pipeline layer
// name        — human-readable label
// target      — ROS topic / node name / check target
// check       — detection method: hz | node | echo | info
// expect      — human-readable expectation (for display)
// threshold   — numeric pass threshold
// ═══════════════════════════════════════════════════════════════

interface SmokeItem {
  level: "container" | "driver" | "slam";
  name: string;
  target: string;
  check: "hz" | "node" | "echo" | "info";
  expect: string;
  threshold: number;
}

const CHECKLIST: SmokeItem[] = [
  // L0 — Container & ROS infrastructure
  { level: "container", name: "Container alive",     target: "fastlio-",    check: "node", expect: "running",   threshold: 0 },
  { level: "container", name: "ROS core reachable",  target: "rosout",      check: "node", expect: "running",   threshold: 0 },
  { level: "container", name: "Driver node alive",   target: "livox_lidar_publisher2", check: "node", expect: "running", threshold: 0 },

  // L1 — LiDAR driver layer
  { level: "driver",    name: "IMU topic present",   target: "/livox/imu",         check: "info", expect: "sensor_msgs/Imu",       threshold: 0 },
  { level: "driver",    name: "IMU frequency",       target: "/livox/imu",         check: "hz",   expect: ">=50 Hz",             threshold: 50 },
  { level: "driver",    name: "LiDAR topic present", target: "/livox/lidar",       check: "info", expect: "sensor_msgs/PointCloud2", threshold: 0 },
  { level: "driver",    name: "LiDAR frequency",     target: "/livox/lidar",       check: "hz",   expect: ">=5 Hz",              threshold: 5 },

  // L2 — FAST-LIO SLAM layer (only if full bringup)
  { level: "slam",      name: "laserMapping alive",  target: "laserMapping",       check: "node", expect: "running",   threshold: 0 },
  { level: "slam",      name: "Odometry",            target: "/Odometry",          check: "hz",   expect: ">=5 Hz",    threshold: 5 },
  { level: "slam",      name: "Registered cloud",    target: "/cloud_registered",  check: "hz",   expect: ">=5 Hz",    threshold: 5 },
  { level: "slam",      name: "Prior local cloud",   target: "/prior_local_cloud", check: "hz",   expect: ">=1 Hz",    threshold: 1 },
  { level: "slam",      name: "Combined cloud",      target: "/cloud_registered_with_prior", check: "hz", expect: ">=5 Hz", threshold: 5 },
];

// ═══════════════════════════════════════════════════════════════

interface CheckResult {
  item: SmokeItem;
  pass: boolean;
  actual: string;
}

function dockerExec(container: string, cmd: string): string {
  // Source ROS first; container runs bash (non-login, entrypoint not executed on exec)
  return `docker exec ${container} bash -c 'source /opt/ros/noetic/setup.bash; source /catkin_ws/devel/setup.bash 2>/dev/null; ${cmd}'`;
}

function parseHz(stdout: string): number {
  const m = stdout.match(/average rate:\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function checkHz(container: string, topic: string): Promise<{ value: number; detail: string }> {
  const remote = `${dockerExec(container, `timeout 10 rostopic hz ${topic} --window=50 2>&1 | grep "average rate" | tail -1`)}`;
  const { stdout } = await runSSH(remote, false);
  const hz = parseHz(stdout);
  return { value: hz, detail: stdout.trim() || "(no output)" };
}

async function checkNode(container: string, name: string): Promise<{ value: number; detail: string }> {
  const remote = `${dockerExec(container, `rosnode list 2>/dev/null | grep -q ${name} && echo RUNNING || echo NOT`)}`;
  const { stdout } = await runSSH(remote, false);
  const running = stdout.includes("RUNNING");
  return { value: running ? 1 : 0, detail: running ? "running" : "not found" };
}

async function checkInfo(container: string, topic: string): Promise<{ value: number; detail: string }> {
  const remote = `${dockerExec(container, `rostopic info ${topic} 2>/dev/null | head -1 || echo NOT_FOUND`)}`;
  const { stdout } = await runSSH(remote, false);
  const found = !stdout.includes("NOT_FOUND") && stdout.trim().length > 0;
  return { value: found ? 1 : 0, detail: found ? stdout.trim() : "topic not found" };
}

const USAGE = `
Usage: bun run docker-smoke <recipe>

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

/**
 * Inspect and clean device host processes so the container can take over
 * port 11311 (roscore) and the LiDAR UDP port.
 */
async function cleanDeviceEnv(containerName: string): Promise<void> {
  console.log("\n\x1b[1;33m[pre-flight] Inspecting device environment...\x1b[0m");

  // 1. Device host roscore
  {
    const { stdout } = await runSSH(
      "pgrep -a rosmaster 2>/dev/null || echo NONE",
      false,
    );
    if (stdout.includes("NONE")) {
      console.log("  Device host roscore: \x1b[2mnot running\x1b[0m");
    } else {
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const pid = line.trim().split(/\s+/)[0];
        console.log(`  Device host roscore: \x1b[33mPID ${pid}\x1b[0m — killing to free port 11311`);
        await runSSH(`sudo kill -9 ${pid} 2>/dev/null || true; sleep 1; echo OK`, false);
      }
      console.log("    \x1b[32mstopped\x1b[0m");
    }
  }

  // 2. Device host Livox driver
  {
    const { stdout } = await runSSH(
      "pgrep -af livox_ros_driver2 2>/dev/null || echo NONE",
      false,
    );
    if (stdout.includes("NONE")) {
      console.log("  Device host Livox driver: \x1b[2mnot running\x1b[0m");
    } else {
      const lines = stdout.trim().split("\n");
      console.log(`  Device host Livox driver: \x1b[33m${lines.length} process(es)\x1b[0m`);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      await runSSH("sudo -n pkill -9 -f livox_ros_driver2 2>/dev/null; sleep 2; echo OK", false);
      const { stdout: again } = await runSSH(
        "pgrep -af livox_ros_driver2 2>/dev/null || echo NONE",
        false,
      );
      if (again.includes("NONE")) {
        console.log("    \x1b[32mstopped\x1b[0m");
      } else {
        console.log("    \x1b[31mWARN\x1b[0m driver still running");
      }
    }
  }

  // 3. Device container
  {
    const { stdout } = await runSSH(
      `docker ps -a --filter name=${containerName} --format '{{.Status}}' 2>/dev/null | head -1 || echo NOT_FOUND`,
      false,
    );
    if (stdout.includes("NOT_FOUND")) {
      console.log(`  Device container (${containerName}): \x1b[2mnot found\x1b[0m`);
    } else {
      console.log(`  Device container (${containerName}): \x1b[33m${stdout.trim()}\x1b[0m`);
    }
  }
}

export async function cmdDockerSmoke(args: string[]): Promise<void> {
  const recipeName = args[0];

  if (!recipeName || !RECIPES[recipeName as RecipeName]) {
    console.log("[docker-smoke] Unknown recipe:", recipeName);
    console.log(USAGE);
    process.exit(1);
  }

  const containerName = `fastlio-${recipeName}-smoke`;
  const isMapping = recipeName.startsWith("mapping-");

  // Filter checklist: skip SLAM items for non-mapping recipes
  const items = CHECKLIST.filter((c) => isMapping || c.level !== "slam");

  if (!(await isUSBReachable())) {
    console.log("[docker-smoke] Jetson (192.168.55.1) not reachable.\n");
    process.exit(1);
  }

  const sshOk = await checkSSH();
  if (!sshOk) {
    console.log("[docker-smoke] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  await cleanDeviceEnv(containerName);

  await startContainer(recipeName as RecipeName, "smoke");

  // Wait for container roscore to bind port 11311
  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n[docker-smoke] Testing container: ${containerName}\n`);

  let currentLevel = "";
  const results: CheckResult[] = [];

  for (const item of items) {
    if (item.level !== currentLevel) {
      currentLevel = item.level;
      const levelNum = currentLevel === "container" ? "0" : currentLevel === "driver" ? "1" : "2";
      console.log(`\n${"\x1b[1;36m"}L${levelNum} ${currentLevel.toUpperCase()}\x1b[0m ${"—".repeat(40 - currentLevel.length)}`);
    }

    // Container alive check: use docker ps instead of rosnode
    let result: { value: number; detail: string };
    if (item.target === "fastlio-") {
      const remote = `docker ps -a --filter name=${containerName} --format '{{.Status}}' 2>/dev/null | head -1 || echo NOT_FOUND`;
      const { stdout } = await runSSH(remote, false);
      const running = stdout.includes("Up") || stdout.includes("healthy");
      result = { value: running ? 1 : 0, detail: running ? stdout.trim() : "container not running" };
    } else {
      switch (item.check) {
        case "hz":   result = await checkHz(containerName, item.target);   break;
        case "node": result = await checkNode(containerName, item.target); break;
        case "info": result = await checkInfo(containerName, item.target); break;
        default:     result = { value: 0, detail: "unsupported check" };
      }
    }

    const pass = item.threshold === 0 ? result.value > 0 : result.value >= item.threshold;
    const actual = item.check === "hz"
      ? `${result.value.toFixed(1)} Hz`
      : result.value > 0 ? result.detail : "not running";

    results.push({ item, pass, actual });

    const mark = pass ? "✓" : "✗";
    const col = pass ? "\x1b[32m" : "\x1b[31m";
    const rst = "\x1b[0m";
    const label = item.name.padEnd(25) + item.target.padEnd(35);
    console.log(`  ${label}  ${col}${mark}${rst} ${pass ? actual.padEnd(14) : "\x1b[31mFAIL\x1b[0m   "} (expected ${item.expect})`);
  }

  // ═══════════════════
  // Summary
  // ═══════════════════
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const total = results.length;

  console.log(`\n${"—".repeat(55)}`);
  if (total === 0) {
    console.log("  No checks executed.");
  } else if (failed === 0) {
    console.log(`  \x1b[32mALL ${total}/${total} PASSED\x1b[0m`);
  } else {
    console.log(`  \x1b[32mPASS ${passed}/${total}\x1b[0m   \x1b[31mFAIL ${failed}/${total}\x1b[0m`);
    console.log("\n  Failed checks:");
    for (const r of results) {
      if (!r.pass) {
        console.log(`    ✗ ${r.item.check} ${r.item.target}  actual=${r.actual}  expected=${r.item.expect}`);
      }
    }
    console.log("\n  Possible causes:");
    console.log("    • Container start failed  →  check docker logs on Jetson");
    console.log("    • IMU/LiDAR hz=0         →  check LiDAR USB/network, user_config_path, broadcast code");
    console.log("    • SLAM hz=0              →  check /home/nv/.ros/log for laserMapping startup errors");
    console.log("    • timeout on rostopic    →  container / ROS core not ready yet, retry in 5s");
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}
