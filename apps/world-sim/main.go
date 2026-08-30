package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/knadh/koanf/v2"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
)

func loadConfig() *koanf.Koanf {
	k := koanf.New(".")

	// 1. Load defaults from config/defaults/
	defaults := []string{
		"../../config/defaults/ports.yaml",
		"../../config/defaults/world.yaml",
		"../../config/defaults/ai.yaml",
		"../../config/defaults/node.yaml",
	}
	for _, f := range defaults {
		if err := k.Load(file.Provider(f), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Failed to load %s: %v", f, err)
		}
	}

	// 2. Load profile override (if PROFILE env var set)
	if profile := os.Getenv("PROFILE"); profile != "" {
		profileFile := fmt.Sprintf("../../config/profiles/%s.yaml", profile)
		if err := k.Load(file.Provider(profileFile), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Profile %s not found: %v", profile, err)
		} else {
			log.Printf("[config] Loaded profile: %s", profile)
		}
	}

	// 3. Load stage override (if STAGE env var set)
	if stage := os.Getenv("STAGE"); stage != "" {
		stageFile := fmt.Sprintf("../../config/stages/%s/config.yaml", stage)
		if err := k.Load(file.Provider(stageFile), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Stage %s not found: %v", stage, err)
		} else {
			log.Printf("[config] Loaded stage: %s", stage)
		}
	}

	// 4. Load environment variables (highest priority)
	// Koanf env provider maps underscore-separated env vars like:
	// WORLD__TICK_RATE_MS -> world.tick_rate_ms
	k.Load(env.Provider("", ".", func(s string) string {
		// Simple mapper: WORLD__TICK_RATE_MS -> world.tick_rate_ms
		return strings.ToLower(s)
	}), nil)

	return k
}

func NewSim() *Sim {
	cfg := loadConfig()

	// World dimensions (from config or defaults)
	worldW := cfg.Int("world.width")
	if worldW == 0 {
		worldW = 2560
	}
	worldH := cfg.Int("world.height")
	if worldH == 0 {
		worldH = 2560
	}

	// Terrain density
	lakesD := cfg.Float64("world.lakes_density")
	if lakesD == 0 {
		lakesD = 0.28
	}
	berriesD := cfg.Float64("world.berries_density")
	if berriesD == 0 {
		berriesD = 0.25
	}

	// Tick rate (in milliseconds)
	tickRateMs := cfg.Int("world.tick_rate_ms")
	if tickRateMs == 0 {
		tickRateMs = 200
	}
	tickDuration := time.Duration(tickRateMs) * time.Millisecond

	numSectorsX := worldW / 256
	numSectorsY := worldH / 256
	if numSectorsX < 1 {
		numSectorsX = 1
	}
	if numSectorsY < 1 {
		numSectorsY = 1
	}

	sectorsMap := make(map[Position]bool)
	for sy := 0; sy < numSectorsY; sy++ {
		for sx := 0; sx < numSectorsX; sx++ {
			sectorsMap[Position{X: sx, Y: sy}] = true
		}
	}

	// Ollama settings from config
	ollamaEnabled := cfg.Bool("ai.ollama.enabled")
	ollamaBaseURL := cfg.String("ai.ollama.base_url")
	if ollamaBaseURL == "" {
		ollamaBaseURL = "http://localhost:11434"
	}
	ollamaModel := cfg.String("ai.ollama.model")
	if ollamaModel == "" {
		ollamaModel = "llama3.2:latest"
	}
	ollamaMode := cfg.String("ai.ollama.mode")
	if ollamaMode == "" {
		ollamaMode = "gamemaster_all"
	}
	ollamaTimeoutMs := cfg.Int("ai.ollama.timeout_ms")
	if ollamaTimeoutMs == 0 {
		ollamaTimeoutMs = 8000
	}

	s := &Sim{
		worldWidth:             worldW,
		worldHeight:            worldH,
		lakesDensity:           lakesD,
		berriesDensity:         berriesD,
		tickDuration:           tickDuration,
		recentEvents:           make([]string, 0, 50),
		sectors:                sectorsMap,
		minSectorX:             0,
		maxSectorX:             numSectorsX - 1,
		minSectorY:             0,
		maxSectorY:             numSectorsY - 1,
		deepInteractionAllowed: make(map[string]bool),
		autoAnswerMode:         "manual",
		ollamaEnabled:          ollamaEnabled,
		ollamaBaseURL:          ollamaBaseURL,
		ollamaModel:            ollamaModel,
		ollamaMode:             ollamaMode,
		ollamaTimeoutMs:        ollamaTimeoutMs,
		createdAt:              time.Now().UTC(),
		sectorClaims:           make(map[Position]SectorClaim),
	}

	// Node identity and federation (from config)
	s.nodeID = cfg.String("node.id")
	if s.nodeID == "" {
		s.nodeID = getenv("NODE_ID", getenv("NODE_NAME", "ia3-1"))
	}
	s.masterURL = cfg.String("node.master_url")
	if s.masterURL == "" {
		s.masterURL = os.Getenv("MASTER_URL")
	}
	s.isMaster = s.masterURL == ""

	s.assignedSectorX = cfg.Int("node.assigned_sector_x")
	s.assignedSectorY = cfg.Int("node.assigned_sector_y")

	var tax TaxonomyData
	if err := json.Unmarshal(embeddedTaxonomy, &tax); err == nil {
		s.goods = tax.Goods
		s.recipes = tax.Recipes
	}

	s.sectors[Position{X: 0, Y: 0}] = true

	// Load or initialize domain settings
	s.domainSettings = defaultDomainSettings()
	if data, err := os.ReadFile("domain_settings.json"); err == nil {
		var ds DomainSettings
		if err2 := json.Unmarshal(data, &ds); err2 == nil {
			s.domainSettings = ds
		}
	}

	// Load persisted sector claims
	if data, err := os.ReadFile("sector_claims.json"); err == nil {
		var claims []SectorClaim
		if err2 := json.Unmarshal(data, &claims); err2 == nil {
			for _, c := range claims {
				s.sectorClaims[Position{X: c.SectorX, Y: c.SectorY}] = c
			}
		}
	}

	// Claim own assigned sector
	s.sectorClaims[Position{X: s.assignedSectorX, Y: s.assignedSectorY}] = SectorClaim{
		SectorX:      s.assignedSectorX,
		SectorY:      s.assignedSectorY,
		OwnerNodeID:  s.nodeID,
		OwnerURL:     getenv("OWN_URL", cfg.String("node.own_url")),
		DiscoveredAt: 0,
		DiscoveredBy: "init",
	}

	s.terrain = make([][]string, worldH)
	s.objects = make([][]WorldObject, worldH)
	for y := 0; y < worldH; y++ {
		s.terrain[y] = make([]string, worldW)
		s.objects[y] = make([]WorldObject, worldH)
	}

	s.generateTerrain()
	s.seedAgents()
	s.running.Store(true)

	log.Printf("[sim] Config loaded: World %dx%d, Tick %dms, Ollama: %v, NodeID: %s",
		worldW, worldH, tickRateMs, s.ollamaEnabled, s.nodeID)
	s.addEvent(fmt.Sprintf("World simulation initialized with %dx%d grid (%dx%d sectors = %d total sectors) and %d agents.", worldW, worldH, numSectorsX, numSectorsY, numSectorsX*numSectorsY, len(s.agents)))
	return s
}

