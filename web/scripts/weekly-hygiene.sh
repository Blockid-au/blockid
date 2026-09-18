#!/bin/bash
# BlockID.au — Weekly Disk Hygiene (Sundays 03:00 AU/Sydney = 17:00 UTC Sat)
#
# Safe defaults — nothing here confirms interactively, but every destructive
# action is namespaced:
#   • rotate /data/logs/blockid-production.log if ≥ 50 MB (keep 14 files).
#   • docker volume prune, but ONLY for volumes matching "runner-*" and older
#     than 336h (2 weeks). NEVER touches supabase or blockid-* volumes.
#   • npm cache clean --force if ~/.npm > 500 MB.
#
# Logs a single line to /tmp/blockid-weekly-hygiene.log per run.

set -u

LOG="/tmp/blockid-weekly-hygiene.log"
TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
{
  echo "──────────────────────────────────────────────"
  echo "[$TS] weekly-hygiene start"
} >> "$LOG"

# ── 1. Rotate production log ────────────────────────────────────
# G15-R2: the log lives at /data/logs/blockid-production.log (14 × 50 MB,
# copy-truncate — the old `tail | mv` here left the live process writing
# into an unlinked inode). /tmp/blockid-production.log is a symlink.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE_OUT=$(bash "$SCRIPT_DIR/rotate-production-log.sh" 2>&1 || true)
if [ -n "$ROTATE_OUT" ]; then
  echo "[$TS] $ROTATE_OUT" >> "$LOG"
else
  echo "[$TS] prod log under 50MB threshold, rotation skipped" >> "$LOG"
fi

# ── 2. Prune runner-* docker volumes > 2 weeks ─────────────────
# Safety: strict allow-list. Never touch supabase-* or blockid-*.
if command -v docker >/dev/null 2>&1; then
  RUNNER_VOLS=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E '^runner-' || true)
  PRUNED=0
  for vol in $RUNNER_VOLS; do
    # extra belt-and-braces: refuse anything that doesn't start with runner-
    case "$vol" in
      supabase*|blockid*|postgres*|redis*)
        echo "[$TS] REFUSED to prune protected volume: $vol" >> "$LOG"
        continue ;;
      runner-*) : ;;
      *) continue ;;
    esac
    # Inspect creation time — skip if < 336h old
    CREATED=$(docker volume inspect "$vol" -f '{{.CreatedAt}}' 2>/dev/null)
    if [ -n "$CREATED" ]; then
      CREATED_EPOCH=$(date -u -d "$CREATED" +%s 2>/dev/null || echo 0)
      NOW_EPOCH=$(date -u +%s)
      AGE_H=$(( (NOW_EPOCH - CREATED_EPOCH) / 3600 ))
      if [ "$AGE_H" -lt 336 ]; then
        echo "[$TS] skip $vol (age ${AGE_H}h < 336h)" >> "$LOG"
        continue
      fi
    fi
    # In-use check — docker refuses to remove in-use volumes anyway, but log it.
    if docker volume rm "$vol" >/dev/null 2>&1; then
      echo "[$TS] pruned runner volume: $vol" >> "$LOG"
      PRUNED=$((PRUNED + 1))
    else
      echo "[$TS] could not remove $vol (in use?)" >> "$LOG"
    fi
  done
  echo "[$TS] docker prune summary: $PRUNED runner-* volumes removed" >> "$LOG"
else
  echo "[$TS] docker not installed — skipped volume prune" >> "$LOG"
fi

# ── 3. Prune npm cache if > 500 MB ──────────────────────────────
NPM_CACHE="${HOME}/.npm"
if [ -d "$NPM_CACHE" ]; then
  SIZE_KB=$(du -sk "$NPM_CACHE" 2>/dev/null | awk '{print $1}')
  SIZE_MB=$((SIZE_KB / 1024))
  if [ "$SIZE_MB" -gt 500 ]; then
    if command -v npm >/dev/null 2>&1; then
      npm cache clean --force >> "$LOG" 2>&1
      echo "[$TS] npm cache cleaned (was ${SIZE_MB}MB)" >> "$LOG"
    fi
  else
    echo "[$TS] npm cache ${SIZE_MB}MB — under 500MB threshold, skipped" >> "$LOG"
  fi
fi

echo "[$TS] weekly-hygiene done" >> "$LOG"
exit 0
