import { $ } from "bun";
import { runSSH, checkSSH } from "../core/ssh";
import { REMOTE_PATH, RECIPES, type RecipeName } from "../core/config";

const DOCKER_BASE = [
  "docker run -d",
  "--network host",
  "--privileged",
  `-e DISPLAY=$DISPLAY`,
  `-v /tmp/.X11-unix:/tmp/.X11-unix`,
  `-v ${$.escape(REMOTE_PATH)}/PCD:/catkin_ws/src/fast_lio/PCD`,
  "fastlio-jetson:latest",
].join(" \\\n  ");

const USAGE = `
Usage: bun run docker-start --recipe <name>

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

export async function cmdDockerStart(args: string[]): Promise<void> {
  const recipeIdx = args.indexOf("--recipe");
  const recipeName = recipeIdx !== -1 ? args[recipeIdx + 1] : args[0];

  if (!recipeName || !RECIPES[recipeName as RecipeName]) {
    console.log("[docker-start] Unknown recipe:", recipeName);
    console.log(USAGE);
    process.exit(1);
  }

  const ok = await checkSSH();
  if (!ok) {
    console.log("[docker-start] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  const recipe = RECIPES[recipeName as RecipeName];
  const containerName = `fastlio-${recipeName}`;

  const cmd = [
    // Stop & remove previous container if exists
    `docker stop ${containerName} 2>/dev/null || true`,
    `docker rm ${containerName} 2>/dev/null || true`,
    // Run new container
    `docker run -d`,
    `--name ${containerName}`,
    `--network host`,
    `--privileged`,
    `-e DISPLAY=$DISPLAY`,
    `-v /tmp/.X11-unix:/tmp/.X11-unix`,
    `-v ${$.escape(REMOTE_PATH)}/PCD:/catkin_ws/src/fast_lio/PCD`,
    `fastlio-jetson:latest`,
    `roslaunch bringup ${recipe.launch}`,
  ].join(" \\\n  ");

  console.log(`[docker-start] Starting container ${containerName} ...`);
  await runSSH(cmd);
  console.log(`[docker-start] ${containerName} running (roslaunch ${recipe.launch}).`);
}
