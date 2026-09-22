#!/usr/bin/env bash
# G30: compatibility entry point for the bounded disk guard.
# No process killing, release pruning, repository reset or business-data trimming.
set -euo pipefail
mode="--apply"
maintenance=()
maintenance=(--maintenance)
for arg in "$@"; do
  case "$arg" in
    --apply) mode=--apply ;;
    --dry-run) mode=--dry-run ;;
    --disk-only|--procs|--verbose) ;; # Legacy flags; no process sweep.
    --maintenance) maintenance=(--maintenance) ;;
    *) echo "Unsupported cleanup option: $arg" >&2; exit 2 ;;
  esac
done
exec sudo -n python3 /usr/local/lib/blockid-maintenance/disk-guard.py "$mode"   --threshold 80 --log-owner-uid 1001 "${maintenance[@]}"   --summary /var/lib/blockid-maintenance/latest.json
