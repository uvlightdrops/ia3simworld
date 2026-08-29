# Python Orchestration CLI

The lifecycle of ia3simworld is orchestrated through a small Python CLI instead of a growing set of Bash scripts.

## Why Python

Python is used as the orchestration root because it is:

- easier to read for multi-step logic
- better for parsing structured input like `[1,3]`
- easier to extend than shell wrappers
- more suitable for future status, diagnostics, and deployment flows

## Responsibilities

The CLI in `scripts/ia3ctl/cli.py` handles:

- node parsing
- service selection
- local process start/stop
- Minikube/Kubernetes start/stop/status delegation
- local and cluster status reporting

## Input model

The CLI accepts:

- **commands** such as `dev-lokal-start`, `dev-mk-start`, `prod-mk-status`
- **node lists** like `[1,3]`
- **service filters** like `web,api`

This makes the interface explicit and easier to understand than positional Bash arguments.

## Internal split

| Module | Responsibility |
|---|---|
| `scripts/ia3ctl/nodes.py` | Parse node selections |
| `scripts/ia3ctl/ports.py` | Map nodes to ports |
| `scripts/ia3ctl/system.py` | Health and port checks |
| `scripts/ia3ctl/status.py` | Status reporting |
| `scripts/ia3ctl/cli.py` | Command dispatch and orchestration |

## Current orchestration model

### Local mode

Local mode starts or stops services on the host per selected node:

- `agent-service`
- `world-sim`
- `api-gateway`
- `web-client`

### Minikube / Kubernetes mode

Cluster mode delegates to the existing Helm/Kubernetes deployment path.

## Design rule

The orchestrator should remain small and explicit.

Heavy deployment logic, policy, and cloud-specific behavior should move into separate modules or job runners as the system grows.

