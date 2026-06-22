import type { Subprocess } from "bun";
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
  const reloc = Bun.argv.includes("--reloc") || Bun.argv.includes("-r");
  let relay: Subprocess | null = null;
  let vite: Subprocess | null = null;
  let reachable = false;

  async function cleanup() {
    console.log("\n[view:fastlio] Shutting down ...");

    if (vite && !vite.killed) {
      vite.kill("SIGTERM");
      try { await Promise.race([vite.exited, Bun.sleep(3000)]); } catch {}
    }
    if (relay && !relay.killed) {
      relay.kill("SIGTERM");
      try { await Promise.race([relay.exited, Bun.sleep(2000)]); } catch {}
    }

    if (reachable) {
      console.log("[view:fastlio] Cleaning up remote nodes ...");
      try {
        await Promise.race([
          killRemoteNodes(),
          Bun.sleep(8000).then(() => console.log("[view:fastlio] SSH cleanup timed out")),
        ]);
      } catch {}
    }

    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Start SLAM pipeline if Jetson is reachable
  reachable = await isUSBReachable();
  if (reachable) {
    console.log(`[view:fastlio] Jetson reachable — starting SLAM pipeline (reloc=${reloc}) ...`);

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
      console.log(`[view:fastlio] Starting FAST-LIO SLAM ${reloc ? "with relocalization" : ""} ...`);
      await startSLAM(reloc);
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
  relay = Bun.spawn(["bun", "run", "src/server/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await Bun.sleep(1500);

  // Start Vite dev server on :5173
  console.log("[view:fastlio] Starting Vite dev server on :5173 ...");
  vite = Bun.spawn(["bun", "run", "--bun", "vite", "--open"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  const code = await vite.exited;

  // Normal exit (Vite closed on its own, not Ctrl+C)
  if (relay && !relay.killed) relay.kill();
  if (reachable) {
    console.log("[view:fastlio] Cleaning up remote nodes ...");
    try {
      await Promise.race([
        killRemoteNodes(),
        Bun.sleep(8000).then(() => console.log("[view:fastlio] SSH cleanup timed out")),
      ]);
    } catch {}
  }

  console.log(`[view:fastlio] Exited (${code})`);
  process.exit(code ?? 0);
}

main().catch((err) => {
  console.error("[view:fastlio] Error:", err);
  process.exit(1);
});
