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
export const REGISTRY_DIRECT_PORT = 5443;   // Direct registry port (push from dev-device)
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
  "bag/*.bag",
  ".vscode/",
  ".DS_Store",
  "node_modules/",
  "frontend/dist/",
  "bun.lock",
  "bringup/resource/",
] as const;

export const DOCKER_IMAGE_BASE  = "nx/lio-base:latest";
export const DOCKER_IMAGE_SLAM  = "nx/lio-slam:latest";
export const DOCKER_IMAGE_CALIB = "nx/lio-calib:latest";
export const DOCKER_IMAGES = [
  { key: "base", label: "Base", image: DOCKER_IMAGE_BASE },
  { key: "slam", label: "SLAM", image: DOCKER_IMAGE_SLAM },
  { key: "calib", label: "Calib", image: DOCKER_IMAGE_CALIB },
] as const;

export const RECIPES = {
  // c5v1
  "c5v1-livox":         { launch: "c5v1_slam.launch",       imu_src: "livox",  desc: "c5v1 + Livox IMU slam" },
  "c5v1-mavros":        { launch: "c5v1_slam.launch",       imu_src: "mavros", desc: "c5v1 + MAVROS IMU slam" },
  "c5v1-livox-map":     { launch: "c5v1_slam_map.launch",   imu_src: "livox",  desc: "c5v1 + Livox slam + map" },
  "c5v1-mavros-map":    { launch: "c5v1_slam_map.launch",   imu_src: "mavros", desc: "c5v1 + MAVROS slam + map" },
  "c5v1-livox-reloc":   { launch: "c5v1_slam_reloc.launch", imu_src: "livox",  desc: "c5v1 + Livox reloc" },
  "c5v1-mavros-reloc":  { launch: "c5v1_slam_reloc.launch", imu_src: "mavros", desc: "c5v1 + MAVROS reloc" },
  // c5pro
  "c5pro-livox":        { launch: "c5pro_slam.launch",      imu_src: "livox",  desc: "c5pro + Livox IMU slam" },
  "c5pro-mavros":       { launch: "c5pro_slam.launch",      imu_src: "mavros", desc: "c5pro + MAVROS IMU slam" },
  "c5pro-livox-map":    { launch: "c5pro_slam_map.launch",  imu_src: "livox",  desc: "c5pro + Livox slam + map" },
  "c5pro-mavros-map":   { launch: "c5pro_slam_map.launch",  imu_src: "mavros", desc: "c5pro + MAVROS slam + map" },
  "c5pro-livox-reloc":  { launch: "c5pro_slam_reloc.launch", imu_src: "livox",  desc: "c5pro + Livox reloc" },
  "c5pro-mavros-reloc": { launch: "c5pro_slam_reloc.launch", imu_src: "mavros", desc: "c5pro + MAVROS reloc" },
  // smoke
  "l1-livox":           { launch: "smoke_l1.launch",        imu_src: "livox",  desc: "L1 驱动频率 / Livox" },
  "l1-mavros":          { launch: "smoke_l1.launch",        imu_src: "mavros", desc: "L1 驱动频率 / MAVROS" },
  "l2-slam-livox":      { launch: "smoke_l2_slam.launch",   imu_src: "livox",  desc: "L2 SLAM / Livox" },
  "l2-slam-mavros":     { launch: "smoke_l2_slam.launch",   imu_src: "mavros", desc: "L2 SLAM / MAVROS" },
  "l2-fov-livox":       { launch: "smoke_l2_fov.launch",    imu_src: "livox",  desc: "L2 FOV 裁剪 / Livox" },
  "l2-fov-mavros":      { launch: "smoke_l2_fov.launch",    imu_src: "mavros", desc: "L2 FOV 裁剪 / MAVROS" },
  "l2-calib":           { launch: "smoke_l2_calib_bag.launch",  imu_src: "mavros", desc: "L2 标定 (bag + LI-Init)" },
  "l2-eval":            { launch: "smoke_l2_eval.launch",   imu_src: "mavros", desc: "L2 评估 (ground plane)" },
} as const;

export type RecipeName = keyof typeof RECIPES;

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
