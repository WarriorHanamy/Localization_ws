import mqtt from "mqtt";
import { REMOTE_HOST_USB, DASHBOARD_PORT } from "../core/config";

const MQTT_PORT = 1883;
const WS_HEARTBEAT_MS = 30000;

const browserSockets = new Set<WebSocket>();

export interface MqttMessage {
  topic: string;
  ts: number;
  data: unknown;
}

type BroadcastFn = (msg: MqttMessage) => void;

/**
 * Connect to Mosquitto MQTT broker and relay messages to browser WebSockets.
 */
export async function startMqttRelay(
  broadcast: BroadcastFn,
): Promise<{ mqttClient: mqtt.MqttClient; stop: () => void }> {
  const brokerUrl = `mqtt://${REMOTE_HOST_USB}:${MQTT_PORT}`;
  console.log(`[mqtt] Connecting to ${brokerUrl} ...`);

  const mqttClient = mqtt.connect(brokerUrl, {
    connectTimeout: 5000,
    reconnectPeriod: 2000,
    keepalive: 30,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("MQTT connection timeout")), 5000);

    mqttClient.on("connect", () => {
      clearTimeout(timeout);
      console.log("[mqtt] Connected to Mosquitto");
      resolve();
    });

    mqttClient.on("error", (err) => {
      console.error("[mqtt] Connection error:", err.message);
    });
  });

  // Subscribe to all l10n topics
  const mqttTopics = [
    "l10n/odometry",
    "l10n/cloud",
    "l10n/cpu",
    "l10n/path",
    "l10n/ekf_odom",
    "l10n/prior_cloud",
    "l10n/combined_cloud",
    "l10n/rc_state",
    "l10n/bridge_status",
  ];

  mqttClient.subscribe(mqttTopics, { qos: 0 }, (err) => {
    if (err) {
      console.error("[mqtt] Subscribe error:", err.message);
    } else {
      console.log(`[mqtt] Subscribed to ${mqttTopics.length} topics`);
    }
  });

  // Relay MQTT messages to browser
  mqttClient.on("message", (topic, payload) => {
    const topicMap: Record<string, string> = {
      "l10n/odometry": "/Odometry",
      "l10n/cloud": "/cloud_registered",
      "l10n/cpu": "/cpu_usage",
      "l10n/path": "/path",
      "l10n/ekf_odom": "/ekf_quat/ekf_odom",
      "l10n/prior_cloud": "/prior_local_cloud",
      "l10n/combined_cloud": "/cloud_registered_with_prior",
      "l10n/rc_state": "/rc_state",
    };

    const mappedTopic = topicMap[topic];
    if (!mappedTopic) return;

    // Cloud topics: binary float32 array; others: JSON string
    let data: unknown;
    if (topic === "l10n/cloud" || topic === "l10n/prior_cloud" || topic === "l10n/combined_cloud") {
      // Convert binary to number array for JSON serialization
      const buf = Buffer.from(payload);
      const floats: number[] = [];
      for (let i = 0; i < buf.length; i += 4) {
        floats.push(buf.readFloatLE(i));
      }
      data = { count: floats.length / 3, points: floats };
    } else if (topic === "l10n/bridge_status") {
      return; // skip status heartbeats
    } else {
      try {
        data = JSON.parse(payload.toString());
      } catch {
        data = payload.toString();
      }
    }

    broadcast({ topic: mappedTopic, ts: Date.now(), data });
  });

  mqttClient.on("close", () => {
    console.log("[mqtt] Connection closed");
  });

  return {
    mqttClient,
    stop: () => {
      mqttClient.end(true);
    },
  };
}

export function startBunServer(): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    port: DASHBOARD_PORT,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return new Response();
      }

      // Production: serve built frontend
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`./frontend/dist${filePath}`);
      if (await file.exists()) {
        return new Response(file);
      }
      const fallback = Bun.file("./frontend/dist/index.html");
      if (await fallback.exists()) {
        return new Response(fallback);
      }
      return new Response("Dashboard not built. Run: bun run build", { status: 404 });
    },
    websocket: {
      open(ws: WebSocket) {
        browserSockets.add(ws);
        console.log(`[server] Browser connected (${browserSockets.size} total)`);
      },
      message(_ws: WebSocket, _message: string | Buffer) {},
      close(ws: WebSocket) {
        browserSockets.delete(ws);
        console.log(`[server] Browser disconnected (${browserSockets.size} total)`);
      },
      drain(_ws: WebSocket) {},
    },
  });

  console.log(`[server] Listening on http://localhost:${DASHBOARD_PORT}`);

  // Heartbeat for browser connections
  setInterval(() => {
    for (const ws of browserSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "heartbeat", ts: Date.now() }));
      }
    }
  }, WS_HEARTBEAT_MS);

  return server;
}

export function broadcast(msg: MqttMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of browserSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
