#!/usr/bin/env bash
# test/runner.sh — passive L1 smoke runner.
# Runs INSIDE the container (docker exec).
# Only checks — never starts or stops nodes.
#
# Usage:  bash runner.sh l1 [imu_topic_override]
# Exit:   0 = all passed, 1 = ≥1 failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/checks.sh"

# ── environment ──────────────────────────────────────────────────────────────

export CATKIN_SHELL=bash
set +u
source /opt/ros/noetic/setup.sh 2>/dev/null || true
if [[ -f /catkin_ws/devel/setup.sh ]]; then
    source /catkin_ws/devel/setup.sh 2>/dev/null || true
fi
set -u

# ── args ─────────────────────────────────────────────────────────────────────

LEVEL="${1:-l1}"
IMU_TOPIC="${2:-/livox/imu}"

# ── defaults for c5pro livox (freq thresholds from Mid360/Mid360s datasheet) ──

MIN_IMU_HZ="${MIN_IMU_HZ:-10}"
MIN_LIDAR_HZ="${MIN_LIDAR_HZ:-5}"
SAMPLE_SECS="${SAMPLE_SECS:-10}"
NODE_DRIVER="${NODE_DRIVER:-livox_lidar_publisher2}"

echo "=== runner.sh L1 — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "  imu_topic=${IMU_TOPIC}"
echo ""

# ── L1 checks ────────────────────────────────────────────────────────────────

check_container_alive

echo "[$(date '+%H:%M:%S')] waiting for roscore + driver node (max 10s) ..."
if ! wait_for_roscore 10; then
    _fail "roscore not reachable"
    print_summary
    exit 1
fi
if ! wait_for_node "${NODE_DRIVER}" 10; then
    _fail "driver node ${NODE_DRIVER} not found"
    print_summary
    exit 1
fi

check_node "${NODE_DRIVER}"
check_topic_type "${IMU_TOPIC}"          "sensor_msgs/Imu"
check_topic_type "/livox/lidar"          "livox_ros_driver2/CustomMsg"
check_topic_hz   "${IMU_TOPIC}"           "${MIN_IMU_HZ}"   "${SAMPLE_SECS}"
check_topic_hz   "/livox/lidar"           "${MIN_LIDAR_HZ}" "${SAMPLE_SECS}"

print_summary
exit $(( RESULT_FAIL > 0 ? 1 : 0 ))
