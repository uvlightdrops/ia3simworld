#!/usr/bin/env python3
"""Human-readable lifecycle actions for direct/local or minikube mode."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def nodes() -> list[int]:
    raw = os.environ.get("IA3_NODES", "1,2,3")
    return [int(x) for x in raw.split(",") if x]


def services() -> list[str]:
    raw = os.environ.get("IA3_SERVICES", "web,api,sim,agent")
    return [x for x in raw.split(",") if x]


def run(cmd: list[str], cwd: Path | None = None) -> int:
    return subprocess.run(cmd, cwd=cwd or ROOT, check=False).returncode


def main() -> int:
    if len(sys.argv) < 2:
        print("missing command", file=sys.stderr)
        return 2
    command = sys.argv[1]
    # Placeholder dispatcher; next patch wires concrete commands.
    print(command, nodes(), services())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
