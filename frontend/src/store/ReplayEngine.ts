import { type Frame } from "../analysis/algo/types";

export type ReplayState = "stopped" | "playing" | "paused" | "finished";

export interface ReplayCallbacks {
  onFrame?: (topic: string, data: unknown, ts: number) => void;
  onProgress?: (ts: number, ratio: number) => void;
  onStateChange?: (state: ReplayState) => void;
  onFinish?: () => void;
}

/**
 * Timeline playback engine for recorded frames.
 * Dispatches frames at original timestamp intervals, scaled by speed.
 */
export class ReplayEngine {
  private frames: Frame[];
  private _cursor = 0;
  private _state: ReplayState = "stopped";
  private _speed = 1;
  private animId = 0;
  private lastDispatch = 0;
  private startTs = 0;
  private endTs = 0;
  private callbacks: ReplayCallbacks = {};

  constructor(frames: Frame[]) {
    this.frames = frames.sort((a, b) => a.ts - b.ts);
    if (this.frames.length > 0) {
      this.startTs = this.frames[0].ts;
      this.endTs = this.frames[this.frames.length - 1].ts;
    }
  }

  get state(): ReplayState {
    return this._state;
  }
  get speed(): number {
    return this._speed;
  }
  get cursor(): number {
    return this._cursor;
  }
  get totalFrames(): number {
    return this.frames.length;
  }
  get duration(): number {
    return this.endTs - this.startTs;
  }
  get currentTime(): number {
    return this._cursor < this.frames.length
      ? this.frames[this._cursor].ts - this.startTs
      : this.duration;
  }

  on(cbs: Partial<ReplayCallbacks>): void {
    Object.assign(this.callbacks, cbs);
  }

  play(): void {
    if (this.frames.length === 0) return;
    if (this._cursor >= this.frames.length) {
      this._cursor = 0;
    }
    this._state = "playing";
    this.lastDispatch = performance.now();
    this.callbacks.onStateChange?.(this._state);
    this.schedule();
  }

  pause(): void {
    this._state = "paused";
    cancelAnimationFrame(this.animId);
    this.callbacks.onStateChange?.(this._state);
  }

  stop(): void {
    this._state = "stopped";
    this._cursor = 0;
    cancelAnimationFrame(this.animId);
    this.callbacks.onStateChange?.(this._state);
  }

  seek(ratio: number): void {
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
    this._cursor = Math.floor(ratio * this.frames.length);
    // dispatch the frame at the new cursor
    const frame = this.frames[this._cursor];
    if (frame) {
      this.callbacks.onFrame?.(frame.topic, frame.data, frame.ts);
    }
    this.callbacks.onProgress?.(
      this.currentTime,
      this._cursor / this.frames.length,
    );
  }

  setSpeed(s: number): void {
    this._speed = s;
    this.lastDispatch = performance.now();
  }

  destroy(): void {
    cancelAnimationFrame(this.animId);
    this.callbacks = {};
  }

  private schedule(): void {
    this.animId = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    if (this._state !== "playing") return;

    const frame = this.frames[this._cursor];
    if (!frame) {
      this._state = "finished";
      this.callbacks.onStateChange?.(this._state);
      this.callbacks.onFinish?.();
      return;
    }

    // Wait for the correct wall-clock interval scaled by speed
    const nextFrame = this.frames[this._cursor + 1];
    if (nextFrame) {
      const dtReal = (nextFrame.ts - frame.ts) * 1000; // real ms between frames
      const dtSim = dtReal / this._speed; // simulated ms
      const elapsed = now - this.lastDispatch;

      if (elapsed < dtSim) {
        this.schedule();
        return;
      }
    }

    // Dispatch current frame
    this.callbacks.onFrame?.(frame.topic, frame.data, frame.ts);

    this._cursor++;
    this.lastDispatch = now;
    this.callbacks.onProgress?.(
      this.currentTime,
      this._cursor / this.frames.length,
    );

    this.schedule();
  };
}
