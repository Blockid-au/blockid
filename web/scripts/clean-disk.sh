#!/bin/bash
# BlockID.au — Disk Cleanup Script
#
# Removes files that are safe to delete and can reclaim significant disk space:
#   1. Nested releases/ dirs inside release dirs (should never exist post-fix)
#   2. Old .next-backup (only need one; kept <7 days old)
#   3. Old .next/cache (Next.js build cache, safe to nuke between deploys)
#   4. npm/node cache artifacts
#   5. /tmp files older than 7 days
#   6. Old build logs
#   7. Docker artifacts (images, stopped containers, dangling volumes)
#
# Usage:
#   bash scripts/clean-disk.sh           # dry-run preview
#   bash scripts/clean-disk.sh --apply   # actually delete
#
# Safe to run at any time — never touches the live release (via .next-current symlink).

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASES_DIR="${DATA_DIR:-/data}/releases"  # /data (300GB disk) or fallback
CURRENT_LINK="$WEB_DIR/.next-current"
PREV_LINK="$WEB_DIR/.next-previous"
DATA_DISK="${DATA_DIR:-/data}"
DRY_RUN=true
FREED=0

if [ "${1:-}" = "--apply" ]; then
  DRY_RUN=false
fi

echo "════════════════════════════════════════════"
echo "  BlockID.au — Disk Cleanup"
echo "  Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN (pass --apply to delete)' || echo 'APPLY')"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════"

maybe_rm() {
  local path="$1"
  local label="$2"
  if [ ! -e "$path" ] && [ ! -L "$path" ]; then return; fi
  local size
  size=$(du -sh "$path" 2>/dev/null | cut -f1 || echo "?")
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY] would remove $label ($size): $path"
  else
    rm -rf "$path"
    echo "  ✅ Removed $label ($size): $path"
  fi
}

# ─── 1. Nested releases/ inside each release dir ─────────────────────────────
echo ""
echo "── 1. Nested releases/ dirs ──"
if [ -d "$RELEASES_DIR" ]; then
  for release in "$RELEASES_DIR"/*/; do
    nested="${release}releases"
    if [ -d "$nested" ]; then
      maybe_rm "$nested" "nested releases"
    fi
  done
fi

# ─── 2. .next-backup older than 7 days ───────────────────────────────────────
echo ""
echo "── 2. .next-backup cleanup ──"
BACKUP_DIR="$WEB_DIR/.next-backup"
if [ -d "$BACKUP_DIR" ]; then
  AGE_DAYS=$(( ( $(date +%s) - $(stat -c %Y "$BACKUP_DIR" 2>/dev/null || echo 0) ) / 86400 ))
  if [ "$AGE_DAYS" -gt 7 ]; then
    maybe_rm "$BACKUP_DIR" ".next-backup (${AGE_DAYS}d old)"
  else
    echo "  .next-backup is ${AGE_DAYS}d old — keeping (< 7 days)"
  fi
else
  echo "  No .next-backup found"
fi

# ─── 3. .next/cache (build cache — safe to delete between deploys) ───────────
echo ""
echo "── 3. .next/cache ──"
NEXT_CACHE="$WEB_DIR/.next/cache"
if [ -d "$NEXT_CACHE" ]; then
  maybe_rm "$NEXT_CACHE" ".next/cache (build cache)"
else
  echo "  No .next/cache found"
fi

# ─── 4. npm / node cache ──────────────────────────────────────────────────────
echo ""
echo "── 4. npm/node cache ──"
NPM_CACHE=$(npm config get cache 2>/dev/null || echo "$HOME/.npm")
if [ -d "$NPM_CACHE" ]; then
  NPM_SIZE=$(du -sh "$NPM_CACHE" 2>/dev/null | cut -f1 || echo "?")
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY] would run: npm cache clean --force (cache: $NPM_CACHE, $NPM_SIZE)"
  else
    npm cache clean --force 2>/dev/null && echo "  ✅ npm cache cleared ($NPM_SIZE freed)" || echo "  ⚠ npm cache clean failed"
  fi
fi

# ─── 5. /tmp files older than 7 days ─────────────────────────────────────────
echo ""
echo "── 5. /tmp stale files (>7d) ──"
TMP_COUNT=$(find /tmp -maxdepth 1 -mtime +7 2>/dev/null | wc -l)
TMP_SIZE=$(find /tmp -maxdepth 1 -mtime +7 -exec du -sh {} + 2>/dev/null | awk '{sum+=$1} END{print sum"K"}' || echo "?")
if [ "$TMP_COUNT" -gt 0 ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY] would remove $TMP_COUNT /tmp entries older than 7 days"
  else
    find /tmp -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null || true
    echo "  ✅ Removed stale /tmp files ($TMP_COUNT items)"
  fi
else
  echo "  /tmp is clean"
fi

# ─── 6. Old blockid logs (>14 days) ──────────────────────────────────────────
echo ""
echo "── 6. Old logs ──"
OLD_LOGS=$(find /tmp -maxdepth 1 -name "blockid-*.log.*" -mtime +14 2>/dev/null | wc -l)
if [ "$OLD_LOGS" -gt 0 ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY] would remove $OLD_LOGS old blockid log rotations in /tmp"
  else
    find /tmp -maxdepth 1 -name "blockid-*.log.*" -mtime +14 -delete 2>/dev/null || true
    echo "  ✅ Removed $OLD_LOGS old log files"
  fi
else
  echo "  No old logs found"
fi

# ─── 7. Docker cleanup (safe — only removes stopped containers + dangling) ────
echo ""
echo "── 7. Docker cleanup ──"
if command -v docker &>/dev/null; then
  DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l)
  STOPPED=$(docker ps -a -f "status=exited" -q 2>/dev/null | wc -l)
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY] would prune $DANGLING dangling images + $STOPPED stopped containers"
  else
    docker container prune -f 2>/dev/null && echo "  ✅ Stopped containers pruned" || true
    docker image prune -f 2>/dev/null && echo "  ✅ Dangling images pruned" || true
    docker volume prune -f 2>/dev/null && echo "  ✅ Unused volumes pruned" || true
  fi
else
  echo "  Docker not found — skipping"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
DISK_USED=$(df -h / | awk 'NR==2{print $3 "/" $2 " (" $5 " used)"}')
echo "  Disk: $DISK_USED"
if [ "$DRY_RUN" = true ]; then
  echo "  Run with --apply to actually delete the above."
fi
echo "════════════════════════════════════════════"
