#!/bin/bash
# disk-pressure-alert.sh — L0-4 (docs/pricing-v5-plan.md §3, lane W0).
#
# Why: on 2026-10-20 /data sat at 91% (252G/295G) while nobody was told.
#   - uptime-24x7-guardian.sh only sampled `df /`;
#   - blockid-disk-guard.service (root, every 5 min) exits 2 = "still over
#     80% after cleaning old /tmp logs", but StandardOutput=null and nothing
#     reads the failed unit state, so the failure was silent for weeks.
#
# What this does (called by uptime-24x7-guardian.sh every 2 min; read-only on
# the disk, never deletes anything):
#   1. `df -P` every mount in DISK_ALERT_MOUNTS (default "/ /data") and grade
#      it ok / warn (>= DISK_WARN_PCT, 85) / critical (>= DISK_CRIT_PCT, 92).
#   2. Read the disk-guard unit state (`systemctl show`, works unprivileged)
#      and grade it ok / failed (exit status other than 0 or 75) / unknown.
#   3. Send ONE ops alert per (mount, level, UTC day) — and one per day for a
#      failing disk-guard — through the existing ops path
#      (scripts/lib/ops-alert.sh: Telegram, then the e-mail fallback
#      web/scripts/ops-alert-email.mjs). Each alert also appends one line to
#      DISK_ALERT_LOG (~/.local/state/blockid-runtime/disk-alert.jsonl).
#   4. Print one JSON object on stdout; the guardian embeds it as "disk" in
#      web/content/reports/uptime-guardian.jsonl.
#
# Test / dry-run overrides (all optional):
#   DF_CMD                 df command, called as `$DF_CMD <mount>` (default `df -P`)
#   DISK_GUARD_STATUS_CMD  replaces `systemctl show <unit> -p Result -p ExecMainStatus ...`
#   DISK_GUARD_JOURNAL_CMD replaces `journalctl -u <unit> -n 30 -o cat` (summary JSON)
#   OPS_ALERT_CMD          called as `$OPS_ALERT_CMD "<title>" "<detail>"` instead of ops_alert
#   DISK_ALERT_DRY_RUN=1   print what would be sent; send nothing, record no dedupe state
#   DISK_ALERT_STATE_DIR   dedupe markers (one small file per mount+level, overwritten)
#   DISK_ALERT_TODAY       YYYY-MM-DD override for the dedupe day
#
#   DF_CMD=./fake-df DISK_ALERT_DRY_RUN=1 bash scripts/cron/disk-pressure-alert.sh

set -u

REPO="${DISK_ALERT_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MOUNTS="${DISK_ALERT_MOUNTS:-/ /data}"
WARN_PCT="${DISK_WARN_PCT:-85}"
CRIT_PCT="${DISK_CRIT_PCT:-92}"
DF_CMD="${DF_CMD:-df -P}"
RUNTIME_DIR="${BLOCKID_RUNTIME_STATE:-$HOME/.local/state/blockid-runtime}"
STATE_DIR="${DISK_ALERT_STATE_DIR:-$RUNTIME_DIR/disk-alert}"
EVENT_LOG="${DISK_ALERT_LOG:-$RUNTIME_DIR/disk-alert.jsonl}"
GUARD_UNIT="${DISK_GUARD_UNIT:-blockid-disk-guard.service}"
GUARD_STATUS_CMD="${DISK_GUARD_STATUS_CMD:-systemctl show $GUARD_UNIT -p Result -p ExecMainStatus -p ExecMainExitTimestamp --no-pager}"
GUARD_JOURNAL_CMD="${DISK_GUARD_JOURNAL_CMD:-journalctl -u $GUARD_UNIT -n 30 -o cat --no-pager}"
DRY_RUN="${DISK_ALERT_DRY_RUN:-0}"
TODAY="${DISK_ALERT_TODAY:-$(date -u +%F)}"
HOST="$(hostname -s 2>/dev/null || echo blockid)"
TS="$(date -u +%FT%TZ)"
[[ "$WARN_PCT" =~ ^[0-9]+$ ]] || WARN_PCT=85
[[ "$CRIT_PCT" =~ ^[0-9]+$ ]] || CRIT_PCT=92

