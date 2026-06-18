export const ROS_DISTRO = "noetic";

export const REMOTE_HOST_USB = "192.168.55.1";
export const REMOTE_USER = "nv";
export const REMOTE_PATH = "/home/nv/Localization_ws";

export const SSH_OPTS =
  "-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o LogLevel=ERROR";

export const WORKSPACE_PKGS = [
  "FAST_LIO",
  "livox_ros_driver2",
  "ekf_quat_pose",
  "incremental_map_publisher",
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
  "*.so",
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

export const ROSBRIDGE_PORT = 9090;
export const DASHBOARD_PORT = 3000;
