package main

import (
	_ "embed"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed economy_taxonomy.json
var embeddedTaxonomy []byte

type Terrain string

const (
	TerrainGrass      Terrain = "grass"
	TerrainWater      Terrain = "water"
	TerrainForest     Terrain = "forest"
	TerrainRock       Terrain = "rock"
	TerrainHome       Terrain = "home"
	TerrainRoad       Terrain = "road"
	TerrainCourt      Terrain = "court"      // Gerichtshof (⚖️)
	TerrainMarket     Terrain = "market"     // Marktplatz (🛒)
	TerrainCrops      Terrain = "crops"      // Felder/Feldfrüchte (🌾)
	TerrainWorkshop   Terrain = "workshop"   // Werkstatt / Holzarbeiten (🛠️)
	TerrainMill       Terrain = "mill"       // Getreidemühle (🌾⚙️)
	TerrainQuarry     Terrain = "quarry"     // Steinbruch (🪨⛏️)
	TerrainForge      Terrain = "forge"      // Schmelze & Schmiede (🔥⚒️)
	TerrainPottery    Terrain = "pottery"    // Töpferei & Brunnen (🏺💧)
	TerrainStorehouse Terrain = "storehouse" // Kornspeicher & Zentrallager (🏛️📦)
	TerrainTemple     Terrain = "temple"     // Tempel / Schrein (🏛️✨)
	TerrainWell       Terrain = "well"       // Brunnen (💧🪣)
	TerrainBridge     Terrain = "bridge"     // Brücke über Fluss (🌉)
	TerrainGraveyard  Terrain = "graveyard"  // Friedhof (⚰️)
	TerrainFarm       Terrain = "farm"       // Bauernhof-Gehöft (🏡🌾)
)

type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Interest struct {
	Name      string `json:"name"`
	Intensity int    `json:"intensity"`
}

type Agreement struct {
	PartnerID string `json:"partnerId"`
	Type      string `json:"type"` // "mission", "socialize"
	TargetX   int    `json:"targetX"`
	TargetY   int    `json:"targetY"`
	TicksLeft int    `json:"ticksLeft"`
}

type WorldObject struct {
	Type      string `json:"type"`      // "berries", "waste_pile"
	Amount    int    `json:"amount"`    // 0-100
	MaxAmount int    `json:"maxAmount"` // 100
}

type Agent struct {
	ID                    string         `json:"id"`
	Name                  string         `json:"name"`
	Role                  string         `json:"role"`
	Mood                  string         `json:"mood"`
	Status                string         `json:"status"`
	Energy                int            `json:"energy"`
	Position              Position       `json:"position"`
	Target                Position       `json:"target"`
	Interests             []Interest     `json:"interests"`
	Agreement             *Agreement     `json:"agreement,omitempty"`
	Resources             int            `json:"resources"` // 0-100
	Waste                 int            `json:"waste"`     // 0-100
	MissionsCompleted     int            `json:"missionsCompleted"`
	MissionsAborted       int            `json:"missionsAborted"`
	SocializedCount       int            `json:"socializedCount"`
	RefusedSocializeCount int            `json:"refusedSocializeCount"`
	History               []string       `json:"history"`
	HomePosition          Position       `json:"homePosition"`
	ExploredSectors       []string       `json:"exploredSectors"`
	Signature             string         `json:"signature,omitempty"`
	Inventory             map[string]int `json:"inventory,omitempty"`
	// HomelandNodeID is the node ID where this agent was born / seeded.
	// Agents always "belong" to their homeland — they are never permanently handed over.
	HomelandNodeID        string         `json:"homelandNodeId,omitempty"`
}

// SectorClaim records which node owns (maintains) a world sector.
type SectorClaim struct {
	SectorX       int    `json:"sectorX"`
	SectorY       int    `json:"sectorY"`
	OwnerNodeID   string `json:"ownerNodeId"`
	OwnerURL      string `json:"ownerUrl"`
	DiscoveredAt  uint64 `json:"discoveredAt"` // tick when discovered
	DiscoveredBy  string `json:"discoveredBy"` // agent name
}

// NodeRegistration is the request body sent by a new node to the master.
type NodeRegistration struct {
	NodeID  string `json:"nodeId"`
	NodeURL string `json:"nodeUrl"`
}

// NodeAssignment is the response from the master: the sector this node is responsible for.
type NodeAssignment struct {
	NodeID   string `json:"nodeId"`
	SectorX  int    `json:"sectorX"`
	SectorY  int    `json:"sectorY"`
	Assigned bool   `json:"assigned"`
}

type WorldBounds struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type GoodCategory string

const (
	CategoryRaw       GoodCategory = "ROHSTOFF"
	CategoryProcessed GoodCategory = "VERARBEITET"
	CategoryCulture   GoodCategory = "KULTURGUT"
	CategoryWaste     GoodCategory = "ABFALL"
)

type GoodType struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	Category   GoodCategory `json:"category"`
	Durability float64      `json:"durability"`
	WasteRate  float64      `json:"wasteRate"`
}

