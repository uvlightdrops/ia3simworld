package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
)

// WGS84 Geo-Coordinates Mapping (Default: Augsburg Rathausplatz 48.3689° N, 10.8978° E)
const (
	DefaultCenterLat = 48.3689
	DefaultCenterLon = 10.8978
	MetersPerDegree  = 111320.0
)

type OSMImportRequest struct {
	MapName    string     `json:"mapName,omitempty"`
	SourceID   string     `json:"sourceId,omitempty"`
	CenterLat  float64    `json:"centerLat"`
	CenterLon  float64    `json:"centerLon"`
	GeoPoints  []GeoPoint `json:"geoPoints"`  // Points of Interest (Landmarks, Buildings)
	RoadNodes  []GeoPoint `json:"roadNodes"`  // Road network vectors
	WaterNodes []GeoPoint `json:"waterNodes"` // River / Lake contours
}

func (s *Sim) initMapSources() {
	s.mapSourcesMu.Lock()
	defer s.mapSourcesMu.Unlock()

	if len(s.mapSources) > 0 {
		return
	}

	s.mapSources = []MapSource{
		{
			ID:          "src-1",
			Name:        "OpenStreetMap Overpass API",
			Type:        "osm_overpass",
			URL:         "https://overpass-api.de/api/interpreter",
			Description: "Live OpenStreetMap Vektor-Geodaten Schnittstelle (Global)",
			Status:      "online",
			CreatedAt:   "2026-08-28",
		},
		{
			ID:          "src-2",
			Name:        "Augsburg & Umgebung (OSM Vektorset)",
			Type:        "geojson_preset",
			URL:         "preset://augsburg-stadt-schwaben",
			Description: "Offizielles Stadtportal & POI Vektordaten-Set Augsburg",
			Status:      "ready",
			CreatedAt:   "2026-08-28",
		},
		{
			ID:          "src-3",
			Name:        "München Altstadt & Isar",
			Type:        "geojson_preset",
			URL:         "preset://muenchen-altstadt-isar",
			Description: "Historische Altstadt München, Marienplatz & Isarauen",
			Status:      "ready",
			CreatedAt:   "2026-08-28",
		},
		{
			ID:          "src-4",
			Name:        "Nürnberg Kaiserburg & Pegnitz",
			Type:        "geojson_preset",
			URL:         "preset://nuernberg-kaiserburg-pegnitz",
			Description: "Nürnberg Hauptmarkt, Kaiserburg & Pegnitz-Flusssystem",
			Status:      "ready",
			CreatedAt:   "2026-08-28",
		},
	}

	s.importedMaps = []ImportedMap{
		{
			ID:           "map-1",
			Name:         "Augsburg Kernstadt & Flusssystem",
			SourceID:     "src-2",
			SourceName:   "Augsburg & Umgebung (OSM Vektorset)",
			CenterLat:    48.3689,
			CenterLon:    10.8978,
			CenterLatLon: "48.3689° N, 10.8978° E (Augsburg)",
			PoisCount:    10,
			RoadsCount:   8,
			WaterCount:   7,
			ImportedAt:   time.Now().Format("2006-01-02 15:04"),
			IsActive:     true,
		},
	}
}

func (s *Sim) handleMapSources(w http.ResponseWriter, r *http.Request) {
	s.initMapSources()
	if r.Method == http.MethodPost {
		var src MapSource
		if err := json.NewDecoder(r.Body).Decode(&src); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if src.ID == "" {
			src.ID = fmt.Sprintf("src-%d", time.Now().UnixNano())
		}
		if src.Status == "" {
			src.Status = "ready"
		}
		if src.CreatedAt == "" {
			src.CreatedAt = time.Now().Format("2006-01-02")
		}
		s.mapSourcesMu.Lock()
		s.mapSources = append(s.mapSources, src)
		s.mapSourcesMu.Unlock()

		s.addEvent(fmt.Sprintf("🌐 Neue Kartenquelle hinzugefügt: %s (%s)", src.Name, src.Type))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(src)
		return
	}

	s.mapSourcesMu.RLock()
	sources := make([]MapSource, len(s.mapSources))
	copy(sources, s.mapSources)
	imported := make([]ImportedMap, len(s.importedMaps))
	copy(imported, s.importedMaps)
	s.mapSourcesMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"mapSources":   sources,
		"importedMaps": imported,
	})
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func rasterizeLine(x0, y0, x1, y1 int, width, height int, setTile func(x, y int)) {
	dx := abs(x1 - x0)
	dy := abs(y1 - y0)
	sx := -1
	if x0 < x1 {
		sx = 1
	}
	sy := -1
	if y0 < y1 {
		sy = 1
	}
	err := dx - dy

	currX, currY := x0, y0
	for {
		setTile(wrap(currX, width), wrap(currY, height))
		if currX == x1 && currY == y1 {
			break
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			currX += sx
		}
		if e2 < dx {
			err += dx
			currY += sy
		}
	}
}

