import { cmdSync } from "./sync";
import { cmdCheck } from "./check";
import { cmdRviz, type RvizArgs } from "./rviz";
import { cmdSource } from "./devel";
import { cmdDashboard, type DashboardArgs } from "./dashboard";
import { cmdSmoke } from "./smoke";
import { cmdDockerBuild } from "./docker-build";
import { cmdDockerStart } from "./docker-start";
import { cmdDockerShell } from "./docker-shell";
import { cmdDockerPush } from "./docker-push";
import { cmdFleetBundle } from "./fleet-bundle";
import { cmdFleetArtifacts } from "./fleet-artifacts";
import { cmdRegistry } from "./registry";
import { cmdProd } from "./prod";
import { cmdDoc } from "./doc";
import { cmdStatus } from "./status";
import { WORKSPACE_PKGS, REC_DEVICE_LOC_WS, RECIPES, RELEASE_CONFIGS, DOCKER_IMAGES } from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { logCompletion, listCompletions } from "../core/completions-db";

const COMPLETION_DEFAULTS: Record<string, () => string[]> = {
  command: () => [
    "sync", "check", "paths", "rviz", "source",
    "dashboard", "dev", "smoke", "doc", "status",
    "docker-dbuild", "docker-push", "docker-start",
    "docker-shell", "fleet-bundle", "fleet-artifacts",
    "registry", "prod", "help",
  ],
  prod: () => ["slam", "slam-map", "reloc", "start", "stop", "reset", "attach", "status"],
  smoke: () => [
    "l1-livox", "l1-mavros", "l2-slam-livox", "l2-slam-mavros",
    "l2-fov-livox", "l2-fov-mavros", "l2-calib", "l2-eval",
  ],
  "docker-dbuild": () => DOCKER_IMAGES.map((d) => d.key),
  "fleet-bundle": () => [...RELEASE_CONFIGS],
  "fleet-artifacts": () => ["start", "stop", "status"],
  registry: () => ["start", "stop", "status"],
  doc: () => ["codebase", "pipeline"],
  "doc:pipeline": () => Object.keys(RECIPES).sort(),
  status: () => ["fleet"],
  rviz: () => ["fast-lio", "livox"],
  recipe: () => Object.keys(RECIPES).sort(),
};

const USAGE = `
Usage: bun run <command> [args]

Commands:
  sync              rsync workspace to Jetson
  check             verify SSH connectivity and remote tools
  paths             print workspace package paths
  rviz [preset]     launch RViz on Jetson display
  source            print ROS source commands for eval
  dashboard         start web dashboard (auto-launch SLAM + serve frontend)
  dashboard --dev   start in dev mode (Vite HMR proxy)
  dashboard --no-launch  skip auto-launching SLAM pipeline
  smoke l1-{livox|mavros} <hw>  L1 driver frequency check (headless)
  smoke l2-slam-{livox|mavros} <hw> L2 SLAM pipeline + RVIZ
  smoke l2-fov-{livox|mavros} <hw>  L2 SLAM + FOV crop + RVIZ
  smoke l2-calib <hw>          L2 calibration (bag + LI-Init, headless)
  smoke l2-eval                L2 evaluation (static bag, ground plane)
  smoke                          show smoke test help
  doc codebase                   open code analysis documentation
  doc pipeline [recipe]          open entity-centric recipe pipelines

Docker commands:
  docker-dbuild              build all runtime images on Jetson (SSH)
  docker-dbuild base         build lio-base runtime image only
  docker-dbuild slam         build lio-slam runtime image only
  docker-dbuild calib        build lio-calib runtime image only
  docker-push        push image to local registry (from golden Jetson)
  docker-start       start a named container for a recipe
  docker-shell       exec bash into a running container

Fleet bootstrap:
  fleet-bundle [version]     pack bringup/ → tarball + sha256 + latest.txt
  fleet-artifacts start      start artifact HTTP server on :8080
  fleet-artifacts stop       stop artifact server
  fleet-artifacts status     show artifact server status

Registry:
  registry start     start registry:2 + pull tracker proxy
  registry stop      stop registry + tracker
  registry status    show registry/tracker status

Status:
  status fleet       show fleet distribution status and open tracker

Production (tmux + docker):
  prod start --recipe <name>  start production pipeline
  prod stop                   stop production session
  prod attach                 attach to production tmux session
  prod status                 show production status

Recipes for docker-start:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}

  help              show this message

Presets for rviz: fast-lio (default), livox
  --viewer nomachine|rustdesk|none   (default: nomachine)

Packages: ${WORKSPACE_PKGS.join(", ")}
`;

