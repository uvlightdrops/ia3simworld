import { type CSSProperties, useEffect, useState, useRef, useMemo } from "react";
import { WorldState, initialState, agentColors, terrainColors, terrainLabels } from "../types/sim";
import { InteractiveWorldMap } from "../components/InteractiveWorldMap";
import { GeisteslebenBoard } from "../components/GeisteslebenBoard";
import { RechtBoard } from "../components/RechtBoard";
import { WirtschaftBoard } from "../components/WirtschaftBoard";
import { AdminBoard } from "../components/AdminBoard";
import { AboutModal } from "../components/AboutModal";
import { FooterBar } from "../components/FooterBar";
import { MapManagementBoard } from "../components/MapManagementBoard";
import { useI18n } from "../context/I18nContext";
import { loadUIConfig } from "../lib/config";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:17080";

// Helper: Convert node ID (ia3-1, ia3-2, ia3-3) to sector coordinates with node ID
function nodeSectorDisplay(nodeId: string | undefined): string {
  if (!nodeId) return "Sector (0, 0) [ia3-1]";
  if (nodeId === "ia3-1" || nodeId === "ia3") return "Sector (0, 0) [ia3-1]";
  if (nodeId === "ia3-2") return "Sector (1, 0) [ia3-2]";
  if (nodeId === "ia3-3") return "Sector (0, 1) [ia3-3]";
  return "Sector (0, 0) [ia3-1]"; // fallback
}

