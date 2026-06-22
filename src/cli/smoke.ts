/**
 * FAST-LIO Smoke Test
 *
 * Runs a codified checklist against the Jetson at 192.168.55.1.
 * Each check item has an expected threshold — if the measured value
 * meets or exceeds it, the check passes.
 *
 * Usage:
 *   bun run smoke              # all checks
 *   bun run smoke --level slam # only SLAM layer
 */
import { runSSH, sshTarget, isUSBReachable } from "../core/ssh";
import { REMOTE_PATH, ROS_DISTRO } from "../core/config";

// ═══════════════════════════════════════════════════════════════
// Smoke Test Checklist (codified)
// level       — pipeline layer
// name        — human-readable label
// topic       — ROS topic / node name / MQTT topic / URL
// check       — detection method: hz | node | proc | mqtt | http
// expect      — human-readable expectation (for display)
// threshold   — numeric pass threshold
// ═══════════════════════════════════════════════════════════════

interface SmokeItem {
  level: "driver" | "slam" | "bridge" | "web";
  name: string;
  topic: string;
  check: "hz" | "node" | "proc" | "mqtt" | "http";
  expect: string;
  threshold: number;
}

const CHECKLIST: SmokeItem[] = [
  // L1 — LiDAR driver
  { level: "driver", name: "LiDAR point cloud",  topic: "/livox/lidar",    check: "hz",   expect: ">=5 Hz",    threshold: 5 },
  { level: "driver", name: "IMU data",            topic: "/livox/imu",      check: "hz",   expect: ">=50 Hz",   threshold: 50 },

  // L2 — FAST-LIO SLAM
  { level: "slam",   name: "Odometry",            topic: "/Odometry",       check: "hz",   expect: ">=5 Hz",    threshold: 5 },
  { level: "slam",   name: "Registered cloud",    topic: "/cloud_registered",check: "hz",   expect: ">=5 Hz",    threshold: 5 },
  { level: "slam",   name: "Prior local cloud",   topic: "/prior_local_cloud", check: "hz", expect: ">=1 Hz",   threshold: 1 },
  { level: "slam",   name: "Combined cloud",      topic: "/cloud_registered_with_prior", check: "hz", expect: ">=5 Hz", threshold: 5 },
  { level: "slam",   name: "CPU usage",           topic: "/cpu_usage",      check: "hz",   expect: ">=1 Hz",    threshold: 1 },
  { level: "slam",   name: "laserMapping alive",  topic: "/laserMapping",   check: "node", expect: "running",  threshold: 0 },

  // L3 — MQTT bridge
  { level: "bridge", name: "mqtt_bridge process", topic: "mqtt_bridge",     check: "proc", expect: "running",  threshold: 0 },
  { level: "bridge", name: "MQTT odometry",       topic: "l10n/odometry",   check: "mqtt", expect: ">0 bytes",  threshold: 1 },
  { level: "bridge", name: "MQTT cloud",          topic: "l10n/cloud",      check: "mqtt", expect: ">0 bytes",  threshold: 1 },

  // L4 — Web servers
  { level: "web",    name: "Relay server",        topic: "http://localhost:3000", check: "http", expect: "200", threshold: 0 },
  { level: "web",    name: "Vite dev server",     topic: "http://localhost:5173", check: "http", expect: "200", threshold: 0 },
];

// ═══════════════════════════════════════════════════════════════

interface CheckResult {
  item: SmokeItem;
  pass: boolean;
  actual: string;
}

function rosEnv(): string {
  return `source /opt/ros/${ROS_DISTRO}/setup.bash && source ${REMOTE_PATH}/devel/setup.bash`;
}

