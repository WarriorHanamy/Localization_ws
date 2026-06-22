import { useRef, useEffect, useMemo } from "react";
import { useRosTopic } from "../hooks/useRosTopic";
import type { OdometryData } from "../lib/ros-types";
import * as THREE from "three";

const MAX_POINTS = 3000;

export function TrajectoryLine(): React.JSX.Element {
  const odom = useRosTopic<OdometryData>("/Odometry");
  const positionsRef = useRef<number[]>([]);
  const lineRef = useRef<THREE.Line>(null);

  // Accumulate trajectory positions
  useEffect(() => {
    if (!odom?.pose?.pose) return;
    const p = odom.pose.pose.position;
    positionsRef.current.push(p.x, p.y, p.z);

    if (positionsRef.current.length > MAX_POINTS * 3) {
      positionsRef.current = positionsRef.current.slice(-MAX_POINTS * 3);
    }

    if (lineRef.current) {
      const geo = lineRef.current.geometry as THREE.BufferGeometry;
      const arr = positionsRef.current;
      const pointCount = arr.length / 3;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;

      if (!pos || pos.count !== pointCount) {
        const nextPosition = new THREE.BufferAttribute(new Float32Array(arr), 3);
        geo.setAttribute("position", nextPosition);
        geo.setDrawRange(0, pointCount);
      } else {
        for (let i = 0; i < arr.length; i++) {
          pos.array[i] = arr[i];
        }
        pos.needsUpdate = true;
      }
      geo.computeBoundingSphere();
    }
  }, [odom]);

  const initialGeo = useMemo(() => {
    return new THREE.BufferGeometry();
  }, []);

  return (
    <line ref={lineRef} geometry={initialGeo}>
      <lineBasicMaterial color="#88ccff" linewidth={1} transparent opacity={0.6} />
    </line>
  );
}