type Recipe struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Inputs     map[string]float64 `json:"inputs"`
	Outputs    map[string]float64 `json:"outputs"`
	LaborTicks int                `json:"laborTicks"`
}

type HumanInteraction struct {
	NPCID       string   `json:"npcId"`
	NPCName     string   `json:"npcName"`
	Text        string   `json:"text"`
	Options     []string `json:"options"`
	TicksLeft   int      `json:"ticksLeft"`
	RequestType string   `json:"requestType"` // "deep_interaction", "socialize", "share_resources"
}

type TaxonomyData struct {
	Goods   []GoodType `json:"goods"`
	Recipes []Recipe   `json:"recipes"`
}

type GraphEdge struct {
	Source    string  `json:"source"`
	Target    string  `json:"target"`
	Topic     string  `json:"topic"`
	Weight    float64 `json:"weight"`
	Timestamp string  `json:"timestamp"`
}

type BrainNode struct {
	ID           string `json:"id"`
	URL          string `json:"url"`
	LatencyMs    int    `json:"latencyMs"`
	ActiveAgents int    `json:"activeAgents"`
	Status       string `json:"status"`
	LastSeen     string `json:"lastSeen"`
}

type GeoPoint struct {
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Name string  `json:"name"`
	X    int     `json:"x"`
	Y    int     `json:"y"`
}

