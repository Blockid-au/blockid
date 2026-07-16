#!/usr/bin/env bash
# ship-task.sh — per-task auto-pipeline for BlockID Guardian Foundation (G-02)
#
# Detects the task ID from the last commit message and runs a 12-step
# validate → build → deploy → verify pipeline with graceful rollback and
# Telegram notifications.
#
# Usage:
#   ship-task.sh [--dry-run] [--skip-tests] [--help]
#
# Exit codes:
#   0  success
#   1  hard failure (lint / typecheck / test / build / smoke / rollback)
#   2  bad usage
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants & paths
# ---------------------------------------------------------------------------
readonly REPO_ROOT="/home/dovanlong/blockid.au"
readonly WEB_DIR="${REPO_ROOT}/web"
readonly LOG_FILE="/tmp/blockid-ship-task.log"
readonly DEPLOY_LIVE="${WEB_DIR}/scripts/deploy-live.sh"
readonly DEPLOY_FALLBACK="${REPO_ROOT}/deploy.sh"
readonly VERSION_BUMP="${WEB_DIR}/scripts/version-bump.mjs"
readonly CHANGELOG="${WEB_DIR}/CHANGELOG.md"
readonly HEALTHZ_URL="https://blockid.au/api/healthz"
readonly TASK_ID_REGEX='T-[G0-9]+|T-0[0-9]+'

DRY_RUN=0
SKIP_TESTS=0
TASK_ID=""
START_EPOCH=$(date +%s)

# ---------------------------------------------------------------------------
# CLI parsing
# ---------------------------------------------------------------------------
usage() {
  cat <<'EOF'
ship-task.sh — per-task auto-pipeline

Usage:
  ship-task.sh [--dry-run] [--skip-tests] [--help]

Options:
  --dry-run      Run steps 1-6 only; skip push, deploy, smoke, GA4, announce
  --skip-tests   Skip lint / typecheck / test (steps 2-4)
  --help         Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --help|-h)    usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Logging helpers (always tee to LOG_FILE with ISO-8601 timestamps)
# ---------------------------------------------------------------------------
log() {
  local level="$1"; shift
  local ts msg
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  msg="[${ts}] [${level}] $*"
  printf '%s\n' "${msg}" | tee -a "${LOG_FILE}" >&2
}
log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_err()  { log "ERROR" "$@"; }
log_step() { log "STEP" "$@"; }

# ---------------------------------------------------------------------------
# Telegram helper (non-blocking, never fails the pipeline)
# ---------------------------------------------------------------------------
telegram() {
  local text="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    log_warn "Telegram creds missing; skipping notification: ${text}"
    return 0
  fi
  local url="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
  curl -sfS --max-time 10 \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    -d "parse_mode=HTML" \
    "${url}" >/dev/null 2>&1 \
    || log_warn "Telegram POST failed (non-fatal)"
  return 0
}

announce() {
  # $1=status emoji-prefixed, $2=duration seconds
  local status="$1" duration="$2"
  telegram "🚀 [ship-task] ${TASK_ID:-unknown} ${status} (${duration}s)"
}

duration_s() {
  echo $(( $(date +%s) - START_EPOCH ))
}

