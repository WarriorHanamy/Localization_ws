export interface Snippet {
  code: string;
  lang: string;
}

export interface CodeRef {
  file: string;
  line: number;
  desc: string;
  code?: string;
}

export interface ParamDef {
  name: string;
  yamlPath: string;
  type: string;
  defaultValue: string;
  desc: string;
  math?: string;
  refs: CodeRef[];
}

export interface Category {
  id: string;
  title: string;
  icon: string;
  summary: string;
  params: ParamDef[];
  dataFlowLabel?: string;
}

const ROOT = "FAST_LIO";

const C1_COORD: Category = {
  id: "coord",
  title: "坐标系变换",
  icon: "↗",
  summary:
    "定义 LiDAR 传感器坐标系与机器人 Body 坐标系之间的刚体变换。与 mapping/extrinsic_R/T (LiDAR→IMU) 不同，wxx/Lidar_wrt_Body_* 是独立的坐标系转换，影响 IMU 读数旋转和点云预处理变换。",
  params: [
    {
      name: "Lidar_wrt_Body_R",
      yamlPath: "wxx/Lidar_wrt_Body_R",
      type: "M3D (3×3 rotation matrix)",
      defaultValue: "Identity (无变换)",
      desc: "Body→LiDAR 旋转矩阵。将 Body 坐标系下的 IMU 读数 (acc/gyr) 和 LiDAR 点云数据旋转到 LiDAR 坐标系。注释中保留多种 ~75° 安装角度配置。",
      math:
        "Lidar_Odom = R * (Body_Odom + T)\n\nimu_cbk:  ω'  = R · ω,   a'  = R · a\npreprocess: p'  = R · p + T",
      refs: [
        {
          file: `${ROOT}/config/mid360.yaml`,
          line: 71,
          desc: "YAML 配置定义",
          code: "[ 1,0, 0,\n  0,1, 0,\n  0,0, 1]",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 184,
          desc: "全局变量声明 M3D Lidar_wrt_Body_R",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 419,
          desc: "imu_cbk 中旋转 IMU 读数: acc = R * acc_raw; gyr = R * gyr_raw",
          code: 'acc = Lidar_wrt_Body_R * acc;\ngyr = Lidar_wrt_Body_R * gyr;',
        },
        {
          file: `${ROOT}/src/preprocess.cpp`,
          line: 56,
          desc: "avia_handler 中旋转 LiDAR 点云: pt = R * pt_raw + T",
          code: "pt = Lidar_wrt_Body_R * pt + Lidar_wrt_Body_T;",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1208,
          desc: "从参数向量构造旋转矩阵",
          code: 'Lidar_wrt_Body_R << MAT_FROM_ARRAY(Lidar_wrt_Body_R_vec);',
        },
      ],
    },
    {
      name: "Lidar_wrt_Body_T",
      yamlPath: "wxx/Lidar_wrt_Body_T",
      type: "V3D (3×1 translation vector)",
      defaultValue: "[0, 0, 0]",
      desc: "Body→LiDAR 平移向量。配合 Lidar_wrt_Body_R 完成刚体变换，目前设置为零偏移。",
      math: "T ∈ ℝ³  — 平移部分, p' = R·p + T",
      refs: [
        {
          file: `${ROOT}/config/mid360.yaml`,
          line: 101,
          desc: "YAML 配置",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1207,
          desc: "从参数向量构造平移",
          code: 'Lidar_wrt_Body_T << VEC_FROM_ARRAY(Lidar_wrt_Body_T_vec);',
        },
      ],
    },
  ],
  dataFlowLabel:
    "YAML → laserMapping.cpp:1208-1209 构造 R/T → imu_cbk:419-426 旋转 IMU / preprocess.cpp:56-59 变换点云",
};

