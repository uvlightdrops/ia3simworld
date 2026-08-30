# IA3 SimWorld Code Reorganization & Performance Audit

**Status**: 🔴 URGENT - UI Performance Degradation  
**Date**: 2026-08-30  
**Owner**: DevOps / Architecture Review

---

## Problem Statement

**User Report**: "Die UI ist fast nicht ansprechbar"

**Root Cause Analysis**: Multiple architectural issues identified:

### 1. Scattered Port Configuration (20+ locations)
**Hardcoded Ports**:
- `17080`: API Gateway (hardcoded in ~5 files)
- `17081`: World Sim (hardcoded in ~4 files)
- `12000`: Web Client dev port (hardcoded in ~3 files)
- `50051`: gRPC Agent Service (hardcoded in ~4 files)
- `18080`: Minikube Gateway (Makefile + docs)
- `13000`: Minikube Web UI (Makefile + docs)

**Files with hardcoded ports**:
```
apps/web-client/types/sim.ts
apps/web-client/pages/index.tsx
apps/web-client/pages/events.tsx
apps/web-client/components/AdminBoard.tsx
apps/web-client/components/FooterBar.tsx
apps/api-gateway/main.go
apps/world-sim/grpc_client.go
apps/world-sim/handlers.go
apps/agent-service/main.py
Makefile
docs/AGENTS.md
```

**Impact**: 
- Hard to scale
- Hard to deploy
- Hard to debug network issues
- Changes require recompilation

### 2. Configuration Persistence (Only ~16% persistent)
**Current State**:
- 8 ENV vars (lost on restart) ❌
- 13 hardcoded (need recompile) ❌
- 4 JSON files (persist, scattered) ✅
- 3 frontend-only (lost on refresh) ❌

**Needs**:
- Centralized YAML config system (proposed in docs/YAML_CONFIGURATION_PROPOSAL.md)
- Config directory structure
- Fixture templates for different scenarios

### 3. UI Responsiveness Issues
**Potential Bottlenecks**:
1. **Polling Strategy**: HTTP polling every 1 second might be too frequent
2. **State Management**: Large state objects re-rendering entire UI
3. **gRPC Blocking**: Agent service gRPC calls might block UI thread
4. **AdminBoard Performance**: Complex conditional rendering, too many network calls
5. **Map Rendering**: Canvas/SVG rendering performance (2560×2560 tiles)
6. **Bundle Size**: Next.js bundle might be too large for initial load

---

## Proposed Solution

### Phase 1: Configuration System (High Impact, Low Risk)
**Timeline**: 1-2 days

#### 1.1 Create config/ Directory Structure
```bash
config/
├── defaults/
│   ├── ports.yaml          # All port mappings
│   ├── world.yaml          # World generation params
│   ├── node.yaml           # Node/federation identity
│   ├── ai.yaml             # Ollama, agent settings
│   └── domain-settings.yaml # Economy, Court, Geistesleben
├── fixtures/
│   ├── small-test.yaml     # 512×512, 4 agents, quick test
│   ├── medium-standard.yaml # 2560×2560, default config
│   ├── large-federated.yaml # 3-node setup
│   └── performance-benchmark.yaml # Load test config
├── dev/
│   ├── config.yaml         # Dev settings (Ollama off, faster polling)
│   └── federation-3nodes.yaml # Local cluster
├── prod/
│   └── config.yaml         # Production settings
└── config.go               # Go config loader
```

#### 1.2 Port Configuration (ports.yaml)
```yaml
# config/defaults/ports.yaml
ports:
  api_gateway: 17080
  world_sim: 17081
  agent_service_grpc: 50051
  web_client:
    dev: 12000
  minikube:
    api_gateway: 18080
    web_client: 13000
  
  # Per-node mapping (for federation)
  per_node:
    node_1:
      api_gateway: 17080
      world_sim: 17081
      agent_service: 50051
    node_2:
      api_gateway: 17082
      world_sim: 17083
      agent_service: 50052
    node_3:
      api_gateway: 17084
      world_sim: 17085
      agent_service: 50053
```

