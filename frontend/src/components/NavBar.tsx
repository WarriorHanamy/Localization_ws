import { useConnectionStatus } from "../hooks/useRosTopic";
import { RecordingButton } from "./RecordingButton";

interface NavBarProps {
  view: string;
}

export function NavBar({ view }: NavBarProps) {
  const ws = useConnectionStatus();
  const isLive = ws === "connected";

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 16px",
        background: "rgba(17,17,17,0.85)",
        backdropFilter: "blur(4px)",
        borderBottom: "1px solid #222",
        fontSize: 12,
        fontFamily: "'SF Mono','Fira Code',monospace",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#88ccff",
          fontWeight: 700,
          letterSpacing: 1,
          fontSize: 11,
          marginRight: 4,
        }}
      >
        L10N
      </span>
      <a
        href="#"
        style={{
          color: view === "dashboard" ? "#88ccff" : "#667",
          textDecoration: "none",
          fontWeight: view === "dashboard" ? 600 : 400,
        }}
      >
        Dashboard
      </a>
      <a
        href="#replay"
        style={{
          color: view === "replay" ? "#88ccff" : "#667",
          textDecoration: "none",
          fontWeight: view === "replay" ? 600 : 400,
        }}
      >
        Replay
      </a>
      <a
        href="#analysis"
        style={{
          color: view === "analysis" ? "#88ccff" : "#667",
          textDecoration: "none",
          fontWeight: view === "analysis" ? 600 : 400,
        }}
      >
        Code Analysis
      </a>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {view === "dashboard" && ws === "connected" && <RecordingButton />}
        {view === "dashboard" && ws !== "connected" && (
          <span style={{ color: "#556", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#555" }} />
            offline
          </span>
        )}
      </div>
    </nav>
  );
}
