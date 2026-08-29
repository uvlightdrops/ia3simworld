"""Node and port mapping for IA3 services."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NodePorts:
    web: int
    api: int
    sim: int
    agent: int


def local_ports(node: int) -> NodePorts:
    return NodePorts(
        web=12000 + (node - 1),
        api=17080 + (node - 1),
        sim=17180 + (node - 1),
        agent=50051 + (node - 1),
    )


def mk_ports(node: int) -> NodePorts:
    return NodePorts(
        web=13000 + (node - 1),
        api=18080 + (node - 1),
        sim=8081,
        agent=50051,
    )
