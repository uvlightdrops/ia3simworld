"""Node parsing and defaults."""

from __future__ import annotations

import ast


def parse_nodes(raw: str | None) -> list[int]:
    if not raw:
        return [1, 2, 3]
    raw = raw.strip()
    if "," in raw and not raw.startswith("["):
        nodes = []
        for part in raw.split(","):
            part = part.strip()
            if not part.isdigit() or int(part) < 1:
                raise ValueError("nodes must contain positive integers")
            nodes.append(int(part))
        return sorted(set(nodes))
    try:
        value = ast.literal_eval(raw)
    except Exception:
        if raw.isdigit() and int(raw) > 0:
            return [int(raw)]
        raise
    if isinstance(value, int):
        return [value]
    if isinstance(value, (list, tuple)):
        nodes = []
        for item in value:
            if not isinstance(item, int) or item < 1:
                raise ValueError("nodes must contain positive integers")
            nodes.append(item)
        return sorted(set(nodes))
    raise ValueError("nodes must be an int or list like [1,3]")
