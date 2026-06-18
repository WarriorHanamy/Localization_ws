import { $ } from "bun";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { spawn } from "bun";
import { runSSH, runSSHDetached } from "../core/ssh";
import { ROS_DISTRO, REMOTE_PATH, RUSTDESK_ID } from "../core/config";

function rustdeskPassword(): string {
  const env = process.env.RUSTDESK_PASS;
  if (env) return env;
  const passFile = join(homedir(), ".config", "l10n", "rustdesk.pass");
  const file = Bun.file(passFile);
  try {
    return file.text().trim();
  } catch {
    console.log(
      `[l10n] RustDesk password not found. Set RUSTDESK_PASS env or write ${passFile}`,
    );
    process.exit(1);
  }
}

function launchRustdesk(): void {
  const password = rustdeskPassword();
  console.log(`[l10n] Connecting RustDesk to Jetson (ID: ${RUSTDESK_ID}) ...`);
  console.log("[l10n] Note: RustDesk 1.4.7 may reject CLI-set permanent passwords.");
  spawn(["rustdesk", "--connect", RUSTDESK_ID, "--password", password], {
    env: { ...process.env, GDK_BACKEND: "wayland" },
    stdout: "ignore",
    stderr: "ignore",
  });
}

function launchVNC(): void {
  const viewers = ["gvncviewer", "vncviewer"];
  const viewer = Bun.which("gvncviewer") || Bun.which("vncviewer");
  const target = "192.168.55.1:0";
  if (!viewer) {
    console.log(`[l10n] VNC viewer not found. Open manually with: gvncviewer ${target}`);
    return;
  }
  console.log(`[l10n] Opening VNC viewer: ${viewer} ${target}`);
  spawn([viewer, target], { stdout: "ignore", stderr: "ignore" });
}

const PRESETS: Record<string, string> = {
  "fast-lio": `${REMOTE_PATH}/FAST_LIO/rviz_cfg/loam_livox.rviz`,
  livox: `${REMOTE_PATH}/livox_ros_driver2/config/display_point_cloud_ROS1.rviz`,
};

export interface RvizArgs {
  config?: string;
  viewer?: "vnc" | "rustdesk" | "none";
}

export async function cmdRviz(args: RvizArgs): Promise<void> {
  const key = args.config || "fast-lio";
  const rvizCfg = PRESETS[key] || `${REMOTE_PATH}/${key}`;

  console.log(`[l10n] Launching RViz (${key}) on Jetson display :0 ...`);
  const rvizCmd = [
    `export DISPLAY=:0 &&`,
    `source /opt/ros/${ROS_DISTRO}/setup.bash &&`,
    `source ${$.escape(REMOTE_PATH)}/devel/setup.bash &&`,
    `rviz -d ${$.escape(rvizCfg)}`,
  ].join(" ");
  const rc = await runSSHDetached(rvizCmd);
  if (rc !== 0) {
    console.log("[l10n] Failed to launch RViz. Is the Jetson display available?");
    return;
  }

  const viewer = args.viewer || "vnc";
  if (viewer === "none") {
    console.log("[l10n] Viewer disabled. RViz is running on the Jetson display.");
  } else if (viewer === "rustdesk") {
    launchRustdesk();
  } else {
    launchVNC();
  }
}
