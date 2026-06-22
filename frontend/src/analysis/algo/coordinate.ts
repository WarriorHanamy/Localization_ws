import { type M3D, type V3D, m3MulVec } from "./types";

/**
 * Rotate a Float32Array of interleaved xyz points by matrix R.
 */
export function rotatePoints(points: Float32Array, R: M3D): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const p: V3D = [points[i], points[i + 1], points[i + 2]];
    const q = m3MulVec(R, p);
    out[i] = q[0];
    out[i + 1] = q[1];
    out[i + 2] = q[2];
  }
  return out;
}

/**
 * Apply full rigid transform: p' = R·p + T
 */
export function transformPoints(
  points: Float32Array,
  R: M3D,
  T: V3D,
): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const p: V3D = [points[i], points[i + 1], points[i + 2]];
    const q = m3MulVec(R, p);
    out[i] = q[0] + T[0];
    out[i + 1] = q[1] + T[1];
    out[i + 2] = q[2] + T[2];
  }
  return out;
}

/**
 * Reverse the rigid transform: p_orig = R^T · (p' - T)
 */
export function inverseTransformPoints(
  points: Float32Array,
  R: M3D,
  T: V3D,
): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const pp: V3D = [points[i] - T[0], points[i + 1] - T[1], points[i + 2] - T[2]];
    // R^T · pp (R is orthogonal, so inverse = transpose)
    const orig: V3D = [
      R[0][0] * pp[0] + R[1][0] * pp[1] + R[2][0] * pp[2],
      R[0][1] * pp[0] + R[1][1] * pp[1] + R[2][1] * pp[2],
      R[0][2] * pp[0] + R[1][2] * pp[1] + R[2][2] * pp[2],
    ];
    out[i] = orig[0];
    out[i + 1] = orig[1];
    out[i + 2] = orig[2];
  }
  return out;
}

/**
 * Rotate IMU acc/gyr by matrix R.
 * Matches what imu_cbk does: acc' = R·acc_raw, gyr' = R·gyr_raw
 */
export function rotateImu(
  acc: V3D,
  gyr: V3D,
  R: M3D,
): { acc: V3D; gyr: V3D } {
  return {
    acc: m3MulVec(R, acc),
    gyr: m3MulVec(R, gyr),
  };
}
