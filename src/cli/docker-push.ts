import { $ } from "bun";
import { runSSH, checkSSH } from "../core/ssh";
import {
  REGISTRY_PORT,
  REGISTRY_DIRECT_PORT,
  DOCKER_IMAGE,
} from "../core/config";
import { getDevelHostUSBIP, getDevelHostLANIP } from "../core/network";

export async function cmdDockerPush() {
  console.log("[docker-push] Pushing fastlio-jetson to registry ...");

  // 1. Check SSH to golden Jetson
  const ok = await checkSSH();
  if (!ok) {
    console.log("[docker-push] Golden Jetson not reachable via USB. Is it connected?");
    process.exit(1);
  }

  // 2. Detect devel-host USB IP (push bypasses proxy, connects directly to registry)
  const usbIP = getDevelHostUSBIP();
  if (!usbIP) {
    console.log("[docker-push] Cannot detect devel-host USB IP. Is the Jetson connected?");
    process.exit(1);
  }
  const registryHost = usbIP;
  const registryPort = REGISTRY_DIRECT_PORT;
  console.log(`[docker-push] Pushing directly to ${registryHost}:${registryPort}`);

  // 3. Verify image exists on Jetson
  const checkCmd = [
    `docker image inspect ${$.escape(DOCKER_IMAGE)} >/dev/null 2>&1`,
    `echo IMAGE_OK`,
  ].join("; ");
  const checkResult = await runSSH(checkCmd, false);
  if (checkResult.exitCode !== 0 || !checkResult.stdout.includes("IMAGE_OK")) {
    console.log(`[docker-push] Image '${DOCKER_IMAGE}' not found on Jetson.`);
    console.log("[docker-push] Run 'bun run docker-dbuild' first.");
    process.exit(1);
  }

  // 4. Tag and push (direct to registry, bypassing tracker proxy)
  const tag = `${registryHost}:${registryPort}/${DOCKER_IMAGE}`;
  const pushCmd = [
    "set -euo pipefail",
    `docker tag ${$.escape(DOCKER_IMAGE)} ${$.escape(tag)}`,
    `docker push ${$.escape(tag)}`,
  ].join("; ");

  console.log(`[docker-push] Tagging and pushing: ${tag} ...`);
  const result = await runSSH(pushCmd, false);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no output";
    throw new Error(`docker push failed (exit ${result.exitCode}):\n${detail}`);
  }
  console.log("[docker-push] Image pushed successfully.");
  const lanIP = getDevelHostLANIP();
  const pullHost = lanIP || registryHost;
  console.log(`[docker-push] Fleet aircrafts: docker pull ${pullHost}:${REGISTRY_PORT}/${DOCKER_IMAGE}`);
}
