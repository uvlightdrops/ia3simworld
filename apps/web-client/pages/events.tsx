import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { WorldState, initialState } from "../types/sim";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:17080";

export default function EventsPage() {
  const [state, setState] = useState<WorldState>(initialState);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventFeedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`${API}/api/state`);
        if (res.ok) {
          setState(await res.json());
        }
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && eventFeedRef.current) {
      eventFeedRef.current.scrollTop = eventFeedRef.current.scrollHeight;
    }
  }, [state.events, autoScroll]);

  return (
    <div style={{ 
      background: "#0f172a", 
      color: "#e2e8f0", 
      minHeight: "100vh", 
      fontFamily: "monospace", 
      padding: "20px",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
            📡 Live Event Feed
          </h1>
          <Link href="/" style={{ 
            background: "#1e293b", 
            border: "1px solid #334155", 
            color: "#38bdf8", 
            padding: "8px 16px", 
            borderRadius: 6, 
            textDecoration: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: "bold"
          }}>
            ← Back to World Map
          </Link>
        </div>

        {/* Stats Row */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(4, 1fr)", 
          gap: 12,
          marginBottom: 16
        }}>
          <div style={{ background: "#1e293b", border: "1px solid #334155", padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Tick</div>
            <div style={{ fontSize: 16, color: "#38bdf8", fontWeight: "bold" }}>{state.tick}</div>
          </div>
          <div style={{ background: "#1e293b", border: "1px solid #334155", padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Total Agents</div>
            <div style={{ fontSize: 16, color: "#10b981", fontWeight: "bold" }}>{state.agents?.length ?? 0}</div>
          </div>
          <div style={{ background: "#1e293b", border: "1px solid #334155", padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Total Events</div>
            <div style={{ fontSize: 16, color: "#f59e0b", fontWeight: "bold" }}>{state.events?.length ?? 0}</div>
          </div>
          <div style={{ background: "#1e293b", border: "1px solid #334155", padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Node</div>
            <div style={{ fontSize: 16, color: "#a78bfa", fontWeight: "bold" }}>{state.nodeId ?? "ia3-1"}</div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ 
          background: "#1e293b", 
          border: "1px solid #334155", 
          padding: 12, 
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input 
              type="checkbox" 
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Auto-scroll to latest events
          </label>
        </div>
      </div>

      {/* Event Feed */}
      <div 
        ref={eventFeedRef}
        style={{ 
          flex: 1,
          background: "#0f172a", 
          border: "2px solid #334155", 
          borderRadius: 8, 
          padding: 16,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 12
        }}
      >
        {state.events && state.events.length > 0 ? (
          state.events.map((event, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: "8px 12px", 
                background: "#1e293b", 
                borderRadius: 4, 
                borderLeft: "4px solid #38bdf8",
                color: "#cbd5e1",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>
                #{idx + 1}
              </div>
              {event}
            </div>
          ))
        ) : (
          <div style={{ 
            color: "#64748b", 
            fontStyle: "italic", 
            textAlign: "center", 
            margin: "auto",
            padding: 40
          }}>
            Waiting for simulation events...
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ marginTop: 12, fontSize: 10, color: "#64748b", textAlign: "center" }}>
        Events auto-refresh every 1 second. Latest events shown at bottom.
      </div>
    </div>
  );
}
