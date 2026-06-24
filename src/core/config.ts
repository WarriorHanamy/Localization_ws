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

// Registry and fleet distribution
export const REGISTRY_PORT = 5000;          // Public proxy port (pull through tracker)
export const REGISTRY_DIRECT_PORT = 5050;   // Direct registry port (push from golden Jetson)
export const REGISTRY_INTERNAL_PORT = REGISTRY_DIRECT_PORT; // Tracker upstream port
export const DOCKER_REGISTRY_IMAGE = "registry:2";
export const TRACKER_LOG = "logs/registry-pulls.json";
export const MAX_TRACKER_ENTRIES = 1000;

const configuredLANHost = Bun.env.LOCALIZATION_LAN_HOST?.trim();
export const LAN_HOST = configuredLANHost || "";

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
  "bringup/resource/",
] as const;

export const DOCKER_IMAGE = "fastlio-jetson:latest";

export const RECIPES = {
  // c5pro + dual Mid360s (Mid360s)
  "c5pro-mid360s":        { launch: "c5pro_slam.launch",       desc: "c5pro + 双 Mid360s slam" },
  "c5pro-mid360s-map":    { launch: "c5pro_slam_map.launch",   desc: "c5pro + 双 Mid360s slam + 导出图" },
  "c5pro-mid360s-reloc":  { launch: "c5pro_slam_reloc.launch", desc: "c5pro + 双 Mid360s 重定位" },
  // c5v1 + single MID360
  "c5v1-mid360":          { launch: "c5v1_slam.launch",        desc: "c5v1 + 单 MID360 slam" },
  "c5v1-mid360-map":      { launch: "c5v1_slam_map.launch",    desc: "c5v1 + 单 MID360 slam + 导出图" },
  "c5v1-mid360-reloc":    { launch: "c5v1_slam_reloc.launch",  desc: "c5v1 + 单 MID360 重定位" },
  // smoke
  "smoke-fov":            { launch: "smoke_fov.launch",        desc: "FOV 裁剪可视化测试" },
} as const;

export type RecipeName = keyof typeof RECIPES;

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