func (s *Sim) runLoop(ctx context.Context) {
	weeklyTicks := uint64(50400)  // 1 week at 200ms/tick
	congregationDuration := 168    // 33.6 seconds for testing (scales to 3 hours IRL)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			if s.running.Load() {
				s.tick.Add(1)
				currentTick := s.tick.Load()

				// Check for weekly congregation trigger
				if currentTick%weeklyTicks == 0 && currentTick > s.lastCongregationTick {
					s.triggerWeeklyCongregation(congregationDuration)
				}

				// Update congregation state
				if s.congregationActive {
					ticksActive := int(currentTick) - int(s.scenarioStartTick)
					if ticksActive > congregationDuration {
						s.endWeeklyCongregation()
					}
				}

				s.advanceAgents(currentTick)

				s.queryMesaAgentBehavior()

				if currentTick%50 == 0 {
					s.addEvent(fmt.Sprintf("Tick %d: World heartbeat ok. Total agents: %d", currentTick, len(s.agents)))
				}
			}

			s.tickDurationMu.RLock()
			d := s.tickDuration
			s.tickDurationMu.RUnlock()

			time.Sleep(d)
		}
	}
}

func main() {
	sim := NewSim()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sim.runLoop(ctx)
	}()

	sim.registerHandlers()

	// Load port from config
	cfg := loadConfig()
	port := cfg.String("ports.world_sim")
	if port == "" {
		port = getenv("PORT", "8081")
	}
	
	log.Printf("world-sim listening on :%s ...", port)

	// Register at master node asynchronously after HTTP server is ready
	go func() {
		time.Sleep(2 * time.Second) // give HTTP server time to start
		if err := sim.registerAtMaster(); err != nil {
			log.Printf("[Federation] Registration at master failed: %v", err)
		}
	}()

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("http server failed: %v", err)
	}

	cancel()
	wg.Wait()
}
