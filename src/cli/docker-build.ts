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

  const sdkRoot = "/usr/local";
  const sdkStage = `${REC_DEVICE_LOC_WS}/.docker-sdk/livox_sdk2`;
  const buildCmd = [
    "set -euo pipefail",
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
    `docker build -f docker/Dockerfile -t fastlio-jetson:latest .`,
  ].join("; ");
  console.log("[docker-build] Staging verified device-host Livox SDK2 (Mid360s enabled) ...");
  const result = await runSSH(buildCmd, false);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no build output";
    throw new Error(`remote Docker build failed (exit ${result.exitCode}):\n${detail}`);
  }
  console.log("[docker-build] Image fastlio-jetson:latest built.");
}
