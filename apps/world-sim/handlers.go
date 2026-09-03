package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func (s *Sim) registerHandlers() {
	s.registerHandlersFederation()
	http.HandleFunc("/healthz", s.handleHealthz)
	http.HandleFunc("/control/start", s.handleControlStart)
	http.HandleFunc("/control/pause", s.handleControlPause)
	http.HandleFunc("/control/set-speed", s.handleControlSetSpeed)
	http.HandleFunc("/control/add-human-player", s.handleControlAddHumanPlayer)
	http.HandleFunc("/control/update-human-target", s.handleControlUpdateHumanTarget)
	http.HandleFunc("/control/trigger-scenario", s.handleControlTriggerScenario)
	http.HandleFunc("/control/trigger-congregation", s.handleControlTriggerCongregation)
	http.HandleFunc("/control/handover-agent", s.handleControlHandoverAgent)
	http.HandleFunc("/control/respond-interaction", s.handleControlRespondInteraction)
	http.HandleFunc("/control/update-ollama-settings", s.handleControlUpdateOllamaSettings)
	http.HandleFunc("/control/update-manager-settings", s.handleControlUpdateManagerSettings)
	http.HandleFunc("/control/regenerate", s.handleControlRegenerate)
	http.HandleFunc("/control/save-game", s.handleControlSaveGame)
	http.HandleFunc("/control/load-game", s.handleControlLoadGame)
	http.HandleFunc("/control/import-osm", s.handleImportOSM)
	http.HandleFunc("/control/map-sources", s.handleMapSources)
	http.HandleFunc("/control/sync-graph", s.handleSyncGraph)
	http.HandleFunc("/control/graph-edges", s.handleGetGraphEdges)
	http.HandleFunc("/control/register-brain-node", s.handleRegisterBrainNode)
	http.HandleFunc("/control/brain-nodes", s.handleGetBrainNodes)
	http.HandleFunc("/control/domain-settings", s.handleDomainSettings)
	http.HandleFunc("/control/settings", s.handleControlSettings)
	http.HandleFunc("/state", s.handleState)
}

