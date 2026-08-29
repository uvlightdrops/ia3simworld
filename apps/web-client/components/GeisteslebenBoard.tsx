import React from "react";
import { WorldState, agentColors } from "../types/sim";

type ManagerSettings = {
  relicSpawnRate: number;
  lawProposeRate: number;
  econEventRate: number;
  artifactQuality: number;
};

export function GeisteslebenBoard({
  state,
  managerSettings,
  updateManagerSettings,
}: {
  state: WorldState;
  managerSettings: ManagerSettings;
  updateManagerSettings: (settings: Partial<ManagerSettings>) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gridAutoFlow: "dense",
        gap: 20,
        alignItems: "start",
        paddingBottom: 16
      }}>
        {/* Card 1: Agent Interests Management */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            📖 Agent Intellectual Interests & Moods
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px 0" }}>
            The AI "Geistesleben" Manager oversees spiritual, artistic, and philosophical pursuits. Interests spread via social learning proximity infection.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {state.agents.map((agent) => {
              const c = agentColors[agent.name] ?? "#3b82f6";
              return (
                <div key={agent.id} style={{ background: "#0f172a", padding: 12, borderRadius: 8, borderLeft: `4px solid ${c}` }}>
                  <div style={{ fontWeight: "bold", fontSize: 14, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>{agent.name} ({agent.role})</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Mood: {agent.mood}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {agent.interests.map((interest) => (
                      <div key={interest.name} style={{ background: "#1e293b", border: "1px solid #334155", padding: "4px 8px", borderRadius: 6, fontSize: 12, width: "calc(50% - 4px)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span>{interest.name}</span>
                          <span style={{ fontWeight: "bold" }}>{interest.intensity}%</span>
                        </div>
                        <div style={{ background: "#0f172a", height: 4, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ background: c, width: `${interest.intensity}%`, height: "100%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 2: Relics and Symbols */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            ✨ Geistesleben Ancient Relics & Symbols
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 12px 0" }}>
            The Geistesleben Manager periodically spawns ancient relics on grass tiles (indicated as 📖 / spiritual symbol). Standing adjacent to relics inspires philosophy.
          </p>
          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #334155", fontSize: 13, lineHeight: "1.5" }}>
            💡 <b>Social Learning Rule:</b> When agents with intense interests meet (distance &lt;= 1.5), they instantly teach each other their interests, unlocking and spreading knowledge across settlements.
          </div>
        </div>

        {/* Card 3: Social Learning Log */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            💡 Intellectual Infection Logs
          </h3>
          <div style={{ maxHeight: 220, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {state.events && state.events.filter(e => e.includes("learned about") || e.includes("absorbed the ancient relic")).length > 0 ?
              state.events
                .filter(e => e.includes("learned about") || e.includes("absorbed the ancient relic"))
                .map((event, idx) => (
                  <div key={idx} style={{ padding: "6px 10px", background: "#0f172a", borderRadius: 4, borderLeft: "3px solid #eab308", color: "#cbd5e1" }}>
                    {event}
                  </div>
                ))
            : (
              <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>Waiting for intellectual discoveries and social learning contagions...</div>
            )}
          </div>
        </div>

        {/* Card 4: Geistesleben Admin Settings */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            ⚙️ Admin: Geistesleben AI Manager Settings
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                <span>Relic Spawn Rate (Every X ticks):</span>
                <strong style={{ color: "#38bdf8" }}>{managerSettings.relicSpawnRate} Ticks</strong>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={managerSettings.relicSpawnRate}
                onChange={(e) => updateManagerSettings({ relicSpawnRate: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: "#38bdf8" }}
              />
            </div>
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                <span>Artifact Quality Level:</span>
                <strong style={{ color: "#38bdf8" }}>{managerSettings.artifactQuality}%</strong>
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={managerSettings.artifactQuality}
                onChange={(e) => updateManagerSettings({ artifactQuality: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: "#38bdf8" }}
              />
            </div>
          </div>
        </div>

        {/* Card 5: Geistesleben AI Thoughts Stream */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🧠 Geistesleben AI Game Manager Thoughts
          </h3>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column-reverse", gap: 6 }}>
            {state.managerAThoughts && state.managerAThoughts.length > 0 ? (
              state.managerAThoughts.map((thought, idx) => (
                <div key={idx} style={{ padding: "8px 12px", background: "#0f172a", borderRadius: 6, borderLeft: "3px solid #38bdf8", color: "#e2e8f0" }}>
                  {thought}
                </div>
              ))
            ) : (
              <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "10px 0" }}>No thoughts recorded yet. Let the tick cycle begin.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
