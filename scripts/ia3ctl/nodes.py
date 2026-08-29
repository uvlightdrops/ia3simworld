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
                raise ValueError(f"Invalid node number: {part}. Nodes must be positive integers (e.g., 1,2,3)")
            nodes.append(int(part))
        return sorted(set(nodes))
    try:
        value = ast.literal_eval(raw)
    except Exception as e:
        if raw.isdigit() and int(raw) > 0:
            return [int(raw)]
        raise ValueError(f"Invalid node format: {raw}. Use: 1, 1,2,3, [1,2,3], or [1,2]") from e
    if isinstance(value, int):
        if value < 1:
            raise ValueError(f"Node numbers must be positive integers, got: {value}")
        return [value]
    if isinstance(value, (list, tuple)):
        nodes = []
        for item in value:
            if not isinstance(item, int) or item < 1:
                raise ValueError(f"Invalid node list: {raw}. All items must be positive integers")
            nodes.append(item)
        return sorted(set(nodes))
    raise ValueError(f"Invalid node format: {raw}. Use: 1, 1,2,3, [1,2,3], or [1,2]")
