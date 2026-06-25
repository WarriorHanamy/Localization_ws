import { $ } from "bun";
import { runSSHStreaming, checkSSH, sshTarget } from "../core/ssh";
import { DOCKER_IMAGE_BASE, DOCKER_IMAGE_CALIB, DOCKER_IMAGE_SLAM, REC_DEVICE_LOC_WS, SSH_OPTS } from "../core/config";
import { getRepoRoot } from "../core/workspace";

const TARGETS: Record<string, { dockerfile: string; tag: string; depends?: string }> = {
  base:    { dockerfile: "docker/Dockerfile.base",  tag: DOCKER_IMAGE_BASE },
  slam:    { dockerfile: "docker/Dockerfile.prod",  tag: DOCKER_IMAGE_SLAM, depends: "base" },
  calib:   { dockerfile: "docker/Dockerfile.calib", tag: DOCKER_IMAGE_CALIB, depends: "base" },
};

function buildCommand(dockerfile: string, tag: string): string {
  return [
    "set -euo pipefail",
    `cd ${$.escape(REC_DEVICE_LOC_WS)}`,
    `docker build -f ${$.escape(dockerfile)} -t ${$.escape(tag)} .`,
  ].join("; ");
}

async function buildTarget(target: string): Promise<void> {
  const cfg = TARGETS[target];
  console.log(`[docker-build] Building ${cfg.tag} (${cfg.dockerfile}) ...`);
  const exitCode = await runSSHStreaming(buildCommand(cfg.dockerfile, cfg.tag));
  if (exitCode !== 0) {
    throw new Error(`${cfg.tag} build failed (exit ${exitCode})`);
  }
  console.log(`[docker-build] ${cfg.tag} built.`);
}

export async function cmdDockerBuild(target?: string): Promise<void> {
  const ok = await checkSSH();
  if (!ok) {
    console.log("[docker-build] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  console.log(`[docker-build] Syncing bringup/resource/ to dev-device ...`);
  const repo = getRepoRoot();
  const resourceSrc = `${repo}/bringup/resource/`;
  const resourceDst = `${sshTarget()}:${REC_DEVICE_LOC_WS}/bringup/resource/`;
  const sshCmd = `ssh ${SSH_OPTS}`;
  const rsyncCmd = `rsync -avz --delete --rsh=${$.escape(sshCmd)} ${$.escape(resourceSrc)} ${$.escape(resourceDst)}`;
  const rsyncProc = await $`bash -c ${rsyncCmd}`.quiet();
  if (rsyncProc.exitCode !== 0) {
    throw new Error("bringup/resource/ sync failed");
  }
  console.log(`[docker-build] bringup/resource/ synced.`);

  if (target) {
    const cfg = TARGETS[target];
    if (!cfg) {
      console.error(`[docker-build] Unknown target: ${target}`);
      console.error(`  Options: ${Object.keys(TARGETS).join(", ")}`);
      process.exit(1);
    }
    if (cfg.depends) {
      await buildTarget(cfg.depends);
    }
    await buildTarget(target);
  } else {
    await buildTarget("base");
    await buildTarget("slam");
    await buildTarget("calib");
  }
}
