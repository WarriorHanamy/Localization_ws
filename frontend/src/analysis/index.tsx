import { useState, useRef, useEffect } from "react";
import { CATEGORIES } from "./data";
import { CategorySection } from "./CategorySection";

export function AnalysisPage() {
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].id);
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.id.replace("cat-", "");
            setActiveCat(id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    const sectionEls = sectionsRef.current?.querySelectorAll("section[id]");
    sectionEls?.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#111117",
        color: "#ccc",
        fontFamily: "'SF Mono','Fira Code','JetBrains Mono',monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Category sub-nav (sticky scroll-to) */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(17,17,23,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #222",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 40,
          overflow: "auto",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#556",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            marginRight: 12,
          }}
        >
          wxx /
        </span>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              const el = document.getElementById(`cat-${cat.id}`);
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            style={{
              background: activeCat === cat.id ? "#1e1e3a" : "transparent",
              border: activeCat === cat.id ? "1px solid #3a3a6a" : "1px solid transparent",
              borderRadius: 4,
              color: activeCat === cat.id ? "#bdf" : "#667",
              cursor: "pointer",
              fontSize: 12,
              padding: "4px 10px",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {cat.icon} {cat.title}
          </button>
        ))}
      </nav>

      {/* Title area */}
      <div
        style={{
          padding: "24px 48px 8px",
          borderBottom: "1px solid #1a1a2a",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "#def",
          }}
        >
          FAST-LIO wxx Parameters
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#889" }}>
          Custom modifications by the wxx developer — coordinate transforms, map
          management, prior local cloud publishing, CPU pinning, anomaly
          detection, and CPU monitoring.
        </p>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 16,
            fontSize: 11,
            color: "#667",
          }}
        >
          <span>6 categories</span>
          <span>
            {CATEGORIES.reduce((s, c) => s + c.params.length, 0)} parameters
          </span>
          <span>
            based on FAST_LIO (Livox MID360)
          </span>
        </div>
      </div>

      {/* Sections container */}
      <div ref={sectionsRef} style={{ padding: "0 48px 64px", flex: 1 }}>
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat.id}
            cat={cat}
            isActive={activeCat === cat.id}
          />
        ))}
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: "12px 48px",
          borderTop: "1px solid #1a1a2a",
          fontSize: 11,
          color: "#445",
          flexShrink: 0,
        }}
      >
        Generated from code analysis · Localization_ws · {new Date().toISOString().slice(0, 10)}
      </footer>
    </div>
  );
}
