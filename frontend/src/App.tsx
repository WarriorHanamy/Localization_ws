import { useState, useEffect } from "react";
import { Scene3D } from "./components/Scene3D";
import { CpuGauge } from "./components/CpuGauge";
import { StatusBar } from "./components/StatusBar";
import { NavBar } from "./components/NavBar";
import { AnalysisPage } from "./analysis";
import { ReplayPage } from "./analysis/pages/ReplayPage";
import { ComparePage } from "./compare";
import { PipelineDocPage } from "./docs/PipelineDocPage";

type View = "dashboard" | "analysis" | "replay" | "compare" | "pipeline";

function useView(): View {
  const [view, setView] = useState<View>(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "analysis") return "analysis";
    if (h === "replay") return "replay";
    if (h === "compare") return "compare";
    if (h.startsWith("pipeline")) return "pipeline";
    return "dashboard";
  });
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "analysis") setView("analysis");
      else if (h === "replay") setView("replay");
      else if (h === "compare") setView("compare");
      else if (h.startsWith("pipeline")) setView("pipeline");
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

      {view === "compare" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ComparePage />
        </div>
      )}

      {view === "pipeline" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PipelineDocPage />
        </div>
      )}
    </div>
  );
}
