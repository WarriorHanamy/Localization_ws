FROM arm64v8/ubuntu:20.04
ENV DEBIAN_FRONTEND=noninteractive TZ=Asia/Shanghai

# Install gnupg for apt-key and add ROS Noetic source (TUNA mirror for ARM64)
RUN apt-get update && apt-get install -y gnupg \
    && rm -rf /var/lib/apt/lists/*
COPY docker/ros-archive-keyring.gpg /tmp/ros-archive-keyring.gpg
RUN apt-key add /tmp/ros-archive-keyring.gpg \
    && echo "deb [arch=arm64] http://mirrors.tuna.tsinghua.edu.cn/ros/ubuntu focal main" > /etc/apt/sources.list.d/ros.list \
    && rm -f /tmp/ros-archive-keyring.gpg

# Build and ROS dependencies (ARM64)
RUN apt-get update && apt-get install -y \
    libpcap-dev \
    libeigen3-dev \
    libopencv-dev \
    python3-numpy \
    ros-noetic-ros-base \
    ros-noetic-pcl-ros \
    ros-noetic-cv-bridge \
    ros-noetic-eigen-conversions \
    ros-noetic-tf \
    ros-noetic-tf2-geometry-msgs \
    && rm -rf /var/lib/apt/lists/*

# Pre-built Livox SDK2 (aarch64)
COPY bringup/resource/livox_sdk2/*.a  /usr/local/lib/
COPY bringup/resource/livox_sdk2/*.so /usr/local/lib/
COPY bringup/resource/livox_sdk2/*.h  /usr/local/include/
RUN ldconfig

# Catkin workspace
RUN mkdir -p /catkin_ws/src
COPY livox_ros_driver2/ /catkin_ws/src/livox_ros_driver2/
COPY FAST_LIO/          /catkin_ws/src/fast_lio/
COPY ekf_quat_pose/     /catkin_ws/src/ekf_quat_pose/
COPY incremental_map_publisher/ /catkin_ws/src/incremental_map_publisher/
COPY bringup/           /catkin_ws/src/bringup/

# Build all packages
RUN . /opt/ros/noetic/setup.sh && \
    cd /catkin_ws && \
    catkin_make -j$(nproc) --cmake-args -DCMAKE_BUILD_TYPE=Release

# Entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]
