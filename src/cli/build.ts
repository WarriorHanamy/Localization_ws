import { $ } from "bun";
import { runSSH } from "../core/ssh";
import { ROS_DISTRO, REMOTE_PATH } from "../core/config";

export async function cmdBuild(): Promise<void> {
  console.log(`[l10n] Clean build on ${REMOTE_PATH} ...`);
  const buildCmd = [
    `source /opt/ros/${ROS_DISTRO}/setup.bash &&`,
    `cd ${$.escape(REMOTE_PATH)} &&`,
    `catkin config --init --source-space . &&`,
    `rm -rf build devel &&`,
    `catkin build --no-status`,
  ].join(" ");
  await runSSH(buildCmd);
  console.log("[l10n] Build complete.");
}

export async function cmdIncrement(): Promise<void> {
  const repoRoot = (await import("../core/workspace")).getRepoRoot();
  const { runRSync, sshTarget } = await import("../core/ssh");
  const src = `${repoRoot}/`;
  const dst = `${sshTarget()}:${REMOTE_PATH}/`;

  console.log(`[l10n] Stage 1/2: Rsync ${repoRoot} -> ${dst}`);
  await runRSync(src, dst);

  console.log("[l10n] Stage 2/2: catkin build (incremental) ...");
  const buildCmd = [
    `source /opt/ros/${ROS_DISTRO}/setup.bash &&`,
    `cd ${$.escape(REMOTE_PATH)} &&`,
    `catkin config --init --source-space . &&`,
    `catkin build --no-status`,
  ].join(" ");
  await runSSH(buildCmd);
  console.log("[l10n] Increment complete.");
}

export async function cmdFull(): Promise<void> {
  const repoRoot = (await import("../core/workspace")).getRepoRoot();
  const { runRSync, sshTarget } = await import("../core/ssh");
  const src = `${repoRoot}/`;
  const dst = `${sshTarget()}:${REMOTE_PATH}/`;

  console.log(`[l10n] Stage 1/2: Full rsync ${repoRoot} -> ${dst}`);
  await runRSync(src, dst);

  console.log("[l10n] Stage 2/2: catkin build (clean rebuild) ...");
  const buildCmd = [
    `source /opt/ros/${ROS_DISTRO}/setup.bash &&`,
    `cd ${$.escape(REMOTE_PATH)} &&`,
    `catkin config --init --source-space . &&`,
    `rm -rf build devel &&`,
    `catkin build --no-status`,
  ].join(" ");
  await runSSH(buildCmd);
  console.log("[l10n] Full pipeline complete.");
}

export async function cmdBuildPkg(pkg: string): Promise<void> {
  const WORKSPACE_PKGS = (await import("../core/config")).WORKSPACE_PKGS;
  if (!WORKSPACE_PKGS.includes(pkg as any)) {
    console.log(`[l10n] Unknown package: ${pkg}`);
    console.log(`  Known: ${WORKSPACE_PKGS.join(", ")}`);
    process.exit(1);
  }

  const { checkSSH } = await import("../core/ssh");
  const ok = await checkSSH();
  if (!ok) {
    console.log("[l10n] SSH check failed. Run 'bun run sync' first.");
    process.exit(1);
  }

  const buildCmd = [
    `source /opt/ros/${ROS_DISTRO}/setup.bash &&`,
    `cd ${$.escape(REMOTE_PATH)} &&`,
    `catkin build ${$.escape(pkg)} --no-status`,
  ].join(" ");
  await runSSH(buildCmd);
  console.log(`[l10n] Build ${pkg} complete.`);
}
