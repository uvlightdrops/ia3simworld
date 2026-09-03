export type DomainMode = "off" | "restricted" | "full";

export type DomainConfig = {
  mode: DomainMode;
  quotaPerWindow: number;
  windowSize: number;
};

export type DomainSettings = {
  economy: DomainConfig;
  court: DomainConfig;
  geistesleben: DomainConfig;
};

export type SectorClaim = {
  sectorX: number;
  sectorY: number;
  ownerNodeId: string;
  ownerUrl: string;
  discoveredAt: number;
  discoveredBy: string;
};

export type NodeRegistration = {
  nodeId: string;
  nodeUrl: string;
};

export type NodeAssignment = {
  nodeId: string;
  sectorX: number;
  sectorY: number;
  assigned: boolean;
};

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    const port = window.location.port;
    if (port.startsWith("12")) {
      const idx = parseInt(port, 10) - 12000;
      if (!isNaN(idx) && idx >= 0) {
        return `${window.location.protocol}//${host}:${17080 + idx * 2}`;
      }
    } else if (port.startsWith("13")) {
      const idx = parseInt(port, 10) - 13000;
      if (!isNaN(idx) && idx >= 0) {
        return `${window.location.protocol}//${host}:${18080 + idx}`;
      }
    }
  }
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:17080";
}

export const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:17080";

export type Interest = {
  name: string;
  intensity: number;
};

export type Agreement = {
  partnerId: string;
  type: string;
  targetX: number;
  targetY: number;
  ticksLeft: number;
};

export type GoodType = {
  id: string;
  name: string;
  category: "ROHSTOFF" | "VERARBEITET" | "KULTURGUT" | "ABFALL";
  durability: number;
  wasteRate: number;
};

export type Recipe = {
  id: string;
  name: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  laborTicks: number;
};

export type Agent = {
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
  inventory?: Record<string, number>;
  missionsCompleted?: number;
  missionsAborted?: number;
  socializedCount?: number;
  refusedSocializeCount?: number;
  history?: string[];
  homelandNodeId?: string;
};

export type WorldObject = {
  type: string;
  amount: number;
  maxAmount: number;
};

export type HumanInteraction = {
  npcId: string;
  npcName: string;
  text: string;
  options: string[];
  ticksLeft: number;
  requestType: string;
};

export type MapSource = {
  id: string;
  name: string;
  type: string;
  url: string;
  description: string;
  status: string;
  createdAt: string;
};

export type ImportedMap = {
  id: string;
  name: string;
  sourceId: string;
  sourceName: string;
  centerLat: number;
  centerLon: number;
  centerLatLon: string;
  poisCount: number;
  roadsCount: number;
  waterCount: number;
  importedAt: string;
  isActive: boolean;
};

export type PerformanceSnapshot = {
  lastTickDurationMs?: number;
  lastStateSnapshotMs?: number;
  avgTickDurationMs?: number;
  totalGrpcCalls?: number;
  stateRequests?: number;
  memoryUsedMb?: number;
};

export type WorldSettlement = {
  id: string;
  center: { x: number; y: number };
  population?: number;
  stage?: string;
  productionFocus?: string;
};

export type WorldState = {
  running: boolean;
  tick: number;
  tickRateMs: number;
  totalAgents: number;
  worldSize: { width: number; height: number };
  terrain: string[][];
  objects: WorldObject[][];
  agents: Agent[];
  settlements?: WorldSettlement[];
  events: string[];
  lastUpdated: string;
  createdAt?: string;
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
  activeInteraction?: HumanInteraction;
  autoAnswerMode?: string;
  relicSpawnRate?: number;
  lawProposeRate?: number;
  econEventRate?: number;
  artifactQuality?: number;
  ollamaEnabled?: boolean;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaMode?: string;
  ollamaTimeoutMs?: number;
  managerAThoughts?: string[];
  managerBThoughts?: string[];
  managerCThoughts?: string[];
  goods?: GoodType[];
  recipes?: Recipe[];
  graphEdges?: { source: string; target: string; topic: string; weight: number; timestamp: string }[];
  brainNodes?: { id: string; url: string; latencyMs: number; activeAgents: number; status: string; lastSeen: string }[];
  osmDataLoaded?: boolean;
  centerLatLon?: string;
  mapSources?: MapSource[];
  importedMaps?: ImportedMap[];
  generating?: boolean;
  genProgress?: number;
  genPhase?: string;
  lastGeneratedAt?: string;
  domainSettings?: DomainSettings;
  sectorClaims?: SectorClaim[];
  nodeId?: string;
  assignedSectorX?: number;
  assignedSectorY?: number;
  performance?: PerformanceSnapshot;
};

export const initialState: WorldState = {
  running: false,
  generating: false,
  genProgress: 0,
  tick: 0,
  tickRateMs: 500,
  totalAgents: 0,
  worldSize: { width: 0, height: 0 },
  terrain: [],
  objects: [],
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

export const terrainColors: Record<string, string> = {
  grass: "#5abf6a",
  water: "#1e90ff",
  forest: "#1d7a50",
  rock: "#6b7280",
  home: "#d0894a",
  road: "#8b8b8b",
  court: "#7c3aed",
  market: "#f59e0b",
  crops: "#b9d62e",
  workshop: "#d97706",
  mill: "#eab308",
  quarry: "#64748b",
  forge: "#dc2626",
  pottery: "#b45309",
  storehouse: "#4f46e5",
  temple: "#8b5cf6",
  well: "#0369a1",
  bridge: "#a8a29e",
  graveyard: "#4b5563",
  farm: "#84cc16",
  spiritual_center: "#22c55e",
};

export const terrainLabels: Record<string, string> = {
  grass: "grass 🍀",
  water: "water 💧",
  forest: "forest 🌲",
  rock: "mountain ⛰️",
  home: "homestead 🏡",
  road: "road 🛣️",
  court: "court ⚖️",
  market: "market 🛒",
  crops: "crops 🌾",
  workshop: "workshop 🛠️",
  mill: "mill 🌾⚙️",
  quarry: "quarry 🪨⛏️",
  forge: "forge 🔥⚒️",
  pottery: "pottery 🏺💧",
  storehouse: "storehouse 🏛️📦",
  temple: "temple 🏛️✨",
  well: "well 💧🪣",
  bridge: "bridge 🌉",
  graveyard: "graveyard ⚰️",
  farm: "farm 🏡🌾",
  spiritual_center: "spiritual center 🕉️✨",
};

export const agentColors: Record<string, string> = {
  "Aster": "#10b981", // Emerald
  "Nyx": "#ef4444",   // Red
  "Pico": "#a855f7",  // Purple
  "Sora": "#f97316",  // Orange
  "Rook": "#ec4899",  // Pink
  "Vale": "#3b82f6",  // Blue
  "Juno": "#eab308",  // Yellow
  "Iris": "#06b6d4"   // Cyan
};
