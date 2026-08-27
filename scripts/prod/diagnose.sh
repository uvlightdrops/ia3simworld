#!/usr/bin/env bash
# scripts/prod/diagnose.sh
# Diagnostic checks for Minikube Kubernetes Deployments, Services, and Port Forwards

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

echo "=== IA3 SimWorld Kubernetes (Minikube) Diagnostics ==="
echo "Repository Root: $ROOT_DIR"
echo ""

# 1. Check Minikube Status
echo "[1] Minikube Node Status"
if minikube status >/dev/null 2>&1; then
  minikube status | sed 's/^/  /'
else
  echo "  STATUS: DOWN (Minikube is not running. Start with: ./scripts/prod/start.sh)"
fi
echo ""

# 2. Check Kubernetes Pods & Services status
echo "[2] Kubernetes Resources (Namespace: ia3)"
if kubectl get ns ia3 >/dev/null 2>&1; then
  echo "  Pods:"
  kubectl get pods -n ia3 -o wide | sed 's/^/    /'
  echo ""
  echo "  Services:"
  kubectl get svc -n ia3 | sed 's/^/    /'
else
  echo "  Namespace 'ia3' does not exist."
fi
echo ""

echo "Kubernetes Resources (Namespace: ia3-two)"
if kubectl get ns ia3-two >/dev/null 2>&1; then
  echo "  Pods:"
  kubectl get pods -n ia3-two -o wide | sed 's/^/    /'
  echo ""
  echo "  Services:"
  kubectl get svc -n ia3-two | sed 's/^/    /'
else
  echo "  Namespace 'ia3-two' does not exist."
fi
echo ""

echo "Kubernetes Resources (Namespace: ia3-three)"
if kubectl get ns ia3-three >/dev/null 2>&1; then
  echo "  Pods:"
  kubectl get pods -n ia3-three -o wide | sed 's/^/    /'
  echo ""
  echo "  Services:"
  kubectl get svc -n ia3-three | sed 's/^/    /'
else
  echo "  Namespace 'ia3-three' does not exist."
fi
echo ""

# 3. Check Port Forwards status
echo "[3] Port Forward Status"
if [ -f "$ROOT_DIR/scripts/prod/port-forward-status.sh" ]; then
  "$ROOT_DIR/scripts/prod/port-forward-status.sh" | sed 's/^/  /'
else
  echo "  Error: port-forward-status.sh not found."
fi
echo ""

# 4. Check Local Ports Reachability
echo "[4] Local Ingress Reachability"
for hostport in \
  "http://localhost:18080" \
  "http://localhost:13000" \
  "http://localhost:18081" \
  "http://localhost:13001" \
  "http://localhost:18082" \
  "http://localhost:13002"; do
  
  printf '  %-25s' "$hostport"
  if is_endpoint_healthy "$hostport/healthz"; then
    printf 'OK (healthz)\n'
  elif is_endpoint_healthy "$hostport"; then
    printf 'OK (root page)\n'
  else
    printf 'DOWN\n'
  fi
done
echo ""

# 5. Retrieve Live State Snapshots
echo "[5] Live State API Snapshots"
for url in \
  "http://localhost:18080/api/state" \
  "http://localhost:18081/api/state" \
  "http://localhost:18082/api/state"; do
  if curl -fsS "$url" >/tmp/ia3_prod_diag_body.$$ 2>/dev/null; then
    echo "  URL: $url"
    printf "    "
    head -c 220 /tmp/ia3_prod_diag_body.$$ | tr '\n' ' '; echo
    echo
  else
    echo "  URL: $url -> unreachable (Check if port-forwarding is running)"
  fi
done
rm -f /tmp/ia3_prod_diag_body.$$
echo ""

# 6. Suggested Next Actions
echo "[6] Suggested Next Action"
if is_endpoint_healthy "http://localhost:18080/api/state" && is_endpoint_healthy "http://localhost:13000"; then
  echo "  Everything looks healthy! Minikube, Kubernetes deployments, and local port forwards are working seamlessly."
else
  echo "  Some services or port forwards are offline. Run: ./scripts/prod/start.sh to deploy and map ports."
fi
