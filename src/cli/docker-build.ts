import { $ } from "bun";
import { runSSHStreaming, checkSSH } from "../core/ssh";
import { REC_DEVICE_LOC_WS } from "../core/config";

const TARGETS: Record<string, { dockerfile: string; tag: string; depends?: string }> = {
  base:    { dockerfile: "docker/Dockerfile.base",  tag: "fastlio-base:latest" },
  default: { dockerfile: "docker/Dockerfile",       tag: "fastlio-jetson:latest", depends: "base" },
  calib:   { dockerfile: "docker/Dockerfile.calib", tag: "fastlio-calib:latest", depends: "base" },
};

function sdkStageCommands(): string {
  const sdkRoot = "/usr/local";
  const sdkStage = `${REC_DEVICE_LOC_WS}/.docker-sdk/livox_sdk2`;
  return [
    `set -euo pipefail`,
    `stage=${$.escape(sdkStage)}`,
    `install -d "$stage/lib" "$stage/include"`,
    `test -f ${$.escape(sdkRoot)}/lib/liblivox_lidar_sdk_static.a`,
    `test -f ${$.escape(sdkRoot)}/lib/liblivox_lidar_sdk_shared.so`,
    `ar t ${$.escape(sdkRoot)}/lib/liblivox_lidar_sdk_static.a | grep -qx mid360s_command_handler.cpp.o`,
    `install -m 0644 ${$.escape(sdkRoot)}/lib/liblivox_lidar_sdk_static.a "$stage/lib/"`,
    `install -m 0644 ${$.escape(sdkRoot)}/lib/liblivox_lidar_sdk_shared.so "$stage/lib/"`,
    `install -m 0644 ${$.escape(sdkRoot)}/include/livox_lidar_api.h "$stage/include/"`,
    `install -m 0644 ${$.escape(sdkRoot)}/include/livox_lidar_cfg.h "$stage/include/"`,
    `install -m 0644 ${$.escape(sdkRoot)}/include/livox_lidar_def.h "$stage/include/"`,
    `cd ${$.escape(REC_DEVICE_LOC_WS)}`,
  ].join("; ");
}

function buildCommand(dockerfile: string, tag: string): string {
  return [
    "set -euo pipefail",
    `cd ${$.escape(REC_DEVICE_LOC_WS)}`,
    `docker build -f ${$.escape(dockerfile)} -t ${$.escape(tag)} .`,
  ].join("; ");
}

async function buildTarget(target: string): Promise<void> {
  const cfg = TARGETS[target] ?? TARGETS.default;
  console.log(`[docker-build] Building ${cfg.tag} (${cfg.dockerfile}) ...`);
  const exitCode = await runSSHStreaming(buildCommand(cfg.dockerfile, cfg.tag));
  if (exitCode !== 0) {
    throw new Error(`${cfg.tag} build failed (exit ${exitCode})`);
  }
  console.log(`[docker-build] ${cfg.tag} built.`);
}

export async function cmdDockerBuild(target?: string): Promise<void> {
  const effective = target ?? "default";
  const cfg = TARGETS[effective];
  if (!cfg) {
    console.error(`[docker-build] Unknown target: ${target}`);
    console.error(`  Options: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }

  const ok = await checkSSH();
  if (!ok) {
    console.log("[docker-build] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  console.log(`[docker-build] Staging verified device-host Livox SDK2 (Mid360s enabled) ...`);
  const sdkExitCode = await runSSHStreaming(sdkStageCommands());
  if (sdkExitCode !== 0) {
    throw new Error("SDK2 staging failed on device host");
  }

  // Build dependency chain
  if (cfg.depends) {
    await buildTarget(cfg.depends);
  }
  await buildTarget(effective);
}