async function cmdPaths(): Promise<void> {
  console.log("[l10n] Local workspace packages:");
  const repoRoot = getRepoRoot();
  for (const pkg of [...WORKSPACE_PKGS].sort()) {
    const pkgDir = `${repoRoot}/${pkg}`;
    console.log(`  ${pkg.padEnd(30)} ${pkgDir}`);
  }
  console.log(`\n[l10n] Remote target: ${REC_DEVICE_LOC_WS}`);
}

const CMD = process.argv[2];
const args = process.argv.slice(3);

async function cmdCompletionsLog(): Promise<void> {
  const context = args[0];
  const value = args[1];
  if (!context || !value) {
    console.error("Usage: completions-log <context> <value>");
    process.exit(1);
  }
  logCompletion(context, value);
}

async function cmdCompletionsList(): Promise<void> {
  const context = args[0];
  if (!context) {
    console.error("Usage: completions-list <context>");
    process.exit(1);
  }
  const getDefaults = COMPLETION_DEFAULTS[context];
  if (!getDefaults) {
    console.error(`[completions] unknown context: ${context}`);
    process.exit(1);
  }
  const sorted = listCompletions(context, getDefaults());
  for (const item of sorted) console.log(item);
}

function recordInvocation(): void {
  if (!CMD || CMD.startsWith("completions-")) return;
  logCompletion("command", CMD);
  if (args.length === 0) return;
  const subCtxs = new Set(["prod", "smoke", "docker-dbuild", "fleet-artifacts", "registry", "doc", "status", "rviz"]);
  if (subCtxs.has(CMD)) logCompletion(CMD, args[0]);
  if (["docker-start", "docker-shell"].includes(CMD)) logCompletion("recipe", args[0]);
  if (CMD === "fleet-bundle") logCompletion("fleet-bundle", args[0]);
  if (CMD === "doc" && args[0] === "pipeline" && args[1]) logCompletion("recipe", args[1]);
  if (CMD === "prod" && (args[0] === "start" || args[0] === "slam" || args[0] === "slam-map" || args[0] === "reloc") && args[1]) logCompletion("recipe", args[1]);
}

async function main() {
  recordInvocation();

  switch (CMD) {
    case "sync":
      await cmdSync();
      break;
    case "check":
      await cmdCheck();
      break;
    case "paths":
      await cmdPaths();
      break;
    case "rviz": {
      const viewerFlag = args.indexOf("--viewer");
      const viewer = viewerFlag !== -1
        ? (args[viewerFlag + 1] as RvizArgs["viewer"]) || "nomachine"
        : "nomachine";
      const configArg = viewerFlag !== -1
        ? args.slice(0, viewerFlag)[0]
        : args[0];
      await cmdRviz({
        config: configArg || undefined,
        viewer: viewerFlag !== -1 ? viewer : "nomachine",
      });
      break;
    }
    case "source":
      await cmdSource();
      break;
    case "dashboard": {
      const noLaunch = args.includes("--no-launch");
      const isDev = args.includes("--dev");
      if (isDev) process.argv.push("--dev");
      await cmdDashboard({ noLaunch });
      break;
    }
    case "smoke":
      await cmdSmoke(args);
      break;
    case "docker-dbuild":
    case "docker-build":
      await cmdDockerBuild(args[0]);
      break;
    case "docker-start":
      await cmdDockerStart(args);
      break;
    case "docker-shell":
      await cmdDockerShell(args);
      break;
    case "docker-push":
      await cmdDockerPush();
      break;
    case "fleet-bundle":
      await cmdFleetBundle(args[0]);
      break;
    case "fleet-artifacts":
      await cmdFleetArtifacts(args);
      break;
    case "registry":
      await cmdRegistry(args);
      break;
    case "status":
      await cmdStatus(args);
      break;
    case "prod":
      await cmdProd(args);
      break;
    case "completions-log":
      await cmdCompletionsLog();
      break;
    case "completions-list":
      await cmdCompletionsList();
      break;
    case "doc":
      await cmdDoc(args);
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      if (CMD) {
        console.log(`[l10n] Unknown command: ${CMD}`);
      }
      console.log(USAGE);
      process.exit(CMD ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("[l10n] Error:", err);
  process.exit(1);
});