func (s *Sim) LatLonToTile(lat, lon, centerLat, centerLon float64) (int, int) {
	if centerLat == 0 {
		centerLat = DefaultCenterLat
	}
	if centerLon == 0 {
		centerLon = DefaultCenterLon
	}
	latDiff := lat - centerLat
	lonDiff := lon - centerLon

	yMeters := latDiff * MetersPerDegree
	xMeters := lonDiff * MetersPerDegree * math.Cos(centerLat*math.Pi/180.0)

	// Scale 1 tile = 10 meters, centered at (128, 128)
	xTile := int(float64(s.worldWidth/2) + (xMeters / 10.0))
	yTile := int(float64(s.worldHeight/2) - (yMeters / 10.0))

	xTile = wrap(xTile, s.worldWidth)
	yTile = wrap(yTile, s.worldHeight)

	return xTile, yTile
}

func (s *Sim) handleImportOSM(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OSMImportRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.CenterLat == 0 {
		req.CenterLat = DefaultCenterLat
	}
	if req.CenterLon == 0 {
		req.CenterLon = DefaultCenterLon
	}

	if len(req.GeoPoints) == 0 && len(req.RoadNodes) == 0 && len(req.WaterNodes) == 0 {
		cLat := req.CenterLat
		cLon := req.CenterLon

		if math.Abs(cLat-48.1371) < 0.1 && math.Abs(cLon-11.5754) < 0.1 {
			// München Preset
			req.GeoPoints = []GeoPoint{
				{Lat: 48.1371, Lon: 11.5754, Name: "Marienplatz & Stadtmarkt (Market)"},
				{Lat: 48.1386, Lon: 11.5736, Name: "Frauenkirche & Domgericht (Court)"},
				{Lat: 48.1411, Lon: 11.5781, Name: "Residenz München (Court)"},
				{Lat: 48.1351, Lon: 11.5761, Name: "Viktualienmarkt (Market)"},
				{Lat: 48.1500, Lon: 11.5900, Name: "Englischer Garten Forst (Forest)"},
				{Lat: 48.1315, Lon: 11.5861, Name: "Deutsches Museum Werkstatt (Workshop)"},
				{Lat: 48.1250, Lon: 11.5800, Name: "Isar-Mühlenbetrieb (Mill)"},
				{Lat: 48.1300, Lon: 11.5950, Name: "Haidhausen Siedlung (Home)"},
				{Lat: 48.1600, Lon: 11.5850, Name: "Schwabing Kunstquartier (Workshop)"},
				{Lat: 48.1580, Lon: 11.5030, Name: "Nymphenburg Schloss (Court)"},
			}
			req.RoadNodes = []GeoPoint{
				{Lat: 48.1371, Lon: 11.5754}, {Lat: 48.1700, Lon: 11.5850},
				{Lat: 48.1300, Lon: 11.5550}, {Lat: 48.1371, Lon: 11.5754}, {Lat: 48.1350, Lon: 11.6000},
			}
			req.WaterNodes = []GeoPoint{
				{Lat: 48.1100, Lon: 11.5600}, {Lat: 48.1300, Lon: 11.5800}, {Lat: 48.1600, Lon: 11.6000}, {Lat: 48.1900, Lon: 11.6200},
				{Lat: 48.1400, Lon: 11.5900}, {Lat: 48.1600, Lon: 11.6050},
			}
		} else if math.Abs(cLat-49.4578) < 0.1 && math.Abs(cLon-11.0778) < 0.1 {
			// Nürnberg Preset
			req.GeoPoints = []GeoPoint{
				{Lat: 49.4578, Lon: 11.0778, Name: "Nürnberg Hauptmarkt (Market)"},
				{Lat: 49.4579, Lon: 11.0760, Name: "Kaiserburg Nürnberg (Court)"},
				{Lat: 49.4510, Lon: 11.0780, Name: "Lorenzkirche Stadtgericht (Court)"},
				{Lat: 49.4470, Lon: 11.0810, Name: "Handwerkerhof Nürnberg (Workshop)"},
				{Lat: 49.4530, Lon: 11.0700, Name: "Pegnitz Mühlenbetrieb (Mill)"},
				{Lat: 49.4580, Lon: 11.0600, Name: "St. Johannis Siedlung (Home)"},
				{Lat: 49.4450, Lon: 11.0650, Name: "Gostenhof Handwerk (Workshop)"},
				{Lat: 49.4650, Lon: 11.0900, Name: "Stadtpark Forstbetrieb (Forest)"},
			}
			req.RoadNodes = []GeoPoint{
				{Lat: 49.4400, Lon: 11.0778}, {Lat: 49.4700, Lon: 11.0778},
				{Lat: 49.4578, Lon: 11.0500}, {Lat: 49.4578, Lon: 11.1000},
			}
			req.WaterNodes = []GeoPoint{
				{Lat: 49.4530, Lon: 11.0400}, {Lat: 49.4540, Lon: 11.0778}, {Lat: 49.4550, Lon: 11.1200},
			}
		} else {
			// Augsburg or Generic Geo-Location Vector Presets
			req.GeoPoints = []GeoPoint{
				{Lat: cLat, Lon: cLon, Name: "Augsburg / Stadtzentrum (Market)"},
				{Lat: cLat + 0.003, Lon: cLon + 0.002, Name: "Perlachturm & Rathaus (Court)"},
				{Lat: cLat - 0.003, Lon: cLon - 0.002, Name: "Oberhausen Handwerk (Workshop)"},
				{Lat: cLat + 0.004, Lon: cLon - 0.004, Name: "Rotes Tor Wasserwerk (Mill)"},
				{Lat: cLat - 0.004, Lon: cLon + 0.004, Name: "Fuggerei Siedlung (Home)"},
				{Lat: cLat + 0.006, Lon: cLon + 0.006, Name: "Siebentischwald Forstbetrieb (Forest)"},
			}
			req.RoadNodes = []GeoPoint{
				{Lat: cLat - 0.010, Lon: cLon}, {Lat: cLat + 0.010, Lon: cLon},
				{Lat: cLat, Lon: cLon - 0.010}, {Lat: cLat, Lon: cLon + 0.010},
			}
			req.WaterNodes = []GeoPoint{
				{Lat: cLat - 0.010, Lon: cLon + 0.006},
				{Lat: cLat, Lon: cLon + 0.004},
				{Lat: cLat + 0.010, Lon: cLon + 0.002},
			}
		}
	}

	// Apply vector layers to terrain matrix
	s.interactionMu.Lock()
	s.osmDataLoaded = true
	s.centerLatLon = fmt.Sprintf("%.4f° N, %.4f° E", req.CenterLat, req.CenterLon)

	// Reset terrain matrix to clean green grass landscape for vector map
	for y := 0; y < s.worldHeight; y++ {
		for x := 0; x < s.worldWidth; x++ {
			s.terrain[y][x] = string(TerrainGrass)
			s.objects[y][x] = WorldObject{Type: "", Amount: 0, MaxAmount: 0}
		}
	}

	// 1. Bake continuous river channels between water nodes
	for i := 0; i < len(req.WaterNodes); i++ {
		wn := req.WaterNodes[i]
		tx0, ty0 := s.LatLonToTile(wn.Lat, wn.Lon, req.CenterLat, req.CenterLon)

		for dy := -2; dy <= 2; dy++ {
			for dx := -2; dx <= 2; dx++ {
				ny := wrap(ty0+dy, s.worldHeight)
				nx := wrap(tx0+dx, s.worldWidth)
				s.terrain[ny][nx] = string(TerrainWater)
			}
		}

		if i > 0 {
			prevWn := req.WaterNodes[i-1]
			txPrev, tyPrev := s.LatLonToTile(prevWn.Lat, prevWn.Lon, req.CenterLat, req.CenterLon)
			rasterizeLine(txPrev, tyPrev, tx0, ty0, s.worldWidth, s.worldHeight, func(lx, ly int) {
				for dy := -1; dy <= 1; dy++ {
					for dx := -1; dx <= 1; dx++ {
						ny := wrap(ly+dy, s.worldHeight)
						nx := wrap(lx+dx, s.worldWidth)
						s.terrain[ny][nx] = string(TerrainWater)
					}
				}
			})
		}
	}

	// 2. Bake continuous road networks between road nodes
	for i := 0; i < len(req.RoadNodes); i++ {
		rn := req.RoadNodes[i]
		tx0, ty0 := s.LatLonToTile(rn.Lat, rn.Lon, req.CenterLat, req.CenterLon)

		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				ny := wrap(ty0+dy, s.worldHeight)
				nx := wrap(tx0+dx, s.worldWidth)
				s.terrain[ny][nx] = string(TerrainRoad)
			}
		}

		if i > 0 {
			prevRn := req.RoadNodes[i-1]
			txPrev, tyPrev := s.LatLonToTile(prevRn.Lat, prevRn.Lon, req.CenterLat, req.CenterLon)
			rasterizeLine(txPrev, tyPrev, tx0, ty0, s.worldWidth, s.worldHeight, func(lx, ly int) {
				for dy := -1; dy <= 1; dy++ {
					for dx := -1; dx <= 1; dx++ {
						ny := wrap(ly+dy, s.worldHeight)
						nx := wrap(lx+dx, s.worldWidth)
						s.terrain[ny][nx] = string(TerrainRoad)
					}
				}
			})
		}
	}

	// 3. Bake points of interest & settlements
	for _, gp := range req.GeoPoints {
		tx, ty := s.LatLonToTile(gp.Lat, gp.Lon, req.CenterLat, req.CenterLon)
		tType := string(TerrainHome)
		objType := "homestead"

		if strings.Contains(gp.Name, "(Market)") || strings.Contains(gp.Name, "Markt") {
			tType = string(TerrainMarket)
			objType = "marketplace"
		} else if strings.Contains(gp.Name, "(Court)") || strings.Contains(gp.Name, "Gericht") || strings.Contains(gp.Name, "Rathaus") || strings.Contains(gp.Name, "Burg") || strings.Contains(gp.Name, "Schloss") {
			tType = string(TerrainCourt)
			objType = "courtroom"
		} else if strings.Contains(gp.Name, "(Mill)") || strings.Contains(gp.Name, "Mühle") {
			tType = string(TerrainMill)
			objType = "mill"
		} else if strings.Contains(gp.Name, "(Workshop)") || strings.Contains(gp.Name, "Werkstatt") || strings.Contains(gp.Name, "Handwerk") {
			tType = string(TerrainWorkshop)
			objType = "workshop"
		} else if strings.Contains(gp.Name, "(Forest)") || strings.Contains(gp.Name, "Forst") || strings.Contains(gp.Name, "Garten") || strings.Contains(gp.Name, "Park") {
			tType = string(TerrainForest)
			objType = "wildberries"
		}

		s.terrain[ty][tx] = tType
		s.objects[ty][tx] = WorldObject{Type: objType, Amount: 100, MaxAmount: 100}

		// Surround POI with settlements & roads
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				if dx == 0 && dy == 0 {
					continue
				}
				ny := wrap(ty+dy, s.worldHeight)
				nx := wrap(tx+dx, s.worldWidth)
				if (dx == 0 || dy == 0) && s.terrain[ny][nx] == string(TerrainGrass) {
					s.terrain[ny][nx] = string(TerrainRoad)
				} else if s.terrain[ny][nx] == string(TerrainGrass) {
					s.terrain[ny][nx] = string(TerrainHome)
					s.objects[ny][nx] = WorldObject{Type: "homestead", Amount: 100, MaxAmount: 100}
				}
			}
		}
	}

	// Move active agents to city center
	centerTileX, centerTileY := s.LatLonToTile(req.CenterLat, req.CenterLon, req.CenterLat, req.CenterLon)
	for i := range s.agents {
		s.agents[i].Position = Position{X: wrap(centerTileX+(i%3)-1, s.worldWidth), Y: wrap(centerTileY+(i/3)-1, s.worldHeight)}
		s.agents[i].Target = s.agents[i].Position
		s.agents[i].Status = fmt.Sprintf("Erkundet Vektorkarte (%.4f, %.4f)", req.CenterLat, req.CenterLon)
	}

	s.interactionMu.Unlock()

	// Update imported maps catalog & activate this map
	s.mapSourcesMu.Lock()
	for i := range s.importedMaps {
		s.importedMaps[i].IsActive = false
	}
	mapID := fmt.Sprintf("map-%d", time.Now().UnixNano())
	mapName := req.MapName
	if mapName == "" {
		mapName = fmt.Sprintf("Vektorkarte (%.4f° N, %.4f° E)", req.CenterLat, req.CenterLon)
	}
	srcName := "OpenStreetMap Overpass API"
	if req.SourceID != "" {
		for _, ms := range s.mapSources {
			if ms.ID == req.SourceID {
				srcName = ms.Name
				break
			}
		}
	}
	newImpMap := ImportedMap{
		ID:           mapID,
		Name:         mapName,
		SourceID:     req.SourceID,
		SourceName:   srcName,
		CenterLat:    req.CenterLat,
		CenterLon:    req.CenterLon,
		CenterLatLon: s.centerLatLon,
		PoisCount:    len(req.GeoPoints),
		RoadsCount:   len(req.RoadNodes),
		WaterCount:   len(req.WaterNodes),
		ImportedAt:   time.Now().Format("2006-01-02 15:04"),
		IsActive:     true,
	}
	s.importedMaps = append([]ImportedMap{newImpMap}, s.importedMaps...)
	s.mapSourcesMu.Unlock()

	s.addEvent(fmt.Sprintf("🗺️ OSM Vektorkarte '%s' geladen! Zentrum: %s", mapName, s.centerLatLon))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"osmLoaded":    true,
		"centerLatLon": s.centerLatLon,
		"importedMap":  newImpMap,
	})
}

