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
import { cmdRegistry } from "./registry";
import { cmdProd } from "./prod";
import { cmdDoc } from "./doc";
import { cmdStatus } from "./status";
import { WORKSPACE_PKGS, REC_DEVICE_LOC_WS, RECIPES } from "../core/config";
import { getRepoRoot } from "../core/workspace";

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
  docker-dbuild              build nx/lio-slam (base → prod) on Jetson (SSH)
  docker-dbuild base         build nx/lio-base only
  docker-dbuild calib        build nx/lio-calib (base → calib) on Jetson (SSH)
  docker-push        push image to local registry (from golden Jetson)
  docker-start       start a named container for a recipe
  docker-shell       exec bash into a running container

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

async function main() {
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
    case "registry":
      await cmdRegistry(args);
      break;
    case "status":
      await cmdStatus(args);
      break;
    case "prod":
      await cmdProd(args);
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
