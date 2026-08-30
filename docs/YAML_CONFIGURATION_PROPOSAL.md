# YAML Configuration System Proposal

**Proposal Date**: 2026-08-29  
**Status**: 🎯 Ready for Implementation  
**Priority**: High (Enables future feature scaling)

---

## Executive Summary

Currently ~25 configurable settings are SCATTERED across:
- ❌ 8 in ENV vars (lost on restart)
- ❌ 13 hardcoded (need recompile)
- ❌ 4 in JSON files (persist, but scattered)

**Proposed**: Centralized YAML configuration system with:
- ✅ Single `config/` directory (all settings in one place)
- ✅ 5 default YAML files (organized by domain)
- ✅ 4 fixture files (pre-built world templates: small, medium, large, federated)
- ✅ Dev/Prod separation (config/dev/, config/prod/)
- ✅ 18 newly persistent settings (no recompile needed)

**Result**: 18 additional persistent settings, fixtures, clean separation.

---

## Current Persistence State

| Category | Count | Current | Persistent? |
|----------|-------|---------|-------------|
| **Environment** | 8 | ENV vars | ❌ Lost on restart |
| **Hardcoded** | 13 | Code | ❌ Requires recompile |
| **JSON Files** | 4 | domain_settings.json, etc. | ✅ Persist |
| **Frontend Only** | 3 | React state | ❌ Lost on refresh |
| **Total** | ~25 | Mixed | ~16% persist |

---

## Proposed Directory Structure

```
ia3simworld/
├── config/                               # Configuration management
│   ├── defaults/                         # Base configuration (shipped with repo)
│   │   ├── world.yaml                    # World generation (size, terrain, settlements, ticks)
│   │   ├── node.yaml                     # Node/federation identity
│   │   ├── ai.yaml                       # Ollama, agent decision-making
│   │   ├── domain-settings.yaml          # Economy, Court, Geistesleben modes
│   │   └── ui.yaml                       # Frontend polling, animation, rendering
│   │
│   ├── fixtures/                         # Pre-built world configurations
│   │   ├── small-test.yaml               # 512×512, 4 agents, 50ms ticks (quick test)
│   │   ├── medium-standard.yaml          # 2560×2560, 8 agents, 200ms ticks (default)
│   │   ├── large-federated.yaml          # Multi-node setup (3 nodes, assigned sectors)
│   │   └── performance-benchmark.yaml    # 2560×2560, 50 agents, 50ms ticks (load test)
│   │
│   ├── dev/                              # Development environment
│   │   ├── config.yaml                   # Ollama disabled, faster polling, verbose logging
│   │   └── federation-3nodes.yaml        # Local 3-node cluster config
│   │
│   ├── prod/                             # Production environment
│   │   ├── config.yaml                   # Conservative timeouts, efficient polling
│   │   └── federation-cloud.yaml         # Cloud cluster setup
│   │
│   └── README.md                         # How to use configuration system
│
├── state/                                # Runtime state (✌️ in .gitignore)
│   ├── domain_settings.json              # User-changed domain modes (persisted)
│   ├── sector_claims.json                # Federation sector ownership
│   └── savegame.json                     # World snapshot (manual save)
│
└── apps/
    ├── world-sim/
    │   └── config/config.go              # Config loader (NEW)
    └── ...
```

---

## YAML File Templates

### config/defaults/world.yaml

```yaml
# World Generation & Performance
world:
  width: 2560
  height: 2560
  
  terrain:
    riverWidth: 3
    lakesDensity: 0.28
    berriesDensity: 0.25
    grassThreshold: 0.4
    forestThreshold: 0.7
  
  settlements:
    count: 4
    minDistance: 70
    homesteadRadius: 4-6
  
  tickRateMs: 200          # 5 ticks/sec
  maxAgentsPerNode: 1000
```

### config/defaults/node.yaml

```yaml
# Node Identity & Federation
node:
  id: "ia3-1"
  
  federation:
    masterUrl: ""          # Empty = this node is master
    masterNodeId: "ia3-1"
  
  assignedSector:
    x: 0
    y: 0
  
  heartbeatIntervalMs: 10000
```

### config/defaults/ai.yaml

```yaml
# AI/LLM Configuration
ai:
  ollama:
    enabled: true
    baseUrl: "http://localhost:11434"
    model: "llama3.2:latest"
    timeoutMs: 8000
    mode: "gamemaster_all"
  
  agents:
    decidePeriodTicks: 10
    grpcAddr: "localhost:50051"
    grpcTimeoutMs: 3000
```

### config/defaults/domain-settings.yaml

```yaml
# Social Threefolding Domains
domains:
  economy:
    mode: "full"             # full, restricted, off
    quotaPerWindow: 20
    windowSizeTicks: 100
    coreActionsOnly: false
  
  court:
    mode: "full"
    quotaPerWindow: 10
    windowSizeTicks: 100
  
  geistesleben:
    mode: "full"
    quotaPerWindow: 10
    windowSizeTicks: 100
```

### config/defaults/ui.yaml

