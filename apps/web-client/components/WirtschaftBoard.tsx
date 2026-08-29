import React, { type CSSProperties } from "react";
import { WorldState, agentColors } from "../types/sim";

type ManagerSettings = {
  relicSpawnRate: number;
  lawProposeRate: number;
  econEventRate: number;
  artifactQuality: number;
};

const headerLabel: CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export function WirtschaftBoard({
  state,
  managerSettings,
  updateManagerSettings,
  terrainStats,
  totalBerries,
  totalWaste,
}: {
  state: WorldState;
  managerSettings: ManagerSettings;
  updateManagerSettings: (settings: Partial<ManagerSettings>) => void;
  terrainStats: Record<string, number>;
  totalBerries: number;
  totalWaste: number;
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
        
        {/* Card 1: Resource Stockpile */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🌾 Wirtschaftsleben Resource Stockpile
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Grass Kacheln</div>
              <strong style={{ fontSize: 20 }}>{terrainStats.grass}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Lake/Water Kacheln</div>
              <strong style={{ fontSize: 20, color: "#0ea5e9" }}>{terrainStats.water}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Forest Kacheln</div>
              <strong style={{ fontSize: 20, color: "#10b981" }}>{terrainStats.forest}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Mountain/Rock Kacheln</div>
              <strong style={{ fontSize: 20, color: "#94a3b8" }}>{terrainStats.rock}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Homestead 🏡 Kacheln</div>
              <strong style={{ fontSize: 20, color: "#f97316" }}>{terrainStats.home}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={headerLabel}>Total Road 🛣️ Kacheln</div>
              <strong style={{ fontSize: 20, color: "#cbd5e1" }}>{terrainStats.road}</strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155", gridColumn: "span 2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={headerLabel}>Total Berries/Food in World</span>
                <strong style={{ color: "#10b981" }}>{totalBerries} units</strong>
              </div>
              <div style={{ background: "#1e293b", height: 10, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ background: "#10b981", width: `${Math.min(100, (totalBerries / ((terrainStats.forest || 1) * 100)) * 100)}%`, height: "100%" }} />
              </div>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155", gridColumn: "span 2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={headerLabel}>Total Waste / Garbage Piled up</span>
                <strong style={{ color: "#ef4444" }}>{totalWaste} units</strong>
              </div>
              <div style={{ background: "#1e293b", height: 10, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ background: "#ef4444", width: `${Math.min(100, (totalWaste / ((terrainStats.rock || 1) * 100)) * 100)}%`, height: "100%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Climate and weather disasters log */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            ☀️ Climate & Weather Disaster Log
          </h3>
          <div style={{ maxHeight: 220, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {state.events && state.events.filter(e => e.includes("Drought") || e.includes("Locust Swarm") || e.includes("Bumper Harvest")).length > 0 ?
              state.events
                .filter(e => e.includes("Drought") || e.includes("Locust Swarm") || e.includes("Bumper Harvest"))
                .map((event, idx) => (
                  <div key={idx} style={{ padding: "6px 10px", background: "#0f172a", borderRadius: 4, borderLeft: "3px solid #ef4444", color: "#cbd5e1" }}>
                    {event}
                  </div>
                ))
            : (
              <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>No physical climate or weather disasters recorded yet. Weather is currently stable.</div>
            )}
          </div>
        </div>

        {/* Card 3: Cooperation Agreements */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🤝 Cooperation Agreements (Wirtschaftliche Vereinbarungen)
          </h3>
          
          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #334155", marginBottom: 16 }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#38bdf8", fontSize: 14 }}>Cooperation Logic & Rules</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#cbd5e1", display: "flex", flexDirection: "column", gap: 8 }}>
              <li>
                <b>Socialize (Linger adjacent)</b>: When two agents with matching, highly intense interests meet, they can decide to socialise. They linger adjacent to each other for 15 ticks to share and transmute interests.
              </li>
              <li>
                <b>Mission (Joint Resource Exploration)</b>: Cooperative joint mission targeting the nearest forest layer to find, harvest, and exploration berries. They move together and complete the mission within 25 ticks.
              </li>
              <li>
                <b>Proximity Boost</b>: Agreement probability is boosted to <b>50%</b> (from 15%) when agents meet within 3 Kacheln of any Homestead (🏡).
              </li>
            </ul>
          </div>

          <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "#38bdf8" }}>Currently Active Agreements</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {state.agents.some(a => a.agreement) ? (
              state.agents
                .filter(a => a.agreement)
                .map((agent) => {
                  const partner = state.agents.find(a => a.id === agent.agreement?.partnerId);
                  const col1 = agentColors[agent.name] ?? "#3b82f6";
                  const col2 = partner ? (agentColors[partner.name] ?? "#3b82f6") : "#3b82f6";
                  return (
                    <div 
                      key={agent.id} 
                      style={{ 
                        background: "#0f172a", 
                        padding: 12, 
                        borderRadius: 8, 
                        border: "1px solid #334155",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: col1 }} />
                          <b>{agent.name}</b>
                          <span style={{ color: "#94a3b8" }}>and</span>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: col2 }} />
                          <b>{partner ? partner.name : agent.agreement?.partnerId}</b>
                        </div>
                        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                          Agreement Type: <span style={{ textTransform: "uppercase", color: "#38bdf8", fontWeight: "bold" }}>{agent.agreement?.type}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ background: "#1e1b4b", border: "1px solid #4338ca", color: "#818cf8", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                          ⏱ {agent.agreement?.ticksLeft} Ticks Left
                        </span>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div style={{ padding: 24, background: "#0f172a", border: "1px dashed #334155", borderRadius: 8, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                No active agreements in the world right now. Let the agents explore and socialize!
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Economy Taxonomy & Recipe Graph */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            📊 Goods Taxonomy & Production Graph (Halbzeuge & Rezepte)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ ...headerLabel, marginBottom: 8 }}>Güter-Kategorien (ECO / DAG Architecture)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ background: "#065f46", color: "#6ee7b7", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                  Rohstoffe (Tier 0)
                </span>
                <span style={{ background: "#1e40af", color: "#93c5fd", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                  Verarbeitet / Halbzeuge (Tier 1 & 2)
                </span>
                <span style={{ background: "#5b21b6", color: "#c084fc", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                  Kulturgut (Tier 3)
                </span>
                <span style={{ background: "#854d0e", color: "#fef08a", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: "bold" }}>
                  Abfall / Recyclables
                </span>
              </div>
            </div>

            <h4 style={{ margin: "6px 0 2px 0", color: "#38bdf8", fontSize: 13 }}>Verarbeitungs-Rezepte & Produktionsketten</h4>
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {state.recipes && state.recipes.length > 0 ? (
                state.recipes.map((recipe) => (
                  <div key={recipe.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#f8fafc", fontWeight: "bold", marginBottom: 4 }}>
                      <span>⚙️ {recipe.name}</span>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>⏱ {recipe.laborTicks} Ticks</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#cbd5e1" }}>
                      <span style={{ color: "#ef4444" }}>
                        In: {Object.entries(recipe.inputs).map(([k, v]) => `${v}x ${k}`).join(", ")}
                      </span>
                      <span>➔</span>
                      <span style={{ color: "#10b981" }}>
                        Out: {Object.entries(recipe.outputs).map(([k, v]) => `${v}x ${k}`).join(", ")}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "#64748b", fontStyle: "italic", fontSize: 12 }}>Lade Produktionsgraph...</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 5: Agent Inventories & Live Production */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            📦 Agent Inventories & Production Feed
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h4 style={{ margin: "0", color: "#38bdf8", fontSize: 13 }}>Agenten-Lagerbestände (Halbzeuge & Endprodukte)</h4>
            <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {state.agents && state.agents.length > 0 ? (
                state.agents.map((ag) => {
                  const inv = ag.inventory || {};
                  const invItems = Object.entries(inv).filter(([_, qty]) => qty > 0);
                  const color = agentColors[ag.name] ?? "#3b82f6";
                  return (
                    <div key={ag.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                        <strong style={{ color: "#f8fafc" }}>{ag.name}</strong>
                        <span style={{ color: "#94a3b8", fontSize: 11 }}>({ag.role})</span>
                      </div>
                      <div style={{ color: "#cbd5e1", fontSize: 11 }}>
                        {invItems.length > 0 ? (
                          invItems.map(([item, qty]) => `${item}: ${qty}`).join(" | ")
                        ) : (
                          <span style={{ color: "#64748b", fontStyle: "italic" }}>Inventar leer</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#64748b", fontStyle: "italic", fontSize: 12 }}>Keine Agenten geladen</div>
              )}
            </div>

            <h4 style={{ margin: "6px 0 0 0", color: "#38bdf8", fontSize: 13 }}>Produktions- & Verarbeitungs-Protokoll</h4>
            <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {state.events && state.events.filter(e => e.includes("[Produktion")).length > 0 ? (
                state.events.filter(e => e.includes("[Produktion")).map((ev, idx) => (
                  <div key={idx} style={{ padding: "4px 8px", background: "#0f172a", borderRadius: 4, borderLeft: "3px solid #10b981", color: "#e2e8f0" }}>
                    {ev}
                  </div>
                ))
              ) : (
                <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "10px 0" }}>Warte auf ersten Produktions-Tick...</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 6: Admin Settings */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            ⚙️ Admin: Wirtschaftsleben AI Manager Settings
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#cbd5e1", marginBottom: 6 }}>
                <span>Economic Event Rate (Every X ticks):</span>
                <strong style={{ color: "#38bdf8" }}>{managerSettings.econEventRate} Ticks</strong>
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={managerSettings.econEventRate}
                onChange={(e) => updateManagerSettings({ econEventRate: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: "#38bdf8" }}
              />
            </div>
          </div>
        </div>

        {/* Card 5: Manager Thoughts */}
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🧠 Wirtschaftsleben AI Game Manager Thoughts
          </h3>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column-reverse", gap: 6 }}>
            {state.managerCThoughts && state.managerCThoughts.length > 0 ? (
              state.managerCThoughts.map((thought, idx) => (
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
