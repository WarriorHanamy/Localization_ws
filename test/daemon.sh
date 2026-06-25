#!/usr/bin/env bash
# test/daemon.sh — test container lifecycle management.
# Runs on the device host (Jetson).  Uses only bash + docker.
#
# Usage:
#   bash test/daemon.sh start  <recipe>      # docker run -d + roslaunch
#   bash test/daemon.sh run    [l1]          # docker exec runner.sh
#   bash test/daemon.sh shell                # docker exec -it bash
#   bash test/daemon.sh status               # docker ps + rosnode list
#   bash test/daemon.sh logs                 # docker logs -f
#   bash test/daemon.sh stop                 # docker stop + rm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

usage() {
    cat <<'EOF'
Usage:  bash test/daemon.sh <command> [args]

Commands:
  start  <recipe>     Launch daemon container (e.g. c5pro-livox)
  run    [l1]         Run tests inside the running container
  shell               Open interactive shell in container
  status              Show container state + ROS nodes
  logs                Follow container stdout
  stop                Stop and remove the container
EOF
    exit 1
}

# ── helpers ──────────────────────────────────────────────────────────────────

_container_running() {
    docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true
}

_require_running() {
    if [[ "$(_container_running)" != "true" ]]; then
        echo "[daemon] Container '${CONTAINER_NAME}' is not running."
        echo "[daemon] Use: bash test/daemon.sh start <recipe>"
        exit 1
    fi
}

# ── start ────────────────────────────────────────────────────────────────────

cmd_start() {
    local recipe="${1:-}"
    if [[ -z "$recipe" ]]; then
        echo "[daemon] Recipe required.  Options: ${!RECIPE_IMAGE[*]}"
        exit 1
    fi
    local image="${RECIPE_IMAGE[$recipe]:-}"
    local launch="${RECIPE_LAUNCH[$recipe]:-}"
    if [[ -z "$image" || -z "$launch" ]]; then
        echo "[daemon] Unknown recipe: ${recipe}"
        echo "[daemon] Known: ${!RECIPE_IMAGE[*]}"
        exit 1
    fi

    echo "[daemon] Recipe : ${recipe}"
    echo "[daemon] Image  : ${image}"
    echo "[daemon] Workspace: ${WORKSPACE}"

    # Kill stale container (if any)
    if docker inspect "${CONTAINER_NAME}" &>/dev/null; then
        echo "[daemon] Removing stale container '${CONTAINER_NAME}' ..."
        docker stop "${CONTAINER_NAME}" &>/dev/null || true
        docker rm   "${CONTAINER_NAME}" &>/dev/null || true
    fi

    echo "[daemon] Starting container ..."
    # shellcheck disable=SC2086
    docker run -d \
        --name "${CONTAINER_NAME}" \
        ${DOCKER_RUN_FLAGS} \
        -v "${BRINGUP_VOLUME}" \
        -v "${TEST_VOLUME}" \
        "${image}" \
        roslaunch bringup ${launch}

    echo "[daemon] Container '${CONTAINER_NAME}' started."
    echo "${recipe}" > "/tmp/${CONTAINER_NAME}-recipe"
    echo "[daemon] Wait ~5s for ROS nodes to come up, then:"
    echo "[daemon]   bash test/daemon.sh run l1"
    echo "[daemon]   bash test/daemon.sh shell"
}

# ── run ──────────────────────────────────────────────────────────────────────

cmd_run() {
    _require_running
    local level="${1:-l1}"

    local inside_path="/test/runner.sh"
    if ! docker exec "${CONTAINER_NAME}" test -f "${inside_path}" 2>/dev/null; then
        echo "[daemon] runner.sh not found at ${inside_path} in container."
        exit 1
    fi

    local recipe imu_topic
    recipe=$(cat "/tmp/${CONTAINER_NAME}-recipe" 2>/dev/null || echo "c5pro-livox")
    imu_topic="${RECIPE_IMU_TOPIC[$recipe]:-/livox/imu}"

    echo "[daemon] Recipe: ${recipe}  IMU topic: ${imu_topic}"

    docker exec \
        -e MIN_IMU_HZ="${MIN_IMU_HZ:-10}" \
        -e MIN_LIDAR_HZ="${MIN_LIDAR_HZ:-5}" \
        -e SAMPLE_SECS="${SAMPLE_SECS:-10}" \
        "${CONTAINER_NAME}" \
        bash "${inside_path}" "${level}" "${imu_topic}"
}

# ── shell ────────────────────────────────────────────────────────────────────

cmd_shell() {
    _require_running
    echo "[daemon] Entering container shell. Experiment, then re-run:"
    echo "[daemon]   bash test/daemon.sh run l1"
    docker exec -it "${CONTAINER_NAME}" bash
}

# ── status ───────────────────────────────────────────────────────────────────

cmd_status() {
    echo "── Docker ──────────────────────────────────"
    docker ps -a --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null || echo "(no container)"

    if [[ "$(_container_running)" == "true" ]]; then
        echo ""
        echo "── ROS nodes ───────────────────────────────"
        docker exec "${CONTAINER_NAME}" bash -c "
            source /opt/ros/noetic/setup.sh 2>/dev/null || true
            source /catkin_ws/devel/setup.sh 2>/dev/null || true
            rosnode list 2>/dev/null || echo '(roscore not reachable)'
        " || echo "(exec failed)"
    fi
}

# ── logs ─────────────────────────────────────────────────────────────────────

cmd_logs() {
    _require_running
    docker logs -f "${CONTAINER_NAME}"
}

# ── stop ─────────────────────────────────────────────────────────────────────

cmd_stop() {
    if docker inspect "${CONTAINER_NAME}" &>/dev/null; then
        echo "[daemon] Stopping '${CONTAINER_NAME}' ..."
        docker stop "${CONTAINER_NAME}" || true
        docker rm   "${CONTAINER_NAME}" || true
        rm -f "/tmp/${CONTAINER_NAME}-recipe"
        echo "[daemon] Done."
    else
        echo "[daemon] No container '${CONTAINER_NAME}' found."
    fi
}

# ── dispatch ─────────────────────────────────────────────────────────────────

case "${1:-}" in
    start)  shift; cmd_start  "$@";;
    run)    shift; cmd_run    "$@";;
    shell)  cmd_shell;;
    status) cmd_status;;
    logs)   cmd_logs;;
    stop)   cmd_stop;;
    *)      usage;;
esac
