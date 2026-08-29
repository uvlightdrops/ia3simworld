import React from "react";
import { WorldState, agentColors, API } from "../types/sim";
import { useI18n } from "../context/I18nContext";
import { DomainSettingsBoard } from "./DomainSettingsBoard";

type Settings = {
  riverWidth: number;
  lakesDensity: number;
  berriesDensity: number;
  tickRateMs: number;
};

type ManagerSettings = {
  relicSpawnRate: number;
  lawProposeRate: number;
  econEventRate: number;
  artifactQuality: number;
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaMode: string;
  ollamaTimeoutMs: number;
};

export function AdminBoard({
  state,
  settings,
  updateSettings,
  managerSettings,
  updateManagerSettings,
  connectedRemoteURL,
  ownNodeName,
  regenerate,
  triggerScenario,
  remoteURL,
  setRemoteURL,
  connectMultiplayer,
  selectedAdminAgent,
  setSelectedAdminAgent,
  showMapTooltip,
  setShowMapTooltip,
  setActiveTab,
}: {
  state: WorldState;
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;
  managerSettings: ManagerSettings;
  updateManagerSettings: (settings: Partial<ManagerSettings>) => void;
  connectedRemoteURL: string;
  ownNodeName: string;
  regenerate: () => void;
  triggerScenario: () => void;
  remoteURL: string;
  setRemoteURL: (url: string) => void;
  connectMultiplayer: (url: string) => void;
  selectedAdminAgent: string | null;
  setSelectedAdminAgent: (id: string | null) => void;
  showMapTooltip?: boolean;
  setShowMapTooltip?: (show: boolean) => void;
  setActiveTab?: (tab: any) => void;
}) {
  const { t } = useI18n();
  const [showRegenModal, setShowRegenModal] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<string | null>(null);
  const [osmStatus, setOsmStatus] = React.useState<string | null>(null);

  const handleImportOSM = async () => {
    try {
      const res = await fetch(`${API}/api/control/import-osm`, { method: "POST" });
      if (res.ok) setOsmStatus("✅ OSM-Geodaten Augsburg erfolgreich importiert!");
      else setOsmStatus("❌ Fehler beim OSM Import");
    } catch (e) {
      setOsmStatus("❌ Serverfehler beim Import");
    }
    setTimeout(() => setOsmStatus(null), 3000);
  };

  const handleSaveGame = async () => {
    try {
      const res = await fetch(`${API}/api/control/save-game`, { method: "POST" });
      if (res.ok) setSaveStatus("✅ Spielstand erfolgreich gespeichert!");
      else setSaveStatus("❌ Fehler beim Speichern");
    } catch (e) {
      setSaveStatus("❌ Serverfehler beim Speichern");
    }
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleLoadGame = async () => {
    try {
      const res = await fetch(`${API}/api/control/load-game`, { method: "POST" });
      if (res.ok) setSaveStatus("✅ Spielstand erfolgreich geladen!");
      else setSaveStatus("❌ Fehler beim Laden");
    } catch (e) {
      setSaveStatus("❌ Serverfehler beim Laden");
    }
    setTimeout(() => setSaveStatus(null), 3000);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
      {/* Admin Subnav Header */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, borderBottom: "1px solid #334155", paddingBottom: 10 }}>
        <button
          onClick={() => setActiveTab && setActiveTab("admin")}
          style={{
            background: "#38bdf8",
            color: "#0f172a",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: "bold",
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(56, 189, 248, 0.25)"
          }}
        >
          ⚙️ Allgemein & Landschaft
        </button>
        <button
          onClick={() => setActiveTab && setActiveTab("maps")}
          style={{
            background: "#1e293b",
            color: "#cbd5e1",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: "bold",
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          🌐 Kartenmanagement & Quellen
        </button>
        <button
          onClick={() => {
            const agentCard = document.getElementById("admin-agent-inspector");
            if (agentCard) agentCard.scrollIntoView({ behavior: "smooth" });
          }}
          style={{
            background: "#1e293b",
            color: "#cbd5e1",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "8px 14px",
            fontWeight: "bold",
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          👥 Agentenprofile & Inspektor
        </button>
      </div>

      {/* Intelligent CSS Grid Layout for Admin Control Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gridAutoFlow: "dense",
        gap: 20,
        alignItems: "start",
        paddingBottom: 16
      }}>
        {/* Card: Domain Activity Governor (Resource Control) */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #7c3aed", gridColumn: "1 / -1" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#a78bfa", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            🎛️ Domain-Aktivitätssteuerung
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontWeight: 400 }}>
              Server-Ressourcen schonen — Stufen: aus / eingeschränkt / voll
            </span>
          </h3>
          <DomainSettingsBoard />
        </div>

        {/* Card 0: Background Tasks & Service Status */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            ⚙️ Background Tasks & Services
          </h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#94a3b8" }}>
            Echtzeit-Überwachung der Hintergrunddienste, Tick-Engine, Mesa gRPC-Agentenlogik und KI-Knoten.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: state.running ? "#10b981" : "#ef4444", boxShadow: state.running ? "0 0 8px #10b981" : "none" }} />
                <div>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>Sim Tick Engine Loop</strong>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Authoritative Go world-sim simulation tick</div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: "bold", background: state.running ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)", color: state.running ? "#10b981" : "#ef4444", padding: "3px 8px", borderRadius: 6, border: state.running ? "1px solid #10b981" : "1px solid #ef4444" }}>
                #{state.tick} ({state.running ? "ACTIVE" : "PAUSED"})
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                <div>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>Mesa Agent Logic Service</strong>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Python Mesa Framework via gRPC :50051</div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: "bold", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", padding: "3px 8px", borderRadius: 6, border: "1px solid #10b981" }}>
                ONLINE (gRPC :50051)
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: managerSettings.ollamaEnabled ? "#10b981" : "#f59e0b" }} />
                <div>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>Ollama KI Provider</strong>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{managerSettings.ollamaBaseUrl} ({managerSettings.ollamaModel})</div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: "bold", background: managerSettings.ollamaEnabled ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)", color: managerSettings.ollamaEnabled ? "#10b981" : "#f59e0b", padding: "3px 8px", borderRadius: 6, border: managerSettings.ollamaEnabled ? "1px solid #10b981" : "1px solid #f59e0b" }}>
                {managerSettings.ollamaEnabled ? managerSettings.ollamaMode : "Deaktiviert"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#38bdf8" }} />
                <div>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>Federated Sector Shards</strong>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Aktive Cluster-Sektoren</div>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: "bold", background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", padding: "3px 8px", borderRadius: 6, border: "1px solid #38bdf8" }}>
                {state.discoveredSectors?.length || 1} Sektor(en)
              </span>
            </div>
          </div>
        </div>

        {/* Card 0.2: System & Engine Meta & Savegame */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            🖥️ System & World Engine Meta
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>World Dimensions</div>
              <strong style={{ fontSize: 16, color: "#e2e8f0" }}>
                {state.worldSize ? `${state.worldSize.width}x${state.worldSize.height}` : "256x256"}
              </strong>
            </div>
            <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155" }}>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Image Version</div>
              <strong style={{ fontSize: 16, color: "#38bdf8" }}>v1.0.78</strong>
            </div>
          </div>

          <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Map Creation Timestamp (Erstellungszeit)</div>
            <strong style={{ fontSize: 13, color: "#f59e0b" }}>
              {state.createdAt ? new Date(state.createdAt).toLocaleString("de-DE") : "Initial Spawn"}
            </strong>
          </div>

          <div style={{ borderTop: "1px solid #334155", paddingTop: 12, marginTop: 12 }}>
            <h4 style={{ margin: "12px 0 8px 0", fontSize: 13, color: "#cbd5e1" }}>💾 Singleplayer Savegame Persistence</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveGame}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                💾 Save Game
              </button>
              <button
                onClick={handleLoadGame}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                📂 Load Game
              </button>
            </div>
            {saveStatus && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#38bdf8", textAlign: "center", fontWeight: "bold" }}>
                {saveStatus}
              </div>
            )}
          </div>
        </div>

        {/* Card 0.5: OSM Geodata & GraphLang Federation */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            🗺️ Real-World Geodata (OSM) & Brain-Nodes
          </h3>
          <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#94a3b8" }}>
            Importiere reale Vektor- & Höhendaten (OpenStreetMap Augsburg/Bayern) und überwache dezentrale Python Brain-Nodes sowie GraphLang Wissensgraphen.
          </p>

          <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Center GPS Position & Status</div>
            <strong style={{ fontSize: 13, color: state.osmDataLoaded ? "#10b981" : "#38bdf8" }}>
              {state.centerLatLon || "48.3689° N, 10.8978° E (Augsburg)"}
            </strong>
          </div>

          <button
            onClick={handleImportOSM}
            style={{
              width: "100%",
              padding: "10px",
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: 12,
              marginBottom: 10
            }}
          >
            🗺️ Import OpenStreetMap Geodata (Augsburg Preset)
          </button>

          {setActiveTab && (
            <button
              onClick={() => setActiveTab("maps")}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#0f172a",
                color: "#38bdf8",
                border: "1px solid #38bdf8",
                borderRadius: 6,
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: 12,
                marginBottom: 12
              }}
            >
              🌐 Detailed Map Management & Sources Board ➔
            </button>
          )}
          {osmStatus && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#10b981", textAlign: "center", fontWeight: "bold" }}>
              {osmStatus}
            </div>
          )}

          <div style={{ borderTop: "1px solid #334155", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>
              <span>GraphLang Edges: <b>{state.graphEdges?.length ?? 0}</b></span>
              <span>Brain Nodes: <b>{state.brainNodes?.length ?? 0} Active</b></span>
            </div>
          </div>
        </div>
        
        {/* Card 0.8: UI & Map Display Settings (Floating Tooltip Toggle) */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            {t.admin.uiSettingsTitle}
          </h3>
          <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#94a3b8" }}>
            {t.admin.tooltipSettingDesc}
          </p>

          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: "#f8fafc", display: "flex", alignItems: "center", gap: 6 }}>
                  {t.admin.tooltipSettingTitle}
                </strong>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {t.admin.tooltipSettingDesc}
                </div>
              </div>
              <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!showMapTooltip}
                  onChange={(e) => setShowMapTooltip?.(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    cursor: "pointer",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: showMapTooltip ? "#10b981" : "#475569",
                    transition: "0.2s",
                    borderRadius: 24,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      content: '""',
                      height: 18, width: 18,
                      left: showMapTooltip ? 22 : 3,
                      bottom: 3,
                      backgroundColor: "white",
                      transition: "0.2s",
                      borderRadius: "50%",
                    }}
                  />
                </span>
              </label>
            </div>
            <div style={{ fontSize: 11, color: showMapTooltip ? "#10b981" : "#eab308", fontWeight: "bold", borderTop: "1px dashed #334155", paddingTop: 8, marginTop: 8 }}>
              {showMapTooltip
                ? t.admin.tooltipActive
                : t.admin.tooltipDisabled}
            </div>
          </div>
        </div>

        {/* Card 1: Simulation & Landscape Settings */}
        {!connectedRemoteURL && ownNodeName === "ia3" && (
          <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
              ⚙️ Simulation & Landscape Settings
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4, fontWeight: "bold" }}>⚡ Simulation Speed (Tick Rate MS)</label>
                <input 
                  type="range" 
                  min="200" 
                  max="4000" 
                  step="100" 
                  value={settings.tickRateMs ?? 2000} 
                  onChange={(e) => updateSettings({ tickRateMs: parseInt(e.target.value) })}
                  style={{ width: "100%", accentColor: "#eab308" }} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  <span>Fast (200ms)</span>
                  <span style={{ color: "#eab308" }}>Current: <b>{settings.tickRateMs ?? 2000}ms</b></span>
                  <span>Slow (4000ms)</span>
                </div>
              </div>

              <hr style={{ borderColor: "#334155", margin: "4px 0" }} />

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4 }}>River Width (Flussbreite)</label>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value={settings.riverWidth} 
                  onChange={(e) => updateSettings({ riverWidth: parseInt(e.target.value) })}
                  style={{ width: "100%", accentColor: "#38bdf8" }} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                  <span>Narrow (1)</span>
                  <span>Current: <b>{settings.riverWidth}</b></span>
                  <span>Wide (5)</span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Lake Density (Seen-Dichte Threshold)</label>
                <input 
                  type="range" 
                  min="0.10" 
                  max="0.35" 
                  step="0.01" 
                  value={settings.lakesDensity} 
                  onChange={(e) => updateSettings({ lakesDensity: parseFloat(e.target.value) })}
                  style={{ width: "100%", accentColor: "#38bdf8" }} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                  <span>Fewer Lakes (0.10)</span>
                  <span>Current: <b>{settings.lakesDensity}</b></span>
                  <span>More Lakes (0.35)</span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Wildberry Density (Forest Fruit Probability)</label>
                <input 
                  type="range" 
                  min="0.05" 
                  max="0.50" 
                  step="0.01" 
                  value={settings.berriesDensity} 
                  onChange={(e) => updateSettings({ berriesDensity: parseFloat(e.target.value) })}
                  style={{ width: "100%", accentColor: "#38bdf8" }} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                  <span>Scarce (0.05)</span>
                  <span>Current: <b>{Math.round(settings.berriesDensity * 100)}%</b></span>
                  <span>Abundant (0.50)</span>
                </div>
              </div>

              <button 
                onClick={() => setShowRegenModal(true)} 
                style={{ 
                  marginTop: 8, 
                  padding: "10px", 
                  background: "#0ea5e9", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: 6, 
                  fontWeight: "bold", 
                  cursor: "pointer",
                  transition: "background 0.15s ease" 
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#0284c7")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#0ea5e9")}
              >
                🔄 Save & Regenerate Landscape
              </button>
            </div>
          </div>
        )}

        {/* Card 2: Ollama KI Provider & GameMaster Settings */}
        {!connectedRemoteURL && ownNodeName === "ia3" && (
          <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              🦙 Ollama KI Provider & GameMaster KIs
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#94a3b8" }}>
              Anbindung des lokalen Ollama LLM-Servers für die 3 GameMaster-KIs (Geistesleben, Rechtssphäre, Wirtschaftsleben). Fällt bei Fehlern automatisch auf regelbasierte Logik zurück.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155" }}>
                <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: "bold" }}>Ollama Provider Status</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: managerSettings.ollamaEnabled ? "#10b981" : "#ef4444" }}>
                  <input
                    type="checkbox"
                    checked={managerSettings.ollamaEnabled}
                    onChange={(e) => updateManagerSettings({ ollamaEnabled: e.target.checked })}
                  />
                  <b>{managerSettings.ollamaEnabled ? "Aktiviert (Ollama)" : "Deaktiviert (Regel-Fallback)"}</b>
                </label>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4, fontWeight: "bold" }}>Ollama Betriebsmodus</label>
                <select
                  value={managerSettings.ollamaMode}
                  onChange={(e) => updateManagerSettings({ ollamaMode: e.target.value })}
                  style={{ width: "100%", padding: "8px", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, fontSize: 13 }}
                >
                  <option value="thoughts_only">Nur Gedanken (Generiert KI-Gedanken-Stream)</option>
                  <option value="full_decisions">Vollständig (Gedanken + KI-Entscheidungen für Gesetze/Events)</option>
                  <option value="disabled">Deaktiviert (Rein Regelbasiert)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4, fontWeight: "bold" }}>Ollama Base URL</label>
                <input
                  type="text"
                  value={managerSettings.ollamaBaseUrl}
                  onChange={(e) => updateManagerSettings({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  style={{ width: "100%", padding: "8px", background: "#0f172a", color: "#38bdf8", border: "1px solid #334155", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4, fontWeight: "bold" }}>Ollama Modell (für alle 3 GameMaster-KIs)</label>
                <input
                  type="text"
                  value={managerSettings.ollamaModel}
                  onChange={(e) => updateManagerSettings({ ollamaModel: e.target.value })}
                  placeholder="llama3.2:latest"
                  style={{ width: "100%", padding: "8px", background: "#0f172a", color: "#eab308", border: "1px solid #334155", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4 }}>Timeout (ms)</label>
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  step="500"
                  value={managerSettings.ollamaTimeoutMs}
                  onChange={(e) => updateManagerSettings({ ollamaTimeoutMs: parseInt(e.target.value) || 8000 })}
                  style={{ width: "100%", padding: "8px", background: "#0f172a", color: "#fff", border: "1px solid #334155", borderRadius: 6, fontSize: 13 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Card 3: Collective Scenario Engine */}
        {!connectedRemoteURL && ownNodeName === "ia3" && (
          <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 14px 0", color: "#eab308", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              🎭 Collective Scenario Engine
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#94a3b8" }}>
              Trigger and orchestrate temporary, civilization-wide scenarios. AI agents will pause their individual behaviors to collectively coordinate on these special historical events.
            </p>

            {state.activeScenario ? (
              <div style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#eab308" }}><b>Scenario:</b> Autumn Solstice Festival 🍂</span>
                  <span style={{ color: "#a1a1aa", textTransform: "capitalize" }}><b>Phase:</b> {state.scenarioState}</span>
                </div>
                <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: "1.4" }}>
                  {state.scenarioState === "gathering" && "Status: AI founders are pooling resources and traveling to the celebration grounds."}
                  {state.scenarioState === "active" && `Status: Celebrating! Burning bonfire, music, feasting. (${state.scenarioTicksLeft} Ticks Left)`}
                  {state.scenarioState === "dispersing" && "Status: Celebration completed. AI founders are packing up and heading back home."}
                </div>
                <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                  <div style={{
                    height: "100%",
                    background: "#eab308",
                    width: state.scenarioState === "gathering" ? "33%" : state.scenarioState === "active" ? `${((state.scenarioTicksLeft || 1) / 24) * 100}%` : "80%",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#0f172a", padding: 10, borderRadius: 8, border: "1px solid #334155" }}>
                  <span style={{ fontSize: 24 }}>🍂</span>
                  <div>
                    <b style={{ color: "#f97316", fontSize: 13 }}>Autumn Solstice Festival</b>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Duration: 24h • Type: Collective Gathering</div>
                  </div>
                </div>
                <button
                  onClick={triggerScenario}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#eab308",
                    color: "#000",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "background 0.15s ease"
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#ca8a04")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#eab308")}
                >
                  🎉 Trigger Festival Scenario
                </button>
              </div>
            )}
          </div>
        )}

        {/* Card 4: Multiplayer / Shared World Connection */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
            🌍 Multiplayer & Shared World
          </h3>
          <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#94a3b8" }}>
            Connect to another cluster instance to play in a shared world. The current instance will fetch and control state from the remote host.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#cbd5e1", marginBottom: 4 }}>Remote API Gateway URL</label>
              <input 
                type="text" 
                placeholder="e.g. http://localhost:18080" 
                value={remoteURL} 
                onChange={(e) => setRemoteURL(e.target.value)}
                style={{ 
                  width: "100%", 
                  background: "#0f172a", 
                  border: "1px solid #475569", 
                  borderRadius: 6, 
                  padding: "8px 10px", 
                  color: "#f8fafc", 
                  fontSize: 13,
                  boxSizing: "border-box"
                }} 
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button 
                onClick={() => connectMultiplayer(remoteURL)} 
                style={{ 
                  flex: 1,
                  padding: "8px 12px", 
                  background: "#10b981", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: 6, 
                  fontWeight: "bold", 
                  cursor: "pointer",
                  fontSize: 13,
                  transition: "background 0.15s ease" 
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}
              >
                Join Shared World
              </button>
              
              {connectedRemoteURL && (
                <button 
                  onClick={() => connectMultiplayer("")} 
                  style={{ 
                    padding: "8px 12px", 
                    background: "#ef4444", 
                    color: "#fff", 
                    border: "none", 
                    borderRadius: 6, 
                    fontWeight: "bold", 
                    cursor: "pointer",
                    fontSize: 13,
                    transition: "background 0.15s ease" 
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#dc2626")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#ef4444")}
                >
                  Disconnect
                </button>
              )}
            </div>

            <div style={{ fontSize: 11, color: connectedRemoteURL ? "#10b981" : "#94a3b8", marginTop: 4 }}>
              Status: {connectedRemoteURL ? (
                <span>Connected to <b>{connectedRemoteURL}</b> (Shared World Mode)</span>
              ) : (
                <span>Single Player Mode (Hosting Local World)</span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* AGENT ADMINISTRATION, PROFILES & CHRONICLE HISTORY */}
      <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155", marginTop: 24 }}>
        <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          👤 Agent Administration & Profiles
        </h3>
        <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#94a3b8" }}>
          Oversee and monitor all active agents. Click an agent to view their deep profile stats, intellectual interest profiles, and complete chronological action histories.
        </p>
        
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24 }}>
          
          {/* Agent List (Left column) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#0f172a", padding: 12, borderRadius: 8, maxHeight: 420, overflowY: "auto", border: "1px solid #334155" }}>
            {state.agents && state.agents.length > 0 ? (
              state.agents.map((agent) => {
                const c = agentColors[agent.name] ?? "#3b82f6";
                const isSel = selectedAdminAgent === agent.id;
                return (
                  <div 
                    key={agent.id} 
                    onClick={() => setSelectedAdminAgent(agent.id)}
                    style={{ 
                      background: isSel ? "#1e293b" : "#1a2333", 
                      border: isSel ? `1px solid ${c}` : "1px solid #334155", 
                      borderRadius: 6, 
                      padding: "10px 12px", 
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      borderLeft: `4px solid ${c}`
                    }}
                  >
                    <div style={{ fontWeight: "bold", fontSize: 13, color: "#f8fafc", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>{agent.name}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: "normal" }}>{agent.role}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#cbd5e1" }}>
                      <span>Mood: <b style={{ color: "#cbd5e1" }}>{agent.mood}</b></span>
                      <span>E: <b style={{ color: "#10b981" }}>{agent.energy}%</b></span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: 20 }}>No agents loaded.</div>
            )}
          </div>

          {/* Selected Agent Details (Right column) */}
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 18, minHeight: 380, display: "flex", flexDirection: "column" }}>
            {(() => {
              const agent = state.agents.find(a => a.id === (selectedAdminAgent || state.agents[0]?.id));
              if (!agent) {
                return (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontStyle: "italic" }}>
                    Select an agent from the left menu to view their profile.
                  </div>
                );
              }
              const c = agentColors[agent.name] ?? "#3b82f6";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
                  
                  {/* Top profile bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: 10 }}>
                    <div>
                      <h4 style={{ margin: 0, color: c, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: c }} />
                        {agent.name} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: "normal" }}>({agent.role})</span>
                      </h4>
                      <span style={{ fontSize: 12, color: "#cbd5e1" }}>ID: {agent.id} | Position: ({agent.position.x}, {agent.position.y})</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ background: "#1e293b", border: "1px solid #334155", color: "#38bdf8", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: "bold" }}>
                        Status: {agent.status}
                      </span>
                    </div>
                  </div>

                  {/* Vitals grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Energy Level</span>
                      <strong style={{ display: "block", fontSize: 16, color: agent.energy < 30 ? "#ef4444" : "#10b981", marginTop: 2 }}>{agent.energy}%</strong>
                    </div>
                    <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Resource Inventory</span>
                      <strong style={{ display: "block", fontSize: 16, color: "#38bdf8", marginTop: 2 }}>{agent.resources}%</strong>
                    </div>
                    <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Waste / Garbage</span>
                      <strong style={{ display: "block", fontSize: 16, color: agent.waste > 70 ? "#ef4444" : "#cbd5e1", marginTop: 2 }}>{agent.waste}%</strong>
                    </div>
                  </div>

                  {/* Interests */}
                  <div>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: "bold", display: "block", marginBottom: 6 }}>Intellectual Interests & Intensity:</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {agent.interests.map((interest) => (
                        <div key={interest.name} style={{ background: "#1e293b", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span>{interest.name}</span>
                            <b style={{ color: "#38bdf8" }}>{interest.intensity}%</b>
                          </div>
                          <div style={{ background: "#0f172a", height: 4, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ background: c, width: `${interest.intensity}%`, height: "100%" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chronicle History Log */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderTop: "1px solid #334155", paddingTop: 10 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: "bold", marginBottom: 6 }}>📜 Complete Agent Chronicle & Action Log:</span>
                    <div style={{ flex: 1, background: "#1e293b", borderRadius: 6, padding: 10, border: "1px solid #334155", overflowY: "auto", fontSize: 11, display: "flex", flexDirection: "column", gap: 4, maxHeight: 150 }}>
                      {agent.history && agent.history.length > 0 ? (
                        agent.history.map((log, idx) => (
                          <div key={idx} style={{ paddingBottom: 4, borderBottom: "1px solid #0f172a", color: "#cbd5e1" }}>
                            • {log}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: 10 }}>No history logs recorded.</div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>

        </div>
      </div>

      {/* Confirmation Modal for Landscape Regeneration */}
      {showRegenModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#1e293b",
            border: "1px solid #ef4444",
            borderRadius: 12,
            padding: 24,
            maxWidth: 460,
            width: "90%",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#ef4444", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              ⚠️ Weltkarte neu generieren?
            </h3>
            <p style={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px 0" }}>
              Möchtest du die Karte wirklich neu generieren? Die aktuelle Landschaft und alle aufgebauten Objekte / Artefakte sowie Agentenpositionen werden auf die neuen Einstellungen zurückgesetzt.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => setShowRegenModal(false)}
                style={{
                  padding: "8px 16px",
                  background: "#334155",
                  color: "#cbd5e1",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  setShowRegenModal(false);
                  regenerate();
                }}
                style={{
                  padding: "8px 16px",
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Ja, Neu Generieren 🔄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
