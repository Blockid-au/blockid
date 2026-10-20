#!/bin/bash
# L1-4 boot path wrapper — run by blockid-boot-serve.service at boot.
#
#   bash scripts/g30-boot-serve.sh            # apply (takes the deploy lock)
#   bash scripts/g30-boot-serve.sh --dry-run  # plan only; no lock, no change
#
# 1. takes /tmp/blockid-deploy.lock (waits up to BOOT_SERVE_LOCK_WAIT s);
# 2. loads web/.env exactly like deploy-live.sh (lib/load-env.sh);
# 3. runs g30-boot-serve.py --apply --lock-fd 200 (no-op when the active origin
#    is already healthy and routed);
# 4. on exit 10 (active release failed, fallback origin cold-started and
#    rebound) RELEASES the lock and hands off to the canonical warm rollback:
#    G30_REQUIRE_WARM_ROLLBACK=1 deploy-live.sh --rollback --wait;
# 5. re-verifies the serving origin (--verify-active) and nginx routing.
# Never stops or signals an origin. Exit 0 only when serving is verified.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="${BOOT_SERVE_LOG:-/data/logs/blockid-boot-serve.log}"
[ -w "$(dirname "$LOG")" ] || LOG="/tmp/blockid-boot-serve.log"
export PYTHONDONTWRITEBYTECODE=1
say() { printf '%s boot-serve: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG"; }

if [ "${1:-}" = "--dry-run" ]; then
  python3 "$SCRIPT_DIR/g30-boot-serve.py" --web "$WEB_DIR"
  exit $?
fi

# BOOT_SERVE_LOCK exists for the isolated wrapper test only: every lock-taking
# helper re-checks the canonical /tmp/blockid-deploy.lock inode and refuses
# any other file, so overriding it in production fails closed.
exec 200>"${BOOT_SERVE_LOCK:-/tmp/blockid-deploy.lock}"
if ! flock -x -w "${BOOT_SERVE_LOCK_WAIT:-900}" 200; then
  say "deploy lock still held after ${BOOT_SERVE_LOCK_WAIT:-900}s — giving up (no change)"
  exit 1
fi
# shellcheck source=lib/load-env.sh
source "$SCRIPT_DIR/lib/load-env.sh"
load_env

say "start (uptime $(cut -d' ' -f1 /proc/uptime)s, load $(cut -d' ' -f1-3 /proc/loadavg))"
RESULT=$(python3 "$SCRIPT_DIR/g30-boot-serve.py" --web "$WEB_DIR" --apply --lock-fd 200 2>>"$LOG")
rc=$?
say "controller exit $rc: $RESULT"
exec 200>&-   # release the lock before any hand-off; deploy-live takes it itself

if [ "$rc" = "10" ]; then
  EXPECTED=$(printf '%s' "$RESULT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["expectedActive"])') || exit 1
  say "active release failed — warm rollback hand-off (expected active :$EXPECTED)"
  G30_REQUIRE_WARM_ROLLBACK=1 G30_RECOVERY_EXPECTED_PORT="$EXPECTED" \
    bash "$SCRIPT_DIR/deploy-live.sh" --rollback --wait >> "$LOG" 2>&1
  rc=$?
  say "warm rollback exit $rc"
fi
[ "$rc" = "0" ] || { say "ESCALATE: serving origin not restored (exit $rc) — see $LOG"; exit 1; }

PORT=$(python3 "$SCRIPT_DIR/g30-serving-state.py" --web "$WEB_DIR" --port 2>>"$LOG") || { say "ESCALATE: serving state not stable"; exit 1; }
python3 "$SCRIPT_DIR/g30-serving-state.py" --web "$WEB_DIR" --verify-active >/dev/null 2>>"$LOG" \
  || { say "ESCALATE: active origin :$PORT failed identity verification"; exit 1; }
NGINX=$(python3 "$SCRIPT_DIR/g30-proxy-switch.py" --current-port 2>>"$LOG") || NGINX="?"
[ "$NGINX" = "$PORT" ] || { say "ESCALATE: nginx routes :$NGINX, serving state :$PORT"; exit 1; }
say "serving verified on :$PORT (nginx :$NGINX)"
exit 0
