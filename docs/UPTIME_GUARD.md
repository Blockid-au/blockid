# Uptime Guard — Keeping blockid.au Online

> v2.14.1 · Last updated: 2026-06-18

## What runs

| Layer | Frequency | Purpose | File |
|---|---|---|---|
| **Uptime watcher** | every 1 min | External-style HTTP probe of https://blockid.au with graduated auto-recovery | `web/scripts/uptime-watcher.sh` |
| Agent guardian | every 10 min | Disk / memory / cron-fail watchdog + auto-fix | `api/cron/agent-guardian` |
| Agent healthcheck | every 1 hr | TypeScript / lint / test / SSL / build gates | `api/cron/agent-healthcheck` |
| QA daily report | once daily | 23:45 UTC consolidated status briefing | `api/cron/agent-healthcheck` |
| Deploy CI | per deploy | 10 gates with smoke test before swap | `web/scripts/deploy-live.sh` |

## Graduated response (uptime-watcher.sh)

| Consecutive fails | Action | Alert |
|---|---|---|
| 1 | Log only | — |
| 2 | Log only | — |
| **3** | Kill stale next-server PID + spin up fresh from `.next-current` | 🔴 Telegram |
| **5** | Trigger `deploy-live.sh --rollback` (restore previous release) | 🔴 Telegram |
| Recovery (200 OK after any fail) | Reset state + log "RECOVERED" | ✅ Telegram (if previously alerted) |

State file: `/tmp/blockid-uptime-state` (JSON)
Log: `/tmp/blockid-uptime.log` (auto-rotated at 100 KB)
Alert throttle: 15 min cooldown per incident.

## Why this layer exists

Before v2.14.1, prod uptime was monitored by:
- `agent-guardian` (10-min cadence, mostly resource-focused)
- Cloudflare + external user reports

That left ~10 minutes of potential silent downtime between guardian runs. The uptime watcher closes that gap with a 1-minute external-style probe + graduated auto-recovery that doesn't require human intervention for transient issues.

## What to do if `uptime-watcher` fires

1. Open `/tmp/blockid-uptime.log` for the timeline of fails + actions taken
2. If state file shows `last_action: restart_attempted`, check `/tmp/blockid-production.log` for the new process crash log
3. If `last_action: rollback_attempted`, check `/tmp/blockid-rollback.log`
4. After confirming root cause, fix and redeploy. The watcher resets state on first 200 OK.

## How to test manually

```bash
# Dry-run (no action even on failure)
bash /home/dovanlong/blockid.au/web/scripts/uptime-watcher.sh
cat /tmp/blockid-uptime-state

# Simulate failure (will count as a real fail!)
# Don't do this in production — only on staging
```

## Future hardening (Phase 2)

- External monitor (UptimeRobot / BetterUptime) so the watchdog isn't relying on the same host that might be down
- Multi-region health check (when we add a second AU region)
- StatusPage.io integration for public status updates
- Add `/api/healthz` deeper checks (Supabase ping, Redis ping, Stripe ping)