const C2_MAP: Category = {
  id: "map",
  title: "先验地图管理",
  icon: "🗺",
  summary: "控制 FAST-LIO 是否从已有 PCD 文件初始化地图、是否增量建图、以及是否在退出时保存更新后的地图。两者均为 false 时程序直接退出。",
  params: [
    {
      name: "initial_map_from_pcd",
      yamlPath: "wxx/initial_map_from_pcd",
      type: "bool",
      defaultValue: "false",
      desc: "从 PCD 文件加载初始地图并进入重定位模式。启用后：加载 PCD → 构建 ikd-Tree → 等待 /initial_odom_for_lio 话题 → 开始 LIO 定位。",
      math: "地图长驻内存，作为先验约束参与 ICP 配准",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1135,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1254,
          desc: "加载 PCD 并构建 ikd-Tree",
          code: "ikdtree.Build(featsFromMap->points);",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1305,
          desc: "等待初始位姿",
          code: 'while(!have_initial_odom_) { ... }',
        },
      ],
    },
    {
      name: "map_incremental",
      yamlPath: "wxx/map_incremental",
      type: "bool",
      defaultValue: "true",
      desc: "是否将每帧 ICP 优化后的新扫描点增量加入地图。标准 FAST-LIO 行为，同时启用时两者叠加：先载入先验地图 + 运行时增量更新。",
      math: "Map_{t+1} = Map_t ∪ {new_points_after_ICP}",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1134,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1513,
          desc: "条件调用 map_incremental()",
          code: "if(map_incremental_) map_incremental();",
        },
      ],
    },
    {
      name: "initial_map_pcd_name",
      yamlPath: "wxx/initial_map_pcd_name",
      type: "string",
      defaultValue: "new1.pcd",
      desc: "初始地图 PCD 文件名（搜索路径 ROOT_DIR/PCD/）。文件不存在时程序报错退出。包含 NaN/Inf 过滤逻辑。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1136,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1257,
          desc: "PCD 加载路径拼接 + 读取",
          code: 'string all_points_dir_map_kdtree = string(ROOT_DIR) + "PCD/" + file_name_map_kdtree;',
        },
      ],
    },
    {
      name: "save_new_map_to_pcd",
      yamlPath: "wxx/save_new_map_to_pcd",
      type: "bool",
      defaultValue: "true",
      desc: "程序退出时将完整 ikd-Tree 展平并保存为 PCD 文件，更新后的地图可复用作为下次的 initial_map。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1143,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1601,
          desc: "退出时保存地图",
          code: "ikdtree.flatten(ikdtree.Root_Node, ikdtree.PCL_Storage, NOT_RECORD);",
        },
      ],
    },
    {
      name: "new_map_pcd_name",
      yamlPath: "wxx/new_map_pcd_name",
      type: "string",
      defaultValue: "new.pcd",
      desc: "退出时保存的地图文件名。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1144,
          desc: "参数读取",
        },
      ],
    },
  ],
  dataFlowLabel: "initial_map_from_pcd → PCD 加载 → ikd-Tree → 等待 initial_odom → LIO 定位循环 → map_incremental (可选) → 退出保存",
};