export default function Home() {
  const { lang, setLang, t } = useI18n();
  const [state, setState] = useState<WorldState>(initialState);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedAdminAgent, setSelectedAdminAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "maps" | "recht" | "geist" | "wirtschaft" | "admin" | "about">("map");
  const [aboutSubTab, setAboutSubTab] = useState<string>("architecture");
  const [showMapTooltip, setShowMapTooltip] = useState<boolean>(false);
  const [settings, setSettings] = useState({ riverWidth: 4, lakesDensity: 0.20, berriesDensity: 0.20, tickRateMs: 2000 });
  const [managerSettings, setManagerSettings] = useState({
    relicSpawnRate: 80,
    lawProposeRate: 140,
    econEventRate: 100,
    artifactQuality: 100,
    ollamaEnabled: true,
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "llama3.2:latest",
    ollamaMode: "thoughts_only",
    ollamaTimeoutMs: 8000
  });
  const [remoteURL, setRemoteURL] = useState("");
  const [connectedRemoteURL, setConnectedRemoteURL] = useState("");
  const [hasReplicaNode, setHasReplicaNode] = useState(false);
  const [ownNodeName, setOwnNodeName] = useState("ia3-1");

  const [playerNameInput, setPlayerNameInput] = useState("");
  const [isJoiningHuman, setIsJoiningHuman] = useState(false);

  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [highlightedTerrain, setHighlightedTerrain] = useState<string | null>(null);
  const [highlightCountdown, setHighlightCountdown] = useState<number>(0);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [terrainLoaded, setTerrainLoaded] = useState(false);
  
  // Service connectivity tracking
  const [apiConnected, setApiConnected] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const LOCATION_TERRAINS = new Set([
    "home", "court", "market", "crops", "workshop", "mill", "quarry", "forge", "pottery", "storehouse"
  ]);

  function handleLegendClick(terrain: string) {
    if (!LOCATION_TERRAINS.has(terrain)) return;

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setHighlightedTerrain(terrain);
    setHighlightCountdown(5);

    const startTime = Date.now();
    countdownIntervalRef.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, 5 - elapsedSec);
      setHighlightCountdown(remaining);
      if (remaining <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      }
    }, 250);

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedTerrain(null);
      setHighlightCountdown(0);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }, 5000);
  }

  async function joinHumanPlayer() {
    if (!playerNameInput.trim()) return;
    setIsJoiningHuman(true);
    try {
      const res = await fetch(`${API}/api/control/join-human`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerNameInput }),
      });
      if (res.ok) {
        setPlayerNameInput("");
        await refresh();
      }
    } catch (error) {
      console.error("Failed to join as human", error);
    } finally {
      setIsJoiningHuman(false);
    }
  }

  // Keyboard movement listener for human player
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (activeTab !== "map") return;
      
      // Only trigger if not typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      const key = e.key.toLowerCase();
      let direction = "";
      if (key === "w" || key === "arrowup") direction = "up";
      else if (key === "s" || key === "arrowdown") direction = "down";
      else if (key === "a" || key === "arrowleft") direction = "left";
      else if (key === "d" || key === "arrowright") direction = "right";

      if (direction) {
        e.preventDefault();
        try {
          await fetch(`${API}/api/control/move-human`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direction }),
          });
          void refresh();
        } catch (error) {
          console.error("Failed to move human player", error);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, state]);

  async function refresh() {
    try {
      const res = await fetch(`${API}/api/state?compact=true`);
      if (res.ok) {
        const nextState = await res.json();
        setState(prev => ({
          ...prev,
          running: nextState.running,
          tick: nextState.tick,
          tickRateMs: nextState.tickRateMs,
          totalAgents: nextState.totalAgents,
          agents: nextState.agents,
          events: nextState.events,
          lastUpdated: nextState.lastUpdated,
          generating: nextState.generating ?? prev.generating,
          genProgress: nextState.genProgress ?? prev.genProgress,
          grassPolicy: nextState.grassPolicy ?? prev.grassPolicy,
          forestPolicy: nextState.forestPolicy ?? prev.forestPolicy,
          activeLaws: nextState.activeLaws ?? prev.activeLaws,
        }));
        if (nextState.relicSpawnRate) {
          setManagerSettings(prev => ({
            ...prev,
            relicSpawnRate: nextState.relicSpawnRate ?? prev.relicSpawnRate,
            lawProposeRate: nextState.lawProposeRate ?? prev.lawProposeRate,
            econEventRate: nextState.econEventRate ?? prev.econEventRate,
            artifactQuality: nextState.artifactQuality ?? prev.artifactQuality,
            ollamaEnabled: nextState.ollamaEnabled ?? prev.ollamaEnabled,
            ollamaBaseUrl: nextState.ollamaBaseUrl ?? prev.ollamaBaseUrl,
            ollamaModel: nextState.ollamaModel ?? prev.ollamaModel,
            ollamaMode: nextState.ollamaMode ?? prev.ollamaMode,
            ollamaTimeoutMs: nextState.ollamaTimeoutMs ?? prev.ollamaTimeoutMs,
          }));
        }
      }
    } catch (error) {
      console.error("Failed to refresh simulation state", error);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`${API}/api/control/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch settings", error);
    }
  }

  // Load full terrain data when switching to map tab (lazy-load to avoid 291MB on every refresh)
  async function loadTerrainData() {
    if (terrainLoaded) return;
    try {
      const res = await fetch(`${API}/api/state`);
      if (res.ok) {
        const fullState = await res.json();
        setState(prev => ({
          ...prev,
          worldSize: fullState.worldSize,
          terrain: fullState.terrain,
          objects: fullState.objects,
        }));
        setTerrainLoaded(true);
      }
    } catch (error) {
      console.error("Failed to load terrain data", error);
    }
  }

  async function fetchMultiplayer() {
    try {
      const res = await fetch(`${API}/api/control/multiplayer`);
      if (res.ok) {
        const data = await res.json();
        setConnectedRemoteURL(data.remoteURL || "");
        if (data.remoteURL && !remoteURL) {
          setRemoteURL(data.remoteURL);
        }
      }
    } catch (error) {
      console.error("Failed to fetch multiplayer settings", error);
    }
  }

  async function connectMultiplayer(url: string) {
    try {
      const res = await fetch(`${API}/api/control/multiplayer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteURL: url }),
      });
      if (res.ok) {
        setConnectedRemoteURL(url);
        void refresh();
      }
    } catch (error) {
      console.error("Failed to connect to remote shared world", error);
    }
  }

  async function updateSettings(newSettings: Partial<typeof settings>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await fetch(`${API}/api/control/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch (error) {
      console.error("Failed to update settings", error);
    }
  }

  async function start() {
    try {
      await fetch(`${API}/api/control/start`, { method: "POST" });
      await refresh();
    } catch (error) {
      console.error("Failed to start simulation", error);
    }
  }

  async function pause() {
    try {
      await fetch(`${API}/api/control/pause`, { method: "POST" });
      await refresh();
    } catch (error) {
      console.error("Failed to pause simulation", error);
    }
  }

  async function regenerate() {
    try {
      await fetch(`${API}/api/control/regenerate`, { method: "POST" });
      await refresh();
    } catch (error) {
      console.error("Failed to regenerate landscape", error);
    }
  }

  async function triggerScenario() {
    try {
      const res = await fetch(`${API}/api/control/trigger-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "festival" }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Failed to trigger scenario: ${text}`);
      } else {
        await refresh();
      }
    } catch (error) {
      console.error("Failed to trigger scenario", error);
      alert(`Error triggering scenario: ${error}`);
    }
  }

  async function updateManagerSettings(newValues: Partial<typeof managerSettings>) {
    const updated = { ...managerSettings, ...newValues };
    setManagerSettings(updated);
    try {
      const res = await fetch(`${API}/api/control/update-manager-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        console.error("Failed to update manager settings");
      }
    } catch (error) {
      console.error("Failed to update manager settings", error);
    }
  }

  async function sendAgentRequest(agentId: string, requestType: string) {
    try {
      const res = await fetch(`${API}/api/control/agent-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, requestType }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Anfrage fehlgeschlagen: ${text}`);
      } else {
        const data = await res.json();
        alert(data.message);
        await refresh();
      }
    } catch (error) {
      console.error("Failed to send agent request", error);
      alert(`Fehler bei der Anfrage: ${error}`);
    }
  }

  async function respondInteraction(optionIndex: number) {
    try {
      const res = await fetch(`${API}/api/control/respond-interaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Antwort fehlgeschlagen: ${text}`);
      } else {
        const data = await res.json();
        alert(data.message);
        await refresh();
      }
    } catch (error) {
      console.error("Failed to respond to interaction", error);
    }
  }

  async function setAutoAnswerMode(mode: string) {
    try {
      const res = await fetch(`${API}/api/control/set-auto-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Auto-Antwort-Einstellung fehlgeschlagen: ${text}`);
      } else {
        await refresh();
      }
    } catch (error) {
      console.error("Failed to set auto answer mode", error);
    }
  }

  useEffect(() => {
    const uiConfig = loadUIConfig();
    
    refresh();
    fetchSettings();
    fetchMultiplayer();

    if (typeof window !== "undefined") {
      const port = window.location.port;
      if (port === "12000" || port === "13000" || port === "" || port === "80" || port === "3000") {
        setOwnNodeName("ia3-1");
      } else if (port === "12001" || port === "13001") {
        setOwnNodeName("ia3-2");
      } else if (port === "12002" || port === "13002") {
        setOwnNodeName("ia3-3");
      } else {
        setOwnNodeName("ia3-1");
      }
    }

    // Check if second instance is active
    if (typeof window !== "undefined") {
      const checkPort = window.location.port === "12000" ? "17081" : "18081";
      fetch(`http://localhost:${checkPort}/healthz`)
        .then(res => setHasReplicaNode(res.ok))
        .catch(() => setHasReplicaNode(false));
    }

    // Establish WebSocket connection with robust polling fallback
    const wsUrl = API.replace(/^http/, "ws") + "/api/ws";
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const nextState = JSON.parse(event.data);
        setState(nextState);
      } catch (err) {
        console.error("Failed to parse socket state:", err);
      }
    };

    socket.onerror = (err) => {
      console.warn("WebSocket error, falling back to polling:", err);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    const fallbackPoll = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        void refresh();
      }
    }, uiConfig.polling.compact_interval_ms);

    // Fast-poll during terrain generation so progress overlay updates smoothly
    // ONLY run when generating to avoid unnecessary network traffic
    let genPollInterval: NodeJS.Timeout | null = null;
    const setupGenPoll = () => {
      if (!genPollInterval && state.generating) {
        genPollInterval = setInterval(() => {
          if (state.generating) {
            void refresh();
          } else {
            if (genPollInterval) {
              clearInterval(genPollInterval);
              genPollInterval = null;
            }
          }
        }, 300);
      }
    };
    
    setupGenPoll();

    return () => {
      socket.close();
      clearInterval(fallbackPoll);
      if (genPollInterval) {
        clearInterval(genPollInterval);
      }
    };
  }, []);

  // Load terrain data when switching to map tab (lazy-load to reduce network traffic)
  useEffect(() => {
    if (activeTab === "map" && !terrainLoaded) {
      void loadTerrainData();
    }
  }, [activeTab, terrainLoaded]);

  // Compute dynamic resource statistics - MEMOIZED to avoid O(N²) recalculation
  const { terrainStats, totalBerries, totalWaste } = useMemo(() => {
    const stats = { grass: 0, water: 0, forest: 0, rock: 0, home: 0, road: 0 };
    let berries = 0;
    let waste = 0;

    if (state.terrain) {
      for (let y = 0; y < state.terrain.length; y++) {
        for (let x = 0; x < state.terrain[y].length; x++) {
          const t = state.terrain[y][x];
          if (t in stats) {
            stats[t as keyof typeof stats]++;
          }
          const obj = state.objects?.[y]?.[x];
          if (obj) {
            if (obj.type === "berries") {
              berries += obj.amount;
            } else if (obj.type === "waste_pile") {
              waste += obj.amount;
            }
          }
        }
      }
    }
    return { terrainStats: stats, totalBerries: berries, totalWaste: waste };
  }, [state.terrain, state.objects]);

  const hour = state.tick % 24;
  const timeStr = `${String(hour).padStart(2, "0")}:00`;
  let phase = "Night 🌙";
  let phaseColor = "#818cf8";
  if (hour >= 6 && hour < 12) {
    phase = "Morning 🌅";
    phaseColor = "#fb923c";
  } else if (hour >= 12 && hour < 18) {
    phase = "Afternoon ☀️";
    phaseColor = "#facc15";
  } else if (hour >= 18 && hour < 22) {
    phase = "Evening 🌇";
    phaseColor = "#f87171";
  }

  const btnStyle: CSSProperties = {
    padding: "8px 16px",
    background: "#1e293b",
    color: "#f1f5f9",
    border: "1px solid #475569",
    borderRadius: 6,
    fontWeight: "bold",
    cursor: "pointer",
  };

  const headerLabel: CSSProperties = {
    fontSize: 12,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const tabStyle = (tab: "map" | "maps" | "recht" | "geist" | "wirtschaft" | "admin" | "about"): CSSProperties => ({
    background: activeTab === tab ? "#38bdf8" : "transparent",
    color: activeTab === tab ? "#0f172a" : "#cbd5e1",
    border: activeTab === tab ? "none" : "1px solid #334155",
    padding: "10px 20px",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.15s ease",
  });

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24, background: "#0f172a", color: "#f8fafc", height: "100vh", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden", position: "relative" }}>
      <style>{`
        html, body {
          background-color: #0f172a !important;
          margin: 0;
          padding: 0;
          height: 100vh;
          overflow: hidden;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #1e293b;
        }
        ::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* 🔄 WORLD GENERATION PROGRESS OVERLAY */}
      {state.generating && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.92)",
          backdropFilter: "blur(12px)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          padding: 32,
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 48, filter: "drop-shadow(0 0 12px rgba(56, 189, 248, 0.4))", animation: "pulse-glow 2s infinite ease-in-out" }}>
              🌐
            </span>
            <h1 style={{ color: "#38bdf8", margin: 0, fontSize: 24, fontWeight: "bold", letterSpacing: "-0.01em" }}>
              Welt wird generiert…
            </h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: 13 }}>
              Prozedurales Rauschen · Flüsse · Siedlungen · Infrastruktur · Felder
            </p>
          </div>

          <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Phase label */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#7dd3fc", fontFamily: "monospace" }}>
                {state.genPhase ?? "Initialisierung"}
              </span>
              <span style={{ fontSize: 15, fontWeight: "bold", fontFamily: "monospace", color: "#38bdf8" }}>
                {state.genProgress ?? 0}%
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ width: "100%", background: "#1e293b", height: 18, borderRadius: 9, overflow: "hidden", border: "1px solid #334155" }}>
              <div style={{
                background: "linear-gradient(90deg, #0ea5e9 0%, #06b6d4 60%, #38bdf8 100%)",
                width: `${state.genProgress ?? 0}%`,
                height: "100%",
                borderRadius: 9,
                transition: "width 0.2s ease-out",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.5)"
              }} />
            </div>
            {/* Phase steps */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {["Gelände", "Flüsse", "Siedlungen", "Infra.", "Straßen", "Felder", "Brücken"].map((phase, i) => {
                const stepPct = [2, 22, 32, 50, 62, 72, 84][i];
                const done = (state.genProgress ?? 0) >= stepPct + 8;
                const active = (state.genPhase ?? "") === phase || (state.genPhase ?? "").startsWith(phase.replace(".", ""));
                return (
                  <span key={phase} style={{
                    fontSize: 10,
                    color: done ? "#38bdf8" : active ? "#7dd3fc" : "#475569",
                    fontFamily: "monospace",
                    transition: "color 0.3s"
                  }}>
                    {done ? "✓" : active ? "▶" : "○"} {phase}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid #334155", paddingBottom: 12, flexShrink: 0, gap: 16 }}>
        <div style={{ flexShrink: 0, minWidth: 180 }}>
          <h1 style={{ margin: 0, color: "#38bdf8", fontSize: 28, letterSpacing: "-0.02em" }}>IA3 SimWorld</h1>
        </div>

        {/* Tab Navigation in Header */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <button style={tabStyle("map")} onClick={() => setActiveTab("map")}>{t.nav.map}</button>

          {/* 🏛️ Dreigliederung Dropdown */}
          <select
            value={["geist", "recht", "wirtschaft"].includes(activeTab) ? activeTab : "dreigliederung_header"}
            onChange={(e) => {
              if (e.target.value !== "dreigliederung_header") {
                setActiveTab(e.target.value as any);
              }
            }}
            style={{
              background: ["geist", "recht", "wirtschaft"].includes(activeTab) ? "#38bdf8" : "#1e293b",
              color: ["geist", "recht", "wirtschaft"].includes(activeTab) ? "#0f172a" : "#cbd5e1",
              border: ["geist", "recht", "wirtschaft"].includes(activeTab) ? "none" : "1px solid #334155",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: "bold",
              cursor: "pointer",
              outline: "none",
              boxShadow: ["geist", "recht", "wirtschaft"].includes(activeTab) ? "0 4px 12px rgba(56, 189, 248, 0.25)" : "none",
            }}
          >
            <option value="dreigliederung_header" disabled hidden>{t.nav.dreigliederung} ▾</option>
            <option value="geist">{t.nav.geist}</option>
            <option value="recht">{t.nav.recht}</option>
            <option value="wirtschaft">{t.nav.wirtschaft}</option>
          </select>

          {/* ⚙️ Admin Dropdown */}
          <select
            value={["admin", "maps", "agents"].includes(activeTab) ? activeTab : "admin_header"}
            onChange={(e) => {
              if (e.target.value !== "admin_header") {
                setActiveTab(e.target.value as any);
              }
            }}
            style={{
              background: ["admin", "maps", "agents"].includes(activeTab) ? "#38bdf8" : "#1e293b",
              color: ["admin", "maps", "agents"].includes(activeTab) ? "#0f172a" : "#cbd5e1",
              border: ["admin", "maps", "agents"].includes(activeTab) ? "none" : "1px solid #334155",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: "bold",
              cursor: "pointer",
              outline: "none",
              boxShadow: ["admin", "maps", "agents"].includes(activeTab) ? "0 4px 12px rgba(56, 189, 248, 0.25)" : "none",
            }}
          >
            <option value="admin_header" disabled hidden>{t.nav.admin} ▾</option>
            <option value="admin">{t.nav.adminGeneral}</option>
            <option value="maps">{t.nav.adminMaps}</option>
            <option value="agents">{t.nav.adminAgents}</option>
          </select>

          <button style={tabStyle("about")} onClick={() => setActiveTab("about")}>{t.nav.about}</button>

          {/* 🌐 Language Switcher Dropdown */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "de" | "en")}
            style={{
              background: "#1e293b",
              color: "#f8fafc",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: "bold",
              cursor: "pointer",
              outline: "none",
              marginLeft: 6,
            }}
          >
            <option value="de">🇩🇪 DE</option>
            <option value="en">🇬🇧 EN</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 16, textAlign: "right", flexShrink: 0 }}>
          <div style={{ minWidth: 125, boxSizing: "border-box" }}>
            <div style={headerLabel}>Multiplayer Mode</div>
            <strong style={{ color: connectedRemoteURL ? "#10b981" : "#94a3b8", display: "block", whiteSpace: "nowrap" }}>
              {connectedRemoteURL ? "🌍 Shared World" : "🌍 Local Host"}
            </strong>
          </div>
          <div style={{ minWidth: 120, boxSizing: "border-box" }}>
            <div style={headerLabel}>Profile</div>
            <strong style={{ color: "#60a5fa", display: "block", whiteSpace: "nowrap", fontSize: 12 }}>
              {process.env.NEXT_PUBLIC_PROFILE || "standard"}
            </strong>
          </div>
            <div style={{ minWidth: 140, boxSizing: "border-box" }}>
            <div style={headerLabel}>Sect.</div>
            <strong style={{ color: "#10b981", display: "block", whiteSpace: "nowrap", fontSize: 12 }}>
              {state.discoveredSectors && state.discoveredSectors.length > 0
                ? state.discoveredSectors.sort().join(", ")
                : "Sector (0, 0)"
              }
            </strong>
          </div>
          <div style={{ minWidth: 160, boxSizing: "border-box" }}>
            <div style={headerLabel}>Simulation Time</div>
            <strong style={{ color: phaseColor, display: "block", whiteSpace: "nowrap" }}>{phase} ({timeStr})</strong>
          </div>
          <div style={{ minWidth: 135, boxSizing: "border-box" }}>
            <div style={headerLabel}>Engine State</div>
            <strong style={{ color: state.running ? "#10b981" : "#ef4444", display: "block", whiteSpace: "nowrap" }}>
              {state.running ? "RUNNING: Active" : "RUNNING: Paused"}
            </strong>
          </div>
          <div style={{ minWidth: 75, boxSizing: "border-box" }}>
            <div style={headerLabel}>Tick</div>
            <strong style={{ display: "block", whiteSpace: "nowrap", fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>#{state.tick}</strong>
          </div>
        </div>
      </div>

      {/* ACTIVE SCENARIO COZY BANNER */}
      {state.activeScenario && (
        <div style={{
          background: "linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(234, 88, 12, 0.15) 100%)",
          border: "1px solid #eab308",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 36, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
              {state.scenarioState === "gathering" ? "🎪" : state.scenarioState === "active" ? "🎉" : "🚶"}
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, background: "#eab308", color: "#000", fontWeight: "bold", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                  Active Scenario
                </span>
                <span style={{ fontSize: 11, background: "#475569", color: "#cbd5e1", fontWeight: "bold", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                  Phase: {state.scenarioState}
                </span>
              </div>
              <h2 style={{ margin: "4px 0 2px 0", color: "#f97316", fontSize: 18, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                Autumn Solstice Festival 🍂
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: "1.4" }}>
                {state.scenarioState === "gathering" && (
                  "All AI agents have packed their bags, pooled supply resources, and are currently traveling to the designated festival grounds! Watch them gather on the map."
                )}
                {state.scenarioState === "active" && (
                  "The grand Autumn Solstice celebration is underway! AI agents are gathered around a great bonfire, feasting, playing music, and crafting flower crowns. Their social, artistic, and philosophical interests are flourishing!"
                )}
                {state.scenarioState === "dispersing" && (
                  "The festival has completed successfully! Agents are packing up leftover supplies and walking back home to their settlements. This historic milestone is recorded in the civilizational chronicles."
                )}
              </p>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 120, borderLeft: "1px solid rgba(234, 179, 8, 0.3)", paddingLeft: 16 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Time Remaining</div>
            {state.scenarioState === "active" ? (
              <div style={{ fontSize: 20, fontWeight: "bold", color: "#eab308", fontFamily: "monospace" }}>
                {state.scenarioTicksLeft} ticks
              </div>
            ) : (
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#cbd5e1" }}>
                Transitioning...
              </div>
            )}
            <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
              Center: ({state.scenarioTargetX}, {state.scenarioTargetY})
            </div>
          </div>
        </div>
      )}

      {/* 💬 NPC INCOMING INTERACTIVE REQUEST / QUEST PANEL */}
      {state.activeInteraction && (
        <div style={{
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)",
          border: "2px solid #818cf8",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 4px 20px rgba(79, 70, 229, 0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 36, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
              💬
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, background: "#818cf8", color: "#000", fontWeight: "bold", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>
                  Eingehende NPC-Anfrage
                </span>
                <span style={{ fontSize: 11, background: "#ef4444", color: "#fff", fontWeight: "bold", padding: "2px 6px", borderRadius: 4 }}>
                  ⏳ {state.activeInteraction.ticksLeft} Ticks verbleibend
                </span>
              </div>
              <h2 style={{ margin: "4px 0 2px 0", color: "#818cf8", fontSize: 18, fontWeight: "bold" }}>
                {state.activeInteraction.npcName} spricht dich an:
              </h2>
              <p style={{ margin: "4px 0 12px 0", fontSize: 14, color: "#fff", fontStyle: "italic", fontWeight: "medium" }}>
                "{state.activeInteraction.text}"
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {state.activeInteraction.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => respondInteraction(idx)}
                    style={{
                      background: idx === 0 ? "#10b981" : "#334155",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 12,
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right", minWidth: 160, borderLeft: "1px solid rgba(129, 140, 248, 0.3)", paddingLeft: 16 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Auto-Antwort Modus</div>
            <select
              value={state.autoAnswerMode || "manual"}
              onChange={(e) => setAutoAnswerMode(e.target.value)}
              style={{
                background: "#0f172a",
                color: "#cbd5e1",
                border: "1px solid #334155",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              <option value="manual">Manuell (Ablaufen lassen)</option>
              <option value="auto_accept">Auto-Akzeptieren (Ja)</option>
              <option value="auto_reject">Auto-Ablehnen (Nein)</option>
            </select>
          </div>
        </div>
      )}


      {/* ACTIVE TAB: LIVE MAP GRID */}
      {activeTab === "map" && (
        <div style={{ display: "flex", flex: 1, gap: 16, minHeight: 0, overflow: "hidden" }}>
          
          {/* 1. Square Map Viewport (1:1 Aspect Ratio) */}
          <div style={{ height: "100%", aspectRatio: "1 / 1", maxHeight: "100%", position: "relative", flexShrink: 0 }}>
            <InteractiveWorldMap
              state={state}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
              highlightedTerrain={highlightedTerrain}
              hoveredTile={hoveredTile}
              setHoveredTile={setHoveredTile}
              showMapTooltip={showMapTooltip}
              setShowMapTooltip={setShowMapTooltip}
            />
          </div>

          {/* 2. Middle Column: Vertical Legend Panel next to Map */}
          <div
            style={{
              width: 230,
              height: "100%",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
              flexShrink: 0,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
              boxSizing: "border-box",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: 15, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                {t.legend.title}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: "1.3" }}>
                {t.legend.subtitle}
              </p>
            </div>

            {/* Active Highlight Status Banner */}
            {highlightedTerrain && (
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.2)",
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#fef08a",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>✨ <b>{t.terrain[highlightedTerrain as keyof typeof t.terrain] ?? highlightedTerrain}</b></span>
                <span style={{ background: "#f59e0b", color: "#000", fontWeight: "bold", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                  {highlightCountdown}{t.common.seconds}
                </span>
              </div>
            )}

            {/* Group 1: Locations & Facilities */}
            <div>
              <div style={{ fontSize: 11, fontWeight: "bold", color: "#eab308", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                {t.legend.locations}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(terrainColors)
                  .filter(([terrain]) => LOCATION_TERRAINS.has(terrain))
                  .map(([terrain, color]) => {
                    const isHighlighted = highlightedTerrain === terrain;
                    const label = t.terrain[terrain as keyof typeof t.terrain] ?? terrainLabels[terrain] ?? terrain;
                    return (
                      <button
                        key={terrain}
                        onClick={() => handleLegendClick(terrain)}
                        title={`Klicken zum Hervorheben auf der Karte (5 Sek.)`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 12,
                          background: isHighlighted ? "rgba(245, 158, 11, 0.25)" : "#0f172a",
                          color: isHighlighted ? "#fef08a" : "#f8fafc",
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: isHighlighted ? "2px solid #f59e0b" : "1px solid #334155",
                          boxShadow: isHighlighted ? "0 0 10px rgba(245, 158, 11, 0.5)" : "none",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, boxShadow: isHighlighted ? "0 0 6px #f59e0b" : "none" }} />
                          <span style={{ fontWeight: "bold" }}>
                            {label}
                          </span>
                        </div>
                        {isHighlighted ? (
                          <span style={{ fontSize: 10, fontWeight: "bold", background: "#f59e0b", color: "#000", padding: "1px 5px", borderRadius: 4 }}>
                            {highlightCountdown}{t.common.seconds}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "#64748b" }}>🔍</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Group 2: Land Cover */}
            <div>
              <div style={{ fontSize: 11, fontWeight: "bold", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                {t.legend.landcover}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(terrainColors)
                  .filter(([terrain]) => !LOCATION_TERRAINS.has(terrain))
                  .map(([terrain, color]) => {
                    const label = t.terrain[terrain as keyof typeof t.terrain] ?? terrainLabels[terrain] ?? terrain;
                    return (
                      <div
                        key={terrain}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          background: "rgba(15, 23, 42, 0.5)",
                          color: "#94a3b8",
                          padding: "5px 10px",
                          borderRadius: 6,
                          border: "1px solid #1e293b",
                        }}
                      >
                        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, opacity: 0.8 }} />
                        <span style={{ textTransform: "capitalize" }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Fixed Coordinates & Tile Info Panel at the bottom of Legend */}
            <div
              style={{
                marginTop: "auto",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              <div style={{ fontWeight: "bold", color: "#38bdf8", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                {t.legend.coordsTitle}
              </div>
              {hoveredTile ? (() => {
                const x = hoveredTile.x;
                const y = hoveredTile.y;
                const absX = (state.gridOriginX ?? 0) + x;
                const absY = (state.gridOriginY ?? 0) + y;
                const terrain = state.terrain?.[y]?.[x] ?? "grass";
                const label = t.terrain[terrain as keyof typeof t.terrain] ?? terrainLabels[terrain] ?? terrain;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>{t.legend.grid}:</span>
                      <b style={{ color: "#f8fafc", fontFamily: "monospace" }}>({x}, {y})</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>{t.legend.absolute}:</span>
                      <b style={{ color: "#38bdf8", fontFamily: "monospace" }}>({absX}, {absY})</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>{t.legend.type}:</span>
                      <b style={{ color: "#fef08a", textTransform: "capitalize" }}>{label}</b>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ color: "#64748b", fontSize: 11, fontStyle: "italic", textAlign: "center", padding: "4px 0" }}>
                  {t.legend.hoverPrompt}
                </div>
              )}
            </div>
          </div>

          {/* 3. Right Column: Unified Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minWidth: 420, height: "100%", overflowY: "auto", paddingRight: 4, flexShrink: 0 }}>
            
            {/* ⚡ Master Simulation Control */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 15, color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{t.masterControl.title}</span>
                <span style={{ fontSize: 11, background: state.running ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)", color: state.running ? "#10b981" : "#ef4444", padding: "2px 8px", borderRadius: 4, border: state.running ? "1px solid #10b981" : "1px solid #ef4444" }}>
                  {state.running ? t.masterControl.activeStatus : t.masterControl.pausedStatus}
                </span>
              </h3>

              {(connectedRemoteURL || (ownNodeName !== "ia3-1" && ownNodeName !== "ia3")) ? (
                <div style={{ background: "rgba(56, 189, 248, 0.1)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", fontSize: 12 }}>
                  {t.masterControl.observerMode}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button
                    onClick={start}
                    disabled={state.running}
                    style={{
                      padding: "8px 10px",
                      background: state.running ? "#1e293b" : "#10b981",
                      color: state.running ? "#64748b" : "#fff",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      fontWeight: "bold",
                      cursor: state.running ? "default" : "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t.masterControl.start}
                  </button>
                  <button
                    onClick={pause}
                    disabled={!state.running}
                    style={{
                      padding: "8px 10px",
                      background: !state.running ? "#1e293b" : "#ef4444",
                      color: !state.running ? "#64748b" : "#fff",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      fontWeight: "bold",
                      cursor: !state.running ? "default" : "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t.masterControl.pause}
                  </button>
                  <button
                    onClick={regenerate}
                    style={{
                      padding: "8px 10px",
                      background: "#0ea5e9",
                      color: "#fff",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t.masterControl.regen}
                  </button>
                </div>
              )}
            </div>

            {/* Active Agents Table & Agent Details Card (Side-by-Side Container) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxHeight: "500px" }}>
              {/* 1. Active Agent Table (Compact, Status column omitted) */}
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 12, maxHeight: "100%", overflowY: "auto" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 15, color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 6 }}>
                  Active Agents
                </h3>
                <div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                        <th style={{ padding: "4px 6px" }}>Color</th>
                        <th style={{ padding: "4px 6px" }}>Name</th>
                        <th style={{ padding: "4px 6px" }}>Homeland</th>
                        <th style={{ padding: "4px 6px", textAlign: "right" }}>Energy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.agents.map((agent) => {
                        const isSelected = selectedAgent === agent.id;
                        const agentColor = agentColors[agent.name] ?? "#3b82f6";
                        return (
                          <tr 
                            key={agent.id} 
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedAgent(isSelected ? null : agent.id);
                            }}
                            style={{ 
                              cursor: "pointer", 
                              background: isSelected ? "rgba(56, 189, 248, 0.15)" : "transparent",
                              borderBottom: "1px solid #334155",
                              transition: "background 0.15s ease"
                            }}
                          >
                            <td style={{ padding: "6px" }}>
                              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: agentColor }} />
                            </td>
                            <td style={{ padding: "6px", fontWeight: "bold", color: isSelected ? "#38bdf8" : "#f1f5f9" }}>
                              {agent.name}
                            </td>
                            <td style={{ padding: "6px", fontSize: 11, color: "#cbd5e1" }}>
                              {agent.homelandNodeId ? nodeSectorDisplay(agent.homelandNodeId) : "Sector (0, 0) [ia3-1]"}
                            </td>
                            <td style={{ padding: "6px", textAlign: "right", fontWeight: "bold", color: agent.energy < 30 ? "#ef4444" : "#10b981" }}>
                              {agent.energy}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Selected Agent Detail Card (Always Visible) */}
              {(() => {
                const agent = state.agents.find(a => a.id === selectedAgent);
                const col = agent ? (agentColors[agent.name] ?? "#3b82f6") : "#334155";
                return (
                  <div style={{ border: `1px solid ${col}`, borderRadius: 12, background: "#1e293b", padding: 14, maxHeight: "500px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: col }} />
                      <h3 style={{ margin: 0, fontSize: 16, color: "#38bdf8" }}>{agent ? `${agent.name} Details` : "No Agent Selected"}</h3>
                    </div>
                    
                    {agent ? (
                      <>
                      
                    <div style={{ fontSize: 13, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                      <div>Role: <b>{agent.role}</b></div>
                      <div>Mood: <b style={{ textTransform: "capitalize" }}>{agent.mood}</b></div>
                      <div style={{ gridColumn: "span 2" }}>Status: <b style={{ color: "#38bdf8" }}>{agent.status}</b></div>
                      <div>Pos: <b>({agent.position.x}, {agent.position.y})</b></div>
                      <div>Target: <b>({agent.target.x}, {agent.target.y})</b></div>
                    </div>
                    
                    <hr style={{ borderColor: "#334155", margin: "10px 0" }} />
                    
                    <div style={{ margin: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 12 }}>
                        <span>Energy</span>
                        <span style={{ fontWeight: "bold" }}>{agent.energy}%</span>
                      </div>
                      <div style={{ background: "#334155", height: 6, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ background: agent.energy < 30 ? "#ef4444" : "#10b981", width: `${agent.energy}%`, height: "100%" }} />
                      </div>
                    </div>

                    <div style={{ margin: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 12 }}>
                        <span>Resources</span>
                        <span style={{ fontWeight: "bold" }}>{agent.resources}%</span>
                      </div>
                      <div style={{ background: "#334155", height: 6, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ background: agent.resources < 30 ? "#ef4444" : "#10b981", width: `${agent.resources}%`, height: "100%" }} />
                      </div>
                    </div>

                    <div style={{ margin: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 12 }}>
                        <span>Waste / Garbage</span>
                        <span style={{ fontWeight: "bold" }}>{agent.waste}%</span>
                      </div>
                      <div style={{ background: "#334155", height: 6, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ background: agent.waste > 70 ? "#ef4444" : "#3b82f6", width: `${agent.waste}%`, height: "100%" }} />
                      </div>
                    </div>

                    <hr style={{ borderColor: "#334155", margin: "10px 0" }} />
                    <p style={{ margin: "0 0 6px 0", fontSize: 12, color: "#94a3b8" }}>Interests Intensity:</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {agent.interests.map((interest) => (
                        <span key={interest.name} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>
                          {interest.name}: <b>{interest.intensity}%</b>
                        </span>
                      ))}
                    </div>

                    {/* 💬 Spieler-Anfragen (Interactive Quests) */}
                    <div style={{ marginTop: 12, background: "#1e1b4b", padding: 10, borderRadius: 8, fontSize: 12, border: "1px solid #4338ca" }}>
                      <div style={{ color: "#eab308", fontWeight: "bold", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                        💬 Spieler-Anfragen & Quests
                      </div>
                      {!state.agents.some(a => a.id === "human-1") ? (
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                          Tritt der Simulation als "Human Player" bei, um diesem Agenten Aufgaben zu stellen!
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#cbd5e1" }}>
                            Stelle eine Anfrage (nur möglich, wenn du dich in der Nähe des Agenten befindest):
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            <button 
                              onClick={() => sendAgentRequest(agent.id, "deliver_resources")}
                              style={{ background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                              title="Bittet den Agenten, dir 20 Rohstoffe zu liefern (benötigt >=25% Rohstoffe beim Agenten)."
                            >
                              📦 Ressource liefern
                            </button>
                            <button 
                              onClick={() => sendAgentRequest(agent.id, "explore_together")}
                              style={{ background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                              title="Fordert den Agenten auf, mit dir auf Erkundungstour zu gehen (folgt dir für eine Weile)."
                            >
                              🧭 Gemeinsam erkunden
                            </button>
                            <button 
                              onClick={() => sendAgentRequest(agent.id, "teach_philosophy")}
                              style={{ background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                              title="Frage den Agenten nach philosophischen Erkenntnissen, um dein eigenes Wissen zu erweitern."
                            >
                              📖 Weisheit lehren
                            </button>
                            <button 
                              onClick={() => sendAgentRequest(agent.id, "build_crops")}
                              style={{ background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                              title="Bittet den Agenten, in deiner Nähe ein neues Getreidefeld anzulegen (benötigt >=30% Rohstoffe)."
                            >
                              🌾 Feld anlegen
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Performance metrics & Rates */}
                    <div style={{ marginTop: 12, background: "#0f172a", padding: 10, borderRadius: 8, fontSize: 12, border: "1px solid #334155" }}>
                      <div style={{ color: "#38bdf8", fontWeight: "bold", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                        📊 Cooperation & Social Rates
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 8px" }}>
                        <div>Missions Met: <b style={{ color: "#10b981" }}>{agent.missionsCompleted ?? 0}</b></div>
                        <div>Missions Aborted: <b style={{ color: "#ef4444" }}>{agent.missionsAborted ?? 0}</b></div>
                        <div>Socialized Count: <b style={{ color: "#10b981" }}>{agent.socializedCount ?? 0}</b></div>
                        <div>Refused Social: <b style={{ color: "#f59e0b" }}>{agent.refusedSocializeCount ?? 0}</b></div>
                      </div>
                    </div>

                    {/* Chronicle History Log */}
                    <div style={{ marginTop: 12 }}>
                      <p style={{ margin: "0 0 6px 0", fontSize: 12, color: "#94a3b8", fontWeight: "bold" }}>📜 Chronicle Log (Entscheidungen):</p>
                      <div style={{ background: "#0f172a", borderRadius: 8, padding: 8, border: "1px solid #334155", maxHeight: 150, overflowY: "auto", fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                        {agent.history && agent.history.length > 0 ? (
                          agent.history.map((log, idx) => (
                            <div key={idx} style={{ paddingBottom: 4, borderBottom: "1px solid #1e293b", color: "#cbd5e1" }}>
                              • {log}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center" }}>No logs recorded yet.</div>
                        )}
                      </div>
                    </div>

                    {agent.agreement && (
                      <div style={{ marginTop: 12, background: "#1e1b4b", padding: 8, borderRadius: 6, border: "1px solid #4338ca" }}>
                        <p style={{ margin: "0 0 4px 0", color: "#818cf8", fontSize: 12, fontWeight: "bold" }}>📜 Active Agreement:</p>
                        <p style={{ margin: "2px 0", fontSize: 12 }}>Partner: <b>{state.agents.find(a => a.id === agent.agreement?.partnerId)?.name || agent.agreement?.partnerId}</b></p>
                        <p style={{ margin: "2px 0", fontSize: 12 }}>Type: <b style={{ textTransform: "uppercase" }}>{agent.agreement?.type}</b> ({agent.agreement?.ticksLeft} ticks left)</p>
                      </div>
                    )}
                      </>
                    ) : (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", textAlign: "center" }}>
                        <div>
                          <p style={{ fontSize: 14, marginBottom: 10 }}>Select an agent from the list to view details</p>
                          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                            <p style={{ marginBottom: 8 }}>Dummy Properties:</p>
                            <div style={{ background: "#0f172a", padding: 10, borderRadius: 6, textAlign: "left" }}>
                              <p style={{ margin: 4 }}>Role: <b>—</b></p>
                              <p style={{ margin: 4 }}>Mood: <b>—</b></p>
                              <p style={{ margin: 4 }}>Status: <b>—</b></p>
                              <p style={{ margin: 4 }}>Position: <b>—</b></p>
                              <p style={{ margin: 4 }}>Energy: <b>—</b></p>
                              <p style={{ margin: 4 }}>Resources: <b>—</b></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 🎮 Playable Character (Mitmach-Modus) - Moved to bottom */}
            <div style={{ background: "#1e293b", border: "1px dashed #eab308", borderRadius: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 15, color: "#eab308", borderBottom: "1px solid #334155", paddingBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                🎮 Mitmach-Modus (Human Player)
              </h3>
              {state.agents.some(a => a.id === "human-1") ? (() => {
                const me = state.agents.find(a => a.id === "human-1")!;
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 12, marginBottom: 12 }}>
                      <div>Name: <b style={{ color: "#eab308" }}>{me.name}</b></div>
                      <div>Status: <span style={{ color: "#cbd5e1" }}>{me.status}</span></div>
                      <div>Energy: <b style={{ color: "#10b981" }}>{me.energy}%</b></div>
                      <div>Resources: <b style={{ color: "#38bdf8" }}>{me.resources}%</b></div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        Position: <b>({me.position.x}, {me.position.y})</b><br />
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>
                          Abs: ({ (state.gridOriginX ?? 0) + me.position.x }, { (state.gridOriginY ?? 0) + me.position.y })
                        </span>
                      </div>
                    </div>

                    <div 
                      style={{ borderTop: "1px solid #334155", paddingTop: 10, textAlign: "center", position: "relative" }}
                      title="Steuerung: Nutze die Tasten W, A, S, D oder die Pfeiltasten auf deiner Tastatur während du dich auf der Weltkarte befindest. Alternativ kannst du direkt auf ein Feld der Weltkarte klicken, um dorthin zu reisen!"
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 16, padding: "6px 14px", fontSize: 11, cursor: "help", color: "#818cf8" }}>
                        🎮 <b>Move: keyboard WASD/Arrows</b> (Hover for Help)
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div>
                  <p style={{ margin: "0 0 8px 0", fontSize: 12, color: "#94a3b8" }}>
                    Betrete die Simulation als menschlicher Charakter und erkunde die unendliche Welt manuell!
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input 
                      type="text" 
                      placeholder="Dein Name..." 
                      value={playerNameInput}
                      onChange={(e) => setPlayerNameInput(e.target.value)}
                      style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#fff" }}
                    />
                    <button 
                      onClick={joinHumanPlayer}
                      disabled={isJoiningHuman || !playerNameInput.trim()}
                      style={{ background: "#eab308", color: "#000", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: "bold", cursor: "pointer" }}
                    >
                      {isJoiningHuman ? "Betrete..." : "Beitreten"}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </aside>

        </div>
      )}

      {/* MAP MANAGEMENT & SOURCES DASHBOARD */}
      {activeTab === "maps" && (
        <MapManagementBoard state={state} onRefresh={refresh} />
      )}

      {/* THREEFOLD SPHERE DASHBOARD: RECHTSSPHERE */}
      {activeTab === "recht" && (
        <RechtBoard state={state} managerSettings={managerSettings} updateManagerSettings={updateManagerSettings} />
      )}

      {/* THREEFOLD SPHERE DASHBOARD: GEISTESLEBEN */}
      {activeTab === "geist" && (
        <GeisteslebenBoard state={state} managerSettings={managerSettings} updateManagerSettings={updateManagerSettings} />
      )}

      {/* THREEFOLD SPHERE DASHBOARD: WIRTSCHAFTSLEBEN */}
      {activeTab === "wirtschaft" && (
        <WirtschaftBoard state={state} managerSettings={managerSettings} updateManagerSettings={updateManagerSettings} terrainStats={terrainStats} totalBerries={totalBerries} totalWaste={totalWaste} />
      )}

      {/* ADMIN CONTROL PANEL DASHBOARD */}
      {activeTab === "admin" && (
        <AdminBoard
          state={state}
          settings={settings}
          updateSettings={updateSettings}
          managerSettings={managerSettings}
          updateManagerSettings={updateManagerSettings}
          selectedAdminAgent={selectedAdminAgent}
          setSelectedAdminAgent={setSelectedAdminAgent}
          connectedRemoteURL={connectedRemoteURL}
          remoteURL={remoteURL}
          setRemoteURL={setRemoteURL}
          connectMultiplayer={connectMultiplayer}
          ownNodeName={ownNodeName}
          regenerate={regenerate}
          triggerScenario={triggerScenario}
          setActiveTab={setActiveTab}
        />
      )}

      {/* SYSTEM ABOUT / DOCUMENTATION DASHBOARD */}
      {activeTab === "about" && (
        <AboutModal aboutSubTab={aboutSubTab} setAboutSubTab={setAboutSubTab} />
      )}
    </main>
  );
}
