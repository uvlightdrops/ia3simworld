# Deployment and Scaling

## Kubernetes direction

The long-term target should be Kubernetes-native deployment with:

- one namespace per simulation node or tenant
- stateless frontend/gateway where possible
- stateful backing services isolated behind clear contracts
- background workers scaled independently from realtime services

## Recommended runtime classes

| Class | Examples | Scaling style |
|---|---|---|
| Realtime | world-sim, gateway, web-client | horizontal, low latency |
| Stateful services | DB, Redis, knowledge store | persistent, bounded |
| Workers | profile import, embeddings, artifact generation | queue-driven, burstable |
| Batch jobs | exports, summaries, migrations | on-demand |

## Cloud shape

In cloud mode, the most likely stable topology is:

1. API gateway and web client behind ingress
2. simulation service in dedicated pods
3. agent service as a separately scalable deployment
4. kicli/knowledge workers in a separate namespace or cluster
5. shared contract artifacts published as versioned packages

## Why separation matters

As the platform grows, the knowledge side will have a very different load profile than the simulation side.

Knowledge systems are:

- IO-heavy
- retry-friendly
- batch-oriented

Simulation systems are:

- latency-sensitive
- stateful
- deterministic

Mixing them tightly creates scaling friction.

