import { startMqttRelay, startBunServer, broadcast } from "./mqtt";

export async function startBunServerWithMqtt(): Promise<{
  server: ReturnType<typeof Bun.serve>;
  mqtt: Awaited<ReturnType<typeof startMqttRelay>>;
  stop: () => void;
}> {
  console.log("[server] Starting ...");

  // Connect MQTT to Mosquitto on Jetson
  let mqttRelay: Awaited<ReturnType<typeof startMqttRelay>>;
  try {
    mqttRelay = await startMqttRelay(broadcast);
  } catch (err) {
    console.warn(`[server] MQTT connection failed: ${err}`);
    console.warn("[server] Dashboard will start. Data appears when Mosquitto becomes available.");
    mqttRelay = null as any;
  }

  // Start Bun HTTP + WebSocket server
  const server = startBunServer();

  return {
    server,
    mqtt: mqttRelay,
    stop: () => {
      if (mqttRelay) mqttRelay.stop();
      server.stop();
    },
  };
}

async function main(): Promise<void> {
  const instance = await startBunServerWithMqtt();

  process.on("SIGINT", () => {
    console.log("\n[server] Shutting down ...");
    instance.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    instance.stop();
    process.exit(0);
  });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("[server] Fatal error:", err);
    process.exit(1);
  });
}
