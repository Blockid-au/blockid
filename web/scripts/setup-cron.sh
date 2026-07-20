#!/bin/bash
# BlockID.au — Idempotent Cron Installer
#
# Appends 4 crontab entries if (and only if) their marker is absent.
# Safe to re-run — greps for `# blockid-cron:<name>` markers before writing.
#
# Server is UTC. Local user-facing tz is AEST (UTC+10). Weekly-hygiene runs
# Sundays 03:00 AEST = Saturday 17:00 UTC (cron dow=6).

set -eu

RUNNER='/home/dovanlong/blockid.au/web/scripts/cron-runner.sh'
ALARM='/home/dovanlong/blockid.au/web/scripts/cron-alarm.sh'
HYGIENE='/home/dovanlong/blockid.au/web/scripts/weekly-hygiene.sh'

# Ensure scripts are executable
chmod +x "$RUNNER" "$ALARM" "$HYGIENE" 2>/dev/null || true

# Each entry: <cron-line>|<marker-tag>|<comment>
ENTRIES=(
  "*/10 * * * * bash $RUNNER svi-index-populate --timeout 60|svi-index-populate|Incremental SVI index snapshot writer (every 10m)"
  "*/15 * * * * bash $RUNNER email-drip --timeout 60|email-drip|Onboarding + NPS drip sender, cap 50/run (every 15m)"
  "*/30 * * * * bash $ALARM >> /tmp/blockid-cron-alarm.log 2>&1|cron-alarm|Flag stale/failing cron jobs into cron-incidents.jsonl (every 30m)"
  "0 17 * * 6 bash $HYGIENE|weekly-hygiene|Weekly disk hygiene (Sat 17:00 UTC = Sun 03:00 AEST)"
)

CURRENT=$(crontab -l 2>/dev/null || echo "")
NEW="$CURRENT"
ADDED=0
SKIPPED=0

for entry in "${ENTRIES[@]}"; do
  line="${entry%%|*}"
  rest="${entry#*|}"
  tag="${rest%%|*}"
  comment="${rest#*|}"
  marker="# blockid-cron:$tag"

  if echo "$CURRENT" | grep -qF "$marker"; then
    echo "[setup-cron] skip $tag — already installed"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Append with marker + comment
  NEW="$NEW"$'\n'"# $comment"$'\n'"$line $marker"
  echo "[setup-cron] add  $tag → $line"
  ADDED=$((ADDED + 1))
done

if [ "$ADDED" -gt 0 ]; then
  # Trim any leading blank line the initial empty $CURRENT introduced
  printf '%s\n' "$NEW" | sed '/./,$!d' | crontab -
  echo "[setup-cron] $ADDED entries installed, $SKIPPED already present"
else
  echo "[setup-cron] nothing to do — all $SKIPPED entries already installed"
fi

echo
echo "──────── crontab -l ────────"
crontab -l | tail -25
