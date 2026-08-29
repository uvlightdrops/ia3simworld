"""Status reporting for IA3 lifecycle management."""

from __future__ import annotations

from pathlib import Path

from .nodes import parse_nodes
from .ports import local_ports, mk_ports
from .system import is_endpoint_healthy, is_port_in_use


def report_local(nodes: list[int]) -> str:
    lines = ["node | web | api | sim | agent", "---- | ---- | ---- | ---- | ----"]
    for node in nodes:
        p = local_ports(node)
        web_up = is_port_in_use(p.web) or is_endpoint_healthy(f"http://localhost:{p.web}")
        api_up = is_endpoint_healthy(f"http://localhost:{p.api}/healthz")
        sim_up = is_endpoint_healthy(f"http://localhost:{p.sim}/healthz")
        agent_up = is_port_in_use(p.agent)
        def mark(v: bool) -> str:
            return " OK " if v else " -- "

        lines.append(f"{node:>4} | {mark(web_up)} | {mark(api_up)} | {mark(sim_up)} | {mark(agent_up)}")
    return "\n".join(lines)


def report_mk(nodes: list[int]) -> str:
    lines = []
    for node in nodes:
        p = mk_ports(node)
        lines.append(f"node {node}: web={is_endpoint_healthy(f'http://localhost:{p.web}')}, api={is_endpoint_healthy(f'http://localhost:{p.api}/healthz')}")
    return "\n".join(lines)


def report_local_build(nodes: list[int]) -> str:
    lines = []
    web_root = Path(__file__).resolve().parents[2] / "apps/web-client"
    next_dir = web_root / ".next"
    build_id = next_dir / "BUILD_ID"
    for node in nodes:
        p = local_ports(node)
        web_port = is_port_in_use(p.web)
        lines.append(
            f"node {node}: web_port={web_port}, next_dir={next_dir.exists()}, build_id={build_id.exists()}, last_cache={(next_dir / 'cache').exists()}"
        )
    return "\n".join(lines)
