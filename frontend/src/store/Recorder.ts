import { type Frame } from "../analysis/algo/types";

/**
 * In-memory ring buffer that records all WS message frames.
 * Can be written to IndexedDB via SessionStore.
 */
export class Recorder {
  private frames: Frame[] = [];
  private _recording = false;
  private maxFrames: number;

  constructor(maxFrames = 120_000) {
    this.maxFrames = maxFrames;
  }

  get recording(): boolean {
    return this._recording;
  }

  start(): void {
    this.frames = [];
    this._recording = true;
    console.log("[recorder] Recording started");
  }

  stop(): Frame[] {
    this._recording = false;
    const snapshot = this.frames;
    this.frames = [];
    console.log(`[recorder] Recording stopped — ${snapshot.length} frames`);
    return snapshot;
  }

  push(topic: string, data: unknown, ts: number): void {
    if (!this._recording) return;
    this.frames.push({ topic, data, ts });
    if (this.frames.length > this.maxFrames) {
      this.frames.splice(0, Math.floor(this.maxFrames * 0.25));
    }
  }

  clear(): void {
    this.frames = [];
  }
}

/** Singleton recorder instance */
export const globalRecorder = new Recorder();
