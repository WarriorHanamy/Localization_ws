import { useMemo } from "react";
import type { PointCloudMsg } from "../lib/ros-types";

export interface PointCloudBuffer {
  positions: Float32Array;
  count: number;
}

export function usePointCloudPoints(msg: PointCloudMsg | null): PointCloudBuffer | null {
  return useMemo(() => {
    if (!msg || !msg.points || msg.count === 0) return null;
    return {
      positions: new Float32Array(msg.points),
      count: msg.count,
    };
  }, [msg]);
}