const C3_PRIOR: Category = {
  id: "prior",
  title: "先验局部点云发布",
  icon: "◎",
  summary: "提供基于先验地图的局部点云截球发布功能，用于下游模块（如可视化、定位辅助）获取当前位置附近的先验地图点。后台线程异步执行，与主循环解耦。",
  params: [
    {
      name: "prior_local_enable",
      yamlPath: "prior_local_enable",
      type: "bool",
      defaultValue: "false",
      desc: "主开关。启用后在内存中维护一份降采样的先验地图副本 + KdTree 索引，启动独立生成线程，发布 /prior_local_cloud 和 /cloud_registered_with_prior 话题。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1137,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1360,
          desc: "启动后台线程",
          code: "std::thread prior_gen_thread(prior_local_thread);\nprior_gen_thread.detach();",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 739,
          desc: "主循环中发布话题",
          code: "pubPriorLocalCloud.publish(priorMsg);\npubLaserCloudWithPrior.publish(withPriorMsg);",
        },
      ],
    },
    {
      name: "prior_local_radius",
      yamlPath: "prior_local_radius",
      type: "double",
      defaultValue: "5.0 [m]",
      desc: "以当前位姿为球心的截球半径。KdTree radiusSearch 在此范围内抽取先验地图点，决定局部点云的范围。",
      math: "S = {p ∈ Map | ‖p - pos_cur‖ < r}, r = prior_local_radius",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1138,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 689,
          desc: "半径搜索",
          code: "prior_kdtree_.radiusSearch(search_pt, prior_local_radius_, idx, dist);",
        },
      ],
    },
    {
      name: "prior_local_motion_check",
      yamlPath: "prior_local_motion_check",
      type: "bool",
      defaultValue: "false",
      desc: "启用位移阈值优化。当机器人位移小于 motion_thresh 时跳过截球重算，直接复用上一次的缓存，减少计算开销。",
      math: "recompute = ‖pos_cur - pos_last‖ ≥ thresh",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1139,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 674,
          desc: "阈值判断",
          code: 'if (prior_local_motion_check_ && prior_local_has_cache_ &&\n    (query_pos - prior_local_last_pos_).norm() < prior_local_motion_thresh_)\n    need_recompute = false;',
        },
      ],
    },
    {
      name: "prior_local_motion_thresh",
      yamlPath: "prior_local_motion_thresh",
      type: "double",
      defaultValue: "0.5 [m]",
      desc: "触发截球重算的最小位移阈值。",
      math: "thresh ∈ ℝ⁺, 默认 0.5 m",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1140,
          desc: "参数读取",
        },
      ],
    },
    {
      name: "prior_local_leaf",
      yamlPath: "prior_local_leaf",
      type: "double",
      defaultValue: "0.1 [m]",
      desc: "先验图降采样体素边长。在内存中额外保存一份 PCL VoxelGrid 降采样后的先验地图副本用于截球，不影响 ikd-Tree 全分辨率重定位精度。≤0 时不降采样。",
      math: "体素滤波: p_new = centroid{p ∈ voxel | side = leaf}",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1141,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1286,
          desc: "初始化降采样",
          code: "downSizePrior.setLeafSize(prior_local_leaf_, prior_local_leaf_, prior_local_leaf_);",
        },
      ],
    },
    {
      name: "prior_local_gen_hz",
      yamlPath: "prior_local_gen_hz",
      type: "double",
      defaultValue: "2.0 [Hz]",
      desc: "后台先验局部点云生成线程运行频率。频率越高截球更新越快，但 CPU 开销也越大。",
      math: "f ∈ ℝ⁺, 每秒执行完整的 radiusSearch + 缓存交换的次数",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1142,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 656,
          desc: "线程主循环频率设置",
          code: "ros::Rate rate(prior_local_gen_hz_ > 0.0 ? prior_local_gen_hz_ : 2.0);",
        },
      ],
    },
  ],
  dataFlowLabel:
    "initial_map → VoxelGrid 降采样 (leaf) → KdTree 索引 → [后台线程] 读取当前位姿 → radiusSearch (radius) → 缓存交换 → [主循环] 发布话题",
};

const C4_CPU: Category = {
  id: "cpu",
  title: "CPU 亲和性",
  icon: "⚙",
  summary: "通过 sched_setaffinity 将 OpenMP 工作线程绑定到指定物理核心，减少实时调度抖动，确保 FAST-LIO 在 Jetson 多核环境下的确定性性能。",
  params: [
    {
      name: "sched_setaffinity_en",
      yamlPath: "wxx/sched_setaffinity_en",
      type: "bool",
      defaultValue: "true",
      desc: "主开关。启用后将 thread pool 中 3 个线程 pin 到指定 CPU 核心。运行时在 h_share_model 的 OpenMP parallel 区域内执行 setaffinity。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1158,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 928,
          desc: "OpenMP 区域内 pin 线程",
          code: "CPU_SET(sched_setaffinity_cores_[thread_id], &cpuset);\nsched_setaffinity(0, sizeof(cpuset), &cpuset);",
        },
      ],
    },
    {
      name: "cpu_core_num",
      yamlPath: "wxx/cpu_core_num",
      type: "int",
      defaultValue: "8",
      desc: "CPU 总核心数。用于验证设定的核心 ID 不超出范围。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1159,
          desc: "参数读取 + 校验",
        },
      ],
    },
    {
      name: "sched_setaffinity_cores",
      yamlPath: "wxx/sched_setaffinity_cores",
      type: "vector<int> (exactly 3)",
      defaultValue: "[0, 1, 2]",
      desc: "3 个 OpenMP 工作线程分别绑定的核心 ID。数量必须恰好为 3，每个值 < cpu_core_num。超出范围或数量不符时程序报错退出。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1160,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1161,
          desc: "校验: size == 3 && all < cpu_core_num",
        },
      ],
    },
  ],
  dataFlowLabel:
    "YAML → main() 校验 → h_share_model OpenMP parallel 区域 → sched_setaffinity 系统调用 → CPU 绑定生效",
};