// GraphLang P2P Knowledge Graph Handlers
func (s *Sim) handleSyncGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var newEdge GraphEdge
	if err := json.NewDecoder(r.Body).Decode(&newEdge); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	newEdge.Timestamp = time.Now().Format("15:04:05")

	s.graphMu.Lock()
	// Prevent duplicate edges
	found := false
	for i, e := range s.graphEdges {
		if e.Source == newEdge.Source && e.Target == newEdge.Target && e.Topic == newEdge.Topic {
			s.graphEdges[i].Weight += newEdge.Weight
			s.graphEdges[i].Timestamp = newEdge.Timestamp
			found = true
			break
		}
	}
	if !found {
		s.graphEdges = append(s.graphEdges, newEdge)
	}
	s.graphMu.Unlock()

	s.addEvent(fmt.Sprintf("🕸️ GraphLang Kante synchronisiert: %s -> %s (%s)", newEdge.Source, newEdge.Target, newEdge.Topic))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleGetGraphEdges(w http.ResponseWriter, r *http.Request) {
	s.graphMu.RLock()
	edges := make([]GraphEdge, len(s.graphEdges))
	copy(edges, s.graphEdges)
	s.graphMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(edges)
}

// Decentralized Brain-Node Registration
func (s *Sim) handleRegisterBrainNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var node BrainNode
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	node.LastSeen = time.Now().Format("15:04:05")
	if node.Status == "" {
		node.Status = "ACTIVE"
	}

	s.graphMu.Lock()
	updated := false
	for i, n := range s.brainNodes {
		if n.ID == node.ID || n.URL == node.URL {
			s.brainNodes[i] = node
			updated = true
			break
		}
	}
	if !updated {
		s.brainNodes = append(s.brainNodes, node)
	}
	s.graphMu.Unlock()

	s.addEvent(fmt.Sprintf("🧠 Dezentraler Brain-Node registriert: %s (%s)", node.ID, node.URL))
	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleGetBrainNodes(w http.ResponseWriter, r *http.Request) {
	s.graphMu.RLock()
	nodes := make([]BrainNode, len(s.brainNodes))
	copy(nodes, s.brainNodes)
	s.graphMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

// Infinite Dynamic Sector Generation Helper
func (s *Sim) EnsureSectorGenerated(secX, secY int) {
	pos := Position{X: secX, Y: secY}
	s.sectorsMu.Lock()
	defer s.sectorsMu.Unlock()

	if s.sectors == nil {
		s.sectors = make(map[Position]bool)
	}
	if s.sectors[pos] {
		return
	}
	s.sectors[pos] = true

	if secX < s.minSectorX {
		s.minSectorX = secX
	}
	if secX > s.maxSectorX {
		s.maxSectorX = secX
	}
	if secY < s.minSectorY {
		s.minSectorY = secY
	}
	if secY > s.maxSectorY {
		s.maxSectorY = secY
	}

	s.addEvent(fmt.Sprintf("🌐 Neuer unendlicher Sektor (%d, %d) dynamisch ins Sharding-Raster eingebunden!", secX, secY))
}