mkdir -p "$STATE_DIR" "$(dirname "$EVENT_LOG")" 2>/dev/null || true

json_str() { # minimal JSON string escape for our own short values
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r\t')"
}

slug() { # "/" -> root, "/data" -> data, "/var/lib" -> var_lib
  local s="${1#/}"
  s="${s//\//_}"
  printf '%s' "${s:-root}"
}

# Returns 0 (and records the day) when this (key) has not alerted today.
claim_alert() {
  local marker="$STATE_DIR/$1"
  if [ "$(cat "$marker" 2>/dev/null)" = "$TODAY" ]; then
    return 1
  fi
  [ "$DRY_RUN" = "1" ] && return 0
  printf '%s\n' "$TODAY" > "$marker.tmp.$$" 2>/dev/null && mv -f "$marker.tmp.$$" "$marker" 2>/dev/null
  return 0
}

ALERTS_SENT=()
send_alert() { # key title detail
  local key="$1" title="$2" detail="$3"
  claim_alert "$key" || return 0
  if [ "$DRY_RUN" = "1" ]; then
    echo "[disk-pressure-alert] DRY RUN would alert: $title — $detail" >&2
  elif [ -n "${OPS_ALERT_CMD:-}" ]; then
    $OPS_ALERT_CMD "$title" "$detail" >/dev/null 2>&1 || true
  else
    OPS_REPO_ROOT="${OPS_REPO_ROOT:-$REPO}" timeout 60 bash -c \
      '. "$OPS_REPO_ROOT/scripts/lib/ops-alert.sh" && ops_alert "$1" "$2"' _ "$title" "$detail" \
      >/dev/null 2>&1 || true
  fi
  ALERTS_SENT+=("$key")
  if [ "$DRY_RUN" != "1" ]; then
    printf '{"ts":"%s","day":"%s","key":%s,"title":%s,"detail":%s,"host":%s}\n' \
      "$TS" "$TODAY" "$(json_str "$key")" "$(json_str "$title")" "$(json_str "$detail")" "$(json_str "$HOST")" \
      >> "$EVENT_LOG" 2>/dev/null || true
  fi
}

# ── 1. Mount usage ─────────────────────────────────────────────────────────
RANK_ok=0; RANK_warn=1; RANK_critical=2; RANK_unknown=0
WORST="ok"; WORST_RANK=0
DISKS_JSON=""
for mount in $MOUNTS; do
  line=$($DF_CMD "$mount" 2>/dev/null | awk 'NR==2')
  pct=$(printf '%s' "$line" | awk '{gsub("%","",$5); print $5}')
  avail_kb=$(printf '%s' "$line" | awk '{print $4}')
  size_kb=$(printf '%s' "$line" | awk '{print $2}')
  if ! [[ "$pct" =~ ^[0-9]+$ ]]; then
    level="unknown"; pct_json="null"
  else
    pct_json="$pct"
    if [ "$pct" -ge "$CRIT_PCT" ]; then level="critical"
    elif [ "$pct" -ge "$WARN_PCT" ]; then level="warn"
    else level="ok"; fi
  fi
  rank_var="RANK_$level"; rank="${!rank_var}"
  if [ "$rank" -gt "$WORST_RANK" ]; then WORST="$level"; WORST_RANK="$rank"; fi
  [[ "$avail_kb" =~ ^[0-9]+$ ]] || avail_kb=""
  [[ "$size_kb" =~ ^[0-9]+$ ]] || size_kb=""
  free_gb="null"; [ -n "$avail_kb" ] && free_gb=$((avail_kb / 1048576))
  size_gb="null"; [ -n "$size_kb" ] && size_gb=$((size_kb / 1048576))
  DISKS_JSON+="${DISKS_JSON:+,}{\"mount\":$(json_str "$mount"),\"pct\":$pct_json,\"free_gb\":$free_gb,\"size_gb\":$size_gb,\"level\":\"$level\"}"

  if [ "$level" = "warn" ] || [ "$level" = "critical" ]; then
    threshold="$WARN_PCT"; [ "$level" = "critical" ] && threshold="$CRIT_PCT"
    send_alert "$(slug "$mount").$level" \
      "Disk $level: $mount at ${pct}% on $HOST" \
      "$mount is ${pct}% full (>= ${threshold}%; ${free_gb} GB free of ${size_gb} GB). Releases/backups live on /data; deploys need ~3 GB each. Prune old releases with the deploy controller (L1-1) — nothing was deleted automatically. Next reminder for this level: tomorrow (UTC)."
  fi
