import { $ } from "bun";
import { DOCKER_IMAGE_TAG, ARTIFACT_SRV_DIR, RELEASE_CONFIGS, REGISTRY_PORT, REGISTRY_DIRECT_PORT, type ReleaseConfig } from "../core/config";
import { getRepoRoot } from "../core/workspace";
import { getDevelHostLANIP } from "../core/network";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

export async function cmdFleetBundle(config?: string, versionArg?: string) {
  const repo = getRepoRoot();
  const configKnown = (RELEASE_CONFIGS as unknown as string[]).includes(config ?? "");
  const configExists = config && existsSync(join(repo, "dist", "runtime_configs", config));
  if (!config || !(configKnown || configExists)) {
    console.error("[fleet-bundle] Usage: bun run fleet-bundle <config> [version]");
    console.error(`  Known configs: ${RELEASE_CONFIGS.join(", ")}`);
    process.exit(1);
  }
  const version = versionArg || DOCKER_IMAGE_TAG;
  const bundleName = `fastlio-runtime-${config}`;

  const lanIP = getDevelHostLANIP();
  if (!lanIP) {
    console.error("[fleet-bundle] ERROR: cannot detect dev-host LAN IP");
    process.exit(1);
  }
  const imageRef = `${lanIP}:5000/lio-slam:${version}`;

  const artifactDir = join(ARTIFACT_SRV_DIR, "artifacts", "fastlio", config);
  const tarballPath = join(artifactDir, `${bundleName}.tar.gz`);
  mkdirSync(artifactDir, { recursive: true });

  const stagingDir = join(repo, ".fleet-bundle", bundleName);
  if (existsSync(stagingDir)) {
    await $`rm -rf ${stagingDir}`;
  }
  mkdirSync(stagingDir, { recursive: true });

  console.log(`[fleet-bundle] packaging dist/runtime_configs/${config}/ → ${bundleName} ...`);

  // Copy entire release config
  const srcDir = join(repo, "dist", "runtime_configs", config);
  for (const sub of ["launch", "config", "scripts", "rviz", "PCD"]) {
    if (existsSync(join(srcDir, sub))) {
      mkdirSync(join(stagingDir, sub), { recursive: true });
      await $`cp -r ${join(srcDir, sub)}/. ${join(stagingDir, sub)}/`;
    }
  }

  // Query registry for image digest
  // Fallback chain: tracker proxy → direct registry → local docker inspect
  let digest = "";
  const digestCandidates = [
    { url: `http://${lanIP}:${REGISTRY_PORT}/v2/lio-slam/manifests/${version}`, insecure: false },
    { url: `https://${lanIP}:${REGISTRY_DIRECT_PORT}/v2/lio-slam/manifests/${version}`, insecure: true },
  ];
  for (const { url, insecure } of digestCandidates) {
    try {
      const opts: RequestInit = {
        headers: { "Accept": "application/vnd.docker.distribution.manifest.v2+json" },
      };
      if (insecure) {
        (opts as any).tls = { rejectUnauthorized: false };
      }
      const res = await fetch(url, opts);
      const d = res.headers.get("Docker-Content-Digest");
      if (d) {
        digest = d;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!digest) {
    console.warn("[fleet-bundle] WARNING: could not query registry digest, trying local docker inspect ...");
    try {
      const localImg = `lio-slam:${version}`;
      const proc = await $`docker image inspect ${localImg} --format='{{index .RepoDigests 0}}'`.quiet().nothrow();
      if (proc.exitCode === 0) {
        const fullRef = proc.stdout.toString().trim();
        const parts = fullRef.split("@");
        if (parts.length === 2) digest = parts[1];
      }
    } catch { /* digest will be omitted from manifest */ }
  }
  if (!digest) {
    console.warn("[fleet-bundle] WARNING: digest not available — omitting from manifest.");
  }

  // Generate manifest
  const manifest = [
    `name: fastlio`,
    `config: ${config}`,
    `version: ${version}`,
    `image: ${imageRef}`,
    ...(digest ? [`digest: ${digest}`] : []),
    `container:`,
    `  name: fastlio-runtime`,
    `  flags:`,
    `    - --network host`,
    `    - --ipc host`,
    `    - --privileged`,
    `  volumes:`,
    `    - $HOME/opt/fastlio/config:/catkin_ws/src/bringup/config:ro`,
    `    - $HOME/opt/fastlio/launch:/catkin_ws/src/bringup/launch:ro`,
    `    - $HOME/opt/fastlio/scripts:/catkin_ws/src/bringup/scripts:ro`,
    `    - $HOME/opt/fastlio/PCD:/catkin_ws/src/bringup/PCD`,
    `    - $HOME/opt/fastlio/data/logs:/root/.ros/log`,
    `  entrypoint: roslaunch bringup slam.launch`,
    ``,
  ].join("\n");
  writeFileSync(join(stagingDir, "manifest.yaml"), manifest);

  // Create tarball
  await $`tar czf ${tarballPath} -C ${join(repo, ".fleet-bundle")} ${bundleName}`;

  // Generate sha256
  const sha256 = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  writeFileSync(`${tarballPath}.sha256`, `${sha256}  ${bundleName}.tar.gz\n`);

  // Update latest.txt
  writeFileSync(join(artifactDir, "latest.txt"), version + "\n");

  // Cleanup
  await $`rm -rf ${join(repo, ".fleet-bundle")}`;

  console.log(`[fleet-bundle] Bundle:  ${tarballPath}`);
  console.log(`[fleet-bundle] SHA256:  ${tarballPath}.sha256`);
  console.log(`[fleet-bundle] Config:  ${config}`);
  console.log(`[fleet-bundle] Version: ${version}`);
  console.log(`[fleet-bundle] Image:   ${imageRef}`);
}
