/**
 * useReplayTopic — mirrors useRosTopic API but feeds from ReplayEngine.
 * ReplayEngine dispatches frames here via dispatchReplayFrame.
 * Components can switch between live and replay data transparently.
 */
import { useEffect, useState } from "react";

const replayStore = new Map<string, { ts: number; data: unknown }>();
const replayListeners = new Map<
  string,
  Set<(data: unknown, ts: number) => void>
>();

/** Called by ReplayEngine to inject frames into the store. */
export function dispatchReplayFrame(
  topic: string,
  data: unknown,
  ts: number,
): void {
  replayStore.set(topic, { data, ts });
  const cbs = replayListeners.get(topic);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb(data, ts);
      } catch (err) {
        console.error(`[replay] cb error ${topic}:`, err);
      }
    }
  }
}

/** Clear all replay data (e.g. when loading a new session). */
export function clearReplayStore(): void {
  replayStore.clear();
}

export function useReplayTopic<T = unknown>(topic: string): T | null {
  const [data, setData] = useState<T | null>(() => {
    const stored = replayStore.get(topic);
    return stored ? (stored.data as T) : null;
  });

  useEffect(() => {
    const cb = (d: unknown) => setData(d as T);
    if (!replayListeners.has(topic)) {
      replayListeners.set(topic, new Set());
    }
    replayListeners.get(topic)!.add(cb);

    const stored = replayStore.get(topic);
    if (stored) setData(stored.data as T);

    return () => {
      replayListeners.get(topic)?.delete(cb);
    };
  }, [topic]);

  return data;
}
