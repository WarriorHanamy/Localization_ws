import { $ } from "bun";
import { getRepoRoot } from "../core/workspace";
import { checkSSH, runRSync, sshTarget } from "../core/ssh";
import { REC_DEVICE_LOC_WS, RELEASE_CONFIGS, DEFAULT_CONFIG } from "../core/config";
import { join } from "path";

function existsDir(path: string): boolean {
  const proc = Bun.spawnSync(["test", "-d", path]);
  return proc.exitCode === 0;
}

function copyReleaseToBringup(config: string, repo: string) {
  const src = join(repo, "releases", config);
  const subs = [
    { r: "launch",  b: "launch" },
    { r: "config",  b: "config" },
    { r: "scripts", b: "scripts" },
    { r: "rviz",    b: "rviz_cfg" },
    { r: "PCD",     b: "PCD" },
  ];

  for (const { r, b } of subs) {
    const s = join(src, r);
    const d = join(repo, "bringup", b);
    if (existsDir(s)) {
      Bun.spawnSync(["rm", "-rf", d]);
      Bun.spawnSync(["cp", "-r", s, d]);
    }
  }

  console.log(`[sync] bringup/ ← releases/${config}`);
}

export async function cmdSync(config?: string): Promise<void> {
  const effective = config || DEFAULT_CONFIG;
  if (!(RELEASE_CONFIGS as readonly string[]).includes(effective)) {
    console.error(`[sync] Unknown config: ${effective}`);
    console.error(`  Options: ${RELEASE_CONFIGS.join(", ")}`);
    process.exit(1);
  }

  const repo = getRepoRoot();
  copyReleaseToBringup(effective, repo);

  const ok = await checkSSH();
  if (!ok) {
    console.log("[sync] SSH check failed. Aborting remote sync.");
    process.exit(1);
  }

  const src = `${repo}/`;
  const dst = `${sshTarget()}:${REC_DEVICE_LOC_WS}/`;
  console.log(`[sync] Rsync ${repo} -> ${dst}`);
  await runRSync(src, dst);
  console.log("[sync] Complete.");
}
