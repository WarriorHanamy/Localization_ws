#!/bin/bash
# L1 smoke check: LiDAR + IMU topic types and frequency
# Prints SMOKE_RESULT lines, returns 0 on pass, 1 on fail
set -eo pipefail

source /opt/ros/noetic/setup.bash
if [[ -f /catkin_ws/devel/setup.bash ]]; then
  source /catkin_ws/devel/setup.bash
fi

export ROS_PACKAGE_PATH=/catkin_ws/src:$ROS_PACKAGE_PATH
if ! rostopic list >/dev/null 2>&1; then
  roscore &
  for _ in $(seq 1 10); do
    if rostopic list >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

BOLD="\\033[1m"
GREEN="\\033[32m"
RED="\\033[31m"
RESET="\\033[0m"
FAIL=0

check() {
  local name="$1" topic="$2" expected_type="$3" min_hz="${4:-0}" imu="${5:-0}"
  local actual_type actual_hz pass_hz pass_type

  # Type check
  actual_type=$(rostopic type "$topic" 2>/dev/null || echo "")
  if [[ "$actual_type" == "$expected_type" ]]; then
    pass_type="PASS"
  else
    pass_type="FAIL"
  fi

  # Frequency check
  if [[ "$imu" == "1" ]]; then
    actual_hz=$(timeout 6 rostopic hz --window=500 "$topic" 2>/dev/null | awk '/average rate:/{v=$3} END{print int(v+0.5)}')
  else
    actual_hz=$(timeout 6 rostopic hz "$topic" 2>/dev/null | awk '/average rate:/{v=$3} END{print int(v+0.5)}')
  fi
  actual_hz=${actual_hz:-0}

  if [[ "$actual_hz" -ge "$min_hz" ]]; then
    pass_hz="PASS"
  else
    pass_hz="FAIL"
  fi

  printf "SMOKE_RESULT\\t%s\\t%s\\t>=%d Hz\\t%d Hz\\t%s\\t%s\\n" \
    "$name" "$topic" "$min_hz" "$actual_hz" "$pass_type" "$pass_hz"

  if [[ "$pass_type" == "FAIL" || "$pass_hz" == "FAIL" ]]; then
    return 1
  fi
  return 0
}

echo ""
echo "${BOLD}  L1 Smoke Check${RESET}"
echo "  =============="
echo ""

# Wait for topics to appear
for i in $(seq 1 20); do
  if rostopic list 2>/dev/null | grep -q /livox/lidar; then
    break
  fi
  sleep 1
done

check "LiDAR" "/livox/lidar" "livox_ros_driver2/CustomMsg" 9 || FAIL=1
check "IMU"   "/livox/imu"   "sensor_msgs/Imu"            190 1 || FAIL=1

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "${GREEN}${BOLD}  [PASS]${RESET} L1 smoke check passed."
else
  echo "${RED}${BOLD}  [FAIL]${RESET} L1 smoke check failed."
fi

exit $FAIL
