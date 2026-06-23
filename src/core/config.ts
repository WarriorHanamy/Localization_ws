export const ROS_DISTRO = "noetic";

export const REMOTE_HOST_USB = "192.168.55.1";
export const REMOTE_USER = "nv";
export const REC_DEVICE_LOC_WS = "/home/nv/Localization_ws";

export const SSH_OPTS =
  "-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o LogLevel=ERROR";

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
  "logs/",
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
  "mapping-mid360":       { launch: "bringup_mid360.launch",       desc: "mid360 + mapping, no prior" },
  "mapping-mid360-prior": { launch: "bringup_mid360_prior.launch", desc: "mid360 + mapping, prior map" },
  "mapping-mid360-reloc": { launch: "bringup_mid360_reloc.launch", desc: "mid360 + mapping, prior + align" },
  "mapping-mid360s":       { launch: "bringup_mid360s.launch",       desc: "mid360s + mapping, no prior" },
  "mapping-mid360s-prior": { launch: "bringup_mid360s_prior.launch", desc: "mid360s + mapping, prior map" },
  "mapping-mid360s-reloc": { launch: "bringup_mid360s_reloc.launch", desc: "mid360s + mapping, prior + align" },
} as const;

export type RecipeName = keyof typeof RECIPES;

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
