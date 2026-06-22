export type V3D = [number, number, number];
export type M3D = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export interface ImuSample {
  ts: number;
  acc: V3D;
  gyr: V3D;
}

export interface CloudFrame {
  ts: number;
  count: number;
  points: Float32Array;
}

export interface OdometrySample {
  ts: number;
  pos: V3D;
  quat: [number, number, number, number];
}

export interface CpuSample {
  ts: number;
  average: number;
  cores: number[];
}

export interface PathSample {
  ts: number;
  poses: V3D[];
}

export interface Frame {
  ts: number;
  topic: string;
  data: unknown;
}

export function v3(x: number, y: number, z: number): V3D {
  return [x, y, z];
}

export function m3Identity(): M3D {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function v3Add(a: V3D, b: V3D): V3D {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3Sub(a: V3D, b: V3D): V3D {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function m3MulVec(m: M3D, v: V3D): V3D {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function m3MulM3(a: M3D, b: M3D): M3D {
  const r: M3D = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        r[i][j] += a[i][k] * b[k][j];
  return r;
}

export function m3Transpose(m: M3D): M3D {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export function v3DistSq(a: V3D, b: V3D): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function v3Norm(v: V3D): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
