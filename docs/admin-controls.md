# Admin Controls & Master Node Operations

This document describes the administrative controls available in the IA3 SimWorld platform, with special attention to **Master-Only** features that are only accessible on the primary node (`ia3-1`).

## Overview

Admin controls are accessed via the **Admin Panel** in the web UI (`/pages/index.tsx`, tab `activeTab === "admin"`). The Admin Panel is rendered by the `AdminBoard` component.

### Master Node Requirement

Several critical admin features **only work on the Master node** (`ia3-1`):
- World Regeneration
- Ollama KI Provider Settings
- Collective Scenario Engine

**Why?** These features affect the entire world state and must be coordinated from a single authoritative source (the Master). Satellite nodes (ia3-2, ia3-3, etc.) cannot trigger world-wide changes.

---

## Features

### 1. World Regeneration (Master Only)

**Location:** Admin Panel → Card "⚙️ Simulation & Landscape Settings"  
**Availability:** Master node only (`ownNodeName === "ia3-1"`)  
**Button:** `🔄 Save & Regenerate Landscape`

**What it does:**
- Triggers terrain regeneration with current settings (River Width, Lake Density, Wildberry Density)
- Resets all terrain tiles to newly generated values
- Resets all settlements and infrastructure placements
- Resets all agent positions (agents respawn at settlement centers)
- Maintains agent identities (agent data persists, only positions change)

**How to use:**
1. Adjust terrain sliders if desired:
   - River Width: 1-5 (default: 4)
   - Lake Density: 0.10-0.35 (default: 0.20)
   - Wildberry Density: 0.05-0.50 (default: 0.25)
2. Click `🔄 Save & Regenerate Landscape`
3. Confirm: Modal "⚠️ Weltkarte neu generieren?" appears
4. Click `Ja, Neu Generieren 🔄` to confirm

**Technical Details:**
- Endpoint: `POST /api/control/regenerate`
- Phases tracked in state:
  - `genPhase`: Current phase (Seen, Vegetation, Siedlungen, Infrastruktur, Fertig)
  - `genProgress`: Percentage (0-100)
  - `generating`: Boolean flag (true while generating)
- Duration: ~2-5 seconds per regeneration (depends on world size)

**Important Notes:**
- World Regeneration is **Master-only** for a reason
- Satellite nodes cannot call this endpoint to avoid conflicts
- All connected clients will see the new world on their next refresh
- Events logged: "World simulation initialized with NxN grid..."

---

### 2. Ollama KI Provider Settings (Master Only)

**Location:** Admin Panel → Card "🦙 Ollama KI Provider & GameMaster KIs"  
**Availability:** Master node only (`ownNodeName === "ia3-1"`)

**Settings:**
- **Ollama Provider Status:** Enable/Disable Ollama LLM backend
- **Betriebsmodus (Mode):** Selectable operation modes
- **Base URL:** Ollama server location (default: `http://localhost:11434`)
- **Model:** LLM model name (default: `llama3.2:latest`)
- **Timeout:** Response timeout in milliseconds (default: 8000ms)

**GameMaster KI Rate Settings:**
- **Relic Spawn Rate:** How often relics are spawned (default: 80)
- **Law Propose Rate:** How often new laws are proposed (default: 140)
- **Econ Event Rate:** How often economic events occur (default: 100)
- **Artifact Quality:** Quality level of generated artifacts (default: 100)

**Why Master-Only?**
- These settings affect AI behavior across all agents in the world
- Changing mid-simulation can cause inconsistencies
- Configuration should be synchronized before world generation

---

### 3. Collective Scenario Engine (Master Only)

**Location:** Admin Panel → Card "🎭 Collective Scenario Engine"  
**Availability:** Master node only (`ownNodeName === "ia3-1"`)

**Current Scenarios:**
1. **Festival (Autumn Solstice)**
   - Button: `🎉 Trigger Autumn Solstice Festival`
   - Endpoint: `POST /api/control/trigger-scenario`
   - Payload: `{ "scenario": "festival" }`
   - Effect: All agents pause individual behaviors and gather at a central location

