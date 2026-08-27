package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
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
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Role      string     `json:"role"`
	Mood      string     `json:"mood"`
	Status    string     `json:"status"`
	Energy    int        `json:"energy"`
	Position  Position   `json:"position"`
	Target    Position   `json:"target"`
	Interests []Interest `json:"interests"`
	Agreement *Agreement `json:"agreement,omitempty"`
	Resources int        `json:"resources"` // 0-100
	Waste     int        `json:"waste"`     // 0-100
}

type WorldBounds struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type WorldState struct {
	Running     bool            `json:"running"`
	Tick        uint64          `json:"tick"`
	TickRateMs  int             `json:"tickRateMs"`
	TotalAgents int             `json:"totalAgents"`
	WorldSize   WorldBounds     `json:"worldSize"`
	Terrain     [][]string      `json:"terrain"`
	Objects     [][]WorldObject `json:"objects"`
	Agents      []Agent         `json:"agents"`
	Events      []string        `json:"events"`
	LastUpdated string          `json:"lastUpdated"`
}

type Sim struct {
	running     atomic.Bool
	tick        atomic.Uint64
	worldWidth  int
	worldHeight int
	terrain     [][]string
	objects     [][]WorldObject
	agents      []Agent
	events      []string
	eventsMu    sync.Mutex
}

