#!/usr/bin/env bash
# scripts/dev/port-forward-status.sh
# Checks if the K8s port forwards are currently active for the IA3 SimWorld application

API_PORT=18080
WEB_PORT=13000

echo "=== IA3 SimWorld Port Forwarding Status ==="
echo ""

# Helper function to check if a port is listening
is_port_listening() {
  local port=$1
  if ss -tln | grep -q ":$port "; then
    return 0 # Active
  elif ss -tln | grep -q "\]:$port "; then
    return 0 # Active (IPv6)
  else
    return 1 # Inactive
  fi
}

# Helper function to get process info for a port
get_port_process() {
  local port=$1
  # Try to find the process ID using ss or lsof, fall back to grep in ps
  local pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -o "pid=[0-9]*" | head -n 1 | cut -d= -f2)
  if [ -z "$pid" ]; then
    pid=$(lsof -t -i:$port 2>/dev/null | head -n 1)
  fi
  if [ -z "$pid" ]; then
    # Fallback to searching active ps for port-forward and the specific port
    pid=$(ps aux | grep "port-forward" | grep "$port" | grep -v "grep" | awk '{print $2}' | head -n 1)
  fi
  echo "$pid"
}

# Check API Gateway Port
API_ACTIVE=0
API_PID=""
if is_port_listening $API_PORT; then
  API_ACTIVE=1
  API_PID=$(get_port_process $API_PORT)
fi

# Check Web Client Port
WEB_ACTIVE=0
WEB_PID=""
if is_port_listening $WEB_PORT; then
  WEB_ACTIVE=1
  WEB_PID=$(get_port_process $WEB_PORT)
fi

# Print status summary
if [ $API_ACTIVE -eq 1 ] && [ $WEB_ACTIVE -eq 1 ]; then
  echo -e "\033[0;32m● STATUS: FULLY ACTIVE\033[0m"
elif [ $API_ACTIVE -eq 1 ] || [ $WEB_ACTIVE -eq 1 ]; then
  echo -e "\033[0;33m● STATUS: PARTIALLY ACTIVE\033[0m"
else
  echo -e "\033[0;31m● STATUS: INACTIVE\033[0m"
fi

echo ""
echo "Details:"

# API Gateway Info
if [ $API_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$API_PID" ]; then
    pid_str=" (PID: $API_PID)"
  fi
  echo -e "  - \033[0;32mAPI Gateway (Port $API_PORT)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:$API_PORT/api/state"
else
  echo -e "  - \033[0;31mAPI Gateway (Port $API_PORT)\033[0m: INACTIVE"
fi

# Web Client Info
if [ $WEB_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$WEB_PID" ]; then
    pid_str=" (PID: $WEB_PID)"
  fi
  echo -e "  - \033[0;32mWeb Client  (Port $WEB_PORT)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:$WEB_PORT"
else
  echo -e "  - \033[0;31mWeb Client  (Port $WEB_PORT)\033[0m: INACTIVE"
fi

echo ""
if [ $API_ACTIVE -eq 0 ] || [ $WEB_ACTIVE -eq 0 ]; then
  echo "To start port forwarding, run: make port-forward"
fi
