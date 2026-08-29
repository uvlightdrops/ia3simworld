#!/usr/bin/env python3
"""Lifecycle actions for minikube/prod mode."""

from __future__ import annotations

import os
import sys


def main() -> int:
    print("prod lifecycle", os.environ.get("IA3_NODES"), os.environ.get("IA3_SERVICES"), sys.argv[1:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
