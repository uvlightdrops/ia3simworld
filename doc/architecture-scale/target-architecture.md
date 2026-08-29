# Target Architecture

## Core principle

Keep the realtime simulation small and deterministic.
Move everything else into loosely coupled services that can run slower, in batches, or independently.

## Recommended service split

### 1. Realtime simulation plane

- `world-sim`
- `api-gateway`
- `web-client`

Responsibility:

- authoritative world state
- tick loop
- live UI interaction
- player-facing commands

This plane must stay compact and latency-sensitive.

### 2. Agent intelligence plane

- `agent-service`

Responsibility:

- action planning
- social decisions
- domain logic
- background reasoning

This service should not own authoritative world state.

### 3. Knowledge / profile plane

- `kicli`
- profile importers
- semantic indexers
- export jobs

Responsibility:

- user knowledge base
- interests
- skills
- profile synthesis
- batch import/export

This plane is naturally slow and can work asynchronously.

### 4. Shared contract plane

- `packages/proto`
- `packages/events`

Responsibility:

- versioned schemas
- event definitions
- compatibility between planes

## What should be shared

Only these things should cross service boundaries:

- stable IDs
- versioned schemas
- events
- immutable snapshots
- import/export artifacts

Business logic should not be shared.

