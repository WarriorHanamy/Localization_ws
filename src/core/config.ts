export const ROS_DISTRO = "noetic";

export const REMOTE_HOST_USB = "192.168.55.1";
export const REMOTE_USER = "nv";
const configuredDeviceWorkspace = Bun.env.REC_DEVICE_LOC_WS?.trim();
export const REC_DEVICE_LOC_WS = configuredDeviceWorkspace || "/home/nv/rec_loc_ws";
if (!REC_DEVICE_LOC_WS.startsWith("/")) {
  throw new Error(`REC_DEVICE_LOC_WS must be an absolute path: ${REC_DEVICE_LOC_WS}`);
}

const SSH_IDENTITY = `${process.env.HOME ?? "~"}/.ssh/id_ed25519`;
export const SSH_OPTS =
  `-F /dev/null -i ${SSH_IDENTITY} -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o LogLevel=ERROR`;

export const WORKSPACE_PKGS = [
  "FAST_LIO",
  "livox_ros_driver2",
  "ekf_quat_pose",
  "incremental_map_publisher",
  "bringup",
] as const;

export const RUSTDESK_ID = "466016959";
export const RUSTDESK_PASS_ENV = "RUSTDESK_PASS";

export const RSYNC_EXCLUDES = [
  ".agents/",
  ".cache/",
  ".catkin_tools/",
  ".git/",
  ".local/",
  ".opencode/",
  ".python-version",
  ".ruff_cache/",
  ".venv/",
  "__pycache__/",
  "*.pyc",
  "*.o",
  "build/",
  "devel/",
  "install/",
  "logs/",
  "PCD/",
  "bag/",
  "*.bag",
  ".vscode/",
  ".DS_Store",
  "node_modules/",
  "frontend/dist/",
  "bun.lock",
] as const;

export const DOCKER_IMAGE = "fastlio-jetson:latest";

export const RECIPES = {
  "mid360":                 { launch: "bringup_mid360.launch",       desc: "single MID360 (hardware base)" },
  "mid360s":                { launch: "bringup_mid360s.launch",      desc: "dual MID360s (hardware base)"  },
  "mapping-mid360":         { launch: "bringup_mid360.launch",       desc: "mid360 + mapping, no prior" },
  "mapping-mid360-prior":   { launch: "bringup_mid360_prior.launch", desc: "mid360 + mapping, prior map" },
  "mapping-mid360-reloc":   { launch: "bringup_mid360_reloc.launch", desc: "mid360 + mapping, prior + align" },
  "mapping-mid360s":         { launch: "bringup_mid360s.launch",       desc: "mid360s + mapping, no prior" },
  "mapping-mid360s-prior":   { launch: "bringup_mid360s_prior.launch", desc: "mid360s + mapping, prior map" },
  "mapping-mid360s-reloc":   { launch: "bringup_mid360s_reloc.launch", desc: "mid360s + mapping, prior + align" },
  "smoke-fov":                { launch: "smoke_fov.launch",             desc: "FOV crop visual smoke test" },
} as const;

export type RecipeName = keyof typeof RECIPES;

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
