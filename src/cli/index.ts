import { cmdSync } from "./sync";
import { cmdBuild, cmdIncrement, cmdFull, cmdBuildPkg } from "./build";
import { cmdCheck } from "./check";
import { cmdRviz, type RvizArgs } from "./rviz";
import { cmdSource } from "./devel";
import { cmdDashboard, type DashboardArgs } from "./dashboard";
import { cmdSmoke } from "./smoke";
import { cmdDockerBuild } from "./docker-build";
import { cmdDockerStart } from "./docker-start";
import { cmdDockerShell } from "./docker-shell";
import { cmdDockerSmoke } from "./docker-smoke";
import { WORKSPACE_PKGS, REMOTE_PATH, RECIPES } from "../core/config";
import { getRepoRoot } from "../core/workspace";

const USAGE = `
Usage: bun run <command> [args]

Commands:
  sync              rsync workspace to Jetson
  build             remote catkin build (clean rebuild)
  increment         rsync + remote catkin build (no clean)
  full              rsync + remote clean catkin build
  check             verify SSH connectivity and remote tools
  paths             print workspace package paths
  rviz [preset]     launch RViz on Jetson display
  build-pkg <name>  build a single package
  source            print ROS source commands for eval
  dashboard         start web dashboard (auto-launch SLAM + serve frontend)
  dashboard --dev   start in dev mode (Vite HMR proxy)
  dashboard --no-launch  skip auto-launching SLAM pipeline
  smoke             run FAST-LIO smoke test checklist
  smoke --level slam  only check SLAM layer

Docker commands:
  docker-dbuild      build fastlio-jetson image on Jetson (SSH)
  docker-start       start a named container for a recipe
  docker-shell       exec bash into a running container
  docker-smoke       smoke-test a running container

Recipes for docker-start:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}

  help              show this message

Presets for rviz: fast-lio (default), livox
  --viewer vnc|rustdesk|none   (default: vnc)

Packages: ${WORKSPACE_PKGS.join(", ")}
`;

async function cmdPaths(): Promise<void> {
  console.log("[l10n] Local workspace packages:");
  const repoRoot = getRepoRoot();
  for (const pkg of [...WORKSPACE_PKGS].sort()) {
    const pkgDir = `${repoRoot}/${pkg}`;
    console.log(`  ${pkg.padEnd(30)} ${pkgDir}`);
  }
  console.log(`\n[l10n] Remote target: ${REMOTE_PATH}`);
}

const CMD = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  switch (CMD) {
    case "sync":
      await cmdSync();
      break;
    case "build":
      await cmdBuild();
      break;
    case "increment":
      await cmdIncrement();
      break;
    case "full":
      await cmdFull();
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
        ? (args[viewerFlag + 1] as RvizArgs["viewer"]) || "vnc"
        : "vnc";
      const configArg = viewerFlag !== -1
        ? args.slice(0, viewerFlag)[0]
        : args[0];
      await cmdRviz({
        config: configArg || undefined,
        viewer: viewerFlag !== -1 ? viewer : "vnc",
      });
      break;
    }
    case "build-pkg":
      if (!args[0]) {
        console.log("[l10n] Usage: bun run build-pkg <package-name>");
        process.exit(1);
      }
      await cmdBuildPkg(args[0]);
      break;
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
      await cmdDockerBuild();
      break;
    case "docker-start":
      await cmdDockerStart(args);
      break;
    case "docker-shell":
      await cmdDockerShell(args);
      break;
    case "docker-smoke":
      await cmdDockerSmoke(args);
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
