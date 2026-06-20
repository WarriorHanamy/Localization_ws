# l10n Dashboard — Status 2026-06-19

## 架构

```
Jetson (aarch64, ROS Noetic)               Host (x86_64)                 Browser
┌─────────────────────────────────┐       ┌──────────────────┐         ┌──────────────┐
│ FAST-LIO (laserMapping)         │       │ Bun server :3000 │         │ React+3D     │
│   ├ /livox/lidar  (10Hz)        │       │  └─ MQTT.js ─────┼──WS───►│  three.js    │
│   └ /livox/imu    (200Hz)       │       │                  │         │  Recharts    │
│         ↓                       │  MQTT │                  │         └──────────────┘
│  mqtt_bridge.py ───────────────►│ 1883  │                  │
│  (rospy → paho.mqtt)            │       │                  │
│                                 │       │                  │
│  Mosquitto                       │       │                  │
│  (systemd, MQTT + WS)           │       │                  │
└─────────────────────────────────┘       └──────────────────┘
```

## 完成的工作

| 项目 | 文件 | 状态 |
|------|------|------|
| **Mid360s 驱动配置** | `livox_ros_driver2/config/MID360s_config.json` | ✅ |
| **Mid360s 启动文件** | `livox_ros_driver2/launch_ROS1/msg_MID360s.launch` | ✅ |
| **组合启动** | `FAST_LIO/launch/bringup_mid360s.launch` | ✅ |
| **FAST-LIO 配置修正** | `FAST_LIO/config/mid360.yaml` (`lidar_type 1→6`, `initial_map_from_pcd true→false`) | ✅ |
| **Mosquitto MQTT broker** | Jetson 系统服务 (1883 MQTT, 9001 WS) | ✅ |
| **MQTT 桥接 (Python)** | `src/mqtt_bridge.py` | ✅ |
| **Bun MQTT 客户端** | `src/server/mqtt.ts` | ✅ |
| **服务器入口** | `src/server/index.ts` | ✅ |
| **Dashboard CLI** | `src/cli/dashboard.ts` | ✅ |
| **删除 livox_ros_driver (v1)** | 整个目录 | ✅ |
| **删除 rosbridge** | `rosbridge.ts`, `relay.ts`, `downsample.ts` | ✅ |
| **Bun 依赖** | `mqtt` npm package | ✅ |

### CLI 命令

```
bun run check         SSH 连通性验证
bun run sync          rsync 到 Jetson
bun run build         远端 catkin 编译
bun run dashboard     一键启动(MQTT+SLAM+前端)
bun run dashboard --no-launch  仅前端，不启动 SLAM
```

## 已验证的数据流

```
CPU:  laserMapping ─TCPROS─→ mqtt_bridge.py ─MQTT─→ Mosquitto ─MQTT─→ Bun ─WS─→ Browser
      WS 收到 40+ 条消息，topic: /cpu_usage ✅
```

## 当前问题

### 1. FAST-LIO 不产出 Odometry/PointCloud

**现象**:
- `laserMapping` 进程注册到 roscore（`rosnode list` 可见）
- 但 `/Odometry`, `/cloud_registered` 均为 0Hz
- 节点运行约 27 秒后 SIGABRT（exit code -6）

**log** (roslaunch log):
```
[laserMapping-2] process has died [pid 111595, exit code -6]
```
`laserMapping-2*.log` 文件不存在（节点 crash 前未产生日志）

**可疑原因** (按概率排序):

| # | 原因 | 分析 |
|---|------|------|
| 1 | LiDAR 驱动初始化后不流数据 | `rostopic hz /livox/lidar` 为 0, 但 `rosnode list` 看到进程 |
| 2 | `anomaly_detection` 超时 | `timeout_lidar: 0.2s` 过于激进, 但该 timer 实际被注释 (line 1329) |
| 3 | IMU 初始化失败 | `Waiting for imu init, skip this scan` → 无 IMU 数据 → `feats_undistort` 始终为空 |
| 4 | PCD 文件缺失 | `initial_map_from_pcd` 已设为 false, 但 `map_incremental: true` 模式可能仍尝试打开 PCD |

**排查步骤**:
1. 在 Jetson 本地单独启动 LiDAR 驱动并确认 `/livox/lidar` 有实时数据:
   ```bash
   rostopic hz /livox/lidar    # 应显示 ~10Hz
   ```
2. 单独启动 FAST-LIO，观察是否有 "No point, skip this scan" 或 "Waiting for imu init" 日志
3. 增大 `anomaly_detection` 中的 `timeout_lidar` 到 1.0s 避免误断

### 2. LiDAR 驱动状态不明

- LiDAR IP: 192.168.2.88 (Jetson 端 ping 可达)
- SN: ARMCP150033192
- 驱动初始化成功 (`Query Fw type succ`, `Update lidar succ`)
- 但之后不发布点云数据 (`rostopic hz /livox/lidar` 无消息)
- 需在 Jetson 上 `roslaunch` 检查实际输出

## 关键文件索引

| 路径 | 说明 |
|------|------|
| `src/mqtt_bridge.py` | ROS → MQTT 桥接 (Jetson 端运行) |
| `src/server/mqtt.ts` | MQTT 客户端 + WS 广播 (Host 端) |
| `src/server/index.ts` | Bun 服务入口 |
| `src/cli/dashboard.ts` | 一键启动 CLI |
| `FAST_LIO/config/mid360.yaml` | FAST-LIO SLAM 参数 |
| `FAST_LIO/launch/bringup_mid360s.launch` | 组合启动 (Driver + SLAM) |
| `livox_ros_driver2/config/MID360s_config.json` | Mid360s 网络配置 |
| `livox_ros_driver2/launch_ROS1/msg_MID360s.launch` | LiDAR 驱动启动 |
