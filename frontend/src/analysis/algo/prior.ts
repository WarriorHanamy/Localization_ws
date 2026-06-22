import { type V3D } from "./types";

/**
 * Simulate sphere-based prior cloud extraction.
 * Given a set of map points and a query position, return indices
 * of points within radius.  Matches what prior_local_thread does
 * with KdTree radiusSearch.
 */
export function extractSpherePoints(
  points: Float32Array,
  center: V3D,
  radius: number,
): { indices: number[]; count: number } {
  const indices: number[] = [];
  const rSq = radius * radius;
  for (let i = 0; i < points.length; i += 3) {
    const dx = points[i] - center[0];
    const dy = points[i + 1] - center[1];
    const dz = points[i + 2] - center[2];
    if (dx * dx + dy * dy + dz * dz <= rSq) {
      indices.push(i);
    }
  }
  return { indices, count: indices.length };
}

/**
 * Anomaly detection simulation.
 * Given IMU and LiDAR timestamps, detect timeouts.
 * Matches hardware_anomaly_detection() logic.
 */
export interface AnomalyConfig {
  timeout_imu: number;
  timeout_lidar: number;
}

export function detectAnomalies(
  imuTimestamps: number[],
  lidarTimestamps: number[],
  config: AnomalyConfig,
): { imuTimeout: boolean; lidarTimeout: boolean; latestLidarGap: number } {
  const now = lidarTimestamps.length > 0 ? lidarTimestamps[lidarTimestamps.length - 1] : 0;

  let imuTimeout = false;
  if (imuTimestamps.length > 0) {
    imuTimeout = now - imuTimestamps[imuTimestamps.length - 1] > config.timeout_imu;
  }

  let lidarTimeout = false;
  let latestLidarGap = 0;
  if (lidarTimestamps.length > 0) {
    latestLidarGap = now - lidarTimestamps[lidarTimestamps.length - 1];
    lidarTimeout = latestLidarGap > config.timeout_lidar;
  }

  return { imuTimeout, lidarTimeout, latestLidarGap };
}