const C5_AD: Category = {
  id: "anomaly",
  title: "硬件异常检测",
  icon: "⚠",
  summary: "监控 IMU 和 LiDAR 数据流超时。检测到异常时清空缓冲区并进入恢复等待，防止 EKF 使用陈旧数据发散。当前此功能被注释关闭。",
  params: [
    {
      name: "timeout_imu",
      yamlPath: "wxx/anomaly_detection/timeout_imu",
      type: "double",
      defaultValue: "0.1 [s]",
      desc: "IMU 数据超时阈值。当前时间减去最后 IMU 时间戳超过此值则判定 IMU 超时。",
      math: "t_now - t_last_imu > timeout ⇒ IMU timeout",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1179,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 453,
          desc: "超时判断",
          code: "if( time_now - last_timestamp_imu > ad_param_.timeout_imu )",
        },
      ],
    },
    {
      name: "timeout_lidar",
      yamlPath: "wxx/anomaly_detection/timeout_lidar",
      type: "double",
      defaultValue: "0.2 [s]",
      desc: "LiDAR 数据超时阈值。",
      math: "t_now - t_last_lidar > timeout ⇒ LiDAR timeout",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1180,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 446,
          desc: "超时判断",
          code: "if( time_now - last_timestamp_lidar > ad_param_.timeout_lidar )",
        },
      ],
    },
    {
      name: "imu_freq",
      yamlPath: "wxx/anomaly_detection/imu_freq",
      type: "double",
      defaultValue: "200 [Hz]",
      desc: "期望的 IMU 发布频率，用于恢复阶段判断缓冲区是否积攒了足够数据。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1181,
          desc: "参数读取",
        },
      ],
    },
    {
      name: "lidar_freq",
      yamlPath: "wxx/anomaly_detection/lidar_freq",
      type: "double",
      defaultValue: "10 [Hz]",
      desc: "期望的 LiDAR 发布频率。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1182,
          desc: "参数读取",
        },
      ],
    },
    {
      name: "hardware_recover_duration",
      yamlPath: "wxx/anomaly_detection/hardware_recover_duration",
      type: "double",
      defaultValue: "1.0 [s]",
      desc: "异常恢复等待时长。清空缓冲区后等待此时间×freq 个数据帧到达后才恢复运行。",
      math: "recover_threshold = duration × freq\ne.g., 1.0 s × 200 Hz = 200 IMU 帧 + 10 Lidar 帧",
      refs: [
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 1183,
          desc: "参数读取",
        },
        {
          file: `${ROOT}/src/laserMapping.cpp`,
          line: 485,
          desc: "恢复判断",
          code: 'if( (lidar_buffer.size() > (ad_param_.hardware_recover_duration * ad_param_.lidar_freq))\n   && (imu_buffer.size() > (ad_param_.hardware_recover_duration * ad_param_.imu_freq)) )',
        },
      ],
    },
  ],
  dataFlowLabel:
    "Timer 回调 (50ms) → hardware_anomaly_detection() → 超时判定 → 清空 buffer → 等待数据积攒 → 恢复",
};

