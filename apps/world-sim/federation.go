package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// registerHandlersFederation adds the federation-related HTTP routes to the mux.
func (s *Sim) registerHandlersFederation() {
	// Master-side: nodes register here and receive their sector assignment
	http.HandleFunc("/control/register-node", s.handleRegisterNode)
	// All nodes: list all sector claims known to this node
	http.HandleFunc("/control/sector-claims", s.handleSectorClaims)
	// Worker nodes call this to claim a newly discovered sector
	http.HandleFunc("/control/claim-sector", s.handleClaimSector)
	// Master calls this on all known nodes to announce a new sector claim
	http.HandleFunc("/control/announce-sector", s.handleAnnounceSector)
	// List all registered nodes (master-side)
	http.HandleFunc("/control/known-nodes", s.handleKnownNodes)
}

// ─── Master-side: node registration ────────────────────────────────────────

// handleRegisterNode is called by a new worker node on the master.
// It assigns the next free neighboring sector and returns it.
func (s *Sim) handleRegisterNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var reg NodeRegistration
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if reg.NodeID == "" || reg.NodeURL == "" {
		http.Error(w, "nodeId and nodeUrl required", http.StatusBadRequest)
		return
	}

	// Register the node
	s.knownNodesMu.Lock()
	found := false
	for _, n := range s.knownNodes {
		if n.NodeID == reg.NodeID {
			found = true
			break
		}
	}
	if !found {
		s.knownNodes = append(s.knownNodes, reg)
	}
	s.knownNodesMu.Unlock()

	// Assign next free sector
	assigned := s.assignNextFreeSector(reg.NodeID, reg.NodeURL)

	s.addEvent(fmt.Sprintf("🌐 [Federation] Node '%s' (%s) registriert → Sektor (%d, %d) zugewiesen",
		reg.NodeID, reg.NodeURL, assigned.SectorX, assigned.SectorY))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(NodeAssignment{
		NodeID:   reg.NodeID,
		SectorX:  assigned.SectorX,
		SectorY:  assigned.SectorY,
		Assigned: true,
	})
}

// assignNextFreeSector finds the next unclaimed sector adjacent to any existing claim
// and claims it for the given node.
func (s *Sim) assignNextFreeSector(nodeID, nodeURL string) SectorClaim {
	s.sectorClaimsMu.Lock()
	defer s.sectorClaimsMu.Unlock()

	// BFS-style: expand outward from (0,0) to find the first unclaimed position
	radius := 1
	for radius < 100 {
		for dy := -radius; dy <= radius; dy++ {
			for dx := -radius; dx <= radius; dx++ {
				if abs(dx) != radius && abs(dy) != radius {
					continue // only check the border ring
				}
				pos := Position{X: dx, Y: dy}
				if _, taken := s.sectorClaims[pos]; !taken {
					claim := SectorClaim{
						SectorX:      dx,
						SectorY:      dy,
						OwnerNodeID:  nodeID,
						OwnerURL:     nodeURL,
						DiscoveredAt: s.tick.Load(),
						DiscoveredBy: "master-assignment",
					}
					s.sectorClaims[pos] = claim
					s.persistSectorClaims()
					return claim
				}
			}
		}
		radius++
	}

	// Fallback: assign (time-based) to avoid blocking
	pos := Position{X: int(time.Now().UnixNano() % 50), Y: int(time.Now().UnixNano() % 50)}
	claim := SectorClaim{
		SectorX:      pos.X,
		SectorY:      pos.Y,
		OwnerNodeID:  nodeID,
		OwnerURL:     nodeURL,
		DiscoveredAt: s.tick.Load(),
		DiscoveredBy: "master-assignment-fallback",
	}
	s.sectorClaims[pos] = claim
	s.persistSectorClaims()
	return claim
}

// ─── Sector claims ──────────────────────────────────────────────────────────

