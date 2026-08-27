#!/usr/bin/env bash
# scripts/dev/port-forward-k8s.sh
# Port forwards api-gateway and web-client from Minikube for multiple instances/namespaces

NAMESPACE1="ia3"
NAMESPACE2="ia3-two"

echo "=== Starting IA3 SimWorld Port Forwarders via Minikube ==="

# Helper function to check if a port is listening
is_port_listening() {
  local port=$1
  if ss -tln | grep -q ":$port "; then
    return 0
  elif ss -tln | grep -q "\]:$port "; then
    return 0
  else
    return 1
  fi
}

# Function to stop forwards on Ctrl+C or exit
cleanup() {
  echo ""
  if [ -n "$(jobs -p)" ]; then
    echo "Stopping port-forwarders started in this session..."
    kill $(jobs -p) 2>/dev/null
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

STARTED_ANY=0

# Helper to check if namespace exists
ns_exists() {
  local ns=$1
  minikube kubectl -- get ns "$ns" >/dev/null 2>&1
}

# Instance 1: ia3 (18080 and 13000)
if ns_exists "$NAMESPACE1"; then
  echo "Checking Instance 1 (Namespace: $NAMESPACE1)..."
  if is_port_listening 18080; then
    echo "  - api-gateway (18080) is already active. Skipping."
  else
    echo "  - Forwarding api-gateway (18080 -> 8080)..."
    minikube kubectl -- port-forward -n "$NAMESPACE1" svc/api-gateway 18080:8080 >/dev/null 2>&1 &
    STARTED_ANY=1
  fi

  if is_port_listening 13000; then
    echo "  - web-client (13000) is already active. Skipping."
  else
    echo "  - Forwarding web-client (13000 -> 3000)..."
    minikube kubectl -- port-forward -n "$NAMESPACE1" svc/web-client 13000:3000 >/dev/null 2>&1 &
    STARTED_ANY=1
  fi
fi

# Instance 2: ia3-two (18081 and 13001)
if ns_exists "$NAMESPACE2"; then
  echo "Checking Instance 2 (Namespace: $NAMESPACE2)..."
  if is_port_listening 18081; then
    echo "  - api-gateway (18081) is already active. Skipping."
  else
    echo "  - Forwarding api-gateway (18081 -> 8080)..."
    minikube kubectl -- port-forward -n "$NAMESPACE2" svc/api-gateway 18081:8080 >/dev/null 2>&1 &
    STARTED_ANY=1
  fi

  if is_port_listening 13001; then
    echo "  - web-client (13001) is already active. Skipping."
  else
    echo "  - Forwarding web-client (13001 -> 3000)..."
    minikube kubectl -- port-forward -n "$NAMESPACE2" svc/web-client 13001:3000 >/dev/null 2>&1 &
    STARTED_ANY=1
  fi
fi

if [ $STARTED_ANY -eq 1 ]; then
  sleep 2
  echo ""
  echo "Port forwarding active!"
  if ns_exists "$NAMESPACE1"; then
    echo "Instance 1 ($NAMESPACE1):"
    echo "  - Web UI:    http://localhost:13000"
    echo "  - API State: http://localhost:18080/api/state"
  fi
  if ns_exists "$NAMESPACE2"; then
    echo "Instance 2 ($NAMESPACE2):"
    echo "  - Web UI:    http://localhost:13001"
    echo "  - API State: http://localhost:18081/api/state"
  fi
  echo ""
  echo "Press Ctrl+C to stop port forwarding."
  wait
else
  echo ""
  echo "All port-forwarders are already running and active!"
  if ns_exists "$NAMESPACE1"; then
    echo "Instance 1 ($NAMESPACE1): http://localhost:13000"
  fi
  if ns_exists "$NAMESPACE2"; then
    echo "Instance 2 ($NAMESPACE2): http://localhost:13001"
  fi
  echo ""
fi
