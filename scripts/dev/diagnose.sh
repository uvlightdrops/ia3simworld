#!/usr/bin/env bash
# scripts/dev/diagnose.sh
# Diagnostics for direct local development processes (Non-K8s)

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

# Import helper functions
if [ -f "$ROOT_DIR/scripts/dev/common-helpers.sh" ]; then
  source "$ROOT_DIR/scripts/dev/common-helpers.sh"
else
  echo "Error: common-helpers.sh not found."
  exit 1
fi

echo "=== IA3 SimWorld Direct Local Diagnostics ==="
echo "Repository Root: $ROOT_DIR"
echo ""

echo "[1] Process Check (Direct Local)"
mapfile -t pids < <(ss -lntup 2>/dev/null | grep -E ':18081|:18080|:13000|:50051' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | sort -u)
if [ "${#pids[@]}" -gt 0 ]; then
  for pid in "${pids[@]}"; do
    ps -p "$pid" -o pid,ppid,comm,args --no-headers || true
  done
else
  echo "No active local direct services found on standard ports (13000, 18080, 18081, 50051)."
fi
echo ""

echo "[2] Endpoint Health Check"
for hostport in \
  "http://localhost:50051" \
  "http://localhost:18081" \
  "http://localhost:18080" \
  "http://localhost:13000"; do
  
  if [ "$hostport" = "http://localhost:50051" ]; then
    printf '%-30s' "agent-service (gRPC Port 50051)"
    if is_port_in_use "50051"; then
      printf 'OK (Port listening)\n'
    else
      printf 'DOWN\n'
    fi
  else
    printf '%-30s' "$hostport"
    if is_endpoint_healthy "$hostport/healthz"; then
      printf 'OK (healthz)\n'
    elif is_endpoint_healthy "$hostport"; then
      printf 'OK (root page)\n'
    else
      printf 'DOWN\n'
    fi
  fi
done
echo ""

echo "[3] Port Listeners (Detailed)"
ss -lntup 2>/dev/null | grep -E ':18081|:18080|:13000|:50051' || echo "No matching listeners on ports 13000, 18080, 18081, 50051"
echo ""

echo "[4] State API Snapshot"
for url in \
  "http://localhost:18080/api/state" \
  "http://localhost:18081/state"; do
  if curl -fsS "$url" >/tmp/ia3_diag_body.$$ 2>/dev/null; then
    echo "URL: $url"
    head -c 220 /tmp/ia3_diag_body.$$ | tr '\n' ' '; echo
    echo
  else
    echo "URL: $url -> unreachable"
  fi
done
rm -f /tmp/ia3_diag_body.$$
echo ""

echo "[5] Suggested Next Action"
if is_endpoint_healthy "http://localhost:18080/api/state" && is_endpoint_healthy "http://localhost:13000" && is_port_in_use "50051"; then
  echo "Everything looks healthy. Local web frontend, API gateway, and simulation engine are fully reachable."
else
  echo "One or more direct local services are down. Run: ./scripts/dev/start.sh"
fi
