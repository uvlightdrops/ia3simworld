package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"time"
)

func (s *Sim) calculateAgentSignature(agent *Agent) string {
	secret := getenv("HMAC_SECRET", "ia3-simworld-secret-seal-key")
	canonical := fmt.Sprintf("%s:%s:%s:%d:%d:%d:%d:%d", 
		agent.ID, agent.Name, agent.Role, agent.Energy, agent.Resources, agent.Waste, agent.MissionsCompleted, agent.SocializedCount)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(canonical))
	return hex.EncodeToString(h.Sum(nil))
}

func (s *Sim) verifyAgentSignature(agent *Agent) bool {
	expected := s.calculateAgentSignature(agent)
	return hmac.Equal([]byte(agent.Signature), []byte(expected))
}

func (a *Agent) addHistory(entry string) {
	a.History = append([]string{entry}, a.History...)
	if len(a.History) > 50 {
		a.History = a.History[:50]
	}
}

func (s *Sim) generateTerrain() {
	s.generating.Store(true)
	s.genProgress.Store(0)
	s.genPhase.Store("Initialisierung")
	s.osmDataLoaded = false
	defer func() {
		s.genPhase.Store("Fertig")
		s.genProgress.Store(100)
		s.generating.Store(false)
	}()

	terrain := make([][]string, s.worldHeight)
	objects := make([][]WorldObject, s.worldHeight)
	for y := 0; y < s.worldHeight; y++ {
		terrain[y] = make([]string, s.worldWidth)
		objects[y] = make([]WorldObject, s.worldWidth)
	}

	sectorOffsetX := s.minSectorX * s.worldWidth
	sectorOffsetY := s.minSectorY * s.worldHeight

	hash2D := func(gx, gy int64) float64 {
		h := uint64(gx*374761393 + gy*668265263 + 421337)
		h = (h ^ (h >> 13)) * 1274126177
		return float64((h^(h>>16))&0xFFFFFFFF) / 4294967295.0
	}

	interpolate := func(a, b, t float64) float64 {
		ft := t * math.Pi
		f := (1.0 - math.Cos(ft)) * 0.5
		return a*(1.0-f) + b*f
	}

	const gridScale = 24.0
	noise2D := func(wx, wy float64) float64 {
		gx := wx / gridScale
		gy := wy / gridScale
		x0 := int64(math.Floor(gx))
		y0 := int64(math.Floor(gy))
		x1 := x0 + 1
		y1 := y0 + 1
		tx := gx - float64(x0)
		ty := gy - float64(y0)
		v00 := hash2D(x0, y0)
		v10 := hash2D(x1, y0)
		v01 := hash2D(x0, y1)
		v11 := hash2D(x1, y1)
		i1 := interpolate(v00, v10, tx)
		i2 := interpolate(v01, v11, tx)
		return interpolate(i1, i2, ty)
	}

	riverWidth := s.riverWidth
	if riverWidth <= 0 {
		riverWidth = 3
	}
	lakesDensity := s.lakesDensity
	if lakesDensity <= 0 {
		lakesDensity = 0.28
	}
	grassThreshold := s.grassThreshold
	if grassThreshold <= lakesDensity {
		grassThreshold = lakesDensity + 0.25
	}
	forestThreshold := s.forestThreshold
	if forestThreshold <= grassThreshold {
		forestThreshold = grassThreshold + 0.28
	}
	berriesDensity := s.berriesDensity
	if berriesDensity <= 0 {
		berriesDensity = 0.15
	}

	// ── Phase 1: Gelände (Biome-Noise) ─────────────────────────────────────
	s.genPhase.Store("Gelände")
	s.genProgress.Store(2)
	updateInterval := s.worldHeight / 20
	if updateInterval < 1 {
		updateInterval = 1
	}
	for y := 0; y < s.worldHeight; y++ {
		if y%updateInterval == 0 {
			s.genProgress.Store(int32(2 + (y*18)/s.worldHeight))
		}
		absY := float64(sectorOffsetY + y)
		for x := 0; x < s.worldWidth; x++ {
			absX := float64(sectorOffsetX + x)
			n1 := noise2D(absX, absY)
			n2 := noise2D(absX*2.7, absY*2.7)
			n3 := noise2D(absX*5.5, absY*5.5)
			h := n1*0.58 + n2*0.28 + n3*0.14
			switch {
			case h < lakesDensity:
				terrain[y][x] = string(TerrainWater)
			case h < grassThreshold:
				terrain[y][x] = string(TerrainGrass)
			case h < forestThreshold:
				terrain[y][x] = string(TerrainForest)
				berryVal := hash2D(int64(absX)+9999, int64(absY)+8888)
				if berryVal < berriesDensity {
					objects[y][x] = WorldObject{Type: "berries", Amount: 100, MaxAmount: 100}
				}
			default:
				terrain[y][x] = string(TerrainRock)
				objects[y][x] = WorldObject{Type: "waste_pile", Amount: 0, MaxAmount: 100}
			}
		}
	}

	// ── Phase 2: Flüsse ─────────────────────────────────────────────────────
	s.genPhase.Store("Flüsse & Seen")
	s.genProgress.Store(22)
	// Main river (sinuous, wider)
	for y := 0; y < s.worldHeight; y++ {
		absY := float64(sectorOffsetY + y)
		absX0 := float64(sectorOffsetX + s.worldWidth/3)
		globalRiverX := absX0 + math.Sin(absY*0.03)*40.0 + math.Cos(absY*0.09)*20.0
		localRiverX := int(globalRiverX) - sectorOffsetX
		for rw := -riverWidth; rw <= riverWidth; rw++ {
			rx := wrap(localRiverX+rw, s.worldWidth)
			terrain[y][rx] = string(TerrainWater)
			objects[y][rx] = WorldObject{}
		}
	}
	// Secondary river (narrower)
	for y := 0; y < s.worldHeight; y++ {
		absY := float64(sectorOffsetY + y)
		absX0 := float64(sectorOffsetX + 2*s.worldWidth/3)
		globalRiverX := absX0 + math.Sin(absY*0.05)*25.0 + math.Cos(absY*0.13)*10.0
		localRiverX := int(globalRiverX) - sectorOffsetX
		for rw := -(riverWidth - 1); rw <= (riverWidth - 1); rw++ {
			rx := wrap(localRiverX+rw, s.worldWidth)
			terrain[y][rx] = string(TerrainWater)
			objects[y][rx] = WorldObject{}
		}
	}

	// Helper: place rectangular footprint, skip water tiles
	placeRect := func(cx, cy, w, h int, t Terrain, objType string, objAmt int) {
		ox := cx - w/2
		oy := cy - h/2
		for dy := 0; dy < h; dy++ {
			for dx := 0; dx < w; dx++ {
				nx := wrap(ox+dx, s.worldWidth)
				ny := wrap(oy+dy, s.worldHeight)
				if terrain[ny][nx] != string(TerrainWater) {
					terrain[ny][nx] = string(t)
					if objType != "" {
						objects[ny][nx] = WorldObject{Type: objType, Amount: objAmt, MaxAmount: objAmt}
					}
				}
			}
		}
	}

	// Helper: place circular footprint
	placeCircle := func(cx, cy, r int, t Terrain, objType string, objAmt int) {
		for dy := -r; dy <= r; dy++ {
			for dx := -r; dx <= r; dx++ {
				if dx*dx+dy*dy <= r*r {
					nx := wrap(cx+dx, s.worldWidth)
					ny := wrap(cy+dy, s.worldHeight)
					if terrain[ny][nx] != string(TerrainWater) {
						terrain[ny][nx] = string(t)
						if objType != "" {
							objects[ny][nx] = WorldObject{Type: objType, Amount: objAmt, MaxAmount: objAmt}
						}
					}
				}
			}
		}
	}

	// Helper: draw road between two points
	connectPoints := func(p1, p2 Position) {
		cx, cy := p1.X, p1.Y
		for cx != p2.X || cy != p2.Y {
			t := terrain[cy][cx]
			if t == string(TerrainGrass) || t == string(TerrainForest) || t == string(TerrainRock) {
				terrain[cy][cx] = string(TerrainRoad)
			}
			if cx < p2.X {
				cx++
			} else if cx > p2.X {
				cx--
			}
			if cy < p2.Y {
				cy++
			} else if cy > p2.Y {
				cy--
			}
		}
	}

	isWater := func(cx, cy int) bool {
		return terrain[wrap(cy, s.worldHeight)][wrap(cx, s.worldWidth)] == string(TerrainWater)
	}

	// ── Phase 3: Siedlungen ──────────────────────────────────────────────────
	s.genPhase.Store("Siedlungen")
	s.genProgress.Store(32)
	var settlementCenters []Position
	candidateCenters := []Position{
		{X: s.worldWidth / 5, Y: s.worldHeight / 4},
		{X: 3 * s.worldWidth / 4, Y: s.worldHeight / 5},
		{X: s.worldWidth / 2, Y: 3 * s.worldHeight / 4},
		{X: s.worldWidth / 4, Y: 3 * s.worldHeight / 5},
	}
	for _, cand := range candidateCenters {
		cx, cy := cand.X, cand.Y
		found := false
		for attempts := 0; attempts < 200 && !found; attempts++ {
			tx := wrap(cx+(attempts%14)-7, s.worldWidth)
			ty := wrap(cy+(attempts/14)-7, s.worldHeight)
			if isWater(tx, ty) {
				continue
			}
			farEnough := true
			for _, sc := range settlementCenters {
				if s.toroidalDistance(Position{X: tx, Y: ty}, sc) < 70.0 {
					farEnough = false
					break
				}
			}
			if farEnough {
				settlementCenters = append(settlementCenters, Position{X: tx, Y: ty})
				found = true
			}
		}
		if !found {
			settlementCenters = append(settlementCenters, Position{X: wrap(cand.X, s.worldWidth), Y: wrap(cand.Y, s.worldHeight)})
		}
	}

	// Settlement homestead circles (radius 4-6), plus a small farm on the outskirts
	for i, sc := range settlementCenters {
		r := 4 + i%3 // 4, 5, 6, 4
		placeCircle(sc.X, sc.Y, r, TerrainHome, "homestead", 100)
		farmX := wrap(sc.X+r+3, s.worldWidth)
		if !isWater(farmX, sc.Y) {
			placeRect(farmX, sc.Y, 3, 3, TerrainFarm, "farm", 100)
		}
	}

	// ── Phase 4: Infrastruktur ───────────────────────────────────────────────
	s.genPhase.Store("Infrastruktur")
	s.genProgress.Store(50)
	if len(settlementCenters) >= 2 {
		c0 := settlementCenters[0]
		c1 := settlementCenters[1]
		cLast := settlementCenters[len(settlementCenters)-1]

		// Court 3×3 between settlements 0 and 1
		courtX := wrap((c0.X+c1.X)/2, s.worldWidth)
		courtY := wrap((c0.Y+c1.Y)/2, s.worldHeight)
		placeRect(courtX, courtY, 3, 3, TerrainCourt, "courtroom", 100)

		// Market 4×4 near settlement midpoint
		marketX := wrap((c1.X+cLast.X)/2, s.worldWidth)
		marketY := wrap((c1.Y+cLast.Y)/2, s.worldHeight)
		placeRect(marketX, marketY, 4, 4, TerrainMarket, "marketplace", 100)

		// Storehouse 3×3 adjacent to market
		placeRect(wrap(marketX+6, s.worldWidth), wrap(marketY-3, s.worldHeight), 3, 3, TerrainStorehouse, "storehouse", 100)

		// Temple 3×3 (Geistesleben) on outskirts of last settlement
		placeRect(wrap(cLast.X-8, s.worldWidth), wrap(cLast.Y-5, s.worldHeight), 3, 3, TerrainTemple, "shrine", 80)

		// Graveyard 3×3
		placeRect(wrap(cLast.X+9, s.worldWidth), wrap(cLast.Y+7, s.worldHeight), 3, 3, TerrainGraveyard, "grave", 50)

		// Per-settlement production buildings with proper footprints
		for _, sc := range settlementCenters {
			placeRect(wrap(sc.X+8, s.worldWidth), wrap(sc.Y+3, s.worldHeight), 2, 2, TerrainMill, "mill", 100)
			placeRect(wrap(sc.X-8, s.worldWidth), wrap(sc.Y-3, s.worldHeight), 2, 2, TerrainForge, "forge", 100)
			placeRect(wrap(sc.X-4, s.worldWidth), wrap(sc.Y+8, s.worldHeight), 2, 3, TerrainQuarry, "quarry", 100)
			placeRect(wrap(sc.X+6, s.worldWidth), wrap(sc.Y-6, s.worldHeight), 2, 2, TerrainPottery, "pottery", 100)
			placeRect(wrap(sc.X+3, s.worldWidth), wrap(sc.Y+3, s.worldHeight), 2, 2, TerrainWorkshop, "workshop", 100)
			wellX := wrap(sc.X+2, s.worldWidth)
			wellY := wrap(sc.Y-2, s.worldHeight)
			if !isWater(wellX, wellY) {
				terrain[wellY][wellX] = string(TerrainWell)
				objects[wellY][wellX] = WorldObject{Type: "well", Amount: 100, MaxAmount: 100}
			}
		}

		// ── Phase 5: Straßen ──────────────────────────────────────────────
		s.genPhase.Store("Straßen")
		s.genProgress.Store(62)
		connectPoints(c0, Position{X: courtX, Y: courtY})
		connectPoints(Position{X: courtX, Y: courtY}, c1)
		connectPoints(c1, Position{X: marketX, Y: marketY})
		connectPoints(Position{X: marketX, Y: marketY}, cLast)
		if len(settlementCenters) >= 4 {
			connectPoints(c0, settlementCenters[3])
		}
	}

	// ── Phase 6: Felder (Crops) ──────────────────────────────────────────────
	s.genPhase.Store("Felder & Vegetation")
	s.genProgress.Store(72)
	for _, sc := range settlementCenters {
		for strip := 0; strip < 2; strip++ {
			sign := 1 - strip*2 // +1 or -1
			baseX := wrap(sc.X+sign*(8+strip*5), s.worldWidth)
			for row := -5; row <= 5; row++ {
				for col := 0; col < 8; col++ {
					fx := wrap(baseX+sign*col, s.worldWidth)
					fy := wrap(sc.Y+row, s.worldHeight)
					if terrain[fy][fx] == string(TerrainGrass) {
						terrain[fy][fx] = string(TerrainCrops)
						objects[fy][fx] = WorldObject{Type: "grain", Amount: 80, MaxAmount: 100}
					}
				}
			}
		}
	}

	// ── Phase 7: Brücken über Flüsse ────────────────────────────────────────
	s.genPhase.Store("Brücken & Details")
	s.genProgress.Store(84)
	for y := s.worldHeight / 10; y < s.worldHeight-s.worldHeight/10; y += s.worldHeight / 5 {
		for x := 2; x < s.worldWidth-2; x++ {
			if terrain[y][x] != string(TerrainRoad) {
				continue
			}
			leftW, rightW := false, false
			for d := 1; d <= riverWidth+2; d++ {
				if x-d >= 0 && terrain[y][x-d] == string(TerrainWater) {
					leftW = true
				}
				if x+d < s.worldWidth && terrain[y][x+d] == string(TerrainWater) {
					rightW = true
				}
			}
			if leftW && rightW {
				terrain[y][x] = string(TerrainBridge)
				objects[y][x] = WorldObject{Type: "bridge", Amount: 100, MaxAmount: 100}
			}
		}
	}

	s.interactionMu.Lock()
	s.terrain = terrain
	s.objects = objects
	s.createdAt = time.Now().UTC()
	s.interactionMu.Unlock()
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

	s.interactionMu.Lock()
	state := WorldState{
		Running:           s.running.Load(),
		Tick:              s.tick.Load(),
		TickRateMs:        int(s.tickDuration.Milliseconds()),
		TotalAgents:       len(s.agents),
		WorldSize:         WorldBounds{Width: s.worldWidth, Height: s.worldHeight},
		Terrain:           terrain,
		Objects:           objects,
		Agents:            make([]Agent, len(s.agents)),
		Events:            copiedEvents,
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
		CreatedAt:         s.createdAt.Format(time.RFC3339),
		GrassPolicy:       s.grassPolicy,
		ForestPolicy:      s.forestPolicy,
		ActiveLaws:        s.activeLaws,
		GridOriginX:       s.minSectorX * 256,
		GridOriginY:       s.minSectorY * 256,
		DiscoveredSectors: sectorsList,
		ActiveScenario:    s.scenarioType,
		ScenarioState:     s.scenarioState,
		ScenarioTargetX:   s.scenarioTarget.X,
		ScenarioTargetY:   s.scenarioTarget.Y,
		ScenarioTicksLeft: s.scenarioTicksLeft,
		ActiveInteraction: s.activeInteraction,
		AutoAnswerMode:    s.autoAnswerMode,
		RelicSpawnRate:    s.relicSpawnRate,
		LawProposeRate:    s.lawProposeRate,
		EconEventRate:     s.econEventRate,
		ArtifactQuality:   s.artifactQuality,
		OllamaEnabled:     s.ollamaEnabled,
		OllamaBaseURL:     s.ollamaBaseURL,
		OllamaModel:       s.ollamaModel,
		OllamaMode:        s.ollamaMode,
		OllamaTimeoutMs:   s.ollamaTimeoutMs,
		ManagerAThoughts:  s.managerAThoughts,
		ManagerBThoughts:  s.managerBThoughts,
		ManagerCThoughts:  s.managerCThoughts,
		Goods:             s.goods,
		Recipes:           s.recipes,
		GraphEdges:        s.graphEdges,
		BrainNodes:        s.brainNodes,
		OsmDataLoaded:     s.osmDataLoaded,
		CenterLatLon:      s.centerLatLon,
		Generating:        s.generating.Load(),
		GenProgress:       int(s.genProgress.Load()),
		GenPhase:          func() string { v, _ := s.genPhase.Load().(string); return v }(),
		DomainSettings:    s.domainSettings,
		SectorClaims:      s.sectorClaimsSlice(),
		NodeID:            s.nodeID,
		AssignedSectorX:   s.assignedSectorX,
		AssignedSectorY:   s.assignedSectorY,
	}
	s.interactionMu.Unlock()
	copy(state.Agents, s.agents)
	return state
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func wrap(v, max int) int {
	return clampInt(v, 0, max-1)
}