const C6_MON: Category = {
  id: "monitor",
  title: "CPU 监控 (独立节点)",
  icon: "📊",
  summary: "独立 cpu_monitor 节点运行，通过可配置滤波器处理 /proc/stat 原始数据并发布 CPUUsage 消息。与 laserMapping 主节点分离。",
  params: [
    {
      name: "cpu_monitor_en",
      yamlPath: "wxx/cpu_monitor_en",
      type: "bool",
      defaultValue: "true",
      desc: "CPU 监控开关。由 cpu_monitor 节点单独读取。",
      math: "—",
      refs: [
        {
          file: `${ROOT}/src/cpu_monitor.cpp`,
          line: 1,
          desc: "节点实现",
        },
        {
          file: `${ROOT}/include/Utils/cpu_monitor.hpp`,
          line: 1,
          desc: "CPU 监控抽象实现",
        },
      ],
    },
    {
      name: "cpu_monitor_filter_type",
      yamlPath: "wxx/cpu_monitor_filter_type",
      type: "int {0,1,2}",
      defaultValue: "0 (SimpleMovingAverage)",
      desc: "滤波器类型: 0=SMA(滑动平均), 1=EMA(指数平均), 2=LowPass(低通)。影响 CPU 数据的平滑程度和响应速度。",
      math: "SMA: y[t] = (1/N) Σ x[t-i]\nEMA: y[t] = α·x[t] + (1-α)·y[t-1]\nLowPass: 一阶 RC 低通",
      refs: [
        {
          file: `${ROOT}/config/mid360.yaml`,
          line: 118,
          desc: "配置定义",
        },
        {
          file: `${ROOT}/include/Utils/cpu_monitor.hpp`,
          line: 1,
          desc: "滤波器实现",
        },
      ],
    },
    {
      name: "cpu_monitor_freq",
      yamlPath: "wxx/cpu_monitor_freq",
      type: "double",
      defaultValue: "10 [Hz]",
      desc: "CPU 监控发布频率。采样率应 ≥ 2× 截止频率（Nyquist）。",
      math: "f_sample ≥ 2 × f_cutoff",
      refs: [
        {
          file: `${ROOT}/config/mid360.yaml`,
          line: 121,
          desc: "配置定义",
        },
      ],
    },
  ],
  dataFlowLabel: "/proc/stat → cpu_monitor 节点读取 → 滤波器 (SMA/EMA/LP) → CPUUsage.msg → /cpu_usage topic",
};

