# Orchestration Best Practices

## Practical technology choices

### For local developer orchestration

- **Python** for readable CLI/orchestration logic
- **subprocess** for controlled command execution
- **structured arguments** for node lists and service lists

### For container orchestration

- **Kubernetes** for scheduling and rollout control
- **Helm** for declarative app packaging
- **Minikube** for local cluster emulation

### For background work and decoupling

- **NATS** for event transport
- **Redis** for lightweight state/coordination
- **PostgreSQL** for persistent records

## Recommended orchestration pattern

1. Keep the realtime path small.
2. Put lifecycle and deployment logic into a readable CLI.
3. Use declarative Kubernetes manifests for cluster state.
4. Move slow or retryable work into workers or jobs.
5. Use versioned contracts between services.

## What to avoid

- sprawling Bash logic
- hidden positional arguments
- mixing deployment and runtime business logic
- coupling profile imports directly into the tick loop
- hardcoding node counts into multiple places

## Good fit by problem type

| Problem | Good fit |
|---|---|
| local start/stop/status | Python CLI |
| cluster rollout | Kubernetes + Helm |
| background sync | worker/job |
| service-to-service events | NATS |
| persisted state | PostgreSQL |
| transient coordination | Redis |

## Long-term direction

For the large IA3 vision, orchestration should become layered:

- **developer orchestration**: Python CLI
- **deployment orchestration**: Helm/Kubernetes
- **event orchestration**: NATS-driven workers
- **batch orchestration**: scheduled jobs / cron-like workers

This keeps the simulation core independent from slower knowledge and profile workflows.

