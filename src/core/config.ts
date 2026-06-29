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

// Artifact server
export const ARTIFACT_PORT = 8080;
const configuredArtifactDir = Bun.env.LOCALIZATION_ARTIFACT_DIR?.trim();
export const ARTIFACT_SRV_DIR = configuredArtifactDir || `${process.env.HOME}/opt/loc-artifacts`;
if (!ARTIFACT_SRV_DIR.startsWith("/")) {
  throw new Error(`ARTIFACT_SRV_DIR must be an absolute path: ${ARTIFACT_SRV_DIR}`);
}

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

export const DOCKER_IMAGE_TAG = "cuda0.0.0-run-ubuntu20.04-arm64";
export const DOCKER_IMAGE_BASE  = `lio-base:${DOCKER_IMAGE_TAG}`;
export const DOCKER_IMAGE_SLAM  = `lio-slam:${DOCKER_IMAGE_TAG}`;
export const DOCKER_IMAGE_CALIB = `lio-calib:${DOCKER_IMAGE_TAG}`;
export const DOCKER_IMAGES = [
  { key: "base", label: "Base", image: DOCKER_IMAGE_BASE },
  { key: "slam", label: "SLAM", image: DOCKER_IMAGE_SLAM },
  { key: "calib", label: "Calib", image: DOCKER_IMAGE_CALIB },
] as const;

export const RELEASE_CONFIGS = [
  "c5v1-mid360-mavros",
  "c5v1-mid360-livox",
  "c5pro-mid360s-mavros",
  "c5pro-mid360s-livox",
] as const;
export const DEFAULT_CONFIG = "c5v1-mid360-mavros";
export type ReleaseConfig = (typeof RELEASE_CONFIGS)[number];

export const RECIPES = {
  // c5v1-mid360-mavros
  "c5v1-mid360-mavros":         { launch: "slam.launch",        desc: "c5v1 + Mid360 + MAVROS IMU slam" },
  "c5v1-mid360-mavros-map":     { launch: "slam-map.launch",    desc: "c5v1 + Mid360 + MAVROS slam + map" },
  "c5v1-mid360-mavros-reloc":   { launch: "slam-reloc.launch",  desc: "c5v1 + Mid360 + MAVROS reloc" },
  // c5v1-mid360-livox
  "c5v1-mid360-livox":          { launch: "slam.launch",        desc: "c5v1 + Mid360 + Livox IMU slam" },
  "c5v1-mid360-livox-map":      { launch: "slam-map.launch",    desc: "c5v1 + Mid360 + Livox slam + map" },
  "c5v1-mid360-livox-reloc":    { launch: "slam-reloc.launch",  desc: "c5v1 + Mid360 + Livox reloc" },
  // c5pro-mid360s-mavros
  "c5pro-mid360s-mavros":       { launch: "slam.launch",        desc: "c5pro + Mid360s + MAVROS IMU slam" },
  "c5pro-mid360s-mavros-map":   { launch: "slam-map.launch",    desc: "c5pro + Mid360s + MAVROS slam + map" },
  "c5pro-mid360s-mavros-reloc": { launch: "slam-reloc.launch",  desc: "c5pro + Mid360s + MAVROS reloc" },
  // c5pro-mid360s-livox
  "c5pro-mid360s-livox":        { launch: "slam.launch",        desc: "c5pro + Mid360s + Livox IMU slam" },
  "c5pro-mid360s-livox-map":    { launch: "slam-map.launch",    desc: "c5pro + Mid360s + Livox slam + map" },
  "c5pro-mid360s-livox-reloc":  { launch: "slam-reloc.launch",  desc: "c5pro + Mid360s + Livox reloc" },
  // smoke
  "l1":           { launch: "smoke-l1.launch",        desc: "L1 driver frequency check" },
  "l2-slam":      { launch: "smoke-l2-slam.launch",   desc: "L2 SLAM + RVIZ" },
  "l2-fov":       { launch: "smoke-l2-fov.launch",    desc: "L2 SLAM + FOV crop + RVIZ" },
  "l2-calib":     { launch: "smoke-l2-calib.launch",  desc: "L2 calibration (bag + LI-Init)" },
  "l2-eval":      { launch: "smoke-l2-eval.launch",   desc: "L2 evaluation (ground plane)" },
} as const;

export type RecipeName = keyof typeof RECIPES;

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
