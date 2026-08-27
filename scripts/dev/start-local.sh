#!/usr/bin/env bash
# scripts/dev/start-local.sh
# Backward compatibility wrapper for scripts/dev/start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/start.sh" "$@"
