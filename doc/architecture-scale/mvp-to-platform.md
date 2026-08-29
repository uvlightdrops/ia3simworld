# MVP to Platform Migration

## Current MVP

The current repository already has the right core shape:

- `world-sim` owns state and ticks
- `agent-service` decides actions
- `api-gateway` exposes APIs
- `web-client` renders state
- kicli exists as a separate knowledge system

## Next evolutionary step

Add one shared data contract for identity/profile data.

Then add one async path for importing and syncing that data.

## Migration path

### Phase 1

- Define shared profile schema
- Export from kicli
- Import into ia3simworld

### Phase 2

- Move profile sync into a worker/job
- Add retries and versioning
- Store import results separately from simulation state

### Phase 3

- Add event backbone
- Let workers publish profile and semantic updates
- Keep realtime simulation isolated

### Phase 4

- Split knowledge processing into its own deployment or cluster if needed
- Keep only the contract surface shared

## When to split into multiple projects

Split when one of these becomes true:

- release cadence differs strongly
- runtime dependencies diverge
- scaling needs differ sharply
- different teams own the parts
- failure isolation becomes important

At that point, the knowledge plane should likely become its own project or service set.

