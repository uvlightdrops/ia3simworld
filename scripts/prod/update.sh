#!/usr/bin/env bash
# scripts/prod/update.sh
# Rebuilds and updates a service (or all services) on Minikube and triggers a rollout restart

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

usage() {
  echo "Usage: $0 [service_name | all]"
  echo ""
  echo "Available services:"
  echo "  web-client     - Next.js Web Frontend"
  echo "  world-sim      - Go Simulation Engine"
  echo "  api-gateway    - Go API Gateway"
  echo "  agent-service  - Python Mesa Agent Logic"
  echo "  all            - Rebuild and update ALL four services"
  echo ""
  echo "Examples:"
  echo "  $0 web-client"
  echo "  $0 all"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

SERVICE="$1"

# Helper to check if namespace exists
ns_exists() {
  local ns=$1
  minikube kubectl -- get ns "$ns" >/dev/null 2>&1
}

# Helper to rebuild and rollout a service
update_service() {
  local name="$1"
  local folder="$2"
  local tag="${name}:dev"
  
  echo "--------------------------------------------------------"
  echo "Updating service: $name (Image: $tag)"
  echo "--------------------------------------------------------"
  
  echo "  1. Rebuilding Docker image inside Minikube..."
  minikube image build -t "$tag" "$ROOT_DIR/$folder"
  
  echo "  2. Triggering rollout restart in Kubernetes..."
  if ns_exists "ia3"; then
    echo "     - Namespace: ia3..."
    minikube kubectl -- rollout restart deployment/"$name" -n ia3
  fi
  if ns_exists "ia3-two"; then
    echo "     - Namespace: ia3-two..."
    minikube kubectl -- rollout restart deployment/"$name" -n ia3-two
  fi
  
  echo "  3. Waiting for rollout to complete..."
  if ns_exists "ia3"; then
    minikube kubectl -- rollout status deployment/"$name" -n ia3 --timeout=90s
  fi
  if ns_exists "ia3-two"; then
    minikube kubectl -- rollout status deployment/"$name" -n ia3-two --timeout=90s
  fi
  
  echo "✓ Service '$name' successfully updated and live!"
  echo ""
}

# Verify Minikube is running
if ! minikube status >/dev/null 2>&1; then
  echo "Error: Minikube is not running. Please start it with: ./scripts/prod/start.sh"
  exit 1
fi

echo "=== IA3 SimWorld K8s Update & Hot-Reload ==="
echo ""

case "$SERVICE" in
  web-client)
    update_service "web-client" "apps/web-client"
    ;;
  world-sim)
    update_service "world-sim" "apps/world-sim"
    ;;
  api-gateway)
    update_service "api-gateway" "apps/api-gateway"
    ;;
  agent-service)
    update_service "agent-service" "apps/agent-service"
    ;;
  all)
    update_service "api-gateway" "apps/api-gateway"
    update_service "world-sim" "apps/world-sim"
    update_service "agent-service" "apps/agent-service"
    update_service "web-client" "apps/web-client"
    ;;
  *)
    echo "Error: Unknown service '$SERVICE'"
    echo ""
    usage
    ;;
esac

echo "=== Update process complete! ==="
