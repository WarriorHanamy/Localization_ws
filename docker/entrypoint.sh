#!/bin/bash
set -e

source /opt/ros/noetic/setup.bash
source /catkin_ws/devel/setup.bash

if ! rostopic list >/dev/null 2>&1; then
  roscore &
  sleep 2
fi

exec "$@"
