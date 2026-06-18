export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RosPose {
  position: Point3D;
  orientation: Quaternion;
}

export interface OdometryData {
  header: { stamp: { secs: number; nsecs: number }; frame_id: string };
  child_frame_id: string;
  pose: { pose: RosPose; covariance?: number[] };
  twist?: { twist: { linear: Point3D; angular: Point3D } };
}

export interface PathData {
  header: { frame_id: string };
  poses: { pose: RosPose }[];
}

export interface CPUUsageData {
  header: { stamp: { secs: number; nsecs: number } };
  usage: number[];
}

export interface RCStateData {
  header: { stamp: { secs: number; nsecs: number } };
  connected: boolean;
}

export interface PointCloudMsg {
  header: { stamp: { secs: number; nsecs: number }; frame_id: string };
  points: number[];
  count: number;
}

export interface ServerMessage {
  topic?: string;
  ts: number;
  data?: unknown;
  type?: string;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
