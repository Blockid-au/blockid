#!/usr/bin/env bash
# BlockID.au — daily Postgres backup
#
# pg_dumps the Supabase public schema (+ auth) to /data/backups/db-<ts>.sql.gz
# and rotates: keep last 14 dailies. Runs from the supabase-db container so
# we don't depend on the host having pg_dump installed.
#
# Idempotent: safe to re-invoke; each run creates a fresh timestamped file.
# Exit codes: 0 always (never wake up cron mail). backup-verify.sh + cron-
# alarm.sh surface silent failures via cron-incidents.jsonl / Telegram.
#
# Install via web/scripts/setup-cron.sh (entry marker: blockid-cron:db-backup).

set -u
umask 077

BACKUP_DIR="/data/backups"
KEEP_DAYS=14
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/db-${TS}.sql.gz"
TMP="${BACKUP_DIR}/.db-${TS}.sql.gz.partial"
LOG_JSONL="/home/dovanlong/blockid.au/web/content/reports/backup-health.jsonl"

mkdir -p "${BACKUP_DIR}" 2>/dev/null || true

start_epoch=$(date -u +%s)

if ! docker exec supabase-db pg_dump -U postgres -Fc --no-owner --no-privileges postgres 2>/dev/null | gzip -c > "${TMP}"; then
  rm -f "${TMP}"
  size=0
  status="fail"
else
  mv -f "${TMP}" "${OUT}"
  size=$(stat -c%s "${OUT}" 2>/dev/null || echo 0)
  status="ok"
fi

end_epoch=$(date -u +%s)
duration_ms=$(( (end_epoch - start_epoch) * 1000 ))

# Rotate: delete backups older than KEEP_DAYS.
find "${BACKUP_DIR}" -maxdepth 1 -name 'db-*.sql.gz' -type f -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true

# Append a single health line for backup-verify / cron-alarm to see.
{
  printf '{"ts":"%s","job":"db-backup","status":"%s","file":"%s","sizeBytes":%s,"duration_ms":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${status}" "${OUT}" "${size}" "${duration_ms}"
} >> "${LOG_JSONL}" 2>/dev/null || true

exit 0
