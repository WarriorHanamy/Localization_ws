const ROOT = "FAST_LIO";

export interface CodeRef {
  file: string;
  line: number;
  desc: string;
  code?: string;
}

export interface BranchPoint {
  label: string;
  file: string;
  line: number;
  condition: string;
  slamCode: string;
  relocCode: string;
}

export interface PipelineStep {
  label: string;
  desc: string;
  slamOnly?: boolean;
  relocOnly?: boolean;
  mode?: "auto" | "manual" | "optional-auto";
}

export interface PipelineFlow {
  title: string;
  subtitle: string;
  steps: PipelineStep[];
}

export interface DataCompRow {
  structure: string;
  slam: string;
  reloc: string;
}

export interface TopicCompRow {
  topic: string;
  exists: "both" | "reloc_only" | "slam_only";
  desc: string;
}

export interface ParamClassItem {
  param: string;
  nature: "manual" | "auto" | "optional-auto";
  effect: string;
}

export interface ParamClassCat {
  title: string;
  nature: string;
  items: ParamClassItem[];
  note?: string;
}

export const PARAM_CLASSIFICATION: ParamClassCat[] = [
  {
    title: "REQUIRED (Manual)",
    nature: "manual",
    items: [
      { param: "Init_Body_pos_x/y/z", nature: "manual", effect: "位置初值 → GICP 收敛域。当前 launch 硬编码 0,0,0，机器人须在地图原点附近" },
      { param: "initial_map_pcd_name", nature: "manual", effect: "PCD 文件不存在 → 两个节点分别 exit(0)" },
      { param: "Lidar_wrt_Body_R / T", nature: "manual", effect: "vector 为空 → SIGSEGV（无默认保护）" },
      { param: "extrinsic_R / T", nature: "manual", effect: "vector 为空 → undefined behavior" },
    ],
    note: "这些参数没有合理默认值，错/缺 → 崩溃或收敛到错误位姿",
  },
  {
    title: "Auto Estimated",
    nature: "auto",
    items: [
      { param: "重力姿态 (gravity rotation)", nature: "auto", effect: "累积 50 帧 IMU → FromTwoVectors → Z 轴对齐，始终运行" },
      { param: "GICP 精配准", nature: "auto", effect: "从初值迭代收敛到 < 0.01m / 1deg, icp_mode 可选 5 种算法" },
    ],
    note: "算法自动计算，无需人工干预",
  },
  {
    title: "Auto (Optional, default OFF)",
    nature: "optional-auto",
    items: [
      { param: "ScanContext 粗位置", nature: "optional-auto", effect: "先验地图网格搜索 (10×10m, 1m step) → 最佳 XY + yaw; advanced_by_scan_context=true 启用" },
    ],
    note: "默认关闭。开启后可取代手工初值 Init_Body_pos，提供全局自动定位",
  },
];

export const BRANCH_POINTS: BranchPoint[] = [
  {
    label: "#1 订阅初始里程计",
    file: `${ROOT}/src/laserMapping.cpp`,
    line: 1248,
    condition: "initial_map_from_pcd_",
    slamCode: "// initial_map_from_pcd_ == false\n// lasermapping 不订阅 /initial_odom_for_lio\n// EKF 状态从 init_imu_pos 参数 (默认 0) 开始",
    relocCode: "if(initial_map_from_pcd_)\n    sub_initial_odom = nh.subscribe(\n        \"/initial_odom_for_lio\",\n        200000,\n        initial_odom_cbk);",
  },
  {
    label: "#2 PCD 初始化 ikd-Tree",
    file: `${ROOT}/src/laserMapping.cpp`,
    line: 1254,
    condition: "initial_map_from_pcd_",
    slamCode: "// ikdtree 保持 nullptr\n// 首帧 LIO 到达时由主循环构建:\nif(ikdtree.Root_Node == nullptr)\n    ikdtree.Build(feats_down_world->points);",
    relocCode: "// 加载 PCD → 过滤 NaN/Inf → 构建 ikd-Tree\npcl::readPCD(file_name, *featsFromMap);\n// 过滤 NaN/Inf 点\nvalid_points->push_back(pt);\nikdtree.Build(featsFromMap->points);\nstd::cout << \"Initialization succeeded!!!\";",
  },
  {
    label: "#3 阻塞等待初始位姿",
    file: `${ROOT}/src/laserMapping.cpp`,
    line: 1305,
    condition: "initial_map_from_pcd_",
    slamCode: "// 无阻塞，直接进入主循环\n// 继续执行 line 1324 的订阅初始化\n// 开始处理 LiDAR / IMU 数据",
    relocCode: "while(!have_initial_odom_) {\n    ros::spinOnce();\n    status = ros::ok();\n    if(!status) exit(0);\n    rate.sleep();\n}",
  },
  {
    label: "#4 initial_odom 回调",
    file: `${ROOT}/src/laserMapping.cpp`,
    line: 1060,
    condition: "have_initial_odom_ (仅 reloc 模式触发)",
    slamCode: "// initial_odom_cbk 永远不会被调用\n// have_initial_odom_ 始终保持 false\n// EKF 不从外部初值初始化",
    relocCode: "if(have_initial_odom_) return;\nhave_initial_odom_ = true;\np_imu->set_init_pos_rot(\n    Init_IMU_pos_, Init_IMU_rot_);",
  },
  {
    label: "#5 增量建图",
    file: `${ROOT}/src/laserMapping.cpp`,
    line: 1513,
    condition: "map_incremental_ (独立参数)",
    slamCode: "map_incremental();\n// 向从零增长的 ikd-Tree 添加新点\n// 无先验地图，所有体素均为新区域\n// 地图从 0 开始持续扩大",
    relocCode: "map_incremental();\n// 向已有先验点的 ikd-Tree 增量添加\n// 先验区域体素跳过 (ikd-Tree 判重)\n// 仅新区域被加入地图",
  },
];

