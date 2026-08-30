package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	pb "world-sim/simv1"
)

func (s *Sim) queryMesaAgentBehavior() {
	currentTick := s.tick.Load()

	// Check court and geistesleben domain gates before calling the expensive agent service
	courtAllowed := s.domainActionAllowed("court", currentTick)
	geistAllowed := s.domainActionAllowed("geistesleben", currentTick)
	if !courtAllowed && !geistAllowed {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	grpcAddr := getenv("AGENT_GRPC_ADDR", "localhost:50051")
	// Increase max message size to 64MB to handle full world terrain data
	conn, err := grpc.DialContext(ctx, grpcAddr, 
		grpc.WithTransportCredentials(insecure.NewCredentials()), 
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(64*1024*1024), // 64 MB receive
			grpc.MaxCallSendMsgSize(64*1024*1024), // 64 MB send
		),
	)
	if err != nil {
		log.Printf("Warning: Failed to connect to Python agent-service on %s (Mesa bypassed): %v", grpcAddr, err)
		return
	}
	defer conn.Close()

	client := pb.NewAgentDecisionServiceClient(conn)

	var pbAgents []*pb.AgentState
	for _, a := range s.agents {
		if strings.HasPrefix(a.ID, "human-") || a.Role == "Human Explorer" {
			continue
		}
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

		pbAgents = append(pbAgents, &pb.AgentState{
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
		})
	}

	// ── Phase 2: Viewport-Based Terrain Filtering ──────────────────────────
	// Only send terrain tiles within agent vision/influence radius
	// This reduces message size from 58MB to ~5-10MB
	
	var pbTiles []*pb.TerrainTile
	
	// Calculate bounding box from agent positions (with margin for context)
	const terrainMargin = 100 // Include tiles 100 cells beyond agents
	minX, maxX := s.worldWidth, -1
	minY, maxY := s.worldHeight, -1
	
	for _, a := range s.agents {
		if a.Position.X-terrainMargin < minX {
			minX = a.Position.X - terrainMargin
		}
		if a.Position.X+terrainMargin > maxX {
			maxX = a.Position.X + terrainMargin
		}
		if a.Position.Y-terrainMargin < minY {
			minY = a.Position.Y - terrainMargin
		}
		if a.Position.Y+terrainMargin > maxY {
			maxY = a.Position.Y + terrainMargin
		}
	}
	
	// Clamp to world bounds
	if minX < 0 {
		minX = 0
	}
	if maxX >= s.worldWidth {
		maxX = s.worldWidth - 1
	}
	if minY < 0 {
		minY = 0
	}
	if maxY >= s.worldHeight {
		maxY = s.worldHeight - 1
	}
	
	// Collect tiles in viewport
	for y := minY; y <= maxY; y++ {
		for x := minX; x <= maxX; x++ {
			t := s.terrain[y][x]
			obj := s.objects[y][x]
			if t == string(TerrainWater) || t == string(TerrainForest) || t == string(TerrainRock) || t == string(TerrainHome) || t == string(TerrainRoad) || t == string(TerrainCourt) || t == string(TerrainMarket) || t == string(TerrainCrops) || t == string(TerrainWorkshop) || t == string(TerrainMill) || t == string(TerrainQuarry) || t == string(TerrainForge) || t == string(TerrainPottery) || t == string(TerrainStorehouse) || t == string(TerrainSpiritualCenter) {
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
		Tick:            s.tick.Load(),
		WorldWidth:      int32(s.worldWidth),
		WorldHeight:     int32(s.worldHeight),
		Agents:          pbAgents,
		TerrainTiles:    pbTiles,
		GrassPolicy:     s.grassPolicy,
		ForestPolicy:    s.forestPolicy,
		RelicSpawnRate:  int32(s.relicSpawnRate),
		LawProposeRate:  int32(s.lawProposeRate),
		EconEventRate:   int32(s.econEventRate),
		ArtifactQuality: int32(s.artifactQuality),
		OllamaEnabled:   s.ollamaEnabled,
		OllamaBaseUrl:   s.ollamaBaseURL,
		OllamaModel:     s.ollamaModel,
		OllamaMode:      s.ollamaMode,
		OllamaTimeoutMs: int32(s.ollamaTimeoutMs),
	}

	resp, err := client.DecideActions(ctx, req)
	if err != nil {
		log.Printf("Warning: DecideActions gRPC call failed: %v", err)
		return
	}

	s.interactionMu.Lock()
	if len(resp.ManagerAThoughts) > 0 {
		s.managerAThoughts = resp.ManagerAThoughts
	}
	if len(resp.ManagerBThoughts) > 0 {
		s.managerBThoughts = resp.ManagerBThoughts
	}
	if len(resp.ManagerCThoughts) > 0 {
		s.managerCThoughts = resp.ManagerCThoughts
	}
	s.interactionMu.Unlock()

	if resp.GrassPolicy != "" && resp.GrassPolicy != s.grassPolicy {
		if s.domainActionAllowed("court", currentTick) {
			s.grassPolicy = resp.GrassPolicy
			if s.grassPolicy == "protected" {
				s.addEvent("⚖️ Tribunal: Grassland is now PROTECTED! Crop planting is banned 🚫🌾")
			} else {
				s.addEvent("⚖️ Tribunal: Agriculture is now ALLOWED on Grassland 🌾")
			}
			s.recordDomainAction("court", currentTick)
		}
	}
	if resp.ForestPolicy != "" && resp.ForestPolicy != s.forestPolicy {
		if s.domainActionAllowed("court", currentTick) {
			s.forestPolicy = resp.ForestPolicy
			if s.forestPolicy == "timber" {
				s.addEvent("⚖️ Tribunal: Forest is open for TIMBER harvesting 🪓")
			} else {
				s.addEvent("⚖️ Tribunal: Forest is RESERVED for berry harvesting 🍓")
			}
			s.recordDomainAction("court", currentTick)
		}
	}

	for _, mu := range resp.MapUpdates {
		x := int(mu.X)
		y := int(mu.Y)
		if x >= 0 && x < s.worldWidth && y >= 0 && y < s.worldHeight {
			if mu.TerrainType != "" {
				s.terrain[y][x] = mu.TerrainType
			}
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

	for _, ie := range resp.InjectedEvents {
		// Classify injected events: law/tribunal -> court, artifact/relic -> geistesleben
		isCourtEvent := strings.Contains(ie, "⚖️") || strings.Contains(ie, "Tribunal") || strings.Contains(ie, "law") || strings.Contains(ie, "Law")
		isGeistEvent := strings.Contains(ie, "🎨") || strings.Contains(ie, "relic") || strings.Contains(ie, "Relic") || strings.Contains(ie, "artifact") || strings.Contains(ie, "Artifact") || strings.Contains(ie, "Philosophie") || strings.Contains(ie, "Wissen")
		if isCourtEvent && !s.domainActionAllowed("court", currentTick) {
			continue
		}
		if isGeistEvent && !s.domainActionAllowed("geistesleben", currentTick) {
			continue
		}
		s.addEvent(ie)
	}

	if s.domainActionAllowed("court", currentTick) {
		s.activeLaws = resp.ActiveLaws
	}

	for _, dec := range resp.Decisions {
		for i := range s.agents {
			if s.agents[i].ID == dec.AgentId {
				isHumanRequest := strings.Contains(s.agents[i].Status, "Human") ||
					strings.Contains(s.agents[i].Status, "📦") ||
					strings.Contains(s.agents[i].Status, "🧭") ||
					strings.Contains(s.agents[i].Status, "🌾") ||
					strings.Contains(s.agents[i].Status, "⚙️") ||
					strings.Contains(s.agents[i].Status, "⚒️") ||
					strings.Contains(s.agents[i].Status, "⛏️") ||
					strings.Contains(s.agents[i].Status, "🏺") ||
					strings.Contains(s.agents[i].Status, "🏛️") ||
					strings.Contains(s.agents[i].Status, "🛠️") ||
					strings.Contains(s.agents[i].Status, "🚚")

				if !isHumanRequest {
					newTarget := Position{X: int(dec.Target.X), Y: int(dec.Target.Y)}
					if newTarget.X != s.agents[i].Position.X || newTarget.Y != s.agents[i].Position.Y {
						s.agents[i].Target = newTarget
					}
					if s.agents[i].Status != dec.Status {
						s.agents[i].addHistory(fmt.Sprintf("Changed action to '%s' at tick %d", dec.Status, s.tick.Load()))
					}
					s.agents[i].Status = dec.Status
					s.agents[i].Mood = dec.Mood
				}
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
