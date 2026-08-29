import React, { type CSSProperties, useEffect, useState, useRef } from "react";
import { WorldState, API, terrainColors, terrainLabels, agentColors } from "../types/sim";
import { useI18n } from "../context/I18nContext";

export function InteractiveWorldMap({
  state,
  selectedAgent,
  setSelectedAgent,
  highlightedTerrain,
  hoveredTile: externalHoveredTile,
  setHoveredTile: externalSetHoveredTile,
  showMapTooltip = false,
  setShowMapTooltip,
}: {
  state: WorldState;
  selectedAgent: string | null;
  setSelectedAgent: (id: string | null) => void;
  highlightedTerrain?: string | null;
  hoveredTile?: { x: number; y: number } | null;
  setHoveredTile?: (tile: { x: number; y: number } | null) => void;
  showMapTooltip?: boolean;
  setShowMapTooltip?: (show: boolean) => void;
}) {
  const { t } = useI18n();
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
  const [arMode, setArMode] = useState(false);

  const [internalHoveredTile, setInternalHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const hoveredTile = externalHoveredTile !== undefined ? externalHoveredTile : internalHoveredTile;
  const updateHoveredTile = (tile: { x: number; y: number } | null) => {
    setInternalHoveredTile(tile);
    externalSetHoveredTile?.(tile);
  };
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
  // THROTTLED: Only animate when simulation is running to save CPU when idle
  useEffect(() => {
    if (!state.running) {
      return;  // Skip animation when paused
    }
    
    let frameId: number;
    const loop = () => {
      setAnimTick((t) => t + 1);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [state.running]);

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

  const centerOnHuman = () => {
    const human = state.agents.find((a) => a.id === "human-1");
    if (!human) return;
    const size = tileSize * zoom;
    const newOffsetX = dimensions.width / 2 - (human.position.x + 0.5) * size;
    const newOffsetY = dimensions.height / 2 - (human.position.y + 0.5) * size;
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
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
      updateHoveredTile({ x: tx, y: ty });
      setTooltipPos({ x: clientX, y: clientY });
    } else {
      updateHoveredTile(null);
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
    updateHoveredTile(null);
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
      const newZoom = Math.min(Math.max(0.01, zoom * factor), 10.0);

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
        }

        // Draw Buildings & Settlement Structures (always visible regardless of showResources)
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
          } else {
            ctx.fillStyle = "#8b5cf6";
            ctx.fillRect(px + size * 0.15, py + size * 0.15, size * 0.7, size * 0.7);
          }
        }

        if (terrain === "market") {
          if (size > 10) {
            ctx.fillStyle = "#ffffff";
            ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🛒", px + size / 2, py + size / 2);
          } else {
            ctx.fillStyle = "#06b6d4";
            ctx.fillRect(px + size * 0.15, py + size * 0.15, size * 0.7, size * 0.7);
          }
        }

          if (terrain === "workshop") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🛠️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#d97706";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "mill") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⚙️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#ca8a04";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "quarry") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⛏️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#64748b";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "forge") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⚒️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#dc2626";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "pottery") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🏺", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#b45309";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "storehouse") {
            if (size > 10) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🏛️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#4f46e5";
              ctx.fillRect(px + size * 0.2, py + size * 0.2, size * 0.6, size * 0.6);
            }
          }

          if (terrain === "temple") {
            if (size > 10) {
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⛩️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#7e22ce";
              ctx.fillRect(px + size * 0.2, py + size * 0.1, size * 0.6, size * 0.8);
            }
          }

          if (terrain === "well") {
            if (size > 10) {
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🪣", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#0369a1";
              ctx.beginPath();
              ctx.arc(px + size / 2, py + size / 2, size * 0.3, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          if (terrain === "bridge") {
            if (size > 10) {
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🌉", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#a8a29e";
              ctx.fillRect(px, py + size * 0.3, size, size * 0.4);
            }
          }

          if (terrain === "graveyard") {
            if (size > 10) {
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⚰️", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#6b7280";
              ctx.fillRect(px + size * 0.3, py + size * 0.1, size * 0.4, size * 0.7);
            }
          }

          if (terrain === "farm") {
            if (size > 10) {
              ctx.font = `${Math.max(8, size * 0.65)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("🏡", px + size / 2, py + size / 2);
            } else {
              ctx.fillStyle = "#65a30d";
              ctx.fillRect(px + size * 0.1, py + size * 0.2, size * 0.8, size * 0.6);
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

      // Draw cozy festival tents adjacent to bonfire
      const drawTent = (offsetX_tiles: number, offsetY_tiles: number, colorMain: string, colorStripe: string) => {
        const tpx = (tx + offsetX_tiles) * size + offsetX;
        const tpy = (ty + offsetY_tiles) * size + offsetY;

        ctx.fillStyle = colorMain;
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.1, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.9, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = colorStripe;
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.4, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.6, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.35, tpy + size * 0.85);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.5);
        ctx.lineTo(tpx + size * 0.65, tpy + size * 0.85);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.moveTo(tpx + size * 0.5, tpy + size * 0.2);
        ctx.lineTo(tpx + size * 0.62, tpy + size * 0.12);
        ctx.lineTo(tpx + size * 0.5, tpy + size * 0.15);
        ctx.closePath();
        ctx.fill();
      };

      drawTent(-1, 0, "#0ea5e9", "#eab308");
      drawTent(1, 0, "#10b981", "#f43f5e");
      drawTent(0, -1, "#ec4899", "#ffffff");
      drawTent(0, 1, "#8b5cf6", "#f97316");
    }

    // RENDER HIGHLIGHT OVERLAY FOR SELECTED LOCATION TERRAIN (5 sec legend highlight)
    if (highlightedTerrain) {
      const time = Date.now() / 150;
      const pulse = (Math.sin(time) + 1) / 2;
      const sonarProgress = (Date.now() / 800) % 1;
      const sonarRadius = size * (0.5 + 1.2 * sonarProgress);
      const sonarAlpha = (1 - sonarProgress) * 0.9;

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const terrain = state.terrain[y]?.[x];
          if (terrain === highlightedTerrain) {
            const px = x * size + offsetX;
            const py = y * size + offsetY;
            const centerX = px + size / 2;
            const centerY = py + size / 2;

            // Glowing backdrop fill
            ctx.fillStyle = `rgba(245, 158, 11, ${0.35 + 0.25 * pulse})`;
            ctx.fillRect(px - 2, py - 2, size + 4, size + 4);

            // Outer pulsing aura
            const auraRadius = Math.max(8, size * (0.7 + 0.4 * pulse));
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = Math.max(2, size * 0.15);
            ctx.beginPath();
            ctx.arc(centerX, centerY, auraRadius, 0, 2 * Math.PI);
            ctx.stroke();

            // Expanding sonar pulse wave
            ctx.strokeStyle = `rgba(251, 191, 36, ${sonarAlpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, Math.max(4, sonarRadius), 0, 2 * Math.PI);
            ctx.stroke();

            // High contrast square border
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.strokeRect(px - 3, py - 3, size + 6, size + 6);
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
    highlightedTerrain,
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
          {state.agents.some((a) => a.id === "human-1") && (
            <button style={btnMiniStyle} onClick={centerOnHuman} title="Center on Human Player">🎯 Center</button>
          )}
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
            {t.mapControls.grid}
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} />
            {t.mapControls.paths}
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showResources} onChange={(e) => setShowResources(e.target.checked)} />
            {t.mapControls.resources}
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showAgentNames} onChange={(e) => setShowAgentNames(e.target.checked)} />
            {t.mapControls.names}
          </label>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={showSmoothAnim} onChange={(e) => setShowSmoothAnim(e.target.checked)} />
            {t.mapControls.smooth}
          </label>
          <label style={{ ...checkboxLabelStyle, color: showMapTooltip ? "#38bdf8" : "#cbd5e1" }}>
            <input type="checkbox" checked={showMapTooltip} onChange={(e) => setShowMapTooltip?.(e.target.checked)} />
            {t.mapControls.tooltip}
          </label>
          <label style={{ ...checkboxLabelStyle, color: arMode ? "#38bdf8" : "#cbd5e1", fontWeight: "bold" }}>
            <input type="checkbox" checked={arMode} onChange={(e) => setArMode(e.target.checked)} />
            {t.mapControls.arOverlay}
          </label>
        </div>
      </div>

      {/* AR Mode HUD Header Overlay */}
      {arMode && (
        <div style={{
          position: "absolute",
          top: 54,
          left: 12,
          right: 12,
          zIndex: 11,
          background: "rgba(15, 23, 42, 0.9)",
          border: "1px solid #38bdf8",
          borderRadius: 8,
          padding: "6px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "#38bdf8",
          pointerEvents: "none",
          boxShadow: "0 0 12px rgba(56, 189, 248, 0.4)"
        }}>
          <div>
            <b>🌐 AR GPS Mode:</b> {state.centerLatLon || "48.3689° N, 10.8978° E (Augsburg)"}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span>Map Projection: <b>{"WGS84 -> 2D SimGrid"}</b></span>
            <span>OSM Data: <b style={{ color: state.osmDataLoaded ? "#10b981" : "#eab308" }}>{state.osmDataLoaded ? "ACTIVE ✅" : "DEFAULT 🗺️"}</b></span>
          </div>
        </div>
      )}

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

      {/* Float Tooltip (Disabled by default, enabled via Admin Setting or Map Control) */}
      {showMapTooltip && hoveredTile && (() => {
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
              <span style={{ color: "#38bdf8", textTransform: "capitalize" }}>
                {terrainLabels[terrain] ?? terrain}
              </span>
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
