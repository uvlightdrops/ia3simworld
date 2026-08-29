# IA3 SimWorld CLI Quick Start

The primary orchestration tool is **`ia3ctl`**, a Python-based CLI for managing local development and Minikube deployments.

## Prerequisites

```bash
pip3 install typer
```

## Common Commands

### Local (Direct) Development

Start all services on node 1:

```bash
python3 scripts/ia3ctl.py dev-lokal-start 1
```

Start specific services:

```bash
python3 scripts/ia3ctl.py dev-lokal-start 1 --services sim,api,web
```

Stop services:

```bash
python3 scripts/ia3ctl.py dev-lokal-stop 1
```

Check status:

```bash
python3 scripts/ia3ctl.py dev-lokal-status 1
```

Clean web cache (useful if frontend is stuck):

```bash
python3 scripts/ia3ctl.py dev-lokal-clean-web-cache 1
```

### Minikube Deployment

Start Minikube and deploy services on node 1:

```bash
python3 scripts/ia3ctl.py dev-mk-start 1
```

Start multiple nodes (federated):

```bash
python3 scripts/ia3ctl.py dev-mk-start 1,2,3
```

Check Minikube status:

```bash
python3 scripts/ia3ctl.py dev-mk-status 1
```

Stop Minikube services:

```bash
python3 scripts/ia3ctl.py dev-mk-stop 1
```

### Production Minikube Mode

Production mode with more resources and optimizations:

```bash
python3 scripts/ia3ctl.py prod-mk-start 1
```

## Shell Completion

Set up shell completion for faster typing:

```bash
python3 scripts/ia3ctl.py completion --shell bash
```

Then source the completion in your shell profile. See [CLI_COMPLETION.md](../docs/CLI_COMPLETION.md) for full details.

## Makefile Shortcuts

The Makefile provides shortcuts for common commands:

```bash
make dev-lokal-start        # Start local services
make dev-lokal-status       # Check local status
make dev-mk-start           # Start Minikube
make dev-mk-status          # Check Minikube status
```

Override defaults:

```bash
make dev-lokal-start NODES=1,2 SERVICES=sim,api
```

## Diagnostics

Run diagnostics on a node:

```bash
python3 scripts/ia3ctl.py dev-lokal-diagnose 1
```

Check build status:

```bash
python3 scripts/ia3ctl.py dev-lokal-build-status
```

## Port Mapping

### Local (Non-Kubernetes)

For Node $i$:
- **web-client**: `12000 + (i - 1)` — e.g., `:12000`, `:12001`, `:12002`
- **api-gateway**: `17080 + (i - 1)*2` — e.g., `:17080`, `:17082`, `:17084`
- **world-sim**: `17081 + (i - 1)*2` — e.g., `:17081`, `:17083`, `:17085`
- **agent-service**: `50051 + (i - 1)` — e.g., `:50051`, `:50052`, `:50053`

### Minikube

- **Node 1 (ia3)**: Web `:13000`, Gateway `:18080`
- **Node 2 (ia3-2)**: Web `:13001`, Gateway `:18081`
- **Node 3 (ia3-3)**: Web `:13002`, Gateway `:18082`

## Environment Variables

- `VERBOSE_START=1` — Enable verbose output during startup
- `NODES` — Set default node list for Makefile (default: `1,2,3`)
- `SERVICES` — Set default services for Makefile (default: `web,api,sim,agent`)

## Help

```bash
python3 scripts/ia3ctl.py --help
python3 scripts/ia3ctl.py dev-lokal-start --help
```
