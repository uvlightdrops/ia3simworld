#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

# Import helper functions
source "$ROOT_DIR/scripts/dev/common-helpers.sh"

echo "=== IA3 SimWorld diagnostics ==="
echo "repo: $ROOT_DIR"

echo "\n[1] Process check"
mapfile -t pids < <(ss -lntup 2>/dev/null | grep -E ':18081|:18080|:13000' | sed -nE 's/.*pid=([0-9]+).*/\1/p' | sort -u)
if [ "${#pids[@]}" -gt 0 ]; then
  for pid in "${pids[@]}"; do
    ps -p "$pid" -o pid,ppid,comm,args --no-headers || true
  done
else
  echo "No sim services found on expected ports"
fi

echo "\n[2] Port check"
for hostport in \
  "http://localhost:18081" \
  "http://localhost:18080" \
  "http://localhost:13000"; do
  printf '%-25s' "$hostport"
  if is_endpoint_healthy "$hostport/healthz"; then
    printf 'OK (healthz)\n'
  elif is_endpoint_healthy "$hostport"; then
    printf 'OK (root page)\n'
  else
    printf 'DOWN\n'
  fi
done

echo "\n[3] Detailed port state"
ss -lntup 2>/dev/null | grep -E ':18081|:18080|:13000' || echo "No matching listeners on expected ports"

echo "\n[4] State snapshot"
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

echo "\n[5] Suggested next action"
if is_endpoint_healthy "http://localhost:18080/api/state" && is_endpoint_healthy "http://localhost:13000"; then
  echo "Everything looks healthy. Frontend and API are reachable."
else
  echo "One or more services are down. Run: ./scripts/dev/start-local.sh"
fi