const C7_TOPICS: Category = {
  id: "topics",
  title: "Output Topics",
  icon: "📡",
  summary:
    "FAST-LIO 进程内全局变量 ikdtree (KD_TREE<PointType>) 通过 ROS topic 发布出去，mqtt_bridge 条件订阅后经 Mosquitto → WS 到达前端。每个 topic 标注了 ROS 消息类型、C++ 内部数据类型、典型频率。🔵 = MQTT 转发到前端，⚪ = ROS only。",
  params: [
    {
      name: "/Odometry",
      yamlPath: "FAST_LIO · nav_msgs/Odometry",
      type: "nav_msgs/Odometry",
      defaultValue: "~10 Hz · 🔵 前端箭头",
      desc: "FAST-LIO 估计的当前里程计位姿（position + quaternion）。前端橙色箭头和轨迹线即消费此 topic。",
      math: "来源: state_ikfom · rot  +  state_ikfom · pos  →  tf::Transform  →  Odometry msg",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 857, desc: "publish_odometry()" },
        { file: "FAST_LIO/include/use-ikfom.hpp", line: 13, desc: "state_ikfom: pos + rot" },
        { file: "src/mqtt_bridge.py", line: 193, desc: "MQTT → l10n/odometry (JSON)" },
      ],
    },
    {
      name: "/cloud_registered",
      yamlPath: "FAST_LIO · sensor_msgs/PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · 🔵 绿色点云",
      desc: "世界坐标系下配准后的当前 LiDAR 扫描帧。IMU 去畸变 → ikd-tree ICP → world 系。MQTT bridge 以 binary float32 转发。",
      math: "PointType = pcl::PointXYZINormal\n字段: x, y, z, intensity, curvature (=timestamp offset ms)\n变换: p_world = state_point.rot · (offset_R_L_I · p_lidar + offset_T_L_I) + state_point.pos",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1333, desc: "pubLaserCloudFull" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 225, desc: "pointBodyToWorld_ikfom()" },
        { file: "src/mqtt_bridge.py", line: 194, desc: "MQTT → l10n/cloud (binary, 0.05m voxel)" },
      ],
    },
    {
      name: "/cloud_registered_with_prior",
      yamlPath: "FAST_LIO (wxx) · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · 🔵 橙色点云",
      desc: "当前帧 + 先验局部截球点云的合并。若 prior_local_enable=false 则不发布。",
      math: "PointCloudXYZI::Ptr 拼接: *combined = *laserCloudWorld + *prior_local_cache_\n底层类型: pcl::PointXYZI",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1340, desc: "pubLaserCloudWithPrior" },
        { file: "src/mqtt_bridge.py", line: 206, desc: "MQTT → l10n/combined_cloud" },
      ],
    },
    {
      name: "/prior_local_cloud",
      yamlPath: "FAST_LIO (wxx) · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~2 Hz 生成 · 🔵 红色点云",
      desc: "wxx 先验地图截球。后台线程 prior_local_thread() 从降采样的初始 PCD 中 radiusSearch。",
      math: "prior_map_ds_cloud_  →  prior_kdtree_.radiusSearch(pos, prior_local_radius)\n→  prior_local_cache_ (mutex 保护)  →  pubPriorLocalCloud",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 654, desc: "prior_local_thread()" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 167, desc: "prior_map_ds_cloud_ (降采样副本)" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1342, desc: "pubPriorLocalCloud" },
      ],
    },
    {
      name: "/cloud_registered_body",
      yamlPath: "FAST_LIO · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · ⚪ 仅 ROS",
      desc: "body (IMU) 坐标系下的当前扫描点云，不做世界系变换。",
      math: "p_body = offset_R_L_I · p_lidar + offset_T_L_I  (不乘 state_point.rot)",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 270, desc: "RGBpointBodyLidarToIMU()" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1337, desc: "pubLaserCloudFull_body" },
      ],
    },
    {
      name: "/cloud_registered_no_point_filter",
      yamlPath: "FAST_LIO (wxx) · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · ⚪ 仅 ROS",
      desc: "未隔点降采样的原始配准点云。点数 = 原始扫描帧点数。",
      math: "feats_undistort (原始) → 跳过 point_filter_num 隔点 → 直接发布",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1331, desc: "pubLaserCloudFullNoPointFilter" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1425, desc: "feats_undistort_no_point_filter swap" },
      ],
    },
    {
      name: "/circular_cloud_registered",
      yamlPath: "FAST_LIO · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · ⚪ debug",
      desc: "归一化球面投影 debug 点云。各点归一化到 debug_circular_cloud_radius 球面后变换到世界系。",
      math: "p_circular = normalize(p_lidar) × radius  →  RGBpointBodyToWorld",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 605, desc: "publish_debug_circular_frame_world()" },
      ],
    },
    {
      name: "/cloud_effected",
      yamlPath: "FAST_LIO · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "~10 Hz · ⚪ (注释掉)",
      desc: "ICP 使用的有效特征点。当前代码已注释 publish_effect_world 调用。",
      math: "point_selected_surf[i] = true 的点 → laserCloudOri (body 系)",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 819, desc: "publish_effect_world() (commented)" },
      ],
    },
    {
      name: "/Laser_map",
      yamlPath: "FAST_LIO · PointCloud2",
      type: "sensor_msgs/PointCloud2",
      defaultValue: "按需 · ⚪ 仅 ROS",
      desc: "全局 ikd-tree 展平后的点云地图。if(0) 块控制，默认关闭 (展平开销大)。",
      math: "ikdtree.flatten(Root_Node, PCL_Storage) → featsFromMap → publish_map()",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1476, desc: "if(0) flatten + publish" },
      ],
    },
    {
      name: "/path",
      yamlPath: "FAST_LIO · nav_msgs/Path",
      type: "nav_msgs/Path",
      defaultValue: "~1 Hz · 🔵 轨迹线",
      desc: "SLAM 轨迹。每 10 帧采样一次追加到 path.poses。前端青色轨迹线。",
      math: "path.poses.push_back(state_point.pos)  ·  jjj % 10 == 0",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 896, desc: "publish_path()" },
        { file: "src/mqtt_bridge.py", line: 198, desc: "MQTT → l10n/path (JSON)" },
      ],
    },
    {
      name: "/PoseStamped",
      yamlPath: "FAST_LIO · geometry_msgs/PoseStamped",
      type: "geometry_msgs/PoseStamped",
      defaultValue: "~10 Hz · ⚪ 仅 ROS",
      desc: "与 /Odometry 同源的 pose stamped。格式不同，内容相同。",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1352, desc: "pubPoseStampedAftMapped" },
      ],
    },
    {
      name: "/cpu_usage",
      yamlPath: "FAST_LIO (wxx) · fast_lio/CPUUsage",
      type: "fast_lio/CPUUsage",
      defaultValue: "~10 Hz · 🔵 CPU 面板",
      desc: "cpu_monitor 节点发布的各核心占用率。前端右上角 CPU 柱状图。",
      math: "float32[] cpu_usage  →  SMA/EMA/LP 滤波",
      refs: [
        { file: "FAST_LIO/src/cpu_monitor.cpp", line: 1, desc: "cpu_monitor 节点" },
        { file: "src/mqtt_bridge.py", line: 197, desc: "MQTT → l10n/cpu (JSON)" },
      ],
    },
    {
      name: "/LioDebug",
      yamlPath: "FAST_LIO · fast_lio/LioDebug",
      type: "fast_lio/LioDebug",
      defaultValue: "~10 Hz · ⚪ 仅 ROS",
      desc: "IKFoM 内部调试：IMU bias、重力向量、各阶段耗时 (ms)、降采样点数。",
      math: "debug_msg_.bias_acc/gyr  ·  debug_msg_.gravity  ·  debug_msg_.ICP_ms 等",
      refs: [
        { file: "FAST_LIO/include/use-ikfom.hpp", line: 12, desc: "state_ikfom: bg, ba, grav" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1562, desc: "debug_msg_ 填充 + pubLioDebug" },
      ],
    },
    {
      name: "/tf",
      yamlPath: "FAST_LIO · tf2_msgs/TFMessage",
      type: "tf2_msgs/TFMessage",
      defaultValue: "~10 Hz · ⚪ 仅 ROS",
      desc: "world → body 坐标系变换。tf::TransformBroadcaster 发布。",
      math: "transform = (state_point.pos, state_point.rot)  →  br.sendTransform",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 882, desc: "br.sendTransform(transform)" },
      ],
    },
  ],
  dataFlowLabel:
    "FAST-LIO → ROS topic → mqtt_bridge.py 条件订阅 (🔵) → Mosquitto → Bun relay → WS → 前端 React 组件渲染",
};