func NewSim() *Sim {
	s := &Sim{
		worldWidth:  96,
		worldHeight: 96,
		events:      []string{"[System] Simulation world initialized."},
	}
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
			case h < 0.28:
				terrain[y][x] = string(TerrainWater)    // Large, connected lakes/oceans
				objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			case h < 0.58:
				terrain[y][x] = string(TerrainGrass)    // Wide plains surrounding waters
				objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
			case h < 0.78:
				terrain[y][x] = string(TerrainForest)   // Clustered woodlands adjacent to plains
				objects[y][x] = WorldObject{Type: "berries", Amount: 100, MaxAmount: 100}
			default:
				terrain[y][x] = string(TerrainRock)     // Massive mountain ranges in high elevation
				objects[y][x] = WorldObject{Type: "waste_pile", Amount: 0, MaxAmount: 100}
			}
		}
	}

	// Procedurally place 3 small homestead settlements (Gehöfte)
	centersX := []int{24, 48, 72}
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

		// Place 4 crop tiles at specific offsets around the 2x2 homestead
		cropOffsets := [][2]int{{-1, -1}, {2, -1}, {-1, 2}, {2, 2}}
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

	// Place a central courthouse cluster (court) representing legal system in the middle of the world
	courtY := s.worldHeight/2 - 4
	courtX := s.worldWidth/2 - 2
	for dy := 0; dy < 2; dy++ {
		for dx := 0; dx < 2; dx++ {
			ny := wrap(courtY+dy, s.worldHeight)
			nx := wrap(courtX+dx, s.worldWidth)
			if terrain[ny][nx] != string(TerrainWater) {
				terrain[ny][nx] = string(TerrainCourt)
				objects[ny][nx] = WorldObject{Type: "courtroom", Amount: 100, MaxAmount: 100}
			}
		}
	}

	// Place a central marketplace cluster (market) near the courthouse
	marketY := s.worldHeight/2 - 4
	marketX := s.worldWidth/2 + 2
	for dy := 0; dy < 2; dy++ {
		for dx := 0; dx < 2; dx++ {
			ny := wrap(marketY+dy, s.worldHeight)
			nx := wrap(marketX+dx, s.worldWidth)
			if terrain[ny][nx] != string(TerrainWater) {
				terrain[ny][nx] = string(TerrainMarket)
				objects[ny][nx] = WorldObject{Type: "market_stall", Amount: 100, MaxAmount: 100}
			}
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

		s.agents = append(s.agents, Agent{
			ID:        fmt.Sprintf("agent-%d", i+1),
			Name:      name,
			Role:      roles[i%len(roles)],
			Mood:      "calm",
			Status:    "patrolling",
			Energy:    72 + i*4,
			Position:  position,
			Target:    target,
			Interests: interests[i%len(interests)],
			Resources: 80 + (i*3)%21,
			Waste:     5 + (i*2)%16,
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
	http.HandleFunc("/state", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s.snapshot())
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

	state := WorldState{
		Running:     s.running.Load(),
		Tick:        s.tick.Load(),
		TickRateMs:  500,
		TotalAgents: len(s.agents),
		WorldSize: WorldBounds{
			Width:  s.worldWidth,
			Height: s.worldHeight,
		},
		Terrain:     terrain,
		Objects:     objects,
		Agents:      make([]Agent, len(s.agents)),
		Events:      copiedEvents,
		LastUpdated: time.Now().UTC().Format(time.RFC3339),
	}
	copy(state.Agents, s.agents)
	return state
}

func (s *Sim) loop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
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

	// 1. Decay energy, resources and accumulate waste
	for i := range s.agents {
		agent := &s.agents[i]
		agent.Resources = clamp(agent.Resources - 2, 0, 100)
		if agent.Resources == 0 {
			// Starvation penalty: energy decays much faster without food/water
			agent.Energy = clamp(agent.Energy - 3, 0, 100)
		} else {
			agent.Energy = clamp(agent.Energy - 1, 0, 100)
		}
		agent.Waste = clamp(agent.Waste + 1, 0, 100)
	}

	// 2. Process social contagions and agreements (socializing / cooperating)
	for i := range s.agents {
		agent := &s.agents[i]
		
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
					// Check for matching interests
					for idxA := range agent.Interests {
						for idxB := range other.Interests {
							if agent.Interests[idxA].Name == other.Interests[idxB].Name {
								sharedName := agent.Interests[idxA].Name
								avgIntensity := (agent.Interests[idxA].Intensity + other.Interests[idxB].Intensity) / 2
								if avgIntensity > 30 {
									// 1. Contagion: transmission of interests (intensity converges slightly upwards)
									if agent.Interests[idxA].Intensity < other.Interests[idxB].Intensity {
										agent.Interests[idxA].Intensity = clamp(agent.Interests[idxA].Intensity + 4, 0, 100)
									} else if other.Interests[idxB].Intensity < agent.Interests[idxA].Intensity {
										other.Interests[idxB].Intensity = clamp(other.Interests[idxB].Intensity + 4, 0, 100)
									}

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
										s.addEvent(fmt.Sprintf("%s and %s formed a %s agreement about %s!", agent.Name, other.Name, agreeType, sharedName))
									}
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
					s.addEvent(fmt.Sprintf("%s drank water at the lake 💧", agent.Name))
					break
				} else if t == string(TerrainForest) && s.objects[ny][nx].Amount > 10 {
					s.objects[ny][nx].Amount -= 15
					agent.Resources = 100
					agent.Status = "replenished (berries)"
					agent.Mood = "satisfied"
					s.addEvent(fmt.Sprintf("%s harvested berries in the forest 🍒", agent.Name))
					break
				} else if t == string(TerrainCrops) && s.objects[ny][nx].Amount > 10 {
					s.objects[ny][nx].Amount -= 20
					agent.Resources = 100
					agent.Status = "replenished (crops)"
					agent.Mood = "satisfied"
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
					s.addEvent(fmt.Sprintf("%s disposed waste at the mountaintop 🗑️", agent.Name))
					break
				}
			}
		}
		if agent.Energy < 25 && isNextToHome {
			agent.Energy = 100
			agent.Status = "sleeping at homestead"
			agent.Mood = "satisfied"
			s.addEvent(fmt.Sprintf("%s fell asleep cozy at the homestead 🏡", agent.Name))
		}

		// Decrement active agreements on target reached/tick decay
		if agent.Agreement != nil {
			agent.Agreement.TicksLeft--
			if agent.Agreement.TicksLeft <= 0 || (agent.Position.X == agent.Target.X && agent.Position.Y == agent.Target.Y) {
				agent.Agreement = nil
			}
		}

		// Calculate path step towards target decided by Python Mesa
		nextStep := s.findNextStep(agent.Position, agent.Target)
		agent.Position = nextStep
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
	}

	resp, err := client.DecideActions(ctx, req)
	if err != nil {
		log.Printf("Warning: DecideActions gRPC call failed: %v", err)
		return
	}

	for _, dec := range resp.Decisions {
		for i := range s.agents {
			if s.agents[i].ID == dec.AgentId {
				s.agents[i].Target = Position{X: int(dec.Target.X), Y: int(dec.Target.Y)}
				s.agents[i].Status = dec.Status
				s.agents[i].Mood = dec.Mood
				s.agents[i].Energy = int(dec.Energy)
				s.agents[i].Resources = int(dec.Resources)
				s.agents[i].Waste = int(dec.Waste)
				if dec.Agreement != nil {
					if s.agents[i].Agreement == nil {
						s.agents[i].Agreement = &Agreement{}
					}
					s.agents[i].Agreement.PartnerID = dec.Agreement.PartnerId
					s.agents[i].Agreement.Type = dec.Agreement.Type
					s.agents[i].Agreement.TargetX = int(dec.Agreement.TargetX)
					s.agents[i].Agreement.TargetY = int(dec.Agreement.TargetY)
					s.agents[i].Agreement.TicksLeft = int(dec.Agreement.TicksLeft)
				} else {
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

