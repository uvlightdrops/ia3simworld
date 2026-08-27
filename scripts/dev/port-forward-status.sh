#!/usr/bin/env bash
# scripts/dev/port-forward-status.sh
# Backward compatibility wrapper for scripts/prod/port-forward-status.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../prod/port-forward-status.sh" "$@"
