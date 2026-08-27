#!/usr/bin/env bash
# scripts/dev/stop.sh
# Stops all direct local development processes (Non-K8s) owned by the current user

set -uo pipefail

ports=(13000 18080 18081 50051)
current_uid="$(id -u)"

echo "=== Stopping Direct Local Services (Non-K8s) ==="
echo ""

for port in "${ports[@]}"; do
  while read -r pid; do
    [ -n "$pid" ] || continue
    owner_uid="$(ps -o uid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    if [ -z "$owner_uid" ]; then
      continue
    fi
    if [ "$owner_uid" != "$current_uid" ]; then
      echo "Skip PID $pid on port $port: not owned by current user ($(id -un))."
      continue
    fi
    echo "Stopping PID $pid on port $port"
    kill "$pid" || echo "Could not stop PID $pid on port $port"
  done < <(ss -lntup 2>/dev/null | grep -F ":$port" | sed -nE 's/.*pid=([0-9]+).*/\1/p' | sort -u)
done

echo ""
echo "All local direct dev processes owned by $(id -un) on expected ports have been stopped."
