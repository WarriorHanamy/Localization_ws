import { type ParamDef } from "./data";
import { SourceRef } from "./SourceRef";

export function ParamCard({ param }: { param: ParamDef }) {
  return (
    <div
      style={{
        background: "#16161e",
        border: "1px solid #2a2a3a",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#4a4a6a";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#2a2a3a";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#eef",
            fontFamily: "'SF Mono','Fira Code',monospace",
          }}
        >
          {param.name}
        </span>
        <span style={{ fontSize: 11, color: "#667" }}>
          {param.yamlPath}
        </span>
      </div>

      {/* Badges */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge label={param.type} color="#3a5" />
        <Badge label={`default: ${param.defaultValue}`} color="#56a" />
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: 13, color: "#bbc", lineHeight: 1.6 }}>
        {param.desc}
      </p>

      {/* Math */}
      {param.math && (
      <div
        style={{
          padding: "8px 12px",
          background: "#0e0e16",
          borderRadius: 6,
          borderLeft: "3px solid #5a8",
          fontFamily: "'SF Mono','Fira Code',monospace",
          fontSize: 12,
          color: "#8db",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: "#5a8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 2 }}>
          Math / Physics
        </span>
        {param.math}
      </div>
      )}

      {/* Source code references */}
      <SourceRef refs={param.refs} />
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color,
        border: `1px solid ${color}33`,
        background: `${color}15`,
        borderRadius: 4,
        padding: "1px 7px",
        fontFamily: "'SF Mono','Fira Code',monospace",
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}
