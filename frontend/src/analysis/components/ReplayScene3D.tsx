import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useReplayTopic } from "../../hooks/useReplayTopic";
import { useMemo } from "react";
import * as THREE from "three";
import type { OdometryData, PathData, PointCloudMsg } from "../../lib/ros-types";

function ReplayPointCloud({
  topic,
  color,
  size,
  opacity,
}: {
  topic: string;
  color: string;
  size: number;
  opacity: number;
}) {
  const msg = useReplayTopic<PointCloudMsg>(topic);

  const geometry = useMemo(() => {
    if (!msg?.points || msg.count === 0) return null;
    const arr = new Float32Array(msg.points as number[]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [msg]);

  if (!geometry) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color={color}
        size={size}
        opacity={opacity}
        transparent
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function ReplayOdometryArrow({
  topic,
  color,
  length,
}: {
  topic: string;
  color: string;
  length: number;
}) {
  const odom = useReplayTopic<OdometryData>(topic);
  if (!odom?.pose) return null;

  const p = odom.pose.pose;
  const q = new THREE.Quaternion(
    p.orientation.x,
    p.orientation.y,
    p.orientation.z,
    p.orientation.w,
  );
  const euler = new THREE.Euler().setFromQuaternion(q);
  const pos: [number, number, number] = [
    p.position.x,
    p.position.y,
    p.position.z,
  ];

  return (
    <group position={pos} rotation={[euler.x, euler.y, euler.z]}>
      <arrowHelper
        args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), length, color]}
      />
      <mesh>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function ReplayTrajectory({ topic }: { topic: string }) {
  const path = useReplayTopic<PathData>(topic);

  const points = useMemo(() => {
    if (!path?.poses || path.poses.length < 2) return null;
    return path.poses.map(
      (p: any) => [p.position.x, p.position.y, p.position.z] as [number, number, number],
    );
  }, [path]);

  if (!points) return null;

  return (
    <Line
      points={points}
      color="#88ccff"
      opacity={0.6}
      transparent
      lineWidth={1}
    />
  );
}

export function ReplayScene3D() {
  return (
    <Canvas
      camera={{ position: [5, 5, 5], fov: 60 }}
      dpr={[1, 2]}
      style={{ background: "#111" }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-5, 0, 10]} intensity={0.4} />
      <Grid
        cellSize={1}
        sectionSize={5}
        fadeDistance={100}
        cellColor="#333"
        sectionColor="#555"
        infiniteGrid
      />
      <axesHelper args={[2]} />
      <ReplayPointCloud
        topic="/cloud_registered"
        color="#00cc66"
        size={0.05}
        opacity={0.9}
      />
      <ReplayPointCloud
        topic="/prior_local_cloud"
        color="#ff3322"
        size={0.08}
        opacity={0.5}
      />
      <ReplayPointCloud
        topic="/cloud_registered_with_prior"
        color="#ff8811"
        size={0.06}
        opacity={0.7}
      />
      <ReplayOdometryArrow
        topic="/Odometry"
        color="#ff5500"
        length={1.5}
      />
      <ReplayTrajectory topic="/path" />
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
