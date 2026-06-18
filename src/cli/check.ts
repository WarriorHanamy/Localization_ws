import { $ } from "bun";
import { runSSH } from "../core/ssh";
import { ROS_DISTRO } from "../core/config";

export async function cmdCheck(): Promise<void> {
  console.log("[l10n] Checking SSH to nv@192.168.55.1 (USB) ...");
  const result = await runSSH("echo SSH_OK", false);
  if (result.exitCode !== 0) {
    console.log("[l10n] SSH failed. Check SSHPASS env, host, and network.");
    process.exit(1);
  }
  console.log("[l10n] SSH OK");

  const checks: Record<string, string> = {
    catkin_tools: "which catkin",
    "ROS setup": `test -f /opt/ros/${ROS_DISTRO}/setup.bash`,
    python3: "which python3",
  };
  console.log("[l10n] Remote toolchain:");
  for (const [label, cmd] of Object.entries(checks)) {
    const r = await runSSH(cmd, false);
    console.log(`  ${label}: ${r.exitCode === 0 ? "OK" : "MISSING"}`);
  }
  console.log("[l10n] Check complete.");
}
