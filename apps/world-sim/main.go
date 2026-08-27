package main

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	pb "world-sim/simv1"
)

type Terrain string

const (
	TerrainGrass  Terrain = "grass"
	TerrainWater  Terrain = "water"
	TerrainForest Terrain = "forest"
	TerrainRock   Terrain = "rock"
	TerrainHome   Terrain = "home"
	TerrainRoad   Terrain = "road"
	TerrainCourt  Terrain = "court"  // Gerichtshof (⚖️)
	TerrainMarket Terrain = "market" // Marktplatz (🛒)
	TerrainCrops  Terrain = "crops"  // Felder/Feldfrüchte (🌾)
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
	ID                    string     `json:"id"`
	Name                  string     `json:"name"`
	Role                  string     `json:"role"`
	Mood                  string     `json:"mood"`
	Status                string     `json:"status"`
	Energy                int        `json:"energy"`
	Position              Position   `json:"position"`
	Target                Position   `json:"target"`
	Interests             []Interest `json:"interests"`
	Agreement             *Agreement `json:"agreement,omitempty"`
	Resources             int        `json:"resources"` // 0-100
	Waste                 int        `json:"waste"`     // 0-100
	MissionsCompleted     int        `json:"missionsCompleted"`
	MissionsAborted       int        `json:"missionsAborted"`
	SocializedCount       int        `json:"socializedCount"`
	RefusedSocializeCount int        `json:"refusedSocializeCount"`
	History               []string   `json:"history"`
	HomePosition          Position   `json:"homePosition"`
	ExploredSectors       []string   `json:"exploredSectors"`
}

func (a *Agent) addHistory(entry string) {
	a.History = append([]string{entry}, a.History...)
	if len(a.History) > 50 {
		a.History = a.History[:50]
	}
}

type WorldBounds struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type WorldState struct {
	Running           bool            `json:"running"`
	Tick              uint64          `json:"tick"`
	TickRateMs        int             `json:"tickRateMs"`
	TotalAgents       int             `json:"totalAgents"`
	WorldSize         WorldBounds     `json:"worldSize"`
	Terrain           [][]string      `json:"terrain"`
	Objects           [][]WorldObject `json:"objects"`
	Agents            []Agent         `json:"agents"`
	Events            []string        `json:"events"`
	LastUpdated       string          `json:"lastUpdated"`
	GrassPolicy       string          `json:"grassPolicy"`
	ForestPolicy      string          `json:"forestPolicy"`
	ActiveLaws        []string        `json:"activeLaws"`
	GridOriginX       int             `json:"gridOriginX"`
	GridOriginY       int             `json:"gridOriginY"`
	DiscoveredSectors []string        `json:"discoveredSectors"`
}

type Sim struct {
	running        atomic.Bool
	tick           atomic.Uint64
	tickRateMs     atomic.Int64
	worldWidth     int
	worldHeight    int
	riverWidth     int
	lakesDensity   float64
	berriesDensity float64
	terrain        [][]string
	objects        [][]WorldObject
	agents         []Agent
	events         []string
	eventsMu       sync.Mutex
	grassPolicy    string
	forestPolicy   string
	activeLaws     []string

	// Infinite World & Sectors
	sectors        map[Position]bool
	sectorsMu      sync.RWMutex
	minSectorX     int
	maxSectorX     int
	minSectorY     int
	maxSectorY     int
}

func NewSim() *Sim {
	s := &Sim{
		worldWidth:     96,
		worldHeight:    96,
		riverWidth:     4,
		lakesDensity:   0.20,
		berriesDensity: 0.20,
		events:         []string{"[System] Simulation world initialized."},
		grassPolicy:    "agriculture",
		forestPolicy:   "berries",
		activeLaws:     []string{},
		sectors:        make(map[Position]bool),
		minSectorX:     0,
		maxSectorX:     0,
		minSectorY:     0,
		maxSectorY:     0,
	}
	s.sectors[Position{X: 0, Y: 0}] = true
	s.tickRateMs.Store(2000) // Default speed: 2000ms per tick (1 hour game time / 2s real time)
	s.generateTerrain()
	s.seedAgents()
	return s
}

func (s *Sim) addEvent(msg string) {
	s.eventsMu.Lock()
	defer s.eventsMu.Unlock()
	tStr := time.Now().Format("15:04:05")
	event := fmt.Sprintf("[%s] %s", tStr, msg)
	s.events = append([]string{event}, s.events...)
	if len(s.events) > 50 {
		s.events = s.events[:50]
	}
}

