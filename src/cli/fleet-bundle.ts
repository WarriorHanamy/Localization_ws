import { $ } from "bun";
import { DOCKER_IMAGE_TAG, ARTIFACT_SRV_DIR } from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { getDevelHostLANIP } from "../core/network";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

export async function cmdFleetBundle(versionArg?: string) {
  const repo = getRepoRoot();
  const version = versionArg || DOCKER_IMAGE_TAG;
  const bundleName = `fastlio-runtime-${version}`;

  const lanIP = getDevelHostLANIP();
  if (!lanIP) {
    console.error("[fleet-bundle] ERROR: cannot detect dev-host LAN IP");
    process.exit(1);
  }
  const imageRef = `${lanIP}:5000/lio-slam:${version}`;

  const artifactDir = join(ARTIFACT_SRV_DIR, "artifacts", "fastlio");
  const tarballPath = join(artifactDir, `${bundleName}.tar.gz`);
  mkdirSync(artifactDir, { recursive: true });

  const stagingDir = join(repo, ".fleet-bundle", bundleName);
  if (existsSync(stagingDir)) {
    await $`rm -rf ${stagingDir}`;
  }
  mkdirSync(stagingDir, { recursive: true });

  console.log(`[fleet-bundle] packaging bringup/ → ${bundleName} ...`);

  await $`cp -r ${repo}/bringup/launch ${stagingDir}/launch`;
  await $`cp -r ${repo}/bringup/config ${stagingDir}/config`;
  await $`cp -r ${repo}/bringup/scripts ${stagingDir}/scripts`;
  if (existsSync(`${repo}/bringup/rviz_cfg`)) {
    await $`cp -r ${repo}/bringup/rviz_cfg ${stagingDir}/rviz_cfg`;
  }
  if (existsSync(`${repo}/bringup/resource/MANIFEST`)) {
    mkdirSync(`${stagingDir}/resource`, { recursive: true });
    await $`cp ${repo}/bringup/resource/MANIFEST ${stagingDir}/resource/MANIFEST`;
  }

  const manifest = [
    `name: fastlio`,
    `version: ${version}`,
    `image: ${imageRef}`,
    `container:`,
    `  name: fastlio-runtime`,
    `  flags:`,
    `    - --network host`,
    `    - --ipc host`,
    `    - --privileged`,
    `  volumes:`,
    `    - /opt/fastlio/runtime/current/config:/catkin_ws/src/bringup/config:ro`,
    `    - /opt/fastlio/runtime/current/launch:/catkin_ws/src/bringup/launch:ro`,
    `    - /opt/fastlio/runtime/current/scripts:/catkin_ws/src/bringup/scripts:ro`,
    `    - /opt/fastlio/runtime/current/rviz_cfg:/catkin_ws/src/bringup/rviz_cfg:ro`,
    `    - /opt/fastlio/data/PCD:/catkin_ws/src/fast_lio/PCD`,
    `    - /opt/fastlio/data/logs:/root/.ros/log`,
    `  entrypoint: roslaunch bringup {hardware}_slam.launch imu_src:={imu_src}`,
    `entrypoint:`,
    `  startup_timeout_sec: 30`,
    `  health_poll_interval_sec: 3`,
    ``,
  ].join("\n");
  writeFileSync(join(stagingDir, "manifest.yaml"), manifest);

  // Create tarball
  await $`tar czf ${tarballPath} -C ${join(repo, ".fleet-bundle")} ${bundleName}`;

  // Generate sha256 in sha256sum -c compatible format
  const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  writeFileSync(`${tarballPath}.sha256`, `${sha256}  ${bundleName}.tar.gz\n`);

  // Update latest.txt
  writeFileSync(join(artifactDir, "latest.txt"), version + "\n");

  // Cleanup
  await $`rm -rf ${join(repo, ".fleet-bundle")}`;

  console.log(`[fleet-bundle] Bundle:  ${tarballPath}`);
  console.log(`[fleet-bundle] SHA256:  ${tarballPath}.sha256`);
  console.log(`[fleet-bundle] Latest:  ${version}`);
  console.log(`[fleet-bundle] Image:   ${imageRef}`);
}