/** Parse rostopic hz output: "average rate: 9.858" → 9.858 */
function parseHz(stdout: string): number {
  const m = stdout.match(/average rate:\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function checkHz(topic: string): Promise<{ value: number; detail: string }> {
  const cmd = `${rosEnv()} && timeout 6 rostopic hz ${topic} --window=5 2>&1 | grep "average rate" | tail -1`;
  const { stdout } = await runSSH(cmd, false);
  const hz = parseHz(stdout);
  return { value: hz, detail: stdout.trim() || "(no output)" };
}

async function checkNode(name: string): Promise<{ value: number; detail: string }> {
  const cmd = `${rosEnv()} && rosnode list 2>/dev/null | grep -q ${name} && echo "RUNNING" || echo "NOT"`;
  const { stdout } = await runSSH(cmd, false);
  const running = stdout.includes("RUNNING");
  return { value: running ? 1 : 0, detail: running ? "running" : "not found" };
}

async function checkProc(name: string): Promise<{ value: number; detail: string }> {
  const cmd = `pgrep -af ${name} 2>/dev/null | grep -v pgrep | head -1 || echo "NONE"`;
  const { stdout } = await runSSH(cmd, false);
  const running = !stdout.includes("NONE");
  return { value: running ? 1 : 0, detail: running ? stdout.trim().split("\n")[0] : "not running" };
}

async function checkMqtt(topic: string): Promise<{ value: number; detail: string }> {
  const cmd = `timeout 4 mosquitto_sub -t ${topic} -C 1 -W 3 2>/dev/null | wc -c`;
  const { stdout } = await runSSH(cmd, false);
  const bytes = parseInt(stdout.trim() || "0", 10);
  return { value: bytes, detail: `${bytes} bytes` };
}

async function checkHttp(url: string): Promise<{ value: number; detail: string }> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const ok = resp.ok ? 1 : 0;
    return { value: ok, detail: `${resp.status}` };
  } catch (err: any) {
    return { value: 0, detail: err.message };
  }
}

async function runCheck(item: SmokeItem): Promise<CheckResult> {
  let result: { value: number; detail: string };
  switch (item.check) {
    case "hz":   result = await checkHz(item.topic);   break;
    case "node": result = await checkNode(item.topic); break;
    case "proc": result = await checkProc(item.topic); break;
    case "mqtt": result = await checkMqtt(item.topic); break;
    case "http": result = await checkHttp(item.topic); break;
  }
  const pass = item.threshold === 0 ? result.value > 0 : result.value >= item.threshold;
  const actual = item.check === "hz"
    ? `${result.value.toFixed(1)} Hz`
    : item.check === "mqtt"
      ? `${result.value} bytes`
      : item.check === "http"
        ? `${result.detail}`
        : result.value > 0 ? "running" : "not running";

  return { item, pass, actual };
}

function fmtLabel(item: SmokeItem): string {
  return item.name.padEnd(25) + item.topic.padEnd(35);
}

function fmtStatus(pass: boolean, actual: string, expect: string): string {
  const mark = pass ? "✓" : "✗";
  const col = pass ? "\x1b[32m" : "\x1b[31m";
  const rst = "\x1b[0m";
  return `${col}${mark}${rst} ${actual.padEnd(14)} (expected ${expect})`;
}

export async function cmdSmoke(args: string[]): Promise<void> {
  const filterLevel = args.includes("--level") ? args[args.indexOf("--level") + 1] : null;
  const items = filterLevel
    ? CHECKLIST.filter((c) => c.level === filterLevel)
    : CHECKLIST;

  if (!(await isUSBReachable())) {
    console.log("[smoke] Jetson (192.168.55.1) not reachable. Only web checks will run.\n");
  }

  const reachable = await isUSBReachable();
  let currentLevel = "";
  const results: CheckResult[] = [];

  for (const item of items) {
    if (item.level !== currentLevel) {
      currentLevel = item.level;
      console.log(`\n${"\x1b[1;36m"}L${item.level === "driver" ? "1" : item.level === "slam" ? "2" : item.level === "bridge" ? "3" : "4"} ${item.level.toUpperCase()}\x1b[0m ${"—".repeat(40 - item.level.length)}`);
    }

    // Skip remote checks if Jetson is unreachable
    if (!reachable && item.check !== "http") {
      console.log(`  ${fmtLabel(item)}  \x1b[2m(skipped — no SSH)\x1b[0m`);
      continue;
    }

    const result = await runCheck(item);
    results.push(result);
    console.log(`  ${fmtLabel(item)}  ${fmtStatus(result.pass, result.actual, item.expect)}`);
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
        console.log(`    ✗ ${r.item.check} ${r.item.topic}  actual=${r.actual}  expected=${r.item.expect}`);
      }
    }
    console.log("\n  Possible causes:");
    console.log("    • LiDAR/IMU hz=0  → 检查 Livox 驱动 USB 连接及 IP 配置");
    console.log("    • SLAM hz=0       → laserMapping 在 IMU 初始化阶段卡死（需 IMU 数据持续涌入 50 帧）");
    console.log("    • MQTT bytes=0    → mqtt_bridge.py 回调未触发，检查 /home/nv/.ros/log 下的日志");
    console.log("    • Web 连不上      → bun run view:fastlio 是否在运行");
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}
