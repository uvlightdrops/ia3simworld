import React from "react";
import { WorldState } from "../types/sim";

type ManagerSettings = {
  relicSpawnRate: number;
  lawProposeRate: number;
  econEventRate: number;
  artifactQuality: number;
};

export function RechtBoard({
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
      
      {/* Top Banner: Tribunal Territory Laws Summary */}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16 }}>⚖️ Tribunal Territory Laws Summary</span>
          <span style={{ fontSize: 11, background: "#334155", padding: "2px 8px", borderRadius: 10, color: "#94a3b8" }}>Weekly Negotiation (120 Ticks)</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "12px 16px", borderRadius: 8, border: "1px solid #334155" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>Grassland Usage:</span>
            <span style={{ fontSize: 14, fontWeight: "bold", color: state.grassPolicy === "protected" ? "#ef4444" : "#10b981" }}>
              {state.grassPolicy === "protected" ? "🚫🌾 Protected" : "🌾 Agriculture"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "12px 16px", borderRadius: 8, border: "1px solid #334155" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>Forest Usage:</span>
            <span style={{ fontSize: 14, fontWeight: "bold", color: state.forestPolicy === "timber" ? "#f59e0b" : "#10b981" }}>
              {state.forestPolicy === "timber" ? "🪓 Timber logging" : "🍓 Berries harvest"}
            </span>
          </div>
        </div>
        {state.activeLaws && state.activeLaws.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid #334155", paddingTop: 12 }}>
            <span style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6 }}>📜 Active System-wide AI Legislation:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {state.activeLaws.map((law, idx) => (
                <div key={idx} style={{ fontSize: 12, background: "#1e1b4b", color: "#a5b4fc", border: "1px solid #4338ca", padding: "6px 12px", borderRadius: 6 }}>
                  🔹 {law}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Intelligent CSS Grid Layout */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gridAutoFlow: "dense",
        gap: 20,
        alignItems: "start",
        paddingBottom: 16
      }}>
        
        {/* Card 1: Active Policies */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            ⚖️ Tribunal Court Active Policies
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px 0" }}>
            The legal courtroom negotiates territory usage once a week (every 120 ticks) based on resource scarcity and agent needs.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Grassland Policy</span>
                <strong style={{ fontSize: 14, color: state.grassPolicy === "protected" ? "#ef4444" : "#10b981" }}>
                  {state.grassPolicy === "protected" ? "🚫🌾 Protected (Farming Banned)" : "🌾 Agriculture (Farming Allowed)"}
                </strong>
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                {state.grassPolicy === "protected" 
                  ? "Agents are forbidden from planting new crop fields. Existing ones remain but cannot expand." 
                  : "Builders will dynamically cultivate and plant wheat crops on vacant grass tiles."
                }
              </div>
            </div>

            <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Forest Policy</span>
                <strong style={{ fontSize: 14, color: state.forestPolicy === "timber" ? "#f59e0b" : "#10b981" }}>
                  {state.forestPolicy === "timber" ? "🪓 Timber Logging Allowed" : "🍓 Reserved for Berries"}
                </strong>
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                {state.forestPolicy === "timber" 
                  ? "Builders and scouts chop down forest tiles for wood. This depletes forestry density." 
                  : "Forest is reserved exclusively for peaceful berry harvesting to prevent environmental decay."
                }
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Democratic Voting Tendencies */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🗳️ Democratic Voting Tendencies
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
              Agents dynamically change their legislative voting behaviors based on food scarcity, interest alignments, and active legislation.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
              <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Hunger/Scarcity Voting Stance</div>
                <strong style={{ fontSize: 13, color: "#10b981", display: "block", marginTop: 4 }}>🌾 Pro-Agriculture</strong>
              </div>
              <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Abundance/Wealth Voting Stance</div>
                <strong style={{ fontSize: 13, color: "#38bdf8", display: "block", marginTop: 4 }}>🚫🌾 Pro-Conservation</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Passed Legislation */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            📜 AI Legislation & Passed Acts
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px 0" }}>
            Active laws passed by the AI "Rechtssphäre" Game Manager are replicated below. Passed laws apply permanent modifiers to agent decisions.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {state.activeLaws && state.activeLaws.length > 0 ?
              state.activeLaws.map((law, idx) => {
                let desc = "Applies real-time modifications to agent decisions and resource sharing priorities.";
                if (law.includes("Equitable Resource Sharing")) {
                  desc = "Encourages agents to actively transfer resources to nearby hungry or low-energy citizens.";
                } else if (law.includes("Eco-Conservation")) {
                  desc = "Restricts high-speed logging and rewards scouts for protecting natural resource tiles.";
                } else if (law.includes("Builder Subsidy")) {
                  desc = "Grants 15% energy and resource boosts to builders actively cultivating crops.";
                }
                return (
                  <div key={idx} style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #4338ca", borderLeft: "4px solid #818cf8" }}>
                    <strong style={{ color: "#a5b4fc", fontSize: 14, display: "block", marginBottom: 4 }}>📜 {law}</strong>
                    <div style={{ fontSize: 12, color: "#cbd5e1" }}>{desc}</div>
                    <span style={{ display: "inline-block", marginTop: 8, background: "#1e1b4b", border: "1px solid #4338ca", color: "#818cf8", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>
                      Status: ACTIVE Modifier
                    </span>
                  </div>
                );
              })
            : (
              <div style={{ padding: 32, background: "#0f172a", border: "1px dashed #334155", borderRadius: 8, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                No system-wide laws are currently active. Wait for the Rechtssphäre manager to propose court bills!
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Executive Land Registry */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            🏢 Executive Land Registry (Katasteramt)
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px 0" }}>
            The administrative exekutive registers all explored sectors to synchronize territorial knowledge across the collective.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {state.discoveredSectors && state.discoveredSectors.length > 0 ? (
              state.discoveredSectors.map((sec, idx) => (
                <div key={idx} style={{ background: "#0f172a", padding: "8px 12px", borderRadius: 6, border: "1px solid #10b981", textAlign: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: "bold", color: "#10b981", display: "block" }}>🗺️ Sektor</span>
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>{sec}</span>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", padding: 16, background: "#0f172a", border: "1px dashed #334155", borderRadius: 8, textAlign: "center", color: "#64748b", fontSize: 12 }}>
                Only the starting Sector (0, 0) is registered. Send scouts or explore past limits to map more!
              </div>
            )}
          </div>
        </div>

        {/* Card 5: Rechtssphäre AI Admin Controls */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            ⚙️ Admin: Rechtssphäre AI Manager Settings
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                <span>Law Proposal Rate (Every X ticks):</span>
                <strong style={{ color: "#38bdf8" }}>{managerSettings.lawProposeRate} Ticks</strong>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={managerSettings.lawProposeRate}
                onChange={(e) => updateManagerSettings({ lawProposeRate: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: "#38bdf8" }}
              />
            </div>
          </div>
        </div>

        {/* Card 6: Rechtssphäre AI Thoughts */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🧠 Rechtssphäre AI Game Manager Thoughts
          </h3>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column-reverse", gap: 6 }}>
            {state.managerBThoughts && state.managerBThoughts.length > 0 ? (
              state.managerBThoughts.map((thought, idx) => (
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
