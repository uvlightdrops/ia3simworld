#!/usr/bin/env bash
# scripts/prod/start.sh
# Starts Minikube, builds/verifies images, deploys K8s workloads, and launches background port-forwarding

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

# Import helper functions
if [ -f "$ROOT_DIR/scripts/dev/common-helpers.sh" ]; then
  source "$ROOT_DIR/scripts/dev/common-helpers.sh"
else
  echo "Error: common-helpers.sh not found."
  exit 1
fi

mkdir -p "$ROOT_DIR/.tmp"
PF_LOG="$ROOT_DIR/.tmp/port-forward.log"
PF_PID_FILE="$ROOT_DIR/.tmp/port-forward.pid"

echo "=== Starting Minikube & Kubernetes Deployment (Production-like) ==="
echo "Repository Root: $ROOT_DIR"
echo ""

# 1. Start Minikube if not active
echo "[1] Checking Minikube status..."
if ! minikube status >/dev/null 2>&1; then
  echo "Minikube is not running. Starting Minikube..."
  minikube start --cpus=4 --memory=8192
else
  echo "Minikube is already running."
fi
echo ""

# 2. Build or verify Docker images inside Minikube
echo "[2] Verifying Docker images in Minikube..."
minikube_images=$(minikube image ls 2>/dev/null || echo "")

verify_or_build_image() {
  local tag="$1"
  local path="$2"
  if echo "$minikube_images" | grep -q "$tag"; then
    echo "  - Image '$tag' already exists in Minikube."
  else
    echo "  - Image '$tag' not found. Building from '$path'..."
    minikube image build -t "$tag" "$path"
  fi
}

verify_or_build_image "api-gateway:dev" "$ROOT_DIR/apps/api-gateway"
verify_or_build_image "world-sim:dev" "$ROOT_DIR/apps/world-sim"
verify_or_build_image "agent-service:dev" "$ROOT_DIR/apps/agent-service"
verify_or_build_image "web-client:dev" "$ROOT_DIR/apps/web-client"
echo ""

# 3. Create Namespaces and Deploy Helm charts
echo "[3] Deploying Helm charts to Minikube..."

# Deploy Instance 1 (Namespace: ia3)
echo "  - Deploying Instance 1 (Namespace: ia3)..."
kubectl create namespace ia3 --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install ia3-local "$ROOT_DIR/deploy/helm/ia3-local" -n ia3 -f "$ROOT_DIR/deploy/helm/ia3-local/values-local.yaml"

# Deploy Instance 2 (Namespace: ia3-two)
echo "  - Deploying Instance 2 (Namespace: ia3-two)..."
kubectl create namespace ia3-two --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install ia3-two "$ROOT_DIR/deploy/helm/ia3-local" -n ia3-two -f "$ROOT_DIR/deploy/helm/ia3-local/values-local.yaml"
echo ""

# 4. Wait for Pod Rollout to Complete
echo "[4] Waiting for deployments to be ready..."
kubectl rollout status deployment/world-sim -n ia3 --timeout=120s
kubectl rollout status deployment/api-gateway -n ia3 --timeout=120s
kubectl rollout status deployment/web-client -n ia3 --timeout=120s

kubectl rollout status deployment/world-sim -n ia3-two --timeout=120s
kubectl rollout status deployment/api-gateway -n ia3-two --timeout=120s
kubectl rollout status deployment/web-client -n ia3-two --timeout=120s
echo "All deployments are fully rolled out!"
echo ""

# 5. Start Port Forwarding in background
echo "[5] Launching background port forwarders..."
# Kill any existing background port forwarders we started
if [ -f "$PF_PID_FILE" ]; then
  old_pid=$(cat "$PF_PID_FILE")
  if ps -p "$old_pid" >/dev/null 2>&1; then
    echo "  - Stopping old port-forward process (PID $old_pid)..."
    kill "$old_pid" || true
  fi
  rm -f "$PF_PID_FILE"
fi

# Run the port forwarder script in background
nohup "$ROOT_DIR/scripts/prod/port-forward-k8s.sh" > "$PF_LOG" 2>&1 &
PF_PID=$!
echo "$PF_PID" > "$PF_PID_FILE"
echo "  - Port forwarders started in background (PID $PF_PID). Logs: $PF_LOG"

echo "  - Waiting for port endpoints to wake up..."
sleep 4
echo ""

# 6. Verify health of the endpoints
echo "[6] Verifying local ingress ports..."
for _ in $(seq 1 10); do
  all_ok=true
  if ! is_endpoint_healthy "http://localhost:18080/healthz"; then all_ok=false; fi
  if ! is_endpoint_healthy "http://localhost:13000"; then all_ok=false; fi
  if ! is_endpoint_healthy "http://localhost:18081/healthz"; then all_ok=false; fi
  if ! is_endpoint_healthy "http://localhost:13001"; then all_ok=false; fi
  if [ "$all_ok" = true ]; then
    break
  fi
  sleep 1
done

echo ""
echo "=== K8s Service Status Overview ==="
echo "Instance 1 (Namespace: ia3):"
echo "  - Web UI:      http://localhost:13000   -> $(if is_endpoint_healthy 'http://localhost:13000'; then echo -e '\033[0;32mONLINE\033[0m'; else echo -e '\033[0;31mOFFLINE\033[0m'; fi)"
echo "  - API State:   http://localhost:18080   -> $(if is_endpoint_healthy 'http://localhost:18080/healthz'; then echo -e '\033[0;32mHEALTHY\033[0m'; else echo -e '\033[0;31mOFFLINE\033[0m'; fi)"
echo "Instance 2 (Namespace: ia3-two):"
echo "  - Web UI:      http://localhost:13001   -> $(if is_endpoint_healthy 'http://localhost:13001'; then echo -e '\033[0;32mONLINE\033[0m'; else echo -e '\033[0;31mOFFLINE\033[0m'; fi)"
echo "  - API State:   http://localhost:18081   -> $(if is_endpoint_healthy 'http://localhost:18081/healthz'; then echo -e '\033[0;32mHEALTHY\033[0m'; else echo -e '\033[0;31mOFFLINE\033[0m'; fi)"
echo ""
echo "Kubernetes deployment start-up complete!"
