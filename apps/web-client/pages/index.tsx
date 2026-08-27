import { type CSSProperties, useEffect, useState, useRef, useMemo } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:18080";

type Interest = {
  name: string;
  intensity: number;
};

type Agreement = {
  partnerId: string;
  type: string;
  targetX: number;
  targetY: number;
  ticksLeft: number;
};

type Agent = {
  id: string;
  name: string;
  role: string;
  mood: string;
  status: string;
  energy: number;
  position: { x: number; y: number };
  target: { x: number; y: number };
  interests: Interest[];
  agreement?: Agreement | null;
  resources: number;
  waste: number;
};

type WorldObject = {
  type: string;
  amount: number;
  maxAmount: number;
};

type WorldState = {
  running: boolean;
  tick: number;
  tickRateMs: number;
  totalAgents: number;
  worldSize: { width: number; height: number };
  terrain: string[][];
  objects: WorldObject[][];
  agents: Agent[];
  events: string[];
  lastUpdated: string;
};

const initialState: WorldState = {
  running: false,
  tick: 0,
  tickRateMs: 500,
  totalAgents: 0,
  worldSize: { width: 96, height: 96 },
  terrain: Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => "grass")),
  objects: Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: "", amount: 0, maxAmount: 0 }))),
  agents: [],
  events: [],
  lastUpdated: "",
};

const terrainColors: Record<string, string> = {
  grass: "#155e75",   // Dark cyan/teal grass
  water: "#0c4a6e",   // Deep blue water
  forest: "#115e59",  // Deep green forest
  rock: "#374151",    // Dark gray rock
  home: "#7c2d12",    // Warm brown home/homestead
  road: "#475569",    // Slate gray road paths
  court: "#4338ca",   // Indigo court
  market: "#b45309",  // Amber market
  crops: "#4d7c0f",   // Lime green crops/farmland
};

const terrainLabels: Record<string, string> = {
  grass: "grass 🍀",
  water: "water 💧",
  forest: "forest 🌲",
  rock: "mountain ⛰️",
  home: "homestead 🏡",
  road: "road 🛣️",
  court: "court ⚖️",
  market: "market 🛒",
  crops: "crops 🌾",
};

const agentColors: Record<string, string> = {
  "Aster": "#10b981", // Emerald
  "Nyx": "#ef4444",   // Red
  "Pico": "#a855f7",  // Purple
  "Sora": "#f97316",  // Orange
  "Rook": "#ec4899",  // Pink
  "Vale": "#3b82f6",  // Blue
  "Juno": "#eab308",  // Yellow
  "Iris": "#06b6d4"   // Cyan
};

