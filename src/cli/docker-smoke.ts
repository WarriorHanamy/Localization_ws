/**
 * FAST-LIO Docker Smoke Test
 *
 * Runs a codified checklist against a running fastlio container.
 * All ROS commands are forwarded through `docker exec` on the remote Jetson.
 *
 * Usage:
 *   bun run docker-smoke <recipe>
 *
 * Example:
 *   bun run docker-start --recipe mapping-mid360
 *   bun run docker-smoke mapping-mid360
 */
import { runSSH, isUSBReachable } from "../core/ssh";
import type { RecipeName } from "../core/config";
import { RECIPES, REMOTE_PATH, ROS_DISTRO } from "../core/config";

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

async function ensureNativeDriver(): Promise<{ healthy: boolean; detail: string }> {
  console.log("\n\x1b[1;33m[pre-flight] Ensuring native LiDAR driver is healthy...\x1b[0m");

  const ddir = "$HOME/Localization_ws";
  const ros = `source /opt/ros/${ROS_DISTRO}/setup.bash`;
  const rosDev = `${ros} && source ${REMOTE_PATH}/devel/setup.bash 2>/dev/null`;

  // Step 1 — kill zombie livox processes
  await runSSH("sudo -n pkill -9 -f livox_ros_driver2 2>/dev/null || true; sleep 2; echo KILL_DONE", false);

  // Step 2 — ensure roscore is running
  { const { stdout } = await runSSH(`${ros} && timeout 3 rostopic list 2>&1 | grep -q /rosout && echo ROS_OK || echo ROS_NO`, false);
    if (!stdout.includes("ROS_OK")) {
      await runSSH(`${ros} && roscore > /tmp/roscore.log 2>&1 &`, false);
      await new Promise(r => setTimeout(r, 3000));
    } }

  // Step 3 — read lidar IP from config
  const { stdout: lidarIpRaw } = await runSSH(`jq -r '.lidar_configs[0].ip // empty' ${REMOTE_PATH}/bringup/config/MID360s_config.json 2>/dev/null || echo 192.168.2.88`, false);
  const lidarIp = lidarIpRaw.trim() || "192.168.2.88";

  // Step 4 — check if driver is already publishing IMU
  {
    const { stdout } = await runSSH(`${ros} && timeout 4 rostopic hz /livox/imu --window=20 2>&1 | grep "average rate" | tail -1 || echo NO_IMU`, false);
    const m = stdout.match(/average rate:\s*([\d.]+)/);
    if (m) {
      console.log(`  \x1b[32mOK\x1b[0m native driver alive (IMU ${parseFloat(m[1]).toFixed(0)} Hz, lidar=${lidarIp})`);
      return { healthy: true, detail: "native driver OK" };
    }
  }

  // Step 5 — start driver
  console.log(`  Starting native driver for lidar ${lidarIp}...`);
  await runSSH(`${ros} && rosparam delete /user_config_path 2>/dev/null; rosparam set /user_config_path ${REMOTE_PATH}/bringup/config/MID360s_config.json; rosparam set /xfer_format 0; rosparam set /multi_topic 0; rosparam set /data_src 0; rosparam set /cmdline_str ${lidarIp}; rosparam set /frame_id livox_frame`, false);
  await runSSH(`${rosDev} && nohup rosrun livox_ros_driver2 livox_ros_driver2_node ${lidarIp} __name:=livox_lidar_publisher2 > /tmp/livox_driver.log 2>&1 &`, false);
  await new Promise(r => setTimeout(r, 9000));

  // Step 6 — verify
  {
    const { stdout } = await runSSH(`${ros} && timeout 4 rostopic hz /livox/imu --window=20 2>&1 | grep "average rate" | tail -1 || echo NO_IMU`, false);
    const m = stdout.match(/average rate:\s*([\d.]+)/);
    if (m) {
      console.log(`  \x1b[32mOK\x1b[0m driver started (IMU ${parseFloat(m[1]).toFixed(0)} Hz)`);
      return { healthy: true, detail: "driver started" };
    }
  }

  console.log("  \x1b[31mFAIL\x1b[0m driver did not start — check /tmp/livox_driver.log on Jetson");
  return { healthy: false, detail: "driver failed" };
}

export async function cmdDockerSmoke(args: string[]): Promise<void> {
  const recipeName = args[0];

  if (!recipeName || !RECIPES[recipeName as RecipeName]) {
    console.log("[docker-smoke] Unknown recipe:", recipeName);
    console.log(USAGE);
    process.exit(1);
  }

  const containerName = `fastlio-${recipeName}`;
  const isMapping = recipeName.startsWith("mapping-");

  // Filter checklist: skip SLAM items for non-mapping recipes
  const items = CHECKLIST.filter((c) => isMapping || c.level !== "slam");

  if (!(await isUSBReachable())) {
    console.log("[docker-smoke] Jetson (192.168.55.1) not reachable.\n");
    process.exit(1);
  }

  await ensureNativeDriver();

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
      const remote = `docker ps --filter name=${containerName} --format '{{.Status}}' 2>/dev/null | head -1 || echo NOT_FOUND`;
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
    console.log("    • Container not running  →  run 'bun run docker-start --recipe <name>' first");
    console.log("    • IMU/LiDAR hz=0         →  check LiDAR USB/network, user_config_path, broadcast code");
    console.log("    • SLAM hz=0              →  check /home/nv/.ros/log for laserMapping startup errors");
    console.log("    • timeout on rostopic    →  container / ROS core not ready yet, retry in 5s");
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}