**Benefits**:
- ✅ Single source of truth for all ports
- ✅ Easy to change in one place
- ✅ Support for multi-node deployments
- ✅ No recompilation needed
- ✅ Clear documentation of port ranges

#### 1.3 Migrate Services to Use YAML Config

**Go Services** (api-gateway, world-sim):
```go
type Config struct {
    Ports    PortsConfig    `yaml:"ports"`
    World    WorldConfig    `yaml:"world"`
    Node     NodeConfig     `yaml:"node"`
    AI       AIConfig       `yaml:"ai"`
}

func LoadConfig(path string) (*Config, error) {
    data, _ := ioutil.ReadFile(path)
    var cfg Config
    yaml.Unmarshal(data, &cfg)
    return &cfg, nil
}
```

**Python Services** (agent-service):
```python
import yaml

with open('config/defaults/ai.yaml') as f:
    config = yaml.safe_load(f)

PORT = config['ports']['agent_service_grpc']
OLLAMA_URL = config['ai']['ollama_base_url']
```

**Frontend** (Next.js):
```typescript
// Load config at build time or via API
const PORTS = {
  API_GATEWAY: process.env.NEXT_PUBLIC_API_GATEWAY_PORT || 17080,
  WORLD_SIM: process.env.NEXT_PUBLIC_WORLD_SIM_PORT || 17081,
};
```

### Phase 2: Performance Audit (High Impact, Medium Effort)
**Timeline**: 1-2 days

#### 2.1 UI Polling Analysis
**Current**:
```typescript
// Polling every 1 second
const interval = setInterval(fetchState, 1000);
```

**Investigation**:
- [ ] Check if polling interval is necessary
- [ ] Measure network payload per poll
- [ ] Identify which components need frequent updates
- [ ] Consider WebSocket for real-time updates

**Optimization Options**:
1. Increase polling interval (2s → 5s)
2. Implement selective polling (only poll changed fields)
3. WebSocket for active components, polling for passive
4. Server-Sent Events (SSE) as middle ground

#### 2.2 Component Re-render Analysis
**AdminBoard.tsx Issues**:
- Large component with 100+ lines of conditional rendering
- Might re-render entire page on small state changes
- Solution: Extract sub-components, use React.memo()

**Map Rendering Issues**:
- InteractiveWorldMap renders 2560×2560 tiles
- No viewport culling (draws all tiles, even off-screen)
- Solution: Implement viewport-based rendering

**Solution**:
```typescript
// Wrap heavy components in React.memo
const AdminCard = React.memo(({ data }) => {
  return <div>{/* expensive rendering */}</div>;
});

// Use useMemo for expensive calculations
const filteredAgents = useMemo(() => {
  return state.agents.filter(...);
}, [state.agents]);
```

#### 2.3 gRPC Connection Analysis
**Current**:
- world-sim → agent-service gRPC sync call
- Blocks if agent-service is slow or unresponsive

**Investigation**:
- [ ] Check gRPC call timeout
- [ ] Measure response times
- [ ] Identify if agent-service is bottleneck

**Optimization**:
```go
// Add timeout to gRPC calls
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
response, err := client.GetAgentBehavior(ctx, &pb.AgentRequest{...})
```

### Phase 3: Configuration Fixtures (Medium Impact, Low Effort)
**Timeline**: 0.5 days

Create pre-built configuration templates:

**small-test.yaml** (quick development):
```yaml
world:
  width: 512
  height: 512
ports:
  api_gateway: 17080
  world_sim: 17081
agents_per_node: 2
tick_rate_ms: 50
```

**medium-standard.yaml** (default):
```yaml
world:
  width: 2560
  height: 2560
ports:
  api_gateway: 17080
  world_sim: 17081
agents_per_node: 5
tick_rate_ms: 200
```

