import { useEffect, useMemo, useState } from "react";
import pipelinesJson from "./generated-pipelines.json";

type Entity = "devel.host" | "device.host" | "device.container";
type PipelineMode = "mapping" | "prior" | "relocation" | "smoke";

interface PipelineNodeDoc {
  name: string;
  pkg: string;
  type: string;
  source: string;
  optional: boolean;
}

interface PipelineRecipeDoc {
  name: string;
  description: string;
  launch: string;
  launchChain: string[];
  configFiles: string[];
  nodes: PipelineNodeDoc[];
  components: string[];
  hardware: "MID360" | "MID360s";
  mode: PipelineMode;
}

interface SequenceStep {
  entity: Entity;
  component: string;
  action: string;
  target?: Entity;
  targetAction?: string;
}

const pipelines = pipelinesJson as PipelineRecipeDoc[];
const entities: Entity[] = ["devel.host", "device.host", "device.container"];

const entityColor: Record<Entity, string> = {
  "devel.host": "#65b7ff",
  "device.host": "#f2b84b",
  "device.container": "#69d69b",
};

function recipeFromHash(): string | null {
  const match = window.location.hash.match(/^#pipeline\/(.+)$/);
  return match?.[1] ?? null;
}

function runtimeFlow(recipe: PipelineRecipeDoc): string {
  if (recipe.mode === "relocation") {
    return "Livox Driver + Prior PCD → Initial Align → FAST_LIO → odometry / registered cloud";
  }
  if (recipe.mode === "prior") {
    return "Livox Driver + Prior PCD → FAST_LIO → prior-assisted odometry / registered cloud";
  }
  if (recipe.mode === "smoke") {
    return "Livox Driver → FAST_LIO → FOV Overlay → visual smoke output";
  }
  return "Livox Driver → FAST_LIO → odometry / registered cloud / incremental map";
}

function sequence(recipe: PipelineRecipeDoc): SequenceStep[] {
  return [
    {
      entity: "devel.host",
      component: "Bun CLI",
      action: `bun run prod start ${recipe.name}`,
      target: "device.host",
      targetAction: "SSH auto-bridge",
    },
    {
      entity: "device.host",
      component: "Bun CLI",
      action: `resolve recipe → ${recipe.launch}`,
    },
    {
      entity: "device.host",
      component: "tmux + Docker",
      action: "kill stale prod session; stop/remove stale container",
    },
    {
      entity: "device.host",
      component: "Docker",
      action: `docker run fastlio-${recipe.name}`,
      target: "device.container",
      targetAction: "create privileged host-network container",
    },
    {
      entity: "device.container",
      component: "entrypoint + roslaunch",
      action: `source ROS; roslaunch bringup ${recipe.launch}`,
    },
    {
      entity: "device.container",
      component: recipe.components.join(" · "),
      action: runtimeFlow(recipe),
    },
    {
      entity: "device.container",
      component: "ROS stdout + topics",
      action: "publish runtime output and logs",
      target: "device.host",
      targetAction: "Docker logs / docker exec rostopic",
    },
    {
      entity: "device.host",
      component: "tmux",
      action: "slam / topics / shell windows; tee logs to disk",
      target: "devel.host",
      targetAction: "interactive attach or status",
    },
  ];
}

function StepCard({ component, action, accent }: { component: string; action: string; accent: string }) {
  return (
    <div style={{ border: `1px solid ${accent}55`, background: `${accent}0f`, borderRadius: 7, padding: "8px 10px", minHeight: 45 }}>
      <div style={{ color: accent, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{component}</div>
      <div style={{ color: "#cbd2dc", fontSize: 11, lineHeight: 1.45 }}>{action}</div>
    </div>
  );
}

function SequenceDiagram({ recipe }: { recipe: PipelineRecipeDoc }) {
  return (
    <div style={{ minWidth: 920 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 1fr 70px 1fr", alignItems: "stretch" }}>
        {entities.map((entity, index) => (
          <div key={entity} style={{ display: "contents" }}>
            <div style={{ borderTop: `3px solid ${entityColor[entity]}`, background: "#171923", padding: "10px 12px", textAlign: "center" }}>
              <div style={{ color: entityColor[entity], fontWeight: 800, fontSize: 13 }}>{entity}</div>
              <div style={{ color: "#626b79", fontSize: 10, marginTop: 3 }}>
                {entity === "devel.host" ? "operator + Bun" : entity === "device.host" ? "Bun + tmux + Docker" : "ROS runtime components"}
              </div>
            </div>
            {index < entities.length - 1 && <div />}
          </div>
        ))}
      </div>

      {sequence(recipe).map((step, index) => {
        const from = entities.indexOf(step.entity);
        const to = step.target ? entities.indexOf(step.target) : -1;
        return (
          <div key={index} style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 70px 1fr 70px 1fr", minHeight: 76, alignItems: "center" }}>
            {entities.map((entity, entityIndex) => {
              const isFrom = entityIndex === from;
              const isTarget = entityIndex === to;
              return (
                <div key={entity} style={{ gridColumn: entityIndex * 2 + 1, height: "100%", borderLeft: "1px dashed #303441", padding: "8px 10px" }}>
                  {isFrom && <StepCard component={step.component} action={step.action} accent={entityColor[entity]} />}
                  {isTarget && step.targetAction && <StepCard component="receive" action={step.targetAction} accent={entityColor[entity]} />}
                </div>
              );
            })}
            {step.target && Math.abs(to - from) === 1 && (
              <div style={{ gridColumn: Math.min(from, to) * 2 + 2, gridRow: 1, color: "#77808f", textAlign: "center", fontSize: 22 }}>
                {to > from ? "→" : "←"}
              </div>
            )}
            <div style={{ position: "absolute", left: -28, top: 27, color: "#4f5867", fontSize: 10, width: 20, textAlign: "right" }}>{index + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

function Sources({ recipe }: { recipe: PipelineRecipeDoc }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 20 }}>
      <section style={{ border: "1px solid #282c38", borderRadius: 7, padding: 14, background: "#151721" }}>
        <h3 style={{ margin: "0 0 10px", color: "#dbe7f5", fontSize: 13 }}>Canonical launch chain</h3>
        {recipe.launchChain.map((launch, index) => (
          <div key={launch} style={{ color: "#8ea0b5", fontSize: 11, lineHeight: 1.9 }}>
            {index > 0 ? "↳ " : ""}bringup/launch/{launch}
          </div>
        ))}
        {recipe.configFiles.map((file) => (
          <div key={file} style={{ color: "#657184", fontSize: 10, lineHeight: 1.7 }}>config · {file}</div>
        ))}
      </section>
      <section style={{ border: "1px solid #282c38", borderRadius: 7, padding: 14, background: "#151721" }}>
        <h3 style={{ margin: "0 0 10px", color: "#dbe7f5", fontSize: 13 }}>Runtime components</h3>
        {recipe.nodes.map((node) => (
          <div key={`${node.source}:${node.name}`} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, borderBottom: "1px solid #20232d", padding: "5px 0", fontSize: 10 }}>
            <span style={{ color: node.optional ? "#7c8795" : "#69d69b" }}>{node.name}{node.optional ? " (optional)" : ""}</span>
            <span style={{ color: "#7d8796" }}>{node.pkg}/{node.type} · {node.source}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

export function PipelineDocPage() {
  const [selectedName, setSelectedName] = useState(() => recipeFromHash() ?? pipelines[0]?.name ?? "");
  useEffect(() => {
    const onHash = () => setSelectedName(recipeFromHash() ?? pipelines[0]?.name ?? "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const recipe = useMemo(
    () => pipelines.find((candidate) => candidate.name === selectedName) ?? pipelines[0],
    [selectedName],
  );

  if (!recipe) {
    return <div style={{ padding: 32, color: "#ddd" }}>Pipeline data missing. Run: bun run doc pipeline</div>;
  }

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#10121a", color: "#ccc", fontFamily: "'SF Mono','Fira Code','JetBrains Mono',monospace" }}>
      <header style={{ padding: "22px 42px 16px", borderBottom: "1px solid #242733", background: "#12141d" }}>
        <div style={{ color: "#657184", fontSize: 10, letterSpacing: 1 }}>DOCUMENT / PIPELINE / RECIPE</div>
        <div style={{ display: "flex", alignItems: "end", gap: 14, marginTop: 7, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, color: "#e4edf8", fontSize: 22 }}>{recipe.name}</h1>
          <select
            value={recipe.name}
            onChange={(event) => { window.location.hash = `pipeline/${event.target.value}`; }}
            style={{ background: "#1c202b", color: "#b8c4d4", border: "1px solid #343947", borderRadius: 5, padding: "5px 8px", fontFamily: "inherit", fontSize: 11 }}
          >
            {pipelines.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
          <span style={{ color: "#65b7ff", fontSize: 11 }}>{recipe.hardware}</span>
          <span style={{ color: "#69d69b", fontSize: 11 }}>{recipe.mode}</span>
        </div>
        <p style={{ color: "#7f8a9a", margin: "7px 0 0", fontSize: 11 }}>{recipe.description} · {recipe.launch}</p>
      </header>

      <main style={{ padding: "22px 42px 60px", minWidth: 980 }}>
        <div style={{ overflowX: "auto", border: "1px solid #282c38", borderRadius: 8, background: "#13151e", padding: "0 32px 18px" }}>
          <SequenceDiagram recipe={recipe} />
        </div>
        <Sources recipe={recipe} />
      </main>
    </div>
  );
}
