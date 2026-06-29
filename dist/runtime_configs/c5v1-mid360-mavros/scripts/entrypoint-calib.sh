#!/bin/bash
set -e

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

exec "$@"
