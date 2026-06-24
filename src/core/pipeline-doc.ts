import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { RECIPES, type RecipeName } from "./config";
import { getRepoRoot } from "./workspace";

export type PipelineMode = "mapping" | "prior" | "relocation" | "smoke";

export interface PipelineNodeDoc {
  name: string;
  pkg: string;
  type: string;
  source: string;
  optional: boolean;
}

export interface PipelineRecipeDoc {
  name: RecipeName;
  description: string;
  launch: string;
  launchChain: string[];
  configFiles: string[];
  nodes: PipelineNodeDoc[];
  components: string[];
  hardware: "MID360" | "MID360s";
  mode: PipelineMode;
}

// Transitional compatibility for the platform-oriented canonical launch names.
// RECIPES can move independently; documents always resolve to a file that exists.
const LAUNCH_ALIASES: Record<string, string> = {
  "bringup_mid360.launch": "c5v1_slam.launch",
  "bringup_mid360_prior.launch": "c5v1_slam_prior.launch",
  "bringup_mid360_reloc.launch": "c5v1_slam_reloc.launch",
  "msg_MID360.launch": "c5v1_livox.launch",
  "mapping_mid360.launch": "c5v1_mapping.launch",
  "mapping_mid360_reloc.launch": "c5v1_mapping_reloc.launch",
  "bringup_mid360s.launch": "c5pro_slam.launch",
  "bringup_mid360s_prior.launch": "c5pro_slam_prior.launch",
  "bringup_mid360s_reloc.launch": "c5pro_slam_reloc.launch",
  "msg_MID360s.launch": "c5pro_livox.launch",
  "mapping_mid360s.launch": "c5pro_mapping.launch",
  "mapping_mid360s_reloc.launch": "c5pro_mapping_reloc.launch",
  "bringup_c5v1.launch": "c5v1_slam.launch",
  "bringup_c5pro.launch": "c5pro_slam.launch",
};

function existingLaunchName(launchName: string): string {
  const launchDir = join(getRepoRoot(), "bringup", "launch");
  if (existsSync(join(launchDir, launchName))) return launchName;
  const alias = LAUNCH_ALIASES[launchName];
  if (alias && existsSync(join(launchDir, alias))) return alias;
  throw new Error(`Recipe launch file not found: bringup/launch/${launchName}`);
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w/-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1], match[2]]),
  );
}

function resolveLaunchReference(value: string, args: Record<string, string>): string | null {
  const resolved = value.replace(/\$\(arg\s+([^)]+)\)/g, (_match, name: string) => args[name] ?? name);
  const prefix = "$(find bringup)/launch/";
  return resolved.startsWith(prefix) ? resolved.slice(prefix.length) : null;
}

function inspectLaunch(
  launchName: string,
  seen: Set<string>,
  launchChain: string[],
  nodes: PipelineNodeDoc[],
  configFiles: Set<string>,
): void {
  launchName = existingLaunchName(launchName);
  if (seen.has(launchName)) return;
  seen.add(launchName);

  const root = getRepoRoot();
  const path = join(root, "bringup", "launch", launchName);
  const xml = readFileSync(path, "utf8");
  launchChain.push(launchName);

  const args: Record<string, string> = {};
  for (const match of xml.matchAll(/<arg\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.name && attrs.default) args[attrs.name] = attrs.default;
  }

  const optionalRanges = [...xml.matchAll(/<group\b[^>]*\bif\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/group>/g)]
    .map((match) => [match.index, match.index + match[0].length] as const);

  for (const match of xml.matchAll(/<rosparam\b[^>]*>/g)) {
    const file = attributes(match[0]).file;
    const prefix = "$(find bringup)/config/";
    if (file?.startsWith(prefix)) configFiles.add(file.slice(prefix.length));
  }

  for (const match of xml.matchAll(/<node\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (!attrs.name || !attrs.pkg || !attrs.type) continue;
    const optional = optionalRanges.some(([start, end]) => match.index >= start && match.index < end);
    nodes.push({ name: attrs.name, pkg: attrs.pkg, type: attrs.type, source: launchName, optional });
  }

  for (const match of xml.matchAll(/<include\b[^>]*>/g)) {
    const file = attributes(match[0]).file;
    const included = file ? resolveLaunchReference(file, args) : null;
    if (included) inspectLaunch(included, seen, launchChain, nodes, configFiles);
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function classify(name: RecipeName, launchChain: string[], nodes: PipelineNodeDoc[]): Pick<PipelineRecipeDoc, "hardware" | "mode" | "components"> {
  const hardware = launchChain.some((launch) => launch.toLowerCase().includes("mid360s") || launch.startsWith("c5pro_"))
    ? "MID360s"
    : "MID360";
  const nodeNames = new Set(nodes.map((node) => node.name));
  const hasPrior = launchChain.some((launch) => launch.includes("_reloc.launch"));
  const mode: PipelineMode = name === "smoke-fov"
    ? "smoke"
    : nodeNames.has("initial_align")
      ? "relocation"
      : hasPrior
        ? "prior"
        : "mapping";

  const components = unique(nodes.filter((node) => !node.optional).map((node) => {
    if (node.name === "livox_lidar_publisher2") return "Livox Driver";
    if (node.name === "laserMapping") return "FAST_LIO";
    if (node.name === "initial_align") return "Initial Align";
    if (node.name === "cpu_monitor") return "CPU Monitor";
    return `${node.pkg}/${node.name}`;
  }));
  if (mode === "prior" || mode === "relocation") components.unshift("Prior PCD");
  if (mode === "smoke") components.push("FOV Overlay");

  return { hardware, mode, components: unique(components) };
}

export function collectPipelineDocs(): PipelineRecipeDoc[] {
  return (Object.entries(RECIPES) as [RecipeName, (typeof RECIPES)[RecipeName]][]).map(([name, recipe]) => {
    const launchChain: string[] = [];
    const nodes: PipelineNodeDoc[] = [];
    const configFiles = new Set<string>();
    const launch = existingLaunchName(recipe.launch);
    inspectLaunch(launch, new Set(), launchChain, nodes, configFiles);
    return {
      name,
      description: recipe.desc,
      launch,
      launchChain,
      configFiles: [...configFiles],
      nodes,
      ...classify(name, launchChain, nodes),
    };
  });
}

export function writePipelineDocs(output = join(getRepoRoot(), "frontend", "src", "docs", "generated-pipelines.json")): string {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(collectPipelineDocs(), null, 2)}\n`);
  return output;
}
