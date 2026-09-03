package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

func (s *Sim) seedAgents() {
	roles := []string{"Farmer", "Builder", "Artisan", "Trader", "Scout"}
	count := s.agentsPerNode
	if count <= 0 {
		count = 5
	}

	names := make([]string, 0, count)
	if len(s.defaultAgentNames) > 0 {
		for i := 0; i < count; i++ {
			if i < len(s.defaultAgentNames) {
				names = append(names, s.defaultAgentNames[i])
			} else {
				names = append(names, fmt.Sprintf("Agent-%d", i+1))
			}
		}
	} else {
		for i := 0; i < count; i++ {
			names = append(names, fmt.Sprintf("Agent-%d", i+1))
		}
	}

	s.agents = make([]Agent, 0, count)

	interests := [][]Interest{
		{{"exploration", 80}, {"science", 40}},
		{{"socializing", 75}, {"art", 50}},
		{{"science", 90}, {"engineering", 60}},
		{{"nature", 85}, {"exploration", 50}},
		{{"engineering", 80}, {"safety", 40}},
	}

	// Calculate node's primary sector boundaries
	sectorSize := 256
	sectorMinX := s.assignedSectorX * sectorSize
	sectorMaxX := sectorMinX + sectorSize
	sectorMinY := s.assignedSectorY * sectorSize
	sectorMaxY := sectorMinY + sectorSize

	// Spawn agents at settlement homesteads within this node's primary sector
	var spawnCenters []Position
	if len(s.settlementCenters) > 0 {
		// Filter settlements to only those within node's assigned sector
		for _, sc := range s.settlementCenters {
			if sc.X >= sectorMinX && sc.X < sectorMaxX && sc.Y >= sectorMinY && sc.Y < sectorMaxY {
				spawnCenters = append(spawnCenters, sc)
			}
		}
	}

	// Fallback: if no settlements in sector, use sector center
	if len(spawnCenters) == 0 {
		centerX := sectorMinX + sectorSize/2
		centerY := sectorMinY + sectorSize/2
		spawnCenters = []Position{{X: centerX, Y: centerY}}
	}

	for i, name := range names {
		// Select homestead round-robin from node's settlements
		homesteadIdx := i % len(spawnCenters)
		homestead := spawnCenters[homesteadIdx]

		var position Position
		found := false
		// Search around the homestead center
		for attempts := 0; attempts < 50; attempts++ {
			x := wrap(homestead.X-8+(attempts%5)*3, s.worldWidth)
			y := wrap(homestead.Y-8+(attempts/5)*3, s.worldHeight)
			terrain := s.terrain[y][x]
			if terrain != string(TerrainWater) && terrain != string(TerrainRock) {
				position = Position{X: x, Y: y}
				found = true
				break
			}
		}
		if !found {
			position = homestead
		}

		var target Position
		foundTarget := false
		for attempts := 0; attempts < 50; attempts++ {
			tx := wrap(position.X+(i*7+3+attempts)%30-15, s.worldWidth)
			ty := wrap(position.Y+(i*5+4+attempts)%30-15, s.worldHeight)
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

		initialInterests := interests[i%len(interests)]
		copiedInterests := make([]Interest, len(initialInterests))
		copy(copiedInterests, initialInterests)

		initialInventory := map[string]int{
			"wood":     4 + (i*2)%5,
			"wheat":    5 + (i*3)%6,
			"stone":    3 + (i*1)%4,
			"water":    6 + (i*2)%5,
			"clay":     2 + (i*3)%4,
			"iron_ore": 2 + (i*1)%3,
			"plank":    1 + (i % 3),
			"flour":    1 + (i % 2),
		}

		s.agents = append(s.agents, Agent{
			ID:              fmt.Sprintf("%s-agent-%d", s.nodeID, i+1),
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
			Inventory:       initialInventory,
			HomelandNodeID:  s.nodeID,
		})
	}
}

func (s *Sim) respondInteraction(optionIdx int) string {
	s.interactionMu.Lock()
	defer s.interactionMu.Unlock()

	if s.activeInteraction == nil {
		return "No active interaction to respond to!"
	}

	npcID := s.activeInteraction.NPCID
	npcName := s.activeInteraction.NPCName
	reqType := s.activeInteraction.RequestType

	var npc *Agent
	for i := range s.agents {
		if s.agents[i].ID == npcID {
			npc = &s.agents[i]
			break
		}
	}

	var human *Agent
	for i := range s.agents {
		if s.agents[i].ID == "human-1" {
			human = &s.agents[i]
			break
		}
	}

	message := ""

	if optionIdx == 0 { // ACCEPT
		switch reqType {
		case "deep_interaction":
			s.deepInteractionAllowed[npcID] = true
			message = fmt.Sprintf("Du hast tiefere Interaktion mit %s zugelassen! %s freut sich sehr.", npcName, npcName)
			s.addEvent(fmt.Sprintf("🤝 %s freut sich: 'Wunderbar! Nun können wir tiefer kooperieren.'", npcName))
			if npc != nil && human != nil {
				npc.addHistory(fmt.Sprintf("Established deep interaction agreement with human player %s at tick %d", human.Name, s.tick.Load()))
			}
		case "socialize":
			if npc != nil && human != nil {
				found := false
				for idx, inter := range human.Interests {
					if strings.ToLower(inter.Name) == "philosophy" {
						human.Interests[idx].Intensity = clamp(human.Interests[idx].Intensity+10, 0, 100)
						found = true
						break
					}
				}
				if !found {
					human.Interests = append(human.Interests, Interest{Name: "Philosophy", Intensity: 15})
				}
				npc.addHistory(fmt.Sprintf("Philosophized with human player %s at tick %d", human.Name, s.tick.Load()))
				s.addEvent(fmt.Sprintf("📖 %s und %s führten ein anregendes Gespräch über Philosophie!", npcName, human.Name))
			}
			message = fmt.Sprintf("Das philosophische Gespräch mit %s hat deinen Geist gestärkt (+10%% Philosophie)!", npcName)
		case "share_resources":
			if human != nil && npc != nil {
				if human.Resources < 15 {
					message = "Du hattest nicht genügend Rohstoffe! Interaktion abgebrochen."
				} else {
					human.Resources = clamp(human.Resources-15, 0, 100)
					npc.Resources = clamp(npc.Resources+15, 0, 100)
					npc.addHistory(fmt.Sprintf("Received 15 resources gift from human player %s at tick %d", human.Name, s.tick.Load()))
					s.addEvent(fmt.Sprintf("🌾 %s schenkte %s 15 Rohstoffe!", human.Name, npcName))
					message = fmt.Sprintf("Du hast %s 15 Rohstoffe geschenkt.", npcName)
				}
			}
		case "share_energy":
			if human != nil && npc != nil {
				human.Energy = clamp(human.Energy+15, 0, 100)
				npc.Energy = clamp(npc.Energy-10, 0, 100)
				npc.addHistory(fmt.Sprintf("Gifted 15%% energy to human player %s at tick %d", human.Name, s.tick.Load()))
				s.addEvent(fmt.Sprintf("✨ %s schenkte %s vitale Lebensenergie!", npcName, human.Name))
				message = fmt.Sprintf("%s hat dir 15%% Lebensenergie geschenkt!", npcName)
			}
		}
	} else { // REJECT
		message = fmt.Sprintf("Du hast die Anfrage von %s abgelehnt.", npcName)
		s.addEvent(fmt.Sprintf("🚶 %s akzeptierte die Ablehnung höflich.", npcName))
		if npc != nil && human != nil {
			npc.addHistory(fmt.Sprintf("Human player %s declined the interaction request at tick %d", human.Name, s.tick.Load()))
		}
	}

	s.activeInteraction = nil
	return message
}

func (s *Sim) toroidalDistance(p1, p2 Position) float64 {
	dx := math.Abs(float64(p1.X - p2.X))
	dy := math.Abs(float64(p1.Y - p2.Y))
	return dx + dy
}

func (s *Sim) isNearHomestead(pos Position) bool {
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
				dx := []int{0, 1, 0, -1, 0}
				dy := []int{-1, 0, 1, 0, 0}
				for idx := 0; idx < 5; idx++ {
					nx := wrap(x+dx[idx], s.worldWidth)
					ny := wrap(y+dy[idx], s.worldHeight)
					if s.terrain[ny][nx] != string(TerrainWater) && s.terrain[ny][nx] != string(TerrainRock) {
						dist := s.toroidalDistance(start, Position{X: nx, Y: ny})
						if dist < minDist && dist > 0.5 {
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

func (s *Sim) findNearestSettlementForAgent(agent *Agent) *Settlement {
	var best *Settlement
	bestDist := math.MaxFloat64
	for i := range s.settlements {
		settlement := &s.settlements[i]
		dist := s.toroidalDistance(agent.Position, settlement.Center)
		if dist < bestDist {
			bestDist = dist
			best = settlement
		}
	}
	return best
}

func (s *Sim) defaultSettlementPatrol(agent *Agent, settlement *Settlement) {
	if agent == nil || settlement == nil {
		return
	}
	if agent.Position == agent.Target && agent.Target == settlement.Center {
		offsetX := (int(agent.ID[len(agent.ID)-1])%5 - 2) * 3
		offsetY := ((int(agent.ID[len(agent.ID)-2]) % 5) - 2) * 3
		candidate := Position{
			X: wrap(settlement.Center.X+offsetX, s.worldWidth),
			Y: wrap(settlement.Center.Y+offsetY, s.worldHeight),
		}
		if s.terrain[candidate.Y][candidate.X] != string(TerrainWater) && s.terrain[candidate.Y][candidate.X] != string(TerrainRock) {
			agent.Target = candidate
			agent.Status = "patrolling settlement edge"
			return
		}
	}
	if agent.Position == agent.Target {
		agent.Target = Position{X: wrap(settlement.Center.X+6, s.worldWidth), Y: wrap(settlement.Center.Y+4, s.worldHeight)}
	}
}

func (s *Sim) findNearestBuildSite(agent *Agent, settlement *Settlement, terrainType Terrain) Position {
	if agent == nil || settlement == nil {
		return Position{}
	}
	bestPos := Position{}
	bestDist := math.MaxFloat64
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			if s.terrain[y][x] != string(terrainType) {
				continue
			}
			d := s.toroidalDistance(Position{X: x, Y: y}, settlement.Center)
			if d < bestDist && d <= 20 {
				bestDist = d
				bestPos = Position{X: x, Y: y}
			}
		}
	}
	return bestPos
}

func (s *Sim) applyProfessionLogic(agent *Agent, currentTick uint64) {
	if agent == nil {
		return
	}
	settlement := s.findNearestSettlementForAgent(agent)
	if settlement == nil {
		return
	}

	if len(settlement.BuildQueue) > 0 {
		project := settlement.BuildQueue[0]
		switch project.Kind {
		case "field":
			if agent.Role == "Farmer" || agent.Role == "Builder" {
				fieldTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
				if fieldTarget != (Position{}) {
					agent.Target = fieldTarget
					agent.Status = "expanding fields"
					if agent.Position == fieldTarget {
						s.terrain[fieldTarget.Y][fieldTarget.X] = string(TerrainCrops)
						s.objects[fieldTarget.Y][fieldTarget.X] = WorldObject{Type: "grain", Amount: 80, MaxAmount: 100}
						settlement.FieldCount++
						settlement.FoodStore += 10
						settlement.BuildQueue = append(settlement.BuildQueue[:0], settlement.BuildQueue[1:]...)
						return
					}
					return
				}
			}
		case "home":
			if agent.Role == "Builder" {
				homeTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
				if homeTarget != (Position{}) {
					agent.Target = homeTarget
					agent.Status = "building homes"
					if agent.Position == homeTarget {
						s.terrain[homeTarget.Y][homeTarget.X] = string(TerrainHome)
						s.objects[homeTarget.Y][homeTarget.X] = WorldObject{Type: "homestead", Amount: 100, MaxAmount: 100}
						settlement.Housing++
						settlement.HousingTarget = max(settlement.HousingTarget, settlement.Housing+6)
						settlement.WoodStore = max(0, settlement.WoodStore-2)
						settlement.StoneStore = max(0, settlement.StoneStore-1)
						settlement.BuildQueue = append(settlement.BuildQueue[:0], settlement.BuildQueue[1:]...)
						return
					}
					return
				}
			}
		case "workshop":
			if agent.Role == "Builder" || agent.Role == "Artisan" {
				workshopTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
				if workshopTarget != (Position{}) {
					agent.Target = workshopTarget
					agent.Status = "building workshop"
					if agent.Position == workshopTarget {
						s.terrain[workshopTarget.Y][workshopTarget.X] = string(TerrainWorkshop)
						s.objects[workshopTarget.Y][workshopTarget.X] = WorldObject{Type: "workshop", Amount: 100, MaxAmount: 100}
						settlement.WorkshopCount++
						settlement.WoodStore = max(0, settlement.WoodStore-6)
						settlement.BuildQueue = append(settlement.BuildQueue[:0], settlement.BuildQueue[1:]...)
						return
					}
					return
				}
			}
		}
	}

	switch agent.Role {
	case "Farmer":
		if agent.Inventory["wheat"] < 12 || settlement.FoodStore < 80 {
			cropTarget := s.findNearestResource(agent.Position, []Terrain{TerrainCrops})
			if cropTarget != (Position{}) {
				agent.Target = cropTarget
			}
			if agent.Position == cropTarget {
				agent.Inventory["wheat"] += 4
				settlement.FoodStore += 4
				agent.Status = "harvesting grain"
				agent.Mood = "productive"
			}
			return
		}
		if settlement.FieldCount > 0 {
			fieldTarget := s.findNearestResource(agent.Position, []Terrain{TerrainCrops})
			if fieldTarget != (Position{}) {
				agent.Target = fieldTarget
				agent.Status = "tending fields"
				if agent.Position == fieldTarget {
					settlement.FoodStore += 2
				}
				return
			}
		}
		grassTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
		if grassTarget != (Position{}) {
			agent.Target = grassTarget
			agent.Status = "planting new fields"
			if agent.Position == grassTarget {
				s.terrain[grassTarget.Y][grassTarget.X] = string(TerrainCrops)
				s.objects[grassTarget.Y][grassTarget.X] = WorldObject{Type: "grain", Amount: 80, MaxAmount: 100}
				settlement.FieldCount++
				settlement.FoodStore += 6
			}
			return
		}
		agent.Status = "tending fields"
		agent.Target = settlement.Center
	case "Builder":
		if settlement.Housing < settlement.Population+6 {
			homeTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
			if homeTarget != (Position{}) {
				agent.Target = homeTarget
				agent.Status = "building homes"
				if agent.Position == homeTarget {
					s.terrain[homeTarget.Y][homeTarget.X] = string(TerrainHome)
					s.objects[homeTarget.Y][homeTarget.X] = WorldObject{Type: "homestead", Amount: 100, MaxAmount: 100}
					settlement.Housing++
					settlement.WoodStore = max(0, settlement.WoodStore-2)
					settlement.StoneStore = max(0, settlement.StoneStore-1)
				}
				return
			}
		}
		if settlement.WorkshopCount < 3 && settlement.WoodStore >= 6 {
			workshopTarget := s.findNearestBuildSite(agent, settlement, TerrainGrass)
			if workshopTarget != (Position{}) {
				agent.Target = workshopTarget
				agent.Status = "building workshop"
				if agent.Position == workshopTarget {
					s.terrain[workshopTarget.Y][workshopTarget.X] = string(TerrainWorkshop)
					s.objects[workshopTarget.Y][workshopTarget.X] = WorldObject{Type: "workshop", Amount: 100, MaxAmount: 100}
					settlement.WorkshopCount++
					settlement.WoodStore -= 6
				}
				return
			}
		}
		agent.Status = "maintaining roads"
		agent.Target = settlement.Center
	case "Artisan":
		if settlement.WorkshopCount > 0 && (agent.Inventory["wood"] > 4 || agent.Inventory["stone"] > 4 || agent.Inventory["clay"] > 3) {
			agent.Status = "crafting tools"
			agent.Target = settlement.Center
			if s.toroidalDistance(agent.Position, settlement.Center) <= 4 {
				if agent.Inventory["wood"] > 4 {
					agent.Inventory["wood"] -= 3
					agent.Inventory["plank"] += 2
				}
				if agent.Inventory["stone"] > 4 {
					agent.Inventory["stone"] -= 2
					agent.Inventory["quader"] += 1
				}
				if agent.Inventory["clay"] > 3 {
					agent.Inventory["clay"] -= 2
					agent.Inventory["pottery"] += 1
				}
				settlement.WoodStore = max(0, settlement.WoodStore-1)
				settlement.StoneStore = max(0, settlement.StoneStore-1)
			}
			return
		}
		agent.Status = "gathering craft materials"
		agent.Target = s.findNearestResource(agent.Position, []Terrain{TerrainForest, TerrainRock})
	case "Trader":
		if settlement.Stage == "trade" || settlement.Stage == "crafting" || settlement.Stage == "agricultural" {
			agent.Status = "trading surplus"
			agent.Target = settlement.Center
			if s.toroidalDistance(agent.Position, settlement.Center) <= 3 {
				agent.Resources = clamp(agent.Resources+5, 0, 100)
				settlement.FoodStore = max(0, settlement.FoodStore-3)
			}
			return
		}
		agent.Status = "securing routes"
		agent.Target = settlement.Center
	case "Scout":
		agent.Status = "mapping settlement perimeter"
		agent.Target = settlement.Center
	}

	s.defaultSettlementPatrol(agent, settlement)

	if currentTick%24 == uint64((currentTick/24)%7) && settlement != nil && settlement.Stage != "subsistence" {
		settlement.ProductionFocus = strings.ToLower(agent.Role)
	}
}

func (s *Sim) advanceAgents(currentTick uint64) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(currentTick)))

	s.interactionMu.Lock()
	if s.activeInteraction != nil {
		s.activeInteraction.TicksLeft--
		if s.activeInteraction.TicksLeft <= 0 {
			if s.autoAnswerMode == "auto_accept" {
				s.interactionMu.Unlock()
				s.respondInteraction(0)
				s.interactionMu.Lock()
			} else if s.autoAnswerMode == "auto_reject" {
				s.interactionMu.Unlock()
				s.respondInteraction(1)
				s.interactionMu.Lock()
			} else {
				s.addEvent(fmt.Sprintf("⏳ [Quest] Anfrage von %s ist abgelaufen.", s.activeInteraction.NPCName))
				s.activeInteraction = nil
			}
		}
	}
	s.interactionMu.Unlock()

	for i := range s.agents {
		agent := &s.agents[i]

		// Sector expansion for Human Player vs Algorithmic Home Radius limit for AI Agents
		if strings.HasPrefix(agent.ID, "human-") || agent.Role == "Human Explorer" {
			s.checkExpansion(agent.Position)
		} else {
			// Enforce algorithmic home radius boundary for AI agents (max 50 tiles from HomePosition)
			const maxHomeDistance = 50.0
			dx := float64(agent.Target.X - agent.HomePosition.X)
			dy := float64(agent.Target.Y - agent.HomePosition.Y)
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist > maxHomeDistance && dist > 0 {
				agent.Target.X = clampInt(agent.HomePosition.X+int((dx/dist)*maxHomeDistance), 0, s.worldWidth-1)
				agent.Target.Y = clampInt(agent.HomePosition.Y+int((dy/dist)*maxHomeDistance), 0, s.worldHeight-1)
			}
		}

		agent.Resources = clamp(agent.Resources-2, 0, 100)
		if agent.Resources == 0 {
			agent.Energy = clamp(agent.Energy-3, 0, 100)
		} else {
			agent.Energy = clamp(agent.Energy-1, 0, 100)
		}
		agent.Waste = clamp(agent.Waste+1, 0, 100)

		if rng.Float64() < 0.20 {
			for idx := range agent.Interests {
				if agent.Interests[idx].Intensity > 10 {
					agent.Interests[idx].Intensity--
				}
			}
		}

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
			if !found {
				agent.Interests = append(agent.Interests, Interest{Name: reinforcedInterest, Intensity: 15})
			}
		}

		if agent.Inventory == nil {
			agent.Inventory = make(map[string]int)
		}
		s.applyProfessionLogic(agent, currentTick)

		// Count total raw materials in inventory
		rawCount := agent.Inventory["wood"] + agent.Inventory["wheat"] + agent.Inventory["stone"] + agent.Inventory["water"] + agent.Inventory["clay"] + agent.Inventory["iron_ore"]

		// Resource Gathering on current map tile
		if agent.Position.Y >= 0 && agent.Position.Y < s.worldHeight && agent.Position.X >= 0 && agent.Position.X < s.worldWidth {
			currTerrain := s.terrain[agent.Position.Y][agent.Position.X]
			switch currTerrain {
			case string(TerrainForest):
				if agent.Inventory["wood"] < 30 {
					agent.Inventory["wood"]++
				}
			case string(TerrainCrops):
				if agent.Inventory["wheat"] < 30 {
					agent.Inventory["wheat"]++
				}
			case string(TerrainWater):
				if agent.Inventory["water"] < 30 {
					agent.Inventory["water"]++
				}
			case string(TerrainRock):
				rVal := rng.Intn(3)
				if rVal == 0 && agent.Inventory["stone"] < 30 {
					agent.Inventory["stone"]++
				}
				if rVal == 1 && agent.Inventory["clay"] < 30 {
					agent.Inventory["clay"]++
				}
				if rVal == 2 && agent.Inventory["iron_ore"] < 30 {
					agent.Inventory["iron_ore"]++
				}
			}

			// Specialized Ancient Building Processing
			// Economy domain: check quota before non-essential production steps
			econAllowed := s.domainActionAllowed("economy", currentTick)
			econCore := s.domainCoreOnly("economy")
			if currentTick%4 == uint64(i%4) {
				switch currTerrain {
				case string(TerrainMill):
					// Mill (bread/flour) is a core economy action
					if econAllowed && agent.Inventory["wheat"] >= 3 {
						agent.Inventory["wheat"] -= 3
						agent.Inventory["flour"] += 2
						agent.Inventory["bread"] += 1
						agent.Status = "Mahlt Mehl & backt Brot in der Mühle 🌾⚙️"
						s.addEvent(fmt.Sprintf("🌾 [Getreidemühle] %s mahlte Weizen zu 2x Mehl & 1x Brot in der Mühle 🌾⚙️", agent.Name))
						s.recordDomainAction("economy", currentTick)
					}
				case string(TerrainForge):
					// Forge is optional in restricted mode
					if econAllowed && !econCore && agent.Inventory["iron_ore"] >= 2 {
						agent.Inventory["iron_ore"] -= 2
						agent.Inventory["iron_bar"] += 1
						agent.Inventory["tool"] += 1
						agent.Status = "Schmilzt Eisenerz & schmiedet Werkzeuge 🔥⚒️"
						s.addEvent(fmt.Sprintf("🔥 [Schmelze & Schmiede] %s gießt Eisenbarren & schmiedet Bronze/Eisen-Werkzeuge ⚒️", agent.Name))
						s.recordDomainAction("economy", currentTick)
					}
				case string(TerrainQuarry):
					// Quarry is optional in restricted mode
					if econAllowed && !econCore && agent.Inventory["stone"] >= 3 {
						agent.Inventory["stone"] -= 3
						agent.Inventory["quader"] += 2
						agent.Status = "Haut Quaderstein im Steinbruch 🪨⛏️"
						s.addEvent(fmt.Sprintf("🪨 [Steinbruch] %s behaut Bruchstein zu 2x Quaderblöcken ⛏️", agent.Name))
						s.recordDomainAction("economy", currentTick)
					}
				case string(TerrainPottery):
					// Pottery is optional in restricted mode
					if econAllowed && !econCore && agent.Inventory["clay"] >= 2 && agent.Inventory["water"] >= 1 {
						agent.Inventory["clay"] -= 2
						agent.Inventory["water"] -= 1
						agent.Inventory["pottery"] += 2
						agent.Status = "Formt Amphoren in der Töpferei 🏺💧"
						s.addEvent(fmt.Sprintf("🏺 [Töpferei] %s brennt Ton & Wasser zu 2x Keramik-Amphoren 🏺", agent.Name))
						s.recordDomainAction("economy", currentTick)
					}
				case string(TerrainWorkshop):
					// Workshop is optional in restricted mode
					if econAllowed && !econCore && agent.Inventory["wood"] >= 3 {
						agent.Inventory["wood"] -= 3
						agent.Inventory["plank"] += 2
						agent.Status = "Verarbeitet Bauholz in der Werkstatt 🛠️"
						s.addEvent(fmt.Sprintf("🛠️ [Holzwerkstatt] %s sägt Bauholz zu 2x Holzplanken 🪵", agent.Name))
						s.recordDomainAction("economy", currentTick)
					}
				case string(TerrainStorehouse):
					// Storehouse deposit is a core economy action
					if econAllowed {
						deposited := 0
						for _, item := range []string{"bread", "tool", "quader", "pottery", "plank", "flour", "iron_bar"} {
							if agent.Inventory[item] > 0 {
								deposited += agent.Inventory[item]
								agent.Inventory[item] = 0
							}
						}
						if deposited > 0 {
							agent.Status = "Deponiert Fertiggüter im Kornspeicher 🏛️📦"
							s.addEvent(fmt.Sprintf("🏛️ [Kornspeicher & Lager] %s lagerte %d veredelte Güter im Zentralarchiv ein 📦", agent.Name, deposited))
							s.recordDomainAction("economy", currentTick)
						}
					}
				}
			}
		}

		// Agent Movement Step towards target
		if agent.Position.X != agent.Target.X || agent.Position.Y != agent.Target.Y {
			nextPos := s.findNextStep(agent.Position, agent.Target)
			agent.Position = nextPos
		}

		// Sector discovery: check every ~50 ticks per agent (staggered by agent index)
		// to avoid a mutex lock + division every single tick for every agent.
		if agent.HomelandNodeID == s.nodeID &&
			!strings.HasPrefix(agent.ID, "human-") &&
			currentTick%50 == uint64(i%50) {
			agentSectorX := agent.Position.X / 256
			agentSectorY := agent.Position.Y / 256
			claimPos := Position{X: agentSectorX, Y: agentSectorY}
			s.sectorClaimsMu.RLock()
			_, claimed := s.sectorClaims[claimPos]
			s.sectorClaimsMu.RUnlock()
			if !claimed {
				go s.discoverNewSector(agentSectorX, agentSectorY, agent.Name)
			}
		}

		// Intelligent Re-Targeting: Fundgebiet (Gathering) vs Transport to Settlement/Workshop
		if (agent.Position.X == agent.Target.X && agent.Position.Y == agent.Target.Y) || currentTick%15 == uint64(i%15) {
			centerX := s.worldWidth / 2
			centerY := s.worldHeight / 2

			// Target specialized Ancient Building depending on inventory contents
			processedCount := agent.Inventory["bread"] + agent.Inventory["tool"] + agent.Inventory["quader"] + agent.Inventory["pottery"] + agent.Inventory["plank"] + agent.Inventory["flour"] + agent.Inventory["iron_bar"]

			econAllowed := s.domainActionAllowed("economy", currentTick)
			econCore := s.domainCoreOnly("economy")

			if processedCount >= 3 && econAllowed {
				// Deliver finished goods to Storehouse / Granary (🏛️📦)
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainStorehouse, TerrainMarket})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Wandert zum Kornspeicher zur Einlagerung 🏛️📦"
				}
			} else if agent.Inventory["wheat"] >= 3 && econAllowed {
				// Target Getreidemühle (🌾⚙️) - core action, allowed in restricted
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainMill, TerrainWorkshop})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Reist zur Getreidemühle 🌾⚙️"
				}
			} else if agent.Inventory["iron_ore"] >= 2 && econAllowed && !econCore {
				// Target Schmelze & Schmiede (🔥⚒️) - optional
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainForge, TerrainWorkshop})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Wandert zur Schmelze & Schmiede 🔥⚒️"
				}
			} else if agent.Inventory["stone"] >= 3 && econAllowed && !econCore {
				// Target Steinbruch (🪨⛏️) - optional
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainQuarry, TerrainWorkshop})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Wandert zum Steinbruch 🪨⛏️"
				}
			} else if agent.Inventory["clay"] >= 2 && econAllowed && !econCore {
				// Target Töpferei (🏺💧) - optional
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainPottery, TerrainWorkshop})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Reist zur Töpferei 🏺💧"
				}
			} else if agent.Inventory["wood"] >= 3 && econAllowed && !econCore {
				// Target Holzwerkstatt (🛠️) - optional
				targetBuilding := s.findNearestResource(agent.Position, []Terrain{TerrainWorkshop})
				if targetBuilding.X != agent.Position.X || targetBuilding.Y != agent.Position.Y {
					agent.Target = targetBuilding
					agent.Status = "Wandert zur Holzwerkstatt 🛠️"
				}
			} else if rawCount >= 8 && econAllowed && !econCore {
				// General Transport to nearest Workshop, Market, or Settlement
				targetWorkshop := s.findNearestResource(agent.Position, []Terrain{TerrainWorkshop, TerrainMill, TerrainForge, TerrainStorehouse, TerrainMarket, TerrainHome})
				if targetWorkshop.X != agent.Position.X || targetWorkshop.Y != agent.Position.Y {
					agent.Target = targetWorkshop
					agent.Status = "Transportiert Rohstoffe zur Produktionsstätte 🚚📦"
					if currentTick%30 == 0 {
						s.addEvent(fmt.Sprintf("🚚 [Transport & Logistik] %s transportiert %d Rohstoffe zur Produktionsstätte 🏛️", agent.Name, rawCount))
					}
				} else {
					for attempts := 0; attempts < 40; attempts++ {
						tx := wrap(centerX+rng.Intn(60)-30, s.worldWidth)
						ty := wrap(centerY+rng.Intn(60)-30, s.worldHeight)
						if (tx != agent.Position.X || ty != agent.Position.Y) && s.terrain[ty][tx] != string(TerrainWater) && s.terrain[ty][tx] != string(TerrainRock) {
							agent.Target = Position{X: tx, Y: ty}
							agent.Status = "Transportiert Rohstoffe zur Produktionsstätte 🚚📦"
							break
						}
					}
				}
			} else {
				// Head out to raw material gathering areas (Forest, Crops, Rock, Water)
				resTarget := s.findNearestResource(agent.Position, []Terrain{TerrainForest, TerrainCrops, TerrainRock, TerrainWater})
				if resTarget.X != agent.Position.X || resTarget.Y != agent.Position.Y {
					agent.Target = resTarget
					t := s.terrain[resTarget.Y][resTarget.X]
					switch t {
					case string(TerrainForest):
						agent.Status = "Sammelt Holz im Wald 🌲"
					case string(TerrainCrops):
						agent.Status = "Erntet Weizen auf dem Feld 🌾"
					case string(TerrainRock):
						agent.Status = "Baut Erze & Stein im Gebirge ⛰️"
					default:
						agent.Status = "Sammelt Rohstoffe im Fundgebiet 🌾🌲"
					}
				} else {
					for attempts := 0; attempts < 40; attempts++ {
						tx := wrap(centerX+rng.Intn(70)-35, s.worldWidth)
						ty := wrap(centerY+rng.Intn(70)-35, s.worldHeight)
						if (tx != agent.Position.X || ty != agent.Position.Y) && s.terrain[ty][tx] != string(TerrainWater) && s.terrain[ty][tx] != string(TerrainRock) {
							agent.Target = Position{X: tx, Y: ty}
							agent.Status = "Patrouilliert Sektor 🧭"
							break
						}
					}
				}
			}
		}
	}

	if currentTick%8 == 0 {
		for y := 0; y < s.worldHeight; y++ {
			for x := 0; x < s.worldWidth; x++ {
				obj := &s.objects[y][x]
				if obj.Type == "berries" && obj.Amount < 100 {
					obj.Amount = clamp(obj.Amount+5, 0, 100)
				} else if obj.Type == "crops" && obj.Amount < 100 {
					obj.Amount = clamp(obj.Amount+3, 0, 100)
				} else if obj.Type == "waste_pile" && obj.Amount > 0 {
					obj.Amount = clamp(obj.Amount-1, 0, 100)
				}
			}
		}
	}

	s.processFederatedShardingHandover()
}

