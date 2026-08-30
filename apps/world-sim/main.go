package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

func NewSim() *Sim {
	worldW := 2560
	worldH := 2560

	if envW := os.Getenv("WORLD_WIDTH"); envW != "" {
		if w, err := strconv.Atoi(envW); err == nil && w > 0 {
			worldW = w
		}
	}
	if envH := os.Getenv("WORLD_HEIGHT"); envH != "" {
		if h, err := strconv.Atoi(envH); err == nil && h > 0 {
			worldH = h
		}
	}

	lakesD := 0.28
	berriesD := 0.25

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

	s := &Sim{
		worldWidth:             worldW,
		worldHeight:            worldH,
		lakesDensity:           lakesD,
		berriesDensity:         berriesD,
		tickDuration:           200 * time.Millisecond,
		recentEvents:           make([]string, 0, 50),
		sectors:                sectorsMap,
		minSectorX:             0,
		maxSectorX:             numSectorsX - 1,
		minSectorY:             0,
		maxSectorY:             numSectorsY - 1,
		deepInteractionAllowed: make(map[string]bool),
		autoAnswerMode:         "manual",
		ollamaEnabled:          true,
		ollamaBaseURL:          "http://localhost:11434",
		ollamaModel:            "llama3.2:latest",
		ollamaMode:             "gamemaster_all",
		ollamaTimeoutMs:        8000,
		createdAt:              time.Now().UTC(),
		sectorClaims:           make(map[Position]SectorClaim),
	}

	// Node identity and master federation setup
	s.nodeID = getenv("NODE_ID", getenv("NODE_NAME", "ia3-1"))
	s.masterURL = os.Getenv("MASTER_URL") // empty = this node is the master
	s.isMaster = s.masterURL == ""
	// Default assigned sector for this node (overridden by master assignment)
	s.assignedSectorX = 0
	s.assignedSectorY = 0
	if sx := os.Getenv("SECTOR_X"); sx != "" {
		if v, err := strconv.Atoi(sx); err == nil {
			s.assignedSectorX = v
		}
	}
	if sy := os.Getenv("SECTOR_Y"); sy != "" {
		if v, err := strconv.Atoi(sy); err == nil {
			s.assignedSectorY = v
		}
	}

	if envURL := os.Getenv("OLLAMA_BASE_URL"); envURL != "" {
		s.ollamaBaseURL = envURL
	}
	if envModel := os.Getenv("OLLAMA_MODEL"); envModel != "" {
		s.ollamaModel = envModel
	}

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
		OwnerURL:     getenv("OWN_URL", ""),
		DiscoveredAt: 0,
		DiscoveredBy: "init",
	}

	s.terrain = make([][]string, worldH)
	s.objects = make([][]WorldObject, worldH)
	for y := 0; y < worldH; y++ {
		s.terrain[y] = make([]string, worldW)
		s.objects[y] = make([]WorldObject, worldW)
	}

	s.generateTerrain()
	s.seedAgents()
	s.running.Store(true)

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

	port := getenv("PORT", "8081")
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
