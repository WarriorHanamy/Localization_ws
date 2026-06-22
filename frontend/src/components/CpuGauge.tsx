import type { CPUUsageData } from "../lib/ros-types";
import { useRosTopic, useConnectionStatus } from "../hooks/useRosTopic";

const CORE_COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8",
  "#f58231", "#911eb4", "#42d4f4", "#f032e6",
  "#bfef45", "#fabed4", "#469990", "#dcbeff",
];

export function CpuGauge(): React.JSX.Element {
  const cpu = useRosTopic<CPUUsageData>("/cpu_usage");
  const ws = useConnectionStatus();

  if (!cpu?.usage?.length) {
    const msg = ws === "connected" ? "CPU — waiting..." : "CPU — offline";
    return (
      <div style={{
        position: "absolute", top: 12, right: 12,
        background: "rgba(0,0,0,0.75)", padding: "8px 12px",
        borderRadius: 6, fontSize: 12, color: "#666",
        fontFamily: "monospace",
      }}>
        {msg}
      </div>
    );
  }

  const usage = cpu.usage;
  const avg = usage.reduce((a, b) => a + b, 0) / usage.length;

  return (
    <div style={{
      position: "absolute", top: 12, right: 12,
      background: "rgba(0,0,0,0.75)", padding: "10px 14px",
      borderRadius: 6, minWidth: 160,
      fontFamily: "monospace", fontSize: 11,
    }}>
      <div style={{ color: "#aaa", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
        CPU {avg.toFixed(0)}% avg
      </div>
      {usage.map((val, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ color: "#888", width: 12, textAlign: "right" }}>{i}</span>
          <div style={{
            flex: 1, height: 6, background: "#222", borderRadius: 3, overflow: "hidden",
          }}>
            <div style={{
              width: `${Math.min(val, 100)}%`, height: "100%",
              background: CORE_COLORS[i % CORE_COLORS.length],
              borderRadius: 3, transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ color: "#ccc", width: 30, textAlign: "right" }}>{val.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}