```yaml
# Frontend Configuration
ui:
  polling:
    compactInterval: 300    # ms (agents/events only)
    fullStateInterval: 2000  # ms (full terrain)
    generationPollInterval: 100
  
  map:
    defaultZoom: 2
    tileSize: 32
    maxAgentsDisplay: 100
  
  animation:
    fpsTarget: 60
    idlePauseMs: 5000
```

### config/fixtures/small-test.yaml

```yaml
# Quick Test (512×512, fast)
world:
  width: 512
  height: 512
  tickRateMs: 50           # 20 ticks/sec

node:
  id: "test-1"

ai:
  ollama:
    enabled: false         # No LLM needed for testing
```

---

## Configuration Merge Strategy

**Precedence** (Highest → Lowest):
1. **ENV vars** – `NODE_ID=ia3-2`, `WORLD_WIDTH=1024`
2. **Runtime state** – state/domain_settings.json (user changes)
3. **Environment override** – config/dev/config.yaml
4. **Defaults** – config/defaults/*.yaml

**Example**:
```
config/defaults/world.yaml: width=2560 → BASE
config/dev/config.yaml: width=512 → OVERRIDE (dev environment)
ENV: WORLD_WIDTH=256 → HIGHEST PRECEDENCE
Final: width=256
```

---

## Persistence After Migration

| Setting | Before | After | Location |
|---------|--------|-------|----------|
| World size | ENV (lost) | ✅ Persistent | config/defaults/world.yaml |
| Tick rate | Hardcoded (recompile) | ✅ Editable | config/defaults/world.yaml |
| Terrain params | Hardcoded (recompile) | ✅ Editable | config/defaults/world.yaml |
| Node ID | ENV (lost) | ✅ Persistent | config/defaults/node.yaml |
| Master URL | ENV (lost) | ✅ Persistent | config/defaults/node.yaml |
| Ollama URL | ENV (lost) | ✅ Persistent | config/defaults/ai.yaml |
| Domain modes | ✅ JSON | ✅ JSON | state/domain_settings.json |
| Sector claims | ✅ JSON | ✅ JSON | state/sector_claims.json |
| Savegame | ✅ JSON | ✅ JSON | state/savegame.json |

**Summary**: +18 settings newly persistent, 0 recompiles needed ever again.

---

## Implementation Phases

### Phase A: Scaffolding (2.5 hours)
- Create directory structure
- Write 5 default YAML files
- Write 4 fixture YAML files
- Write 3 environment-specific overrides

### Phase B: Go Config Loader (1.75 hours)
- Create `config/config.go` with LoadConfig()
- Implement YAML loading & merging
- Update main.go to use cfg struct
- Test loading with different env/fixture combinations

### Phase C: Runtime Config API (1 hour)
- Add HTTP endpoints: GET/POST /admin/config
- Implement persistence to state/config-runtime.json
- Add config reload endpoint

### Phase D: Fixtures & Testing (1.5 hours)
- Test all 4 fixtures (small/medium/large/federated)
- Benchmark fixture (load test)
- Document fixture usage

### Phase E: Documentation (0.5-1 hour)
- Write docs/configuration.md
- Write docs/fixtures.md
- Update config/README.md

**Total**: 7-8 hours (can be split across sessions)

---

## Quick Start (Next 30 min)

1. Create `config/defaults/world.yaml` – 5 min
2. Create `config/fixtures/small-test.yaml` – 5 min
3. Create `apps/world-sim/config.go` – 10 min
4. Update `apps/world-sim/main.go` – 10 min
5. Test: `go run .` – 5 min

**Result**: Basic YAML loading works, framework in place for full implementation.

---

## Benefits

| Benefit | Impact | Example |
|---------|--------|---------|
| **No Recompile** | Faster iteration | Change tick rate, restart, done (vs. recompile + rebuild) |
| **Dev/Prod Sep** | Safer deployments | Ollama disabled in dev, required in prod |
| **Fixtures** | Quick scenarios | 512×512 test in 10 sec vs. 2560×2560 default in 30 sec |
| **Understandable** | Onboarding easy | New dev: "Read config/ directory" vs. "Search codebase" |
| **Scalable** | Add 50 settings | Just add to YAML, no code changes |
| **Reproducible** | Share configs | Fixtures version-controlled with code |

---

## Decision Points

- ✅ **Use YAML?** Yes (human-readable, industry standard, gopkg.in/yaml.v3 available)
- ✅ **Merge strategy?** Priority chain: ENV → runtime → env-override → defaults
- ✅ **Runtime API?** Yes (GET/POST /admin/config for future web UI)
- ✅ **Fixtures?** Yes (small-test, medium-standard, large-federated, perf-benchmark)
- ✅ **Persist where?** state/ directory (gitignored, separate from version-controlled config/)

---

## Next Actions

**To Proceed**:
1. Approve proposed structure (this document)
2. Start Phase A (Scaffolding) – 30 min to directory + files
3. Start Phase B (Loader) – 1.75 hours to full integration
4. Rest of phases as time allows

**Questions**:
- Any settings missing from the proposed list?
- Should we move domain_settings.json into state/ directory? (Yes, recommended)
- Should we version-control fixture files? (Yes, as templates)