func (s *Sim) generateTerrain() {
	terrain := make([][]string, s.worldHeight)
	objects := make([][]WorldObject, s.worldHeight)
	for y := 0; y < s.worldHeight; y++ {
		terrain[y] = make([]string, s.worldWidth)
		objects[y] = make([]WorldObject, s.worldWidth)
	}

	// Smarter procedural terrain generation using 2D Value Noise with Fractional Brownian Motion
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	
	// Create a random seed grid for interpolation
	const gridScale = 8
	seedGridWidth := (s.worldWidth / gridScale) + 2
	seedGridHeight := (s.worldHeight / gridScale) + 2
	seedGrid := make([][]float64, seedGridHeight)
	for y := 0; y < seedGridHeight; y++ {
		seedGrid[y] = make([]float64, seedGridWidth)
		for x := 0; x < seedGridWidth; x++ {
			seedGrid[y][x] = rng.Float64()
		}
	}

	// Helper for cosine interpolation
	interpolate := func(a, b, t float64) float64 {
		ft := t * math.Pi
		f := (1.0 - math.Cos(ft)) * 0.5
		return a*(1.0-f) + b*f
	}

	// Sample smooth noise at given coordinates
	noise2D := func(x, y float64) float64 {
		gx := x / float64(gridScale)
		gy := y / float64(gridScale)
		
		x0 := int(math.Floor(gx))
		y0 := int(math.Floor(gy))
		x1 := x0 + 1
		y1 := y0 + 1
		
		tx := gx - float64(x0)
		ty := gy - float64(y0)
		
		// Wrap around seed grid boundaries safely
		rx0 := wrap(x0, seedGridWidth)
		rx1 := wrap(x1, seedGridWidth)
		ry0 := wrap(y0, seedGridHeight)
		ry1 := wrap(y1, seedGridHeight)
		
		v00 := seedGrid[ry0][rx0]
		v10 := seedGrid[ry0][rx1]
		v01 := seedGrid[ry1][rx0]
		v11 := seedGrid[ry1][rx1]
		
		i1 := interpolate(v00, v10, tx)
		i2 := interpolate(v01, v11, tx)
		return interpolate(i1, i2, ty)
	}

	// Generate winding river with branching paths
	riverX := float64(rng.Intn(s.worldWidth/3) + s.worldWidth/3)
	riverWidth := s.riverWidth
	if riverWidth <= 0 {
		riverWidth = 2
	}
	
	riverCoords := make(map[Position]bool)
	branchActive := false
	branchX := 0.0
	branchYStart := s.worldHeight/3 + rng.Intn(s.worldHeight/3)
	
	for y := 0; y < s.worldHeight; y++ {
		// Main river winds
		riverX += math.Sin(float64(y)*0.15)*1.2 + (rng.Float64() - 0.5)*1.0
		if riverX < 5 { riverX = 5 }
		if riverX > float64(s.worldWidth-5) { riverX = float64(s.worldWidth-5) }
		
		rx := int(riverX)
		for w := -riverWidth/2; w <= (riverWidth-1)/2; w++ {
			nx := wrap(rx+w, s.worldWidth)
			riverCoords[Position{X: nx, Y: y}] = true
		}
		
		if y == branchYStart {
			branchActive = true
			branchX = riverX
		}
		
		if branchActive && y > branchYStart {
			// Branch winds towards right edge
			progress := float64(y-branchYStart) / float64(s.worldHeight-branchYStart)
			targetX := float64(s.worldWidth - 1)
			branchX += (targetX-branchX)*progress*0.1 + math.Cos(float64(y)*0.2)*1.0 + (rng.Float64() - 0.5)*0.8
			if branchX < 5 { branchX = 5 }
			if branchX > float64(s.worldWidth-2) { branchX = float64(s.worldWidth-2) }
			
			bx := int(branchX)
			for w := -riverWidth/2; w <= (riverWidth-1)/2; w++ {
				nx := wrap(bx+w, s.worldWidth)
				riverCoords[Position{X: nx, Y: y}] = true
			}
		}
	}

	// Generate the landscape biomes using multi-frequency octaves for organic details
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			// Octave 1: Continent shape (large structures)
			n1 := noise2D(float64(x), float64(y))
			
			// Octave 2: Forest/Mountain details (smaller details)
			n2 := noise2D(float64(x)*2.5, float64(y)*2.5)
			
			// Combine octaves
			h := (n1 * 0.7) + (n2 * 0.3)
			
			// Map noise values to realistic, contiguous landmasses and features
			switch {
			case h < s.lakesDensity:
				terrain[y][x] = string(TerrainWater)    // Large, connected lakes/oceans
				objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			case h < 0.58:
				terrain[y][x] = string(TerrainGrass)    // Wide plains surrounding waters
				objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			case h < 0.78:
				terrain[y][x] = string(TerrainForest)   // Clustered woodlands adjacent to plains
				// Wildbeeren wesentlich knapper verteilen!
				if rng.Float64() < s.berriesDensity {
					objects[y][x] = WorldObject{Type: "berries", Amount: 100, MaxAmount: 100}
				} else {
					objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
				}
			default:
				terrain[y][x] = string(TerrainRock)     // Massive mountain ranges in high elevation
				objects[y][x] = WorldObject{Type: "waste_pile", Amount: 0, MaxAmount: 100}
			}

			// Override with river coords
			if riverCoords[Position{X: x, Y: y}] {
				terrain[y][x] = string(TerrainWater)
				objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			}
		}
	}

	// Procedurally place 3 small homestead settlements (Gehöfte)
	centersX := []int{24, 48, 72}
	var settlementCenters []Position
	for _, cx := range centersX {
		// Find a safe spot on Grass/Forest around the center Y
		midY := s.worldHeight / 2
		cy := midY
		for attempts := 0; attempts < s.worldHeight; attempts++ {
			testY := (midY + attempts) % s.worldHeight
			t := terrain[testY][cx]
			if t == string(TerrainGrass) || t == string(TerrainForest) {
				cy = testY
				break
			}
		}
		settlementCenters = append(settlementCenters, Position{X: cx, Y: cy})

		// Turn a 2x2 cluster around (cx, cy) into homesteads (home)
		for dy := 0; dy < 2; dy++ {
			for dx := 0; dx < 2; dx++ {
				ny := wrap(cy+dy, s.worldHeight)
				nx := wrap(cx+dx, s.worldWidth)
				// Make sure we don't overwrite deep water
				if terrain[ny][nx] != string(TerrainWater) {
					terrain[ny][nx] = string(TerrainHome)
					objects[ny][nx] = WorldObject{Type: "homestead", Amount: 100, MaxAmount: 100}
				}
			}
		}
	}

	// Connect homesteads with roads!
	if len(centersX) >= 2 {
		for idx := 0; idx < len(centersX)-1; idx++ {
			p1 := Position{X: centersX[idx], Y: s.worldHeight / 2}
			p2 := Position{X: centersX[idx+1], Y: s.worldHeight / 2}
			for y := 0; y < s.worldHeight; y++ {
				if terrain[y][centersX[idx]] == string(TerrainHome) {
					p1.Y = y
					break
				}
			}
			for y := 0; y < s.worldHeight; y++ {
				if terrain[y][centersX[idx+1]] == string(TerrainHome) {
					p2.Y = y
					break
				}
			}

			roadPath := plotRoad(p1, p2, terrain, s.worldWidth, s.worldHeight)
			for _, p := range roadPath {
				if terrain[p.Y][p.X] != string(TerrainHome) && terrain[p.Y][p.X] != string(TerrainWater) {
					terrain[p.Y][p.X] = string(TerrainRoad)
				}
			}
		}
	}

	// Procedurally place crop fields (crops) around homestead centers
	for _, cx := range centersX {
		midY := s.worldHeight / 2
		cy := midY
		for attempts := 0; attempts < s.worldHeight; attempts++ {
			testY := (midY + attempts) % s.worldHeight
			t := terrain[testY][cx]
			if t == string(TerrainGrass) || t == string(TerrainForest) {
				cy = testY
				break
			}
		}

		// Place 1 crop tile at specific offset around the 2x2 homestead instead of 4 (to force dynamic agriculture)
		cropOffsets := [][2]int{{-1, -1}}
		for _, offset := range cropOffsets {
			ny := wrap(cy+offset[1], s.worldHeight)
			nx := wrap(cx+offset[0], s.worldWidth)
			t := terrain[ny][nx]
			if t == string(TerrainGrass) || t == string(TerrainForest) {
				terrain[ny][nx] = string(TerrainCrops)
				objects[ny][nx] = WorldObject{Type: "crops", Amount: 100, MaxAmount: 100}
			}
		}
	}

	// Place courthouse cluster (court) and marketplace cluster (market)
	// Enforcing: At least 10 units away from any settlement center, and at least 10 units apart from each other.
	courtY := s.worldHeight/2 - 4
	courtX := s.worldWidth/2 - 2
	foundCourt := false

	for y := 15; y < s.worldHeight-15; y++ {
		for x := 15; x < s.worldWidth-15; x++ {
			pos := Position{X: x, Y: y}
			
			// Check distance to all settlement centers
			distOk := true
			for _, sc := range settlementCenters {
				if s.toroidalDistance(pos, sc) < 10.0 {
					distOk = false
					break
				}
			}
			if !distOk {
				continue
			}
			
			// Check if 2x2 area is on safe ground (not deep water or existing homes)
			areaOk := true
			for dy := 0; dy < 2; dy++ {
				for dx := 0; dx < 2; dx++ {
					ny := wrap(y+dy, s.worldHeight)
					nx := wrap(x+dx, s.worldWidth)
					t := terrain[ny][nx]
					if t != string(TerrainGrass) && t != string(TerrainForest) {
						areaOk = false
						break
					}
				}
				if !areaOk {
					break
				}
			}
			
			if areaOk {
				courtX = x
				courtY = y
				foundCourt = true
				break
			}
		}
		if foundCourt {
			break
		}
	}

	// Place court courtroom tiles
	for dy := 0; dy < 2; dy++ {
		for dx := 0; dx < 2; dx++ {
			ny := wrap(courtY+dy, s.worldHeight)
			nx := wrap(courtX+dx, s.worldWidth)
			terrain[ny][nx] = string(TerrainCourt)
			objects[ny][nx] = WorldObject{Type: "courtroom", Amount: 100, MaxAmount: 100}
		}
	}

	// Search for marketplace cluster
	marketY := s.worldHeight/2 - 4
	marketX := s.worldWidth/2 + 2
	foundMarket := false

	for y := 15; y < s.worldHeight-15; y++ {
		for x := 15; x < s.worldWidth-15; x++ {
			pos := Position{X: x, Y: y}
			
			// Check distance to all settlement centers
			distOk := true
			for _, sc := range settlementCenters {
				if s.toroidalDistance(pos, sc) < 10.0 {
					distOk = false
					break
				}
			}
			if !distOk {
				continue
			}
			
			// Check distance to court
			courtPos := Position{X: courtX, Y: courtY}
			if s.toroidalDistance(pos, courtPos) < 10.0 {
				continue
			}
			
			// Check if 2x2 area is on safe ground (not water, homes, or court)
			areaOk := true
			for dy := 0; dy < 2; dy++ {
				for dx := 0; dx < 2; dx++ {
					ny := wrap(y+dy, s.worldHeight)
					nx := wrap(x+dx, s.worldWidth)
					t := terrain[ny][nx]
					if t != string(TerrainGrass) && t != string(TerrainForest) {
						areaOk = false
						break
					}
				}
				if !areaOk {
					break
				}
			}
			
			if areaOk {
				marketX = x
				marketY = y
				foundMarket = true
				break
			}
		}
		if foundMarket {
			break
		}
	}

	// Place market tiles
	for dy := 0; dy < 2; dy++ {
		for dx := 0; dx < 2; dx++ {
			ny := wrap(marketY+dy, s.worldHeight)
			nx := wrap(marketX+dx, s.worldWidth)
			terrain[ny][nx] = string(TerrainMarket)
			objects[ny][nx] = WorldObject{Type: "market_stall", Amount: 100, MaxAmount: 100}
		}
	}

	s.terrain = terrain
	s.objects = objects
}

func plotRoad(start, target Position, terrain [][]string, width, height int) []Position {
	absDiff := func(a, b int) int {
		if a < b {
			return b - a
		}
		return a - b
	}
	heuristic := func(p Position) float64 {
		dx := float64(absDiff(p.X, target.X))
		dy := float64(absDiff(p.Y, target.Y))
		if dx > float64(width)/2.0 {
			dx = float64(width) - dx
		}
		if dy > float64(height)/2.0 {
			dy = float64(height) - dy
		}
		return dx + dy
	}
	type AStarNode struct {
		pos  Position
		path []Position
		g    float64
		f    float64
	}
	openSet := []AStarNode{{pos: start, path: []Position{start}, g: 0, f: heuristic(start)}}
	gScore := make(map[Position]float64)
	gScore[start] = 0
	visited := make(map[Position]bool)
	dx := []int{0, 1, 0, -1}
	dy := []int{-1, 0, 1, 0}

	for len(openSet) > 0 {
		bestIdx := 0
		for idx := 1; idx < len(openSet); idx++ {
			if openSet[idx].f < openSet[bestIdx].f {
				bestIdx = idx
			}
		}
		curr := openSet[bestIdx]
		if curr.pos.X == target.X && curr.pos.Y == target.Y {
			return curr.path
		}
		openSet = append(openSet[:bestIdx], openSet[bestIdx+1:]...)
		visited[curr.pos] = true
		if len(visited) > 1500 {
			break
		}
		for idx := 0; idx < 4; idx++ {
			nextPos := Position{
				X: wrap(curr.pos.X+dx[idx], width),
				Y: wrap(curr.pos.Y+dy[idx], height),
			}
			t := terrain[nextPos.Y][nextPos.X]
			if t == "water" || t == "rock" {
				continue
			}
			tentativeG := curr.g + 1.0
			bestG, exists := gScore[nextPos]
			if !exists || tentativeG < bestG {
				gScore[nextPos] = tentativeG
				newPath := append([]Position(nil), curr.path...)
				newPath = append(newPath, nextPos)
				openSet = append(openSet, AStarNode{
					pos:  nextPos,
					path: newPath,
					g:    tentativeG,
					f:    tentativeG + heuristic(nextPos),
				})
			}
		}
	}
	return nil
}

