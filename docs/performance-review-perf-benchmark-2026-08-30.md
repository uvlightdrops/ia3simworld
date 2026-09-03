# Performance Review – Local `perf-benchmark` Run

Last reviewed: 2026-08-30
Scope: local node 1, `PROFILE=perf-benchmark`

## Executive summary

The local `perf-benchmark` run is still a real performance workload, not a quiet idle loop. The current bottleneck pattern is now much clearer than before:

- the backend is no longer churning on every tick because of duplicate Mesa/gRPC calls;
- the browser is no longer polling the full world state continuously;
- but the system is still limited by expensive full-world state handling and large map rendering at 2560x2560 with 50 agents and 20 ticks/sec.

This means the earlier hot path was reduced significantly, but the remaining load is now concentrated in a smaller set of expensive operations:

1. full world-state serialization / deep-copying on tick changes,
2. large map rendering and terrain iteration in the browser,
3. decision-gated gRPC/Mesa calls for the agent logic layer,
4. still-available full-state API responses when the map tab loads or when the UI requests uncompressed state.

## What was already fixed

### 1) Idle CPU churn reduced

The earlier root cause was a combination of:
- unnecessary gRPC decision calls at too many ticks,
- Python manager thought churn,
- repeated duplicate fallback entries.

This was addressed in:
- `apps/world-sim/grpc_client.go`
- `apps/agent-service/main.py`

The change is intentionally gate-based:
- the sim does not call the Python service on every tick,
- duplicate manager thought entries are suppressed,
- the decision flow is now event-driven instead of tick-driven noise.

Status: improved and active.

### 2) Full-state polling reduced

The UI previously had a large cost from full `state` payloads being fetched repeatedly. That was reduced by compact polling and lazy full-state loading:
- `apps/web-client/pages/index.tsx`
- `apps/api-gateway/main.go`

The logic now uses compact polling for live updates and only loads full terrain/object payloads when actually needed.

Status: improved and active.

### 3) Rendering hot path reduced

The frontend was also doing expensive tile processing on every render. The optimization work here includes:
- viewport culling,
- memoized terrain stats,
- idle animation pause,
- lazy terrain loading.

Relevant code:
- `apps/web-client/components/InteractiveWorldMap.tsx`
- `apps/web-client/pages/index.tsx`

Status: improved and active.

### 4) Profile configuration is now respected

The profile bug was fixed, and the runtime config values are now correctly honored. This matters for `perf-benchmark` because the loaded values must match the intended speed and agent count.

Relevant files:
- `config/profiles/perf-benchmark.yaml`
- `apps/world-sim/main.go`
- `apps/agent-service/config.py`

Status: fixed.

## Remaining bottlenecks in the current `perf-benchmark` setup

### A) Full world-state serialization is still expensive on tick transitions

This is still a real backend bottleneck in the world-sim.

Relevant code:
- `apps/world-sim/handlers.go`
- `apps/world-sim/types.go`

The code caches per-tick state, which is a good improvement, but when the world tick changes, the sim still performs deep copy / serialization work for the full world arrays. For a 2560x2560 map, that is still substantial work.

Why it still matters:
- each tick change still creates large in-memory structures,
- the request path is still not zero-allocation,
- large payload responses are still costly when full state is requested.

Assessment: medium-high bottleneck remains.

### B) Large map rendering remains expensive in the browser

Even with viewport rendering, the world is still huge and the frontend is still drawing a very large scene when the map viewport is open.

Relevant code:
- `apps/web-client/components/InteractiveWorldMap.tsx`

The viewport optimization already reduces the draw count drastically, but the map is still large enough that the visible world can remain expensive under a 20 ticks/sec benchmark.

Assessment: medium bottleneck remains.

### C) Full-state API usage is still an easy performance trap

The compact state path is active, but the system can still fall back to full or expensive state responses when:
- the map tab is opened,
- terrain loads are triggered,
- a UI refresh requests full state,
- the browser hits a route that is not compact-aware.

This does not mean the app is broken; it means the benchmark is still sensitive to the exact UI actions and request pattern.

Assessment: medium bottleneck remains in UI usage patterns.

### D) Agent decision service still has a real cost, but it is now bounded

This is not the original runaway bug anymore, but it remains the major logic-layer hotspot.

Relevant code:
- `apps/world-sim/grpc_client.go`
- `apps/agent-service/main.py`

The current behavior is better than before because:
- the call is gated,
- not every tick triggers a heavy query,
- manager thought churn is suppressed.

However, with 50 agents and a 2560x2560 world, the request still contains meaningful world and agent state and is still a relevant CPU time contributor when active.

Assessment: bounded but still present.

## Are all performance edits fully through?

Short answer: no, not all of them are fully done.

What is complete:
- compact polling,
- idle polling suppression,
- memoized terrain statistics,
- idle animation pause,
- viewport culling,
- per-tick cache for world state snapshots,
- gRPC tick gating,
- duplicate manager-thought suppression,
- profile propagation fix.

What is still not fully closed:
- large world serialization is still heavy at tick boundaries,
- full map rendering still costs meaningful browser CPU,
- WebSocket replacement is still missing,
- there is still no true streaming or delta update layer,
- full-state requests remain a scalability risk under benchmark conditions.

## Recommendation

### Next best improvements

1. Add an explicit `compact`/`delta` mode for the map payload and keep the map/panel UI on a tighter data contract.
2. Reduce full-state response generation by returning only changed tiles or changed agent slices.
3. Move more heavy map work out of the main render thread or reduce render frequency while the map is static.
4. Keep the gRPC decision path gated and add metrics to measure actual call count per minute.
5. Add a simple performance dashboard with:
   - backend tick time,
   - API response time,
   - memory usage,
   - gRPC call count,
   - browser render time.

### Expected status after next pass

After one more focused optimization pass, the system should be able to run comfortably in `perf-benchmark` mode for local smoke tests, but it is still not a production-grade real-time benchmark pipeline yet.

The current code is now in the “hot-path controlled but still large-world expensive” zone, which is much better than the earlier “constant noisy churn” state.

## Final verdict

The earlier severe CPU issue was substantially reduced and the actual root causes were removed.

The remaining bottleneck is now mostly structural and expected for a 2560x2560 world with 50 agents at 20 ticks/sec:
- world-state size,
- map rendering cost,
- remaining full-state API work.

This is no longer a runaway idle bug; it is a benchmark-scale cost profile that still needs optimization work to reach a smooth local `perf-benchmark` experience.
