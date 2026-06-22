import { type ReplayEngine } from "../../store/ReplayEngine";
import { useEffect, useState, useRef } from "react";

interface ReplayControlsProps {
  engine: ReplayEngine;
}

export function ReplayControls({ engine }: ReplayControlsProps) {
  const [curr, setCurr] = useState(engine.currentTime);
  const [dur, setDur] = useState(engine.duration);
  const [ratio, setRatio] = useState(0);
  const [state, setState] = useState(engine.state);
  const [speed, setSpeed] = useState(engine.speed);
  const dragging = useRef(false);
  const SPEEDS = [0.25, 0.5, 1, 2, 4];

  useEffect(() => {
    engine.on({
      onProgress: (t: number, r: number) => {
        if (!dragging.current) {
          setCurr(t);
          setRatio(r);
        }
      },
      onStateChange: (s: string) => setState(s as any),
    });
    setDur(engine.duration);
  }, [engine]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "#16161e",
        borderTop: "1px solid #2a2a3a",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        fontFamily: "'SF Mono','Fira Code',monospace",
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={() => {
          if (state === "playing") engine.pause();
          else engine.play();
        }}
        style={{
          background: "#1e1e2e",
          border: "1px solid #3a3a5a",
          borderRadius: 4,
          color: "#acd",
          cursor: "pointer",
          fontSize: 16,
          padding: "4px 10px",
          fontFamily: "inherit",
          fontWeight: 700,
        }}
      >
        {state === "playing" ? "⏸" : "▶"}
      </button>

      {/* Time */}
      <span style={{ color: "#889", minWidth: 80 }}>
        {fmt(curr)} / {fmt(dur)}
      </span>

      {/* Timeline */}
      <div
        style={{ flex: 1, height: 6, background: "#2a2a3a", borderRadius: 3, cursor: "pointer", position: "relative" }}
        onMouseDown={(e) => {
          dragging.current = true;
          const rect = e.currentTarget.getBoundingClientRect();
          const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          engine.seek(r);
          setRatio(r);
        }}
        onMouseMove={(e) => {
          if (!dragging.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          engine.seek(r);
          setRatio(r);
        }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: "#5a8",
            borderRadius: 3,
            transition: dragging.current ? "none" : "width 0.1s",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -4,
            left: `${ratio * 100}%`,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#5a8",
            marginLeft: -7,
            border: "2px solid #111",
          }}
        />
      </div>

      {/* Speed */}
      <div style={{ display: "flex", gap: 2 }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => { engine.setSpeed(s); setSpeed(s); }}
            style={{
              background: speed === s ? "#2a3a4a" : "transparent",
              border: "1px solid transparent",
              borderRadius: 3,
              color: speed === s ? "#acd" : "#667",
              cursor: "pointer",
              fontSize: 10,
              padding: "2px 6px",
              fontFamily: "inherit",
              fontWeight: speed === s ? 700 : 400,
            }}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Stop */}
      {state === "finished" && (
        <button
          onClick={() => { engine.stop(); }}
          style={{
            background: "#2a1a1a",
            border: "1px solid #5a2a2a",
            borderRadius: 4,
            color: "#c99",
            cursor: "pointer",
            fontSize: 12,
            padding: "4px 10px",
            fontFamily: "inherit",
          }}
        >
          ↺ Restart
        </button>
      )}
    </div>
  );
}
