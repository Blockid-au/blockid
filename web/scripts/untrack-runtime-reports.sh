#!/usr/bin/env bash
# O1 / L1-10 (2026-10-20) — remove runtime outputs under web/content/reports
# from the git INDEX only (the files stay on disk; the live app and crons keep
# reading/writing them). Selects exactly the tracked files that web/.gitignore
# now ignores (`git ls-files -ci --exclude-standard`), so the .gitignore block
# is the single source of truth.
#
#   bash web/scripts/untrack-runtime-reports.sh            # dry-run: list + count
#   bash web/scripts/untrack-runtime-reports.sh --apply    # git rm --cached (no commit)
#
# Why a script and not a merge: merging / cherry-picking a commit that deletes
# tracked files makes git DELETE them from the working tree of the checkout
# that receives it (or refuse, for locally modified ones). On the live
# checkout that would remove runtime state (security-posture.json,
# traction-snapshot.json, ai-free-models.json …). Run this in the live
# checkout instead, then commit; the deletion is then index-only everywhere.
set -euo pipefail
WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"
mapfile -t FILES < <(git ls-files -ci --exclude-standard -- content/reports)
echo "[untrack-runtime-reports] ${#FILES[@]} tracked file(s) under content/reports match .gitignore"
if [ "${1:-}" != "--apply" ]; then
  printf '%s\n' "${FILES[@]}" | grep -v -E '(daily|nightly)-[0-9]|nightly-digest-|milestone-M' | sed 's/^/  /' || true
  echo "  (+ dated *-daily-/*-nightly-/nightly-digest-/milestone-M*.md reports)"
  echo "dry-run — re-run with --apply to untrack (index only)."
  exit 0
fi
[ "${#FILES[@]}" -eq 0 ] && { echo "nothing to untrack"; exit 0; }
# Snapshot first: belt and braces in case anyone runs a destructive git
# command on the same tree afterwards.
SNAP="/data/backups/reports-untrack-$(date -u +%Y%m%dT%H%M%SZ).tgz"
if [ -d /data/backups ] && [ -w /data/backups ]; then
  tar -czf "$SNAP" -C "$WEB_DIR" "${FILES[@]}" && echo "snapshot: $SNAP"
fi
printf '%s\0' "${FILES[@]}" | xargs -0 git rm --cached --quiet --
missing=0
for f in "${FILES[@]}"; do [ -e "$f" ] || missing=$((missing + 1)); done
echo "untracked ${#FILES[@]} file(s) from the index; files still on disk: $(( ${#FILES[@]} - missing ))/${#FILES[@]}"
echo "now: git commit -m 'ops(o1): untrack runtime reports (index only)'"