// domainActionAllowed returns true if the domain is not "off" and (if "restricted") the quota has not been exceeded.
func (s *Sim) domainActionAllowed(domain string, currentTick uint64) bool {
	s.domainSettingsMu.RLock()
	defer s.domainSettingsMu.RUnlock()
	var cfg DomainConfig
	switch domain {
	case "economy":
		cfg = s.domainSettings.Economy
	case "court":
		cfg = s.domainSettings.Court
	case "geistesleben":
		cfg = s.domainSettings.Geistesleben
	default:
		return true
	}
	if cfg.Mode == DomainOff {
		return false
	}
	if cfg.Mode == DomainFull {
		return true
	}
	// restricted: check quota within current window
	var counter *int
	var windowStart *uint64
	switch domain {
	case "economy":
		counter = &s.econActionsThisWindow
		windowStart = &s.econWindowStart
	case "court":
		counter = &s.courtActionsThisWindow
		windowStart = &s.courtWindowStart
	case "geistesleben":
		counter = &s.geistActionsThisWindow
		windowStart = &s.geistWindowStart
	}
	ws := uint64(cfg.WindowSize)
	if ws == 0 {
		ws = 100
	}
	if currentTick >= *windowStart+ws {
		// reset window
		*windowStart = currentTick
		*counter = 0
	}
	return *counter < cfg.QuotaPerWindow
}