fatal() {
  local msg="$*"
  log_err "${msg}"
  announce "FAIL — ${msg}" "$(duration_s)"
  exit 1
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
touch "${LOG_FILE}" 2>/dev/null || true
log_info "======================================================"
log_info "ship-task.sh starting (dry_run=${DRY_RUN} skip_tests=${SKIP_TESTS})"
log_info "repo=${REPO_ROOT}"

cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Step 1 — Parse task ID from last commit
# ---------------------------------------------------------------------------
log_step "1/12 parse task id from last commit"
LAST_COMMIT_MSG="$(git log -1 --format=%B 2>/dev/null || echo '')"
if [[ -z "${LAST_COMMIT_MSG}" ]]; then
  fatal "cannot read last commit message"
fi
TASK_ID="$(printf '%s' "${LAST_COMMIT_MSG}" | grep -oE "${TASK_ID_REGEX}" | head -n1 || true)"
if [[ -z "${TASK_ID}" ]]; then
  log_warn "no task id matched regex ${TASK_ID_REGEX} in commit; using 'T-UNKNOWN'"
  TASK_ID="T-UNKNOWN"
fi
export TASK_ID
log_info "TASK_ID=${TASK_ID}"

# ---------------------------------------------------------------------------
# Step 2 — Lint
# ---------------------------------------------------------------------------
if (( SKIP_TESTS )); then
  log_step "2/12 lint — SKIPPED (--skip-tests)"
else
  log_step "2/12 lint"
  if ! pnpm --dir "${WEB_DIR}" lint --max-warnings=0 2>&1 | tee -a "${LOG_FILE}"; then
    fatal "lint failed"
  fi
fi

# ---------------------------------------------------------------------------
# Step 3 — Typecheck
# ---------------------------------------------------------------------------
if (( SKIP_TESTS )); then
  log_step "3/12 typecheck — SKIPPED (--skip-tests)"
else
  log_step "3/12 typecheck"
  if ! pnpm --dir "${WEB_DIR}" typecheck 2>&1 | tee -a "${LOG_FILE}"; then
    log_warn "pnpm typecheck script missing/failed; falling back to tsc --noEmit"
    if ! pnpm --dir "${WEB_DIR}" exec tsc --noEmit 2>&1 | tee -a "${LOG_FILE}"; then
      fatal "typecheck failed"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 4 — Test (changed files only)
# ---------------------------------------------------------------------------
if (( SKIP_TESTS )); then
  log_step "4/12 test — SKIPPED (--skip-tests)"
else
  log_step "4/12 test (--run --changed)"
  # Detect a test framework (vitest / jest) in web/package.json
  if [[ -f "${WEB_DIR}/package.json" ]] \
     && grep -qE '"(vitest|jest)"[[:space:]]*:' "${WEB_DIR}/package.json"; then
    if ! pnpm --dir "${WEB_DIR}" test --run --changed 2>&1 | tee -a "${LOG_FILE}"; then
      fatal "tests failed"
    fi
  else
    log_warn "no vitest/jest detected in web/package.json — skipping tests"
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 — Build
# ---------------------------------------------------------------------------
log_step "5/12 build"
if ! pnpm --dir "${WEB_DIR}" build 2>&1 | tee -a "${LOG_FILE}"; then
  telegram "❌ [ship-task] ${TASK_ID} build failed"
  fatal "build failed"
fi

# ---------------------------------------------------------------------------
# Step 6 — Migration dry-run (BEGIN … ROLLBACK)
# ---------------------------------------------------------------------------
log_step "6/12 migration dry-run"
MIGRATIONS_CHANGED="$(git diff HEAD~1 --name-only 2>/dev/null \
  | grep -E '^web/supabase/migrations/.*\.sql$' || true)"
if [[ -z "${MIGRATIONS_CHANGED}" ]]; then
  log_info "no migrations touched by last commit"
else
  if ! command -v docker >/dev/null 2>&1; then
    log_warn "docker not available; logging migration dry-run only"
    log_info "would dry-run: ${MIGRATIONS_CHANGED}"
  elif ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase-db$'; then
    log_warn "supabase-db container not running; logging migration dry-run only"
    log_info "would dry-run: ${MIGRATIONS_CHANGED}"
  else
    while IFS= read -r mig; do
      [[ -z "${mig}" ]] && continue
      local_path="${REPO_ROOT}/${mig}"
      if [[ ! -f "${local_path}" ]]; then
        log_warn "migration file missing on disk: ${mig}"
        continue
      fi
      log_info "dry-run migration: ${mig}"
      # Copy into container tmp and wrap in BEGIN/ROLLBACK
      docker cp "${local_path}" "supabase-db:/tmp/ship-task-mig.sql" \
        || fatal "failed to copy migration into container: ${mig}"
      if ! docker exec supabase-db psql -U postgres -v ON_ERROR_STOP=1 \
             -c "BEGIN; \i /tmp/ship-task-mig.sql; ROLLBACK;" \
             2>&1 | tee -a "${LOG_FILE}"; then
        fatal "migration dry-run failed: ${mig}"
      fi
    done <<< "${MIGRATIONS_CHANGED}"
  fi
fi

# ---------------------------------------------------------------------------
# Steps 7-12 gated by --dry-run
# ---------------------------------------------------------------------------
if (( DRY_RUN )); then
  DUR=$(duration_s)
  log_info "dry-run complete; skipping steps 7-12 (${DUR}s)"
  announce "DRY-RUN OK" "${DUR}"
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 7 — Push origin master (retry x3 on non-fast-forward)
# ---------------------------------------------------------------------------
log_step "7/12 git push origin master"
PUSH_OK=0
for attempt in 1 2 3; do
  if git push origin master 2>&1 | tee -a "${LOG_FILE}"; then
    PUSH_OK=1
    break
  fi
  log_warn "push attempt ${attempt} failed; pulling --rebase and retrying"
  git pull --rebase --autostash origin master 2>&1 | tee -a "${LOG_FILE}" || true
  sleep 2
done
(( PUSH_OK == 1 )) || fatal "git push failed after 3 attempts"

# ---------------------------------------------------------------------------
# Step 8 — Deploy prod
# ---------------------------------------------------------------------------
log_step "8/12 deploy prod"
DEPLOY_CMD=""
if [[ -x "${DEPLOY_LIVE}" || -f "${DEPLOY_LIVE}" ]]; then
  DEPLOY_CMD="${DEPLOY_LIVE}"
elif [[ -x "${DEPLOY_FALLBACK}" || -f "${DEPLOY_FALLBACK}" ]]; then
  DEPLOY_CMD="${DEPLOY_FALLBACK}"
  log_warn "using fallback deploy: ${DEPLOY_FALLBACK}"
else
  fatal "no deploy script found (${DEPLOY_LIVE} or ${DEPLOY_FALLBACK})"
fi
if ! bash "${DEPLOY_CMD}" 2>&1 | tee -a "${LOG_FILE}"; then
  fatal "deploy failed via ${DEPLOY_CMD}"
fi

# ---------------------------------------------------------------------------
# Rollback helper (used by steps 9 & 10)
# ---------------------------------------------------------------------------
attempt_rollback() {
  local reason="$1"
  log_err "rolling back due to: ${reason}"
  telegram "⚠️ [ship-task] ${TASK_ID} ${reason} — attempting rollback"
  if [[ -f "${DEPLOY_LIVE}" ]] \
     && grep -q -- '--rollback' "${DEPLOY_LIVE}" 2>/dev/null; then
    if bash "${DEPLOY_LIVE}" --rollback 2>&1 | tee -a "${LOG_FILE}"; then
      log_info "rollback completed"
      telegram "↩️ [ship-task] ${TASK_ID} rollback OK"
    else
      log_err "rollback command failed"
      telegram "🛑 [ship-task] ${TASK_ID} rollback FAILED — manual required"
    fi
  else
    log_err "deploy-live.sh --rollback not supported; MANUAL ROLLBACK REQUIRED"
    telegram "🛑 [ship-task] ${TASK_ID} manual rollback required"
  fi
}

# ---------------------------------------------------------------------------
# Step 9 — Post-deploy smoke (3× healthz, 5s apart, all 200)
# ---------------------------------------------------------------------------
log_step "9/12 smoke test ${HEALTHZ_URL} x3"
SMOKE_OK=1
for i in 1 2 3; do
  code="$(curl -sfS -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTHZ_URL}" || echo '000')"
  log_info "smoke #${i}: HTTP ${code}"
  if [[ "${code}" != "200" ]]; then
    SMOKE_OK=0
    break
  fi
  [[ "${i}" -lt 3 ]] && sleep 5
