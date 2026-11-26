#!/bin/bash
# satellite-uptime.sh — G36 (2026-11-25) 24/7 probe for the sites the existing
# watchers do not cover: hr / eth / scan.blockid.au (GCP VM
# instance-20260925-150844-eth-blockid, project auschain-489904) and
# startupvalueindex.com (this server, :4202 behind nginx).
#
# blockid.au itself stays with uptime-watcher.sh (1 min, rollback) +
# watchdog.sh + uptime-24x7-guardian.sh — this script never touches it.
#
# Every 2 minutes (crontab):
#   */2 * * * * bash /home/dovanlong/blockid.au/scripts/cron/satellite-uptime.sh
#
# Per host: HTML must be 200 AND the first /assets/*.js (Vite) or
# /_next/static/*.js (Next) it references must load (catches "HTML up,
# app blank"). 3 consecutive failures → one P1 ops alert per incident;
# recovery → one P2 note.
#
# VM self-heal: when ALL three VM hosts are failing and the VM is not RUNNING
# (Spot preemption history 27/09 + 27/10), start it — unless the kill switch
# ~/.config/blockid/no-vm-autostart exists. A start can change the ephemeral
# IP; DNS sync on the VM is not configured (/etc/blockid/cloudflare.env
# missing), so the alert names the new IP for the founder to update the three
# A records. Never deploys, never touches git.

set -u
STATE_DIR="${HOME}/.local/state/blockid-runtime/satellite-uptime"
LOG="/data/logs/blockid-satellite-uptime.log"
[ -w "$(dirname "$LOG")" ] || LOG="${STATE_DIR}/satellite-uptime.log"
mkdir -p "$STATE_DIR"
# shellcheck source=../lib/ops-alert.sh
source /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh

VM_NAME="instance-20260925-150844-eth-blockid"
VM_PROJECT="auschain-489904"
VM_ZONE="australia-southeast1-b"
VM_HOSTS="hr.blockid.au eth.blockid.au scan.blockid.au"
HOSTS="${SATELLITE_HOSTS:-$VM_HOSTS startupvalueindex.com}"
ALERT_AFTER=3

now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(now) $*" >> "$LOG"; }

if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 204800 ]; then
  tail -500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

api_path() { # G36: static HTML stayed 200 while the VM disk was full and every
  # DB-backed API timed out (25/11) — probe one DB-backed endpoint per host.
  case "$1" in
    eth.blockid.au) echo "/api/v1/platform/stats" ;;
    hr.blockid.au) echo "/api/v1/auth/config" ;;
    scan.blockid.au) echo "/api/v2/stats" ;;
    *) echo "" ;;
  esac
}

probe() { # $1 host → echoes "200" or a failure code
  local host="$1" html code asset acode api
  api=$(api_path "$host")
  if [ -n "$api" ]; then
    acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${host}${api}")
    [ "$acode" = "200" ] || { echo "api_${acode}"; return; }
  fi
  html=$(curl -s --max-time 10 -w '\n%{http_code}' "https://${host}/")
  code=$(printf '%s' "$html" | tail -1)
  [ "$code" = "200" ] || { echo "$code"; return; }
  asset=$(printf '%s' "$html" | grep -oE '(src|href)="/(assets|_next/static)/[^"]+\.js"' | head -1 | sed -E 's/^(src|href)="//; s/"$//')
  if [ -n "$asset" ]; then
    acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${host}${asset}")
    [ "$acode" = "200" ] || { echo "asset_${acode}"; return; }
  fi
  echo 200
}

