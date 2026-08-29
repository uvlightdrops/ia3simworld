"""Process and endpoint helpers for IA3 lifecycle management."""

from __future__ import annotations

import subprocess


def is_port_in_use(port: int) -> bool:
    return subprocess.run(
        ["bash", "-lc", f"ss -lntup 2>/dev/null | grep -qF ':{port}'"],
        check=False,
    ).returncode == 0


def is_endpoint_healthy(url: str) -> bool:
    return subprocess.run(
        ["bash", "-lc", f"curl -fsS {url!r} >/dev/null 2>&1"],
        check=False,
    ).returncode == 0

