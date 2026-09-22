#!/usr/bin/env bash
# G30: report candidates only. A merged branch does not prove a worktree is idle.
# Removal requires owner review of untracked/ignored files, process references,
# worktree locks and deployment lock. Never use --force or delete branch history.
set -euo pipefail
if [[ $# -ne 0 ]]; then echo "Read-only inventory; no automatic removal" >&2; exit 2; fi
git worktree list --porcelain
