export interface RosHeader {
  seq: number;
  stamp: { secs: number; nsecs: number };
  frame_id: string;
}

export interface RosPoint {
  x: number;
  y: number;
  z: number;
}

export interface RosQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RosPose {
  position: RosPoint;
  orientation: RosQuaternion;
}

export interface RosTwist {
  linear: RosPoint;
  angular: RosPoint;
}

export interface RosOdometry {
  header: RosHeader;
  child_frame_id: string;
  pose: { pose: RosPose; covariance: number[] };
  twist: { twist: RosTwist; covariance: number[] };
}

export interface RosPath {
  header: RosHeader;
  poses: { header: RosHeader; pose: RosPose }[];
}

export interface RosPointField {
  name: string;
  offset: number;
  datatype: number;
  count: number;
}

export interface RosPointCloud2 {
  header: RosHeader;
  height: number;
  width: number;
  fields: RosPointField[];
  is_bigendian: boolean;
  point_step: number;
  row_step: number;
  data: number[];
  is_dense: boolean;
}

export interface RosImu {
  header: RosHeader;
  orientation: RosQuaternion;
  orientation_covariance: number[];
  angular_velocity: RosPoint;
  angular_velocity_covariance: number[];
  linear_acceleration: RosPoint;
  linear_acceleration_covariance: number[];
}

export interface LioDebug {
  header: RosHeader;
  laser_time: number;
  feats_time: number;
  matching_time: number;
  solve_time: number;
  prop_time: number;
  bias: RosPoint;
  feats: number;
  idx: number;
}

export interface CPUUsage {
  header: RosHeader;
  usage: number[];
}

export interface GridPC {
  header: RosHeader;
  origin: RosPoint;
  keys: number[];
}

export interface GridPCVec {
  header: RosHeader;
  grids: GridPC[];
}

export interface RCState {
  header: RosHeader;
  connected: boolean;
}

export interface RosbridgeMessage {
  op: string;
  topic?: string;
  type?: string;
  msg?: any;
  id?: string;
}
