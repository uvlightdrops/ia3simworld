package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/knadh/koanf/v2"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
)

var (
	clients            = make(map[*websocket.Conn]bool)
	clientsMu          sync.Mutex
	upgrader           = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	remoteGatewayURL   string
	remoteGatewayMutex sync.RWMutex
)

func loadConfig() *koanf.Koanf {
	k := koanf.New(".")

	// 1. Load defaults from config/defaults/
	defaults := []string{
		"../../config/defaults/ports.yaml",
		"../../config/defaults/node.yaml",
	}
	for _, f := range defaults {
		if err := k.Load(file.Provider(f), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Failed to load %s: %v", f, err)
		}
	}

	// 2. Load profile override (if PROFILE env var set)
	if profile := os.Getenv("PROFILE"); profile != "" {
		profileFile := fmt.Sprintf("../../config/profiles/%s.yaml", profile)
		if err := k.Load(file.Provider(profileFile), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Profile %s not found: %v", profile, err)
		} else {
			log.Printf("[config] Loaded profile: %s", profile)
		}
	}

	// 3. Load stage override (if STAGE env var set)
	if stage := os.Getenv("STAGE"); stage != "" {
		stageFile := fmt.Sprintf("../../config/stages/%s/config.yaml", stage)
		if err := k.Load(file.Provider(stageFile), yaml.Parser()); err != nil {
			log.Printf("[config] Warning: Stage %s not found: %v", stage, err)
		} else {
			log.Printf("[config] Loaded stage: %s", stage)
		}
	}

	// 4. Load environment variables (highest priority)
	k.Load(env.Provider("", ".", func(s string) string {
		return strings.ToLower(s)
	}), nil)

	return k
}

func broadcastControlCommand(endpoint string, r *http.Request) {
	if r.URL.Query().Get("broadcast") == "false" {
		return
	}

	targets := []string{
		"http://world-sim.ia3-1.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3-2.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3-3.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://world-sim.ia3.svc.cluster.local:8081/control/" + endpoint + "?broadcast=false",
		"http://api-gateway.ia3-1.svc.cluster.local:8080/api/control/" + endpoint + "?broadcast=false",
		"http://api-gateway.ia3-2.svc.cluster.local:8080/api/control/" + endpoint + "?broadcast=false",
		"http://api-gateway.ia3-3.svc.cluster.local:8080/api/control/" + endpoint + "?broadcast=false",
		"http://api-gateway.ia3.svc.cluster.local:8080/api/control/" + endpoint + "?broadcast=false",
	}

	remoteGatewayMutex.RLock()
	if remoteGatewayURL != "" {
		targets = append(targets, remoteGatewayURL+"/api/control/"+endpoint+"?broadcast=false")
	}
	remoteGatewayMutex.RUnlock()

	client := http.Client{Timeout: 500 * time.Millisecond}
	for _, url := range targets {
		targetURL := url
		go func() {
			resp, err := client.Post(targetURL, "application/json", nil)
			if err == nil {
				resp.Body.Close()
			}
		}()
	}
}

