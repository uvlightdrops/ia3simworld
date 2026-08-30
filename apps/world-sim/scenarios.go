package main

import (
	"fmt"
	"math/rand"
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

// Weekly congregation at nearest spiritual center
func (s *Sim) triggerWeeklyCongregation(duration int) {
	if len(s.spiritualCenters) == 0 {
		// No spiritual centers, skip
		return
	}

	// Pick a spiritual center (could be random or per-sector logic)
	target := s.spiritualCenters[rand.Intn(len(s.spiritualCenters))]

	s.congregationActive = true
	s.congregationTarget = target
	s.scenarioStartTick = s.tick.Load()
	s.lastCongregationTick = s.tick.Load()

	s.addEvent(fmt.Sprintf("🙏 [Weekly Congregation] All agents gather at the Spiritual Center (%d, %d) for community bonding!", target.X, target.Y))

	for i := range s.agents {
		a := &s.agents[i]
		if strings.HasPrefix(a.ID, "human-") || a.Role == "Human Explorer" {
			continue
		}
		a.Status = "Traveling to Weekly Congregation 🙏"
		a.Target = target
		a.History = append(a.History, fmt.Sprintf("Called to weekly congregation at spiritual center (%d, %d) at tick %d", target.X, target.Y, s.tick.Load()))
	}
}

func (s *Sim) endWeeklyCongregation() {
	s.congregationActive = false

	s.addEvent(fmt.Sprintf("🏡 [Congregation Complete] Agents depart the spiritual center and return to their homes."))

	for i := range s.agents {
		a := &s.agents[i]
		if strings.HasPrefix(a.ID, "human-") || a.Role == "Human Explorer" {
			continue
		}
		// Return to settlement center (roughly)
		a.Status = "Returning home from congregation 🏡"
		a.Target = a.Position // Set target to current position first (to be overridden by pathfinding)
		a.History = append(a.History, fmt.Sprintf("Ended weekly congregation and started return journey at tick %d", s.tick.Load()))
	}
}
