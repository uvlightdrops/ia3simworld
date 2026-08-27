#!/usr/bin/env bash
# scripts/dev/start.sh
# Starts all services directly on the host (Non-K8s)

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

WORLD_LOG="$ROOT_DIR/.tmp/world-sim.log"
GATEWAY_LOG="$ROOT_DIR/.tmp/api-gateway.log"
WEB_LOG="$ROOT_DIR/.tmp/web-client.log"
AGENT_LOG="$ROOT_DIR/.tmp/agent-service.log"

if ! command -v go >/dev/null 2>&1; then
  echo "Go not found in PATH. Expected $HOME/.local/bin/go or system go"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Expected $HOME/.local/bin/npm or system npm"
  exit 1
fi

start_detached() {
  local log_path="$1"
  shift
  nohup "$@" >"$log_path" 2>&1 &
  echo $!
}

echo "=== Starting Direct Local Services (Non-K8s) ==="
echo "Repository Root: $ROOT_DIR"
echo ""

# 0. agent-service (Mesa + gRPC)
if is_port_in_use "50051"; then
  echo "agent-service on Port 50051 is already active:"
  get_process_on_port "50051"
  AGENT_PID=""
else
  echo "Starting agent-service (Mesa) on port 50051..."
  cd "$ROOT_DIR/apps/agent-service"
  # Activate virtual environment if it exists, otherwise run python directly
  if [ -d .venv ]; then
    AGENT_PID="$(start_detached "$AGENT_LOG" .venv/bin/python main.py)"
  else
    AGENT_PID="$(start_detached "$AGENT_LOG" python3 main.py)"
  fi
fi

# 1. world-sim
if is_port_in_use "18081"; then
  echo "world-sim on Port 18081 is already active:"
  get_process_on_port "18081"
  WORLD_PID=""
else
  echo "Starting world-sim on port 18081..."
  cd "$ROOT_DIR/apps/world-sim"
  WORLD_PID="$(start_detached "$WORLD_LOG" env PATH="$PATH" PORT=18081 go run .)"
fi

# 2. api-gateway
if is_port_in_use "18080"; then
  echo "api-gateway on Port 18080 is already active:"
  get_process_on_port "18080"
  GATEWAY_PID=""
else
  echo "Starting api-gateway on port 18080..."
  cd "$ROOT_DIR/apps/api-gateway"
  GATEWAY_PID="$(start_detached "$GATEWAY_LOG" env PATH="$PATH" PORT=18080 WORLD_SIM_URL=http://localhost:18081 go run .)"
fi

# 3. web-client
if is_port_in_use "13000"; then
  echo "web-client on Port 13000 is already active:"
  get_process_on_port "13000"
  WEB_PID=""
else
  echo "Starting web-client on port 13000..."
  cd "$ROOT_DIR/apps/web-client"
  if [ -d .next ] && [ ! -w .next ]; then
    mv .next ".next.$(date +%s).bak"
  fi
  rm -rf .next
  WEB_PID="$(start_detached "$WEB_LOG" env PATH="$PATH" NEXT_PUBLIC_API_BASE=http://localhost:18080 npm run dev -- --hostname 0.0.0.0 -p 13000)"
fi

echo "Verifying service health..."
for _ in $(seq 1 30); do
  all_ok=true
  if ! is_endpoint_healthy "http://localhost:18081/healthz"; then all_ok=false; fi
  if ! is_endpoint_healthy "http://localhost:18080/healthz"; then all_ok=false; fi
  if ! is_endpoint_healthy "http://localhost:13000"; then all_ok=false; fi
  if ! is_port_in_use "50051"; then all_ok=false; fi
  if [ "$all_ok" = true ]; then
    break
  fi
  sleep 1
done

echo ""
echo "=== Service Status Overview ==="
echo "  agent-service (Port 50051): $(if is_port_in_use '50051'; then echo -e '\033[0;32mRUNNING\033[0m'; else echo -e '\033[0;31mDOWN\033[0m'; fi)"
echo "  world-sim     (Port 18081): $(if is_endpoint_healthy 'http://localhost:18081/healthz'; then echo -e '\033[0;32mHEALTHY\033[0m'; else echo -e '\033[0;31mDOWN\033[0m'; fi)"
echo "  api-gateway   (Port 18080): $(if is_endpoint_healthy 'http://localhost:18080/healthz'; then echo -e '\033[0;32mHEALTHY\033[0m'; else echo -e '\033[0;31mDOWN\033[0m'; fi)"
echo "  web-client    (Port 13000): $(if is_endpoint_healthy 'http://localhost:13000'; then echo -e '\033[0;32mHEALTHY\033[0m'; else echo -e '\033[0;31mDOWN\033[0m'; fi)"
echo ""
echo "Logs are available under $ROOT_DIR/.tmp/"