func (s *Sim) seedAgents() {
	roles := []string{"Scout", "Builder", "Researcher", "Tracker"}
	names := []string{"Aster", "Nyx", "Pico", "Sora", "Rook", "Vale", "Juno", "Iris"}
	s.agents = make([]Agent, 0, len(names))
	
	interests := [][]Interest{
		{{"exploration", 80}, {"science", 40}},
		{{"socializing", 75}, {"art", 50}},
		{{"science", 90}, {"engineering", 60}},
		{{"nature", 85}, {"exploration", 50}},
		{{"engineering", 80}, {"safety", 40}},
		{{"nature", 70}, {"socializing", 60}},
		{{"art", 80}, {"science", 50}},
		{{"safety", 90}, {"exploration", 70}},
	}

	for i, name := range names {
		// Find a non-blocking starting position (Grass or Forest)
		var position Position
		found := false
		for attempts := 0; attempts < 100; attempts++ {
			x := (i*5 + 2 + attempts) % s.worldWidth
			y := (i*3 + 1 + attempts) % s.worldHeight
			terrain := s.terrain[y][x]
			if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
				position = Position{X: x, Y: y}
				found = true
				break
			}
		}
		if !found {
			// Fallback
			position = Position{X: 0, Y: 0}
		}

		// Choose a valid non-blocking initial target
		var target Position
		foundTarget := false
		for attempts := 0; attempts < 100; attempts++ {
			tx := (position.X + 5 + i + attempts) % s.worldWidth
			ty := (position.Y + 7 + i*2 + attempts) % s.worldHeight
			terrain := s.terrain[ty][tx]
			if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
				target = Position{X: tx, Y: ty}
				foundTarget = true
				break
			}
		}
		if !foundTarget {
			target = position
		}

		// Perform a deep copy of interests to prevent shared slice reference bugs in Go
		initialInterests := interests[i%len(interests)]
		copiedInterests := make([]Interest, len(initialInterests))
		copy(copiedInterests, initialInterests)

		s.agents = append(s.agents, Agent{
			ID:              fmt.Sprintf("agent-%d", i+1),
			Name:            name,
			Role:            roles[i%len(roles)],
			Mood:            "calm",
			Status:          "patrolling",
			Energy:          72 + i*4,
			Position:        position,
			Target:          target,
			Interests:       copiedInterests,
			Resources:       80 + (i*3)%21,
			Waste:           5 + (i*2)%16,
			HomePosition:    position,
			ExploredSectors: []string{},
		})
	}
}


