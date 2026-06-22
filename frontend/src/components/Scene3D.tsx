import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { PointCloud, PriorCloud, CombinedCloud } from "./PointCloud";
import { OdometryArrow, EkfArrow } from "./OdometryArrow";
import { TrajectoryLine } from "./TrajectoryLine";

export function Scene3D(): React.JSX.Element {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 60, near: 0.01, far: 200 }}
        gl={{ antialias: true, logarithmicDepthBuffer: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#111"]} />

        {/* Lights */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />

        {/* Helpers */}
        <Grid
          cellSize={1}
          cellThickness={0.6}
          cellColor="#333"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#555"
          fadeDistance={50}
          infiniteGrid
        />
        <axesHelper args={[2]} />

        {/* Scene objects */}
        <TrajectoryLine />
        <OdometryArrow />
        <EkfArrow />
        <PriorCloud />
        <PointCloud />
        <CombinedCloud />

        {/* Controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
