# IA3 SimWorld - YAML Configuration System Architecture

**Date**: 2026-08-30  
**Status**: 🚀 Design Complete, Implementation Starting  
**Scope**: Go, Python, TypeScript config loaders with profiles and stage overlays

---

## System Overview

Three layers of configuration:
1. **Base Configuration** (`config/defaults/*.yaml`) - shipped with repo, version-controlled
2. **Stage Overlays** (`config/stages/{dev-lokal,dev-mk,prod-mk}/*.yaml`) - environment-specific (NOT in version control)
3. **Simulation Profiles** (`config/profiles/*.yaml`) - pre-built world scenarios

**Merging Order** (Highest → Lowest Priority):
```
Environment Variables (NODE_ID=ia3-2, PROFILE=small-test)
       ↓
Runtime State (state/domain_settings.json - user edits)
       ↓
Stage Override (config/stages/dev-lokal/config.yaml)
       ↓
Simulation Profile (config/profiles/small-test.yaml)
       ↓
Defaults (config/defaults/*.yaml)
```

---

## Directory Structure (Filesystem)

```
ia3simworld/
├── config/
│   ├── defaults/                  # Base configuration (version-controlled)
│   │   ├── ports.yaml             # ✅ Created
│   │   ├── world.yaml             # ✅ Created
│   │   ├── ui.yaml                # ✅ Created
│   │   ├── node.yaml              # TODO
│   │   ├── ai.yaml                # TODO
│   │   └── domain-settings.yaml   # TODO
│   │
│   ├── profiles/                  # Pre-built simulation configurations
│   │   ├── small-test.yaml        # 512×512, fast
│   │   ├── medium-standard.yaml   # 2560×2560, default
│   │   ├── large-federated.yaml   # Multi-node setup
│   │   └── perf-benchmark.yaml    # Load test (50 agents)
│   │
│   ├── stages/                    # Environment-specific overrides (NOT git-tracked)
│   │   ├── dev-lokal/             # Direct host development
│   │   │   └── config.yaml        # Override: ports, no Ollama, fast polling
│   │   ├── dev-mk/                # Minikube development
│   │   │   └── config.yaml        # Override: K8s ports, service URLs
│   │   └── prod-mk/               # Production Minikube
│   │       └── config.yaml        # Override: conservative, monitored
│   │
│   └── .gitignore                 # Ignore stages/ (environment secrets)
│
├── state/                         # Runtime state (NOT version-controlled)
│   ├── domain_settings.json       # User-edited domain modes
│   ├── sector_claims.json         # Federation sector ownership
│   └── .gitignore
│
├── config/README.md               # ✅ Created (user guide)
├── docs/CONFIG_ARCHITECTURE.md    # This file
├── docs/CONFIG_USAGE.md           # TODO (practical guide)
│
└── apps/
    ├── world-sim/
    │   ├── config/
    │   │   └── config.go          # TODO (koanf loader)
    │   └── main.go                # TODO (load config)
    ├── api-gateway/
    │   └── main.go                # TODO (load config)
    ├── agent-service/
    │   ├── config.py              # TODO (pydantic + yaml)
    │   └── main.py                # TODO (load config)
    └── web-client/
        ├── lib/config.ts          # TODO (TypeScript loader)
        └── pages/index.tsx        # TODO (use config)
```

---

## Configuration Files Schema

### config/defaults/ports.yaml
**Purpose**: All service ports (direct and Kubernetes)  
**Usage**: Loaded by all services  
**Change Frequency**: Rarely (unless adding new services)

```yaml
ports:
  direct_host:
    node_1:
      api_gateway: 17080
      world_sim: 17081
      agent_service_grpc: 50051
      web_client: 12000
    # ... node_2, node_3
  minikube:
    node_1:
      api_gateway_external: 18080
      # ... etc
  infrastructure:
    postgres: 5432
    redis: 6379
    ollama: 11434
```

### config/defaults/world.yaml
**Purpose**: World generation and simulation timing  
**Usage**: world-sim service  
**Change Frequency**: Medium (testing different world sizes)

```yaml
world:
  width: 2560
  height: 2560
  terrain: { ... }
  settlements: { ... }
  tick_rate_ms: 200
  ticks_per_game_week: 50400
  agents_per_node: 5
  behavior: { ... }
```

### config/defaults/ui.yaml
**Purpose**: Frontend polling and rendering  
**Usage**: web-client service  
**Change Frequency**: High (performance tuning)