func (s *Sim) handleDomainSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		s.domainSettingsMu.RLock()
		ds := s.domainSettings
		s.domainSettingsMu.RUnlock()
		json.NewEncoder(w).Encode(ds)
	case http.MethodPost:
		var ds DomainSettings
		if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// Validate modes
		validateMode := func(m DomainMode) DomainMode {
			switch m {
			case DomainOff, DomainRestricted, DomainFull:
				return m
			default:
				return DomainFull
			}
		}
		ds.Economy.Mode = validateMode(ds.Economy.Mode)
		ds.Court.Mode = validateMode(ds.Court.Mode)
		ds.Geistesleben.Mode = validateMode(ds.Geistesleben.Mode)
		if ds.Economy.WindowSize <= 0 {
			ds.Economy.WindowSize = 100
		}
		if ds.Court.WindowSize <= 0 {
			ds.Court.WindowSize = 100
		}
		if ds.Geistesleben.WindowSize <= 0 {
			ds.Geistesleben.WindowSize = 100
		}
		if ds.Economy.QuotaPerWindow <= 0 {
			ds.Economy.QuotaPerWindow = 20
		}
		if ds.Court.QuotaPerWindow <= 0 {
			ds.Court.QuotaPerWindow = 10
		}
		if ds.Geistesleben.QuotaPerWindow <= 0 {
			ds.Geistesleben.QuotaPerWindow = 10
		}

		s.domainSettingsMu.Lock()
		s.domainSettings = ds
		s.domainSettingsMu.Unlock()

		if data, err := json.MarshalIndent(ds, "", "  "); err == nil {
			_ = os.WriteFile("domain_settings.json", data, 0644)
		}
		s.addEvent(fmt.Sprintf("⚙️ [Domain-Einstellungen] Economy=%s, Recht=%s, Geistesleben=%s", ds.Economy.Mode, ds.Court.Mode, ds.Geistesleben.Mode))
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ds)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Sim) handleControlSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		s.tickDurationMu.RLock()
		tickMs := int(s.tickDuration.Milliseconds())
		s.tickDurationMu.RUnlock()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"riverWidth":     s.riverWidth,
			"lakesDensity":   s.lakesDensity,
			"berriesDensity": s.berriesDensity,
			"tickRateMs":     tickMs,
		})
	case http.MethodPost:
		var req struct {
			RiverWidth     *int     `json:"riverWidth"`
			LakesDensity   *float64 `json:"lakesDensity"`
			BerriesDensity *float64 `json:"berriesDensity"`
			TickRateMs     *int     `json:"tickRateMs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.RiverWidth != nil {
			s.riverWidth = *req.RiverWidth
		}
		if req.LakesDensity != nil {
			s.lakesDensity = *req.LakesDensity
		}
		if req.BerriesDensity != nil {
			s.berriesDensity = *req.BerriesDensity
		}
		if req.TickRateMs != nil && *req.TickRateMs >= 10 {
			s.tickDurationMu.Lock()
			s.tickDuration = time.Duration(*req.TickRateMs) * time.Millisecond
			s.tickDurationMu.Unlock()
		}
		s.addEvent(fmt.Sprintf("⚙️ [Settings] riverWidth=%d, lakesDensity=%.2f, berriesDensity=%.2f",
			s.riverWidth, s.lakesDensity, s.berriesDensity))
		w.WriteHeader(http.StatusOK)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Sim) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func broadcastSimControl(endpoint string) {
	targets := []string{
		"http://world-sim.ia3-1.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3-2.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3-3.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://localhost:8081/control/" + endpoint + "?broadcast=false",
		"http://localhost:17081/control/" + endpoint + "?broadcast=false",
		"http://localhost:18080/control/" + endpoint + "?broadcast=false",
		"http://localhost:18081/control/" + endpoint + "?broadcast=false",
		"http://localhost:18082/control/" + endpoint + "?broadcast=false",
	}
	client := http.Client{Timeout: 500 * time.Millisecond}
	for _, url := range targets {
		tURL := url
		go func() {
			resp, err := client.Post(tURL, "application/json", nil)
			if err == nil {
				resp.Body.Close()
			}
		}()
	}
}

func (s *Sim) handleControlStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.running.Store(true)
	s.addEvent("Sim loop started/resumed via control API")
	if r.URL.Query().Get("broadcast") != "false" {
		broadcastSimControl("start")
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlPause(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.running.Store(false)
	s.addEvent("Sim loop paused via control API")
	if r.URL.Query().Get("broadcast") != "false" {
		broadcastSimControl("pause")
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlSetSpeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		TickDurationMs int `json:"tickDurationMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if payload.TickDurationMs < 10 {
		payload.TickDurationMs = 10
	}
	s.tickDurationMu.Lock()
	s.tickDuration = time.Duration(payload.TickDurationMs) * time.Millisecond
	s.tickDurationMu.Unlock()
	s.addEvent(fmt.Sprintf("Sim speed changed: %d ms per tick", payload.TickDurationMs))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlAddHumanPlayer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Name string `json:"name"`
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		req.Name = "Human Player"
	}
	if req.Role == "" {
		req.Role = "Human Explorer"
	}

	s.interactionMu.Lock()
	found := false
	for i := range s.agents {
		if s.agents[i].ID == "human-1" {
			s.agents[i].Name = req.Name
			s.agents[i].Role = req.Role
			found = true
			break
		}
	}
	if !found {
		s.agents = append(s.agents, Agent{
			ID:              "human-1",
			Name:            req.Name,
			Role:            req.Role,
			Mood:            "inspired",
			Status:          "Exploring the world",
			Energy:          100,
			Position:        Position{X: s.worldWidth / 2, Y: s.worldHeight / 2},
			Target:          Position{X: s.worldWidth / 2, Y: s.worldHeight / 2},
			Interests:       []Interest{{"socializing", 90}, {"philosophy", 80}},
			Resources:       50,
			Waste:           0,
			HomePosition:    Position{X: s.worldWidth / 2, Y: s.worldHeight / 2},
			ExploredSectors: []string{},
		})
	}
	s.interactionMu.Unlock()

	s.addEvent(fmt.Sprintf("👤 Human Player '%s' joined the world!", req.Name))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlUpdateHumanTarget(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID string `json:"id"`
		X  int    `json:"x"`
		Y  int    `json:"y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.interactionMu.Lock()
	for i := range s.agents {
		if s.agents[i].ID == req.ID || (req.ID == "" && s.agents[i].ID == "human-1") {
			s.agents[i].Target = Position{X: req.X, Y: req.Y}
			s.agents[i].Status = fmt.Sprintf("Walking to (%d, %d)", req.X, req.Y)
			break
		}
	}
	s.interactionMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlTriggerScenario(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Scenario string `json:"scenario"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.triggerScenario(w, req.Scenario)
}

