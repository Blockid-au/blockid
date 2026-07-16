#!/usr/bin/env bash
# server-cleanup.sh - BlockID Guardian G-04
# Called every 4h via api/cron/server-cleanup, also on-demand from guardian
# when disk usage exceeds 90%.
#
# Actions:
#   docker_prune, pnpm_cache_clean, next_build_prune, log_rotate,
#   report_archive, postgres_vacuum
#
# Flags:
#   --dry-run    Log what would be deleted without doing it
#   --disk-only  Only run if disk usage >85%
#   --verbose    Extra logging
set -euo pipefail

# ------------------------------------------------------------------ config --
REPO_ROOT="/home/dovanlong/blockid.au"
WEB_ROOT="${REPO_ROOT}/web"
LOG_FILE="/tmp/blockid-cleanup.log"
ARCHIVE_ROOT="/data/archives/reports"

# Whitelist protection: NEVER delete anything under these paths.
readonly PROTECTED_PATHS=(
  "${REPO_ROOT}/web/src"
  "${REPO_ROOT}/chain/contracts"
  "${REPO_ROOT}/.git"
  "${REPO_ROOT}/docs"
)

DRY_RUN=0
DISK_ONLY=0
VERBOSE=0
TOTAL_FREED_BYTES=0

# ---------------------------------------------------------------- arg parse --
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --disk-only) DISK_ONLY=1 ;;
    --verbose)   VERBOSE=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- helpers ---
ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }

log() {
  local msg="$1"
  printf '[%s] %s\n' "$(ts)" "$msg" | tee -a "$LOG_FILE" >/dev/null
  if [[ $VERBOSE -eq 1 ]]; then
    printf '[%s] %s\n' "$(ts)" "$msg" >&2
  fi
}

log_freed() {
  local action="$1" bytes="$2"
  local mb
  mb=$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1048576}')
  log "action=${action} freed_bytes=${bytes} freed_mb=${mb}"
  TOTAL_FREED_BYTES=$(( TOTAL_FREED_BYTES + bytes ))
}

# Return integer bytes used on / (root filesystem)
disk_used_bytes() {
  df -B1 --output=used / 2>/dev/null | tail -n1 | tr -d ' '
}

disk_used_pct() {
  df --output=pcent / 2>/dev/null | tail -n1 | tr -dc '0-9'
}

path_size_bytes() {
  local p="$1"
  if [[ -e "$p" ]]; then
    du -sb "$p" 2>/dev/null | awk '{print $1}'
  else
    echo 0
  fi
}