done
if (( SMOKE_OK == 0 )); then
  attempt_rollback "smoke test failed"
  fatal "post-deploy smoke failed"
fi

# ---------------------------------------------------------------------------
# Step 10 — GA4 Measurement Protocol probe (optional)
# ---------------------------------------------------------------------------
log_step "10/12 GA4 probe"
if [[ -n "${GA4_MEASUREMENT_ID:-}" && -n "${GA4_API_SECRET:-}" ]]; then
  ga_url="https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}"
  ga_payload="{\"client_id\":\"ship-task.${TASK_ID}\",\"events\":[{\"name\":\"ship_task_deploy\",\"params\":{\"task_id\":\"${TASK_ID}\"}}]}"
  ga_code="$(curl -sfS -o /dev/null -w '%{http_code}' --max-time 10 \
              -H 'Content-Type: application/json' \
              -d "${ga_payload}" "${ga_url}" || echo '000')"
  log_info "GA4 probe HTTP ${ga_code}"
  # GA4 MP returns 204 on success; treat 2xx as OK
  if [[ ! "${ga_code}" =~ ^2[0-9][0-9]$ ]]; then
    attempt_rollback "GA4 probe failed (HTTP ${ga_code})"
    fatal "GA4 probe failed"
  fi
else
  log_warn "GA4_MEASUREMENT_ID / GA4_API_SECRET not set; skipping"
fi

# ---------------------------------------------------------------------------
# Step 11 — (Rollback path is inline in steps 9/10; nothing to do on success)
# ---------------------------------------------------------------------------
log_step "11/12 rollback gate — not triggered"

# ---------------------------------------------------------------------------
# Step 12 — Version bump + CHANGELOG + Telegram success
# ---------------------------------------------------------------------------
log_step "12/12 finalize (version bump, changelog, announce)"
NEW_VERSION="unknown"
if [[ -f "${VERSION_BUMP}" ]]; then
  if bump_out="$(node "${VERSION_BUMP}" 2>&1)"; then
    printf '%s\n' "${bump_out}" | tee -a "${LOG_FILE}" >/dev/null
    # Best-effort parse: look for a semver anywhere in output
    NEW_VERSION="$(printf '%s\n' "${bump_out}" \
      | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | tail -n1 || echo 'unknown')"
  else
    log_warn "version-bump.mjs failed (non-fatal)"
  fi
else
  log_warn "version-bump.mjs not found at ${VERSION_BUMP}"
fi

# Append to CHANGELOG (create if missing)
if [[ ! -f "${CHANGELOG}" ]]; then
  printf '# Changelog\n\n' > "${CHANGELOG}"
fi
{
  printf -- '- %s | %s | v%s | shipped\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${TASK_ID}" "${NEW_VERSION}"
} >> "${CHANGELOG}"

DUR=$(duration_s)
log_info "ship-task complete: ${TASK_ID} v${NEW_VERSION} in ${DUR}s"
telegram "🚀 [ship-task] ${TASK_ID} OK v${NEW_VERSION} (${DUR}s)"
exit 0
