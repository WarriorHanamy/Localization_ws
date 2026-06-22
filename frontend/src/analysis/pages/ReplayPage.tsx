import { useState, useRef, useCallback } from "react";
import { SessionPicker } from "../components/SessionPicker";
import { ReplayControls } from "../components/ReplayControls";
import { WxxTogglePanel } from "../components/WxxTogglePanel";
import { ReplayScene3D } from "../components/ReplayScene3D";
import { ReplayEngine } from "../../store/ReplayEngine";
import { loadSessionFrames } from "../../store/SessionStore";
import { dispatchReplayFrame, clearReplayStore } from "../../hooks/useReplayTopic";
import { type Frame } from "../algo/types";

type Phase = "picker" | "loading" | "playing";

export function ReplayPage() {
  const [phase, setPhase] = useState<Phase>("picker");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const engineRef = useRef<ReplayEngine | null>(null);

  const handleSelect = useCallback(async (id: number) => {
    setSessionId(id);
    setPhase("loading");
    clearReplayStore();

    const rawFrames = await loadSessionFrames(id);
    const frames = rawFrames as Frame[];
    const engine = new ReplayEngine(frames);
    engineRef.current = engine;

    engine.on({
      onFrame: (topic, data, ts) => {
        dispatchReplayFrame(topic, data, ts);
      },
    });

    setPhase("playing");
    engine.play();
  }, []);

  const handleStop = useCallback(() => {
    engineRef.current?.destroy();
    clearReplayStore();
    setPhase("picker");
    setSessionId(null);
  }, []);

  if (phase === "picker") {
    return (
      <div style={{ height: "100%", overflow: "auto", background: "#111117", fontFamily: "'SF Mono','Fira Code',monospace" }}>
        <SessionPicker onSelect={handleSelect} />
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111117", color: "#667", fontSize: 14, fontFamily: "'SF Mono','Fira Code',monospace" }}>
        Loading session #{sessionId} …
      </div>
    );
  }

  const engine = engineRef.current;
  if (!engine) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#111117", fontFamily: "'SF Mono','Fira Code',monospace" }}>
      {/* Session info bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderBottom: "1px solid #1a1a2a", flexShrink: 0, fontSize: 12 }}>
        <span style={{ color: "#556", fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>Session #{sessionId}</span>
        <span style={{ color: "#556", fontSize: 11 }}>·</span>
        <span style={{ color: "#667", fontSize: 11 }}>{Math.round(engine.duration * 10) / 10}s · {engine.totalFrames} frames</span>
        <span style={{ marginLeft: "auto" }}>
          <button onClick={handleStop} style={{ background: "none", border: "1px solid #3a3a5a", borderRadius: 4, color: "#889", cursor: "pointer", fontSize: 11, padding: "2px 8px", fontFamily: "inherit" }}>← Choose another</button>
        </span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <ReplayScene3D />
        </div>
        <WxxTogglePanel />
      </div>

      {/* Bottom controls */}
      <ReplayControls engine={engine} />
    </div>
  );
}
