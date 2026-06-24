import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { spawn } from "bun";
import { runSSH, runSSHDetached } from "../core/ssh";
import { ROS_DISTRO, REC_DEVICE_LOC_WS, RUSTDESK_ID } from "../core/config";
import { deviceRvizMaximizedCommand, launchNoMachineViewer } from "../core/viewer";

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

const PRESETS: Record<string, string> = {
  "fast-lio": `${REC_DEVICE_LOC_WS}/FAST_LIO/rviz_cfg/loam_livox.rviz`,
  livox: `${REC_DEVICE_LOC_WS}/livox_ros_driver2/config/display_point_cloud_ROS1.rviz`,
};

export interface RvizArgs {
  config?: string;
  viewer?: "nomachine" | "rustdesk" | "none";
}

export async function cmdRviz(args: RvizArgs): Promise<void> {
  const key = args.config || "fast-lio";
  const rvizCfg = PRESETS[key] || `${REC_DEVICE_LOC_WS}/${key}`;

  console.log(`[l10n] Launching RViz (${key}) on Jetson display :0 ...`);
  const rvizCmd = deviceRvizMaximizedCommand(
    rvizCfg,
    ROS_DISTRO,
    `${REC_DEVICE_LOC_WS}/devel/setup.bash`,
  );
  const rc = await runSSHDetached(rvizCmd);
  if (rc !== 0) {
    console.log("[l10n] Failed to launch RViz. Is the Jetson display available?");
    return;
  }

  const viewer = args.viewer || "nomachine";
  if (viewer === "none") {
    console.log("[l10n] Viewer disabled. RViz is running on the Jetson display.");
  } else if (viewer === "rustdesk") {
    launchRustdesk();
  } else {
    launchNoMachineViewer();
  }
}
