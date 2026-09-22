#!/bin/bash
# G30 origin watchdog: monitor the serving instance, never kill retained jobs.
# Recovery belongs to deploy-live's serialized warm rollback controller.
set -u

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${G30_WATCHDOG_LOG:-/tmp/blockid-watchdog.log}"
STRIKE_FILE="${G30_WATCHDOG_STRIKE:-/tmp/blockid-watchdog.strike}"
STATE_HELPER="$WEB_DIR/scripts/g30-serving-state.py"
STATE_FILE="$WEB_DIR/content/reports/g30-serving-state.json"
log() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

RECONCILE_SWITCH=0
if ! PORT=$(python3 "$STATE_HELPER" --web "$WEB_DIR" --port 2>> "$LOG"); then
  # A structurally valid switching record can outlive a crashed controller.
  # Reconciliation is allowed only through the locked warm controller; an
  # active deployment still owns its lock, so this watchdog defers below.
  if ! SNAPSHOT=$(python3 "$STATE_HELPER" --web "$WEB_DIR" --snapshot 2>> "$LOG") || \
      ! PORT=$(printf '%s' "$SNAPSHOT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["phase"]=="switching"; print(d["active"]["port"])' 2>> "$LOG"); then
    log "recovery deferred: serving state invalid; no process touched"
    exit 1
  fi
  RECONCILE_SWITCH=1
fi
HTTP="switching"
IDENTITY_OK=0
if [ "$RECONCILE_SWITCH" = "0" ]; then
  HTTP=$(curl -s --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null || true)
  IDENTITY_OK=1
  if [ -e "$STATE_FILE" ] || [ -L "$STATE_FILE" ]; then
    python3 "$STATE_HELPER" --web "$WEB_DIR" --verify-active >/dev/null 2>> "$LOG" || IDENTITY_OK=0
  fi
fi
if [ "$HTTP" = "200" ] && [ "$IDENTITY_OK" = "1" ]; then
  rm -f "$STRIKE_FILE"
  exit 0
fi
# Port-specific strikes avoid carrying an old instance's incident across cutover.
LAST_PORT="$(cat "$STRIKE_FILE" 2>/dev/null || true)"
if [ "$RECONCILE_SWITCH" = "0" ] && [ "$LAST_PORT" != "$PORT" ]; then
  printf '%s\n' "$PORT" > "$STRIKE_FILE"
  log "strike 1: origin=$PORT HTTP=${HTTP:-000} identity_ok=$IDENTITY_OK; preserving process and jobs"
  exit 0
fi
if [ ! -e "$STATE_FILE" ]; then
  log "ESCALATE: bootstrap origin unhealthy; no verified warm recovery state; no process touched"
  exit 1
fi
if ! flock -n /tmp/blockid-deploy.lock true 2>/dev/null; then
  log "recovery deferred: deployment/recovery owns lock"
  exit 0
fi
# The controller acquires the lock itself, rechecks expected active port, and
# rejects cold recovery. Holding another FD here would deadlock its lock.
log "requesting serialized warm rollback: expected_origin=$PORT HTTP=${HTTP:-000} identity_ok=$IDENTITY_OK"
if G30_REQUIRE_WARM_ROLLBACK=1 G30_RECOVERY_EXPECTED_PORT="$PORT" \
    timeout 90 bash "$WEB_DIR/scripts/deploy-live.sh" --rollback >> "$LOG" 2>&1; then
  if NEW_PORT=$(python3 "$STATE_HELPER" --web "$WEB_DIR" --port 2>> "$LOG") && \
      python3 "$STATE_HELPER" --web "$WEB_DIR" --verify-active >/dev/null 2>> "$LOG"; then
    log "warm recovery verified: origin=$NEW_PORT"
    rm -f "$STRIKE_FILE"
    exit 0
  fi
fi
log "ESCALATE: warm recovery failed/deferred or verification failed; no watchdog kill/restart attempted"
exit 1