done

# ── 2. blockid-disk-guard.service state ───────────────────────────────────
status_out=$($GUARD_STATUS_CMD 2>/dev/null || true)
g_result=$(printf '%s\n' "$status_out" | sed -n 's/^Result=//p' | head -1)
g_status=$(printf '%s\n' "$status_out" | sed -n 's/^ExecMainStatus=//p' | head -1)
g_exit_at=$(printf '%s\n' "$status_out" | sed -n 's/^ExecMainExitTimestamp=//p' | head -1)
[[ "$g_status" =~ ^[0-9]+$ ]] || g_status=""
if [ -z "$g_result" ] && [ -z "$g_status" ]; then
  g_level="unknown"
elif [ "$g_result" = "success" ] || [ "$g_status" = "0" ] || [ "$g_status" = "75" ]; then
  g_level="ok"   # 75 = deploy lock busy, skipped (SuccessExitStatus in the unit)
else
  g_level="failed"
fi
if [ "$g_level" = "failed" ]; then
  case "$g_status" in
    2) meaning="still over the 80% threshold after removing old /tmp logs (residual pressure)" ;;
    1) meaning="refused / failed closed (mount unavailable, no process visibility or summary write failed)" ;;
    *) meaning="unexpected failure" ;;
  esac
  # With StandardOutput=journal (repo unit) the last JSON summary names the
  # mount(s) under residual pressure. Best effort; adm group can read it.
  summary=$($GUARD_JOURNAL_CMD 2>/dev/null | grep '^{' | tail -1 | head -c 600)
  residual=$(printf '%s' "$summary" | sed -n 's/.*"residual_pressure": *\[\([^]]*\)\].*/\1/p' | tr -d '"')
  send_alert "disk-guard.failed" \
    "Disk guard failing on $HOST (exit ${g_status:-?})" \
    "$GUARD_UNIT result=${g_result:-?} exit=${g_status:-?} at ${g_exit_at:-?}: $meaning.${residual:+ Residual pressure on: $residual.} The guard only removes old /tmp build/deploy logs — capacity must be freed by release/backup retention. Inspect: journalctl -u $GUARD_UNIT -n 20. Next reminder: tomorrow (UTC)."
fi

# ── 3. Snapshot for the guardian JSONL ────────────────────────────────────
SENT_JSON=""
for k in "${ALERTS_SENT[@]+"${ALERTS_SENT[@]}"}"; do SENT_JSON+="${SENT_JSON:+,}$(json_str "$k")"; done
printf '{"disks":[%s],"disk_level":"%s","warn_pct":%s,"crit_pct":%s,"disk_guard":{"level":"%s","result":%s,"exit_status":%s},"alerts_sent":[%s]}\n' \
  "$DISKS_JSON" "$WORST" "$WARN_PCT" "$CRIT_PCT" "$g_level" "$(json_str "${g_result:-}")" "${g_status:-null}" "$SENT_JSON"
exit 0