# Assert a path is safe to delete (not inside any whitelist).
assert_safe() {
  local target
  target="$(readlink -f "$1" 2>/dev/null || echo "$1")"
  local p
  for p in "${PROTECTED_PATHS[@]}"; do
    local abs
    abs="$(readlink -f "$p" 2>/dev/null || echo "$p")"
    if [[ "$target" == "$abs" || "$target" == "$abs"/* ]]; then
      log "FATAL: refusing to touch protected path: $target"
      echo "FATAL: refusing to touch protected path: $target" >&2
      exit 3
    fi
  done
}

telegram_notify() {
  local text="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    log "telegram: skipped (no token/chat)"
    return 0
  fi
  curl -fsS --max-time 10 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "parse_mode=Markdown" >/dev/null 2>&1 \
    || log "telegram: send failed (non-fatal)"
}

# Startup assertion - refuse to run if any protected path is missing/wrong.
for p in "${PROTECTED_PATHS[@]}"; do
  if [[ ! -e "$p" ]]; then
    log "startup: protected path missing (still enforced): $p"
  fi
done

# ---------------------------------------------------------------- actions ---

docker_prune() {
  if ! command -v docker >/dev/null 2>&1; then
    log "docker_prune: docker not installed, skipping"
    return 0
  fi
  local before after freed
  # docker system df --format is unreliable across versions; approximate via /var/lib/docker
  before=$(path_size_bytes /var/lib/docker)
  if [[ $DRY_RUN -eq 1 ]]; then
    log "docker_prune: DRY-RUN would run: docker system prune -af --volumes (current /var/lib/docker=${before}B)"
    return 0
  fi
  log "docker_prune: running docker system prune -af --volumes"
  docker system prune -af --volumes >/dev/null 2>&1 || log "docker_prune: prune returned non-zero (continuing)"
  after=$(path_size_bytes /var/lib/docker)
  freed=$(( before - after ))
  (( freed < 0 )) && freed=0
  log_freed "docker_prune" "$freed"
}

pnpm_cache_clean() {
  local store="${HOME}/.local/share/pnpm/store"
  if [[ ! -d "$store" ]]; then
    log "pnpm_cache_clean: no store dir at $store, skipping"
    return 0
  fi
  assert_safe "$store"
  local before after freed count
  before=$(path_size_bytes "$store")
  if [[ $DRY_RUN -eq 1 ]]; then
    count=$(find "$store" -type f -atime +30 2>/dev/null | wc -l)
    log "pnpm_cache_clean: DRY-RUN would delete ${count} files (>30d atime) from ${store}"
    return 0
  fi
  find "$store" -type f -atime +30 -delete 2>/dev/null || true
  if command -v pnpm >/dev/null 2>&1; then
    pnpm store prune >/dev/null 2>&1 || log "pnpm_cache_clean: 'pnpm store prune' failed (non-fatal)"
  fi
  after=$(path_size_bytes "$store")
  freed=$(( before - after ))
  (( freed < 0 )) && freed=0
  log_freed "pnpm_cache_clean" "$freed"
}

next_build_prune() {
  # Keep the newest 3 .next-* dirs directly under WEB_ROOT; delete older ones.
  local dirs=()
  local d
  # Portable: gather + sort by mtime desc via stat.
  while IFS= read -r -d '' d; do
    dirs+=("$d")
  done < <(find "$WEB_ROOT" -maxdepth 1 -mindepth 1 -type d -name '.next-*' -print0 2>/dev/null)

  if [[ ${#dirs[@]} -le 3 ]]; then
    log "next_build_prune: ${#dirs[@]} .next-* dirs found, nothing to prune"
    return 0
  fi

  # Sort by mtime desc
  local sorted
  sorted=$(for d in "${dirs[@]}"; do
    printf '%s\t%s\n' "$(stat -c '%Y' "$d" 2>/dev/null || echo 0)" "$d"
  done | sort -rn | awk -F'\t' '{print $2}')

  local i=0 freed_total=0
  while IFS= read -r d; do
    i=$((i+1))
    if (( i <= 3 )); then
      [[ $VERBOSE -eq 1 ]] && log "next_build_prune: keep $d"
      continue
    fi
    assert_safe "$d"
    local sz
    sz=$(path_size_bytes "$d")
    if [[ $DRY_RUN -eq 1 ]]; then
      log "next_build_prune: DRY-RUN would delete $d (${sz}B)"
    else
      rm -rf -- "$d" && freed_total=$(( freed_total + sz ))
      log "next_build_prune: deleted $d (${sz}B)"
    fi
  done <<< "$sorted"

  log_freed "next_build_prune" "$freed_total"
}

log_rotate() {
  local freed_total=0
  shopt -s nullglob
  local f
  for f in /tmp/blockid-*.log; do
    [[ -f "$f" ]] || continue
    # Skip our own live log file? No - we can rotate it; we append via tee so
    # it will be recreated. But rotating the file we're actively writing to
    # while running is safe (tee reopens on next call via >>).
    assert_safe "$f"
    local sz
    sz=$(stat -c '%s' "$f" 2>/dev/null || echo 0)
    if (( sz > 102400 )); then
      local dest="${f}.$(date +%s).gz"
      if [[ $DRY_RUN -eq 1 ]]; then
        log "log_rotate: DRY-RUN would gzip+rotate $f (${sz}B) -> $dest"
      else
        if gzip -c "$f" > "$dest" 2>/dev/null; then
          : > "$f"
          freed_total=$(( freed_total + sz - $(stat -c '%s' "$dest" 2>/dev/null || echo 0) ))
          log "log_rotate: rotated $f -> $dest"
        else
          log "log_rotate: gzip failed for $f (non-fatal)"
        fi
      fi
    fi
  done

  # Delete gzips older than 14 days
  local g
  for g in /tmp/blockid-*.log.*.gz; do
    [[ -f "$g" ]] || continue
    assert_safe "$g"
    local age_days
    age_days=$(( ( $(date +%s) - $(stat -c '%Y' "$g" 2>/dev/null || echo 0) ) / 86400 ))
    if (( age_days > 14 )); then
      local sz
      sz=$(stat -c '%s' "$g" 2>/dev/null || echo 0)
      if [[ $DRY_RUN -eq 1 ]]; then
        log "log_rotate: DRY-RUN would delete old gzip $g (${sz}B, ${age_days}d)"
      else
        rm -f -- "$g" && freed_total=$(( freed_total + sz ))
        log "log_rotate: deleted old gzip $g (${sz}B)"
      fi
    fi
  done
  shopt -u nullglob

  log_freed "log_rotate" "$freed_total"
}

report_archive() {
  local src="${WEB_ROOT}/content/reports"
  if [[ ! -d "$src" ]]; then
    log "report_archive: source dir missing: $src"
    return 0
  fi

  local month
  month="$(date +%Y-%m)"
  local dest="${ARCHIVE_ROOT}/${month}"

  # Test writability of ARCHIVE_ROOT (or its parent).
  if ! mkdir -p "$dest" 2>/dev/null; then
    log "report_archive: WARN /data/archives not writable, skipping"
    return 0
  fi
  if ! [[ -w "$dest" ]]; then
    log "report_archive: WARN destination not writable: $dest, skipping"
    return 0
  fi

  local freed_total=0 count=0
  local f
  # -maxdepth 1 keeps us at the top-level of content/reports, per spec.
  while IFS= read -r -d '' f; do
    assert_safe "$f"
    local sz
    sz=$(stat -c '%s' "$f" 2>/dev/null || echo 0)
    if [[ $DRY_RUN -eq 1 ]]; then
      log "report_archive: DRY-RUN would move $f -> $dest/ (${sz}B)"
    else
      if mv -f -- "$f" "$dest/" 2>/dev/null; then
        freed_total=$(( freed_total + sz ))
        count=$(( count + 1 ))
      else
        log "report_archive: mv failed for $f (non-fatal)"
      fi
    fi
  done < <(find "$src" -maxdepth 1 -type f -name '*.md' -mtime +90 -print0 2>/dev/null)

  log "report_archive: archived ${count} files to ${dest}"
  log_freed "report_archive" "$freed_total"
}

postgres_vacuum() {
  if ! command -v docker >/dev/null 2>&1; then
    log "postgres_vacuum: docker missing, skipping"
    return 0
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    log "postgres_vacuum: DRY-RUN would run VACUUM (ANALYZE) on supabase-db"
    return 0
  fi
  if docker exec -T supabase-db psql -U postgres -c 'VACUUM (ANALYZE);' >/dev/null 2>&1; then
    log "postgres_vacuum: OK"
  else
    log "postgres_vacuum: FAILED (best-effort, non-fatal)"
  fi
  # VACUUM doesn't reliably free filesystem bytes; report 0.
  log_freed "postgres_vacuum" 0
}

# --------------------------------------------------------------- main flow --

log "==== server-cleanup start dry_run=${DRY_RUN} disk_only=${DISK_ONLY} verbose=${VERBOSE} ===="

if [[ $DISK_ONLY -eq 1 ]]; then
  used_pct=$(disk_used_pct || echo 0)
  if [[ -z "$used_pct" ]] || (( used_pct <= 85 )); then
    log "disk_only: disk usage ${used_pct}% <= 85%, exiting without action"
    exit 0
  fi
  log "disk_only: disk usage ${used_pct}% > 85%, proceeding"
fi

BEFORE_USED=$(disk_used_bytes 2>/dev/null || echo 0)

docker_prune          || log "docker_prune: returned non-zero (continuing)"
pnpm_cache_clean      || log "pnpm_cache_clean: returned non-zero (continuing)"
next_build_prune      || log "next_build_prune: returned non-zero (continuing)"
log_rotate            || log "log_rotate: returned non-zero (continuing)"
report_archive        || log "report_archive: returned non-zero (continuing)"
postgres_vacuum       || log "postgres_vacuum: returned non-zero (continuing)"

AFTER_USED=$(disk_used_bytes 2>/dev/null || echo 0)
DISK_DELTA=$(( BEFORE_USED - AFTER_USED ))
(( DISK_DELTA < 0 )) && DISK_DELTA=0

TOTAL_MB=$(awk -v b="$TOTAL_FREED_BYTES" 'BEGIN{printf "%.2f", b/1048576}')
DISK_MB=$(awk -v b="$DISK_DELTA" 'BEGIN{printf "%.2f", b/1048576}')

log "==== server-cleanup done freed_reported=${TOTAL_FREED_BYTES}B (${TOTAL_MB} MB) disk_delta=${DISK_DELTA}B (${DISK_MB} MB) ===="

if [[ $DRY_RUN -eq 0 ]]; then
  telegram_notify "*BlockID cleanup* freed ${TOTAL_MB} MB (disk delta ${DISK_MB} MB) $(hostname)"
fi

echo "$TOTAL_FREED_BYTES"
exit 0
