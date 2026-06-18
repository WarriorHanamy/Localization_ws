"""Constants for the localization workspace CI/CD."""

ROS_DISTRO = "noetic"

REMOTE_HOST_USB = "192.168.55.1"
REMOTE_USER = "nv"
REMOTE_PATH = "/home/nv/Localization_ws"
REMOTE_UV_BIN = "/home/nv/.local/bin/uv"

SSH_OPTS = (
    "-o StrictHostKeyChecking=no "
    "-o ConnectTimeout=10 "
    "-o LogLevel=ERROR "
    "-o RemoteCommand=none"
)

WORKSPACE_PKGS = [
    "FAST_LIO",
    "livox_ros_driver2",
    "livox_ros_driver",
    "ekf_quat_pose",
    "incremental_map_publisher",
]

RSYNC_EXCLUDES = [
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
]
