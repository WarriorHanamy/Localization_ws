import { useRef, useEffect, useMemo } from "react";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRosTopic } from "../hooks/useRosTopic";
import { usePointCloudPoints } from "../hooks/usePointCloud";
import type { PointCloudMsg } from "../lib/ros-types";

export function PointCloud(): React.JSX.Element {
  const msg = useRosTopic<PointCloudMsg>("/cloud_registered");
  const buffer = usePointCloudPoints(msg);
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    if (!buffer) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(buffer.positions, 3));
    return geo;
  }, [buffer]);

  if (!geometry) return null;

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.05}
        color="#00cc66"
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

const PRIOR_COLOR = "#729fcf";

export function PriorCloud(): React.JSX.Element {
  const msg = useRosTopic<PointCloudMsg>("/prior_local_cloud");
  const buffer = usePointCloudPoints(msg);

  const geometry = useMemo(() => {
    if (!buffer) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(buffer.positions, 3));
    return geo;
  }, [buffer]);

  if (!geometry) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.1}
        color={PRIOR_COLOR}
        sizeAttenuation
        transparent
        opacity={0.3}
        depthWrite={false}
      />
    </points>
  );
}
