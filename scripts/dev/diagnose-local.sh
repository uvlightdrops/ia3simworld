#!/usr/bin/env bash
# scripts/dev/diagnose-local.sh
# Backward compatibility wrapper for scripts/dev/diagnose.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/diagnose.sh" "$@"
