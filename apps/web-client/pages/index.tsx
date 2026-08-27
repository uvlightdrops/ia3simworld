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
  missionsCompleted?: number;
  missionsAborted?: number;
  socializedCount?: number;
  refusedSocializeCount?: number;
  history?: string[];
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
  grassPolicy?: string;
  forestPolicy?: string;
  activeLaws?: string[];
  gridOriginX?: number;
  gridOriginY?: number;
  discoveredSectors?: string[];
  activeScenario?: string;
  scenarioState?: string;
  scenarioTargetX?: number;
  scenarioTargetY?: number;
  scenarioTicksLeft?: number;
  activeInteraction?: {
    npcId: string;
    npcName: string;
    text: string;
    options: string[];
    ticksLeft: number;
    requestType: string;
  };
  autoAnswerMode?: string;
  relicSpawnRate?: number;
  lawProposeRate?: number;
  econEventRate?: number;
  artifactQuality?: number;
  managerAThoughts?: string[];
  managerBThoughts?: string[];
  managerCThoughts?: string[];
};

const initialState: WorldState = {
  running: false,
  tick: 0,
  tickRateMs: 500,
  totalAgents: 0,
  worldSize: { width: 256, height: 256 },
  terrain: Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => "grass")),
  objects: Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => ({ type: "", amount: 0, maxAmount: 0 }))),
  agents: [],
  events: [],
  lastUpdated: "",
  grassPolicy: "agriculture",
  forestPolicy: "berries",
  activeLaws: [],
  gridOriginX: 0,
  gridOriginY: 0,
  discoveredSectors: ["(0, 0)"],
  activeScenario: "",
  scenarioState: "",
  scenarioTargetX: 0,
  scenarioTargetY: 0,
  scenarioTicksLeft: 0,
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
  const [showPaths, setShowPaths] = useState(false);
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
            // Direct map click sets human player target if human-1 exists!
            const humanExists = state.agents.some((a) => a.id === "human-1");
            if (humanExists) {
              fetch(`${API}/api/control/move-human`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ useTarget: true, targetX: tx, targetY: ty }),
              });
            }
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

    // DRAW FESTIVAL CAMPSITE OVERLAY
    if (state.activeScenario === "festival" && typeof state.scenarioTargetX === "number" && typeof state.scenarioTargetY === "number") {
      const tx = state.scenarioTargetX;
      const ty = state.scenarioTargetY;
      const px = tx * size + offsetX;
      const py = ty * size + offsetY;

      // Draw a cozy glowing campfire or bonfire in the center of state.scenarioTarget tile
      const pulseRadius = size * (0.8 + 0.2 * Math.sin(Date.now() / 150));
      const gradient = ctx.createRadialGradient(
        px + size / 2, py + size / 2, size * 0.1,
        px + size / 2, py + size / 2, pulseRadius
      );
      gradient.addColorStop(0, "rgba(249, 115, 22, 0.8)"); // Warm orange
      gradient.addColorStop(0.5, "rgba(234, 179, 8, 0.4)"); // Bright yellow
      gradient.addColorStop(1, "rgba(234, 88, 12, 0)"); // Fading edge

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px + size / 2, py + size / 2, pulseRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Draw bonfire logs cross structure
      ctx.strokeStyle = "#451a03"; // Very dark brown log color
      ctx.lineWidth = Math.max(1.5, size * 0.12);
      ctx.beginPath();
      // Log 1
      ctx.moveTo(px + size * 0.3, py + size * 0.7);
      ctx.lineTo(px + size * 0.7, py + size * 0.3);
      // Log 2
      ctx.moveTo(px + size * 0.3, py + size * 0.3);
      ctx.lineTo(px + size * 0.7, py + size * 0.7);
      ctx.stroke();

      // Draw central glowing fire core (animated flame)
      ctx.fillStyle = "#ef4444"; // Red flame base
      ctx.beginPath();
      ctx.moveTo(px + size * 0.5, py + size * 0.2);
      ctx.quadraticCurveTo(px + size * 0.3, py + size * 0.55, px + size * 0.4, py + size * 0.7);
      ctx.lineTo(px + size * 0.6, py + size * 0.7);
      ctx.quadraticCurveTo(px + size * 0.7, py + size * 0.55, px + size * 0.5, py + size * 0.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#f97316"; // Orange inner flame
      ctx.beginPath();
      ctx.moveTo(px + size * 0.5, py + size * 0.35);
      ctx.quadraticCurveTo(px + size * 0.38, py + size * 0.58, px + size * 0.44, py + size * 0.68);
      ctx.lineTo(px + size * 0.56, py + size * 0.68);
      ctx.quadraticCurveTo(px + size * 0.62, py + size * 0.58, px + size * 0.5, py + size * 0.35);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#eab308"; // Yellow hot center
      ctx.beginPath();
      ctx.moveTo(px + size * 0.5, py + size * 0.48);
      ctx.quadraticCurveTo(px + size * 0.44, py + size * 0.6, px + size * 0.46, py + size * 0.66);
      ctx.lineTo(px + size * 0.54, py + size * 0.66);
      ctx.quadraticCurveTo(px + size * 0.56, py + size * 0.6, px + size * 0.5, py + size * 0.48);
      ctx.closePath();
      ctx.fill();

      // Draw rising fire sparks (small embers)
      ctx.fillStyle = "#f97316";
      const numSparks = 5;
      for (let i = 0; i < numSparks; i++) {
        const sparkTime = (Date.now() / 1000 + i * 0.3) % 1;
        const sx = px + size * 0.5 + Math.sin(sparkTime * 6) * size * 0.2;
        const sy = py + size * 0.5 - sparkTime * size * 1.1; // Spark rises up
        const sparkRadius = Math.max(1, size * 0.05 * (1 - sparkTime));
        ctx.beginPath();
        ctx.arc(sx, sy, sparkRadius, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Draw cozy festival tents adjacent to bonfire (let's place 4 beautiful tents)
      const drawTent = (offsetX_tiles, offsetY_tiles, colorMain, colorStripe) => {
        const tpx = (tx + offsetX_tiles) * size + offsetX;
        const tpy = (ty + offsetY_tiles) * size + offsetY;

        // Draw tent body triangle
        ctx.fillStyle = colorMain;
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.1, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.9, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        // Draw colorful stripe in the middle
        ctx.fillStyle = colorStripe;
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.4, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.6, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        // Draw dark tent entrance flap
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.35, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.5);
        ctx.lineTo(tpx + size * 0.65, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        // Draw cute tent flags
        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.62, tpy + size * 0.12);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.15);
        ctx.closePath();
        ctx.fill();
      };

      drawTent(-1, 0, "#0ea5e9", "#eab308"); // Blue & yellow tent on left
      drawTent(1, 0, "#10b981", "#f43f5e");  // Green & pink tent on right
      drawTent(0, -1, "#ec4899", "#ffffff"); // Pink & white tent on top
      drawTent(0, 1, "#8b5cf6", "#f97316");  // Purple & orange tent on bottom
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
              <span style={{ color: "#38bdf8" }}>Tile ({x}, {y}) [Abs: { (state.gridOriginX ?? 0) + x }, { (state.gridOriginY ?? 0) + y }]</span>
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
  const [selectedAdminAgent, setSelectedAdminAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "recht" | "geist" | "wirtschaft" | "admin" | "about">("map");
  const [aboutSubTab, setAboutSubTab] = useState<string>("architecture");
  const [settings, setSettings] = useState({ riverWidth: 4, lakesDensity: 0.20, berriesDensity: 0.20, tickRateMs: 2000 });
  const [managerSettings, setManagerSettings] = useState({ relicSpawnRate: 80, lawProposeRate: 140, econEventRate: 100, artifactQuality: 100 });
  const [remoteURL, setRemoteURL] = useState("");
  const [connectedRemoteURL, setConnectedRemoteURL] = useState("");
  const [hasReplicaNode, setHasReplicaNode] = useState(false);
  const [ownNodeName, setOwnNodeName] = useState("ia3");

  const [playerNameInput, setPlayerNameInput] = useState("");
  const [isJoiningHuman, setIsJoiningHuman] = useState(false);

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
      const res = await fetch(`${API}/api/state`);
      if (res.ok) {
        const nextState = await res.json();
        setState(nextState);
        if (nextState.relicSpawnRate) {
          setManagerSettings({
            relicSpawnRate: nextState.relicSpawnRate,
            lawProposeRate: nextState.lawProposeRate,
            econEventRate: nextState.econEventRate,
            artifactQuality: nextState.artifactQuality
          });
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
    refresh();
    fetchSettings();
    fetchMultiplayer();

    if (typeof window !== "undefined") {
      if (window.location.port === "13001") {
        setOwnNodeName("ia3-two");
      } else if (window.location.port === "13002") {
        setOwnNodeName("ia3-three");
      } else {
        setOwnNodeName("ia3");
      }
    }

    // Check if second instance is active (for Primary on port 13000)
    if (typeof window !== "undefined" && window.location.port === "13000") {
      fetch("http://localhost:18081/healthz")
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

  const tabStyle = (tab: "map" | "recht" | "geist" | "wirtschaft" | "admin" | "about"): CSSProperties => ({
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
        <div style={{ display: "flex", gap: 6 }}>
          <button style={tabStyle("map")} onClick={() => setActiveTab("map")}>🗺️ Live Map</button>
          <button style={tabStyle("recht")} onClick={() => setActiveTab("recht")}>⚖️ Rechtssphäre</button>
          <button style={tabStyle("geist")} onClick={() => setActiveTab("geist")}>📖 Geistesleben</button>
          <button style={tabStyle("wirtschaft")} onClick={() => setActiveTab("wirtschaft")}>🌾 Wirtschaftsleben</button>
          <button style={tabStyle("admin")} onClick={() => setActiveTab("admin")}>⚙️ Admin</button>
          <button style={tabStyle("about")} onClick={() => setActiveTab("about")}>ℹ️ About</button>
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
            <strong style={{ color: (connectedRemoteURL || hasReplicaNode) ? "#10b981" : "#38bdf8" }}>
              {ownNodeName === "ia3"
                ? (hasReplicaNode ? "ia3, ia3-two" : "ia3")
                : (connectedRemoteURL ? "ia3-two, ia3" : "ia3-two")
              }
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

      {/* Controls Bar - Only visible in Live Map View */}
      {activeTab === "map" && (
        (connectedRemoteURL || ownNodeName !== "ia3") ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "rgba(56, 189, 248, 0.1)", padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", fontSize: 13 }}>
            <span>🔒 Simulation controlled by Master Node: <b>{connectedRemoteURL || "ia3"}</b> (Observer / Client Mode)</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexShrink: 0 }}>
            <button style={btnStyle} onClick={start}>▶ Start</button>
            <button style={btnStyle} onClick={pause}>⏸ Pause</button>
            <button style={btnStyle} onClick={regenerate}>🔄 Regenerate Landscape</button>
          </div>
        )
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
            
            {/* 🎮 Playable Character (Mitmach-Modus) */}
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

            {/* Agent Collaboration Rates Card */}
            <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: 15, color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📊 Agent Collaboration Rates</span>
                <span style={{ fontSize: 10, background: "#0f172a", padding: "2px 6px", borderRadius: 10, color: "#94a3b8" }}>Overview</span>
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                {state.agents.map((agent) => {
                  const c = agentColors[agent.name] ?? "#3b82f6";
                  const completed = agent.missionsCompleted ?? 0;
                  const aborted = agent.missionsAborted ?? 0;
                  const socialized = agent.socializedCount ?? 0;
                  const refused = agent.refusedSocializeCount ?? 0;
                  return (
                    <div key={agent.id} style={{ background: "#0f172a", padding: "6px 8px", borderRadius: 6, display: "flex", flexDirection: "column", gap: 4, borderLeft: `3px solid ${c}` }}>
                      <div style={{ fontWeight: "bold", fontSize: 12, color: "#f8fafc", display: "flex", justifyContent: "space-between" }}>
                        <span>{agent.name}</span>
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>{agent.role}</span>
                      </div>
                      <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
                        <span>Missions: <b style={{ color: "#10b981" }}>{completed}</b> / <b style={{ color: "#ef4444" }}>{aborted}</b></span>
                        <span>Social: <b style={{ color: "#10b981" }}>{socialized}</b> / <b style={{ color: "#f59e0b" }}>{refused}</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Territorial Laws & Policies Panel moved to Rechtssphäre tab */}

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

      {/* THREEFOLD SPHERE DASHBOARD: RECHTSSPHÄRE */}
      {activeTab === "recht" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          
          {/* Tribunal Territory Laws Box (Moved from Frontpage Sidebar) */}
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 16 }}>⚖️ Tribunal Territory Laws Summary</span>
              <span style={{ fontSize: 11, background: "#334155", padding: "2px 8px", borderRadius: 10, color: "#94a3b8" }}>Weekly Negotiation (120 Ticks)</span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingBottom: 16 }}>
            
            {/* Left Panel: Active Policies & Courtroom Stance */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

              {/* Stance on Negotiations */}
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
            </div>

            {/* Right Panel: Passed Legislation & Active Laws list */}
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

            {/* Right Panel: Executive Land Registry Widget */}
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

            {/* Rechtssphäre AI Game Manager Admin Controls */}
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

            {/* Rechtssphäre AI Thoughts Stream */}
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
      )}

      {/* THREEFOLD SPHERE DASHBOARD: GEISTESLEBEN */}
      {activeTab === "geist" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingBottom: 16 }}>
            
            {/* Left Panel: Agent Interests Management */}
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

            {/* Right Panel: Relics and Spreading logs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

              {/* Social Learning log */}
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

              {/* Geistesleben AI Game Manager Admin Controls */}
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

              {/* Geistesleben AI Thoughts Stream */}
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
        </div>
      )}

      {/* THREEFOLD SPHERE DASHBOARD: WIRTSCHAFTSLEBEN */}
      {activeTab === "wirtschaft" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingBottom: 16 }}>
            
            {/* Left Panel: Resource statistics */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

              {/* Climate and weather disasters log */}
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
            </div>

            {/* Right Panel: Agreements Logic & Matrix */}
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

            {/* Wirtschaftsleben AI Game Manager Admin Controls */}
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

            {/* Wirtschaftsleben AI Thoughts Stream */}
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
      )}

      {/* REFACTORED SYSTEM ADMIN DASHBOARD */}
      {activeTab === "admin" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, paddingBottom: 16 }}>
            
            {/* Left Panel: Simulation Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Landscape & Speed Settings - Only visible for Master Node */}
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
              )}

              {/* Collective Scenario Engine */}
              {!connectedRemoteURL && ownNodeName === "ia3" && (
                <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155", marginTop: 24 }}>
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
                          width: state.scenarioState === "gathering" ? "33%" : state.scenarioState === "active" ? `${(state.scenarioTicksLeft / 24) * 100}%` : "80%",
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
            </div>

            {/* Right Panel: K8s and Multiplayer Configuration */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Multiplayer / Shared World Connection */}
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
                          <h4 style={{ margin: 0, fontSize: 18, color: "#f8fafc" }}>
                            {agent.name} <span style={{ fontSize: 12, fontWeight: "normal", color: "#94a3b8", background: "#1e293b", padding: "2px 8px", borderRadius: 10, marginLeft: 6 }}>{agent.id}</span>
                          </h4>
                          <span style={{ fontSize: 12, color: c, fontWeight: "bold" }}>{agent.role} &bull; Mood: {agent.mood}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>Current Action:</span>
                          <div style={{ fontSize: 13, fontWeight: "bold", color: "#eab308" }}>{agent.status}</div>
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                        <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155", textAlign: "center" }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>⚡ Vital Energy</span>
                          <div style={{ fontSize: 16, fontWeight: "bold", color: "#10b981", marginTop: 4 }}>{agent.energy}%</div>
                        </div>
                        <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155", textAlign: "center" }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>🌾 Resources (Futter)</span>
                          <div style={{ fontSize: 16, fontWeight: "bold", color: "#38bdf8", marginTop: 4 }}>{agent.resources}%</div>
                        </div>
                        <div style={{ background: "#1e293b", padding: 10, borderRadius: 6, border: "1px solid #334155", textAlign: "center" }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>💩 Accumulated Waste</span>
                          <div style={{ fontSize: 16, fontWeight: "bold", color: "#f59e0b", marginTop: 4 }}>{agent.waste}%</div>
                        </div>
                      </div>

                      {/* Split details (Interests & History) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 220 }}>
                        {/* Interests Panel */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: 12, color: "#94a3b8" }}>📖 Intellectual Interests Intensity:</h5>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                            {agent.interests && agent.interests.length > 0 ? (
                              agent.interests.map((interest) => (
                                <div key={interest.name} style={{ background: "#1e293b", border: "1px solid #334155", padding: "6px 10px", borderRadius: 6 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                    <span style={{ color: "#cbd5e1" }}>{interest.name}</span>
                                    <b style={{ color: "#fff" }}>{interest.intensity}%</b>
                                  </div>
                                  <div style={{ background: "#0f172a", height: 4, borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ background: c, width: `${interest.intensity}%`, height: "100%" }} />
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: "#64748b", fontStyle: "italic", fontSize: 11 }}>No interests recorded yet.</div>
                            )}
                          </div>
                        </div>

                        {/* History Panel */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <h5 style={{ margin: "0 0 6px 0", fontSize: 12, color: "#94a3b8" }}>📜 Chronicle History & Actions Logs:</h5>
                          <div style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: 8, maxHeight: 180, overflowY: "auto", fontSize: 11 }}>
                            {agent.history && agent.history.length > 0 ? (
                              agent.history.map((log, idx) => (
                                <div key={idx} style={{ paddingBottom: 4, borderBottom: "1px solid #1e293b", color: "#cbd5e1", marginBottom: 4 }}>
                                  • {log}
                                </div>
                              ))
                            ) : (
                              <div style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", marginTop: 30 }}>No chronicle events recorded yet.</div>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>

            </div>
          </div>

        </div>
      )}

      {/* SYSTEM ABOUT / DOCUMENTATION DASHBOARD */}
      {activeTab === "about" && (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "#1e293b", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 10px 0", color: "#38bdf8", borderBottom: "1px solid #334155", paddingBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              ℹ️ IA3 SimWorld – Technical Documentation Center
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: "1.5" }}>
              Welcome to the simulation knowledge center. All system designs, social models, multi-node multiplayer protocols, and virtual reality bridges are cataloged below. Select a handbook section to browse the active system specs.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, flex: 1, minHeight: 0 }}>
            {/* Sidebar selection for sub-document */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { id: "architecture", label: "🗺️ System & World Specs" },
                { id: "agent-logic", label: "🧠 Agent Logic & Society" },
                { id: "opensim", label: "🕶️ OpenSIM Integration" },
                { id: "ar-realworld", label: "📱 AR & Real-World Specs" },
                { id: "economy-taxonomy", label: "🌾 Economy & Goods Taxonomy" },
                { id: "backlog", label: "📋 Open Backlog Tasks" }
              ].map((doc) => {
                const isSel = aboutSubTab === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setAboutSubTab(doc.id)}
                    style={{
                      background: isSel ? "#38bdf8" : "#1e293b",
                      color: isSel ? "#0f172a" : "#cbd5e1",
                      border: isSel ? "none" : "1px solid #334155",
                      borderRadius: 8,
                      padding: "12px 16px",
                      textAlign: "left",
                      fontWeight: "bold",
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: isSel ? "0 4px 12px rgba(56, 189, 248, 0.25)" : "none"
                    }}
                  >
                    {doc.label}
                  </button>
                );
              })}
            </div>

            {/* Document Reader Area */}
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: 24, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
              {aboutSubTab === "architecture" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    🗺️ System Architecture & Infinite World Specs
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "#1e293b", borderLeft: "4px solid #38bdf8", padding: 12, borderRadius: 6 }}>
                      <b>Startwelt-Dimensionen:</b> Die Simulation erzeugt beim Initialisieren ein komplettes OpenSIM-kompatibles Gebiet der Größe <b>256x256 Tiles (65.536 Kacheln)</b>. Das gesamte Gelände wird über mathematisches fraktales Rauschen (FBM) erzeugt.
                    </div>
                    
                    <p style={{ margin: 0 }}>
                      <b>1. Fluss- & Landschaftsmodell:</b> Ein mäandernder Hauptstrom der Breite 4 fließt von oben nach unten. Zur Seite spaltet sich ein Gabelarm ab. Isolierte Seen wurden auf ein Minimum reduziert, um zusammenhängendes Bauland zu schaffen.
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>2. Infrastruktur & A*-Navigation:</b> Marktplätze und das Tribunal (Courtroom) werden mit einem Abstands-Constraint von mindestens 10 Tiles zueinander und zu den 3 Siedlungszentren prozedural platziert. Die Navigation erfolgt toroidal über alle vier Weltenränder mittels hocheffizientem A*-Suchpfad.
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>3. Unendliche Weltexpansion (Seamless Sharding):</b> Bei Bewegung an den Randgrenzen werden automatisch angrenzende 256x256-Sektoren generiert und über das Multi-Node-Multiplayer-System synchronisiert. Die Entdeckungen werden von den Agenten im Tribunal-Register exekutiv eingepflegt.
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>4. Shared World Multiplayer:</b> Durch Verbindung zweier Port-Forward-Instanzen auf Minikube (:13000 und :13001) spiegelt der Client-Knoten den Zustand des Master-Simulators im Shared-World-Modus. Zu Sicherheitszwecken werden Steuerungselemente auf Sekundär-Knoten ausgeblendet.
                    </p>
                  </div>
                </div>
              )}

              {aboutSubTab === "agent-logic" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    🧠 Kognitive Agentenlogik & Soziales Drei-Gliederungsmodell
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0 }}>
                      <b>1. Kognitives Verhalten (Mesa-Framework):</b> Die Agenten sind mit deterministischen, stateful Verhaltensprofilen (Scout, Builder, Researcher, Tracker) über gRPC an das Python-Mesa-Modell gekoppelt. Sie agieren nach einem 24-Stunden-Zyklus (Schlafen, Handeln auf dem Marktplatz, Erfüllung von Missionen und Tribunal-Abendsitzungen).
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>2. Interessen-Bugfix & Lebenszyklus:</b> Alle Interessen starten bei korrekten Initialwerten und entwickeln sich organisch. Ein passiver Verfall von -1% pro Tick (20% Chance, Floor 10%) interagiert mit aktivem Verstärkungslernen (+2% bei Aufgabenerfüllung) und probabilistischer sozialer Transmission (Contagion/Lernen bei Proximity).
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>3. Existenzsicherung & Hunger:</b> Der Grundverbrauch liegt bei 2 Einheiten pro Tick. Ohne Feldfrüchte-Ernte (crops) oder Beeren erleiden Agenten Hunger-Malus und verlieren 3 Energie-Einheiten pro Tick, was schnelle Erschöpfung bewirkt.
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>4. Kollektives Festival-Szenario:</b> Das Herbst-Festival veranlasst alle AI-Agenten zum Abbruch ihrer Aufgaben, um am fernen Festplatz Zelte aufzuschlagen, Musik zu spielen und am flackernden Canvas-Lagerfeuer zu schmausen (+5% Energie/Ressourcen und +3% Philosophie/Socializing/Art pro Tick). Nach 24h wandern sie heim und verfassen den civilizationsgeschichtlichen Chronicle Report.
                    </p>
                  </div>
                </div>
              )}

              {aboutSubTab === "opensim" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    🕶️ OpenSIM 3D-Protokoll-Interoperabilität & LSL-Brücke
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0 }}>
                      <b>1. PNG-Gelände-Heightmap:</b> Eine standardisierte Grayscale-Heightmap (256x256 8-Bit) wird über <code>/state/opensim/png</code> bereitgestellt. Sie entspricht exakt dem OpenSim-Terraingitter und erlaubt direkten Import in Inworld-Regionen.
                    </p>

                    <p style={{ margin: 0 }}>
                      <b>2. JSON-LSL-Schnittstelle:</b> Unter <code>/state/opensim/json</code> liefert das API-Gateway ein speicheroptimiertes Daten-Array aller Agenten-Koordinaten und World-Objekte skaliert auf OpenSIM-Metermessungen (256m x 256m).
                    </p>

                    <p style={{ margin: 0, fontWeight: "bold", color: "#eab308" }}>
                      Referenz-LSL-Skript zur Replikation in OpenSim (Linden Scripting Language):
                    </p>
                    
                    <pre style={{ background: "#1e293b", padding: 12, borderRadius: 6, fontSize: 11, fontFamily: "monospace", overflowX: "auto", border: "1px solid #334155", color: "#10b981" }}>
{`default {
    state_entry() {
        llSetTimerEvent(5.0); // Poll simulator every 5s
    }
    timer() {
        llHTTPRequest("http://YOUR_GATEWAY_URL/api/state/opensim/json", [], "");
    }
    http_response(key id, integer status, list meta, string body) {
        if (status == 200) {
            list parsed = llJson2List(body);
            // Rezzes or updates dynamic agents in the 3D grid
        }
    }
}`}
                    </pre>
                  </div>
                </div>
              )}

              {aboutSubTab === "ar-realworld" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    📱 Augmented Reality (AR) & Realwelt-Anbindung (Augsburg/Bayern)
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0 }}>
                      <b>1. Realwelt-Geodaten:</b> Durch Einlesen hochauflösender DGM-Geländehöhendaten der Bayerischen Vermessungsverwaltung (OpenData Bayern) lässt sich das exakte Terrain von Augsburg prozedural in unsere 256x256-Sektoren gießen.
                    </p>
                    <p style={{ margin: 0 }}>
                      <b>2. OpenStreetMap Vektor-Schnittstelle:</b> Eine geplante Go-Parsing-Pipeline auf Basis von <code>github.com/qedus/osmpbf</code> liest Gebäude, Straßen und Landmarken (z. B. Rathausplatz Augsburg) direkt ein, um sie als Navigationsnetz für die Agenten und reale 3D-Kollisionsobjekte abzubilden.
                    </p>
                    <p style={{ margin: 0 }}>
                      <b>3. WGS84 Koordinatentransformation:</b> Umrechnung von Längen- und Breitengraden (Lat/Lon) in das lokale 2D-Meter-Gitter der Engine (EPSG:3857/Web Mercator oder UTM Zone 32N), sodass Agentenbewegungen zentimetergenau mit echten Geokoordinaten korrelieren.
                    </p>
                    <p style={{ margin: 0 }}>
                      <b>4. Live-Sensoren & Wetter-Sychronisation:</b> Einbindung von Live-APIs zur Synchronisation des echten Wetters in Augsburg sowie Pegelstände von Lech und Wertach, um Dürren oder reiche Ernten in Echtzeit in der Dreigliederungssimulation widerzuspiegeln.
                    </p>
                  </div>
                </div>
              )}

              {aboutSubTab === "economy-taxonomy" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    🌾 Wirtschaftsleben: Produktionsketten & Güter-Taxonomie (Eco-Standards)
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0 }}>
                      Die Spiel-Wirtschaft orientiert sich an etablierten Multi-User-Standards (wie <i>Eco</i> oder <i>Eve Online</i>) und adaptiert diese an die Prinzipien der <b>Sozialen Dreigliederung</b>:
                    </p>
                    <div style={{ background: "#1e293b", padding: 14, borderRadius: 8, border: "1px solid #334155" }}>
                      <strong style={{ color: "#38bdf8", display: "block", marginBottom: 6 }}>1. Taxonomie-Klassen:</strong>
                      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                        <li><b>ROHSTOFF (Tier 0):</b> Naturressourcen wie Holz, Weizen, Stein und Wasser.</li>
                        <li><b>VERARBEITET (Tier 1 & 2):</b> Veredelte Güter wie Mehl, Brot, Holzbohlen und Werkzeuge.</li>
                        <li><b>KULTURGUT (Immateriell):</b> Rezepte, Baupläne und Bücher. Freie Güter des Geisteslebens, die sich bei Vervielfältigung nicht abnutzen oder entziehen.</li>
                        <li><b>ABFALL:</b> Kompost und Müll, der bei Herstellung/Konsum entsteht (Kreislauf-Prinzip).</li>
                      </ul>
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10 }}>
                      <strong style={{ color: "#38bdf8", display: "block", marginBottom: 6 }}>2. Produktions-Rezepturen (Recipe Graph):</strong>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #334155", color: "#94a3b8" }}>
                            <th style={{ padding: 6 }}>Rezept</th>
                            <th style={{ padding: 6 }}>Input-Stoffe</th>
                            <th style={{ padding: 6 }}>Output-Güter</th>
                            <th style={{ padding: 6 }}>Arbeit (Ticks)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: 6, fontWeight: "bold" }}>Weizen mahlen</td>
                            <td style={{ padding: 6 }}>2 Weizen</td>
                            <td style={{ padding: 6 }}>1 Mehl + 0.2 Kompost</td>
                            <td style={{ padding: 6 }}>4 Ticks</td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: 6, fontWeight: "bold" }}>Brot backen</td>
                            <td style={{ padding: 6 }}>1 Mehl + 1 Wasser</td>
                            <td style={{ padding: 6 }}>2 Brot + 0.1 Kompost</td>
                            <td style={{ padding: 6 }}>6 Ticks</td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: 6, fontWeight: "bold" }}>Holz sägen</td>
                            <td style={{ padding: 6 }}>1 Holz</td>
                            <td style={{ padding: 6 }}>3 Holzbohlen + 0.3 Kompost</td>
                            <td style={{ padding: 6 }}>3 Ticks</td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: 6, fontWeight: "bold" }}>Schmieden</td>
                            <td style={{ padding: 6 }}>2 Stein + 1 Holzbohle</td>
                            <td style={{ padding: 6 }}>1 Werkzeug</td>
                            <td style={{ padding: 6 }}>8 Ticks</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {aboutSubTab === "backlog" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <h4 style={{ margin: 0, color: "#38bdf8", fontSize: 20, borderBottom: "1px solid #1e293b", paddingBottom: 8 }}>
                    📋 Offenes Kunden-Backlog (Anforderungen)
                  </h4>
                  <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: "1.6", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                      <b>[✓] Interaktive Anfragen (Phase A):</b> Spieler können Agenten ansprechen und interaktive Aufgaben/Quests stellen (Ressource liefern, gemeinsam erkunden, Weisheit lehren, Feld anlegen).
                    </div>
                    <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                      <b>[✓] Energieabhängige Geschwindigkeiten:</b> Agenten und Spieler bewegen sich pro Tick 1, 2 oder 3 Tiles weit, gesteuert über ihr aktuelles Energielevel.
                    </div>
                    <div style={{ padding: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 6 }}>
                      <b>[✓] Föderiertes Sharding (Sektor-Knoten):</b> Weltkarte in Chunks aufgeteilt (Sektor 0,0 auf ia3, Sektor 1,0 auf ia3-two, Sektor 0,1 auf ia3-three) mit vollautomatischem toroidalen Handover-Grenzübertritts-Protokoll per REST API.
                    </div>
                    <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                      <b>[ ] Föderierte Wissensgraphen:</b> Kontinuierlicher dezentraler Austausch von Agenteninteressen als semantische GraphLang-Kanten.
                    </div>
                    <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                      <b>[ ] Dezentrale Brain-Nodes:</b> Bereitstellen dezentraler Python agent-service Instanzen zur Kognitionsberechnung.
                    </div>
                    <div style={{ padding: 10, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: 6 }}>
                      <b>[ ] AR & Realwelt-Anbindung (Augsburg/Bayern):</b> Mathematische WGS84-Transformation, osmpbf-Parsing von Augsburg-Gebäuden und Live-Wetter/Sensorkopplung.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}