// domainCoreOnly returns true when the domain is in "restricted" mode (only core actions allowed).
func (s *Sim) domainCoreOnly(domain string) bool {
	s.domainSettingsMu.RLock()
	defer s.domainSettingsMu.RUnlock()
	switch domain {
	case "economy":
		return s.domainSettings.Economy.Mode == DomainRestricted
	case "court":
		return s.domainSettings.Court.Mode == DomainRestricted
	case "geistesleben":
		return s.domainSettings.Geistesleben.Mode == DomainRestricted
	}
	return false
}

// recordDomainAction increments the action counter for the domain.
func (s *Sim) recordDomainAction(domain string, currentTick uint64) {
	s.domainSettingsMu.RLock()
	var cfg DomainConfig
	switch domain {
	case "economy":
		cfg = s.domainSettings.Economy
	case "court":
		cfg = s.domainSettings.Court
	case "geistesleben":
		cfg = s.domainSettings.Geistesleben
	}
	s.domainSettingsMu.RUnlock()

	if cfg.Mode != DomainRestricted {
		return
	}
	ws := uint64(cfg.WindowSize)
	if ws == 0 {
		ws = 100
	}

	switch domain {
	case "economy":
		if currentTick >= s.econWindowStart+ws {
			s.econWindowStart = currentTick
			s.econActionsThisWindow = 0
		}
		s.econActionsThisWindow++
	case "court":
		if currentTick >= s.courtWindowStart+ws {
			s.courtWindowStart = currentTick
			s.courtActionsThisWindow = 0
		}
		s.courtActionsThisWindow++
	case "geistesleben":
		if currentTick >= s.geistWindowStart+ws {
			s.geistWindowStart = currentTick
			s.geistActionsThisWindow = 0
		}
		s.geistActionsThisWindow++
	}
}

