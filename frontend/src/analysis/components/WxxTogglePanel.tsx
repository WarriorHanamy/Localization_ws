import { useState } from "react";
import { CATEGORIES, type ParamDef, type Category } from "../data";

interface WxxTogglePanelProps {
  onToggle?: (paramName: string, enabled: boolean) => void;
}

/**
 * Right-hand side panel showing wxx parameter groups with on/off toggles.
 * Each toggle calls onToggle so the parent can enable/disable processing.
 */
export function WxxTogglePanel({ onToggle }: WxxTogglePanelProps) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (name: string) => {
    const next = !enabled[name];
    setEnabled((prev) => ({ ...prev, [name]: next }));
    onToggle?.(name, next);
  };

  return (
    <div
      style={{
        width: 260,
        background: "#13131b",
        borderLeft: "1px solid #2a2a3a",
        overflow: "auto",
        fontSize: 12,
        fontFamily: "'SF Mono','Fira Code',monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #2a2a3a",
          fontWeight: 700,
          fontSize: 12,
          color: "#9ab",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        wxx Parameters
      </div>

      {CATEGORIES.map((cat) => {
        const isExpanded = expanded[cat.id] ?? true;
        const activeCount = cat.params.filter(
          (p) => enabled[p.name],
        ).length;

        return (
          <div key={cat.id} style={{ borderBottom: "1px solid #1a1a2a" }}>
            {/* Category header */}
            <div
              onClick={() =>
                setExpanded((p) => ({
                  ...p,
                  [cat.id]: !isExpanded,
                }))
              }
              style={{
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                color: "#889",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#556" }}>
                {isExpanded ? "▼" : "▶"}
              </span>
              <span>
                {cat.icon} {cat.title}
              </span>
              {activeCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    color: "#5a8",
                    fontSize: 10,
                  }}
                >
                  {activeCount}/{cat.params.length}
                </span>
              )}
            </div>

            {/* Param toggles */}
            {isExpanded &&
              cat.params.map((p) => (
                <label
                  key={p.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 14px 4px 24px",
                    cursor: "pointer",
                    color: enabled[p.name] ? "#bcd" : "#556",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabled[p.name] ?? false}
                    onChange={() => toggle(p.name)}
                    style={{ accentColor: "#5a8" }}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
          </div>
        );
      })}
    </div>
  );
}
