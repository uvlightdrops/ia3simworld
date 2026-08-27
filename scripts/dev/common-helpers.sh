#!/usr/bin/env bash

is_port_in_use() {
  local port="$1"
  ss -lntup 2>/dev/null | grep -qF ":$port"
}

is_endpoint_healthy() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

get_process_on_port() {
  local port="$1"
  ss -lntup 2>/dev/null | grep -F ":$port" | sed -nE 's/.*pid=([0-9]+).*/\1/p' | sort -u | xargs ps -o pid=,comm= -p 2>/dev/null || echo ""
}