func (s *Sim) handleSectorClaims(w http.ResponseWriter, r *http.Request) {
	s.sectorClaimsMu.RLock()
	claims := make([]SectorClaim, 0, len(s.sectorClaims))
	for _, c := range s.sectorClaims {
		claims = append(claims, c)
	}
	s.sectorClaimsMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claims)
}

// handleClaimSector is called by a worker node when one of its native agents
// discovers and generates a new neighboring sector.
func (s *Sim) handleClaimSector(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var claim SectorClaim
	if err := json.NewDecoder(r.Body).Decode(&claim); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	pos := Position{X: claim.SectorX, Y: claim.SectorY}
	s.sectorClaimsMu.Lock()
	if _, exists := s.sectorClaims[pos]; !exists {
		s.sectorClaims[pos] = claim
		s.persistSectorClaims()
	}
	existing := s.sectorClaims[pos]
	s.sectorClaimsMu.Unlock()

	s.addEvent(fmt.Sprintf("🗺️ [Federation] Sektor (%d,%d) beansprucht von %s (entdeckt von %s)",
		claim.SectorX, claim.SectorY, claim.OwnerNodeID, claim.DiscoveredBy))

	// If we are the master, broadcast to all known nodes
	if s.isMaster {
		go s.broadcastSectorClaim(existing)
	} else {
		// Forward to master
		go s.reportSectorClaimToMaster(existing)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

// handleAnnounceSector receives a sector claim announcement from the master.
func (s *Sim) handleAnnounceSector(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var claim SectorClaim
	if err := json.NewDecoder(r.Body).Decode(&claim); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	pos := Position{X: claim.SectorX, Y: claim.SectorY}
	s.sectorClaimsMu.Lock()
	s.sectorClaims[pos] = claim
	s.persistSectorClaims()
	s.sectorClaimsMu.Unlock()

	w.WriteHeader(http.StatusOK)
}

func (s *Sim) handleKnownNodes(w http.ResponseWriter, r *http.Request) {
	s.knownNodesMu.RLock()
	nodes := make([]NodeRegistration, len(s.knownNodes))
	copy(nodes, s.knownNodes)
	s.knownNodesMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

// ─── Federation helpers ─────────────────────────────────────────────────────

// registerAtMaster registers this node at the master and applies the assigned sector.
func (s *Sim) registerAtMaster() error {
	if s.isMaster {
		// Master registers itself
		s.knownNodesMu.Lock()
		ownURL := getenv("OWN_URL", "")
		found := false
		for _, n := range s.knownNodes {
			if n.NodeID == s.nodeID {
				found = true
				break
			}
		}
		if !found {
			s.knownNodes = append(s.knownNodes, NodeRegistration{NodeID: s.nodeID, NodeURL: ownURL})
		}
		s.knownNodesMu.Unlock()
		log.Printf("[Federation] This node (%s) is the master. Sector (%d,%d) self-assigned.",
			s.nodeID, s.assignedSectorX, s.assignedSectorY)
		return nil
	}

	reg := NodeRegistration{
		NodeID:  s.nodeID,
		NodeURL: getenv("OWN_URL", ""),
	}
	body, _ := json.Marshal(reg)

	masterRegURL := s.masterURL + "/control/register-node"
	resp, err := http.Post(masterRegURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("POST %s: %w", masterRegURL, err)
	}
	defer resp.Body.Close()

	var assignment NodeAssignment
	if err2 := json.NewDecoder(resp.Body).Decode(&assignment); err2 != nil {
		return fmt.Errorf("decode assignment: %w", err2)
	}

	if assignment.Assigned {
		s.assignedSectorX = assignment.SectorX
		s.assignedSectorY = assignment.SectorY
		// Claim own sector
		s.sectorClaimsMu.Lock()
		s.sectorClaims[Position{X: assignment.SectorX, Y: assignment.SectorY}] = SectorClaim{
			SectorX:      assignment.SectorX,
			SectorY:      assignment.SectorY,
			OwnerNodeID:  s.nodeID,
			OwnerURL:     reg.NodeURL,
			DiscoveredAt: 0,
			DiscoveredBy: "master-assignment",
		}
		s.sectorClaimsMu.Unlock()
		s.addEvent(fmt.Sprintf("✅ [Federation] Am Master registriert → Sektor (%d,%d) zugewiesen",
			assignment.SectorX, assignment.SectorY))
		log.Printf("[Federation] Registered at master %s → assigned sector (%d,%d)",
			s.masterURL, assignment.SectorX, assignment.SectorY)
	}
	return nil
}

// broadcastSectorClaim sends a sector claim to all known nodes (called by master).
func (s *Sim) broadcastSectorClaim(claim SectorClaim) {
	body, _ := json.Marshal(claim)
	s.knownNodesMu.RLock()
	nodes := make([]NodeRegistration, len(s.knownNodes))
	copy(nodes, s.knownNodes)
	s.knownNodesMu.RUnlock()

	client := &http.Client{Timeout: 1 * time.Second}
	for _, n := range nodes {
		if n.NodeID == s.nodeID || n.NodeURL == "" {
			continue
		}
		url := n.NodeURL + "/control/announce-sector"
		go func(u string) {
			resp, err := client.Post(u, "application/json", bytes.NewReader(body))
			if err == nil {
				resp.Body.Close()
			}
		}(url)
	}
}

// reportSectorClaimToMaster sends a new sector claim to the master node.
func (s *Sim) reportSectorClaimToMaster(claim SectorClaim) {
	if s.masterURL == "" {
		return
	}
	body, _ := json.Marshal(claim)
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Post(s.masterURL+"/control/claim-sector", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Federation] Failed to report sector claim to master: %v", err)
		return
	}
	resp.Body.Close()
}

// persistSectorClaims writes sector claims to disk (must be called with sectorClaimsMu held or after).
func (s *Sim) persistSectorClaims() {
	claims := make([]SectorClaim, 0, len(s.sectorClaims))
	for _, c := range s.sectorClaims {
		claims = append(claims, c)
	}
	data, err := json.MarshalIndent(claims, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile("sector_claims.json", data, 0644)
}

// sectorClaimsSlice returns a copy of all sector claims (safe for snapshots).
func (s *Sim) sectorClaimsSlice() []SectorClaim {
	s.sectorClaimsMu.RLock()
	defer s.sectorClaimsMu.RUnlock()
	out := make([]SectorClaim, 0, len(s.sectorClaims))
	for _, c := range s.sectorClaims {
		out = append(out, c)
	}
	return out
}

// discoverNewSector is called when a native agent steps into an unclaimed sector.
// It generates terrain for that sector and claims it.
func (s *Sim) discoverNewSector(sectorX, sectorY int, agentName string) {
	pos := Position{X: sectorX, Y: sectorY}

	s.sectorClaimsMu.Lock()
	if _, exists := s.sectorClaims[pos]; exists {
		s.sectorClaimsMu.Unlock()
		return // already claimed
	}
	claim := SectorClaim{
		SectorX:      sectorX,
		SectorY:      sectorY,
		OwnerNodeID:  s.nodeID,
		OwnerURL:     getenv("OWN_URL", ""),
		DiscoveredAt: s.tick.Load(),
		DiscoveredBy: agentName,
	}
	s.sectorClaims[pos] = claim
	s.persistSectorClaims()
	s.sectorClaimsMu.Unlock()

	s.addEvent(fmt.Sprintf("🧭 [Entdeckung] %s hat Sektor (%d,%d) erstmalig betreten und generiert! Node %s übernimmt Verwaltung.",
		agentName, sectorX, sectorY, s.nodeID))

	// Register sector in the EnsureSectorGenerated index
	s.EnsureSectorGenerated(sectorX, sectorY)

	// Report to master (or broadcast if we are master)
	if s.isMaster {
		go s.broadcastSectorClaim(claim)
	} else {
		go s.reportSectorClaimToMaster(claim)
	}
}
