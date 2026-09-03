package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
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
	s.generationMu.Lock()
	defer s.generationMu.Unlock()

	s.generating.Store(true)
	s.genProgress.Store(0)
	s.genPhase.Store("Initialisierung")
	s.osmDataLoaded = false
	phaseDelay := 1000 * time.Millisecond
	defer func() {
		s.lastGeneratedAt = time.Now().UTC()
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
	time.Sleep(phaseDelay)
	updateInterval := s.worldHeight / 20
	if updateInterval < 1 {
		updateInterval = 1
	}

	// Parallelize terrain generation across rows
	var wg sync.WaitGroup
	numWorkers := 4 // Use 4 goroutines for parallel terrain generation
	rowChan := make(chan int, numWorkers*2)

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for y := range rowChan {
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
				// Update progress every updateInterval rows
				if y%updateInterval == 0 {
					s.genProgress.Store(int32(2 + (y*18)/s.worldHeight))
				}
			}
		}()
	}

	// Send rows to workers
	go func() {
		for y := 0; y < s.worldHeight; y++ {
			rowChan <- y
		}
		close(rowChan)
	}()

	wg.Wait()

	// ── Phase 2: Flüsse ─────────────────────────────────────────────────────
	s.genPhase.Store("Flüsse & Seen")
	s.genProgress.Store(22)
	time.Sleep(phaseDelay)
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

	// Helper: draw a 3-tile wide road band between two points
	paintRoadBand := func(cx, cy int) {
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				nx := wrap(cx+dx, s.worldWidth)
				ny := wrap(cy+dy, s.worldHeight)
				if terrain[ny][nx] != string(TerrainWater) {
					terrain[ny][nx] = string(TerrainRoad)
				}
			}
		}
	}
	connectPoints := func(p1, p2 Position) {
		cx, cy := p1.X, p1.Y
		for cx != p2.X || cy != p2.Y {
			paintRoadBand(cx, cy)
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
		paintRoadBand(cx, cy)
	}

	isWater := func(cx, cy int) bool {
		return terrain[wrap(cy, s.worldHeight)][wrap(cx, s.worldWidth)] == string(TerrainWater)
	}

	// ── Phase 3: Siedlungen ──────────────────────────────────────────────────
	s.genPhase.Store("Siedlungen")
	s.genProgress.Store(32)
	time.Sleep(phaseDelay)
	var settlementCenters []Position
	baseCandidates := []Position{
		{X: s.worldWidth / 5, Y: s.worldHeight / 4},
		{X: 3 * s.worldWidth / 4, Y: s.worldHeight / 5},
		{X: s.worldWidth / 2, Y: 3 * s.worldHeight / 4},
		{X: s.worldWidth / 4, Y: 3 * s.worldHeight / 5},
	}
	requestedCount := s.settlementCount
	if requestedCount <= 0 {
		requestedCount = len(baseCandidates)
	}
	for i := 0; i < requestedCount; i++ {
		cand := baseCandidates[i%len(baseCandidates)]
		if i >= len(baseCandidates) {
			cand = Position{
				X: wrap((s.worldWidth*(i+1))/(requestedCount+1), s.worldWidth),
				Y: wrap((s.worldHeight*(i+2))/(requestedCount+2), s.worldHeight),
			}
		}
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

	// Settlement homestead circles + configurable farms placed outside the core area.
	var lastR int
	for i, sc := range settlementCenters {
		r := 4 + i%3
		lastR = r
		placeCircle(sc.X, sc.Y, r, TerrainHome, "homestead", 100)
		farmCount := s.architecture.FarmsPerSettlement
		if farmCount <= 0 {
			farmCount = 1
		}
		for f := 0; f < farmCount; f++ {
			angle := (2.0*math.Pi/float64(farmCount))*float64(f) + float64(i)*0.7
			farmRadius := r + 9 + f*2
			farmX := wrap(sc.X+int(math.Round(math.Cos(angle)*float64(farmRadius))), s.worldWidth)
			farmY := wrap(sc.Y+int(math.Round(math.Sin(angle)*float64(farmRadius))), s.worldHeight)
			if !isWater(farmX, farmY) {
				placeRect(farmX, farmY, 3, 3, TerrainFarm, "farm", 100)
				connectPoints(sc, Position{X: farmX, Y: farmY})
			}
		}
	}

	// Spiritual centers can be configured per settlement.
	for i, sc := range settlementCenters {
		count := s.architecture.SpiritualCentersPerSettlement
		if count <= 0 {
			count = 1
		}
		for c := 0; c < count; c++ {
			angle := (2.0*math.Pi/float64(count))*float64(c) + float64(i)*0.9
			spiritX := wrap(sc.X+int(math.Round(math.Cos(angle)*float64(lastR+8))), s.worldWidth)
			spiritY := wrap(sc.Y+int(math.Round(math.Sin(angle)*float64(lastR+8)))+2, s.worldHeight)
			placeRect(spiritX, spiritY, 3, 3, TerrainSpiritualCenter, "spiritual_center", 100)
			s.spiritualCenters = append(s.spiritualCenters, Position{X: spiritX, Y: spiritY})
			connectPoints(sc, Position{X: spiritX, Y: spiritY})
		}
	}

	// ── Phase 4: Infrastruktur ───────────────────────────────────────────────
	s.genPhase.Store("Infrastruktur")
	s.genProgress.Store(50)
	time.Sleep(phaseDelay)
	if len(settlementCenters) >= 2 {
		c0 := settlementCenters[0]
		c1 := settlementCenters[1]
		cLast := settlementCenters[len(settlementCenters)-1]

		if s.architecture.CourtsTotal > 0 {
			courtX := wrap((c0.X+c1.X)/2, s.worldWidth)
			courtY := wrap((c0.Y+c1.Y)/2, s.worldHeight)
			placeRect(courtX, courtY, 3, 3, TerrainCourt, "courtroom", 100)
		}

		if s.architecture.MarketsTotal > 0 {
			marketX := wrap((c1.X+cLast.X)/2, s.worldWidth)
			marketY := wrap((c1.Y+cLast.Y)/2, s.worldHeight)
			placeRect(marketX, marketY, 4, 4, TerrainMarket, "marketplace", 100)
		}

		if s.architecture.StorehousesTotal > 0 {
			marketX := wrap((c1.X+cLast.X)/2, s.worldWidth)
			marketY := wrap((c1.Y+cLast.Y)/2, s.worldHeight)
			placeRect(wrap(marketX+6, s.worldWidth), wrap(marketY-3, s.worldHeight), 3, 3, TerrainStorehouse, "storehouse", 100)
		}

		placeRect(wrap(cLast.X-8, s.worldWidth), wrap(cLast.Y-5, s.worldHeight), 3, 3, TerrainTemple, "shrine", 80)
		placeRect(wrap(cLast.X+9, s.worldWidth), wrap(cLast.Y+7, s.worldHeight), 3, 3, TerrainGraveyard, "grave", 50)

		for _, sc := range settlementCenters {
			for j := 0; j < s.architecture.MillsPerSettlement; j++ {
				offX, offY := 8+j*3, 3+j
				placeRect(wrap(sc.X+offX, s.worldWidth), wrap(sc.Y+offY, s.worldHeight), 2, 2, TerrainMill, "mill", 100)
			}
			for j := 0; j < s.architecture.ForgesPerSettlement; j++ {
				offX, offY := -8-j*3, -3-j
				placeRect(wrap(sc.X+offX, s.worldWidth), wrap(sc.Y+offY, s.worldHeight), 2, 2, TerrainForge, "forge", 100)
			}
			for j := 0; j < s.architecture.QuarriesPerSettlement; j++ {
				offX, offY := -4-j, 8+j*2
				placeRect(wrap(sc.X+offX, s.worldWidth), wrap(sc.Y+offY, s.worldHeight), 2, 3, TerrainQuarry, "quarry", 100)
			}
			for j := 0; j < s.architecture.PotteryPerSettlement; j++ {
				offX, offY := 6+j*2, -6-j*2
				placeRect(wrap(sc.X+offX, s.worldWidth), wrap(sc.Y+offY, s.worldHeight), 2, 2, TerrainPottery, "pottery", 100)
			}
			for j := 0; j < s.architecture.WorkshopsPerSettlement; j++ {
				offX, offY := 3+j*2, 3+j*2
				placeRect(wrap(sc.X+offX, s.worldWidth), wrap(sc.Y+offY, s.worldHeight), 2, 2, TerrainWorkshop, "workshop", 100)
			}
			for j := 0; j < s.architecture.WellsPerSettlement; j++ {
				wellX := wrap(sc.X+2+j, s.worldWidth)
				wellY := wrap(sc.Y-2-j, s.worldHeight)
				if !isWater(wellX, wellY) {
					terrain[wellY][wellX] = string(TerrainWell)
					objects[wellY][wellX] = WorldObject{Type: "well", Amount: 100, MaxAmount: 100}
				}
			}
		}
	}

	// ── Phase 5: Straßen ──────────────────────────────────────────────
	s.genPhase.Store("Straßen")
	s.genProgress.Store(62)
	time.Sleep(phaseDelay)
	if len(settlementCenters) >= 2 {
		c0 := settlementCenters[0]
		c1 := settlementCenters[1]
		cLast := settlementCenters[len(settlementCenters)-1]
		courtX := wrap((c0.X+c1.X)/2, s.worldWidth)
		courtY := wrap((c0.Y+c1.Y)/2, s.worldHeight)
		marketX := wrap((c1.X+cLast.X)/2, s.worldWidth)
		marketY := wrap((c1.Y+cLast.Y)/2, s.worldHeight)
		connectPoints(c0, Position{X: courtX, Y: courtY})
		connectPoints(Position{X: courtX, Y: courtY}, c1)
		connectPoints(c1, Position{X: marketX, Y: marketY})
		connectPoints(Position{X: marketX, Y: marketY}, cLast)
		for _, sc := range settlementCenters {
			connectPoints(sc, Position{X: wrap(sc.X+8, s.worldWidth), Y: wrap(sc.Y+3, s.worldHeight)})
			connectPoints(sc, Position{X: wrap(sc.X-8, s.worldWidth), Y: wrap(sc.Y-3, s.worldHeight)})
			connectPoints(sc, Position{X: wrap(sc.X+2, s.worldWidth), Y: wrap(sc.Y-2, s.worldHeight)})
		}
		if len(settlementCenters) >= 4 {
			connectPoints(c0, settlementCenters[3])
		}
	} else if len(settlementCenters) == 1 {
		center := settlementCenters[0]
		connectPoints(center, Position{X: wrap(center.X+3, s.worldWidth), Y: wrap(center.Y+3, s.worldHeight)})
		connectPoints(Position{X: wrap(center.X+3, s.worldWidth), Y: wrap(center.Y+3, s.worldHeight)}, Position{X: wrap(center.X+6, s.worldWidth), Y: wrap(center.Y-6, s.worldHeight)})
	}

	// ── Phase 6: Felder (Crops) ──────────────────────────────────────────────
	s.genPhase.Store("Felder & Vegetation")
	s.genProgress.Store(72)
	time.Sleep(phaseDelay)
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
	time.Sleep(phaseDelay)
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

	s.initializeSettlements(settlementCenters)
	s.interactionMu.Lock()
	s.terrain = terrain
	s.objects = objects
	s.settlementCenters = settlementCenters
	s.createdAt = time.Now().UTC()
	s.interactionMu.Unlock()
	time.Sleep(phaseDelay)
}

func (s *Sim) initializeSettlements(centers []Position) {
	if len(centers) == 0 {
		return
	}
	settlements := make([]Settlement, 0, len(centers))
	for i, center := range centers {
		stage := "subsistence"
		production := "farming"
		if i > 1 {
			stage = "agricultural"
			production = "crafting"
		}
		settlements = append(settlements, Settlement{
			ID:              fmt.Sprintf("settlement-%d", i+1),
			Center:          center,
			Population:      6 + i*2,
			Housing:         6 + i*2,
			FieldCount:      2 + i,
			WorkshopCount:   1 + i/2,
			StorageCapacity: 180 + i*40,
			FoodStore:       90 + i*15,
			WoodStore:       70 + i*12,
			StoneStore:      60 + i*10,
			Stage:           stage,
			ProductionFocus: production,
			HousingTarget:   12 + i*4,
			FoodTarget:      140 + i*20,
			BuildQueue: []ConstructionProject{
				{Kind: "field", Name: "Expand farmland", Priority: 1},
				{Kind: "home", Name: "Build housing", Priority: 2},
			},
		})
	}
	s.settlements = settlements
	s.civilizationStage = "subsistence"
	if len(settlements) >= 2 {
		s.civilizationStage = "agricultural"
	}
	if len(settlements) >= 3 {
		s.civilizationStage = "crafting"
	}
	if len(settlements) >= 4 {
		s.civilizationStage = "trade"
	}
}

func queueAlreadyScheduled(queue []ConstructionProject, kind string) bool {
	for _, project := range queue {
		if project.Kind == kind {
			return true
		}
	}
	return false
}

func (s *Sim) prioritizeSettlementBuilds(settlement *Settlement) {
	if settlement == nil {
		return
	}
	if settlement.Housing < settlement.HousingTarget && !queueAlreadyScheduled(settlement.BuildQueue, "home") {
		settlement.BuildQueue = append(settlement.BuildQueue, ConstructionProject{Kind: "home", Name: "Build housing", Priority: 2})
	}
	if settlement.FoodStore < settlement.FoodTarget && settlement.FieldCount < 8 && !queueAlreadyScheduled(settlement.BuildQueue, "field") {
		settlement.BuildQueue = append(settlement.BuildQueue, ConstructionProject{Kind: "field", Name: "Expand farmland", Priority: 1})
	}
	if settlement.Stage != "subsistence" && settlement.WorkshopCount < 3 && !queueAlreadyScheduled(settlement.BuildQueue, "workshop") {
		settlement.BuildQueue = append(settlement.BuildQueue, ConstructionProject{Kind: "workshop", Name: "Build workshop", Priority: 3})
	}
	if len(settlement.BuildQueue) > 4 {
		settlement.BuildQueue = settlement.BuildQueue[:4]
	}
}

func (s *Sim) spawnSettlementResident(settlement *Settlement, tick uint64) {
	if settlement == nil {
		return
	}
	if settlement.FoodStore < 40 || settlement.Housing <= settlement.Population {
		return
	}
	if tick%240 != uint64(len(s.agents))%240 {
		return
	}

	roles := []string{"Farmer", "Builder", "Artisan", "Trader", "Scout"}
	role := roles[len(s.agents)%len(roles)]
	if settlement.Stage == "crafting" {
		role = "Artisan"
	}
	if settlement.Stage == "trade" {
		role = "Trader"
	}

	resident := Agent{
		ID:              fmt.Sprintf("%s-settler-%d", settlement.ID, len(s.agents)+1),
		Name:            fmt.Sprintf("%s-%d", settlement.ID, settlement.Population+1),
		Role:            role,
		Mood:            "hopeful",
		Status:          "settling in",
		Energy:          80,
		Position:        settlement.Center,
		Target:          settlement.Center,
		HomePosition:    settlement.Center,
		Resources:       60,
		Waste:           0,
		Interests:       []Interest{{Name: "community", Intensity: 50}, {Name: "work", Intensity: 60}},
		Inventory:       map[string]int{"wood": 3, "wheat": 4, "stone": 2, "water": 3},
		ExploredSectors: []string{},
		HomelandNodeID:  s.nodeID,
	}
	s.agents = append(s.agents, resident)
	settlement.Population++
	settlement.Housing++
	settlement.FoodStore -= 10
	s.addEvent(fmt.Sprintf("🏘️ %s welcomes a new resident (%s) and expands the settlement.", settlement.ID, role))
}

func (s *Sim) updateSettlementGrowth(currentTick uint64) {
	if len(s.settlements) == 0 {
		return
	}
	for i := range s.settlements {
		settlement := &s.settlements[i]
		activePopulation := 0
		for _, agent := range s.agents {
			dx := int(math.Abs(float64(agent.Position.X - settlement.Center.X)))
			dy := int(math.Abs(float64(agent.Position.Y - settlement.Center.Y)))
			if dx <= 20 && dy <= 20 {
				activePopulation++
			}
		}
		if activePopulation > 0 {
			settlement.Population = activePopulation
		}

		productionFood := 4 + settlement.FieldCount*2
		productionWood := max(3, settlement.WorkshopCount+2)
		productionStone := max(2, settlement.WorkshopCount+1)
		if settlement.Stage == "agricultural" || settlement.Stage == "crafting" || settlement.Stage == "trade" {
			productionFood += 2
			productionWood += 2
			productionStone += 2
		}

		forestNearby := 0
		stoneNearby := 0
		for dy := -12; dy <= 12; dy++ {
			for dx := -12; dx <= 12; dx++ {
				if dx*dx+dy*dy > 144 {
					continue
				}
				x := wrap(settlement.Center.X+dx, s.worldWidth)
				y := wrap(settlement.Center.Y+dy, s.worldHeight)
				switch s.terrain[y][x] {
				case string(TerrainForest):
					forestNearby++
				case string(TerrainRock):
					stoneNearby++
				}
			}
		}
		productionWood += forestNearby / 18
		productionStone += stoneNearby / 20

		if currentTick%120 == uint64(i*17+1) {
			settlement.FoodStore += productionFood
			settlement.WoodStore += productionWood
			settlement.StoneStore += productionStone
			if settlement.FoodStore > settlement.StorageCapacity {
				settlement.FoodStore = settlement.StorageCapacity
			}
			if settlement.WoodStore > settlement.StorageCapacity {
				settlement.WoodStore = settlement.StorageCapacity
			}
			if settlement.StoneStore > settlement.StorageCapacity {
				settlement.StoneStore = settlement.StorageCapacity
			}
		}

		s.prioritizeSettlementBuilds(settlement)

		if settlement.FoodStore >= settlement.FoodTarget && settlement.FieldCount < 4 && settlement.Population >= 6 {
			settlement.FieldCount++
			settlement.ProductionFocus = "agriculture"
			settlement.FoodStore = max(0, settlement.FoodStore-20)
			if len(s.events) == 0 || !strings.Contains(s.events[0], settlement.ID) {
				s.addEvent(fmt.Sprintf("🌾 %s expands farmland and increases harvest capacity.", settlement.ID))
			}
		}
		if settlement.WoodStore >= 12 && settlement.WorkshopCount < 3 && settlement.Population >= 10 {
			settlement.WorkshopCount++
			settlement.ProductionFocus = "crafting"
			settlement.WoodStore -= 12
			s.addEvent(fmt.Sprintf("🛠️ %s adds a workshop and begins a craft specialization.", settlement.ID))
		}
		if settlement.Housing < settlement.HousingTarget && settlement.FoodStore >= settlement.FoodTarget/2 && settlement.WoodStore >= 8 && settlement.StoneStore >= 6 {
			settlement.Housing++
			settlement.WoodStore -= 8
			settlement.StoneStore -= 6
			settlement.ProductionFocus = "housing"
			s.addEvent(fmt.Sprintf("🏠 %s expands housing to support population growth.", settlement.ID))
		}

		if settlement.FieldCount >= 4 && settlement.WorkshopCount >= 2 {
			settlement.Stage = "agricultural"
		}
		if settlement.WorkshopCount >= 3 && settlement.Population >= 12 {
			settlement.Stage = "crafting"
		}
		if settlement.FieldCount >= 5 && settlement.WorkshopCount >= 3 && settlement.Population >= 16 {
			settlement.Stage = "trade"
		}
		if settlement.FoodStore < 20 && settlement.Population > 0 {
			settlement.Stage = "subsistence"
		}
		if settlement.Population < settlement.Housing && settlement.FoodStore > 40 && currentTick%200 == uint64(i*23+17) {
			s.spawnSettlementResident(settlement, currentTick)
		}
	}
	maxStage := "subsistence"
	for _, settlement := range s.settlements {
		switch settlement.Stage {
		case "trade":
			maxStage = "trade"
		case "crafting":
			if maxStage != "trade" {
				maxStage = "crafting"
			}
		case "agricultural":
			if maxStage != "trade" && maxStage != "crafting" {
				maxStage = "agricultural"
			}
		}
	}
	s.civilizationStage = maxStage
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
		Settlements:       append([]Settlement(nil), s.settlements...),
		CivilizationStage: s.civilizationStage,
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