function InteractiveWorldMap({
  state,
  selectedAgent,
  setSelectedAgent,
}: {
  state: WorldState;
  selectedAgent: string | null;
  setSelectedAgent: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const [showGrid, setShowGrid] = useState(false);
  const [showPaths, setShowPaths] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [showAgentNames, setShowAgentNames] = useState(true);
  const [showSmoothAnim, setShowSmoothAnim] = useState(true);

  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [animTick, setAnimTick] = useState(0);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const originalOffset = useRef({ x: 0, y: 0 });

  const tileSize = 16;

  // Track previous positions and state update times for smooth movement interpolation
  const prevPositions = useRef<Record<string, { x: number; y: number }>>({});
  const lastUpdate = useRef<number>(Date.now());
  const lastStateRef = useRef<WorldState | null>(null);

  useEffect(() => {
    if (lastStateRef.current) {
      const prev: Record<string, { x: number; y: number }> = {};
      lastStateRef.current.agents?.forEach((agent) => {
        prev[agent.id] = { x: agent.position.x, y: agent.position.y };
      });
      prevPositions.current = prev;
      lastUpdate.current = Date.now();
    }
    lastStateRef.current = state;
  }, [state]);

  // Continuous animation frame loop for smooth movement and selection ring pulsing
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      setAnimTick((t) => t + 1);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Handle resizing of the container automatically
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = containerRef.current?.clientWidth ?? 800;
        const height = containerRef.current?.clientHeight ?? 650;
        setDimensions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const fitToScreen = () => {
    if (!state.worldSize || state.worldSize.width <= 0) return;
    const mapW = state.worldSize.width * tileSize;
    const mapH = state.worldSize.height * tileSize;

    const zoomW = (dimensions.width - 40) / mapW;
    const zoomH = (dimensions.height - 40) / mapH;
    const newZoom = Math.min(zoomW, zoomH, 2.0);

    setZoom(newZoom);
    setOffsetX((dimensions.width - mapW * newZoom) / 2);
    setOffsetY((dimensions.height - mapH * newZoom) / 2);
  };

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (state.worldSize.width > 0 && dimensions.width > 0) {
      if (!hasInitialized.current) {
        fitToScreen();
        if (dimensions.width !== 800 || dimensions.height !== 600) {
          hasInitialized.current = true;
        }
      }
    }
  }, [dimensions, state.worldSize]);

  // Mouse drag / pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    dragStart.current = { x: clientX, y: clientY };
    originalOffset.current = { x: offsetX, y: offsetY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (isDragging.current) {
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      setOffsetX(originalOffset.current.x + dx);
      setOffsetY(originalOffset.current.y + dy);
    }

    const tx = Math.floor((clientX - offsetX) / (tileSize * zoom));
    const ty = Math.floor((clientY - offsetY) / (tileSize * zoom));

    if (
      state.worldSize &&
      tx >= 0 &&
      tx < state.worldSize.width &&
      ty >= 0 &&
      ty < state.worldSize.height
    ) {
      setHoveredTile({ x: tx, y: ty });
      setTooltipPos({ x: clientX, y: clientY });
    } else {
      setHoveredTile(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const dx = clientX - dragStart.current.x;
        const dy = clientY - dragStart.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 4) {
          const tx = Math.floor((clientX - offsetX) / (tileSize * zoom));
          const ty = Math.floor((clientY - offsetY) / (tileSize * zoom));

          const clickedAgents = state.agents.filter(
            (a) => a.position.x === tx && a.position.y === ty
          );
          if (clickedAgents.length > 0) {
            const currentSelectedIdx = clickedAgents.findIndex((a) => a.id === selectedAgent);
            if (currentSelectedIdx === -1) {
              setSelectedAgent(clickedAgents[0].id);
            } else {
              const nextIdx = (currentSelectedIdx + 1) % clickedAgents.length;
              if (nextIdx === 0 && clickedAgents.length === 1) {
                setSelectedAgent(null);
              } else {
                setSelectedAgent(clickedAgents[nextIdx].id);
              }
            }
          } else {
            setSelectedAgent(null);
          }
        }
      }
    }
    isDragging.current = false;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    setHoveredTile(null);
  };

  // Raw Wheel listener to prevent page scrolling while zooming
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheelRaw = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const tileX = (clientX - offsetX) / zoom;
      const tileY = (clientY - offsetY) / zoom;

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(Math.max(0.1, zoom * factor), 10.0);

      setZoom(newZoom);
      setOffsetX(clientX - tileX * newZoom);
      setOffsetY(clientY - tileY * newZoom);
    };

    canvas.addEventListener("wheel", onWheelRaw, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheelRaw);
    };
  }, [zoom, offsetX, offsetY]);

  // Main Canvas Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    if (!state.terrain || state.terrain.length === 0) return;

    const mapWidth = state.worldSize.width;
    const mapHeight = state.worldSize.height;
    const size = tileSize * zoom;

    // Viewport culling coordinates
    const startX = Math.max(0, Math.floor(-offsetX / size));
    const endX = Math.min(mapWidth - 1, Math.ceil((dimensions.width - offsetX) / size));
    const startY = Math.max(0, Math.floor(-offsetY / size));
    const endY = Math.min(mapHeight - 1, Math.ceil((dimensions.height - offsetY) / size));

    // Render terrain grid
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const terrain = state.terrain[y]?.[x] ?? "grass";
        const px = x * size + offsetX;
        const py = y * size + offsetY;

        ctx.fillStyle = terrainColors[terrain] ?? "#155e75";
        ctx.fillRect(px, py, size, size);

        if (showGrid && size > 4) {
          ctx.strokeStyle = "rgba(15, 23, 42, 0.25)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, size, size);
        }

        if (showResources) {
          const obj = state.objects?.[y]?.[x];
          if (obj && obj.type) {
            if (terrain === "forest" && obj.type === "berries") {
              ctx.fillStyle = "rgba(13, 148, 136, 0.4)";
              ctx.beginPath();
              ctx.arc(px + size / 2, py + size * 0.4, size * 0.35, 0, 2 * Math.PI);
              ctx.fill();

              if (obj.amount > 0) {
                ctx.fillStyle = "#f43f5e";
                const berrySize = Math.max(1.5, size * 0.08);
                if (obj.amount >= 75) {
                  ctx.beginPath(); ctx.arc(px + size * 0.35, py + size * 0.35, berrySize, 0, 2 * Math.PI); ctx.fill();
                  ctx.beginPath(); ctx.arc(px + size * 0.65, py + size * 0.35, berrySize, 0, 2 * Math.PI); ctx.fill();
                  ctx.beginPath(); ctx.arc(px + size * 0.5, py + size * 0.6, berrySize, 0, 2 * Math.PI); ctx.fill();
                } else if (obj.amount >= 30) {
                  ctx.beginPath(); ctx.arc(px + size * 0.35, py + size * 0.4, berrySize, 0, 2 * Math.PI); ctx.fill();
                  ctx.beginPath(); ctx.arc(px + size * 0.6, py + size * 0.5, berrySize, 0, 2 * Math.PI); ctx.fill();
                } else {
                  ctx.beginPath(); ctx.arc(px + size * 0.5, py + size * 0.45, berrySize, 0, 2 * Math.PI); ctx.fill();
                }
              } else {
                ctx.fillStyle = "#4c3a21";
                ctx.fillRect(px + size * 0.4, py + size * 0.55, size * 0.2, size * 0.3);
              }
            } else if (terrain === "rock" && obj.type === "waste_pile") {
              if (obj.amount > 0) {
                ctx.fillStyle = obj.amount > 60 ? "#dc2626" : "#78716c";
                ctx.beginPath();
                ctx.moveTo(px + size * 0.2, py + size * 0.85);
                ctx.lineTo(px + size * 0.5, py + size * 0.25);
                ctx.lineTo(px + size * 0.8, py + size * 0.85);
                ctx.closePath();
                ctx.fill();

                if (size > 12 && obj.amount > 60) {
                  ctx.fillStyle = "#ffffff";
                  ctx.font = `bold ${Math.max(6, size * 0.4)}px sans-serif`;
                  ctx.textAlign = "center";
                  ctx.fillText("!", px + size / 2, py + size * 0.7);
                }
              }
            }
          }

          if (terrain === "home") {
            ctx.fillStyle = "#ea580c";
            ctx.beginPath();
            ctx.moveTo(px + size * 0.15, py + size * 0.45);
            ctx.lineTo(px + size * 0.5, py + size * 0.15);
            ctx.lineTo(px + size * 0.85, py + size * 0.45);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#ffedd5";
            ctx.fillRect(px + size * 0.22, py + size * 0.45, size * 0.56, size * 0.4);

            ctx.fillStyle = "#7c2d12";
            ctx.fillRect(px + size * 0.4, py + size * 0.58, size * 0.2, size * 0.27);
          }

          if (terrain === "court") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⚖️", px + size / 2, py + size / 2);
            }
          }

          if (terrain === "market") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🛒", px + size / 2, py + size / 2);
            }
          }

          if (terrain === "crops") {
            const cropObj = state.objects?.[y]?.[x];
            if (cropObj && cropObj.type === "crops" && cropObj.amount > 0) {
              if (size > 10) {
                ctx.fillStyle = "#ffffff";
                ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("🌾", px + size / 2, py + size / 2);
              } else {
                ctx.fillStyle = cropObj.amount > 50 ? "#eab308" : "#854d0e";
                ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
              }
            } else {
              ctx.fillStyle = "#78350f";
              ctx.fillRect(px + size * 0.3, py + size * 0.6, size * 0.4, size * 0.2);
            }
          }
        }
      }
    }

    // Render agent targets & paths
    if (showPaths) {
      state.agents.forEach((agent) => {
        const isSelected = selectedAgent === agent.id;
        if (agent.target && (agent.target.x !== agent.position.x || agent.target.y !== agent.position.y)) {
          let renderX = agent.position.x;
          let renderY = agent.position.y;

          if (showSmoothAnim) {
            const prev = prevPositions.current[agent.id];
            if (prev) {
              const elapsed = Date.now() - lastUpdate.current;
              const t = Math.min(1.0, elapsed / 500);
              const dx = agent.position.x - prev.x;
              const dy = agent.position.y - prev.y;
              if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                renderX = prev.x + dx * t;
                renderY = prev.y + dy * t;
              }
            }
          }

          const ax = (renderX + 0.5) * size + offsetX;
          const ay = (renderY + 0.5) * size + offsetY;
          const tx = (agent.target.x + 0.5) * size + offsetX;
          const ty = (agent.target.y + 0.5) * size + offsetY;

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = isSelected ? "#eab308" : "rgba(224, 242, 254, 0.4)";
          ctx.lineWidth = isSelected ? 2.5 : 1.2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(tx, ty, size * 0.35, 0, 2 * Math.PI);
          ctx.strokeStyle = isSelected ? "#f59e0b" : "#ef4444";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.beginPath();
          const cross = size * 0.15;
          ctx.moveTo(tx - cross, ty); ctx.lineTo(tx + cross, ty);
          ctx.moveTo(tx, ty - cross); ctx.lineTo(tx, ty + cross);
          ctx.strokeStyle = isSelected ? "#f59e0b" : "#ef4444";
          ctx.stroke();
        }
      });
    }

    // Render agents
    state.agents.forEach((agent) => {
      let renderX = agent.position.x;
      let renderY = agent.position.y;

      if (showSmoothAnim) {
        const prev = prevPositions.current[agent.id];
        if (prev) {
          const elapsed = Date.now() - lastUpdate.current;
          const t = Math.min(1.0, elapsed / 500);
          const dx = agent.position.x - prev.x;
          const dy = agent.position.y - prev.y;
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            renderX = prev.x + dx * t;
            renderY = prev.y + dy * t;
          }
        }
      }

      const ax = (renderX + 0.5) * size + offsetX;
      const ay = (renderY + 0.5) * size + offsetY;
      let r = size * 0.4;
      r = Math.max(5, r);

      const isSelected = selectedAgent === agent.id;
      const color = agentColors[agent.name] ?? "#3b82f6";

      if (isSelected) {
        const pulse = 1.25 + 0.15 * Math.sin(Date.now() / 120);
        ctx.beginPath();
        ctx.arc(ax, ay, r * pulse, 0, 2 * Math.PI);
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
        ctx.beginPath();
        ctx.arc(ax, ay, r * pulse, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(ax, ay, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = isSelected ? "#ffffff" : "#0f172a";
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.stroke();

      if (size > 14) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(9, r * 1.1)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(agent.name.slice(0, 1), ax, ay);
      }

      if (showAgentNames && size > 16) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        const txt = agent.name;
        ctx.font = "bold 10px sans-serif";
        const txtWidth = ctx.measureText(txt).width;

        ctx.fillRect(ax - txtWidth / 2 - 4, ay - r - 15, txtWidth + 8, 14);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.strokeRect(ax - txtWidth / 2 - 4, ay - r - 15, txtWidth + 8, 14);

        ctx.fillStyle = isSelected ? "#fef08a" : "#f8fafc";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(txt, ax, ay - r - 13);
      }
    });

    // Render hover border highlight
    if (hoveredTile) {
      const px = hoveredTile.x * size + offsetX;
      const py = hoveredTile.y * size + offsetY;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, size, size);
    }
  }, [
    state,
    selectedAgent,
    zoom,
    offsetX,
    offsetY,
    showGrid,
    showPaths,
    showResources,
    showAgentNames,
    showSmoothAnim,
    dimensions,
    hoveredTile,
    animTick,
  ]);

  const btnMiniStyle: CSSProperties = {
    padding: "5px 10px",
    background: "#1e293b",
    color: "#f1f5f9",
    border: "1px solid #475569",
    borderRadius: 6,
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 11,
    pointerEvents: "auto",
  };

  const checkboxLabelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 12,
        overflow: "hidden",
        width: "100%",
        height: "100%",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Top Controls Overlay */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
          <button style={btnMiniStyle} onClick={() => setZoom((z) => Math.min(10, z * 1.25))} title="Zoom In">➕</button>
          <button style={btnMiniStyle} onClick={() => setZoom((z) => Math.max(0.1, z / 1.25))} title="Zoom Out">➖</button>
          <button style={btnMiniStyle} onClick={fitToScreen} title="Fit Map">🔍 Fit</button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            background: "rgba(15, 23, 42, 0.85)",
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #334155",
            pointerEvents: "auto",
            fontSize: 12,
            color: "#cbd5e1",
          }}
        >
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} />
            Paths
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showResources} onChange={(e) => setShowResources(e.target.checked)} />
            Resources
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showAgentNames} onChange={(e) => setShowAgentNames(e.target.checked)} />
            Names
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showSmoothAnim} onChange={(e) => setShowSmoothAnim(e.target.checked)} />
            Smooth
          </label>
        </div>
      </div>

      {/* Main Canvas Node */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ display: "block", width: "100%", height: "100%", cursor: isDragging.current ? "grabbing" : "grab" }}
      />

      {/* Float Tooltip */}
      {hoveredTile && (() => {
        const x = hoveredTile.x;
        const y = hoveredTile.y;
        const terrain = state.terrain?.[y]?.[x];
        const obj = state.objects?.[y]?.[x];
        const cellAgents = state.agents.filter((a) => a.position.x === x && a.position.y === y);

        if (!terrain) return null;

        const tooltipX = tooltipPos.x + 15 + 210 > dimensions.width ? tooltipPos.x - 225 : tooltipPos.x + 15;
        const tooltipY = tooltipPos.y + 15 + 150 > dimensions.height ? tooltipPos.y - 130 : tooltipPos.y + 15;

        return (
          <div
            style={{
              position: "absolute",
              left: tooltipX,
              top: tooltipY,
              zIndex: 20,
              width: 210,
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid #38bdf8",
              borderRadius: 8,
              padding: 10,
              fontSize: 12,
              pointerEvents: "none",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)",
              color: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: "bold", borderBottom: "1px solid #334155", paddingBottom: 4, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#38bdf8" }}>Tile ({x}, {y})</span>
              <span style={{ color: "#cbd5e1", textTransform: "capitalize" }}>{terrain}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {obj && obj.type && (
                <div>
                  Resource: <b style={{ textTransform: "capitalize", color: obj.type === "berries" ? "#f43f5e" : "#ea580c" }}>{obj.type.replace("_", " ")}</b> ({obj.amount}/100)
                </div>
              )}
              {cellAgents.length > 0 ? (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: "bold", color: "#eab308", marginBottom: 2 }}>Agents ({cellAgents.length}):</div>
                  {cellAgents.map((a) => (
                    <div key={a.id} style={{ fontSize: 11, borderLeft: `2px solid ${agentColors[a.name] ?? "#3b82f6"}`, paddingLeft: 4, marginBottom: 4 }}>
                      <b>{a.name}</b> ({a.role})<br />
                      Status: <span style={{ color: "#cbd5e1" }}>{a.status}</span><br />
                      Energy: <span style={{ color: a.energy < 30 ? "#ef4444" : "#10b981", fontWeight: "bold" }}>{a.energy}%</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })()}

      {/* Coordinate status */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          background: "rgba(15, 23, 42, 0.8)",
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 11,
          color: "#94a3b8",
          fontFamily: "monospace",
          pointerEvents: "none",
        }}
      >
        Zoom: {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<WorldState>(initialState);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "admin">("map");
  const [settings, setSettings] = useState({ riverWidth: 2, lakesDensity: 0.20, berriesDensity: 0.20 });
  const [remoteURL, setRemoteURL] = useState("");
  const [connectedRemoteURL, setConnectedRemoteURL] = useState("");

  async function refresh() {
    try {
      const res = await fetch(`${API}/api/state`);
      if (res.ok) {
        const nextState = await res.json();
        setState(nextState);
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

  useEffect(() => {
    refresh();
    fetchSettings();
    fetchMultiplayer();

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
    }, 1000);

    return () => {
      socket.close();
      clearInterval(fallbackPoll);
    };
  }, []);

  // Compute dynamic resource statistics
  const terrainStats = { grass: 0, water: 0, forest: 0, rock: 0, home: 0, road: 0 };
  let totalBerries = 0;
  let totalWaste = 0;

  if (state.terrain) {
    for (let y = 0; y < state.terrain.length; y++) {
      for (let x = 0; x < state.terrain[y].length; x++) {
        const t = state.terrain[y][x];
        if (t in terrainStats) {
          terrainStats[t as keyof typeof terrainStats]++;
        }
        const obj = state.objects?.[y]?.[x];
        if (obj) {
          if (obj.type === "berries") {
            totalBerries += obj.amount;
          } else if (obj.type === "waste_pile") {
            totalWaste += obj.amount;
          }
        }
      }
    }
  }

  // Pre-flatten cell representations removed in favor of high-performance HTML5 Canvas rendering.

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

  const tabStyle = (tab: "map" | "admin"): CSSProperties => ({
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
    <main style={{ fontFamily: "sans-serif", padding: 24, background: "#0f172a", color: "#f8fafc", height: "100vh", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
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
      `}</style>

      {/* Header Panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid #334155", paddingBottom: 12, flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, color: "#38bdf8", fontSize: 28, letterSpacing: "-0.02em" }}>IA3 SimWorld</h1>
          <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: 13 }}>Distributed Social Multi-Agent Simulation with Mesa & Go</p>
        </div>

        {/* Tab Navigation in Header */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={tabStyle("map")} onClick={() => setActiveTab("map")}>Live Map Grid</button>
          <button style={tabStyle("admin")} onClick={() => setActiveTab("admin")}>Admin Dashboard</button>
        </div>

        <div style={{ display: "flex", gap: 16, textAlign: "right" }}>
          <div>
            <div style={headerLabel}>Multiplayer Mode</div>
            <strong style={{ color: connectedRemoteURL ? "#10b981" : "#94a3b8" }}>
              {connectedRemoteURL ? "🌍 Shared World" : "🌍 Local Host"}
            </strong>
          </div>
          <div>
            <div style={headerLabel}>Game Nodes</div>
            <strong style={{ color: connectedRemoteURL ? "#10b981" : "#38bdf8" }}>
              {connectedRemoteURL ? "2 (ia3, ia3-two)" : "1 (ia3)"}
            </strong>
          </div>
          <div>
            <div style={headerLabel}>Simulation Time</div>
            <strong style={{ color: phaseColor }}>{phase} ({timeStr})</strong>
          </div>
          <div>
            <div style={headerLabel}>Engine State</div>
            <strong style={{ color: state.running ? "#10b981" : "#ef4444" }}>{state.running ? "ACTIVE" : "PAUSED"}</strong>
          </div>
          <div>
            <div style={headerLabel}>Tick</div>
            <strong>#{state.tick}</strong>
          </div>
          <div>
            <div style={headerLabel}>World Size</div>
            <strong>{state.worldSize.width}x{state.worldSize.height}</strong>
          </div>
          <div>
            <div style={headerLabel}>Image Version</div>
            <strong style={{ color: "#38bdf8" }}>v1.0.70</strong>
          </div>
        </div>
      </div>

      {/* Controls Bar - Only visible in Live Map View */}
      {activeTab === "map" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <button style={btnStyle} onClick={start}>▶ Start</button>
          <button style={btnStyle} onClick={pause}>⏸ Pause</button>
          <button style={btnStyle} onClick={regenerate}>🔄 Regenerate Landscape</button>
        </div>
      )}

      {/* ACTIVE TAB: LIVE MAP GRID */}
      {activeTab === "map" && (
        <div style={{ display: "flex", flex: 1, gap: 24, minHeight: 0, overflow: "hidden" }}>
          
          {/* Left Column: Map Container */}
          <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, gap: 12, height: "100%" }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <InteractiveWorldMap
                state={state}
                selectedAgent={selectedAgent}
                setSelectedAgent={setSelectedAgent}
              />
            </div>

            {/* Terrain Legend under map */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {Object.entries(terrainColors).map(([terrain, color]) => (
                <span key={terrain} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, background: "#1e293b", padding: "4px 10px", borderRadius: 6, border: "1px solid #334155" }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: color }} />
                  <span style={{ textTransform: "capitalize", fontWeight: "bold" }}>
                    {terrainLabels[terrain] ?? terrain}
                  </span>
                </span>
              ))}
            </div>
          </section>

          {/* Right Column: Unified Sidebar */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 16, width: 380, height: "100%", overflowY: "auto", paddingRight: 4, flexShrink: 0 }}>
            
            {/* 1. Active Agent Table in Sidebar (Compact) */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 15, color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 6 }}>
                Active Agents
              </h3>
              <div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "4px 6px" }}>Color</th>
                      <th style={{ padding: "4px 6px" }}>Name</th>
                      <th style={{ padding: "4px 6px" }}>Status</th>
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
                          <td style={{ padding: "6px", color: "#94a3b8" }}>{agent.status}</td>
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

            {/* 2. Selected Agent Detail Card */}
            {selectedAgent ? (() => {
              const agent = state.agents.find(a => a.id === selectedAgent);
              if (!agent) return null;
              const col = agentColors[agent.name] ?? "#3b82f6";
              return (
                <div style={{ border: `1px solid ${col}`, borderRadius: 12, background: "#1e293b", padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: col }} />
                    <h3 style={{ margin: 0, fontSize: 16, color: "#38bdf8" }}>{agent.name} Details</h3>
                  </div>
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

                  {agent.agreement && (
                    <div style={{ marginTop: 12, background: "#1e1b4b", padding: 8, borderRadius: 6, border: "1px solid #4338ca" }}>
                      <p style={{ margin: "0 0 4px 0", color: "#818cf8", fontSize: 12, fontWeight: "bold" }}>📜 Active Agreement:</p>
                      <p style={{ margin: "2px 0", fontSize: 12 }}>Partner: <b>{state.agents.find(a => a.id === agent.agreement?.partnerId)?.name || agent.agreement?.partnerId}</b></p>
                      <p style={{ margin: "2px 0", fontSize: 12 }}>Type: <b style={{ textTransform: "uppercase" }}>{agent.agreement?.type}</b> ({agent.agreement?.ticksLeft} ticks left)</p>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div style={{ padding: 16, background: "#1e293b", border: "1px dashed #475569", borderRadius: 12, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                💡 Click on an agent in the map or sidebar to display live statistics and details.
              </div>
            )}

            {/* 3. Live Event Feed (Scrolling) */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: 15, color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 6 }}>
                Live Event Feed
              </h3>
              <div style={{ height: 360, overflowY: "auto", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {state.events && state.events.length > 0 ? (
                  state.events.map((event, idx) => (
                    <div key={idx} style={{ padding: "4px 8px", background: "#0f172a", borderRadius: 4, borderLeft: "3px solid #38bdf8", color: "#cbd5e1" }}>
                      {event}
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", marginTop: 40 }}>Waiting for simulation events...</div>
                )}
              </div>
            </div>

          </aside>
        </div>
      )}

      {/* ACTIVE TAB: ADMIN DASHBOARD */}
      {activeTab === "admin" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingBottom: 16 }}>
          
          {/* Left Panel: Resource Stats & Interests */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Resource statistics */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
                World Resource Statistics
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
                    <div style={{ background: "#10b981", width: `${Math.min(100, (totalBerries / (terrainStats.forest * 100)) * 100)}%`, height: "100%" }} />
                  </div>
                </div>
                <div style={{ background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #334155", gridColumn: "span 2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={headerLabel}>Total Waste / Garbage Piled up</span>
                    <strong style={{ color: "#ef4444" }}>{totalWaste} units</strong>
                  </div>
                  <div style={{ background: "#1e293b", height: 10, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ background: "#ef4444", width: `${Math.min(100, (totalWaste / (terrainStats.rock * 100)) * 100)}%`, height: "100%" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Interest distribution and intensity matrix */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
                Agent Interests Management
              </h3>
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

          </div>

          {/* Right Panel: Agreements Logic & Matrix */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 14px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8 }}>
              Cooperation agreements (Vereinbarungen)
            </h3>
            
            {/* Agreements definitions */}
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

            {/* Currently active agreements listing */}
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

            {/* Landscape settings */}
            <div style={{ background: "#0f172a", padding: 16, borderRadius: 12, border: "1px solid #334155", marginTop: 24 }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 14 }}>Landscape Generation Settings</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>River Width (Flussbreite)</label>
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
                  onClick={regenerate} 
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

            {/* Multiplayer / Shared World Connection */}
            <div style={{ background: "#0f172a", padding: 16, borderRadius: 12, border: "1px solid #334155", marginTop: 24 }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#38bdf8", fontSize: 14 }}>🌍 Multiplayer & Shared World</h4>
              <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#94a3b8" }}>
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
                      background: "#1e293b", 
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
        </div>
      </div>
    )}

    </main>
  );
}