```yaml
ui:
  polling:
    compact_interval_ms: 1000
    full_state_interval_ms: 5000
  map:
    viewport_culling_enabled: false
    default_zoom: 2
  components:
    admin_board:
      render_event_feed: true
```

### config/defaults/node.yaml
**Purpose**: Node identity and federation  
**Usage**: world-sim, api-gateway  
**Change Frequency**: Never (per-node, set via ENV)

```yaml
node:
  id: "ia3-1"
  federation:
    master_url: ""
    master_node_id: "ia3-1"
  assigned_sector:
    x: 0
    y: 0
  heartbeat_interval_ms: 10000
```

### config/defaults/ai.yaml
**Purpose**: Ollama and agent service settings  
**Usage**: world-sim service  
**Change Frequency**: Medium (Ollama URL, model, timeouts)

```yaml
ai:
  ollama:
    enabled: true
    base_url: "http://localhost:11434"
    model: "llama3.2:latest"
    timeout_ms: 8000
  agents:
    decide_period_ticks: 10
    grpc_addr: "localhost:50051"
    grpc_timeout_ms: 3000
```

### config/defaults/domain-settings.yaml
**Purpose**: Social Threefolding domain settings  
**Usage**: world-sim service  
**Change Frequency**: Medium (mode changes, quotas)

```yaml
domains:
  economy:
    mode: "full"  # full | restricted | off
    quota_per_window: 20
    window_size_ticks: 100
  court:
    mode: "full"
  geistesleben:
    mode: "full"
```

---

## Simulation Profiles

Profiles are **complete world configurations** that can be selected at startup.

### Profile Structure

```yaml
# config/profiles/small-test.yaml
profile:
  name: "small-test"
  description: "Quick test world (512×512, 2 agents, 50ms ticks)"
  based_on: ""  # If empty: override defaults directly
  
  world:
    width: 512
    height: 512
    tick_rate_ms: 50
    agents_per_node: 2
  
  ui:
    polling:
      compact_interval_ms: 2000  # Slower polling for smaller world
  
  ai:
    ollama:
      enabled: false  # No LLM needed for testing
```

### Profile Usage

```bash
# Start with small-test profile
export PROFILE=small-test
go run ./apps/world-sim

# Start with medium-standard (default)
export PROFILE=medium-standard
go run ./apps/world-sim

# Start with custom profile
export PROFILE=perf-benchmark
go run ./apps/world-sim
```

### Predefined Profiles

| Name | Size | Ticks | Agents | Use Case | Load Time |
|------|------|-------|--------|----------|-----------|
| `small-test` | 512×512 | 50ms | 2 | Unit tests | ~3 sec |
| `medium-standard` | 2560×2560 | 200ms | 5 | Default dev | ~20 sec |
| `large-federated` | 2560×2560 | 200ms | 5 | 3-node cluster | ~20 sec |
| `perf-benchmark` | 2560×2560 | 50ms | 50 | Load test | ~30 sec |

---

## Stage Overlays (Environment-Specific)

Stages override base configuration for specific **deployment environments**.

### Stage: dev-lokal (Direct Host Development)

```yaml
# config/stages/dev-lokal/config.yaml
# Overrides for local development on one machine

ports:
  direct_host:
    node_1:
      api_gateway: 17080
      world_sim: 17081
      # ... (same as defaults, for reference)

ai:
  ollama:
    enabled: false  # Ollama not running locally
    
ui:
  polling:
    compact_interval_ms: 5000  # 5x slower polling for dev
    full_state_interval_ms: 10000
```

### Stage: dev-mk (Minikube Development)

```yaml
# config/stages/dev-mk/config.yaml
# Overrides for Minikube development cluster

ports:
  minikube:
    node_1:
      api_gateway_external: 18080
      web_client_external: 13000
      api_gateway_internal: "api-gateway:8080"

ai:
  ollama:
    base_url: "http://ollama:11434"  # K8s service name
    
deployment:
  mode: "kubernetes"
  namespace: "ia3"
```

### Stage: prod-mk (Production Minikube)

```yaml
# config/stages/prod-mk/config.yaml
# Conservative settings for production

ai:
  agents:
    grpc_timeout_ms: 10000  # Longer timeout in prod
  ollama:
    timeout_ms: 15000

ui:
  polling:
    compact_interval_ms: 10000  # Even slower in prod
    
deployment:
  mode: "kubernetes"
  namespace: "ia3"
  replicas: 3  # High availability
```

---

## Configuration Loading (Per Service)

