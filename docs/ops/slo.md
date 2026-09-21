# Service level objectives — targets, measurement, alerting (G15-R2)

**Opened:** 2026-09-18 (G15 Reliability, lane R2). Internal targets only — not a
contractual SLA; no plan includes uptime credits (`/status` says the same).

## 1. Targets

| Class | What it covers | p95 latency | 5xx rate | Uptime |
|---|---|---|---|---|
| `marketing` | every route not listed below (`/`, `/pricing`, `/funding`, `/insights/*` …) — static assets (`/_next/*`, images, fonts) are excluded | **< 800 ms** | < 0.5 % | 99.9 % / 30 d |
| `workspace` | `/workspace/*`, `/dashboard*` | **< 1.5 s** | < 0.5 % | — |
| `api_ai` | `/api/svi*`, `/api/funding/report`, `/api/analyses*`, `/api/cfo-advisor` (LLM-backed, `callAI` `budgetMs`) | **< 60 s** | < 0.5 % | — |
| `api_other` | every other `/api/*` | **< 2 s** | < 0.5 % | — |
| `tbr` | `/tbr/*`, `/s/*` (public Trust BizReport + share pages) | < 1.5 s | < 0.5 % | — |

The numbers live in code in `web/scripts/lib/latency-core.mjs` (`SLO`) and are
pinned by `web/scripts/latency-sample.test.mjs` — change both together. Uptime
(99.9 % / 30 d ≈ 43 min downtime) is measured by the 1-minute uptime watcher
(`content/reports/uptime-guardian.jsonl`) and shown on `/status`; the 24 h
figure on `/api/status.slo.uptime_pct_24h` is the cron-fleet proxy that predates G15.

## 2. Measurement — `scripts/latency-sample.mjs` (every 10 min)

- Reads the tail of `/var/log/nginx/access.log` (and `access.log.1` right after
  the 00:50 UTC logrotate), keeps the last 10 minutes, buckets by class, writes
  `content/reports/latency.jsonl`:
  `{ts, window_min, timing, classes:{name:{n, p50_ms, p95_ms, err_rate_5xx}}}`.
- **Access:** the file is `www-data:adm 0640`. The app user `dovanlong` is already
  in `adm` (`id` → `4(adm)`), so no sudo is needed. If a future server loses
  that, the sampler exits 0 with `{skipped:"no_access"}` and the founder runs
  once: `sudo usermod -aG adm dovanlong` (re-login / new cron tick picks it up).
- **Timing fields:** the stock `combined` format has no `$request_time`, so
  today only `n` and `err_rate_5xx` are populated and `p50_ms`/`p95_ms` are
  `null`. `docs/ops/nginx/blockid-live.conf` carries the `blockid_timing`
  `log_format` (combined + `$request_time $upstream_response_time`). Install
  it on the server (http-level `log_format` + `access_log … blockid_timing;`
  in the blockid.au `server{}`, then `nginx -t && systemctl reload nginx`);
  the parser accepts both shapes so mixed files are fine.
- A window needs ≥ 20 requests in a class before it can count as a breach.

## 3. Alerting

- **Latency / 5xx:** Telegram (same bot + chat as `cron-runner.sh`) after **3
  consecutive 10-min windows** over target for a (class, metric); re-alert
  every 6 windows (1 h) while it persists; one "recovered" message when a
  streak ≥ 3 ends. Streaks live in `content/reports/latency-state.json`.
- **Errors:** `scripts/error-digest.mjs` (every 10 min) parses the production
  log (`/data/logs/blockid-production.log`) from a byte offset, groups by
  `[tag]` + normalised message, writes `content/reports/error-digest.jsonl`,
  and alerts (30-min debounce per class) on (a) a class not seen in 7 days,
  (b) ≥ 5× its 24 h hourly median and ≥ 10 lines, (c) any `fully_degraded` /
  `AIBudgetExhaustedError` / `permission denied` line. The first run seeds the
  7-day memory silently (no "new" storm), critical lines still alert.
- **Report quality (G24-B):** the same digest run reads the local
  `/api/status` (`STATUS_BASE_URL`, default `http://127.0.0.1:4001`) and,
  when `tbr_quality.status` has been ≠ `ok` (`watch` / `missing`) for more
  than 24 h, sends ONE line — `[tbr_quality] status=watch for 25 h — grounded
  median 0.41 vs KPI 0.85, degraded 0.30, runs 4 (24 h)` — then at most one a
  day while it holds; the episode start lives in
  `error-digest-state.json` (`tbr_quality`). Same send path as every alert, so
  the e-mail fallback (`ADMIN_EMAIL` / `ALERT_EMAIL`) carries it while the
  Telegram token is dead. App unreachable → no-op, never a false alarm.
- **Where it surfaces:** `/api/status` (`errors_1h`, `ai`, `queues`,
  `backups_detail`, `slo.latency_p95_ms`, `crons_failed_24h`) and the public
  `/status` page (redacted: no paths, hosts, secrets).

## 4. Runbook — when an alert fires

| Alert | First look | Then |
|---|---|---|
| `api_ai p95 > 60 s` | `/api/status.ai` — providers in cooldown? `budget_exhausted_1h`? | `docs/ops/ai-providers.md`; check DeepInfra / Groq status; `callAI` budget is 60 s by design |
| `marketing p95 > 800 ms` | `/api/status.slo` disk/mem; `content/reports/latency.jsonl` last rows | `bash scripts/server-cleanup.sh --disk-only`; look for a deploy in progress (build CPU) |
| `5xx rate > 0.5 %` | `node scripts/error-digest.mjs --dry-run` for the class behind it | `tail -100 /data/logs/blockid-production.log`; `deploy-live.sh --rollback` if it started with a deploy |
| new error class | the Telegram row names `[tag]` + message | `grep -n '<tag>' /data/logs/blockid-production.log \| tail` |
| `fully_degraded` | `content/reports/report-pipeline-health.jsonl` | provider cooldowns in `/api/status.ai`; a founder-facing report went out on the template fallback |

## 5. Files

| Path | Written by | Read by |
|---|---|---|
| `/data/logs/blockid-production.log` (+ `.1`…`.14`) | `node server.js` via `deploy-live.sh` / `start-production.sh` (`>>`), rotated by `scripts/rotate-production-log.sh` (copy-truncate ≥ 50 MB) | error-digest, humans (`/tmp/blockid-production.log` is a symlink) |
| `/data/logs/.error-digest.offset` | error-digest | error-digest |
| `content/reports/error-digest.jsonl`, `error-digest-state.json` | error-digest | `/api/status.errors_1h` |
| `content/reports/latency.jsonl`, `latency-state.json` | latency-sample | `/api/status.slo.latency_p95_ms` |

Cron lines: `docs/ops/crontab-setup.md` § G15-R2 / `web/scripts/crontab.production`.