func main() {
	s := NewSim()
	go s.loop()
	port := getenv("PORT", "8081")

	http.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	http.HandleFunc("/control/start", func(w http.ResponseWriter, _ *http.Request) {
		s.running.Store(true)
		w.WriteHeader(http.StatusNoContent)
	})
	http.HandleFunc("/control/pause", func(w http.ResponseWriter, _ *http.Request) {
		s.running.Store(false)
		w.WriteHeader(http.StatusNoContent)
	})
	http.HandleFunc("/control/regenerate", func(w http.ResponseWriter, _ *http.Request) {
		s.generateTerrain()
		w.WriteHeader(http.StatusNoContent)
	})
	http.HandleFunc("/control/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var params struct {
				RiverWidth     int     `json:"riverWidth"`
				LakesDensity   float64 `json:"lakesDensity"`
				BerriesDensity float64 `json:"berriesDensity"`
				TickRateMs     int64   `json:"tickRateMs"`
			}
			if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if params.RiverWidth > 0 {
				s.riverWidth = params.RiverWidth
			}
			if params.LakesDensity >= 0 {
				s.lakesDensity = params.LakesDensity
			}
			if params.BerriesDensity >= 0 {
				s.berriesDensity = params.BerriesDensity
			}
			if params.TickRateMs > 0 {
				s.tickRateMs.Store(params.TickRateMs)
				s.addEvent(fmt.Sprintf("[System] Simulation speed set to %d ms/tick.", params.TickRateMs))
			} else {
				s.addEvent("[System] Landscape settings updated.")
			}
			w.WriteHeader(http.StatusOK)
			return
		}
		// Method GET: return current settings
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"riverWidth":     s.riverWidth,
			"lakesDensity":   s.lakesDensity,
			"berriesDensity": s.berriesDensity,
			"tickRateMs":     s.tickRateMs.Load(),
		})
	})

	http.HandleFunc("/control/join-human", func(w http.ResponseWriter, r *http.Request) {
		var params struct {
			PlayerName string `json:"playerName"`
		}
		if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if params.PlayerName == "" {
			params.PlayerName = "Human Explorer"
		}

		// Check if already joined
		var humanAgent *Agent
		for i := range s.agents {
			if s.agents[i].ID == "human-1" {
				humanAgent = &s.agents[i]
				break
			}
		}

		if humanAgent == nil {
			// Find a non-blocking starting position near center
			pos := Position{X: s.worldWidth / 2, Y: s.worldHeight / 2}
			for attempts := 0; attempts < 100; attempts++ {
				tx := (s.worldWidth/2 + attempts) % s.worldWidth
				ty := (s.worldHeight/2 + attempts/2) % s.worldHeight
				terrain := s.terrain[ty][tx]
				if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
					pos = Position{X: tx, Y: ty}
					break
				}
			}

			newAgent := Agent{
				ID:              "human-1",
				Name:            params.PlayerName,
				Role:            "Human Explorer",
				Mood:            "adventurous",
				Status:          "Exploring",
				Energy:          100,
				Position:        pos,
				Target:          pos,
				Interests:       []Interest{{"nature", 70}, {"exploration", 90}},
				Resources:       100,
				Waste:           0,
				HomePosition:    pos,
				ExploredSectors: []string{},
			}
			s.agents = append(s.agents, newAgent)
			s.addEvent(fmt.Sprintf("🎮 [System] Human player %s joined the simulation!", params.PlayerName))
			humanAgent = &s.agents[len(s.agents)-1]
		} else {
			humanAgent.Name = params.PlayerName
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(humanAgent)
	})

	http.HandleFunc("/control/move-human", func(w http.ResponseWriter, r *http.Request) {
		var params struct {
			Direction string `json:"direction"`
			TargetX   int    `json:"targetX"`
			TargetY   int    `json:"targetY"`
			UseTarget bool   `json:"useTarget"`
		}
		if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var humanAgent *Agent
		for i := range s.agents {
			if s.agents[i].ID == "human-1" {
				humanAgent = &s.agents[i]
				break
			}
		}

		if humanAgent == nil {
			http.Error(w, "Human player not found. Join first!", http.StatusNotFound)
			return
		}

		if params.UseTarget {
			// Direct coordinate target (e.g. click on map)
			if params.TargetX >= 0 && params.TargetX < s.worldWidth && params.TargetY >= 0 && params.TargetY < s.worldHeight {
				humanAgent.Target = Position{X: params.TargetX, Y: params.TargetY}
				humanAgent.Status = "Traveling"
				s.addEvent(fmt.Sprintf("🎮 [System] Human player %s sets path to (%d, %d)", humanAgent.Name, params.TargetX, params.TargetY))
			}
		} else {
			// Direct direction step (WASD / arrows)
			dx := 0
			dy := 0
			switch params.Direction {
			case "up":
				dy = -1
			case "down":
				dy = 1
			case "left":
				dx = -1
			case "right":
				dx = 1
			}

			if dx != 0 || dy != 0 {
				nx := wrap(humanAgent.Position.X+dx, s.worldWidth)
				ny := wrap(humanAgent.Position.Y+dy, s.worldHeight)
				terrain := s.terrain[ny][nx]
				if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
					humanAgent.Position = Position{X: nx, Y: ny}
					humanAgent.Target = Position{X: nx, Y: ny}
					humanAgent.Status = "Exploring"
					s.checkExpansion(humanAgent.Position)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(humanAgent)
	})

	http.HandleFunc("/state", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s.snapshot())
	})

	http.HandleFunc("/state/opensim/png", func(w http.ResponseWriter, r *http.Request) {
		// Generate a standard OpenSim-compatible 256x256 8-bit grayscale PNG heightmap.
		// OpenSim regions are exactly 256m x 256m, where each pixel is 1 square meter.
		// Grayscale value (0-255) represents terrain height in meters.
		img := image.NewGray(image.Rect(0, 0, 256, 256))

		// We sample our continuous infinite noise function across a 256x256 area.
		// To match the layout of our main starting sector (0,0) of size 96x96 tiles, 
		// we scale our coordinate sampling. Each OpenSim meter is scaled slightly so that
		// the main sector's terrain feature mapping is smoothly represented.
		// Scale factor maps 256 pixels to 96 tiles: scale = 96.0 / 256.0
		scale := 96.0 / 256.0

		for y := 0; y < 256; y++ {
			for x := 0; x < 256; x++ {
				// Map OpenSim coordinate to the continuous absolute coordinates of the seed sector (0,0)
				absX := float64(x) * scale
				absY := float64(y) * scale

				// Sample noise (matching our infiniteNoise2D in main.go)
				n1 := s.infiniteNoise2D(absX, absY)
				n2 := s.infiniteNoise2D(absX*2.5, absY*2.5)
				h := (n1 * 0.7) + (n2 * 0.3)

				// Continuous heights in meters: Water/lake bed is low, hills are medium, rocks are peaks.
				// OpenSim water level is typically 20 meters.
				var heightVal float64
				if h < s.lakesDensity {
					// Underwater bed: map noise 0 to lakesDensity smoothly to height 5m to 19m
					t := h / s.lakesDensity
					heightVal = 5.0 + t*14.0
				} else if h < 0.58 {
					// Grasslands: height 21m to 40m
					t := (h - s.lakesDensity) / (0.58 - s.lakesDensity)
					heightVal = 21.0 + t*19.0
				} else if h < 0.78 {
					// Forests: height 41m to 85m
					t := (h - 0.58) / (0.78 - 0.58)
					heightVal = 41.0 + t*44.0
				} else {
					// Rocks/Mountain peaks: height 86m to 180m
					t := (h - 0.78) / (1.0 - 0.78)
					heightVal = 86.0 + t*94.0
				}

				// Clamp to 0-255 range and set grayscale pixel value
				val := uint8(clamp(int(heightVal), 0, 255))
				img.SetGray(x, y, color.Gray{Y: val})
			}
		}

		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Content-Disposition", `attachment; filename="opensim_terrain_256.png"`)
		_ = png.Encode(w, img)
	})

	http.HandleFunc("/state/opensim/json", func(w http.ResponseWriter, _ *http.Request) {
		// Provides a lightweight OpenSim-compatible state endpoint, specifically formatted
		// to allow Linden Scripting Language (LSL) scripts in OpenSim to fetch, replicate
		// and position avatars/prims.
		
		type OpenSimAgent struct {
			ID       string  `json:"id"`
			Name     string  `json:"name"`
			Role     string  `json:"role"`
			Status   string  `json:"status"`
			Mood     string  `json:"mood"`
			OpenSimX float64 `json:"opensimX"` // Scaled to standard 256m region
			OpenSimY float64 `json:"opensimY"` // Scaled to standard 256m region
			OpenSimZ float64 `json:"opensimZ"` // Estimated height from heightmap
		}

		type OpenSimObject struct {
			Type     string  `json:"type"`
			Amount   int     `json:"amount"`
			OpenSimX float64 `json:"opensimX"`
			OpenSimY float64 `json:"opensimY"`
			OpenSimZ float64 `json:"opensimZ"`
		}

		// Calculate coordinate scale factors mapping stitched world map onto standard 256m region
		scaleX := 256.0 / float64(s.worldWidth)
		scaleY := 256.0 / float64(s.worldHeight)

		// Estimate height function for absolute coordinate (used for prim rezzing)
		getHeight := func(x, y int) float64 {
			absX := float64(s.minSectorX*96 + x)
			absY := float64(s.minSectorY*96 + y)
			n1 := s.infiniteNoise2D(absX, absY)
			n2 := s.infiniteNoise2D(absX*2.5, absY*2.5)
			h := (n1 * 0.7) + (n2 * 0.3)
			if h < s.lakesDensity {
				return 5.0 + (h/s.lakesDensity)*14.0
			} else if h < 0.58 {
				return 21.0 + ((h-s.lakesDensity)/(0.58-s.lakesDensity))*19.0
			} else if h < 0.78 {
				return 41.0 + ((h-0.58)/(0.78-0.58))*44.0
			}
			return 86.0 + ((h-0.78)/(1.0-0.78))*94.0
		}

		osAgents := make([]OpenSimAgent, len(s.agents))
		for i, a := range s.agents {
			ox := float64(a.Position.X) * scaleX
			oy := float64(a.Position.Y) * scaleY
			osAgents[i] = OpenSimAgent{
				ID:       a.ID,
				Name:     a.Name,
				Role:     a.Role,
				Status:   a.Status,
				Mood:     a.Mood,
				OpenSimX: ox,
				OpenSimY: oy,
				OpenSimZ: getHeight(a.Position.X, a.Position.Y),
			}
		}

		var osObjects []OpenSimObject
		for y := 0; y < s.worldHeight; y++ {
			for x := 0; x < s.worldWidth; x++ {
				obj := s.objects[y][x]
				if obj.Type != "" {
					osObjects = append(osObjects, OpenSimObject{
						Type:     obj.Type,
						Amount:   obj.Amount,
						OpenSimX: float64(x) * scaleX,
						OpenSimY: float64(y) * scaleY,
						OpenSimZ: getHeight(x, y),
					})
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"tick":              s.tick.Load(),
			"running":           s.running.Load(),
			"simWorldWidth":     s.worldWidth,
			"simWorldHeight":    s.worldHeight,
			"openSimSize":       256,
			"waterHeight":       20.0,
			"agents":            osAgents,
			"objects":           osObjects,
			"discoveredSectors": s.snapshot().DiscoveredSectors,
		})
	})

	log.Println("world-sim listening :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func (s *Sim) snapshot() WorldState {
	terrain := make([][]string, len(s.terrain))
	for i := range s.terrain {
		terrain[i] = append([]string(nil), s.terrain[i]...)
	}

	objects := make([][]WorldObject, len(s.objects))
	for i := range s.objects {
		objects[i] = append([]WorldObject(nil), s.objects[i]...)
	}

	s.eventsMu.Lock()
	copiedEvents := append([]string(nil), s.events...)
	s.eventsMu.Unlock()

	s.sectorsMu.RLock()
	var sectorsList []string
	for p := range s.sectors {
		sectorsList = append(sectorsList, fmt.Sprintf("(%d, %d)", p.X, p.Y))
	}
	s.sectorsMu.RUnlock()
	sort.Strings(sectorsList)

	state := WorldState{
		Running:     s.running.Load(),
		Tick:        s.tick.Load(),
		TickRateMs:  int(s.tickRateMs.Load()),
		TotalAgents: len(s.agents),
		WorldSize: WorldBounds{
			Width:  s.worldWidth,
			Height: s.worldHeight,
		},
		Terrain:           terrain,
		Objects:           objects,
		Agents:            make([]Agent, len(s.agents)),
		Events:            copiedEvents,
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
		GrassPolicy:       s.grassPolicy,
		ForestPolicy:      s.forestPolicy,
		ActiveLaws:        s.activeLaws,
		GridOriginX:       s.minSectorX * 96,
		GridOriginY:       s.minSectorY * 96,
		DiscoveredSectors: sectorsList,
	}
	copy(state.Agents, s.agents)
	return state
}

func (s *Sim) loop() {
	for {
		rate := time.Duration(s.tickRateMs.Load()) * time.Millisecond
		time.Sleep(rate)
		if s.running.Load() {
			s.tick.Add(1)
			s.advanceAgents(s.tick.Load())
		}
	}
}

func (s *Sim) toroidalDistance(p1, p2 Position) float64 {
	dx := math.Abs(float64(p1.X - p2.X))
	dy := math.Abs(float64(p1.Y - p2.Y))
	if dx > float64(s.worldWidth)/2.0 {
		dx = float64(s.worldWidth) - dx
	}
	if dy > float64(s.worldHeight)/2.0 {
		dy = float64(s.worldHeight) - dy
	}
	return dx + dy
}

func (s *Sim) isNearHomestead(pos Position) bool {
	// check 3x3 around pos for homesteads
	for dy := -1; dy <= 1; dy++ {
		for dx := -1; dx <= 1; dx++ {
			ny := wrap(pos.Y+dy, s.worldHeight)
			nx := wrap(pos.X+dx, s.worldWidth)
			if s.terrain[ny][nx] == string(TerrainHome) {
				return true
			}
		}
	}
	return false
}

func (s *Sim) findNearestResource(start Position, resTypes []Terrain) Position {
	minDist := 999999.0
	bestPos := start
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			isMatch := false
			for _, t := range resTypes {
				if s.terrain[y][x] == string(t) {
					isMatch = true
					break
				}
			}
			if isMatch {
				dx := []int{0, 1, 0, -1}
				dy := []int{-1, 0, 1, 0}
				for idx := 0; idx < 4; idx++ {
					nx := wrap(x+dx[idx], s.worldWidth)
					ny := wrap(y+dy[idx], s.worldHeight)
					if s.terrain[ny][nx] != string(TerrainWater) && s.terrain[ny][nx] != string(TerrainRock) {
						dist := s.toroidalDistance(start, Position{X: nx, Y: ny})
						if dist < minDist {
							minDist = dist
							bestPos = Position{X: nx, Y: ny}
						}
					}
				}
			}
		}
	}
	return bestPos
}

