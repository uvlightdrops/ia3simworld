package main

import (
	"fmt"
	"net/http"
	"strings"
)

func (s *Sim) triggerScenario(w http.ResponseWriter, scenarioType string) {
	if scenarioType != "festival" {
		http.Error(w, "Unsupported scenario type", http.StatusBadRequest)
		return
	}

	targetX := s.worldWidth / 2
	targetY := s.worldHeight / 2

	found := false
	for d := 0; d < 20; d++ {
		tx := (targetX + d) % s.worldWidth
		ty := (targetY + d/2) % s.worldHeight
		if s.terrain[ty][tx] == string(TerrainGrass) && s.objects[ty][tx].Type == "" {
			targetX = tx
			targetY = ty
			found = true
			break
		}
	}
	if !found {
		targetX = s.worldWidth / 4
		targetY = s.worldHeight / 4
	}

	s.scenarioActive = true
	s.scenarioType = "festival"
	s.scenarioState = "gathering"
	s.scenarioTarget = Position{X: targetX, Y: targetY}
	s.scenarioStartTick = s.tick.Load()
	s.scenarioTicksLeft = 0

	s.addEvent(fmt.Sprintf("🎉 [Scenario] An Autumn Solstice Festival is announced at (%d, %d)! All agents are packing resources and traveling to gather!", targetX, targetY))

	for i := range s.agents {
		a := &s.agents[i]
		if strings.HasPrefix(a.ID, "human-") || a.Role == "Human Explorer" {
			continue
		}
		a.Status = "Traveling to Autumn Solstice Festival 🎉"
		a.Target = s.scenarioTarget
		a.addHistory(fmt.Sprintf("Announced Autumn Solstice Festival! Packed supplies and started traveling to coordinates (%d, %d) at tick %d", targetX, targetY, s.tick.Load()))
	}

	w.WriteHeader(http.StatusOK)
}