vm_fail_count=0
for host in $HOSTS; do
  sf="${STATE_DIR}/${host}"
  fails=$(cat "$sf" 2>/dev/null || echo 0)
  fails=${fails:-0}
  code=$(probe "$host")
  if [ "$code" = "200" ]; then
    if [ "$fails" -ge "$ALERT_AFTER" ]; then
      log "RECOVER $host after $fails fails"
      ops_alert "✅ ${host} recovered" "Back to HTTP 200 after ${fails} consecutive failed probes (satellite-uptime)." P2
    elif [ "$fails" -gt 0 ]; then
      log "recover $host after $fails fail(s)"
    fi
    echo 0 > "$sf"
    continue
  fi
  fails=$((fails + 1))
  echo "$fails" > "$sf"
  log "FAIL $host code=$code fails=$fails"
  case " $VM_HOSTS " in *" $host "*) vm_fail_count=$((vm_fail_count + 1));; esac
  if [ "$fails" -eq "$ALERT_AFTER" ]; then
    ops_alert "🔴 ${host} DOWN" "https://${host}/ failed ${fails} probes in a row (last: ${code}). Checked every 2 min by scripts/cron/satellite-uptime.sh." P1
  fi
done

# ── Liveness beyond HTTP (G36 tick 5, 26/11) ────────────────────────────────
# 05/11 → 26/11 the VM's chain (evmd) stopped producing blocks and both AI
# workers were dead after the disk-full incident, while every page and API
# above answered 200. The VM's own ops monitor flagged both as critical but
# its SMTP is not configured, so nobody was told for three weeks.
#   1. every run: newest block on scan.blockid.au must be < CHAIN_STALE_S old;
#   2. every VM_CHECK_EVERY_S: read the VM's own critical ops checks over
#      gcloud ssh (read-only SELECT) and alert on them here.
# Same 3-strike / one-alert-per-incident rule as the HTTP probes.
CHAIN_STALE_S="${CHAIN_STALE_S:-600}"
VM_CHECK_EVERY_S="${VM_CHECK_EVERY_S:-600}"

track() { # $1 key, $2 ok|fail, $3 alert title, $4 detail
  local sf="${STATE_DIR}/${1}" fails
  fails=$(cat "$sf" 2>/dev/null || echo 0); fails=${fails:-0}
  if [ "$2" = ok ]; then
    if [ "$fails" -ge "$ALERT_AFTER" ]; then
      log "RECOVER $1 after $fails fails"
      ops_alert "✅ ${3} recovered" "${4}" P2
    fi
    echo 0 > "$sf"; return
  fi
  fails=$((fails + 1)); echo "$fails" > "$sf"
  log "FAIL $1 fails=$fails $4"
  [ "$fails" -eq "$ALERT_AFTER" ] && ops_alert "🔴 ${3}" "${4} (satellite-uptime, checked ${ALERT_AFTER}× in a row)" P1
}

