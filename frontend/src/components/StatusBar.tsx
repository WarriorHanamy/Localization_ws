import type { RCStateData, ConnectionStatus } from "../lib/ros-types";
import { useRosTopic, useConnectionStatus } from "../hooks/useRosTopic";

function Dot({ active, colorOff = "#444", colorOn }: { active: boolean; colorOff?: string; colorOn: string }): React.JSX.Element {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: active ? colorOn : colorOff,
      marginRight: 6, verticalAlign: "middle",
    }} />
  );
}

export function StatusBar(): React.JSX.Element {
  const wsStatus = useConnectionStatus();
  const rc = useRosTopic<RCStateData>("/rc_state");

  const wsOk = wsStatus === "connected";

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      background: "rgba(0,0,0,0.8)", borderTop: "1px solid #333",
      padding: "6px 16px", display: "flex", gap: 20,
      fontFamily: "monospace", fontSize: 11, color: "#aaa",
      alignItems: "center",
    }}>
      <span>
        <Dot active={wsOk} colorOn="#3cb44b" />
        WS {wsOk ? "connected" : wsStatus}
      </span>

      <span>
        <Dot active={rc?.connected ?? false} colorOn="#ffe119" />
        RC {rc?.connected ? "connected" : "disconnected"}
      </span>

      <span style={{ flex: 1 }} />

      <span style={{ color: "#555" }}>
        l10n dashboard — {wsOk ? "live" : "offline"}
      </span>
    </div>
  );
}
