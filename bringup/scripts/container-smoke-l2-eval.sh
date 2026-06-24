#!/usr/bin/env bash

# L2 calibration evaluation smoke.
# Sources ROS, then runs ground-plane tilt evaluation.

source /opt/ros/noetic/setup.bash
source /catkin_ws/devel/setup.bash

exec python3 /catkin_ws/src/bringup/scripts/eval_ground_plane.py "$@"
