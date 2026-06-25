#!/usr/bin/env bash
# test/config.sh — recipe mappings for the test daemon.
# Sourced by daemon.sh and runner.sh; no side effects.

set -euo pipefail

# ── workspace ────────────────────────────────────────────────────────────────
if [[ -n "${REC_DEVICE_LOC_WS:-}" ]]; then
    WORKSPACE="${REC_DEVICE_LOC_WS}"
elif [[ -d "${BASH_SOURCE[0]%/*}/../bringup" ]]; then
    WORKSPACE="$(cd "${BASH_SOURCE[0]%/*}/.." && pwd)"
else
    WORKSPACE="/home/nv/rec_loc_ws"
fi

# ── docker ───────────────────────────────────────────────────────────────────
CONTAINER_NAME="fastlio-test"
DOCKER_RUN_FLAGS="--network host --ipc host --privileged"
BRINGUP_VOLUME="${WORKSPACE}/bringup:/catkin_ws/src/bringup"
TEST_VOLUME="${WORKSPACE}/test:/test:ro"

# ── recipes ──────────────────────────────────────────────────────────────────
# Syntax:  declare -A RECIPE_* ;;  key = "<hw>-<imu>"
# hw   ∈ {c5v1, c5pro}
# imu  ∈ {livox, mavros}

declare -A RECIPE_IMAGE
declare -A RECIPE_LAUNCH
declare -A RECIPE_IMU_TOPIC
declare -A RECIPE_USE_MAVROS

RECIPE_IMAGE[c5pro-livox]="fastlio-base:latest"
RECIPE_LAUNCH[c5pro-livox]="smoke_l1.launch hardware:=c5pro imu_src:=livox use_mavros:=false"
RECIPE_IMU_TOPIC[c5pro-livox]="/livox/imu"
RECIPE_USE_MAVROS[c5pro-livox]="false"

RECIPE_IMAGE[c5pro-mavros]="fastlio-base:latest"
RECIPE_LAUNCH[c5pro-mavros]="smoke_l1.launch hardware:=c5pro imu_src:=mavros use_mavros:=true"
RECIPE_IMU_TOPIC[c5pro-mavros]="/mavros/imu/data"
RECIPE_USE_MAVROS[c5pro-mavros]="true"

RECIPE_IMAGE[c5v1-livox]="fastlio-base:latest"
RECIPE_LAUNCH[c5v1-livox]="smoke_l1.launch hardware:=c5v1 imu_src:=livox use_mavros:=false"
RECIPE_IMU_TOPIC[c5v1-livox]="/livox/imu"
RECIPE_USE_MAVROS[c5v1-livox]="false"

RECIPE_IMAGE[c5v1-mavros]="fastlio-base:latest"
RECIPE_LAUNCH[c5v1-mavros]="smoke_l1.launch hardware:=c5v1 imu_src:=mavros use_mavros:=true"
RECIPE_IMU_TOPIC[c5v1-mavros]="/mavros/imu/data"
RECIPE_USE_MAVROS[c5v1-mavros]="true"
