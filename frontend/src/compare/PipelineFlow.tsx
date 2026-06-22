import type { PipelineFlow, PipelineStep } from "./data";

const modeColor: Record<string, string> = {
  auto: "#3a8",
  manual: "#e82",
  "optional-auto": "#aa6",
};
const modeLabel: Record<string, string> = {
  auto: "auto",
  manual: "MANUAL",
  "optional-auto": "optional",
};

function ModeTag({ mode }: { mode: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 5px",
        borderRadius: 3,
        marginLeft: 6,
        background: `${modeColor[mode]}22`,
        color: modeColor[mode],
        border: `1px solid ${modeColor[mode]}44`,
        letterSpacing: 0.3,
      }}
    >
      {modeLabel[mode]}
    </span>
  );
}

function StepRow({ step, idx, total }: { step: PipelineStep; idx: number; total: number }) {
  const isLast = idx === total - 1;
  const isDiff = step.slamOnly || step.relocOnly;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      {/* step number + connector */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: isDiff ? "#5a8" : "#2a2a3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isDiff ? "#111" : "#667",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {idx + 1}
        </div>
        {!isLast && (
          <div style={{ width: 1, flex: 1, background: isDiff ? "#2a4a3a" : "#222", minHeight: 12 }} />
        )}
      </div>
      {/* content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
        <div style={{ color: "#ddd", fontSize: 12, fontWeight: 600, marginBottom: 1, display: "flex", alignItems: "center" }}>
          {step.label}
          {step.mode && <ModeTag mode={step.mode} />}
        </div>
        <div style={{ color: "#889", fontSize: 11, lineHeight: 1.4 }}>{step.desc}</div>
      </div>
    </div>
  );
}

export function PipelineColumn({ flow }: { flow: PipelineFlow }) {
  return (
    <div
      style={{
        flex: 1,
        border: "1px solid #2a2a3a",
        borderRadius: 6,
        padding: 14,
        background: "#14141e",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#def" }}>{flow.title}</h3>
        <span style={{ color: "#667", fontSize: 11 }}>{flow.subtitle}</span>
      </div>
      {flow.steps.map((s, i) => (
        <StepRow key={i} step={s} idx={i} total={flow.steps.length} />
      ))}
      <div style={{ marginTop: 12, padding: "6px 10px", borderRadius: 4, background: "#1a1a28", border: "1px solid #2a2a3a", fontSize: 11, color: "#667", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span><span style={{ color: "#5a8" }}>●</span> 特有步骤</span>
        <span><span style={{ color: "#3a8" }}>auto</span> 算法自动</span>
        <span><span style={{ color: "#e82" }}>MANUAL</span> 需人工指定</span>
        <span><span style={{ color: "#aa6" }}>optional</span> 可选 (默认关)</span>
      </div>
    </div>
  );
}

export function PipelineComparison({ slam, reloc }: { slam: PipelineFlow; reloc: PipelineFlow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <PipelineColumn flow={slam} />
      <PipelineColumn flow={reloc} />
    </div>
  );
}
