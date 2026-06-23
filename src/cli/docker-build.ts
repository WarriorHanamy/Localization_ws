import { $ } from "bun";
import { runSSH, checkSSH } from "../core/ssh";
import { REC_DEVICE_LOC_WS } from "../core/config";

export async function cmdDockerBuild(): Promise<void> {
  console.log("[docker-build] Building fastlio-jetson image on Jetson ...");
  const ok = await checkSSH();
  if (!ok) {
    console.log("[docker-build] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  const buildCmd = [
    `. ${$.escape(REC_DEVICE_LOC_WS)}/.dockerignore 2>/dev/null; true`,
    `cd ${$.escape(REC_DEVICE_LOC_WS)} &&`,
    `docker build -f docker/Dockerfile -t fastlio-jetson:latest .`,
  ].join(" ");
  await runSSH(buildCmd);
  console.log("[docker-build] Image fastlio-jetson:latest built.");
}
