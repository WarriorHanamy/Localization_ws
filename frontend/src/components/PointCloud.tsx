import { useMemo } from "react";
import * as THREE from "three";
import { useRosTopic } from "../hooks/useRosTopic";
import { usePointCloudPoints } from "../hooks/usePointCloud";
import type { PointCloudMsg } from "../lib/ros-types";

interface CloudProps {
  topic: string;
  color: string;
  size: number;
  opacity: number;
}

function ReusableCloud({ topic, color, size, opacity }: CloudProps): React.JSX.Element | null {
  const msg = useRosTopic<PointCloudMsg>(topic);
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
        size={size}
        color={color}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  );
}

export function PointCloud(): React.JSX.Element | null {
  return <ReusableCloud topic="/cloud_registered" color="#00cc66" size={0.05} opacity={0.9} />;
}

export function PriorCloud(): React.JSX.Element | null {
  return <ReusableCloud topic="/prior_local_cloud" color="#ff3322" size={0.08} opacity={0.5} />;
}

export function CombinedCloud(): React.JSX.Element | null {
  return <ReusableCloud topic="/cloud_registered_with_prior" color="#ff8811" size={0.06} opacity={0.7} />;
}