func main() {
	cfg := loadConfig()

	// Load world-sim URL and port from config
	world := cfg.String("ports.world_sim_url")
	if world == "" {
		world = getenv("WORLD_SIM_URL", "http://localhost:17081")
	}
	
	port := cfg.String("ports.api_gateway")
	if port == "" {
		port = getenv("PORT", "17080")
	}

	log.Printf("[gateway] Config loaded: World SIM URL: %s, API Gateway Port: %s", world, port)

	// Pre-initialize remoteGatewayURL if provided in environment (e.g. for automatic K8s peering)
	if envRemote := os.Getenv("REMOTE_GATEWAY_URL"); envRemote != "" {
		remoteGatewayURL = envRemote
		log.Printf("[Peering] Auto-connected to remote gateway URL: %s", envRemote)
	}

	go startBroadcastLoop(world)

	http.HandleFunc("/healthz", withCORS(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	http.HandleFunc("/api/healthz", withCORS(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	
	http.HandleFunc("/api/control/start", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/start?broadcast=false"
		resp, err := http.Post(target, "application/json", nil)
		if err == nil {
			resp.Body.Close()
		}
		broadcastControlCommand("start", r)
		w.WriteHeader(http.StatusOK)
	}))

	http.HandleFunc("/api/control/pause", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/pause?broadcast=false"
		resp, err := http.Post(target, "application/json", nil)
		if err == nil {
			resp.Body.Close()
		}
		broadcastControlCommand("pause", r)
		w.WriteHeader(http.StatusOK)
	}))

	http.HandleFunc("/api/control/domain-settings", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/domain-settings"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/domain-settings"
		}
		remoteGatewayMutex.RUnlock()

		if r.Method == http.MethodPost {
			resp, err := http.Post(target, "application/json", r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_, _ = io.Copy(w, resp.Body)
			return
		}
		// GET
		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/regenerate", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/regenerate"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/regenerate"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.WriteHeader(resp.StatusCode)
	}))

	// Federation endpoints: register-node, sector-claims, claim-sector, announce-sector, known-nodes
	for _, ep := range []string{"register-node", "sector-claims", "claim-sector", "announce-sector", "known-nodes"} {
		endpoint := ep
		http.HandleFunc("/api/control/"+endpoint, withCORS(func(w http.ResponseWriter, r *http.Request) {
			target := world + "/control/" + endpoint
			remoteGatewayMutex.RLock()
			if remoteGatewayURL != "" {
				target = remoteGatewayURL + "/api/control/" + endpoint
			}
			remoteGatewayMutex.RUnlock()

			if r.Method == http.MethodGet {
				resp, err := http.Get(target)
				if err != nil {
					http.Error(w, err.Error(), http.StatusBadGateway)
					return
				}
				defer resp.Body.Close()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(resp.StatusCode)
				_, _ = io.Copy(w, resp.Body)
				return
			}
			resp, err := http.Post(target, "application/json", r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_, _ = io.Copy(w, resp.Body)
		}))
	}

	http.HandleFunc("/api/control/settings", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/settings"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/settings"
		}
		remoteGatewayMutex.RUnlock()

		if r.Method == http.MethodPost {
			resp, err := http.Post(target, "application/json", r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.WriteHeader(resp.StatusCode)
			_, _ = io.Copy(w, resp.Body)
			return
		}
		// GET
		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/multiplayer", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var params struct {
				RemoteURL string `json:"remoteURL"`
			}
			if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			remoteGatewayMutex.Lock()
			remoteGatewayURL = params.RemoteURL
			remoteGatewayMutex.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		}
		// GET
		remoteGatewayMutex.RLock()
		url := remoteGatewayURL
		remoteGatewayMutex.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"remoteURL": url,
		})
	}))

	http.HandleFunc("/api/control/join-human", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/join-human"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/join-human"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/move-human", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/move-human"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/move-human"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/update-manager-settings", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/update-manager-settings"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/update-manager-settings"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/agent-request", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/agent-request"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/agent-request"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/respond-interaction", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/respond-interaction"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/respond-interaction"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/set-auto-answer", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/set-auto-answer"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/set-auto-answer"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/trigger-scenario", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/trigger-scenario"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/trigger-scenario"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/save-game", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/save-game"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/save-game"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/load-game", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/load-game"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/load-game"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/import-osm", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/import-osm"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/import-osm"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/map-sources", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/map-sources"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/map-sources"
		}
		remoteGatewayMutex.RUnlock()

		if r.Method == http.MethodPost {
			resp, err := http.Post(target, "application/json", r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_, _ = io.Copy(w, resp.Body)
			return
		}

		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/sync-graph", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/sync-graph"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/sync-graph"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/control/register-brain-node", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/register-brain-node"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/register-brain-node"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Post(target, "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/state", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/state"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/state"
		}
		remoteGatewayMutex.RUnlock()

		// Forward query parameters (e.g., ?compact=true)
		if q := r.URL.RawQuery; q != "" {
			target += "?" + q
		}

		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/state/opensim/png", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/state/opensim/png"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/state/opensim/png"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Content-Disposition", `attachment; filename="opensim_terrain_256.png"`)
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/state/opensim/json", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/state/opensim/json"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/state/opensim/json"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Get(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}))

	http.HandleFunc("/api/ws", withCORS(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("Upgrade failed:", err)
			return
		}
		clientsMu.Lock()
		clients[conn] = true
		clientsMu.Unlock()

		defer func() {
			clientsMu.Lock()
			delete(clients, conn)
			clientsMu.Unlock()
			conn.Close()
		}()

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}))

	log.Println("api-gateway listening :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func startBroadcastLoop(worldSimURL string) {
	// Poll at same interval as backend tick (200ms) to avoid redundant polling
	ticker := time.NewTicker(200 * time.Millisecond)
	var lastTick uint64 = 0

	type BasicState struct {
		Tick uint64 `json:"tick"`
	}

	for range ticker.C {
		target := worldSimURL + "/state"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/state"
		}
		remoteGatewayMutex.RUnlock()

		resp, err := http.Get(target)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		var bs BasicState
		if err := json.Unmarshal(body, &bs); err != nil {
			continue
		}

		if bs.Tick != lastTick {
			lastTick = bs.Tick
			broadcast(body)
		}
	}
}

func broadcast(data []byte) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	for client := range clients {
		err := client.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			client.Close()
			delete(clients, client)
		}
	}
}

func proxyPost(url string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		resp, err := http.Post(url, "application/json", nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.WriteHeader(resp.StatusCode)
	}
}

func proxySettings(worldSimURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			resp, err := http.Post(worldSimURL, "application/json", r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()
			w.WriteHeader(resp.StatusCode)
			_, _ = io.Copy(w, resp.Body)
			return
		}
		// GET
		resp, err := http.Get(worldSimURL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	}
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func getenv(k, d string) string {
	v := os.Getenv(k)
	if v == "" {
		return d
	}
	return v
}
