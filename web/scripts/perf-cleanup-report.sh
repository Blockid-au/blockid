#!/usr/bin/env bash
# perf-cleanup-report.sh — read-only disk-hygiene report for /data/releases.
#
# deploy-live.sh keeps the last 5 releases. This script reports total footprint,
# oldest release age, biggest 5, and warns if the retention window is exceeded.
# No writes, no deletions — safe to run at any time.

set -euo pipefail

RELEASES_DIR="${RELEASES_DIR:-/data/releases}"
KEEP=5

if [[ ! -d "$RELEASES_DIR" ]]; then
  echo "[perf-cleanup-report] no releases dir at $RELEASES_DIR"
  exit 0
fi

echo "=== BlockID release footprint ($RELEASES_DIR) ==="
echo

total_bytes=$(du -sb "$RELEASES_DIR" 2>/dev/null | awk '{print $1}')
total_human=$(du -sh "$RELEASES_DIR" 2>/dev/null | awk '{print $1}')
echo "Total disk usage: ${total_human} (${total_bytes} bytes)"

count=$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
echo "Release count: ${count} (retention target: ${KEEP})"

if [[ "$count" -gt "$KEEP" ]]; then
  over=$((count - KEEP))
  echo "WARN: ${over} release(s) over retention window — deploy-live.sh should have pruned them."
fi

oldest_line=$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@\t%TY-%Tm-%Td %TH:%TM\t%p\n' \
  | sort -n | head -1)
if [[ -n "$oldest_line" ]]; then
  oldest_epoch=$(printf '%s' "$oldest_line" | cut -f1 | cut -d. -f1)
  oldest_date=$(printf '%s' "$oldest_line" | cut -f2)
  oldest_path=$(printf '%s' "$oldest_line" | cut -f3)
  now_epoch=$(date +%s)
  age_days=$(( (now_epoch - oldest_epoch) / 86400 ))
  echo "Oldest release: $(basename "$oldest_path") @ ${oldest_date} (${age_days} days old)"
fi

echo
echo "Biggest 5 releases:"
du -sh "$RELEASES_DIR"/*/ 2>/dev/null | sort -h | tail -5

echo
echo "Newest 5 releases:"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@\t%TY-%Tm-%Td %TH:%TM\t%f\n' \
  | sort -rn | head -5 | cut -f2,3

echo
echo "=== done ==="
