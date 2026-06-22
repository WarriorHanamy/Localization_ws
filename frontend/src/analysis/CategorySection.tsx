import { type Category } from "./data";
import { ParamCard } from "./ParamCard";

export function CategorySection({
  cat,
  isActive,
}: {
  cat: Category;
  isActive: boolean;
}) {
  return (
    <section
      id={`cat-${cat.id}`}
      style={{
        padding: "24px 0",
        opacity: isActive ? 1 : 0.4,
        transition: "opacity 0.3s",
      }}
    >
      {/* Category header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
          cursor: "pointer",
        }}
        onClick={() => {
          const el = document.getElementById(`cat-${cat.id}`);
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>{cat.icon}</span>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#def",
            }}
          >
            {cat.title}
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "#667",
              fontFamily: "'SF Mono','Fira Code',monospace",
            }}
          >
            {cat.params.length} parameters
          </span>
        </div>
      </div>

      {/* Summary */}
      <p
        style={{
          margin: "0 0 16px 0",
          fontSize: 13,
          color: "#9ab",
          lineHeight: 1.6,
          paddingLeft: 34,
        }}
      >
        {cat.summary}
      </p>

      {/* Data flow diagram */}
      {cat.dataFlowLabel && (
        <div
          style={{
            margin: "0 0 16px 34px",
            padding: "8px 14px",
            background: "#0e0e16",
            borderRadius: 6,
            border: "1px solid #2a2a3a",
            fontFamily: "'SF Mono','Fira Code',monospace",
            fontSize: 11,
            color: "#89a",
            lineHeight: 1.6,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#6a8", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            Data Flow
          </span>
          <span style={{ flex: 1 }}>{cat.dataFlowLabel}</span>
        </div>
      )}

      {/* Parameters grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
          gap: 14,
          paddingLeft: 34,
        }}
      >
        {cat.params.map((p) => (
          <ParamCard key={p.name} param={p} />
        ))}
      </div>
    </section>
  );
}
