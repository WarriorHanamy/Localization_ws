import type { BranchPoint } from "./data";

const codePanelStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 4,
  fontSize: 11,
  lineHeight: 1.5,
  overflow: "auto",
  whiteSpace: "pre",
  fontFamily: "'SF Mono','Fira Code',monospace",
  minHeight: 60,
  margin: 0,
};

export function BranchPointCard({ bp }: { bp: BranchPoint }) {
  return (
    <div
      style={{
        border: "1px solid #2a2a3a",
        borderRadius: 6,
        padding: 14,
        background: "#14141e",
        transition: "all 0.15s",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#88ccff", fontWeight: 700, fontSize: 13 }}>{bp.label}</span>
          <span style={{ color: "#6a8", fontSize: 11 }}>→</span>
          <span style={{ color: "#acd", fontSize: 11 }}>{bp.file}:{bp.line}</span>
        </div>
      </div>

      {/* condition */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: "#889", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Condition
        </span>
        <span style={{ color: "#e9a", fontSize: 12, marginLeft: 8, fontFamily: "'SF Mono','Fira Code',monospace" }}>
          {bp.condition}
        </span>
      </div>

      {/* side-by-side code panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {/* SLAM — green theme */}
        <div style={{ borderRadius: 4, overflow: "hidden", border: "1px solid #2a4a2a" }}>
          <div
            style={{
              background: "#1a2a1a",
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: "#5a8",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              borderBottom: "1px solid #2a4a2a",
            }}
          >
            Pure SLAM
          </div>
          <pre style={{ ...codePanelStyle, background: "#0e1a0e", color: "#7ba" }}>
            <code>{bp.slamCode}</code>
          </pre>
        </div>

        {/* Reloc — red/magenta theme */}
        <div style={{ borderRadius: 4, overflow: "hidden", border: "1px solid #4a2a3a" }}>
          <div
            style={{
              background: "#2a1a2a",
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: "#c8a",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              borderBottom: "1px solid #4a2a3a",
            }}
          >
            Reloc
          </div>
          <pre style={{ ...codePanelStyle, background: "#1a0e1a", color: "#bac" }}>
            <code>{bp.relocCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
