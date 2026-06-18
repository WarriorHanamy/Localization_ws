import { useMemo } from "react";
import { useRosTopic } from "../hooks/useRosTopic";
import type { OdometryData, Quaternion } from "../lib/ros-types";
import * as THREE from "three";

function eulerFromQuaternion(q: Quaternion): THREE.Euler {
  const euler = new THREE.Euler();
  euler.setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  return euler;
}

interface PoseArrowProps {
  position: [number, number, number];
  rotation: THREE.Euler;
  color: string;
  length?: number;
  label?: string;
}

function PoseArrow({ position, rotation, color, length = 1.5 }: PoseArrowProps): React.JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), length, color, 0.3, 0.15]} />
      <mesh>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function OdometryArrow(): React.JSX.Element {
  const odom = useRosTopic<OdometryData>("/Odometry");

  const pose3d = useMemo(() => {
    if (!odom?.pose?.pose) return null;
    const p = odom.pose.pose;
    return {
      position: [p.position.x, p.position.y, p.position.z] as [number, number, number],
      rotation: eulerFromQuaternion(p.orientation),
    };
  }, [odom]);

  if (!pose3d) return null;

  return (
    <PoseArrow
      position={pose3d.position}
      rotation={pose3d.rotation}
      color="#ff5500"
      label="Odometry"
    />
  );
}

export function EkfArrow(): React.JSX.Element {
  const odom = useRosTopic<OdometryData>("/ekf_quat/ekf_odom");

  const pose3d = useMemo(() => {
    if (!odom?.pose?.pose) return null;
    const p = odom.pose.pose;
    return {
      position: [p.position.x, p.position.y, p.position.z] as [number, number, number],
      rotation: eulerFromQuaternion(p.orientation),
    };
  }, [odom]);

  if (!pose3d) return null;

  return (
    <PoseArrow
      position={pose3d.position}
      rotation={pose3d.rotation}
      color="#ff1900"
      length={2.0}
      label="EKF"
    />
  );
}
