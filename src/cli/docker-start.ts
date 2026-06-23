import { $ } from "bun";
import { runSSH, checkSSH } from "../core/ssh";
import { REC_DEVICE_LOC_WS, RECIPES, type RecipeName } from "../core/config";

const USAGE = `
Usage: bun run docker-start --recipe <name>

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

export async function startContainer(
  recipeName: RecipeName,
  suffix?: string,
): Promise<string> {
  const recipe = RECIPES[recipeName];
  const containerName = suffix
    ? `fastlio-${recipeName}-${suffix}`
    : `fastlio-${recipeName}`;

  const cmd = [
    `docker stop ${containerName} 2>/dev/null || true`,
    `docker rm ${containerName} 2>/dev/null || true`,
    [
      `docker run -d`,
      `--name ${containerName}`,
      `--network host`,
      `--ipc host`,
      `--privileged`,
      `-e DISPLAY=$DISPLAY`,
      `-v /tmp/.X11-unix:/tmp/.X11-unix`,
      `-v ${$.escape(REC_DEVICE_LOC_WS)}/PCD:/catkin_ws/src/fast_lio/PCD`,
      `-v ${$.escape(REC_DEVICE_LOC_WS)}/bringup:/catkin_ws/src/bringup`,
      `fastlio-jetson:latest`,
      `roslaunch bringup ${recipe.launch}`,
    ].join(" "),
  ].join("; ");

  console.log(`[docker-start] Starting container ${containerName} ...`);
  await runSSH(cmd);
  console.log(`[docker-start] ${containerName} running (roslaunch ${recipe.launch}).`);
  return containerName;
}

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

  await startContainer(recipeName as RecipeName);
}
