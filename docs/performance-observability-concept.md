# Performance Observability – Minimal Instrumentation Concept

Last updated: 2026-08-30

## Goal

We do not want broad, noisy logging everywhere. The goal is to measure exactly where the real CPU, memory, and latency costs happen, and to do it in a way that is cheap enough to keep running during local benchmark sessions.

The rule is simple:
- measure the hot path,
- log only the interesting changes,
- keep the overhead low,
- make the data useful enough to drive the next optimization.

---

## Design principles

1. Measure where the work actually happens
   - world-sim tick loop,
   - state snapshot generation,
   - gRPC calls to agent-service,
   - API gateway forwarding,
   - browser render/poll path.

2. Prefer counters and timings over verbose logs
   - Log duration of expensive operations.
   - Log only when threshold is exceeded or at a low cadence.

3. Keep hot-path logging sample-based
   - Do not log every tick in the main sim loop.
   - Log summary every 5-10 seconds or once per threshold crossing.

4. Separate metrics from logs
   - Use counters/timers in code.
   - Use structured log lines only for events that need context.

5. Make the instrumentation easy to disable
   - A simple env toggle like `LOG_PERF=1` should enable more detailed output.

---

## Where to instrument

### 1) World simulation – hot path

Primary measurements:
- tick duration
- state snapshot duration
- world generation duration
- gRPC call duration
- time spent in agent update loop
- total memory footprint

Why:
- This is the highest-value place for CPU diagnosis.
- It is where the main idle churn and large world costs are visible.

Recommended metrics:
- `sim.tick.duration_ms`
- `sim.state.snapshot_ms`
- `sim.grpc.call_ms`
- `sim.grpc.call_count`
- `sim.state.request_count`
- `sim.mem.alloc_mb`

Log policy:
- every tick: no
- every 5s or when `duration_ms > threshold`: yes

Example Go pattern:
```go
start := time.Now()
s.advanceAgents(currentTick)
stepMs := time.Since(start).Milliseconds()
if stepMs > 5 || currentTick%50 == 0 {
    log.Printf("[perf] sim tick=%d advanceAgents_ms=%d agents=%d", currentTick, stepMs, len(s.agents))
}
```

For state snapshots:
```go
start := time.Now()
state := s.snapshotStateCompact()
stateSnapshotMs := time.Since(start).Milliseconds()
s.lastStateSnapshotMs.Store(stateSnapshotMs)
if stateSnapshotMs > 20 {
    log.Printf("[perf] state snapshot slow: %dms compact=%t", stateSnapshotMs, true)
}
```

---

### 2) Agent-service – decision layer

Primary measurements:
- duration of `DecideActions`
- total number of decision requests
- payload size / agent count per request
- model/backend call duration if Ollama is enabled
- duplicate suppression count

Why:
- This is the expensive logic layer behind agent behavior.
- It often looks harmless in the UI but can spike CPU in the Python side.

Recommended metrics:
- `agent.decide.duration_ms`
- `agent.decide.request_count`
- `agent.decide.agent_count`
- `agent.decide.payload_bytes`
- `agent.decide.ollama_ms`

Log policy:
- only when request exceeds 50-100ms
- or once every 10-20 requests in debug mode

---

### 3) API gateway – request path

Primary measurements:
- `/api/state` latency
- request counts per route
- response size
- upstream errors
- forwarding overhead

Why:
- The gateway is the place where we see if the UI is asking too much or too often.
- It also exposes whether the main issue is backend CPU or frontend polling pattern.

Recommended metrics:
- `gateway.request_ms`
- `gateway.route.state.count`
- `gateway.route.state.bytes`
- `gateway.upstream.error_count`

Log policy:
- summary every 10s for route totals
- detailed per-request logs only for `>250ms` calls

---

### 4) Web client – browser side

Primary measurements:
- render duration of the map canvas
- polling latency
- fetch duration for `/api/state?compact=true`
- JS heap usage (where supported)
- number of re-renders / repeated map draws
- network payload bytes per request

Why:
- This is the place to find browser CPU spikes and redundant UI work.
- The browser can still be slow even if backend is efficient.

Recommended metrics:
- `ui.poll.latency_ms`
- `ui.state.fetch_ms`
- `ui.map.render_ms`
- `ui.map.tiles_drawn`
- `ui.heap.used_mb`

Log policy:
- no per-frame logs
- sample one render duration every few seconds
- log if render time exceeds 16ms for multiple frames or 50ms for a single frame

Example TypeScript pattern:
```ts
const renderStart = performance.now();
// canvas draw work
const renderMs = performance.now() - renderStart;
if (renderMs > 16 && Math.random() < 0.05) {
  console.warn("[perf] map render slow", { renderMs, zoom, tiles: visibleTileCount });
}
```

---

## Logging levels and cadence

### INFO / summary logs
Use for high-level snapshots only.

Examples:
- tick latency summary,
- average state snapshot time,
- total gRPC calls,
- UI average fetch latency.

Cadence:
- every 10-30s in local dev
- only when `LOG_PERF=1` or benchmark mode is enabled

### WARN / threshold logs
Use for slow operations or unusual patterns.

Examples:
- `/api/state` taking 200ms repeatedly,
- gRPC call > 200ms,
- render frame > 20ms,
- memory usage rising continuously.

### DEBUG / noisy traces
Keep this disabled by default.

Only enable in a benchmark session when we need exact hot-path data.

---

## Recommended implementation pattern

### A) Use structured counters in Go and JS
Not free-form logs every call.

Go example:
```go
s.lastTickDurationMs.Store(int64(durationMs))
s.grpcCallCount.Add(1)
```

JS example:
```ts
const perf = { lastTickDurationMs: 0, totalGrpcCalls: 0 };
```

### B) Use a small summary logger
A single helper function should centralize logging and rate limiting.

Example:
```go
func logPerf(event string, value int64, threshold int64) {
    if value <= threshold {
        return
    }
    log.Printf("[perf] %s=%dms threshold=%dms", event, value, threshold)
}
```

### C) Keep logs human-readable but compact
Recommended format:
```text
[perf] sim tick=4821 advanceAgents_ms=8 stateSnapshot_ms=17 grpc_ms=42 grpc_calls=1
```

This is enough to be useful without becoming log spam.

---

## What to monitor in this project specifically

### Must-have for the current benchmark
1. `sim.tick.duration_ms`
2. `sim.state.snapshot_ms`
3. `sim.grpc.call_ms`
4. `ui.state.fetch_ms`
5. `ui.map.render_ms`
6. `sim.mem.alloc_mb`

### Nice-to-have later
1. API request bytes per route
2. current active Poll interval
3. map viewport tiles drawn per frame
4. number of duplicate thought entries suppressed
5. state cache hit ratio

---

## Suggested local benchmark flow

1. Start with `PROFILE=perf-benchmark`
2. Enable `LOG_PERF=1`
3. Let the sim run for 30-60 seconds without user interaction
4. Capture the summary logs
5. Compare:
   - tick time,
   - snapshot time,
   - gRPC time,
   - render time.
6. Tune the hot path based on the largest persistent value

---

## Final recommendation

For this repo, the best compromise is:
- small structured logs,
- counters for totals,
- timers for slow operations,
- summary snapshots every few seconds,
- no per-frame logging,
- no broad text logging in the render loop or sim loop.

This keeps observability useful without becoming a second performance problem.

The next optimization step after this concept should be to add a minimal `perf` helper in the world-sim and web-client, and then wire it into the exact slow sites that were identified in the benchmark review.
