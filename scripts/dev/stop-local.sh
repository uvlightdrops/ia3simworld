#!/usr/bin/env bash
# scripts/dev/stop-local.sh
# Backward compatibility wrapper for scripts/dev/stop.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/stop.sh" "$@"
