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

### CLI Setup

The primary orchestration tool is **`ia3ctl`**, a Python-based CLI using Typer. All local development and Minikube commands flow through this CLI.

#### Install Typer (one-time)

```bash
pip3 install typer
```

#### Create `ia3ctl` command (one-time)

Create a symlink so `ia3ctl` is available system-wide:

```bash
mkdir -p ~/.local/bin
chmod +x scripts/ia3ctl.py
ln -sf "$(pwd)/scripts/ia3ctl.py" ~/.local/bin/ia3ctl

# Verify it works
ia3ctl --help
```

#### Install Shell Completion (optional but recommended)

The simplest way is automatic installation:

```bash
ia3ctl install-completion
```

Or explicitly for your shell:

```bash
ia3ctl install-completion --shell bash
ia3ctl install-completion --shell zsh
ia3ctl install-completion --shell fish
```

Then reload your shell:

```bash
source ~/.bashrc  # or ~/.zshrc, ~/.config/fish/config.fish, etc.
```

For more details, see [CLI_COMPLETION.md](docs/CLI_COMPLETION.md).

After installation, completion works automatically:

```bash
ia3ctl dev-<TAB>  # Suggests subcommands
```

### Local dependencies for non-Kubernetes runs

Start the local infrastructure if needed:

```bash
docker compose -f infra/local/docker-compose.yml up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379

### Port Ranges & Dynamic Node Overview

To keep **Direct Host Development** (`./scripts/dev/start.sh [N]`) and **Minikube Kubernetes Mode** (`./scripts/prod/start.sh [N]`) clearly separated, scalable, and non-conflicting, all scripts use shared helper logic in `scripts/dev/common-helpers.sh`:

- **Direct Host Development (Non-K8s)** for Node $i$ ($i \ge 1$):
  - `web-client`: **`12000 + (i - 1)`** (e.g. `:12000`, `:12001`, `:12002`)
  - `api-gateway`: **`17080 + (i - 1)*2`** (e.g. `:17080`, `:17082`, `:17084`)
  - `world-sim`: **`17081 + (i - 1)*2`** (e.g. `:17081`, `:17083`, `:17085`)
  - `agent-service`: **`50051 + (i - 1)`** (e.g. `:50051`, `:50052`, `:50053`)

- **Minikube Kubernetes Port-Forwarding** for Node $i$ ($i \ge 1$):
  - `ia3` (Primary Cluster, $i=1$): Web `:13000`, Gateway `:18080`
  - `ia3-2` (Federated Node 2, $i=2$): Web `:13001`, Gateway `:18081`
  - `ia3-3` (Federated Node 3, $i=3$): Web `:13002`, Gateway `:18082`
  - Node $i$: Namespace `get_k8s_namespace(i)`, Web `13000 + (i - 1)`, Gateway `18080 + (i - 1)`

### Run the Go services directly

```bash
cd apps/world-sim
PORT=17081 go run .

cd ../api-gateway
PORT=17080 WORLD_SIM_URL=http://localhost:17081 go run .
```

The direct world-sim service listens on `:17081` and exposes:
- `GET /healthz`
- `POST /control/start`
- `POST /control/pause`
- `GET /state`

The direct API gateway listens on `:17080` and exposes:
- `GET /healthz`
- `POST /api/control/start`
- `POST /api/control/pause`
- `GET /api/state`

### Run the web client locally

```bash
cd apps/web-client
npm install
NEXT_PUBLIC_API_BASE=http://localhost:17080 npm run dev -- -p 12000
```

Then open the app in the browser at:
- http://localhost:12000

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

From the repo root, use the CLI:

```bash
python3 scripts/ia3ctl.py dev-mk-start 1
```

This command:
- starts Minikube
- ensures the namespace exists
- deploys the local Helm chart

Alternatively, use the Makefile wrapper:

```bash
make dev-up
```

### Check status

```bash
python3 scripts/ia3ctl.py dev-mk-status 1
```

Or via Makefile:

```bash
make dev-status
```

### Deploy additional federated namespaces

```bash
python3 scripts/ia3ctl.py dev-mk-start 2    # Deploys instance 2 in namespace ia3-2
python3 scripts/ia3ctl.py dev-mk-start 3    # Deploys instance 3 in namespace ia3-3
```

### Rebuild Docker Images & Hot-Reload Services in Minikube

To rebuild Docker images inside Minikube and trigger a rollout restart across all active namespaces (`ia3`, `ia3-2`, `ia3-3`):

```bash
# Rebuild and update ALL services across all namespaces
make prod-update         # or: ./scripts/prod/update.sh all

# Rebuild specific individual services
make prod-update-sim     # Rebuilds world-sim engine
make prod-update-web     # Rebuilds web-client frontend
make prod-update-gateway # Rebuilds api-gateway
make prod-update-agent   # Rebuilds agent-service
```

### Direct Minikube Docker Image Build Commands (Without Restart)

If you want to build images directly into Minikube without immediately triggering a restart:

```bash
minikube image build -t world-sim:dev apps/world-sim
minikube image build -t web-client:dev apps/web-client
minikube image build -t api-gateway:dev apps/api-gateway
minikube image build -t agent-service:dev apps/agent-service
```

To manually trigger a rollout restart for a specific namespace afterwards:

```bash
kubectl rollout restart deployment/world-sim deployment/web-client deployment/api-gateway -n ia3-2
```

### Uninstall or reset the chart

```bash
make dev-down        # Uninstalls ia3 release
make dev-down-2      # Uninstalls ia3-2 release
make dev-down-3      # Uninstalls ia3-3 release
```

To completely remove a namespace:

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
