# LiDAR_IMU_Init 集成 + Calib Smoke 服务计划

## 一、Clone LiDAR_IMU_Init + manifest.yaml

| # | 操作 | 详情 |
|---|------|------|
| 1 | `git clone https://github.com/hku-mars/LiDAR_IMU_Init.git` | 到 workspace 根目录 `LiDAR_IMU_Init/` |
| 2 | `git rev-parse HEAD` | 记录 commit SHA: `66b157afa30bf6637d7f9defa6ddba46f417000b` |
| 3 | `rm -rf LiDAR_IMU_Init/.git` | 源码由 workspace git 跟踪（同 FAST_LIO / livox_ros_driver2 模式） |
| 4 | 适配 `livox_ros_driver` → `livox_ros_driver2` | 修改 4 文件：CMakeLists.txt、preprocess.h、preprocess.cpp、laserMapping.cpp |
| 5 | 创建 `manifest.yaml` | 记录 URL / branch / commit / synced / purpose |

## 二、`docker/Dockerfile.calib` — 专用校准镜像

镜像 tag: `fastlio-calib:latest`

与主镜像差异：

| 包 | 主镜像 | calib 镜像 |
|---|--------|-----------|
| `libceres-dev` + glog/gflags | ❌ | ✅ LiDAR_IMU_Init 依赖 |
| `ros-noetic-mavros` + extras | ❌ | ✅ PX4 IMU 数据源 |
| geographiclib datasets | ❌ | ✅ MAVROS 运行时要求 |
| `livox_ros_driver2` | Layer 1 | Layer 1 |
| `LiDAR_IMU_Init` | ❌ | Layer 2 |
| ekf / incr_map / FAST_LIO | ✅ | ❌ |
| bringup | COPY | bind-mount only |

Dockerfile 结构：

```dockerfile
FROM arm64v8/ubuntu:20.04
  → apt: libpcap-dev libeigen3-dev libopencv-dev python3-numpy
         libgoogle-glog-dev libgflags-dev libceres-dev
         ros-noetic-ros-base ros-noetic-pcl-ros ros-noetic-cv-bridge
         ros-noetic-eigen-conversions ros-noetic-tf ros-noetic-tf2-geometry-msgs
         ros-noetic-mavros ros-noetic-mavros-extras geographiclib-tools
  → SDK2 copy + ldconfig
  → Layer 1: livox_ros_driver2 (catkin_make)
  → Layer 2: LiDAR_IMU_Init (catkin_make)
  → ENTRYPOINT entrypoint.sh
```

Build 命令: `bun run docker-dbuild calib`（扩展 docker-build.ts 支持 target 参数）

## 三、Phase A — 数据链路最小验证 (smoke calib_data_link)

纯 headless 频率检查，验证 LiDAR + MAVROS 数据链路正常。

| # | 文件 | 说明 |
|---|------|------|
| 1 | `bringup/launch/smoke_calib_data_link.launch` | include `msg_$(hardware).launch` + `mavros/px4.launch fcu_url:=$(arg fcu_url)` |
| 2 | `bringup/scripts/container-calib-smoke.sh` | 频率检查: `/livox/lidar` ≥5Hz, `/mavros/imu/data` ≥200Hz, 输出 `SMOKE_RESULT\t...` |
| 3 | `src/core/config.ts` | 注册 `smoke-calib-data-link` recipe |
| 4 | `src/cli/smoke.ts` | 新增 `calib_data_link` 子命令（复用 data_link 模式，用 calib 镜像 + calib-smoke.sh） |

命令: `bun run smoke calib_data_link mid360`

## 四、Phase B — 全链路校准 smoke (smoke calib)

完整拉起 LiDAR driver + MAVROS + LI-Init 校准节点 + RVIZ。

| # | 文件 | 说明 |
|---|------|------|
| 1 | `bringup/config/smoke_calib_mid360.yaml` | `lid_topic: /livox/lidar`, `imu_topic: /mavros/imu/data`, `mean_acc_norm: 9.805`, `cut_frame_num: 5` |
| 2 | `bringup/config/smoke_calib_mid360s.yaml` | 同上 |
| 3 | `bringup/launch/smoke_calib.launch` | 一条 launch 拉起三个组件: `msg_$(hardware)` + `mavros px4 fcu_url:=$(arg fcu_url)` + `li_init` |
| 4 | `bringup/rviz_cfg/smoke_calib.rviz` | `/cloud_registered` + `/Laser_map` + `/aft_mapped_to_init` + TF + Grid |
| 5 | `src/cli/smoke.ts` | 新增 `doSmokeCalib()`: tmux(calib + rviz) + auto-attach |

命令: `bun run smoke calib mid360`

## 五、构建 + CI 认证

```bash
bun run sync
bun run docker-dbuild calib           # 构建 fastlio-calib:latest
bun run smoke calib_data_link mid360  # Phase A: 纯 headless 频率验证
bun run smoke calib mid360            # Phase B: 全链路校准 + RVIZ
```

## 六、CLI 命令总览

```bash
bun run smoke calib_data_link mid360     # Phase A: headless 频率检查
bun run smoke calib_data_link mid360s    # Phase A: Mid360s 版本
bun run smoke calib mid360               # Phase B: 全链路校准 + RVIZ
bun run smoke calib mid360s              # Phase B: Mid360s 版本
bun run docker-dbuild calib              # 构建 calib 专用镜像
```

## 七、关键参数

- IMU topic: `/mavros/imu/data`
- LiDAR topic: `/livox/lidar`
- MAVROS fcu_url: `/dev/ttyTHS0:921600`
- mean_acc_norm: `9.805` (Pixhawk IMU)
- Container runtime: `--privileged` (串口 + GPU 权限)
- MAVROS launch: 默认 `px4.launch`（全插件）