chain_age=$(curl -s --max-time 15 "https://scan.blockid.au/api/v2/blocks?type=block" | python3 -c '
import sys, json, datetime
i = json.load(sys.stdin)["items"][0]
t = datetime.datetime.fromisoformat(i["timestamp"].replace("Z", "+00:00")).timestamp()
print(int(datetime.datetime.now(datetime.timezone.utc).timestamp() - t), i["height"])' 2>/dev/null)
if [ -n "$chain_age" ] && [ "${chain_age%% *}" -lt "$CHAIN_STALE_S" ]; then
  track chain-blocks ok "BlockID Chain" "Newest block ${chain_age#* } is ${chain_age%% *} s old."
elif [ -n "$chain_age" ]; then
  track chain-blocks fail "BlockID Chain halted" "Newest block ${chain_age#* } on scan.blockid.au is ${chain_age%% *} s old (limit ${CHAIN_STALE_S} s). Runbook eth-blockid docs/RUNBOOK-INCIDENTS.md#chain-halted: snapshot /mnt/app-data/evmd, then \$DC restart evmd."
fi # empty = scan API down, already covered by the scan.blockid.au probe

vm_stamp="${STATE_DIR}/vm-checks.last"
if command -v gcloud >/dev/null 2>&1 && [ $(( $(date +%s) - $(cat "$vm_stamp" 2>/dev/null || echo 0) )) -ge "$VM_CHECK_EVERY_S" ]; then
  date +%s > "$vm_stamp"
  # One read-only query; prints "check_id|status|detail" for each critical check,
  # plus "__monitor|stale|<age> s" when the VM's monitor itself stopped writing.
  vm_out=$(timeout 90 gcloud compute ssh "$VM_NAME" --project "$VM_PROJECT" --zone "$VM_ZONE" --quiet --command 'bash -s' 2>/dev/null <<'VMQ'
sudo docker exec -i blockid-app-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1' <<'SQL'
select check_id, status, left(detail, 160) from studio.ops_checks_state
 where status = 'critical' and check_id not like '\_%';
select '__monitor', 'stale', extract(epoch from now() - max(updated_at))::int || ' s'
  from studio.ops_checks_state having max(updated_at) < now() - interval '15 minutes';
SQL
VMQ
)
  vm_rc=$?
  # A probe that can never run (expired ssh key, container renamed, IAM change)
  # must not go silent again: 3 failed runs in a row (30 min) alert too.
  if [ "$vm_rc" -eq 0 ]; then
    track vm-ops-ssh ok "hr/eth VM ops-check probe" "gcloud ssh + query work again."
  else
    track vm-ops-ssh fail "hr/eth VM ops-check probe broken" "gcloud ssh / docker exec / psql to the VM failed (rc=${vm_rc}); critical ops checks on the VM are not being watched. Check: gcloud compute ssh ${VM_NAME} --zone ${VM_ZONE} --project ${VM_PROJECT}; container blockid-app-postgres-1."
  fi
  if [ "$vm_rc" -eq 0 ]; then
    if [ -z "$vm_out" ]; then
      track vm-ops-checks ok "hr/eth VM ops checks" "No critical checks on the VM."
    else
      track vm-ops-checks fail "hr/eth VM critical ops checks" "$(printf '%s' "$vm_out" | tr '\n' ';' | cut -c1-600) — runbook: eth-blockid docs/RUNBOOK-INCIDENTS.md"
    fi
  fi
fi

# VM self-heal: only when every VM host is failing (a single-site fault is an
# app problem on the VM, not a stopped VM).
vm_hosts_n=$(echo $VM_HOSTS | wc -w)
if [ "$vm_fail_count" -eq "$vm_hosts_n" ] && command -v gcloud >/dev/null 2>&1; then
  status=$(timeout 60 gcloud compute instances describe "$VM_NAME" --project "$VM_PROJECT" --zone "$VM_ZONE" --format='value(status)' 2>/dev/null)
  log "VM status=${status:-unknown}"
  if [ -n "$status" ] && [ "$status" != "RUNNING" ] && [ "$status" != "STAGING" ] && [ "$status" != "PROVISIONING" ]; then
    if [ -f "${HOME}/.config/blockid/no-vm-autostart" ]; then
      log "VM $status — autostart disabled by kill switch"
    else
      old_ip=$(cat "${STATE_DIR}/vm-ip" 2>/dev/null || echo "34.151.171.106")
      log "VM $status — starting"
      timeout 180 gcloud compute instances start "$VM_NAME" --project "$VM_PROJECT" --zone "$VM_ZONE" --quiet >> "$LOG" 2>&1
      new_ip=$(timeout 60 gcloud compute instances describe "$VM_NAME" --project "$VM_PROJECT" --zone "$VM_ZONE" --format='value(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null)
      [ -n "$new_ip" ] && echo "$new_ip" > "${STATE_DIR}/vm-ip"
      if [ -n "$new_ip" ] && [ "$new_ip" != "$old_ip" ]; then
        ops_alert "🔴 eth VM restarted with NEW IP ${new_ip}" "The hr/eth/scan VM was ${status} and has been started. Its IP changed ${old_ip} → ${new_ip}: update the hr/eth/scan.blockid.au A records in Cloudflare (proxied) — DNS sync on the VM is not configured." P0
      else
        ops_alert "🟠 eth VM was ${status} — started" "hr/eth/scan VM started by satellite-uptime (IP ${new_ip:-unknown}, unchanged)." P1
      fi
    fi
  fi
fi
exit 0
