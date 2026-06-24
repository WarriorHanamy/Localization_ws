#!/usr/bin/env bash

# Fast, self-contained ROS smoke test for a running device container.
# Frequency checks share one sampling window to keep total runtime bounded.

source /opt/ros/noetic/setup.bash
source /catkin_ws/devel/setup.bash
set -uo pipefail

readonly MODE="${1:-mapping}"
readonly SAMPLE_SECONDS="${SMOKE_SAMPLE_SECONDS:-6}"
readonly STARTUP_TIMEOUT="${SMOKE_STARTUP_TIMEOUT:-20}"

failures=0

emit_result() {
  local level="$1"
  local name="$2"
  local target="$3"
  local expected="$4"
  local value="$5"
  local actual="$6"
  local passed="$7"

  printf 'SMOKE_RESULT\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$level" "$name" "$target" "$expected" "$value" "$actual" "$passed"
  if [[ "$passed" != "1" ]]; then
    failures=$((failures + 1))
  fi
}

node_is_running() {
  local nodes="$1"
  local node="$2"
  grep -Fxq "/${node#/}" <<<"$nodes"
}

topic_type() {
  timeout 2 rostopic type "$1" 2>/dev/null || true
}

deadline=$((SECONDS + STARTUP_TIMEOUT))
while (( SECONDS < deadline )); do
  nodes="$(rosnode list 2>/dev/null || true)"
  imu_type="$(topic_type /livox/imu)"
  lidar_type="$(topic_type /livox/lidar)"
  if node_is_running "$nodes" rosout \
      && node_is_running "$nodes" livox_lidar_publisher2 \
      && [[ -n "$imu_type" && -n "$lidar_type" ]]; then
    break
  fi
  sleep 1
done

nodes="$(rosnode list 2>/dev/null || true)"

# Reaching this script through docker exec proves the container is alive.
emit_result container "Container alive" "self" "running" 1 "running" 1

for spec in \
  "ROS core reachable|rosout" \
  "Driver node alive|livox_lidar_publisher2"; do
  IFS='|' read -r name node <<<"$spec"
  if node_is_running "$nodes" "$node"; then
    emit_result container "$name" "$node" "running" 1 "running" 1
  else
    emit_result container "$name" "$node" "running" 0 "not found" 0
  fi
done

if [[ "$MODE" == "mapping" ]]; then
  if node_is_running "$nodes" laserMapping; then
    emit_result slam "laserMapping alive" laserMapping "running" 1 "running" 1
  else
    emit_result slam "laserMapping alive" laserMapping "running" 0 "not found" 0
  fi
fi

for spec in \
  "IMU topic present|/livox/imu|sensor_msgs/Imu" \
  "LiDAR topic present|/livox/lidar|sensor_msgs/PointCloud2"; do
  IFS='|' read -r name topic expected <<<"$spec"
  actual="$(topic_type "$topic")"
  if [[ "$actual" == "$expected" || "$actual" == "livox_ros_driver2/CustomMsg" ]]; then
    emit_result driver "$name" "$topic" "$expected" 1 "$actual" 1
  else
    emit_result driver "$name" "$topic" "$expected" 0 "${actual:-not found}" 0
  fi
done

hz_specs=(
  "driver|IMU frequency|/livox/imu|50"
  "driver|LiDAR frequency|/livox/lidar|5"
)
if [[ "$MODE" == "mapping" ]]; then
  hz_specs+=(
    "slam|Odometry|/Odometry|5"
    "slam|Registered cloud|/cloud_registered|5"
    "slam|Prior local cloud|/prior_local_cloud|1"
    "slam|Combined cloud|/cloud_registered_with_prior|5"
  )
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

pids=()
for index in "${!hz_specs[@]}"; do
  IFS='|' read -r _ _ topic _ <<<"${hz_specs[$index]}"
  (
    timeout "$((SAMPLE_SECONDS + 2))" \
      rostopic hz "$topic" --window=20 >"$tmp_dir/$index" 2>&1 || true
  ) &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

for index in "${!hz_specs[@]}"; do
  IFS='|' read -r level name topic threshold <<<"${hz_specs[$index]}"
  hz="$(awk '/average rate:/ { value=$3 } END { print value+0 }' "$tmp_dir/$index")"
  if awk -v actual="$hz" -v minimum="$threshold" 'BEGIN { exit !(actual >= minimum) }'; then
    emit_result "$level" "$name" "$topic" ">=${threshold} Hz" "$hz" "${hz} Hz" 1
  else
    emit_result "$level" "$name" "$topic" ">=${threshold} Hz" "$hz" "${hz} Hz" 0
  fi
done

printf 'SMOKE_SUMMARY\t%s\n' "$failures"
(( failures == 0 ))
