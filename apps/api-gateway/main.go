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
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
	upgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func main() {
	world := getenv("WORLD_SIM_URL", "http://localhost:18081")
	port := getenv("PORT", "18080")

	go startBroadcastLoop(world)

	http.HandleFunc("/healthz", withCORS(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	http.HandleFunc("/api/control/start", withCORS(proxyPost(world+"/control/start")))
	http.HandleFunc("/api/control/pause", withCORS(proxyPost(world+"/control/pause")))
	http.HandleFunc("/api/control/regenerate", withCORS(proxyPost(world+"/control/regenerate")))
	http.HandleFunc("/api/state", withCORS(func(w http.ResponseWriter, r *http.Request) {
		resp, err := http.Get(world + "/state")
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
		resp, err := http.Get(worldSimURL + "/state")
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