type MapSource struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`        // "osm_overpass", "geojson_preset", "wfs_vector", "custom_url"
	URL         string `json:"url"`
	Description string `json:"description"`
	Status      string `json:"status"`      // "online", "ready", "local"
	CreatedAt   string `json:"createdAt"`
}

type ImportedMap struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	SourceID     string  `json:"sourceId"`
	SourceName   string  `json:"sourceName"`
	CenterLat    float64 `json:"centerLat"`
	CenterLon    float64 `json:"centerLon"`
	CenterLatLon string  `json:"centerLatLon"`
	PoisCount    int     `json:"poisCount"`
	RoadsCount   int     `json:"roadsCount"`
	WaterCount   int     `json:"waterCount"`
	ImportedAt   string  `json:"importedAt"`
	IsActive     bool    `json:"isActive"`
}

type WorldState struct {
	Running           bool              `json:"running"`
	Tick              uint64            `json:"tick"`
	TickRateMs        int               `json:"tickRateMs"`
	TotalAgents       int               `json:"totalAgents"`
	WorldSize         WorldBounds       `json:"worldSize"`
	Terrain           [][]string        `json:"terrain"`
	Objects           [][]WorldObject   `json:"objects"`
	Agents            []Agent           `json:"agents"`
	Events            []string          `json:"events"`
	LastUpdated       string            `json:"lastUpdated"`
	CreatedAt         string            `json:"createdAt"`
	GrassPolicy       string            `json:"grassPolicy"`
	ForestPolicy      string            `json:"forestPolicy"`
	ActiveLaws        []string          `json:"activeLaws"`
	GridOriginX       int               `json:"gridOriginX"`
	GridOriginY       int               `json:"gridOriginY"`
	DiscoveredSectors []string          `json:"discoveredSectors"`
	ActiveScenario    string            `json:"activeScenario"`    // "festival" or ""
	ScenarioState     string            `json:"scenarioState"`     // "gathering", "active", "dispersing", "completed"
	ScenarioTargetX   int               `json:"scenarioTargetX"`
	ScenarioTargetY   int               `json:"scenarioTargetY"`
	ScenarioTicksLeft int               `json:"scenarioTicksLeft"`
	ActiveInteraction *HumanInteraction `json:"activeInteraction,omitempty"`
	AutoAnswerMode    string            `json:"autoAnswerMode"` // "manual", "auto_accept", "auto_reject"
	RelicSpawnRate    int               `json:"relicSpawnRate"`
	LawProposeRate    int               `json:"lawProposeRate"`
	EconEventRate     int               `json:"econEventRate"`
	ArtifactQuality   int               `json:"artifactQuality"`
	OllamaEnabled     bool              `json:"ollamaEnabled"`
	OllamaBaseURL     string            `json:"ollamaBaseUrl"`
	OllamaModel       string            `json:"ollamaModel"`
	OllamaMode        string            `json:"ollamaMode"`
	OllamaTimeoutMs   int               `json:"ollamaTimeoutMs"`
	ManagerAThoughts  []string          `json:"managerAThoughts"`
	ManagerBThoughts  []string          `json:"managerBThoughts"`
	ManagerCThoughts  []string          `json:"managerCThoughts"`
	Goods             []GoodType        `json:"goods,omitempty"`
	Recipes           []Recipe          `json:"recipes,omitempty"`
	GraphEdges        []GraphEdge       `json:"graphEdges,omitempty"`
	BrainNodes        []BrainNode       `json:"brainNodes,omitempty"`
	OsmDataLoaded     bool              `json:"osmDataLoaded"`
	CenterLatLon      string            `json:"centerLatLon"`
	MapSources        []MapSource       `json:"mapSources,omitempty"`
	ImportedMaps      []ImportedMap     `json:"importedMaps,omitempty"`
	Generating        bool              `json:"generating"`
	GenProgress       int               `json:"genProgress"`
	GenPhase          string            `json:"genPhase,omitempty"`
	DomainSettings    DomainSettings    `json:"domainSettings"`
	SectorClaims      []SectorClaim     `json:"sectorClaims,omitempty"`
	NodeID            string            `json:"nodeId,omitempty"`
	AssignedSectorX   int               `json:"assignedSectorX"`
	AssignedSectorY   int               `json:"assignedSectorY"`
}

// DomainMode controls the activity level for one simulation domain.
// "off" = completely disabled, "restricted" = core actions only + quota, "full" = unrestricted.
type DomainMode string

const (
	DomainOff        DomainMode = "off"
	DomainRestricted DomainMode = "restricted"
	DomainFull       DomainMode = "full"
)

// DomainConfig holds the settings for one domain (economy / court / geistesleben).
type DomainConfig struct {
	Mode         DomainMode `json:"mode"`
	QuotaPerWindow int      `json:"quotaPerWindow"` // max actions per window (restricted mode)
	WindowSize   int        `json:"windowSize"`     // window length in ticks
}

// DomainSettings holds settings for all three social-threefolding domains.
type DomainSettings struct {
	Economy     DomainConfig `json:"economy"`
	Court       DomainConfig `json:"court"`
	Geistesleben DomainConfig `json:"geistesleben"`
}

func defaultDomainSettings() DomainSettings {
	return DomainSettings{
		Economy:      DomainConfig{Mode: DomainFull, QuotaPerWindow: 20, WindowSize: 100},
		Court:        DomainConfig{Mode: DomainFull, QuotaPerWindow: 10, WindowSize: 100},
		Geistesleben: DomainConfig{Mode: DomainFull, QuotaPerWindow: 10, WindowSize: 100},
	}
}

type Sim struct {
	running             atomic.Bool
	generating          atomic.Bool
	genProgress         atomic.Int32
	genPhase            atomic.Value // stores string
	tick                atomic.Uint64
	tickDuration        time.Duration
	tickDurationMu      sync.RWMutex
	worldWidth          int
	worldHeight         int
	riverWidth          int
	lakesDensity        float64
	grassThreshold      float64
	forestThreshold     float64
	berriesDensity      float64
	terrain             [][]string
	objects             [][]WorldObject
	agents              []Agent
	events              []string
	recentEvents        []string
	eventsMu            sync.Mutex
	grassPolicy         string
	forestPolicy        string
	activeLaws          []string
	geisteslebenTax     float64
	rechtssphaereTax    float64
	wirtschaftslebenTax float64

	// Infinite World & Sectors
	sectors        map[Position]bool
	sectorsMu      sync.RWMutex
	minSectorX     int
	maxSectorX     int
	minSectorY     int
	maxSectorY     int

	// Scenario State Machine
	scenarioActive    bool
	scenarioType      string // "festival"
	scenarioState     string // "gathering", "active", "dispersing"
	scenarioTarget    Position
	scenarioTicksLeft int
	scenarioStartTick uint64

	// Human Interactive Quests & NPCs Addressing Human
	activeInteraction      *HumanInteraction
	autoAnswerMode         string // "manual", "auto_accept", "auto_reject"
	deepInteractionAllowed map[string]bool
	interactionMu          sync.Mutex

	// Social Threefolding AI Game Managers Rate Configurations & Reasoning Thoughts
	relicSpawnRate   int
	lawProposeRate   int
	econEventRate    int
	artifactQuality  int
	ollamaEnabled    bool
	ollamaBaseURL    string
	ollamaModel      string
	ollamaMode       string
	ollamaTimeoutMs  int
	managerAThoughts []string
	managerBThoughts []string
	managerCThoughts []string

	// Economy Goods & Recipes Taxonomy
	goods         []GoodType
	recipes       []Recipe
	createdAt     time.Time

	// Federated Knowledge Graph & Brain Nodes & OSM Geodata
	graphEdges    []GraphEdge
	brainNodes    []BrainNode
	graphMu       sync.RWMutex
	osmDataLoaded bool
	centerLatLon  string
	mapSources    []MapSource
	importedMaps  []ImportedMap
	mapSourcesMu  sync.RWMutex

	// Domain Activity Settings (Resource Governor)
	domainSettings   DomainSettings
	domainSettingsMu sync.RWMutex
	// per-window action counters (reset each windowSize ticks)
	econActionsThisWindow        int
	courtActionsThisWindow       int
	geistActionsThisWindow       int
	econWindowStart              uint64
	courtWindowStart             uint64
	geistWindowStart             uint64

	// Multi-Node World: Master/Worker Federation
	// nodeID: this node's unique identifier (env NODE_ID, fallback NODE_NAME)
	nodeID          string
	// masterURL: URL of master node; empty = this node is master
	masterURL       string
	// isMaster: true when this node acts as the master registry
	isMaster        bool
	// assignedSectorX/Y: the primary sector this node is responsible for
	assignedSectorX int
	assignedSectorY int
	// knownNodes: all registered nodes (master-side registry)
	knownNodes      []NodeRegistration
	knownNodesMu    sync.RWMutex
	// sectorClaims: all claimed sectors across the federation
	sectorClaims    map[Position]SectorClaim
	sectorClaimsMu  sync.RWMutex
}

func (s *Sim) addEvent(msg string) {
	s.eventsMu.Lock()
	defer s.eventsMu.Unlock()
	tStr := os.Getenv("TIME_OVERRIDE")
	if tStr == "" {
		tStr = fmt.Sprintf("%02d:%02d:%02d", (s.tick.Load()%24), 0, 0)
	}
	event := fmt.Sprintf("[%s] %s", tStr, msg)
	s.events = append([]string{event}, s.events...)
	if len(s.events) > 50 {
		s.events = s.events[:50]
	}
	s.recentEvents = append([]string{event}, s.recentEvents...)
	if len(s.recentEvents) > 50 {
		s.recentEvents = s.recentEvents[:50]
	}
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
