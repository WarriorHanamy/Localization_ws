#!/bin/bash
# L2 smoke check: SLAM /Odometry topic type and frequency
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
  local name="$1" topic="$2" expected_type="$3" min_hz="${4:-0}"
  local actual_type actual_hz pass_hz pass_type

  actual_type=$(rostopic type "$topic" 2>/dev/null || echo "")
  if [[ "$actual_type" == "$expected_type" ]]; then
    pass_type="PASS"
  else
    pass_type="FAIL"
  fi

  # Longer poll for SLAM: 15s window
  actual_hz=$(timeout 18 rostopic hz "$topic" 2>/dev/null | awk '/average rate:/{v=$3} END{print int(v+0.5)}')
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
echo "${BOLD}  L2 Smoke Check (SLAM)${RESET}"
echo "  ======================="
echo ""

# Wait for topics to appear (up to 30s)
for i in $(seq 1 30); do
  if rostopic list 2>/dev/null | grep -q /Odometry; then
    break
  fi
  sleep 1
done

check "Odometry" "/Odometry" "nav_msgs/Odometry" 9 || FAIL=1

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "${GREEN}${BOLD}  [PASS]${RESET} L2 smoke check passed."
else
  echo "${RED}${BOLD}  [FAIL]${RESET} L2 smoke check failed."
fi

exit $FAIL