### Go Services (world-sim, api-gateway)

**Library**: `koanf` (simple, powerful YAML + ENV merging)

```go
// apps/world-sim/config/config.go
package config

import (
    "github.com/knadh/koanf/v2"
    "github.com/knadh/koanf/parsers/yaml"
    "github.com/knadh/koanf/providers/file"
    "github.com/knadh/koanf/providers/env"
)

type Config struct {
    Ports  PortsConfig  `koanf:"ports"`
    World  WorldConfig  `koanf:"world"`
    UI     UIConfig     `koanf:"ui"`
    Node   NodeConfig   `koanf:"node"`
    AI     AIConfig     `koanf:"ai"`
}

func LoadConfig() (*Config, error) {
    k := koanf.New(".")
    
    // 1. Load defaults
    k.Load(file.Provider("config/defaults/ports.yaml"), yaml.Parser())
    k.Load(file.Provider("config/defaults/world.yaml"), yaml.Parser())
    // ... load all defaults
    
    // 2. Overlay stage (if STAGE env var set)
    stage := os.Getenv("STAGE") // dev-lokal, dev-mk, prod-mk
    if stage != "" {
        k.Load(file.Provider(fmt.Sprintf("config/stages/%s/config.yaml", stage)), yaml.Parser())
    }
    
    // 3. Overlay profile (if PROFILE env var set)
    profile := os.Getenv("PROFILE") // small-test, medium-standard
    if profile != "" {
        k.Load(file.Provider(fmt.Sprintf("config/profiles/%s.yaml", profile)), yaml.Parser())
    }
    
    // 4. Override with env vars (highest priority)
    k.Load(env.Provider("", ".", func(s string) string {
        return strings.ReplaceAll(s, "_", ".") // NODE_ID → node.id
    }), nil)
    
    var cfg Config
    k.Unmarshal("", &cfg)
    return &cfg, nil
}
```

**Usage in main.go**:
```go
cfg, err := config.LoadConfig()
if err != nil {
    log.Fatalf("Failed to load config: %v", err)
}

port := cfg.Ports.DirectHost.Node1.APIGateway
worldSim := cfg.World.TickRateMs
```

### Python Services (agent-service)

**Library**: `pydantic` + `yaml` (type-safe, validation)

```python
# apps/agent-service/config.py
from pydantic import BaseModel, Field
import yaml
import os
from pathlib import Path

class PortsConfig(BaseModel):
    agent_service_grpc: int = 50051

class AIConfig(BaseModel):
    ollama_base_url: str = "http://localhost:11434"
    grpc_timeout_ms: int = 3000

class AppConfig(BaseModel):
    ports: PortsConfig = Field(default_factory=PortsConfig)
    ai: AIConfig = Field(default_factory=AIConfig)

def load_config():
    # 1. Load defaults
    with open("config/defaults/ai.yaml") as f:
        defaults = yaml.safe_load(f)
    
    # 2. Overlay stage
    stage = os.getenv("STAGE", "dev-lokal")
    stage_file = f"config/stages/{stage}/config.yaml"
    if Path(stage_file).exists():
        with open(stage_file) as f:
            stage_config = yaml.safe_load(f)
            defaults = merge_yaml(defaults, stage_config)
    
    # 3. Overlay profile
    profile = os.getenv("PROFILE", "medium-standard")
    profile_file = f"config/profiles/{profile}.yaml"
    if Path(profile_file).exists():
        with open(profile_file) as f:
            profile_config = yaml.safe_load(f)
            defaults = merge_yaml(defaults, profile_config)
    
    # 4. Parse and return
    return AppConfig(**defaults)
```

### TypeScript/Next.js (web-client)

**Approach**: Load config at build time or runtime

```typescript
// apps/web-client/lib/config.ts
interface UIConfig {
  polling: {
    compact_interval_ms: number;
    full_state_interval_ms: number;
  };
  map: {
    default_zoom: number;
  };
}

export async function loadUIConfig(): Promise<UIConfig> {
  // Option 1: Load from environment (build time)
  return {
    polling: {
      compact_interval_ms: parseInt(
        process.env.NEXT_PUBLIC_COMPACT_POLLING_MS || "1000"
      ),
      full_state_interval_ms: parseInt(
        process.env.NEXT_PUBLIC_FULL_POLLING_MS || "5000"
      ),
    },
    map: {
      default_zoom: 2,
    },
  };
}

// Option 2: Load from API (runtime)
export async function fetchUIConfig(): Promise<UIConfig> {
  const res = await fetch("/api/admin/config");
  return res.json();
}
```

