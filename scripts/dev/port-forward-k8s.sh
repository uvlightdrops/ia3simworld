#!/usr/bin/env bash
# scripts/dev/port-forward-k8s.sh
# Port forwards api-gateway (18080->8080) and web-client (13000->3000) from Minikube

NAMESPACE="ia3"

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

# 1. api-gateway (18080)
if is_port_listening 18080; then
  echo "- api-gateway (18080) is already active. Skipping."
else
  echo "1. Forwarding api-gateway (18080 -> 8080)..."
  minikube kubectl -- port-forward -n "$NAMESPACE" svc/api-gateway 18080:8080 >/dev/null 2>&1 &
  STARTED_ANY=1
fi

# 2. web-client (13000)
if is_port_listening 13000; then
  echo "- web-client (13000) is already active. Skipping."
else
  echo "2. Forwarding web-client (13000 -> 3000)..."
  minikube kubectl -- port-forward -n "$NAMESPACE" svc/web-client 13000:3000 >/dev/null 2>&1 &
  STARTED_ANY=1
fi

if [ $STARTED_ANY -eq 1 ]; then
  sleep 2
  echo ""
  echo "Port forwarding active!"
  echo "- Web UI:    http://localhost:13000"
  echo "- API State: http://localhost:18080/api/state"
  echo ""
  echo "Press Ctrl+C to stop port forwarding."
  # Wait for background jobs to finish
  wait
else
  echo ""
  echo "All port-forwarders are already running and active!"
  echo "- Web UI:    http://localhost:13000"
  echo "- API State: http://localhost:18080/api/state"
  echo ""
fi
