import { useState } from "react";
import { globalRecorder } from "../store/Recorder";

export function RecordingButton() {
  const [recording, setRecording] = useState(false);
  const rec = globalRecorder;

  return (
    <>
      <style>{`
        @keyframes pulse-rec {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <button
        onClick={() => {
          if (rec.recording) {
            const frames = rec.stop();
            setRecording(false);
            if (frames.length > 0) {
              import("../store/SessionStore").then(({ saveSession }) => {
                const startTs = frames[0].ts;
                const endTs = frames[frames.length - 1].ts;
                const cloudCount = frames.filter(
                  (f) => f.topic === "/cloud_registered",
                ).length;
                saveSession(
                  `Session ${new Date().toLocaleString()}`,
                  frames,
                  endTs - startTs,
                  cloudCount,
                ).then((id) => {
                  console.log(`[recorder] Saved session #${id}`);
                });
              });
            }
          } else {
            rec.start();
            setRecording(true);
          }
        }}
        title={recording ? "Stop recording" : "Start recording"}
        style={{
          background: recording ? "#c33" : "#1a1a2e",
          border: recording ? "1px solid #e55" : "1px solid #3a3a5a",
          borderRadius: 4,
          color: recording ? "#fff" : "#889",
          cursor: "pointer",
          fontSize: 13,
          padding: "4px 10px",
          fontFamily: "inherit",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "all 0.15s",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: recording ? "#f44" : "#666",
            animation: recording ? "pulse-rec 1.5s ease-in-out infinite" : "none",
          }}
        />
        {recording ? "REC" : "Record"}
      </button>
    </>
  );
}
