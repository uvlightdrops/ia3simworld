# AGENTS.md

This repository contains the initial MVP skeleton for the IA3 SimWorld platform: a distributed simulation system with a web UI, an API gateway, a simulation engine, and an agent logic service.

## Project purpose

The goal is to build a layered platform for:
- a human-world simulation engine
- a logic layer with AI/social agents
- a game/experience layer for playful, educational, and AR-enabled modes
- a web-first GUI for monitoring and interaction
- local Kubernetes-based development with Minikube

## High-level architecture

- `apps/web-client`: Next.js web frontend
- `apps/api-gateway`: Go HTTP/WS API gateway
- `apps/world-sim`: Go simulation engine, tick loop and authoritative world state
- `apps/agent-service`: Python placeholder for agent behavior logic
- `packages/proto`: shared gRPC schemas
- `packages/events`: event JSON schemas
- `deploy/helm/ia3-local`: Helm chart for local Minikube deployment
- `infra/local`: local infrastructure helpers
- `docs`: ADRs and architecture documentation

## Runtime assumptions

- Local development should support both direct runs and Minikube-based deployment.
- Keep service boundaries clear:
  - simulation owns state and ticks
  - agent service decides actions
  - gateway exposes data to the UI
  - UI consumes state via HTTP / future WebSocket
- Prefer async eventing for future scale, but keep the MVP simple and understandable.

## Tech stack

- Go 1.22+ for gateway and simulation
- Python 3.12 for agent service
- Node.js 20+ for web client
- Next.js 14 + React 18 for the web UI
- PostgreSQL and Redis for local state/data services
- NATS for future event backbone (planned)
- Kubernetes + Helm + Minikube for local deployment

## Repository layout

```text
ia3simworld/
  AGENTS.md
  Makefile
  apps/
    web-client/
    api-gateway/
    world-sim/
    agent-service/
  packages/
    proto/
    events/
  deploy/
    helm/
      ia3-local/
  infra/
    local/
  docs/
    adr/
    c4/
  scripts/
    dev/
```

## Local development setup

### Prerequisites

Install the following tools on the other machine:
- Docker
- Minikube
- kubectl
- Helm
- Go 1.22+
- Python 3.12+
- Node.js 20+

### Local dependencies for non-Kubernetes runs

Start the local infrastructure if needed:

```bash
docker compose -f infra/local/docker-compose.yml up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### Run the Go services directly

```bash
cd apps/world-sim
go run .

cd ../api-gateway
go run .
```

The current world-sim service listens on `:8081` and exposes:
- `GET /healthz`
- `POST /control/start`
- `POST /control/pause`
- `GET /state`

The current API gateway listens on `:8080` and exposes:
- `GET /healthz`
- `POST /api/control/start`
- `POST /api/control/pause`
- `GET /api/state`

### Run the web client locally

```bash
cd apps/web-client
npm install
npm run dev
```

Then open the app in the browser at:
- http://localhost:3000

### Run the agent service locally

```bash
cd apps/agent-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Minikube workflow

### Start the local cluster and deploy

From the repo root:

```bash
make dev-up
```

This command:
- starts Minikube
- ensures the namespace exists
- deploys the local Helm chart

### Check status

```bash
make dev-status
```

### Port forward the API gateway

```bash
make port-forward
```

Then access the API via:
- http://localhost:8080/api/state

### Uninstall or reset the chart

```bash
make dev-down
```

To completely remove the namespace:

```bash
make nuke
```

## Build/test commands

### World sim

```bash
cd apps/world-sim
go build ./...
```

### API gateway

```bash
cd apps/api-gateway
go build ./...
```

### Agent service

```bash
cd apps/agent-service
python -m compileall .
```

### Web client

```bash
cd apps/web-client
npm install
npm run build
```

## Current MVP state

This repository is intentionally a working skeleton for the first project milestone. It includes:
- a minimal simulation tick loop
- a live state endpoint
- a simple API gateway
- a frontend polling the state for visual updates
- the base package and Helm structure for future scaling

Current functionality is intentionally simple and should be treated as a base platform for extension, not as final business logic.

## Future sprint priorities

1. Add gRPC contract implementation between world-sim and agent-service.
2. Add NATS event publishing (`sim.tick.completed`, `sim.agent.action.applied`).
3. Add real world state model and agent behavior rules.
4. Add persistent storage for simulation runs and agents.
5. Add WebSocket streaming to the UI.
6. Add richer game modes and AR-capable clients.

## Conventions for development on this repo

- Keep service ownership clean: each app should have one major responsibility.
- Prefer typed contracts and shared schemas in `packages/*`.
- Keep user-facing behavior in the web client; do not over-embed business logic there.
- Add Dockerfiles and Helm compatibility for every new service.
- Use explicit domain events for cross-service communication.
- Keep the initial MVP simple and deterministic.

## Notes for another developer

When continuing work on another machine:
1. Clone the repo.
2. Run the required tool installation steps.
3. Start local infrastructure if needed.
4. Run services either directly or via Minikube using the Makefile.
5. Keep the architecture boundaries above intact.

This file is intended to make the project easy to resume on another machine without losing context.
