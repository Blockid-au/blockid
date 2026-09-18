#!/bin/bash
# rotate-production-log.sh — G15-R2 log home for the Next.js production process.
#
#   Log:       /data/logs/blockid-production.log   (dir 0750, survives reboot)
#   Compat:    /tmp/blockid-production.log → symlink to the log above
#   Rotation:  size-based, copy-truncate, keep 14 numbered files
#              blockid-production.log.1 … .14 (oldest dropped)
#
# Usage:
#   bash scripts/rotate-production-log.sh            # rotate when ≥ 50 MB
#   bash scripts/rotate-production-log.sh --force    # rotate now (deploy start)
#   bash scripts/rotate-production-log.sh --ensure   # only create dir + symlink
#
# Copy-truncate (not mv) is deliberate: the running `node server.js` keeps its
# fd open. deploy-live.sh / start-production.sh open the log with `>>`
# (O_APPEND), so after `truncate -s0` the next write lands at offset 0 instead
# of leaving a sparse hole. A `mv` would leave the live process writing into
# the rotated inode forever (the pre-G15 weekly-hygiene bug).
#
# Callers: deploy-live.sh (--force at deploy start), weekly-hygiene.sh, the
# G15-R2 error-digest cron line (after the digest has consumed the tail —
# error-digest.mjs restarts its byte offset at 0 when offset > file size).
set -u

LOG_DIR="${BLOCKID_LOG_DIR:-/data/logs}"
LOG="$LOG_DIR/blockid-production.log"
COMPAT_LINK="${BLOCKID_LOG_COMPAT_LINK:-/tmp/blockid-production.log}"
KEEP=14
MAX_BYTES=$((50 * 1024 * 1024))
MODE="${1:-size}"

# 1. Home directory (0750) — fall back to /tmp when /data is not mounted so a
#    deploy never fails on a dev box.
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
  LOG_DIR="/tmp/blockid-logs"; mkdir -p "$LOG_DIR"; LOG="$LOG_DIR/blockid-production.log"
fi
chmod 0750 "$LOG_DIR" 2>/dev/null || true
[ -e "$LOG" ] || : >> "$LOG"

# 2. Compat symlink for old tooling (`tail -f /tmp/blockid-production.log`).
#    A pre-G15 regular file there is folded into the new home first.
if [ -e "$COMPAT_LINK" ] && [ ! -L "$COMPAT_LINK" ]; then
  # Review 2026-09-18 (P0): a pre-G15 server started with `> /tmp/...` still
  # holds that inode; unlinking it here sends every later line to a deleted
  # tmpfs inode. Defer the conversion until nothing has the file open (the
  # next deploy restarts the server with the new path, then this runs clean).
  if command -v fuser >/dev/null 2>&1 && fuser -s "$COMPAT_LINK" 2>/dev/null; then
    echo "rotate-production-log: $COMPAT_LINK is held open by a running process — conversion deferred to the next restart"
    exit 0
  fi
  cat "$COMPAT_LINK" >> "$LOG" 2>/dev/null || true
  rm -f "$COMPAT_LINK"
fi
[ "$(readlink "$COMPAT_LINK" 2>/dev/null)" = "$LOG" ] || ln -sfn "$LOG" "$COMPAT_LINK"

[ "$MODE" = "--ensure" ] && exit 0

# 3. Rotate?
SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
if [ "$MODE" != "--force" ] && [ "$SIZE" -lt "$MAX_BYTES" ]; then
  exit 0
fi
[ "$SIZE" -eq 0 ] && exit 0   # nothing to keep

i=$KEEP
while [ "$i" -gt 1 ]; do
  prev=$((i - 1))
  [ -f "$LOG.$prev" ] && mv -f "$LOG.$prev" "$LOG.$i"
  i=$prev
done
cp -f "$LOG" "$LOG.1" && truncate -s0 "$LOG"
echo "[rotate-production-log] $(date -u '+%Y-%m-%dT%H:%M:%SZ') rotated ${SIZE} bytes → $LOG.1 (keep $KEEP, mode ${MODE#--})"
exit 0
