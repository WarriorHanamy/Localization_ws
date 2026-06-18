import { useEffect, useRef, useState } from "react";
import type { ServerMessage, ConnectionStatus } from "../lib/ros-types";

const WS_URL = `ws://${window.location.hostname}:3000/ws`;

interface RosDataStore {
  [topic: string]: { ts: number; data: unknown };
}

const listeners = new Map<string, Set<(data: unknown, ts: number) => void>>();
let ws: WebSocket | null = null;
let store: RosDataStore = {};
let connectionStatus: ConnectionStatus = "disconnected";
const statusListeners = new Set<(status: ConnectionStatus) => void>();

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setStatus("connecting");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[ws] Connected");
    setStatus("connected");
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg: ServerMessage = JSON.parse(event.data);
      if (msg.type === "heartbeat") return;
      if (msg.topic) {
        store = { ...store, [msg.topic]: { ts: msg.ts, data: msg.data } };
        const cbs = listeners.get(msg.topic);
        if (cbs) {
          for (const cb of cbs) {
            try {
              cb(msg.data, msg.ts);
            } catch (err) {
              console.error(`[ws] callback error for ${msg.topic}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error("[ws] parse error:", err);
    }
  };

  ws.onclose = () => {
    setStatus("disconnected");
    ws = null;
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function setStatus(s: ConnectionStatus): void {
  connectionStatus = s;
  for (const cb of statusListeners) cb(s);
}

connect();

export function useRosTopic<T = unknown>(topic: string): T | null {
  const [data, setData] = useState<T | null>(() => {
    const stored = store[topic];
    return stored ? (stored.data as T) : null;
  });

  useEffect(() => {
    const cb = (d: unknown) => setData(d as T);
    if (!listeners.has(topic)) {
      listeners.set(topic, new Set());
    }
    listeners.get(topic)!.add(cb);

    const stored = store[topic];
    if (stored) setData(stored.data as T);

    return () => {
      listeners.get(topic)?.delete(cb);
    };
  }, [topic]);

  return data;
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setLocal] = useState<ConnectionStatus>(connectionStatus);

  useEffect(() => {
    const cb = (s: ConnectionStatus) => setLocal(s);
    statusListeners.add(cb);
    setLocal(connectionStatus);
    return () => { statusListeners.delete(cb); };
  }, []);

  return status;
}
