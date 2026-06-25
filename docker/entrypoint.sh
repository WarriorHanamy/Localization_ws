#!/bin/bash
set -e

source /opt/ros/noetic/setup.bash
if [[ -f /catkin_ws/devel/setup.bash ]]; then
    source /catkin_ws/devel/setup.bash
fi
export ROS_PACKAGE_PATH=/catkin_ws/src:$ROS_PACKAGE_PATH

if ! rostopic list >/dev/null 2>&1; then
  roscore &
  sleep 2
fi

if [[ "$1" == "roslaunch" ]] && [[ "$2" == "bringup"* ]]; then
  (
    for i in $(seq 1 30); do
      if rostopic list 2>/dev/null | grep -q /Odometry; then
        touch /tmp/slam_ready
        break
      fi
      sleep 2
    done
  ) &
fi

exec "$@"