**large-federated.yaml** (3-node cluster):
```yaml
nodes:
  - id: ia3-1
    ports:
      api_gateway: 17080
      world_sim: 17081
  - id: ia3-2
    ports:
      api_gateway: 17082
      world_sim: 17083
  - id: ia3-3
    ports:
      api_gateway: 17084
      world_sim: 17085
```

---

## Implementation Roadmap

### Week 1: Configuration System
- [ ] Create config/ directory structure
- [ ] Write ports.yaml, world.yaml, node.yaml, ai.yaml
- [ ] Create YAML loaders for Go/Python/TypeScript
- [ ] Migrate existing hardcoded values to YAML
- [ ] Add config validation (schema checking)
- [ ] Update CI/CD to package config with builds

### Week 2: Performance Improvements
- [ ] Measure current polling performance
- [ ] Implement viewport culling for map rendering
- [ ] Refactor AdminBoard with React.memo
- [ ] Add request debouncing/throttling
- [ ] Implement gRPC timeouts
- [ ] Profile UI responsiveness

### Week 3: Testing & Documentation
- [ ] Create fixture templates
- [ ] Test with different configs (small, medium, large, federated)
- [ ] Update AGENTS.md with new config instructions
- [ ] Write migration guide for developers
- [ ] Performance benchmarking report

---

## Quick Wins (Can Start Today)

### 1. Create Central Port Configuration
**File**: `config/defaults/ports.yaml`
```yaml
# 10 minutes to create
# 30 minutes to update all files
# Immediate benefit: Single source of truth
```

### 2. Increase Polling Interval
**File**: `apps/web-client/pages/index.tsx`
```typescript
// Change from 1000ms to 5000ms
const interval = setInterval(fetchState, 5000);
// Impact: Reduce network traffic by 80%
```

### 3. Add gRPC Timeout
**File**: `apps/world-sim/grpc_client.go`
```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
// Impact: Prevent UI hangs from slow agent-service
```

### 4. Wrap Heavy Components in React.memo
**File**: `apps/web-client/components/AdminBoard.tsx`
```typescript
export const AdminBoard = React.memo(({ ... }) => {
  // Prevent re-renders unless props change
  return <div>...</div>;
});
// Impact: Reduce unnecessary re-renders by 50-70%
```

---

## Metrics to Track

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| **UI Responsiveness** | Slow | <200ms | Measure: click → response time |
| **Polling Interval** | 1000ms | 5000ms | Settings: `fetchState` interval |
| **Network Payload/sec** | ~500KB/s | ~100KB/s | Monitor: DevTools Network tab |
| **Component Re-renders** | High (unknown) | <5 per second | React DevTools Profiler |
| **gRPC Timeout** | None | 5s | Code: context.WithTimeout |
| **Map Viewport Culling** | No | Yes | Performance: render only visible tiles |

---

## Risk Assessment

### Low Risk
- ✅ Port configuration (read-only, backward compatible)
- ✅ Polling interval adjustment (can revert instantly)
- ✅ Config file structure (no code changes)

### Medium Risk
- ⚠️ Service code refactoring (needs testing)
- ⚠️ UI component memoization (watch for stale props)

### High Risk
- 🔴 Viewport culling (map rendering rewrite needed)
- 🔴 WebSocket migration (requires protocol change)

---

## Next Steps

1. **Immediate** (Today):
   - Approve this plan
   - Create config/ directory
   - Start ports.yaml

2. **This Week**:
   - Migrate all services to YAML config
   - Run performance audit
   - Quick wins: polling interval, gRPC timeout, React.memo

3. **Next Week**:
   - Fix remaining bottlenecks
   - Test with different configs
   - Document and release

---

**Last Updated**: 2026-08-30  
**Status**: Ready for Implementation  
**Priority**: 🔴 CRITICAL (UI responsiveness)
