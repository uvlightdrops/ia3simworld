#!/usr/bin/env bash
# scripts/prod/stop.sh
# Uninstalls Helm deployments and stops background K8s port-forwarding processes

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

PF_PID_FILE="$ROOT_DIR/.tmp/port-forward.pid"

echo "=== Stopping Minikube & Kubernetes Deployment ==="
echo ""

# 1. Stop background port-forwarding processes
echo "[1] Stopping active port-forward processes..."
if [ -f "$PF_PID_FILE" ]; then
  pid=$(cat "$PF_PID_FILE")
  if ps -p "$pid" >/dev/null 2>&1; then
    echo "  - Stopping port-forward script process (PID $pid)..."
    kill "$pid" || true
  fi
  rm -f "$PF_PID_FILE"
fi

# Clean up any leftover kubectl port-forward processes owned by the current user
current_uid="$(id -u)"
mapfile -t pf_pids < <(ps -u "$current_uid" -o pid,comm,args 2>/dev/null | grep -E "port-forward" | grep -v grep | awk '{print $1}')
if [ "${#pf_pids[@]}" -gt 0 ]; then
  echo "  - Stopping leftover kubectl port-forward processes: ${pf_pids[*]}..."
  for p in "${pf_pids[@]}"; do
    kill "$p" 2>/dev/null || true
  done
else
  echo "  - No active kubectl port-forwards found."
fi
echo ""

# 2. Uninstall Helm charts
echo "[2] Uninstalling Helm releases..."
helm uninstall ia3-local -n ia3 || true
helm uninstall ia3-two -n ia3-two || true
helm uninstall ia3-three -n ia3-three || true
echo ""

echo "Kubernetes deployment stopped and cleaned up!"
