#!/usr/bin/env bash
# scripts/prod/status.sh
# Alias wrapper for diagnose.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/diagnose.sh"
