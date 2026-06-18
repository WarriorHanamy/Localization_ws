import { $ } from "bun";
import { runSSH, runSSHDetached, isUSBReachable } from "../core/ssh";
import { REMOTE_PATH, ROS_DISTRO } from "../core/config";

const LAUNCH_NAMES = {
  slam: "fast_lio bringup_mid360s.launch",
  bridge: `src/mqtt_bridge.py`,
};

const REQUIRED_NODES = ["/laserMapping"];

export interface DashboardArgs {
  noLaunch?: boolean;
  launchFile?: string;
}

function envSetup(): string {
  return [
    `source /opt/ros/${ROS_DISTRO}/setup.bash`,
    `source ${REMOTE_PATH}/devel/setup.bash`,
  ].join(" && ");
}

async function checkRoscore(): Promise<boolean> {
  const { exitCode } = await runSSH(
    `${envSetup()} && rostopic list >/dev/null 2>&1`,
    false,
  );
  return exitCode === 0;
}

async function checkNodeRunning(node: string): Promise<boolean> {
  const { exitCode } = await runSSH(
    `${envSetup()} && rosnode list 2>/dev/null | grep -q ${$.escape(node)}`,
    false,
  );
  return exitCode === 0;
}

async function checkNodesRunning(names: string[]): Promise<boolean> {
  for (const name of names) {
    if (!(await checkNodeRunning(name))) return false;
  }
  return true;
}

async function checkAnyNodeRunning(names: string[]): Promise<boolean> {
  for (const name of names) {
    if (await checkNodeRunning(name)) return true;
  }
  return false;
}

async function startRoscore(): Promise<void> {
  console.log("[dashboard] Starting roscore on Jetson ...");
  await runSSHDetached(`bash -c '${envSetup()} && roscore &'`);
  await Bun.sleep(3000);
}

async function startSLAM(): Promise<void> {
  console.log("[dashboard] Starting LiDAR driver + FAST-LIO mapping on Jetson ...");

  const slamCmd = [
    envSetup(),
    `roslaunch ${LAUNCH_NAMES.slam} > /dev/null 2>&1 &`,
  ].join(" && ");
  await runSSHDetached(slamCmd);
  await Bun.sleep(4000);
}

const ALL_LAUNCHED_NODES = ["/laserMapping", "/cpu_monitor", "/livox_lidar_publisher2"];

async function killRemoteNodes(): Promise<void> {
  console.log("[dashboard] Cleaning up remote nodes ...");
  const nodeKills = ALL_LAUNCHED_NODES.map(
    (n) => `rosnode kill ${$.escape(n)} 2>/dev/null || true`,
  ).join("; ");
  const cmd = [
    envSetup(),
    nodeKills,
    `pkill -f "roslaunch" 2>/dev/null || true`,
    `pkill -f "mqtt_bridge" 2>/dev/null || true`,
  ].join(" && ");
  await runSSH(cmd, false);
}

export async function cmdDashboard(args: DashboardArgs): Promise<void> {
  const reachable = await isUSBReachable();
  if (!reachable) {
    console.log("[dashboard] Jetson (192.168.55.1) not reachable. Aborting.");
    process.exit(1);
  }

  // Ensure roscore + rosbridge are running
  const roscoreOk = await checkRoscore();
  if (!roscoreOk) {
    console.log("[dashboard] roscore not running. Starting ...");
    await startRoscore();
  } else {
    console.log("[dashboard] roscore already running.");
  }

  // Start SLAM pipeline unless --no-launch
  if (!args.noLaunch) {
    const slamRunning = await checkNodesRunning(REQUIRED_NODES);
    if (slamRunning) {
      console.log("[dashboard] FAST-LIO nodes already running, skip launch.");
    } else {
      await startSLAM();
      console.log("[dashboard] FAST-LIO pipeline started.");
    }
  } else {
    console.log("[dashboard] --no-launch: SLAM pipeline not started.");
  }

  // Start MQTT bridge (ROS → Mosquitto)
  console.log("[dashboard] Starting MQTT bridge on Jetson ...");
  const bridgeCmd = [
    envSetup(),
    `python3 ${REMOTE_PATH}/src/mqtt_bridge.py > /dev/null 2>&1 &`,
  ].join(" && ");
  await runSSHDetached(bridgeCmd);
  await Bun.sleep(2000);

  // Register cleanup on exit
  const cleanup = () => {
    killRemoteNodes().catch(() => {});
  };
  process.on("SIGINT", () => {
    console.log("\n[dashboard] Shutting down ...");
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // Start Bun server (MQTT-based, no rosbridge)
  console.log("[dashboard] Starting web dashboard server ...");
  const { startBunServerWithMqtt } = await import("../server/index");
  await startBunServerWithMqtt();
}
