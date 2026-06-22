import { useEffect, useState } from "react";
import { listSessions, deleteSession } from "../../store/SessionStore";
import type { SessionMeta } from "../../store/SessionStore";

interface SessionPickerProps {
  onSelect: (id: number) => void;
}

export function SessionPicker({ onSelect }: SessionPickerProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div style={{ color: "#667", fontSize: 14, textAlign: "center", padding: 48 }}>
        Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "#889",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          No recorded sessions yet.
        </p>
        <p style={{ fontSize: 12, color: "#667", lineHeight: 1.6 }}>
          Connect to the Jetson, open the Dashboard, and click
          <span style={{ color: "#acd" }}> Record </span>
          to capture a session. Then come back here to replay it.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: 16,
          fontWeight: 700,
          color: "#def",
        }}
      >
        Select a Session
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sessions.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#16161e",
              border: "1px solid #2a2a3a",
              borderRadius: 6,
              cursor: "pointer",
            }}
            onClick={() => onSelect(s.id)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#bcd",
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#667",
                  marginTop: 2,
                }}
              >
                {new Date(s.createdAt).toLocaleString()}
                {" · "}
                {s.frameCount} frames
                {" · "}
                {s.cloudCount} clouds
                {" · "}
                {Math.round(s.duration * 10) / 10}s
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSession(s.id).then(load);
              }}
              style={{
                background: "none",
                border: "1px solid #3a2a2a",
                borderRadius: 4,
                color: "#966",
                cursor: "pointer",
                fontSize: 11,
                padding: "2px 8px",
                fontFamily: "inherit",
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