func (s *Sim) handleControlTriggerCongregation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.triggerWeeklyCongregation(168) // 33.6 seconds for testing
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "Congregation triggered"})
}

func (s *Sim) handleControlHandoverAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var agent Agent
	if err := json.NewDecoder(r.Body).Decode(&agent); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	calculatedSig := s.calculateAgentSignature(&agent)
	if calculatedSig != agent.Signature {
		s.addEvent(fmt.Sprintf("⛔ [Security] Agent-Handover ABGELEHNT! Ungültige Signatur für %s (%s)", agent.Name, agent.ID))
		http.Error(w, "Invalid Agent Signature", http.StatusUnauthorized)
		return
	}

	s.interactionMu.Lock()
	exists := false
	for i := range s.agents {
		if s.agents[i].ID == agent.ID {
			s.agents[i] = agent
			exists = true
			break
		}
	}
	if !exists {
		s.agents = append(s.agents, agent)
	}
	s.interactionMu.Unlock()

	nodeName := getenv("NODE_NAME", "ia3-1")
	s.addEvent(fmt.Sprintf("🌐 [Sharding] Agent %s hat erfolgreich in Sektor (%s) eingereist (Signatur VERIFIZIERT ✅)!", agent.Name, nodeName))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlRespondInteraction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		OptionIndex int `json:"optionIndex"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	msg := s.respondInteraction(req.OptionIndex)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": msg})
}

func (s *Sim) handleControlUpdateOllamaSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Enabled   bool   `json:"enabled"`
		BaseURL   string `json:"baseUrl"`
		Model     string `json:"model"`
		TimeoutMs int    `json:"timeoutMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.interactionMu.Lock()
	s.ollamaEnabled = req.Enabled
	if req.BaseURL != "" {
		s.ollamaBaseURL = req.BaseURL
	}
	if req.Model != "" {
		s.ollamaModel = req.Model
	}
	if req.TimeoutMs > 0 {
		s.ollamaTimeoutMs = req.TimeoutMs
	}
	s.interactionMu.Unlock()

	s.addEvent(fmt.Sprintf("⚙️ Ollama KI-Einstellungen aktualisiert: enabled=%v, model=%s, baseUrl=%s", req.Enabled, s.ollamaModel, s.ollamaBaseURL))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlUpdateManagerSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AutoAnswerMode *string `json:"autoAnswerMode"`
		OllamaEnabled  *bool   `json:"ollamaEnabled"`
		OllamaBaseURL  *string `json:"ollamaBaseURL"`
		OllamaModel    *string `json:"ollamaModel"`
		OllamaMode     *string `json:"ollamaMode"`
		OllamaTimeout  *int    `json:"ollamaTimeoutMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.interactionMu.Lock()
	if req.AutoAnswerMode != nil {
		s.autoAnswerMode = *req.AutoAnswerMode
	}
	if req.OllamaEnabled != nil {
		s.ollamaEnabled = *req.OllamaEnabled
	}
	if req.OllamaBaseURL != nil {
		s.ollamaBaseURL = *req.OllamaBaseURL
	}
	if req.OllamaModel != nil {
		s.ollamaModel = *req.OllamaModel
	}
	if req.OllamaMode != nil {
		s.ollamaMode = *req.OllamaMode
	}
	if req.OllamaTimeout != nil {
		s.ollamaTimeoutMs = *req.OllamaTimeout
	}
	s.interactionMu.Unlock()

	s.addEvent(fmt.Sprintf("⚙️ GameMaster-Einstellungen aktualisiert: Mode=%s, OllamaEnabled=%v, Model=%s", s.autoAnswerMode, s.ollamaEnabled, s.ollamaModel))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleControlRegenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.generating.Load() {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"status":"already_generating"}`))
		return
	}
	// Run terrain generation asynchronously so /state polling remains responsive.
	go func() {
		startTime := time.Now()
		s.generateTerrain()
		genDuration := time.Since(startTime)

		agentStart := time.Now()
		s.seedAgents()
		agentDuration := time.Since(agentStart)

		totalDuration := time.Since(startTime)
		s.addEvent(fmt.Sprintf("🌋 [Weltgenerierung] Karte regeneriert in %.1fs (Gelände: %.1fs, Agenten: %.1fs). Alle Artefakte & Strukturen zurückgesetzt.",
			totalDuration.Seconds(), genDuration.Seconds(), agentDuration.Seconds()))

		fmt.Printf("Regenerate timing: Terrain=%.1fs, Agents=%.1fs, Total=%.1fs\n",
			genDuration.Seconds(), agentDuration.Seconds(), totalDuration.Seconds())
	}()
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"generating"}`))
}

func (s *Sim) handleControlSaveGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	snap := s.snapshot()
	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile("savegame.json", data, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.addEvent("💾 [Spielstand] Spielstand erfolgreich in 'savegame.json' gespeichert!")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"saved"}`))
}

