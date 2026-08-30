# Configuration System Guide

**Last Updated**: 2026-08-30  
**Status**: 🚀 Ready for Use  

---

## Quick Start

### For Most Users
Your configuration is already set up. Just run:

```bash
# Node 1 (Master) - Direct host
./scripts/dev/start.sh 1

# Node 2 (Federated) - Direct host  
./scripts/dev/start.sh 2

# All nodes in Minikube
make dev-up
```

---

## Configuration Files Reference

### Core Configuration (Loaded by all services)

| File | Purpose | Services | Restart? |
|------|---------|----------|----------|
| `defaults/ports.yaml` | All port mappings (direct & K8s) | All | ✅ Yes |
| `defaults/world.yaml` | World size, terrain, agents, ticks | world-sim | ✅ Yes |
| `defaults/ui.yaml` | Frontend polling & rendering | web-client | ✅ Yes |
| `defaults/node.yaml` | Node identity & federation | world-sim, api-gateway | ✅ Yes |
| `defaults/ai.yaml` | Ollama, agent service settings | world-sim | ✅ Yes |

### Environment Overrides

| File | When To Use | Services |
|------|-------------|----------|
| `dev/config.yaml` | Local dev (faster, Ollama disabled) | All services in dev mode |
| `prod/config.yaml` | Production (conservative, optimized) | All services in prod mode |

### Fixture Templates (Pre-built Configurations)

| File | Scenario | Size | Tick Rate | Agents | Use Case |
|------|----------|------|-----------|--------|----------|
| `fixtures/small-test.yaml` | Quick test | 512×512 | 50ms | 2 | Unit tests, fast feedback |
| `fixtures/medium-standard.yaml` | Standard world | 2560×2560 | 200ms | 5 | Default development |
| `fixtures/large-federated.yaml` | 3-node cluster | 2560×2560 | 200ms | 5 each | Federation testing |
| `fixtures/performance-benchmark.yaml` | Load test | 2560×2560 | 50ms | 50 | Performance analysis |

---

## How to Use Configuration

### 1. Start with Defaults
Services load from `config/defaults/*.yaml`:
```bash
cd apps/world-sim
go run .  # Reads config/defaults/*.yaml
```

### 2. Override for Development
To run a quick test with smaller world:
```bash
# Copy fixture to dev override
cp config/fixtures/small-test.yaml config/dev/config.yaml

# Then restart service - it loads dev override automatically
go run . 
```

### 3. Use Environment Variables (Highest Priority)
Environment variables override all YAML files:
```bash
export NODE_ID=ia3-2
export WORLD_WIDTH=512
export TICK_RATE_MS=50

go run .  # Loads defaults, then overrides with ENV vars
```

### 4. Check Current Configuration
```bash
# (Future) API endpoint will show merged config
curl http://localhost:17080/admin/config

# For now: check the YAML files manually
cat config/defaults/ports.yaml
cat config/defaults/world.yaml
```

---

## Performance Tuning (UI Responsiveness)

### Problem: UI is slow or unresponsive

**Step 1: Increase polling intervals** (Best first fix)
```yaml
# config/dev/config.yaml
ui:
  polling:
    compact_interval_ms: 5000    # Was 1000 (5x less traffic)
    full_state_interval_ms: 10000 # Was 5000 (2x less traffic)
```
Restart web-client. Result: 80% reduction in network load.

**Step 2: Disable heavy components**
```yaml
ui:
  components:
    admin_board:
      render_event_feed: false    # Events now on /events page anyway
    interactive_map:
      show_terrain_detail: false  # Only show water/grass
```

**Step 3: Check logs for blocking calls**
```bash
# In world-sim logs, look for slow gRPC calls:
# "gRPC call took 5000ms" = too slow, needs timeout

# Fix: world-sim will respect this config:
ai:
  agents:
    grpc_timeout_ms: 3000  # Timeout after 3 seconds
```

---

## Configuration Merge Order (Highest → Lowest Priority)

```
1. Environment Variables (NODE_ID=ia3-2, WORLD_WIDTH=512, etc.)
   ↓
2. Runtime State (state/domain_settings.json - user edits)
   ↓
3. Environment Override (config/dev/config.yaml or config/prod/config.yaml)
   ↓
4. Defaults (config/defaults/*.yaml)
```