---

## Environment Variables (Highest Priority)

Any config value can be overridden with ENV vars using snake_case paths:

```bash
# Port configuration
export PORTS__DIRECT_HOST__NODE_1__API_GATEWAY=17080

# World configuration
export WORLD__WIDTH=512
export WORLD__HEIGHT=512
export WORLD__TICK_RATE_MS=50

# Profile selection (overrides entire profile)
export PROFILE=small-test

# Stage selection (applies stage overlay)
export STAGE=dev-lokal

# Node identity
export NODE__ID=ia3-2
export NODE__ASSIGNED_SECTOR__X=1
export NODE__ASSIGNED_SECTOR__Y=0
```

---

## Configuration Merging Algorithm

Koanf and our Python/TS loaders follow this **merging strategy**:

```
Merge Levels (Highest → Lowest):
  1. ENV vars (NODE__ID=ia3-2)
  2. Runtime state (state/domain_settings.json - user edits persist)
  3. Profile overlay (config/profiles/small-test.yaml)
  4. Stage overlay (config/stages/dev-lokal/config.yaml)
  5. Defaults (config/defaults/*.yaml)

Example: WORLD WIDTH
  - config/defaults/world.yaml: width: 2560
  - config/profiles/small-test.yaml: width: 512  (overrides → 512)
  - config/stages/dev-lokal/config.yaml: (no override, stays 512)
  - ENV: WORLD__WIDTH=256  (overrides → 256)
  - RESULT: 256
```

---

## Configuration Validation

Each service validates config on load:

```go
// Go validation
if cfg.World.Width < 256 || cfg.World.Width > 4096 {
    return fmt.Errorf("world width must be 256-4096, got %d", cfg.World.Width)
}
if cfg.World.TickRateMs < 10 || cfg.World.TickRateMs > 1000 {
    return fmt.Errorf("tick rate must be 10-1000ms, got %d", cfg.World.TickRateMs)
}
```

---

## Backward Compatibility

**Existing ENV vars** are supported through name mapping:

```
NODE_ID                 → NODE.ID
WORLD_SIM_URL           → WORLD_SIM.URL
MASTER_URL              → NODE.FEDERATION.MASTER_URL
OLLAMA_BASE_URL         → AI.OLLAMA.BASE_URL
API_GATEWAY_PORT        → PORTS.DIRECT_HOST.NODE_1.API_GATEWAY
```

Services can continue using ENV vars during migration period.

---

## .gitignore Updates

```bash
# config/.gitignore
stages/          # Environment-specific (not shared)
profiles/local/  # Local-only profiles (optional)

# repo root .gitignore additions
state/           # Runtime state (domain_settings.json, sector_claims.json)
```

---

## Migration Path (Per Service)

### Phase 1: Load Config Alongside ENV
```go
// Both ENV and config work during transition
cfg, _ := config.LoadConfig()
port := os.Getenv("API_GATEWAY_PORT")  // Try ENV first
if port == "" {
    port = strconv.Itoa(cfg.Ports.DirectHost.Node1.APIGateway)  // Fall back to config
}
```

### Phase 2: Config Primary, ENV Override
```go
// Config is primary, ENV vars override
cfg, _ := config.LoadConfig()
port := cfg.Ports.DirectHost.Node1.APIGateway
// ENV vars already merged into cfg by koanf
```

### Phase 3: Config Only
```go
// Config only - no raw ENV var access
cfg, _ := config.LoadConfig()
port := cfg.Ports.DirectHost.Node1.APIGateway
```

---

## Quick Reference: How to Use

### As Developer: Start Small World
```bash
cd ia3simworld
export STAGE=dev-lokal
export PROFILE=small-test
./scripts/dev/start.sh 1
```

### As DevOps: Deploy to Minikube
```bash
export STAGE=dev-mk
export PROFILE=medium-standard
make dev-up
```

### As DevOps: Load Test
```bash
export STAGE=dev-mk
export PROFILE=perf-benchmark
make dev-up
```

### Troubleshooting: Check Merged Config
```bash
# (Future) API endpoint
curl http://localhost:17080/admin/config | jq

# For now: Print in logs
# Go: cfg.PrintYAML()
# Python: print(config.model_dump_json())
```

---

## See Also

- `config/README.md` - User guide
- `docs/CONFIG_USAGE.md` - TODO (practical examples)
- `docs/AGENTS.md` - Project overview
