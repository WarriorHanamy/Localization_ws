import { Scene3D } from "./components/Scene3D";
import { CpuGauge } from "./components/CpuGauge";
import { StatusBar } from "./components/StatusBar";

export default function App(): React.JSX.Element {
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Scene3D />
      <CpuGauge />
      <StatusBar />
    </div>
  );
}