export const SLAM_PIPELINE: PipelineFlow = {
  title: "Pure SLAM",
  subtitle: "从零建图定位",
  steps: [
    { label: "IMU 积分", desc: "从 init_imu_pos (默认 [0,0,0]) 开始积分，零初值" },
    { label: "EKF 预测", desc: "标准 FAST-LIO EKF 预测步骤" },
    { label: "首帧构建 ikd-Tree", desc: "ikdtree.Root_Node == nullptr → 第一帧扫描构建初始树" },
    { label: "ICP 配准", desc: "在 ikd-Tree 中搜索 5-NN，点面残差，地图从零递增" },
    { label: "map_incremental", desc: "向 ikd-Tree 添加新扫描点，地图持续生长" },
    { label: "保存新地图", desc: "退出时 ikdtree.flatten() → 保存 PCD" },
  ],
};

export const RELOC_PIPELINE: PipelineFlow = {
  title: "Reloc (先验地图模式)",
  subtitle: "先验地图 + 全局重定位",
  steps: [
    { label: "加载 PCD → ikd-Tree", desc: "读取 PCD 文件 → 过滤 NaN/Inf → ikdtree.Build()", relocOnly: true },
    { label: "订阅 /initial_odom_for_lio", desc: "注册回调，等待 initial_align 计算初值", relocOnly: true },
    { label: "重力对齐 (gravity)", desc: "IMU 加速度累积平均 → FromTwoVectors → 计算 Z 轴对齐旋转", relocOnly: true, mode: "auto" },
    { label: "初始位置 (Init_Body_pos)", desc: "从参数 wxx/initial_align/Init_Body_pos_* 读取 (launch 默认 0,0,0)", relocOnly: true, mode: "manual" },
    { label: "[可选] ScanContext 粗位置", desc: "先验地图网格搜索 (zone=10m, step=1m) → 最佳 XY + yaw, 需 advanced_by_scan_context=true", relocOnly: true, mode: "optional-auto" },
    { label: "GICP 精配准", desc: "从 Gravity+Init_pos → [ScanContext] → GICP/NDT/FastGICP 迭代收敛到 < 0.01m, 1deg", relocOnly: true, mode: "auto" },
    { label: "阻塞等待初值", desc: "while(!have_initial_odom_) 同步等待，不处理 LiDAR/IMU", relocOnly: true },
    { label: "EKF 用外部初值初始化", desc: "set_init_pos_rot(Init_IMU_pos_, Init_IMU_rot_)", relocOnly: true },
    { label: "ICP 配准 (有先验)", desc: "在已包含完整先验点的 ikd-Tree 中搜索，定位精度更高" },
    { label: "map_incremental", desc: "先验区域不重复添加，新区域增量加入" },
    { label: "prior_local 截球", desc: "后台线程以当前位置为球心 radiusSearch 截取局部先验点 → 发布 /prior_local_cloud", relocOnly: true },
    { label: "保存更新后地图", desc: "退出时保存包含增量变化的完整地图" },
  ],
};

export const DATA_COMPARISON: DataCompRow[] = [
  { structure: "ikdtree (全局地图)", slam: "从零构建，运行时增量添加", reloc: "从 PCD 预构建 (full resolution)" },
  { structure: "featsFromMap", slam: "仅调试用，不加载", reloc: "初始时加载整幅 PCD 点云" },
  { structure: "prior_map_ds_cloud_", slam: "不存在", reloc: "VoxelGrid 降采样后的先验图副本 (leaf 参数控制)" },
  { structure: "prior_kdtree_ (PCL KdTree)", slam: "不存在", reloc: "在降采样副本上建立，供后台截球线程 radiusSearch" },
  { structure: "prior_local_cache_", slam: "不存在", reloc: "后台线程缓存截球结果，主循环无锁读取发布" },
  { structure: "Init_IMU_pos_ / Init_IMU_rot_", slam: "来自参数 init_imu_pos (默认 0)", reloc: "来自 /initial_odom_for_lio 外部初值" },
  { structure: "have_initial_odom_", slam: "始终 false", reloc: "true (initial_odom_cbk 设置)" },
  { structure: "Nearest_Points (ICP 参考)", slam: "在自增长 ikd-Tree 中搜索", reloc: "在含先验图的 ikd-Tree 中搜索" },
];

export const TOPIC_COMPARISON: TopicCompRow[] = [
  { topic: "/Odometry", exists: "both", desc: "EKF 里程计输出" },
  { topic: "/cloud_registered", exists: "both", desc: "配准后当前帧点云 (绿色)" },
  { topic: "/prior_local_cloud", exists: "reloc_only", desc: "先验局部截球点云 (红色)" },
  { topic: "/cloud_registered_with_prior", exists: "reloc_only", desc: "当前帧 + 先验局部合并 (橙色)" },
  { topic: "/cpu_usage", exists: "both", desc: "CPU 占用率" },
  { topic: "/LioDebug", exists: "both", desc: "调试信息 (未 MQTT 桥接)" },
  { topic: "/initial_odom_for_lio", exists: "reloc_only", desc: "initial_align 发布的初值 (ROS only)" },
];
