package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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

func main() {
	world := getenv("WORLD_SIM_URL", "http://localhost:18081")
	port := getenv("PORT", "18080")

	go startBroadcastLoop(world)

	http.HandleFunc("/healthz", withCORS(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	
	http.HandleFunc("/api/control/start", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/start"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/start"
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

	http.HandleFunc("/api/control/pause", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/control/pause"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/control/pause"
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

	http.HandleFunc("/api/state", withCORS(func(w http.ResponseWriter, r *http.Request) {
		target := world + "/state"
		remoteGatewayMutex.RLock()
		if remoteGatewayURL != "" {
			target = remoteGatewayURL + "/api/state"
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
	ticker := time.NewTicker(100 * time.Millisecond)
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
