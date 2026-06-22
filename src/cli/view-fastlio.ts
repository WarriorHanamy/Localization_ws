import { isUSBReachable } from "../core/ssh";
import {
  checkRoscore,
  startRoscore,
  checkNodesRunning,
  startSLAM,
  startMqttBridge,
  killRemoteNodes,
} from "./dashboard";

async function main() {
  // Start SLAM pipeline if Jetson is reachable
  const reachable = await isUSBReachable();
  if (reachable) {
    console.log("[view:fastlio] Jetson reachable — starting SLAM pipeline ...");

    const roscoreOk = await checkRoscore();
    if (!roscoreOk) {
      console.log("[view:fastlio] Starting roscore ...");
      await startRoscore();
    } else {
      console.log("[view:fastlio] roscore already running.");
    }

    const REQUIRED_NODES = ["/laserMapping"];
    const slamRunning = await checkNodesRunning(REQUIRED_NODES);
    if (!slamRunning) {
      console.log("[view:fastlio] Starting FAST-LIO SLAM ...");
      await startSLAM();
    } else {
      console.log("[view:fastlio] FAST-LIO already running.");
    }

    console.log("[view:fastlio] Starting MQTT bridge ...");
    await startMqttBridge();
  } else {
    console.log("[view:fastlio] Jetson not reachable — offline mode.");
  }

  // Start Bun relay server (MQTT → WS on :3000)
  console.log("[view:fastlio] Starting MQTT relay server on :3000 ...");
  const relay = Bun.spawn(["bun", "run", "src/server/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await Bun.sleep(1500);

  // Start Vite dev server on :5173
  console.log("[view:fastlio] Starting Vite dev server on :5173 ...");
  const vite = Bun.spawn(["bun", "run", "--bun", "vite", "--open"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  const code = await vite.exited;

  // Cleanup
  relay.kill();
  if (reachable) {
    console.log("[view:fastlio] Cleaning up remote nodes ...");
    await killRemoteNodes().catch(() => {});
  }

  console.log(`[view:fastlio] Exited (${code})`);
  process.exit(code ?? 0);
}

main().catch((err) => {
  console.error("[view:fastlio] Error:", err);
  process.exit(1);
});
