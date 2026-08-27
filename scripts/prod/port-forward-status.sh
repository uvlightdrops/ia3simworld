#!/usr/bin/env bash
# scripts/prod/port-forward-status.sh
# Checks if the K8s port forwards are currently active for the IA3 SimWorld application (both Instance 1 and Instance 2)

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
  local pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -o "pid=[0-9]*" | head -n 1 | cut -d= -f2)
  if [ -z "$pid" ]; then
    pid=$(lsof -t -i:$port 2>/dev/null | head -n 1)
  fi
  if [ -z "$pid" ]; then
    pid=$(ps aux | grep "port-forward" | grep "$port" | grep -v "grep" | awk '{print $2}' | head -n 1)
  fi
  echo "$pid"
}

# Check Instance 1 Ports (18080 & 13000)
I1_API_ACTIVE=0
I1_API_PID=""
if is_port_listening 18080; then
  I1_API_ACTIVE=1
  I1_API_PID=$(get_port_process 18080)
fi

I1_WEB_ACTIVE=0
I1_WEB_PID=""
if is_port_listening 13000; then
  I1_WEB_ACTIVE=1
  I1_WEB_PID=$(get_port_process 13000)
fi

# Check Instance 2 Ports (18081 & 13001)
I2_API_ACTIVE=0
I2_API_PID=""
if is_port_listening 18081; then
  I2_API_ACTIVE=1
  I2_API_PID=$(get_port_process 18081)
fi

I2_WEB_ACTIVE=0
I2_WEB_PID=""
if is_port_listening 13001; then
  I2_WEB_ACTIVE=1
  I2_WEB_PID=$(get_port_process 13001)
fi

# Summary Status
if [ $I1_API_ACTIVE -eq 1 ] && [ $I1_WEB_ACTIVE -eq 1 ]; then
  if is_port_listening 18081 || is_port_listening 13001; then
    echo -e "\033[0;32m● STATUS: MULTIPLE INSTANCES ACTIVE\033[0m"
  else
    echo -e "\033[0;32m● STATUS: INSTANCE 1 ACTIVE\033[0m"
  fi
elif [ $I1_API_ACTIVE -eq 1 ] || [ $I1_WEB_ACTIVE -eq 1 ] || [ $I2_API_ACTIVE -eq 1 ] || [ $I2_WEB_ACTIVE -eq 1 ]; then
  echo -e "\033[0;33m● STATUS: PARTIALLY ACTIVE\033[0m"
else
  echo -e "\033[0;31m● STATUS: INACTIVE\033[0m"
fi

echo ""
echo "Details:"

# Instance 1 Details
echo "--- Instance 1 (Namespace: ia3) ---"
if [ $I1_API_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$I1_API_PID" ]; then pid_str=" (PID: $I1_API_PID)"; fi
  echo -e "  - \033[0;32mAPI Gateway (Port 18080)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:18080/api/state"
else
  echo -e "  - \033[0;31mAPI Gateway (Port 18080)\033[0m: INACTIVE"
fi

if [ $I1_WEB_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$I1_WEB_PID" ]; then pid_str=" (PID: $I1_WEB_PID)"; fi
  echo -e "  - \033[0;32mWeb Client  (Port 13000)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:13000"
else
  echo -e "  - \033[0;31mWeb Client  (Port 13000)\033[0m: INACTIVE"
fi

echo ""
# Instance 2 Details
echo "--- Instance 2 (Namespace: ia3-two) ---"
if [ $I2_API_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$I2_API_PID" ]; then pid_str=" (PID: $I2_API_PID)"; fi
  echo -e "  - \033[0;32mAPI Gateway (Port 18081)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:18081/api/state"
else
  echo -e "  - \033[0;31mAPI Gateway (Port 18081)\033[0m: INACTIVE (Run 'make dev-up-two' to spin up)"
fi

if [ $I2_WEB_ACTIVE -eq 1 ]; then
  pid_str=""
  if [ ! -z "$I2_WEB_PID" ]; then pid_str=" (PID: $I2_WEB_PID)"; fi
  echo -e "  - \033[0;32mWeb Client  (Port 13001)\033[0m: ACTIVE$pid_str"
  echo "    URL: http://localhost:13001"
else
  echo -e "  - \033[0;31mWeb Client  (Port 13001)\033[0m: INACTIVE"
fi

echo ""