**Example**:
- `config/defaults/ui.yaml` sets `compact_interval_ms: 1000`
- `config/dev/config.yaml` sets `compact_interval_ms: 5000`
- ENV var: `COMPACT_INTERVAL_MS=2000`
- **Result**: 2000ms (ENV wins)

---

## Per-Node Configuration (Federation)

Each node reads its own identity:

```yaml
# config/defaults/node.yaml
node:
  id: "ia3-1"
  assigned_sector:
    x: 0
    y: 0
```

For Node 2:
```bash
export NODE_ID=ia3-2
export SECTOR_X=1
export SECTOR_Y=0

go run .  # Reads defaults, overrides with ENV
```

---

## Adding New Configuration

Want to add a new setting? (e.g., `max_buildings_per_settlement`)

**1. Add to YAML file**:
```yaml
# config/defaults/world.yaml
settlements:
  count: 4
  max_buildings_per_settlement: 20  # NEW
```

**2. Update Go struct**:
```go
// apps/world-sim/config.go
type SettlementsConfig struct {
  Count int `yaml:"count"`
  MaxBuildingsPerSettlement int `yaml:"max_buildings_per_settlement"`
}
```

**3. Use in code**:
```go
cfg := LoadConfig()
maxBuildings := cfg.World.Settlements.MaxBuildingsPerSettlement
```

**4. No recompile needed** ✅
Just update YAML and restart service.

---

## Troubleshooting

### "config/defaults/world.yaml not found"
**Problem**: Service can't find config directory  
**Solution**: Run from repo root:
```bash
cd /path/to/ia3simworld
go run ./apps/world-sim
```

### "port 17080 already in use"
**Problem**: Another service using the port  
**Solution**: 
```bash
# Check what's using the port
lsof -i :17080

# Option 1: Kill the process
kill <PID>

# Option 2: Change port in config
export API_GATEWAY_PORT=17090
go run ./apps/api-gateway
```

### "YAML unmarshaling error"
**Problem**: Syntax error in YAML file  
**Solution**: 
- Check indentation (YAML is strict about spacing)
- Use online YAML validator: https://www.yamllint.com/
- Common errors: unquoted strings with special chars, tabs instead of spaces

### Settings not taking effect
**Problem**: Changed config but service doesn't reflect changes  
**Solution**:
- **Restart the service** (config is only read at startup)
- Check that you edited the right file (is it being read?)
- Verify ENV vars aren't overriding YAML (check: `echo $NODE_ID`)

---

## Real-World Examples

### Example 1: Reduce UI lag during testing
```bash
# Create dev config
cat > config/dev/config.yaml << 'EOF'
ui:
  polling:
    compact_interval_ms: 5000
    full_state_interval_ms: 10000
world:
  tick_rate_ms: 50  # Faster world for testing
EOF

# Start services
./scripts/dev/start.sh 1
# UI will be more responsive with 5-10 second polling instead of 1 second
```

### Example 2: Test with small world
```bash
cp config/fixtures/small-test.yaml config/dev/config.yaml
./scripts/dev/start.sh 1

# World is now 512×512 (16x smaller)
# Ticks every 50ms (4x faster)
# Startup: ~5 seconds instead of 30 seconds
```

### Example 3: Local 3-node federation
```bash
cp config/fixtures/large-federated.yaml config/dev/config.yaml

# Start Node 1
export NODE_ID=ia3-1
export SECTOR_X=0 SECTOR_Y=0
./scripts/dev/start.sh 1

# Start Node 2
export NODE_ID=ia3-2
export SECTOR_X=1 SECTOR_Y=0
./scripts/dev/start.sh 2

# Start Node 3
export NODE_ID=ia3-3
export SECTOR_X=0 SECTOR_Y=1
./scripts/dev/start.sh 3
```

---

## See Also

- [AGENTS.md](../AGENTS.md) - Project overview & runtime info
- [ARCHITECTURE_REFACTORING_PLAN.md](../ARCHITECTURE_REFACTORING_PLAN.md) - Full refactoring roadmap
- [YAML_CONFIGURATION_PROPOSAL.md](../YAML_CONFIGURATION_PROPOSAL.md) - Design rationale
