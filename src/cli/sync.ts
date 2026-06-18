import { getRepoRoot } from "../core/workspace";
import { checkSSH, runRSync, sshTarget } from "../core/ssh";
import { REMOTE_PATH } from "../core/config";

export async function cmdSync(): Promise<void> {
  console.log("[l10n] sync via USB (192.168.55.1)");
  const ok = await checkSSH();
  if (!ok) {
    console.log("[l10n] SSH check failed. Aborting sync.");
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const src = `${repoRoot}/`;
  const dst = `${sshTarget()}:${REMOTE_PATH}/`;
  console.log(`[l10n] Rsync ${repoRoot} -> ${dst}`);
  await runRSync(src, dst);
  console.log("[l10n] Sync complete.");
}
