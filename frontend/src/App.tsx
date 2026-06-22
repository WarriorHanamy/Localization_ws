import { useState, useEffect } from "react";
import { Scene3D } from "./components/Scene3D";
import { CpuGauge } from "./components/CpuGauge";
import { StatusBar } from "./components/StatusBar";
import { NavBar } from "./components/NavBar";
import { AnalysisPage } from "./analysis";
import { ReplayPage } from "./analysis/pages/ReplayPage";

type View = "dashboard" | "analysis" | "replay";

function useView(): View {
  const [view, setView] = useState<View>(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "analysis") return "analysis";
    if (h === "replay") return "replay";
    return "dashboard";
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "analysis") setView("analysis");
      else if (h === "replay") setView("replay");
      else setView("dashboard");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return view;
}

export default function App(): React.JSX.Element {
  const view = useView();

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar view={view} />

      {view === "dashboard" && (
        <div style={{ flex: 1, position: "relative" }}>
          <Scene3D />
          <CpuGauge />
          <StatusBar />
        </div>
      )}

      {view === "replay" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ReplayPage />
        </div>
      )}

      {view === "analysis" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <AnalysisPage />
        </div>
      )}
    </div>
  );
}