**What happens:**
- Agents receive status: `"Traveling to Autumn Solstice Festival 🎉"`
- Agents move toward scenario target (centrally placed on grass terrain)
- Events logged for each agent and scenario progression

**Why Master-Only?**
- Scenarios are **world-wide events** that must be synchronized across all nodes
- Only Master can ensure all connected clients see the same event
- Prevents conflicts from simultaneous scenario triggers on different nodes

---

## Node Identification

The current implementation uses node naming:
- **Master Node:** `ia3-1` (primary, authoritative)
- **Satellite Nodes:** `ia3-2`, `ia3-3`, etc. (read-only, cannot trigger world changes)

This is checked in the UI via:
```typescript
// AdminBoard.tsx, line 452
{!connectedRemoteURL && ownNodeName === "ia3-1" && (
  <div>
    {/* Master-only admin cards */}
  </div>
)}
```

---

## API Endpoints

All admin control endpoints are prefixed with `/api/control/` (routed through API Gateway) or `/control/` (direct to world-sim).

### World Regeneration
```bash
POST /api/control/regenerate
Content-Type: application/json

# No request body required
# Response: { "status": "generating" }
```

### Trigger Scenario
```bash
POST /api/control/trigger-scenario
Content-Type: application/json

{
  "scenario": "festival"  // Currently only "festival" is supported
}

# Response: HTTP 200 OK
```

### Update Manager Settings (Ollama & KI)
```bash
POST /api/control/update-manager-settings
Content-Type: application/json

{
  "ollamaEnabled": true,
  "ollamaBaseUrl": "http://localhost:11434",
  "ollamaModel": "llama3.2:latest",
  "ollamaMode": "gamemaster_all",
  "ollamaTimeoutMs": 8000,
  "relicSpawnRate": 80,
  "lawProposeRate": 140,
  "econEventRate": 100,
  "artifactQuality": 100
}

# Response: HTTP 200 OK
```

---

## Frontend Component Structure

Admin Panel UI is rendered in `apps/web-client/components/AdminBoard.tsx`:

```typescript
export function AdminBoard({
  state,
  onRefresh,
  settings,
  updateSettings,
  managerSettings,
  updateManagerSettings,
  regenerate,           // World regeneration handler
  triggerScenario,      // Scenario trigger handler
  selectedAdminAgent,
  setSelectedAdminAgent,
  ownNodeName,          // Current node name
  connectedRemoteURL,   // Remote cluster connection
  setActiveTab
})
```

**Master-Only Visibility:**
```typescript
{!connectedRemoteURL && ownNodeName === "ia3-1" && (
  // Render Card 1: Simulation & Landscape Settings
  // Render Card 2: Ollama KI Provider
  // Render Card 3: Collective Scenario Engine
)}
```

---

## Troubleshooting

### "Regenerate Button is not visible"
- **Check Node:** Ensure you're on the Master node (`ia3-1`), not a satellite
- **Check Connection:** Ensure `connectedRemoteURL` is empty (not connected to remote cluster)
- **Check URL:** Admin panel is accessed via `activeTab === "admin"` in the main menu

### "Regeneration doesn't start"
- **Check Endpoint:** Verify `POST /api/control/regenerate` is accessible
  ```bash
  curl -X POST http://localhost:17080/api/control/regenerate
  ```
- **Check Logs:** Review world-sim console for `genPhase` changes
- **Check State:** Poll `/api/state` to see `generating: true` and `genProgress` increasing

### "Ollama Settings don't take effect"
- **Check Ollama:** Verify Ollama server is running at specified URL
  ```bash
  curl http://localhost:11434/api/tags
  ```
- **Check Model:** Verify the specified model is installed in Ollama
- **Fallback:** If Ollama is disabled or unreachable, rules-based logic is used automatically

---

## Future Enhancements

- [ ] Multi-node scenario synchronization (gossip protocol for scenario events)
- [ ] Agent-specific admin commands (teleport, modify inventory, etc.)
- [ ] Undo/Redo for world regenerations
- [ ] Scheduled world regenerations (automated maintenance)
- [ ] Admin dashboard with metrics (agent count, event count, generation time, etc.)

---

**Last Updated:** 2026-08-30  
**Version:** 1.0  
**Status:** Production-Ready
