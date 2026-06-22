import { type CodeRef } from "./data";

export function SourceRef({ refs }: { refs: CodeRef[] }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 4,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Source References
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {refs.map((r, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: "#9ab",
              fontFamily: "'SF Mono','Fira Code',monospace",
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: "#6a8" }}>→</span>{" "}
            <span style={{ color: "#acd" }}>{r.file}:{r.line}</span>{" "}
            <span style={{ color: "#889" }}>— {r.desc}</span>
            {r.code && (
              <pre
                style={{
                  margin: "4px 0 0 14px",
                  padding: "6px 10px",
                  background: "#1a1a2e",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#bdc",
                  overflow: "auto",
                  lineHeight: 1.4,
                  border: "1px solid #2a2a3e",
                }}
              >
                <code>{r.code}</code>
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