func (s *Sim) processFederatedShardingHandover() {
	nodeName := s.nodeID
	if nodeName == "" {
		nodeName = "ia3-1"
	}

	var targetNode string
	var agentsToHandover []int

	s.interactionMu.Lock()
	for i := range s.agents {
		agent := &s.agents[i]
		if strings.HasPrefix(agent.ID, "human-") || agent.Role == "Human Explorer" {
			continue
		}

		// Native agents (born on this node) never permanently leave — bounce them back
		isNative := agent.HomelandNodeID == s.nodeID || agent.HomelandNodeID == ""
		if isNative {
			// Enforce home-radius boundary (max 50 tiles from HomePosition)
			continue
		}

		if nodeName == "ia3-1" || nodeName == "ia3" {
			if agent.Position.X >= 254 {
				targetNode = "ia3-2"
				agentsToHandover = append(agentsToHandover, i)
			} else if agent.Position.Y >= 254 {
				targetNode = "ia3-3"
				agentsToHandover = append(agentsToHandover, i)
			}
		} else if nodeName == "ia3-2" || nodeName == "ia3-two" {
			if agent.Position.X <= 2 {
				targetNode = "ia3-1"
				agentsToHandover = append(agentsToHandover, i)
			}
		} else if nodeName == "ia3-3" || nodeName == "ia3-three" {
			if agent.Position.Y <= 2 {
				targetNode = "ia3-1"
				agentsToHandover = append(agentsToHandover, i)
			}
		}
	}

	if len(agentsToHandover) == 0 {
		s.interactionMu.Unlock()
		return
	}

	for _, idx := range agentsToHandover {
		agent := s.agents[idx]
		targetAgent := agent
		if (targetNode == "ia3-2" || targetNode == "ia3-two") && (nodeName == "ia3-1" || nodeName == "ia3") {
			targetAgent.Position.X = 5
		} else if (targetNode == "ia3-1" || targetNode == "ia3") && (nodeName == "ia3-2" || nodeName == "ia3-two") {
			targetAgent.Position.X = 250
		} else if (targetNode == "ia3-3" || targetNode == "ia3-three") && (nodeName == "ia3-1" || nodeName == "ia3") {
			targetAgent.Position.Y = 5
		} else if (targetNode == "ia3-1" || targetNode == "ia3") && (nodeName == "ia3-3" || nodeName == "ia3-three") {
			targetAgent.Position.Y = 250
		}

		targetAgent.Signature = s.calculateAgentSignature(&targetAgent)

		urls := []string{}
		if targetNode == "ia3-1" || targetNode == "ia3" {
			urls = []string{"http://world-sim.ia3-1.svc.cluster.local:8081/control/handover-agent", "http://world-sim.ia3.svc.cluster.local:8081/control/handover-agent", "http://localhost:8081/control/handover-agent", "http://localhost:18080/control/handover-agent"}
		} else if targetNode == "ia3-2" || targetNode == "ia3-two" {
			urls = []string{"http://world-sim.ia3-2.svc.cluster.local:8081/control/handover-agent", "http://world-sim.ia3-two.svc.cluster.local:8081/control/handover-agent", "http://localhost:18081/control/handover-agent"}
		} else if targetNode == "ia3-3" || targetNode == "ia3-three" {
			urls = []string{"http://world-sim.ia3-3.svc.cluster.local:8081/control/handover-agent", "http://world-sim.ia3-three.svc.cluster.local:8081/control/handover-agent", "http://localhost:18082/control/handover-agent"}
		}

		success := false
		client := http.Client{Timeout: 500 * time.Millisecond}
		for _, url := range urls {
			bodyBytes, _ := json.Marshal(targetAgent)
			resp, err := client.Post(url, "application/json", strings.NewReader(string(bodyBytes)))
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					success = true
					break
				}
			}
		}

		if success {
			s.addEvent(fmt.Sprintf("🌐 [Sharding] Handover erfolgreich: %s verließ Sektor (%s) -> Sektor (%s)", agent.Name, nodeName, targetNode))
			s.agents = append(s.agents[:idx], s.agents[idx+1:]...)
			for i, val := range agentsToHandover {
				if val > idx {
					agentsToHandover[i]--
				}
			}
		} else {
			// Bounce back to center
			s.agents[idx].Position.X = wrap(s.agents[idx].Position.X-2, s.worldWidth)
			s.agents[idx].Position.Y = wrap(s.agents[idx].Position.Y-2, s.worldHeight)
			s.agents[idx].Target = Position{X: s.worldWidth / 2, Y: s.worldHeight / 2}
			s.addEvent(fmt.Sprintf("⚠️ [Sharding] Handover von %s an %s fehlgeschlagen (Knoten offline). Toroidaler Bounce-Back.", agent.Name, targetNode))
		}
	}
	s.interactionMu.Unlock()
}

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

	heuristic := func(p Position) float64 {
		dx := float64(absDiff(p.X, target.X))
		dy := float64(absDiff(p.Y, target.Y))
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

func (s *Sim) ensureSector(secX, secY int) {
	s.sectorsMu.Lock()
	defer s.sectorsMu.Unlock()

	pos := Position{X: secX, Y: secY}
	if s.sectors[pos] {
		return
	}

	s.sectors[pos] = true
	s.addEvent(fmt.Sprintf("[Courtroom/Register] Sector (%d, %d) has been discovered and mapped by scouts!", secX, secY))

	var minX, maxX, minY, maxY int
	first := true
	for p := range s.sectors {
		if first {
			minX, maxX = p.X, p.X
			minY, maxY = p.Y, p.Y
			first = false
		} else {
			if p.X < minX {
				minX = p.X
			}
			if p.X > maxX {
				maxX = p.X
			}
			if p.Y < minY {
				minY = p.Y
			}
			if p.Y > maxY {
				maxY = p.Y
			}
		}
	}

	oldMinX, oldMinY := s.minSectorX, s.minSectorY

	s.minSectorX, s.maxSectorX = minX, maxX
	s.minSectorY, s.maxSectorY = minY, maxY

	newW := (maxX - minX + 1) * 256
	newH := (maxY - minY + 1) * 256

	newTerrain := make([][]string, newH)
	newObjects := make([][]WorldObject, newH)
	for y := 0; y < newH; y++ {
		newTerrain[y] = make([]string, newW)
		newObjects[y] = make([]WorldObject, newW)
	}

	dx := (oldMinX - minX) * 256
	dy := (oldMinY - minY) * 256

	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			newTerrain[y+dy][x+dx] = s.terrain[y][x]
			newObjects[y+dy][x+dx] = s.objects[y][x]
		}
	}

	for i := range s.agents {
		s.agents[i].Position.X += dx
		s.agents[i].Position.Y += dy
		s.agents[i].Target.X += dx
		s.agents[i].Target.Y += dy
		s.agents[i].HomePosition.X += dx
		s.agents[i].HomePosition.Y += dy
	}

	s.terrain = newTerrain
	s.objects = newObjects
	s.worldWidth = newW
	s.worldHeight = newH

	for p := range s.sectors {
		s.generateSectorTerrain(p.X, p.Y)
	}
}

func (s *Sim) generateSectorTerrain(secX, secY int) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(secX*1000+secY)))
	for ly := 0; ly < 256; ly++ {
		for lx := 0; lx < 256; lx++ {
			absX := secX*256 + lx
			absY := secY*256 + ly

			gx := absX - s.minSectorX*256
			gy := absY - s.minSectorY*256

			if s.terrain[gy][gx] != "" {
				continue
			}

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
	absX := s.minSectorX*256 + pos.X
	absY := s.minSectorY*256 + pos.Y

	secX := int(math.Floor(float64(absX) / 256.0))
	secY := int(math.Floor(float64(absY) / 256.0))

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

func clamp(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