func (s *Sim) advanceAgents(currentTick uint64) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(currentTick)))

	// 1. Decay energy, resources, accumulate waste, and process interest decay/reinforcement
	for i := range s.agents {
		agent := &s.agents[i]
		agent.Resources = clamp(agent.Resources-2, 0, 100)
		if agent.Resources == 0 {
			// Starvation penalty: energy decays much faster without food/water
			agent.Energy = clamp(agent.Energy-3, 0, 100)
		} else {
			agent.Energy = clamp(agent.Energy-1, 0, 100)
		}
		agent.Waste = clamp(agent.Waste+1, 0, 100)

		// --- Passive Interest Decay ---
		// Every tick, there is a 20% chance that interests slowly decay by 1 point (to keep them organic and moving)
		// We set a minimum threshold floor of 10% so they don't completely disappear.
		if rng.Float64() < 0.20 {
			for idx := range agent.Interests {
				if agent.Interests[idx].Intensity > 10 {
					agent.Interests[idx].Intensity--
				}
			}
		}

		// --- Active Interest Reinforcement ---
		// Based on what the agent is currently doing (status / role), we reinforce related interests!
		var reinforcedInterest string
		statusLower := strings.ToLower(agent.Status)
		if strings.Contains(statusLower, "exploring") || strings.Contains(statusLower, "scouting") || agent.Role == "Scout" {
			reinforcedInterest = "exploration"
		} else if strings.Contains(statusLower, "studying") || agent.Role == "Researcher" {
			reinforcedInterest = "science"
		} else if strings.Contains(statusLower, "trading") || strings.Contains(statusLower, "socializing") {
			reinforcedInterest = "socializing"
		} else if strings.Contains(statusLower, "tribunal") || strings.Contains(statusLower, "securing") || agent.Role == "Tracker" {
			reinforcedInterest = "safety"
		} else if strings.Contains(statusLower, "planting") || strings.Contains(statusLower, "cultivating") || strings.Contains(statusLower, "harvesting") {
			reinforcedInterest = "nature"
		} else if agent.Role == "Builder" || strings.Contains(statusLower, "infrastructure") {
			reinforcedInterest = "engineering"
		}

		if reinforcedInterest != "" {
			found := false
			for idx := range agent.Interests {
				if agent.Interests[idx].Name == reinforcedInterest {
					agent.Interests[idx].Intensity = clamp(agent.Interests[idx].Intensity+2, 0, 100)
					found = true
					break
				}
			}
			// If not found and it's a reinforced interest, we append it at intensity 15
			if !found {
				agent.Interests = append(agent.Interests, Interest{Name: reinforcedInterest, Intensity: 15})
			}
		}
	}

	// 2. Process social contagions and agreements (socializing / cooperating)
	for i := range s.agents {
		agent := &s.agents[i]

		// Refused socialization logging if in proximity but emergency needs block it
		if agent.Resources < 25 || agent.Waste > 75 {
			for j := range s.agents {
				if j == i {
					continue
				}
				other := &s.agents[j]
				if s.toroidalDistance(agent.Position, other.Position) <= 1.5 {
					if len(agent.History) == 0 || !strings.Contains(agent.History[0], "Refused socialization") {
						agent.RefusedSocializeCount++
						agent.addHistory(fmt.Sprintf("Refused socialization with %s due to emergency needs (Resources: %d, Waste: %d) at tick %d", other.Name, agent.Resources, agent.Waste, currentTick))
					}
				}
			}
		}
		
		// Only check social contacts if they are not in an emergency need state (resources < 25 or waste > 75)
		if agent.Resources >= 25 && agent.Waste <= 75 {
			for j := range s.agents {
				if j == i {
					continue
				}
				other := &s.agents[j]
				if other.Resources < 25 || other.Waste > 75 {
					continue
				}

				if s.toroidalDistance(agent.Position, other.Position) <= 1.5 {
					// 1. Intellectual Contagion (probabilistic, slow convergence)
					for idxA := range agent.Interests {
						for idxB := range other.Interests {
							if agent.Interests[idxA].Name == other.Interests[idxB].Name {
								sharedName := agent.Interests[idxA].Name
								avgIntensity := (agent.Interests[idxA].Intensity + other.Interests[idxB].Intensity) / 2
								
								// Contagion converges very slowly (1 point) under a 15% probability check
								if rng.Float64() < 0.15 {
									if agent.Interests[idxA].Intensity < other.Interests[idxB].Intensity {
										agent.Interests[idxA].Intensity = clamp(agent.Interests[idxA].Intensity+1, 0, 100)
									}
								}

								if avgIntensity > 30 {
									// 2. Agreements: Form cooperating mission or socialization
									prob := 0.15
									if s.isNearHomestead(agent.Position) || s.isNearHomestead(other.Position) {
										prob = 0.50
									}
									if agent.Agreement == nil && other.Agreement == nil && rng.Float64() < prob {
										var agreeType string
										var tx, ty int
										var duration int
										
										if rng.Float64() < 0.5 {
											agreeType = "mission"
											// Joint mission: target a forest together to explore/harvest
											targetPos := s.findNearestResource(agent.Position, []Terrain{TerrainForest})
											tx, ty = targetPos.X, targetPos.Y
											duration = 25
										} else {
											agreeType = "socialize"
											// Linger/socialize adjacent to each other
											tx, ty = agent.Position.X, agent.Position.Y
											duration = 15
										}

										ag1 := &Agreement{
											PartnerID: other.ID,
											Type:      agreeType,
											TargetX:   tx,
											TargetY:   ty,
											TicksLeft: duration,
										}
										agent.Agreement = ag1

										ag2 := &Agreement{
											PartnerID: agent.ID,
											Type:      agreeType,
											TargetX:   tx,
											TargetY:   ty,
											TicksLeft: duration,
										}
										other.Agreement = ag2

										agent.Status = "socializing (" + sharedName + ")"
										other.Status = "socializing (" + sharedName + ")"
										
										agent.addHistory(fmt.Sprintf("Formed %s agreement with %s about %s at tick %d", agreeType, other.Name, sharedName, currentTick))
										other.addHistory(fmt.Sprintf("Formed %s agreement with %s about %s at tick %d", agreeType, agent.Name, sharedName, currentTick))
										
										s.addEvent(fmt.Sprintf("%s and %s formed a %s agreement about %s!", agent.Name, other.Name, agreeType, sharedName))
									}
								}
							}
						}
					}

					// 2. Social Learning: Spread completely new interests (10% chance per tick)
					if rng.Float64() < 0.10 {
						for _, instA := range agent.Interests {
							if instA.Intensity > 40 {
								foundInB := false
								for _, instB := range other.Interests {
									if instA.Name == instB.Name {
										foundInB = true
										break
									}
								}
								if !foundInB {
									other.Interests = append(other.Interests, Interest{Name: instA.Name, Intensity: 15})
									other.addHistory(fmt.Sprintf("Learned interest '%s' from %s! 🎭 at tick %d", instA.Name, agent.Name, currentTick))
									s.addEvent(fmt.Sprintf("💡 %s learned about %s from %s! 🎭", other.Name, instA.Name, agent.Name))
								}
							}
						}
					}
				}
			}
		}
	}

	// 3. Call Python Mesa AgentBehaviorService over gRPC!
	s.queryMesaAgentBehavior()

	// 4. Movement and objective execution
	for i := range s.agents {
		agent := &s.agents[i]

		// Resource depletion and waste accumulation triggers when standing next to water/forest/rocks/crops
		dxDirs := []int{0, 1, 0, -1}
		dyDirs := []int{-1, 0, 1, 0}
		isNextToWaterOrForestOrCrops := false
		isNextToRock := false
		isNextToHome := false
		
		for d := 0; d < 4; d++ {
			nx := wrap(agent.Position.X + dxDirs[d], s.worldWidth)
			ny := wrap(agent.Position.Y + dyDirs[d], s.worldHeight)
			t := s.terrain[ny][nx]
			if t == string(TerrainWater) || t == string(TerrainForest) || t == string(TerrainCrops) {
				isNextToWaterOrForestOrCrops = true
			}
			if t == string(TerrainRock) {
				isNextToRock = true
			}
			if t == string(TerrainHome) {
				isNextToHome = true
			}
		}
		if s.terrain[agent.Position.Y][agent.Position.X] == string(TerrainHome) {
			isNextToHome = true
		}

		// Handle resource consumption & waste disposal side effects on Go world state
		if agent.Resources < 25 && isNextToWaterOrForestOrCrops {
			for d := 0; d < 4; d++ {
				nx := wrap(agent.Position.X+dxDirs[d], s.worldWidth)
				ny := wrap(agent.Position.Y+dyDirs[d], s.worldHeight)
				t := s.terrain[ny][nx]
				if t == string(TerrainWater) {
					agent.Resources = 100
					agent.Status = "replenished (water)"
					agent.Mood = "satisfied"
					agent.addHistory(fmt.Sprintf("Drank water at the lake 💧 at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("%s drank water at the lake 💧", agent.Name))
					break
				} else if t == string(TerrainForest) && s.objects[ny][nx].Amount > 10 {
					s.objects[ny][nx].Amount -= 15
					agent.Resources = 100
					agent.Status = "replenished (berries)"
					agent.Mood = "satisfied"
					agent.addHistory(fmt.Sprintf("Harvested berries in the forest 🍒 at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("%s harvested berries in the forest 🍒", agent.Name))
					break
				} else if t == string(TerrainCrops) && s.objects[ny][nx].Amount > 10 {
					s.objects[ny][nx].Amount -= 20
					agent.Resources = 100
					agent.Status = "replenished (crops)"
					agent.Mood = "satisfied"
					agent.addHistory(fmt.Sprintf("Harvested crops at the farm 🌾 at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("%s harvested crops at the farm 🌾", agent.Name))
					break
				}
			}
		}
		if agent.Waste > 75 && isNextToRock {
			for d := 0; d < 4; d++ {
				nx := wrap(agent.Position.X+dxDirs[d], s.worldWidth)
				ny := wrap(agent.Position.Y+dyDirs[d], s.worldHeight)
				t := s.terrain[ny][nx]
				if t == string(TerrainRock) {
					s.objects[ny][nx].Amount = clamp(s.objects[ny][nx].Amount+20, 0, 100)
					agent.Waste = 0
					agent.Status = "waste disposed"
					agent.Mood = "satisfied"
					agent.addHistory(fmt.Sprintf("Disposed waste at the mountaintop 🗑️ at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("%s disposed waste at the mountaintop 🗑️", agent.Name))
					break
				}
			}
		}
		if agent.Energy < 25 && isNextToHome {
			agent.Energy = 100
			agent.Status = "sleeping at homestead"
			agent.Mood = "satisfied"
			agent.addHistory(fmt.Sprintf("Slept and regenerated energy at homestead 🏡 at tick %d", currentTick))
			s.addEvent(fmt.Sprintf("%s fell asleep cozy at the homestead 🏡", agent.Name))
		}

		// Handle spiritual symbols (relics) from Geistesleben
		if s.objects[agent.Position.Y][agent.Position.X].Type == "spiritual_symbol" {
			s.objects[agent.Position.Y][agent.Position.X] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			found := false
			for j, inst := range agent.Interests {
				if inst.Name == "Philosophy" {
					agent.Interests[j].Intensity = clamp(inst.Intensity+50, 0, 100)
					found = true
					break
				}
			}
			if !found {
				agent.Interests = append(agent.Interests, Interest{Name: "Philosophy", Intensity: 50})
			}
			agent.addHistory(fmt.Sprintf("Absorbed ancient spiritual relic at (%d, %d) 📖 and unlocked Philosophy at tick %d", agent.Position.X, agent.Position.Y, currentTick))
			s.addEvent(fmt.Sprintf("✨ %s absorbed the ancient relic's wisdom at (%d, %d) and unlocked Philosophy! 📖", agent.Name, agent.Position.X, agent.Position.Y))
		} else {
			for d := 0; d < 4; d++ {
				nx := wrap(agent.Position.X+dxDirs[d], s.worldWidth)
				ny := wrap(agent.Position.Y+dyDirs[d], s.worldHeight)
				if s.objects[ny][nx].Type == "spiritual_symbol" {
					found := false
					for j, inst := range agent.Interests {
						if inst.Name == "Philosophy" {
							agent.Interests[j].Intensity = clamp(inst.Intensity+10, 0, 100)
							found = true
							break
						}
					}
					if !found {
						agent.Interests = append(agent.Interests, Interest{Name: "Philosophy", Intensity: 15})
					}
					agent.addHistory(fmt.Sprintf("Inspired by spiritual relic near (%d, %d) 💡 at tick %d", nx, ny, currentTick))
					break
				}
			}
		}

		// Handle planting crops
		if agent.Status == "planting crops" && agent.Position.X == agent.Target.X && agent.Position.Y == agent.Target.Y {
			if s.terrain[agent.Position.Y][agent.Position.X] == string(TerrainGrass) {
				s.terrain[agent.Position.Y][agent.Position.X] = string(TerrainCrops)
				s.objects[agent.Position.Y][agent.Position.X] = WorldObject{Type: "crops", Amount: 30, MaxAmount: 100}
				agent.Resources = clamp(agent.Resources-10, 0, 100)
				agent.Energy = clamp(agent.Energy-10, 0, 100)
				agent.addHistory(fmt.Sprintf("Planted a new crop field 🌾 at (%d, %d) at tick %d", agent.Position.X, agent.Position.Y, currentTick))
				s.addEvent(fmt.Sprintf("%s planted a new crop field 🌾 at (%d, %d)!", agent.Name, agent.Position.X, agent.Position.Y))
			}
		}
		// Handle cultivating crops
		if agent.Status == "cultivating crops (1/3)" || agent.Status == "cultivating crops (2/3)" || agent.Status == "cultivating crops (3/3)" {
			if s.terrain[agent.Position.Y][agent.Position.X] == string(TerrainCrops) {
				s.objects[agent.Position.Y][agent.Position.X].Amount = clamp(s.objects[agent.Position.Y][agent.Position.X].Amount+25, 0, 100)
				agent.Energy = clamp(agent.Energy-5, 0, 100)
				agent.addHistory(fmt.Sprintf("Watered and cultivated crop field 🌾 at (%d, %d) at tick %d", agent.Position.X, agent.Position.Y, currentTick))
				s.addEvent(fmt.Sprintf("%s watered and cultivated the crop field 🌾 at (%d, %d)", agent.Name, agent.Position.X, agent.Position.Y))
			}
		}
		// Handle timber harvesting
		if agent.Status == "harvesting timber at forest" {
			for d := 0; d < 4; d++ {
				nx := wrap(agent.Position.X+dxDirs[d], s.worldWidth)
				ny := wrap(agent.Position.Y+dyDirs[d], s.worldHeight)
				t := s.terrain[ny][nx]
				if t == string(TerrainForest) && s.objects[ny][nx].Amount > 10 {
					s.objects[ny][nx].Amount -= 15
					agent.Resources = clamp(agent.Resources+15, 0, 100)
					agent.Energy = clamp(agent.Energy-5, 0, 100)
					agent.addHistory(fmt.Sprintf("Chopped wood and harvested timber at forest 🪓 at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("%s chopped wood and harvested timber at the forest 🪓", agent.Name))
					break
				}
			}
		}

		// Decrement active agreements on target reached/tick decay
		if agent.Agreement != nil {
			agent.Agreement.TicksLeft--
			if agent.Agreement.TicksLeft <= 0 || (agent.Position.X == agent.Target.X && agent.Position.Y == agent.Target.Y) {
				if agent.Agreement.Type == "mission" {
					agent.MissionsCompleted++
					agent.addHistory(fmt.Sprintf("Completed joint resource mission with %s at tick %d", agent.Agreement.PartnerID, currentTick))
				} else if agent.Agreement.Type == "socialize" {
					agent.SocializedCount++
					agent.addHistory(fmt.Sprintf("Completed socialization with %s at tick %d", agent.Agreement.PartnerID, currentTick))
				}
				agent.Agreement = nil
			}
		}

		// Calculate path step towards target decided by Python Mesa
		nextStep := s.findNextStep(agent.Position, agent.Target)
		agent.Position = nextStep

		// 1. Invisible infinite map expansion on agent/player movement
		s.checkExpansion(agent.Position)

		// 2. Settlement radius restriction and dynamic exploration logic (only for AI agents)
		if !strings.HasPrefix(agent.ID, "human-") && agent.Role != "Human Explorer" {
			// Compute distance to home position
			distToHome := math.Abs(float64(agent.Position.X-agent.HomePosition.X)) + math.Abs(float64(agent.Position.Y-agent.HomePosition.Y))
			
			// Decide to explore randomly
			if agent.Status != "Exploring" && agent.Status != "Returning from exploration" {
				// If target is too far or randomly triggered
				tooFar := distToHome > 18.0
				exploreProb := 0.015
				if agent.Role == "Scout" || agent.Role == "Tracker" {
					exploreProb = 0.03
				}
				if (tooFar || rng.Float64() < exploreProb) && agent.Energy > 50 {
					agent.Status = "Exploring"
					agent.addHistory(fmt.Sprintf("Ventured out to explore the infinite world past the settlement limits at tick %d", currentTick))
					s.addEvent(fmt.Sprintf("🔍 Scout %s ventured out to explore the infinite world past the settlement limits!", agent.Name))
					
					// Set a random target far away
					signX := 1
					if rng.Float64() < 0.5 { signX = -1 }
					signY := 1
					if rng.Float64() < 0.5 { signY = -1 }
					tx := clamp(agent.Position.X + signX*(30+rng.Intn(30)), 0, s.worldWidth-1)
					ty := clamp(agent.Position.Y + signY*(30+rng.Intn(30)), 0, s.worldHeight-1)
					agent.Target = Position{X: tx, Y: ty}
				}
			}

			// While in exploration mode, track active sectors traversed
			if agent.Status == "Exploring" {
				absX := s.minSectorX*96 + agent.Position.X
				absY := s.minSectorY*96 + agent.Position.Y
				secX := int(math.Floor(float64(absX) / 96.0))
				secY := int(math.Floor(float64(absY) / 96.0))
				secStr := fmt.Sprintf("(%d, %d)", secX, secY)
				
				// Add to traversed list
				alreadyTraversed := false
				for _, sStr := range agent.ExploredSectors {
					if sStr == secStr {
						alreadyTraversed = true
						break
					}
				}
				if !alreadyTraversed {
					agent.ExploredSectors = append(agent.ExploredSectors, secStr)
				}

				// If low energy or target reached, return home
				if agent.Energy < 40 || (agent.Position.X == agent.Target.X && agent.Position.Y == agent.Target.Y) {
					agent.Status = "Returning from exploration"
					agent.Target = agent.HomePosition
					agent.addHistory(fmt.Sprintf("Finished exploration, heading back home to share discoveries at tick %d", currentTick))
				}
			}

			// If returning and reached home, register knowledge in executive courtroom archive
			if agent.Status == "Returning from exploration" {
				distToHomeNow := math.Abs(float64(agent.Position.X-agent.HomePosition.X)) + math.Abs(float64(agent.Position.Y-agent.HomePosition.Y))
				if distToHomeNow <= 2.0 {
					if len(agent.ExploredSectors) > 0 {
						for _, secStr := range agent.ExploredSectors {
							s.addEvent(fmt.Sprintf("⚖️ [Courtroom/Register] %s returned from exploration and registered Sector %s in the executive archive!", agent.Name, secStr))
						}
						agent.addHistory(fmt.Sprintf("Registered %d newly discovered sectors at the courtroom tribunal archive at tick %d", len(agent.ExploredSectors), currentTick))
						agent.ExploredSectors = []string{}
					}
					agent.Status = "patrolling"
					// Choose a new patrolling target within home radius
					tx := clamp(agent.HomePosition.X + (rng.Intn(16) - 8), 0, s.worldWidth-1)
					ty := clamp(agent.HomePosition.Y + (rng.Intn(16) - 8), 0, s.worldHeight-1)
					agent.Target = Position{X: tx, Y: ty}
				}
			}
		}
	}

	// 5. Regrowth and Decomposition loop
	if currentTick%8 == 0 {
		for y := 0; y < s.worldHeight; y++ {
			for x := 0; x < s.worldWidth; x++ {
				obj := &s.objects[y][x]
				if obj.Type == "berries" && obj.Amount < 100 {
					obj.Amount = clamp(obj.Amount+5, 0, 100)
				} else if obj.Type == "crops" && obj.Amount < 100 {
					obj.Amount = clamp(obj.Amount+3, 0, 100) // Crops regrow slower representing scarcity
				} else if obj.Type == "waste_pile" && obj.Amount > 0 {
					obj.Amount = clamp(obj.Amount-1, 0, 100)
				}
			}
		}
	}
}

func (s *Sim) queryMesaAgentBehavior() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	grpcAddr := getenv("AGENT_GRPC_ADDR", "localhost:50051")
	conn, err := grpc.DialContext(ctx, grpcAddr, grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
	if err != nil {
		log.Printf("Warning: Failed to connect to Python agent-service on %s (Mesa bypassed): %v", grpcAddr, err)
		return
	}
	defer conn.Close()

	client := pb.NewAgentDecisionServiceClient(conn)

	pbAgents := make([]*pb.AgentState, len(s.agents))
	for i, a := range s.agents {
		pbInterests := make([]*pb.Interest, len(a.Interests))
		for j, interest := range a.Interests {
			pbInterests[j] = &pb.Interest{
				Name:      interest.Name,
				Intensity: int32(interest.Intensity),
			}
		}

		var pbAgreement *pb.Agreement
		if a.Agreement != nil {
			pbAgreement = &pb.Agreement{
				PartnerId: a.Agreement.PartnerID,
				Type:      a.Agreement.Type,
				TargetX:   int32(a.Agreement.TargetX),
				TargetY:   int32(a.Agreement.TargetY),
				TicksLeft: int32(a.Agreement.TicksLeft),
			}
		}

		pbAgents[i] = &pb.AgentState{
			Id:        a.ID,
			Name:      a.Name,
			Role:      a.Role,
			Mood:      a.Mood,
			Status:    a.Status,
			Energy:    int32(a.Energy),
			Position:  &pb.Position{X: int32(a.Position.X), Y: int32(a.Position.Y)},
			Target:    &pb.Position{X: int32(a.Target.X), Y: int32(a.Target.Y)},
			Interests: pbInterests,
			Agreement: pbAgreement,
			Resources: int32(a.Resources),
			Waste:     int32(a.Waste),
		}
	}

	var pbTiles []*pb.TerrainTile
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			t := s.terrain[y][x]
			obj := s.objects[y][x]
			if t == string(TerrainWater) || t == string(TerrainForest) || t == string(TerrainRock) || t == string(TerrainHome) || t == string(TerrainRoad) || t == string(TerrainCourt) || t == string(TerrainMarket) || t == string(TerrainCrops) {
				pbTiles = append(pbTiles, &pb.TerrainTile{
					X:            int32(x),
					Y:            int32(y),
					TerrainType:  t,
					ObjectType:   obj.Type,
					ObjectAmount: int32(obj.Amount),
				})
			}
		}
	}

	req := &pb.DecideActionsRequest{
		Tick:         s.tick.Load(),
		WorldWidth:   int32(s.worldWidth),
		WorldHeight:  int32(s.worldHeight),
		Agents:       pbAgents,
		TerrainTiles: pbTiles,
		GrassPolicy:  s.grassPolicy,
		ForestPolicy: s.forestPolicy,
	}

	resp, err := client.DecideActions(ctx, req)
	if err != nil {
		log.Printf("Warning: DecideActions gRPC call failed: %v", err)
		return
	}

	// Process newly negotiated court policies
	if resp.GrassPolicy != "" && resp.GrassPolicy != s.grassPolicy {
		s.grassPolicy = resp.GrassPolicy
		if s.grassPolicy == "protected" {
			s.addEvent("⚖️ Tribunal: Grassland is now PROTECTED! Crop planting is banned 🚫🌾")
		} else {
			s.addEvent("⚖️ Tribunal: Agriculture is now ALLOWED on Grassland 🌾")
		}
	}
	if resp.ForestPolicy != "" && resp.ForestPolicy != s.forestPolicy {
		s.forestPolicy = resp.ForestPolicy
		if s.forestPolicy == "timber" {
			s.addEvent("⚖️ Tribunal: Forest is open for TIMBER harvesting 🪓")
		} else {
			s.addEvent("⚖️ Tribunal: Forest is RESERVED for berry harvesting 🍓")
		}
	}

	// Process map updates injected by Python AI Game Managers
	for _, mu := range resp.MapUpdates {
		x := int(mu.X)
		y := int(mu.Y)
		if x >= 0 && x < s.worldWidth && y >= 0 && y < s.worldHeight {
			if mu.TerrainType != "" {
				s.terrain[y][x] = mu.TerrainType
			}
			// Set or clear objects
			if mu.ObjectType != "" {
				s.objects[y][x] = WorldObject{
					Type:      mu.ObjectType,
					Amount:    int(mu.ObjectAmount),
					MaxAmount: 100,
				}
			} else if mu.ObjectAmount == 0 {
				s.objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			}
		}
	}

	// Process event logs injected by Python AI Game Managers
	for _, ie := range resp.InjectedEvents {
		s.addEvent(ie)
	}

	// Update active laws in Go from Python Game Managers
	s.activeLaws = resp.ActiveLaws

	for _, dec := range resp.Decisions {
		for i := range s.agents {
			if s.agents[i].ID == dec.AgentId {
				s.agents[i].Target = Position{X: int(dec.Target.X), Y: int(dec.Target.Y)}
				if s.agents[i].Status != dec.Status {
					s.agents[i].addHistory(fmt.Sprintf("Changed action to '%s' at tick %d", dec.Status, s.tick.Load()))
				}
				s.agents[i].Status = dec.Status
				s.agents[i].Mood = dec.Mood
				s.agents[i].Energy = int(dec.Energy)
				s.agents[i].Resources = int(dec.Resources)
				s.agents[i].Waste = int(dec.Waste)
				if dec.Agreement != nil {
					if s.agents[i].Agreement == nil {
						s.agents[i].Agreement = &Agreement{}
						if dec.Agreement.Type == "mission" {
							s.agents[i].addHistory(fmt.Sprintf("Formed joint resource mission agreement with %s at tick %d", dec.Agreement.PartnerId, s.tick.Load()))
						} else {
							s.agents[i].addHistory(fmt.Sprintf("Formed socialization agreement with %s at tick %d", dec.Agreement.PartnerId, s.tick.Load()))
						}
					}
					s.agents[i].Agreement.PartnerID = dec.Agreement.PartnerId
					s.agents[i].Agreement.Type = dec.Agreement.Type
					s.agents[i].Agreement.TargetX = int(dec.Agreement.TargetX)
					s.agents[i].Agreement.TargetY = int(dec.Agreement.TargetY)
					s.agents[i].Agreement.TicksLeft = int(dec.Agreement.TicksLeft)
				} else {
					if s.agents[i].Agreement != nil {
						if s.agents[i].Agreement.Type == "mission" {
							s.agents[i].MissionsAborted++
							s.agents[i].addHistory(fmt.Sprintf("Aborted joint mission with %s due to emergency priorities at tick %d", s.agents[i].Agreement.PartnerID, s.tick.Load()))
						} else if s.agents[i].Agreement.Type == "socialize" {
							s.agents[i].addHistory(fmt.Sprintf("Aborted socialization with %s due to emergency priorities at tick %d", s.agents[i].Agreement.PartnerID, s.tick.Load()))
						}
					}
					s.agents[i].Agreement = nil
				}
				break
			}
		}
	}
}

// findNextStep uses A* (A-Star) search with toroidal Manhattan heuristic to navigate perfectly around obstacles
func (s *Sim) findNextStep(start, target Position) Position {
if start.X == target.X && start.Y == target.Y {
return start
}
absDiff := func(a, b int) int {
if a < b {
return b - a
}
return a - b
}
// Toroidal Manhattan distance heuristic
heuristic := func(p Position) float64 {
dx := float64(absDiff(p.X, target.X))
dy := float64(absDiff(p.Y, target.Y))
// Account for world wrap-around distance
if dx > float64(s.worldWidth)/2.0 {
dx = float64(s.worldWidth) - dx
}
if dy > float64(s.worldHeight)/2.0 {
dy = float64(s.worldHeight) - dy
}
return dx + dy
}
type AStarNode struct {
pos  Position
path []Position
g    float64
f    float64
}
openSet := []AStarNode{{pos: start, path: []Position{}, g: 0, f: heuristic(start)}}
gScore := make(map[Position]float64)
gScore[start] = 0
visited := make(map[Position]bool)
dx := []int{0, 1, 0, -1}
dy := []int{-1, 0, 1, 0}
for len(openSet) > 0 {
bestIdx := 0
for idx := 1; idx < len(openSet); idx++ {
if openSet[idx].f < openSet[bestIdx].f {
bestIdx = idx
}
}
curr := openSet[bestIdx]
if curr.pos.X == target.X && curr.pos.Y == target.Y {
if len(curr.path) > 0 {
return curr.path[0]
}
return start
}
openSet = append(openSet[:bestIdx], openSet[bestIdx+1:]...)
visited[curr.pos] = true
// A* is highly optimized, we can easily explore up to 800 nodes for high IQ
if len(visited) > 800 {
break
}
for idx := 0; idx < 4; idx++ {
nextPos := Position{
X: wrap(curr.pos.X+dx[idx], s.worldWidth),
Y: wrap(curr.pos.Y+dy[idx], s.worldHeight),
}
terrain := s.terrain[nextPos.Y][nextPos.X]
if terrain == string(TerrainWater) || terrain == string(TerrainRock) {
continue
}
tentativeG := curr.g + 1.0
bestG, exists := gScore[nextPos]
if !exists || tentativeG < bestG {
gScore[nextPos] = tentativeG
newPath := append([]Position(nil), curr.path...)
newPath = append(newPath, nextPos)
neighborNode := AStarNode{
pos:  nextPos,
path: newPath,
g:    tentativeG,
f:    tentativeG + heuristic(nextPos),
}
	if !visited[nextPos] {
					inOpenSet := false
					for i := range openSet {
						if openSet[i].pos == nextPos {
							openSet[i] = neighborNode
							inOpenSet = true
							break
						}
					}
					if !inOpenSet {
						openSet = append(openSet, neighborNode)
					}
				}
			}
		}
	}

	// Smart escape: If we couldn't find a path (e.g. completely boxed in), try to make any valid move to untangle
	for idx := 0; idx < 4; idx++ {
		nextPos := Position{
			X: wrap(start.X+dx[idx], s.worldWidth),
			Y: wrap(start.Y+dy[idx], s.worldHeight),
		}
		terrain := s.terrain[nextPos.Y][nextPos.X]
		if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
			return nextPos
		}
	}

	return start
}


func wrap(value, size int) int {
	if value < 0 {
		return size - 1
	}
	if value >= size {
		return 0
	}
	return value
}

func clamp(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func hash2D(x, y int) float64 {
	h := (x*12345 + y*54321) ^ 123456789
	h = (h ^ (h >> 15)) * 2654435761
	h = (h ^ (h >> 13)) * 2654435761
	return float64(h&0xfffffff) / 268435455.0
}

func (s *Sim) infiniteNoise2D(x, y float64) float64 {
	const gridScale = 8.0
	gx := x / gridScale
	gy := y / gridScale

	x0 := int(math.Floor(gx))
	y0 := int(math.Floor(gy))
	x1 := x0 + 1
	y1 := y0 + 1

	tx := gx - float64(x0)
	ty := gy - float64(y0)

	interpolate := func(a, b, t float64) float64 {
		ft := t * math.Pi
		f := (1.0 - math.Cos(ft)) * 0.5
		return a*(1.0-f) + b*f
	}

	v00 := hash2D(x0, y0)
	v10 := hash2D(x1, y0)
	v01 := hash2D(x0, y1)
	v11 := hash2D(x1, y1)

	i1 := interpolate(v00, v10, tx)
	i2 := interpolate(v01, v11, tx)
	return interpolate(i1, i2, ty)
}

func (s *Sim) ensureSector(secX, secY int) {
	s.sectorsMu.Lock()
	defer s.sectorsMu.Unlock()

	pos := Position{X: secX, Y: secY}
	if s.sectors[pos] {
		return // already exists
	}

	s.sectors[pos] = true
	s.addEvent(fmt.Sprintf("[Courtroom/Register] Sector (%d, %d) has been discovered and mapped by scouts!", secX, secY))

	// Recompute bounding box
	var minX, maxX, minY, maxY int
	first := true
	for p := range s.sectors {
		if first {
			minX, maxX = p.X, p.X
			minY, maxY = p.Y, p.Y
			first = false
		} else {
			if p.X < minX { minX = p.X }
			if p.X > maxX { maxX = p.X }
			if p.Y < minY { minY = p.Y }
			if p.Y > maxY { maxY = p.Y }
		}
	}

	oldMinX, oldMinY := s.minSectorX, s.minSectorY
	
	s.minSectorX, s.maxSectorX = minX, maxX
	s.minSectorY, s.maxSectorY = minY, maxY

	newW := (maxX - minX + 1) * 96
	newH := (maxY - minY + 1) * 96

	// Allocate new arrays
	newTerrain := make([][]string, newH)
	newObjects := make([][]WorldObject, newH)
	for y := 0; y < newH; y++ {
		newTerrain[y] = make([]string, newW)
		newObjects[y] = make([]WorldObject, newW)
	}

	// Calculate copy offsets
	dx := (oldMinX - minX) * 96
	dy := (oldMinY - minY) * 96

	// Copy old terrain and objects
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			newTerrain[y+dy][x+dx] = s.terrain[y][x]
			newObjects[y+dy][x+dx] = s.objects[y][x]
		}
	}

	// Update agent positions & targets
	for i := range s.agents {
		s.agents[i].Position.X += dx
		s.agents[i].Position.Y += dy
		s.agents[i].Target.X += dx
		s.agents[i].Target.Y += dy
		s.agents[i].HomePosition.X += dx
		s.agents[i].HomePosition.Y += dy
	}

	// Set s.terrain and s.objects to the new larger arrays
	s.terrain = newTerrain
	s.objects = newObjects
	s.worldWidth = newW
	s.worldHeight = newH

	// Generate the new sectors
	for p := range s.sectors {
		s.generateSectorTerrain(p.X, p.Y)
	}
}

func (s *Sim) generateSectorTerrain(secX, secY int) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(secX*1000+secY)))
	for ly := 0; ly < 96; ly++ {
		for lx := 0; lx < 96; lx++ {
			absX := secX*96 + lx
			absY := secY*96 + ly

			gx := absX - s.minSectorX*96
			gy := absY - s.minSectorY*96

			if s.terrain[gy][gx] != "" {
				continue // already populated
			}

			// Generate using infinite continuous noise
			n1 := s.infiniteNoise2D(float64(absX), float64(absY))
			n2 := s.infiniteNoise2D(float64(absX)*2.5, float64(absY)*2.5)
			h := (n1 * 0.7) + (n2 * 0.3)

			switch {
			case h < s.lakesDensity:
				s.terrain[gy][gx] = string(TerrainWater)
			case h < 0.58:
				s.terrain[gy][gx] = string(TerrainGrass)
			case h < 0.78:
				s.terrain[gy][gx] = string(TerrainForest)
				if rng.Float64() < s.berriesDensity {
					s.objects[gy][gx] = WorldObject{Type: "berries", Amount: 100, MaxAmount: 100}
				}
			default:
				s.terrain[gy][gx] = string(TerrainRock)
				s.objects[gy][gx] = WorldObject{Type: "waste_pile", Amount: 0, MaxAmount: 100}
			}
		}
	}
}

func (s *Sim) checkExpansion(pos Position) {
	// Find current sector coord of the position
	absX := s.minSectorX*96 + pos.X
	absY := s.minSectorY*96 + pos.Y

	// Calculate which sector this absolute position lies in
	secX := int(math.Floor(float64(absX) / 96.0))
	secY := int(math.Floor(float64(absY) / 96.0))

	// If they are near the boundary of the stitched grid, generate adjacent sectors!
	if pos.X < 8 {
		s.ensureSector(secX-1, secY)
	}
	if pos.X > s.worldWidth-8 {
		s.ensureSector(secX+1, secY)
	}
	if pos.Y < 8 {
		s.ensureSector(secX, secY-1)
	}
	if pos.Y > s.worldHeight-8 {
		s.ensureSector(secX, secY+1)
	}
}


