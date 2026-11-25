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