const C8_MEMORY: Category = {
  id: "memory",
  title: "进程内内存模型",
  icon: "🧠",
  summary:
    "FAST-LIO 和 incremental_map_publisher 如何在同一进程/跨节点间共享地图数据。没有 shared_ptr 或 MapInterface 抽象——都是裸全局变量或 ROS topic 序列化。",
  params: [
    {
      name: "ikdtree — FAST-LIO 全局增量地图",
      yamlPath: "laserMapping.cpp:176",
      type: "KD_TREE<PointType>",
      defaultValue: "栈上全局变量 · 进程内直访",
      desc: "laserMapping 节点内唯一的增量 KD-tree 地图。所有函数 (h_share_model, map_incremental, lasermap_fov_segment) 通过全局名 ikdtree 直接访问。不是 shared_ptr，无抽象接口。点云数据以 ROS topic 向外发布。",
      math: "PointType = pcl::PointXYZINormal\n字段: x, y, z, intensity, curvature, normal_x, normal_y, normal_z\n存储: 增量 KD-tree, 支持 Add_Points / Delete_Point_Boxes / Nearest_Search / flatten",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 176, desc: "KD_TREE<PointType> ikdtree;" },
        { file: "FAST_LIO/include/ikd-Tree/ikd_Tree.h", line: 1, desc: "KD_TREE 模板定义" },
        { file: "FAST_LIO/include/preprocess.h", line: 10, desc: "typedef pcl::PointXYZINormal PointType" },
      ],
    },
    {
      name: "prior_map_ds_cloud_ — 先验降采样副本",
      yamlPath: "laserMapping.cpp:167",
      type: "PointCloudXYZI::Ptr (shared_ptr)",
      defaultValue: "进程内 · prior_local_thread 独读",
      desc: "初始 PCD 地图的 VoxelGrid 降采样副本。独立于 ikdtree (全分辨率) 存储，专门供 prior_local_thread 做 radiusSearch 截球。通过 prior_kdtree_ (pcl::KdTreeFLANN) 索引。",
      math: "prior_map_ds_cloud_ = downSizePrior.filter(featsFromMap)\nprior_local_leaf_ 控制体素边长",
      refs: [
        { file: "FAST_LIO/src/laserMapping.cpp", line: 167, desc: "prior_map_ds_cloud_ 声明" },
        { file: "FAST_LIO/src/laserMapping.cpp", line: 1282, desc: "downSizePrior 降采样" },
      ],
    },
    {
      name: "GridMap — 滚动体素网格地图",
      yamlPath: "rolling_map_node.hpp",
      type: "GridMap · unordered_map<uint32_t,bool>",
      defaultValue: "RollingMapNode 成员 · 跨节点不可见",
      desc: "incremental_map_publisher 的体素占位网格。内部是 hash map，key 编码为 z*sx*sy+y*sx+x (32-bit)。由 RollingGridMapManager 管理 3×3×3=27 个滑动窗口 GridMap 实例。窗口滑动时自动 saveToFile/loadFromFile 持久化到磁盘。",
      math: "Key = z × size_x × size_y + y × size_x + x  (uint32_t)\n窗口大小: 3×3×3 = 27 GridMap\n持久化: /home/nv/.resource/map_files/<index>",
      refs: [
        { file: "incremental_map_publisher/include/rolling_map/grid_map.hpp", line: 1, desc: "GridMap 类定义" },
        { file: "incremental_map_publisher/include/rolling_map/rolling_grid_map_manager.hpp", line: 1, desc: "RollingGridMapManager" },
        { file: "incremental_map_publisher/include/rolling_map/rolling_map_node.hpp", line: 1, desc: "RollingMapNode 拥有 mapManager_" },
      ],
    },
    {
      name: "跨节点数据通路 (无指针共享)",
      yamlPath: "ROS topic + 磁盘文件",
      type: "sensor_msgs::PointCloud2 序列化",
      defaultValue: "无 shared_ptr · 无零拷贝",
      desc: "FAST-LIO → incremental_map_publisher 通过 /cloud_registered + /Odometry 两个 ROS topic 传递点云和位姿。GridMap 滑动窗口内通过 saveToFile/loadFromFile 持久化到 /home/nv/.resource/map_files/。不通过指针或共享内存跨节点传递地图数据。",
      math: "ikdtree → publish_frame_world() → /cloud_registered (PointCloud2) →\nrolling_map_publisher 订阅 → GridMap 插入点 → 发布 /communication/grid_PC_vec",
      refs: [
        { file: "incremental_map_publisher/launch/rolling_map_publisher.launch", line: 1, desc: "rolling_map_publisher 节点启动" },
        { file: "incremental_map_publisher/include/rolling_map/rolling_map_node.hpp", line: 1, desc: "订阅 /cloud_registered + /Odometry" },
      ],
    },
  ],
  dataFlowLabel: "全局变量 ikdtree / prior_map_ds_cloud_ (进程内) → ROS topic 序列化 → 其他节点 → GridMap 组织 → 磁盘持久化",
};

export const CATEGORIES: Category[] = [
  C1_COORD,
  C2_MAP,
  C3_PRIOR,
  C4_CPU,
  C5_AD,
  C6_MON,
  C7_TOPICS,
  C8_MEMORY,
];
