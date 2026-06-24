#!/usr/bin/env bash

# L1 driver smoke test.
# Checks LiDAR + IMU frequency. IMU source configurable via env.

source /opt/ros/noetic/setup.bash
source /catkin_ws/devel/setup.bash
set -uo pipefail

readonly SAMPLE_SECONDS="${SMOKE_SAMPLE_SECONDS:-10}"
readonly STARTUP_TIMEOUT="${SMOKE_STARTUP_TIMEOUT:-30}"
readonly IMU_SRC="${SMOKE_IMU_SRC:-mavros}"
readonly IMU_TOPIC="${SMOKE_IMU_TOPIC:-/mavros/imu/data}"

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

# Wait for startup: nodes + topics reachable
deadline=$((SECONDS + STARTUP_TIMEOUT))
while (( SECONDS < deadline )); do
  nodes="$(rosnode list 2>/dev/null || true)"
  lidar_type="$(topic_type /livox/lidar)"
  imu_type="$(topic_type "$IMU_TOPIC")"
  if node_is_running "$nodes" rosout \
      && node_is_running "$nodes" livox_lidar_publisher2; then
    if [[ "$IMU_SRC" == "mavros" ]] && node_is_running "$nodes" mavros_node && [[ -n "$imu_type" ]]; then
      break
    elif [[ "$IMU_SRC" == "livox" ]] && [[ -n "$imu_type" ]]; then
      break
    fi
  fi
  sleep 1
done

emit_result container "Container alive"      "self"               "running" 1 "running" 1
emit_result container "Livox driver node"    "livox_lidar_publisher2" "running" 1 "running" 1

if [[ "$IMU_SRC" == "mavros" ]]; then
  emit_result container "MAVROS node"        "mavros_node"        "running" 1 "running" 1
fi

for spec in \
  "IMU topic present|$IMU_TOPIC|sensor_msgs/Imu" \
  "LiDAR topic present|/livox/lidar|livox_ros_driver2/CustomMsg"; do
  IFS='|' read -r name topic expected <<<"$spec"
  actual="$(topic_type "$topic")"
  if [[ "$actual" == "$expected" ]]; then
    emit_result driver "$name" "$topic" "$expected" 1 "$actual" 1
  else
    emit_result driver "$name" "$topic" "$expected" 0 "${actual:-not found}" 0
  fi
done

hz_specs=(
  "driver|IMU frequency|$IMU_TOPIC|10"
  "driver|LiDAR frequency|/livox/lidar|5"
)

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
