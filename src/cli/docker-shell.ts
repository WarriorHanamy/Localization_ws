import { REMOTE_HOST_USB, REMOTE_USER, SSH_OPTS, RECIPES, type RecipeName } from "../core/config";
import { isUSBReachable } from "../core/ssh";

const USAGE = `
Usage: bun run docker-shell <recipe-name>

Recipes:
${Object.entries(RECIPES).map(([k, v]) => `  ${k.padEnd(28)} ${v.desc}`).join("\n")}
`;

export async function cmdDockerShell(args: string[]): Promise<void> {
  const recipeName = args[0];
  if (!recipeName || !RECIPES[recipeName as RecipeName]) {
    console.log("[docker-shell] Usage: bun run docker-shell <recipe-name>");
    console.log(USAGE);
    process.exit(1);
  }

  const reachable = await isUSBReachable();
  if (!reachable) {
    console.log("[docker-shell] Jetson not reachable.");
    process.exit(1);
  }

  const containerName = `fastlio-${recipeName}`;
  const target = `${REMOTE_USER}@${REMOTE_HOST_USB}`;
  const opts = SSH_OPTS;

  console.log(`[docker-shell] Spawning interactive shell in ${containerName} ...`);
  const proc = Bun.spawnSync(
    ["ssh", ...opts.split(/\s+/), target, `docker exec -it ${containerName} bash`],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  process.exit(proc.exitCode);
}
