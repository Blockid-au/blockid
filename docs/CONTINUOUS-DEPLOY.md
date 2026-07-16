# CONTINUOUS-DEPLOY.md — Ops Runbook

> Goal-4 Continuous CI/CD + Guardian v2
> Ship-per-task delivery, deep health probing, auto-rollback, self-fix.

**Cross-references:**
- `docs/IMPLEMENTATION-PLAN-v2.md` § 13 — Guardian Foundation blueprint
- `docs/UPTIME_GUARD.md` — v1 uptime watcher (still active as belt-and-braces)
- `knowledge-base/upgrade-plan-2026-07-16/guardian-spec.md` — full technical spec
- `web/scripts/deploy-live.sh` — 10-gate deploy engine
- `web/scripts/uptime-watcher.sh` — 1-min HTTP probe

---

## Table of Contents

1. [Overview — What Goal-4 Delivers](#1-overview)
2. [Ship-Per-Task Pipeline (`ship-task.sh`)](#2-ship-per-task-pipeline)
3. [Uptime Guardian v2](#3-uptime-guardian-v2)
4. [Rollback Playbook](#4-rollback-playbook)
5. [Auto-Cleanup (`server-cleanup.sh`)](#5-auto-cleanup)
6. [Performance Audit (Lighthouse CI Hourly)](#6-performance-audit)
7. [Self-Fix Playbook](#7-self-fix-playbook)
8. [Alerting Stack](#8-alerting-stack)
9. [SLOs](#9-slos)
10. [Kill Switches](#10-kill-switches)
11. [Troubleshooting](#11-troubleshooting)
12. [On-Call Quick Reference](#12-on-call-quick-reference-bookmark-this)
13. [Appendix — Schemas & Migrations](#13-appendix)

---

## 1. Overview

### Before Goal-4 (batched delivery)

Legacy behaviour: 40–60 task PRs would accumulate for **~8 weeks**, then a single "release train" `deploy-live.sh` would push everything at once. Failure modes:

- Root cause of a regression required bisecting 40 commits.
- Big-bang rollbacks reverted unrelated fixes.
- Ops team could not correlate deploys to alerts (too many changes per window).
- Confidence to ship gated on manual QA rather than automated evidence.

### After Goal-4 (ship-per-task)

Every atomic task closed by the orchestrator now flows through `ship-task.sh`, which:

1. Builds only the touched surface.
2. Runs unit + integration + smoke gates.
3. Deploys to a green slot.
4. Warms cache, verifies deep-health.
5. Swaps traffic.
6. Records the deploy + perf sample in Supabase.
7. Watches for 15 minutes for regressions; auto-rolls-back if breached.

**Target throughput:** 20–40 deploys/day; median deploy time **≤ 8 min**; rollback **≤ 90 s**.

### What is running today

| Component | State | Cadence | Owner |
|---|---|---|---|
| `web/scripts/uptime-watcher.sh` | LIVE (v1) | 1 min | Guardian |
| `api/cron/agent-guardian` | LIVE | 10 min | Guardian |
| `api/cron/agent-healthcheck` | LIVE | 1 hr | Guardian |
| `web/scripts/deploy-live.sh` | LIVE (10-gate) | on-demand | Guardian |
| `ship-task.sh` | NEW (Goal-4) | per-task | Guardian |
| Lighthouse CI hourly | NEW (Goal-4) | 1 hr | Guardian |
| Deep-health `/api/healthz` | NEW (Goal-4) | 1 min | Guardian |
| `server-cleanup.sh` | NEW (Goal-4) | 4 hr | Guardian |
| Self-fix playbook | NEW (Goal-4) | reactive | Guardian |
| `/dashboard/admin/uptime-guardian` | PLANNED | live | Guardian |

---

## 2. Ship-Per-Task Pipeline

**Script:** `web/scripts/ship-task.sh`
**Invocation:** called by the orchestrator immediately after a task's commit lands on `master`. Also callable manually:

```bash
# Manual invocation (dry-run)
./web/scripts/ship-task.sh --task T_SVI_EXC_0012 --dry-run

# Full ship
./web/scripts/ship-task.sh --task T_SVI_EXC_0012
```

### 12 Steps — What Each Does, How To Test Locally

| # | Step | Purpose | Local test command |
|---|---|---|---|
| 1 | **Preflight** | Verify clean tree, correct branch, secrets present | `./web/scripts/ship-task.sh --preflight-only` |
| 2 | **TypeScript gate** | `tsc --noEmit` across `web/` | `cd web && npx tsc --noEmit` |
| 3 | **Lint gate** | `next lint` + `eslint` | `cd web && npm run lint` |
| 4 | **Unit tests** | Vitest for touched files (via `--changed`) | `cd web && npx vitest --run --changed` |
| 5 | **Migration check** | Diff `web/supabase/migrations/` vs applied set | `./web/scripts/check-migrations.sh` |
| 6 | **Build** | `next build` (webpack, standalone) | `cd web && npm run build` |
| 7 | **Standalone bundle assembly** | Copy `webpack-runtime.js` + `server/chunks/` into `.next/standalone` | `./web/scripts/assemble-standalone.sh` |
| 8 | **Green-slot deploy** | Deploy new build to green systemd unit on alt port | `./web/scripts/deploy-live.sh --slot green --skip-swap` |
| 9 | **Cache warm** | Fetch top-50 URLs against green slot to prime SSR cache | `./web/scripts/cache-warm.sh --slot green` |
| 10 | **Deep health probe** | `curl` `/api/healthz` on green — DB, Stripe, Supabase, GA4, disk, memory | `curl -fsS http://127.0.0.1:$GREEN_PORT/api/healthz \| jq` |
| 11 | **Swap** | `nginx` upstream flip green↔blue (atomic reload) | `./web/scripts/deploy-live.sh --swap-only` |
| 12 | **Post-deploy watch (15 min)** | Poll perf + errors; on regression → auto-rollback (§ 4) | `./web/scripts/post-deploy-watch.sh --window 15m --task T_XXX` |

### Recording

- Every ship writes a row to `deploy_incidents` (see § 13) with `task_id`, `commit_sha`, `slot`, `duration_ms`, `outcome`, `rollback_reason`.
- Success writes a `perf_samples` row per warmed URL.

### Exit codes

| Code | Meaning | Auto-action |
|---|---|---|
| 0 | Ship success | none |
| 10 | Preflight failed | Telegram INFO |
| 20 | Gate 2–5 failed | Telegram WARN, no deploy |
| 30 | Build failed | Telegram WARN, self-fix consulted (§ 7) |
| 40 | Green deploy failed | Telegram ALERT, green torn down |
| 50 | Deep-health failed | Telegram ALERT, green torn down, no swap |
| 60 | Post-deploy regression | Auto-rollback + CRITICAL alert |

---

## 3. Uptime Guardian v2

### Two-tier probing

**Tier 1 — shallow (existing, unchanged):**
- `web/scripts/uptime-watcher.sh`
- Fires every 60 s from crontab.
- `curl -fsS https://blockid.au/` — 200 or bust.
- 3 consecutive failures → `systemctl restart blockid-web`.
- 5 consecutive failures → `deploy-live.sh --rollback` + Telegram ALERT.

**Tier 2 — deep (NEW):**
- Endpoint: `GET /api/healthz`
- Called every 60 s by `web/scripts/deep-health-probe.sh` (new cron).
- Returns JSON:

```json
{
  "ok": true,
  "checks": {
    "db":       { "ok": true, "latency_ms": 12 },
    "supabase": { "ok": true, "latency_ms": 34 },
    "stripe":   { "ok": true, "latency_ms": 88 },
    "ga4":      { "ok": true, "latency_ms": 61 },
    "disk":     { "ok": true, "free_gb": 172 },
    "memory":   { "ok": true, "used_pct": 47 },
    "build":    { "ok": true, "sha": "6be451b" }
  },
  "ts": "2026-07-16T09:12:33Z"
}
```

### Auto-actions (deep probe)

| Trigger | Action | Alert |
|---|---|---|
| `db.ok=false` × 2 | Restart pgbouncer + web | CRITICAL |
| `stripe.ok=false` × 3 | Toggle `STRIPE_FALLBACK_MODE=true`, notify CFO agent | ALERT |
| `disk.free_gb < 20` | Trigger `server-cleanup.sh` immediately | WARN |
| `memory.used_pct > 90` × 3 | Restart web service | ALERT |
| `build.sha` mismatch vs expected | Redeploy last-known-good | CRITICAL |

### Test the deep probe locally

```bash
curl -fsS https://blockid.au/api/healthz | jq .
# or against green slot
curl -fsS http://127.0.0.1:3001/api/healthz | jq .
```

---

## 4. Rollback Playbook

### Auto triggers (post-deploy 15-min window)

Automatic rollback fires if **any** of these are true during the watch window:

1. p95 latency > 2× baseline for 3 consecutive samples.
2. 5xx rate > 1% for 2 consecutive minutes.
3. `/api/healthz` `ok=false` for ≥ 2 min.
4. Sentry error budget burn > 10× nominal.
5. Uptime v1 5-fail threshold breached.

### Manual rollback — two paths

#### A. Ops dashboard (preferred)

```bash
# POST to admin endpoint (requires admin JWT)
curl -X POST https://blockid.au/api/admin/rollback \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reason":"manual: elevated error rate", "target":"previous"}'
```

Response:

```json
{ "ok": true, "rolled_back_to": "a828724", "duration_ms": 71234 }
```

#### B. Shell (SSH to server)

```bash
sudo -u dovanlong /home/dovanlong/blockid.au/web/scripts/deploy-live.sh --rollback
# or roll back to a specific SHA
sudo -u dovanlong /home/dovanlong/blockid.au/web/scripts/deploy-live.sh --rollback --to 32d2064
```

### Post-rollback checklist

1. Confirm `/api/healthz` returns `ok:true`.
2. Confirm uptime probe recovered (Telegram will send `RECOVERED` on 5 consecutive OK).
3. Open incident row in `deploy_incidents` — set `rollback_reason` and `resolved_at`.
4. File an incident postmortem in `web/content/reports/incidents/YYYY-MM-DD-*.md`.

### SLO

Rollback must complete in **≤ 90 s** (measured from trigger to `/api/healthz` green on old build).

---

## 5. Auto-Cleanup

**Script:** `web/scripts/server-cleanup.sh`
**Cadence:** every 4 hours via crontab (`0 */4 * * *`)

### What it deletes

| Target | Retention | Rationale |
|---|---|---|
| `/var/lib/docker/tmp/*` | 24 h | Build cache overflow |
| `/tmp/next-*` | 6 h | Next.js build tmp dirs |
| `/var/log/nginx/*.log.*.gz` | 30 days | Rotated nginx logs |
| `/var/log/journal/*` | 14 days | systemd journals (via `journalctl --vacuum-time=14d`) |
| `web/.next.old-*` | keep last 3 | Rollback safety net |
| `web/.next.backup.*` | keep last 5 | Deploy safety net |
| `~/.npm/_cacache` | 7 days | npm cache |
| `~/.cache/next-swc` | 7 days | SWC cache |
| Docker unused images | dangling only | `docker image prune -f` |

### Whitelist (NEVER delete)

- `web/.next` (current live build)
- `web/.next.standalone` (current standalone bundle)
- `web/supabase/migrations/*.sql`
- `web/content/reports/**/*.md`
- `web/public/**`
- `/home/dovanlong/blockid.au/knowledge-base/**`
- `/home/dovanlong/blockid.au/docs/**`
- Any file matching `.env*`

### Manual invocation

```bash
# Dry-run (report only, no deletes)
./web/scripts/server-cleanup.sh --dry-run

# Force full run
sudo ./web/scripts/server-cleanup.sh --force

# Aggressive mode (disk < 20GB triggers this automatically)
sudo ./web/scripts/server-cleanup.sh --aggressive
```

Output is appended to `web/content/reports/cleanup-YYYY-MM-DD.log`.

---

## 6. Performance Audit

**Tool:** Lighthouse CI (`@lhci/cli`)
**Cadence:** hourly cron (`5 * * * *`)
**Runner:** `web/scripts/lighthouse-hourly.sh`

### URLs audited

- `https://blockid.au/`
- `https://blockid.au/pricing`
- `https://blockid.au/svi`
- `https://blockid.au/dashboard` (auth'd via test account)
- `https://blockid.au/insights`

### Dashboard

- Live: `https://blockid.au/dashboard/admin/perf` (admin only)
- Raw JSON: `web/content/reports/lighthouse/YYYY-MM-DD/HH-URL.json`
- Historical trend: `perf_samples` table (Supabase)

### Regression rules (auto-alert)

| Metric | Threshold | Alert |
|---|---|---|
| Performance score | < 85 for 2 consecutive runs | WARN |
| Performance score | < 70 for 1 run | ALERT |
| LCP | > 3.0 s | WARN |
| LCP | > 5.0 s | ALERT |
| CLS | > 0.15 | WARN |
| TBT | > 500 ms | WARN |
| p95 TTFB | > 1500 ms | ALERT |
| Any URL fails audit (crash) | 1 run | ALERT |

### Manual run

```bash
./web/scripts/lighthouse-hourly.sh --url https://blockid.au/pricing --verbose
```

---

## 7. Self-Fix Playbook

**File:** `web/config/self-fix-playbook.json`
**Consumer:** `web/scripts/self-fix.sh` (invoked by ship-task step 6/8 failures + deep-probe failures)

### Pattern → Action table

| Pattern (regex over log) | Action | Escalation if action fails |
|---|---|---|
| `webpack-runtime\.js.*ENOENT` | Re-run `assemble-standalone.sh` | ALERT, halt ship |
| `EADDRINUSE.*:3000` | `sudo systemctl restart blockid-web` | ALERT |
| `ECONNREFUSED.*supabase` | Restart supabase container | CRITICAL |
| `ENOSPC` | Trigger `server-cleanup.sh --aggressive` | CRITICAL |
| `heap out of memory` during build | Re-run build with `NODE_OPTIONS=--max-old-space-size=8192` | ALERT |
| `Prisma.*migration.*failed` | Halt, notify DBA | CRITICAL |
| `TypeError.*undefined.*reading 'chunks'` | Rebuild standalone bundle | ALERT |
| `nginx.*upstream timed out` | Restart nginx + web | ALERT |
| `stripe.*rate_limit` | Enable exponential backoff flag | WARN |
| `SIGTERM.*next-server` | Restart web, capture heap dump | ALERT |

### JSON schema

```json
{
  "version": 1,
  "patterns": [
    {
      "id": "webpack-runtime-missing",
      "match": "webpack-runtime\\.js.*ENOENT",
      "action": "assemble-standalone",
      "max_attempts": 2,
      "cooldown_sec": 60,
      "escalation": "ALERT"
    }
  ]
}
```

### Adding a new pattern

1. Reproduce the failure locally, capture the log line.
2. Draft the regex — test with `web/scripts/self-fix.sh --test-regex '<line>'`.
3. Add an entry to `web/config/self-fix-playbook.json`.
4. Register the action handler in `web/scripts/self-fix-actions/<action-name>.sh`.
5. Commit + push. Guardian reloads playbook on next cron tick (no restart needed).

---

## 8. Alerting Stack

### Severity → channel routing

| Severity | Channel | Latency | Escalates after |
|---|---|---|---|
| INFO | Telegram (`#blockid-ops-info`) | best-effort | never |
| WARN | Telegram (`#blockid-ops-warn`) | ≤ 1 min | 15 min → ALERT |
| ALERT | Telegram (`#blockid-ops-alert`) + email | ≤ 30 s | 10 min → CRITICAL |
| CRITICAL | Telegram + Twilio SMS + VAPI phone call | ≤ 15 s | continuous retry until acked |

### Env vars

```
TELEGRAM_BOT_TOKEN     — bot for all Telegram sends
TELEGRAM_CHAT_ID       — default ops chat
TELEGRAM_CHAT_ALERT    — alert-severity chat
TELEGRAM_CHAT_CRITICAL — critical-severity chat
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
ONCALL_PHONE           — SMS + VAPI target
VAPI_API_KEY
VAPI_ASSISTANT_ID
```

### Test each channel

```bash
# Telegram
curl -fsS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" -d text="test from ops runbook"

# Twilio SMS
./web/scripts/alert-test.sh --channel twilio --to "$ONCALL_PHONE"

# VAPI phone call
./web/scripts/alert-test.sh --channel vapi --to "$ONCALL_PHONE"
```

### Ack an alert

Reply to Telegram message with `/ack <incident_id>` — Guardian stops escalation.

---

## 9. SLOs

| SLO | Target | Measurement window | Alert threshold |
|---|---|---|---|
| **Uptime** | ≥ 99.9% | 30 days rolling | < 99.5% → ALERT |
| **p95 latency** (SSR pages) | ≤ 800 ms | 1 hour rolling | > 1500 ms → WARN |
| **p95 latency** (API routes) | ≤ 400 ms | 1 hour rolling | > 800 ms → WARN |
| **Deploy duration** (ship-task) | ≤ 8 min | per deploy | > 12 min → WARN |
| **Rollback duration** | ≤ 90 s | per rollback | > 180 s → ALERT |
| **Deep-health probe** | `ok=true` ≥ 99.5% | 24 h rolling | < 99% → ALERT |
| **Lighthouse perf** | ≥ 85 | hourly | < 70 → ALERT |
| **Error budget** (5xx rate) | ≤ 0.1% | 1 hour rolling | > 1% → CRITICAL |

Live SLO dashboard: `/dashboard/admin/slo` (planned).

---

## 10. Kill Switches

### Global upgrade rollback

```bash
# Turn off entire Goal-4 upgrade path (reverts to legacy behaviour)
export NEXT_PUBLIC_UPGRADE_V2=false
sudo systemctl restart blockid-web
```

### Per-workstream flags (in `.env.local`)

```
GUARDIAN_AUTOFIX=true          # Disable to require manual approval for every self-fix action
GUARDIAN_AUTO_ROLLBACK=true    # Disable to require manual rollback trigger
SHIP_TASK_ENABLED=true         # Disable to fall back to batched deploys
LIGHTHOUSE_HOURLY=true         # Disable perf cron
DEEP_HEALTH_PROBE=true         # Disable /api/healthz cron (v1 uptime still runs)
CLEANUP_CRON=true              # Disable server-cleanup cron
ALERT_TWILIO=true              # SMS off
ALERT_VAPI=true                # phone-call off
```

### Emergency master kill

```bash
# Stop ALL Guardian automation (cron entries commented, watchers halted)
sudo /home/dovanlong/blockid.au/web/scripts/guardian-off.sh

# Restore
sudo /home/dovanlong/blockid.au/web/scripts/guardian-on.sh
```

---

## 11. Troubleshooting

### 11.1 Ship-task fails at step 7 (standalone bundle)

**Symptom:** `ENOENT webpack-runtime.js` after successful build.
**Cause:** Next.js standalone output missing chunks (regression documented in commit `6be451b`).
**Fix:**

```bash
./web/scripts/assemble-standalone.sh --force
./web/scripts/ship-task.sh --task <T_ID> --resume-from 8
```

### 11.2 Deep-health probe reports `db.ok=false` but site works

**Cause:** pgbouncer connection saturation; SSR uses pooled conn, healthz opens a fresh one.
**Fix:**

```bash
sudo systemctl restart pgbouncer
# then wait 60s, re-probe
curl -fsS https://blockid.au/api/healthz | jq .checks.db
```

### 11.3 Auto-rollback fired but new build looked fine

**Diagnosis:** Check the trigger in `deploy_incidents.rollback_reason`.

```bash
psql "$SUPABASE_URL" -c "SELECT task_id, commit_sha, rollback_reason, created_at FROM deploy_incidents WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC;"
```

Common false-positives:
- p95 spike from a single slow user report — tune `GUARDIAN_P95_MULTIPLIER` (default 2.0).
- 5xx from a bot flood — tune `GUARDIAN_5XX_THRESHOLD_PCT` (default 1.0).

### 11.4 Lighthouse CI keeps failing on `/dashboard`

**Cause:** Test-account session expired.
**Fix:**

```bash
./web/scripts/refresh-lhci-session.sh
```

### 11.5 server-cleanup deleted something it shouldn't

**Recovery:** All cleanup runs write a manifest to `web/content/reports/cleanup-YYYY-MM-DD.log`. Recent deletes with a `--restore-hint` can be restored from `/var/backups/guardian-trash/` (7-day retention).

```bash
./web/scripts/server-cleanup.sh --restore <path>
```

### 11.6 Telegram alerts stopped arriving

Checks in order:

1. `curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe` — token valid?
2. `journalctl -u blockid-guardian -n 100 | grep -i telegram` — errors?
3. Bot removed from chat? Re-add and grant "post messages".
4. Fall back to email: `./web/scripts/alert-test.sh --channel email`.

### 11.7 Migration applied on server but not in git

```bash
# Snapshot current schema and compare
./web/scripts/db-diff.sh > /tmp/db-diff.sql
diff /tmp/db-diff.sql web/supabase/migrations/
```

If drift is real, create a new migration `web/supabase/migrations/NNNN_reconcile_drift.sql` capturing the delta.

### 11.8 `/api/healthz` returns `ok:true` but users report 500s

**Cause:** healthz checks infrastructure, not user paths. Add the affected path to `web/lib/healthz/user-flow-probes.ts`.

### 11.9 Green slot won't come up (deploy stuck at step 8)

```bash
sudo journalctl -u blockid-web-green -f
# common cause: port already in use
sudo lsof -iTCP:3001 -sTCP:LISTEN
```

### 11.10 Self-fix loops forever on same pattern

`max_attempts` in the playbook prevents true loops, but if a pattern keeps recurring, Guardian will escalate after `max_attempts` and halt further self-fix for that pattern for 24 h. Investigate root cause.

---

## 12. On-Call Quick Reference (bookmark this)

### One-liners

```bash
# Am I on fire?
curl -fsS https://blockid.au/api/healthz | jq

# What's the current live SHA?
ssh prod 'cat /home/dovanlong/blockid.au/web/.next.standalone/BUILD_SHA'

# Most recent deploys
psql "$SUPABASE_URL" -c "SELECT task_id, commit_sha, outcome, created_at FROM deploy_incidents ORDER BY created_at DESC LIMIT 10;"

# Roll back NOW
sudo -u dovanlong /home/dovanlong/blockid.au/web/scripts/deploy-live.sh --rollback

# Kill all automation
sudo /home/dovanlong/blockid.au/web/scripts/guardian-off.sh

# Restart web
sudo systemctl restart blockid-web

# Tail all Guardian logs
sudo journalctl -u blockid-guardian -u blockid-web -f
```

### Dashboards

| Purpose | URL |
|---|---|
| Uptime + deploys | `/dashboard/admin/uptime-guardian` (planned) |
| Performance trend | `/dashboard/admin/perf` |
| SLO burn | `/dashboard/admin/slo` (planned) |
| Recent incidents | `/dashboard/admin/incidents` |
| Cost + resource | `/dashboard/admin/resources` |

### Contact ladder

1. Auto-page on-call via Telegram + Twilio SMS + VAPI call.
2. `/ack <incident_id>` in Telegram to silence escalation.
3. If unresolved in 15 min, CRITICAL escalates to secondary on-call.
4. If unresolved in 30 min, CEO agent is paged with executive summary.

### Common commands cheat-sheet

```bash
# Ship a single task manually
./web/scripts/ship-task.sh --task T_XXX

# Ship in dry-run mode
./web/scripts/ship-task.sh --task T_XXX --dry-run

# Resume ship from a specific step
./web/scripts/ship-task.sh --task T_XXX --resume-from 8

# Force cleanup
sudo ./web/scripts/server-cleanup.sh --force

# Aggressive cleanup (low disk emergency)
sudo ./web/scripts/server-cleanup.sh --aggressive

# Single Lighthouse audit
./web/scripts/lighthouse-hourly.sh --url https://blockid.au/

# Test all alert channels
./web/scripts/alert-test.sh --channel all

# Reload self-fix playbook without restart
./web/scripts/self-fix.sh --reload

# Check migration drift
./web/scripts/check-migrations.sh
```

---

## 13. Appendix

### 13.1 New migrations

- `web/supabase/migrations/0078_deploy_incidents.sql`
- `web/supabase/migrations/0079_perf_samples.sql`

### 13.2 `deploy_incidents` schema

```sql
CREATE TABLE deploy_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           TEXT NOT NULL,
  commit_sha        TEXT NOT NULL,
  slot              TEXT NOT NULL CHECK (slot IN ('blue','green')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  outcome           TEXT NOT NULL CHECK (outcome IN ('success','failed','rolled_back','partial')),
  gate_failed       TEXT,                  -- e.g. 'typescript', 'lint', 'unit', 'build', 'deep-health'
  rollback_reason   TEXT,
  rolled_back_to    TEXT,                  -- previous commit_sha
  rollback_duration_ms INTEGER,
  triggered_by      TEXT NOT NULL DEFAULT 'orchestrator',
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX deploy_incidents_created_at_idx ON deploy_incidents (created_at DESC);
CREATE INDEX deploy_incidents_task_id_idx    ON deploy_incidents (task_id);
CREATE INDEX deploy_incidents_outcome_idx    ON deploy_incidents (outcome);
```

### 13.3 `perf_samples` schema

```sql
CREATE TABLE perf_samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url               TEXT NOT NULL,
  taken_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source            TEXT NOT NULL CHECK (source IN ('lighthouse','cache-warm','deep-health','synthetic')),
  commit_sha        TEXT,
  ttfb_ms           INTEGER,
  fcp_ms            INTEGER,
  lcp_ms            INTEGER,
  cls               NUMERIC(6,4),
  tbt_ms            INTEGER,
  tti_ms            INTEGER,
  perf_score        INTEGER,               -- 0–100 (Lighthouse)
  a11y_score        INTEGER,
  seo_score         INTEGER,
  best_practices_score INTEGER,
  status_code       INTEGER,
  bytes_transferred BIGINT,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX perf_samples_taken_at_idx ON perf_samples (taken_at DESC);
CREATE INDEX perf_samples_url_idx      ON perf_samples (url, taken_at DESC);
CREATE INDEX perf_samples_commit_idx   ON perf_samples (commit_sha);
```

### 13.4 Cron entries (added by Goal-4)

```cron
# Guardian v2 — Goal-4
* * * * *  /home/dovanlong/blockid.au/web/scripts/deep-health-probe.sh    >> /var/log/guardian/deep-health.log 2>&1
5 * * * *  /home/dovanlong/blockid.au/web/scripts/lighthouse-hourly.sh    >> /var/log/guardian/lhci.log 2>&1
0 */4 * * * /home/dovanlong/blockid.au/web/scripts/server-cleanup.sh      >> /var/log/guardian/cleanup.log 2>&1
```

### 13.5 File map (new / modified in Goal-4)

```
web/scripts/ship-task.sh                     (NEW)
web/scripts/deep-health-probe.sh             (NEW)
web/scripts/lighthouse-hourly.sh             (NEW)
web/scripts/server-cleanup.sh                (NEW)
web/scripts/self-fix.sh                      (NEW)
web/scripts/self-fix-actions/*.sh            (NEW)
web/scripts/cache-warm.sh                    (NEW)
web/scripts/post-deploy-watch.sh             (NEW)
web/scripts/assemble-standalone.sh           (NEW)
web/scripts/guardian-off.sh                  (NEW)
web/scripts/guardian-on.sh                   (NEW)
web/scripts/alert-test.sh                    (NEW)
web/scripts/deploy-live.sh                   (MODIFIED — --rollback, --slot, --swap-only, --skip-swap)
web/scripts/uptime-watcher.sh                (unchanged — v1 still runs)
web/config/self-fix-playbook.json            (NEW)
web/src/app/api/healthz/route.ts             (NEW)
web/src/app/api/admin/rollback/route.ts      (NEW)
web/src/app/dashboard/admin/uptime-guardian/ (PLANNED)
web/src/app/dashboard/admin/perf/            (NEW)
web/src/app/dashboard/admin/slo/             (PLANNED)
web/supabase/migrations/0078_deploy_incidents.sql (NEW)
web/supabase/migrations/0079_perf_samples.sql     (NEW)
```

### 13.6 Admin dashboard `/dashboard/admin/uptime-guardian`

Planned surface (RSC, admin-guarded):

- **Live status band** — current build SHA, uptime %, last deep-probe result.
- **Deploy timeline** — last 100 rows of `deploy_incidents`, coloured by outcome.
- **Rollback button** — POSTs to `/api/admin/rollback` with confirmation modal.
- **Kill-switch panel** — toggle env flags from § 10 (writes to server-side config, reloads without restart).
- **Alert feed** — last 50 alerts across all severities.
- **SLO burn strip** — 30-day rolling uptime, p95, error budget.

---

Version: v1.0 · Date: 2026-07-16 · Owner: Guardian agent
