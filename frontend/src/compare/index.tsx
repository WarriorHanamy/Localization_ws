import { useRosTopic } from "../hooks/useRosTopic";
import { BRANCH_POINTS, SLAM_PIPELINE, RELOC_PIPELINE, DATA_COMPARISON, TOPIC_COMPARISON, PARAM_CLASSIFICATION } from "./data";
import { BranchPointCard } from "./BranchPoint";
import { PipelineComparison } from "./PipelineFlow";

function ModeBanner() {
  const priorData = useRosTopic("/prior_local_cloud");
  const isReloc = priorData !== null;

  return (
    <div
      style={{
        padding: "14px 24px",
        marginBottom: 16,
        borderRadius: 6,
        background: isReloc ? "linear-gradient(135deg, #1a1a3a, #1a1a28)" : "linear-gradient(135deg, #1a2a1a, #1a1a28)",
        border: `1px solid ${isReloc ? "#3a2a5a" : "#2a3a2a"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isReloc ? "#c8a" : "#5a8",
            boxShadow: `0 0 8px ${isReloc ? "#c8a8" : "#5a88"}`,
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ color: "#def", fontSize: 13, fontWeight: 700 }}>
            {isReloc ? "Relocalization Mode (with Prior Map)" : "Pure SLAM Mode (no Prior Map)"}
          </div>
          <div style={{ color: "#889", fontSize: 11, marginTop: 2 }}>
            {isReloc
              ? "/prior_local_cloud detected — robot is localizing against a pre-built map"
              : "/prior_local_cloud absent — robot is building map from scratch"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
        <span style={{ padding: "3px 8px", borderRadius: 4, background: "#1e1e3a", border: "1px solid #3a3a6a", color: "#88ccff" }}>
          {isReloc ? "Reloc" : "SLAM"}
        </span>
        <span style={{ padding: "3px 8px", borderRadius: 4, background: "#1a2a1a", border: "1px solid #2a3a2a", color: "#5a8" }}>
          initial_map_from_pcd: {isReloc ? "true" : "false"}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#def" }}>{title}</h2>
      {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#889" }}>{subtitle}</p>}
    </div>
  );
}

export function ComparePage() {
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#111117",
        color: "#ccc",
        fontFamily: "'SF Mono','Fira Code','JetBrains Mono',monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title area */}
      <div
        style={{
          padding: "24px 48px 8px",
          borderBottom: "1px solid #1a1a2a",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#def" }}>
          Pure SLAM vs Relocalization
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#889" }}>
          Algorithm pipeline comparison — 5 branching points in laserMapping.cpp
        </p>
        <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 11, color: "#667" }}>
          <span>{BRANCH_POINTS.length} branching points</span>
          <span>{DATA_COMPARISON.length} data structures</span>
          <span>based on FAST_LIO (wxx fork)</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 48px 64px", flex: 1 }}>
        {/* Mode Detection Banner */}
        <ModeBanner />

        {/* Pipeline Flow Comparison */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="Algorithm Pipeline" subtitle="Side-by-side flow comparison — green steps are exclusive to that mode" />
          <PipelineComparison slam={SLAM_PIPELINE} reloc={RELOC_PIPELINE} />
        </div>

        {/* Branching Points */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="Code Branching Points" subtitle="Each condition in laserMapping.cpp that diverges between the two modes" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BRANCH_POINTS.map((bp, i) => (
              <BranchPointCard key={i} bp={bp} />
            ))}
          </div>
        </div>

        {/* Data Structure Comparison */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="Data Structure Comparison" subtitle="Key data objects and their state in each mode" />
          <div
            style={{
              border: "1px solid #2a2a3a",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                background: "#1a1a2e",
                borderBottom: "1px solid #2a2a3a",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              <div style={{ padding: "8px 12px", color: "#88ccff" }}>Data Structure</div>
              <div style={{ padding: "8px 12px", color: "#5a8", borderLeft: "1px solid #2a2a3a" }}>Pure SLAM</div>
              <div style={{ padding: "8px 12px", color: "#c8a", borderLeft: "1px solid #2a2a3a" }}>Reloc</div>
            </div>
            {DATA_COMPARISON.map((row, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  background: i % 2 === 0 ? "transparent" : "#12121c",
                  borderBottom: i < DATA_COMPARISON.length - 1 ? "1px solid #1a1a2a" : "none",
                  fontSize: 12,
                }}
              >
                <div style={{ padding: "8px 12px", color: "#acd", fontWeight: 600 }}>{row.structure}</div>
                <div style={{ padding: "8px 12px", color: "#999", borderLeft: "1px solid #1a1a2a" }}>{row.slam}</div>
                <div style={{ padding: "8px 12px", color: "#aaa", borderLeft: "1px solid #1a1a2a" }}>{row.reloc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Parameter Classification */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="RELOC Parameter Classification" subtitle="Which parameters must be manually specified vs auto-estimated" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PARAM_CLASSIFICATION.map((cat, ci) => (
              <div
                key={ci}
                style={{
                  border: `1px solid ${
                    cat.nature === "manual" ? "#4a3a2a"
                    : cat.nature === "auto" ? "#2a4a3a"
                    : "#3a3a2a"
                  }`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {/* Category header */}
                <div
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    background:
                      cat.nature === "manual" ? "#2a1a0a"
                      : cat.nature === "auto" ? "#0a1a0a"
                      : "#1a1a0a",
                    color:
                      cat.nature === "manual" ? "#e82"
                      : cat.nature === "auto" ? "#3a8"
                      : "#aa6",
                    borderBottom: `1px solid ${
                      cat.nature === "manual" ? "#4a3a2a"
                      : cat.nature === "auto" ? "#2a4a3a"
                      : "#3a3a2a"
                    }`,
                  }}
                >
                  {cat.title}
                </div>
                {/* Items */}
                {cat.items.map((item, ii) => (
                  <div
                    key={ii}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 12,
                      padding: "6px 12px",
                      fontSize: 12,
                      background: ii % 2 === 0 ? "transparent" : "#12121c",
                      borderBottom: ii < cat.items.length - 1 ? "1px solid #1a1a2a" : "none",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#acd",
                        width: 200,
                        flexShrink: 0,
                        fontFamily: "'SF Mono','Fira Code',monospace",
                      }}
                    >
                      {item.param}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background:
                          item.nature === "manual" ? "#e822"
                          : item.nature === "auto" ? "#3a822"
                          : "#aa622",
                        color:
                          item.nature === "manual" ? "#e82"
                          : item.nature === "auto" ? "#3a8"
                          : "#aa6",
                        border:
                          item.nature === "manual" ? "1px solid #e8244"
                          : item.nature === "auto" ? "1px solid #3a844"
                          : "1px solid #aa624",
                        flexShrink: 0,
                      }}
                    >
                      {item.nature === "manual" ? "MANUAL"
                        : item.nature === "auto" ? "auto"
                        : "optional"}
                    </span>
                    <span style={{ color: "#889", flex: 1 }}>{item.effect}</span>
                  </div>
                ))}
                {/* Category note */}
                {cat.note && (
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: 11,
                      color: "#667",
                      borderTop: "1px solid #1a1a2a",
                      background: "#0e0e16",
                    }}
                  >
                    {cat.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Topic Status */}
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title="Topic Availability" subtitle="Which ROS topics are present in each mode" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TOPIC_COMPARISON.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: 4,
                  background: i % 2 === 0 ? "#14141e" : "#12121a",
                  fontSize: 12,
                }}
              >
                {/* Status dot */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      t.exists === "both" ? "#5a8"
                      : t.exists === "reloc_only" ? "#c8a"
                      : "#8a6",
                    flexShrink: 0,
                  }}
                />
                {/* Topic name */}
                <span style={{ color: "#88ccff", fontFamily: "'SF Mono','Fira Code',monospace", width: 220, flexShrink: 0 }}>
                  {t.topic}
                </span>
                {/* Mode badge */}
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 600,
                    background:
                      t.exists === "both" ? "#1a2a2a"
                      : t.exists === "reloc_only" ? "#2a1a2a"
                      : "#1a2a1a",
                    color:
                      t.exists === "both" ? "#5a8"
                      : t.exists === "reloc_only" ? "#c8a"
                      : "#8a6",
                    border:
                      t.exists === "both" ? "1px solid #2a3a2a"
                      : t.exists === "reloc_only" ? "1px solid #3a2a3a"
                      : "1px solid #2a3a2a",
                    flexShrink: 0,
                  }}
                >
                  {t.exists === "both" ? "both"
                    : t.exists === "reloc_only" ? "reloc only"
                    : "slam only"}
                </span>
                {/* Description */}
                <span style={{ color: "#889", flex: 1 }}>{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
