/**
 * FAST-LIO device-container smoke test.
 *
 * The checks run inside the container in one docker exec. Topic-frequency
 * probes run concurrently, so the total duration is one sampling window.
 */
import { $ } from "bun";
import { runSSH, isUSBReachable, checkSSH } from "../core/ssh";
import { startContainer } from "./docker-start";
import type { RecipeName } from "../core/config";
import { RECIPES } from "../core/config";

interface SmokeResult {
  level: "container" | "driver" | "slam";
  name: string;
  target: string;
  expected: string;
  value: number;
  actual: string;
  pass: boolean;
}

const USAGE = `
Usage: bun run docker-smoke <recipe> [--reuse]

Options:
  --reuse  Test an existing smoke container without restarting it

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

/** Free port 11311 and the Livox UDP socket before starting an isolated test. */
async function cleanDeviceEnv(containerName: string): Promise<void> {
  console.log("\n\x1b[1;33m[pre-flight] Cleaning conflicting device-host processes...\x1b[0m");
  const command = [
    "master_pids=$(pgrep -x rosmaster 2>/dev/null || true)",
    "if [ -n \"$master_pids\" ]; then sudo kill -9 $master_pids 2>/dev/null || true; fi",
    "sudo -n pkill -9 -f '[l]ivox_ros_driver2' 2>/dev/null || true",
    `docker rm -f ${$.escape(containerName)} >/dev/null 2>&1 || true`,
    "echo CLEAN",
  ].join("; ");
  const result = await runSSH(command, false);
  if (result.exitCode !== 0 || !result.stdout.includes("CLEAN")) {
    throw new Error(`device pre-flight failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function parseResults(stdout: string): SmokeResult[] {
  const results: SmokeResult[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("SMOKE_RESULT\t")) continue;
    const [, level, name, target, expected, value, actual, passed] = line.split("\t");
    results.push({
      level: level as SmokeResult["level"],
      name,
      target,
      expected,
      value: Number(value),
      actual,
      pass: passed === "1",
    });
  }
  return results;
}

function printResults(results: SmokeResult[]): void {
  const levelOrder: Record<SmokeResult["level"], number> = {
    container: 0,
    driver: 1,
    slam: 2,
  };
  results.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  let currentLevel = "";
  for (const result of results) {
    if (result.level !== currentLevel) {
      currentLevel = result.level;
      const levelNum = currentLevel === "container" ? "0" : currentLevel === "driver" ? "1" : "2";
      console.log(`\n\x1b[1;36mL${levelNum} ${currentLevel.toUpperCase()}\x1b[0m`);
    }
    const mark = result.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(
      `  ${result.name.padEnd(25)} ${result.target.padEnd(35)} ${mark} ${result.actual}` +
      ` (expected ${result.expected})`,
    );
  }
}

async function printFailureDiagnosis(containerName: string): Promise<void> {
  const logs = await runSSH(
    `docker logs --tail 200 ${$.escape(containerName)} 2>&1`,
    false,
  );
  const output = logs.stdout;
  const diagnoses: string[] = [];
  if (output.includes("Params check failed, all livox lidars config is empty")) {
    diagnoses.push("Livox SDK rejected the LiDAR JSON; verify that the SDK supports the Mid360s schema");
  }
  if (output.includes("bind failed") || output.includes("Create detection socket failed")) {
    diagnoses.push("Livox UDP bind failed; verify the configured host IP exists on the LiDAR-facing NIC");
  }
  if (output.includes("Init lds lidar failed")) {
    diagnoses.push("Livox driver initialization failed");
  }
  for (const diagnosis of diagnoses) {
    console.log(`  Cause: ${diagnosis}`);
  }
}

export async function cmdDockerSmoke(args: string[]): Promise<void> {
  const recipeName = args.find((arg) => !arg.startsWith("--"));
  const reuse = args.includes("--reuse");

  if (!recipeName || !RECIPES[recipeName as RecipeName]) {
    console.log("[docker-smoke] Unknown recipe:", recipeName);
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  if (!(await isUSBReachable())) {
    throw new Error("Jetson (192.168.55.1) is not reachable");
  }
  if (!(await checkSSH())) {
    throw new Error("SSH check failed; run 'bun run sync' first");
  }

  const containerName = `fastlio-${recipeName}-smoke`;
  if (!reuse) {
    await cleanDeviceEnv(containerName);
    await startContainer(recipeName as RecipeName, "smoke");
  }

  console.log(`\n[docker-smoke] Testing ${containerName}${reuse ? " (reuse)" : ""} ...`);
  const mode = recipeName.startsWith("mapping-") ? "mapping" : "driver";
  const script = "/catkin_ws/src/bringup/scripts/container-smoke.sh";
  const command = `docker exec ${$.escape(containerName)} bash ${$.escape(script)} ${$.escape(mode)}`;
  const result = await runSSH(command, false);
  const results = parseResults(result.stdout);

  if (results.length === 0) {
    console.error(result.stderr.trim() || result.stdout.trim() || "smoke test produced no results");
    process.exitCode = 1;
    return;
  }

  printResults(results);
  const failed = results.filter((item) => !item.pass);
  console.log("\n" + "—".repeat(55));
  if (failed.length === 0 && result.exitCode === 0) {
    console.log(`  \x1b[32mALL ${results.length}/${results.length} PASSED\x1b[0m`);
    return;
  }

  console.log(`  \x1b[32mPASS ${results.length - failed.length}/${results.length}\x1b[0m  \x1b[31mFAIL ${failed.length}/${results.length}\x1b[0m`);
  await printFailureDiagnosis(containerName);
  console.log(`  Logs: ssh nv@192.168.55.1 'docker logs --tail 100 ${containerName}'`);
  process.exitCode = 1;
}