func (s *Sim) handleControlLoadGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := os.ReadFile("savegame.json")
	if err != nil {
		http.Error(w, "Kein gespeicherter Spielstand gefunden", http.StatusNotFound)
		return
	}
	var loaded WorldState
	if err := json.Unmarshal(data, &loaded); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.interactionMu.Lock()
	if len(loaded.Terrain) > 0 {
		s.terrain = loaded.Terrain
		s.worldHeight = len(loaded.Terrain)
		s.worldWidth = len(loaded.Terrain[0])
	}
	if len(loaded.Objects) > 0 {
		s.objects = loaded.Objects
	}
	if len(loaded.Agents) > 0 {
		s.agents = loaded.Agents
	}
	s.tick.Store(loaded.Tick)
	s.interactionMu.Unlock()

	s.addEvent(fmt.Sprintf("📂 [Spielstand] Spielstand aus 'savegame.json' geladen (Tick %d, %d Agenten)!", loaded.Tick, len(loaded.Agents)))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"loaded"}`))
}

func (s *Sim) snapshotPerformance() *PerformanceSnapshot {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	return &PerformanceSnapshot{
		LastTickDurationMs:  int(s.lastTickDurationMs.Load()),
		LastStateSnapshotMs: int(s.lastStateSnapshotMs.Load()),
		AvgTickDurationMs:   int(s.lastTickDurationMs.Load()),
		TotalGrpcCalls:      int(s.grpcCallCount.Load()),
		StateRequests:       int(s.stateRequestCount.Load()),
		MemoryUsedMb:        int(mem.Alloc / (1024 * 1024)),
	}
}

func (s *Sim) handleState(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s.stateRequestCount.Add(1)
	start := time.Now()
	var state WorldState
	if r.URL.Query().Get("compact") == "true" {
		state = s.snapshotStateCompact()
		if r.URL.Query().Get("delta") == "true" {
			state.Terrain = nil
			state.Objects = nil
			if len(state.Events) > 10 {
				state.Events = state.Events[:10]
			}
		}
	} else {
		maxAgents := 100
		if maxStr := r.URL.Query().Get("max_agents"); maxStr != "" {
			if m, err := strconv.Atoi(maxStr); err == nil && m > 0 {
				maxAgents = m
			}
		}

		viewportX, viewportY, viewportRadius := -1, -1, -1
		if xStr := r.URL.Query().Get("viewport_x"); xStr != "" {
			if x, err := strconv.Atoi(xStr); err == nil {
				viewportX = x
			}
		}
		if yStr := r.URL.Query().Get("viewport_y"); yStr != "" {
			if y, err := strconv.Atoi(yStr); err == nil {
				viewportY = y
			}
		}
		if rStr := r.URL.Query().Get("viewport_radius"); rStr != "" {
			if rad, err := strconv.Atoi(rStr); err == nil {
				viewportRadius = rad
			}
		}

		if viewportX >= 0 && viewportY >= 0 && viewportRadius > 0 {
			state = s.snapshotStateViewport(maxAgents, viewportX, viewportY, viewportRadius)
		} else {
			state = s.snapshotState(maxAgents)
		}
	}
	state.Performance = s.snapshotPerformance()
	snapshotMs := time.Since(start).Milliseconds()
	s.lastStateSnapshotMs.Store(int64(snapshotMs))
	s.maybeLogPerf("state_snapshot", snapshotMs, 25)
	if err := json.NewEncoder(w).Encode(state); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *Sim) snapshotStateCompact() WorldState {
	s.interactionMu.Lock()
	defer s.interactionMu.Unlock()

	s.tickDurationMu.RLock()
	tickMs := int(s.tickDuration.Milliseconds())
	s.tickDurationMu.RUnlock()

	eventsCopy := make([]string, len(s.recentEvents))
	copy(eventsCopy, s.recentEvents)

	agentsCopy := make([]Agent, len(s.agents))
	copy(agentsCopy, s.agents)

	nodeName := getenv("NODE_NAME", "ia3-1")
	secStr := "0,0"
	if nodeName == "ia3-2" || nodeName == "ia3-two" {
		secStr = "1,0"
	} else if nodeName == "ia3-3" || nodeName == "ia3-three" {
		secStr = "0,1"
	}

	return WorldState{
		Tick:              s.tick.Load(),
		Running:           s.running.Load(),
		TickRateMs:        tickMs,
		TotalAgents:       len(agentsCopy),
		WorldSize:         WorldBounds{Width: s.worldWidth, Height: s.worldHeight},
		Terrain:           [][]string{},
		Objects:           [][]WorldObject{},
		Agents:            agentsCopy,
		Events:            eventsCopy,
		CreatedAt:         s.createdAt.Format(time.RFC3339),
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
		DiscoveredSectors: []string{secStr},
		ActiveInteraction: s.activeInteraction,
		AutoAnswerMode:    s.autoAnswerMode,
		OllamaEnabled:     s.ollamaEnabled,
		OllamaBaseURL:     s.ollamaBaseURL,
		OllamaModel:       s.ollamaModel,
		OllamaMode:        s.ollamaMode,
		OllamaTimeoutMs:   s.ollamaTimeoutMs,
		ManagerAThoughts:  s.managerAThoughts,
		ManagerBThoughts:  s.managerBThoughts,
		ManagerCThoughts:  s.managerCThoughts,
		OsmDataLoaded:     s.osmDataLoaded,
		CenterLatLon:      s.centerLatLon,
		Generating:        s.generating.Load(),
		GenProgress:       int(s.genProgress.Load()),
		GenPhase:          func() string { v, _ := s.genPhase.Load().(string); return v }(),
		LastGeneratedAt:   func() string { if s.lastGeneratedAt.IsZero() { return "" }; return s.lastGeneratedAt.Format(time.RFC3339) }(),
		DomainSettings:    s.domainSettings,
		SectorClaims:      s.sectorClaimsSlice(),
		Settlements:       append([]Settlement(nil), s.settlements...),
		CivilizationStage: s.civilizationStage,
		NodeID:            s.nodeID,
		AssignedSectorX:   s.assignedSectorX,
		AssignedSectorY:   s.assignedSectorY,
	}
}

func (s *Sim) snapshotStateViewport(maxAgents, vx, vy, radius int) WorldState {
	s.interactionMu.Lock()
	defer s.interactionMu.Unlock()

	s.tickDurationMu.RLock()
	tickMs := int(s.tickDuration.Milliseconds())
	s.tickDurationMu.RUnlock()

	eventsCopy := make([]string, len(s.recentEvents))
	copy(eventsCopy, s.recentEvents)

	vpHeight := radius*2 + 1
	vpWidth := radius*2 + 1
	subTerrain := make([][]string, vpHeight)
	subObjects := make([][]WorldObject, vpHeight)

	for ry := 0; ry < vpHeight; ry++ {
		subTerrain[ry] = make([]string, vpWidth)
		subObjects[ry] = make([]WorldObject, vpWidth)
		wy := wrap(vy-radius+ry, s.worldHeight)
		for rx := 0; rx < vpWidth; rx++ {
			wx := wrap(vx-radius+rx, s.worldWidth)
			subTerrain[ry][rx] = s.terrain[wy][wx]
			subObjects[ry][rx] = s.objects[wy][wx]
		}
	}

	agentsCopy := make([]Agent, 0, len(s.agents))
	for _, a := range s.agents {
		if strings.HasPrefix(a.ID, "human-") || s.toroidalDistance(a.Position, Position{X: vx, Y: vy}) <= float64(radius+5) {
			agentsCopy = append(agentsCopy, a)
		}
		if len(agentsCopy) >= maxAgents {
			break
		}
	}

	nodeName := getenv("NODE_NAME", "ia3-1")
	secStr := "0,0"
	if nodeName == "ia3-2" || nodeName == "ia3-two" {
		secStr = "1,0"
	} else if nodeName == "ia3-3" || nodeName == "ia3-three" {
		secStr = "0,1"
	}

	return WorldState{
		Tick:              s.tick.Load(),
		Running:           s.running.Load(),
		TickRateMs:        tickMs,
		TotalAgents:       len(agentsCopy),
		WorldSize:         WorldBounds{Width: s.worldWidth, Height: s.worldHeight},
		Terrain:           subTerrain,
		Objects:           subObjects,
		Agents:            agentsCopy,
		Events:            eventsCopy,
		CreatedAt:         s.createdAt.Format(time.RFC3339),
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
		DiscoveredSectors: []string{secStr},
		ActiveInteraction: s.activeInteraction,
		AutoAnswerMode:    s.autoAnswerMode,
		OllamaEnabled:     s.ollamaEnabled,
		OllamaBaseURL:     s.ollamaBaseURL,
		OllamaModel:       s.ollamaModel,
		OllamaMode:        s.ollamaMode,
		OllamaTimeoutMs:   s.ollamaTimeoutMs,
		ManagerAThoughts:  s.managerAThoughts,
		ManagerBThoughts:  s.managerBThoughts,
		ManagerCThoughts:  s.managerCThoughts,
		OsmDataLoaded:     s.osmDataLoaded,
		CenterLatLon:      s.centerLatLon,
		Generating:        s.generating.Load(),
		GenProgress:       int(s.genProgress.Load()),
		GenPhase:          func() string { v, _ := s.genPhase.Load().(string); return v }(),
		LastGeneratedAt:   func() string { if s.lastGeneratedAt.IsZero() { return "" }; return s.lastGeneratedAt.Format(time.RFC3339) }(),
		DomainSettings:    s.domainSettings,
		SectorClaims:      s.sectorClaimsSlice(),
		Settlements:       append([]Settlement(nil), s.settlements...),
		CivilizationStage: s.civilizationStage,
		NodeID:            s.nodeID,
		AssignedSectorX:   s.assignedSectorX,
		AssignedSectorY:   s.assignedSectorY,
	}
}

func (s *Sim) snapshotState(maxAgents int) WorldState {
	s.interactionMu.Lock()
	defer s.interactionMu.Unlock()

	s.tickDurationMu.RLock()
	tickMs := int(s.tickDuration.Milliseconds())
	s.tickDurationMu.RUnlock()

	currentTick := s.tick.Load()

	eventsCopy := make([]string, len(s.recentEvents))
	copy(eventsCopy, s.recentEvents)

	agentsCopy := make([]Agent, 0, len(s.agents))
	for i, a := range s.agents {
		if i >= maxAgents && !strings.HasPrefix(a.ID, "human-") {
			continue
		}
		agentsCopy = append(agentsCopy, a)
	}

	// Use cached terrain/objects if they haven't changed since last snapshot
	var subTerrain [][]string
	var subObjects [][]WorldObject

	if s.cachedTerrainTick == currentTick && s.cachedTerrain != nil {
		// Cache is valid, reuse it (no allocations!)
		subTerrain = s.cachedTerrain
		subObjects = s.cachedObjects
	} else {
		// Cache invalid, copy terrain/objects and update cache
		subTerrain = make([][]string, s.worldHeight)
		subObjects = make([][]WorldObject, s.worldHeight)
		for y := 0; y < s.worldHeight; y++ {
			subTerrain[y] = make([]string, s.worldWidth)
			subObjects[y] = make([]WorldObject, s.worldWidth)
			copy(subTerrain[y], s.terrain[y])
			copy(subObjects[y], s.objects[y])
		}
		// Update cache for next call within same tick
		s.cachedTerrain = subTerrain
		s.cachedObjects = subObjects
		s.cachedTerrainTick = currentTick
		s.cachedObjectsTick = currentTick
	}

	nodeName := getenv("NODE_NAME", "ia3-1")
	secStr := "0,0"
	if nodeName == "ia3-2" || nodeName == "ia3-two" {
		secStr = "1,0"
	} else if nodeName == "ia3-3" || nodeName == "ia3-three" {
		secStr = "0,1"
	}

	return WorldState{
		Tick:              currentTick,
		Running:           s.running.Load(),
		TickRateMs:        tickMs,
		TotalAgents:       len(agentsCopy),
		WorldSize:         WorldBounds{Width: s.worldWidth, Height: s.worldHeight},
		Terrain:           subTerrain,
		Objects:           subObjects,
		Agents:            agentsCopy,
		Events:            eventsCopy,
		CreatedAt:         s.createdAt.Format(time.RFC3339),
		LastUpdated:       time.Now().UTC().Format(time.RFC3339),
		DiscoveredSectors: []string{secStr},
		ActiveInteraction: s.activeInteraction,
		AutoAnswerMode:    s.autoAnswerMode,
		OllamaEnabled:     s.ollamaEnabled,
		OllamaBaseURL:     s.ollamaBaseURL,
		OllamaModel:       s.ollamaModel,
		OllamaMode:        s.ollamaMode,
		OllamaTimeoutMs:   s.ollamaTimeoutMs,
		ManagerAThoughts:  s.managerAThoughts,
		ManagerBThoughts:  s.managerBThoughts,
		ManagerCThoughts:  s.managerCThoughts,
		OsmDataLoaded:     s.osmDataLoaded,
		CenterLatLon:      s.centerLatLon,
		Generating:        s.generating.Load(),
		GenProgress:       int(s.genProgress.Load()),
		GenPhase:          func() string { v, _ := s.genPhase.Load().(string); return v }(),
		LastGeneratedAt:   func() string { if s.lastGeneratedAt.IsZero() { return "" }; return s.lastGeneratedAt.Format(time.RFC3339) }(),
		DomainSettings:    s.domainSettings,
		SectorClaims:      s.sectorClaimsSlice(),
		Settlements:       append([]Settlement(nil), s.settlements...),
		CivilizationStage: s.civilizationStage,
		NodeID:            s.nodeID,
		AssignedSectorX:   s.assignedSectorX,
		AssignedSectorY:   s.assignedSectorY,
	}
}
