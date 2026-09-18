# G15 — Reliability: ship safety · observability · data safety · AI resilience

**Opened:** 2026-09-18 (founder: "tập trung reliability" after G14 closed; all planned engineering goals G1–G14 are closed or founder-blocked).
**Owner:** Claude session loop (3 worktree lanes → merge → full vitest → deploy → elevated live-qa → post-ship review → fix).
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G15 (single source of truth; this file is the spec).

## 1. Evidence (what actually broke or nearly broke, 2026-09-11 → 09-18)

| # | Finding | Source |
|---|---|---|
| E1 | 25 failed deploys / 14 days (5 auto-rollbacks): unit-test regressions, hydrated-smoke expectations, gitleaks on unmerged branches, **two sessions racing the deploy lock**, a build that captured a **mid-merge tree** while the manifest carried master's SHA (stamped at the END of the build). | `content/reports/deploy-log.jsonl`, G13/G14 SOT notes |
| E2 | One interactive AI call ran **120 s** (DeepInfra 4-model ladder × 30 s Worker timeouts) → Cloudflare 524 on `POST /api/funding/report` before the template fallback. Fixed by `callAI` `budgetMs` (`036ba5c2e`), but nothing *observes* provider health, cooldowns, budget exhaustion or degraded reports. | live-qa 2026-09-17, `/tmp/blockid-production.log` |
| E3 | `AI_GATEWAY_URL` / `BILLING_URL` pointed at docker-compose dev hostnames that never resolve on the bare-metal server → 5-minute `ECONNREFUSED` warn loop, silent local fallback. (Commented out 2026-09-18; effective next deploy.) | `.env` |
| E4 | **Off-site DB backup fails every night** ("Service account has no Drive quota" — founder must run `scripts/db-backup-offsite-auth.mjs` once). Local `pg_dump` is healthy (daily 21 MB, sha256, 14 d + 8 w) but **no restore has ever been exercised automatically**. | `content/reports/backup-health.jsonl` |
| E5 | Production log lives at `/tmp/blockid-production.log` (lost on reboot, truncated daily, unstructured); no error digest, no new-error-class alert, no per-route latency; `/api/status` has no `errors`, `ai`, `queues` or `backups` sections. | `scripts/deploy-live.sh:68`, `/api/status` |
| E6 | Unit-test flakes under full-suite load: react-pdf renders (5 s default), timestamp-containing assertions, pre-hydration clicks. Live-qa re-runs inside a window hit the intake `429` bucket; funding lane hit the 524. | vitest / live-qa logs |
| E7 | Stray processes from agent sessions survive for days (a `crawl.mjs` from a scratchpad ran 5.7 days). Guardian does not see them. | `ps` 2026-09-18 |
| E8 | Cron fleet (≈70 jobs) is healthy (2 failures / 898 runs in 7 d) but `cron-runner.sh` caps at 90 s while several jobs declare `--timeout 300`; failures only reach Telegram, not `/api/status`. | `cron-health.jsonl`, `scripts/cron-runner.sh` |

## 2. Non-goals

No new product features. No Docker / CI / GitHub Actions (house rule: the server is production). No new third-party SaaS (Sentry etc.) — everything is files + cron + `/api/status`, Telegram for alerts. No migrations unless a lane needs a table (then FK to `projects` only, apply by hand via `scripts/db/apply-migration.sh`).

## 3. Lanes (parallel worktrees; each lane owns its files, none edits SOT/ROADMAP)

### R1 — Ship safety (deploy pipeline + test determinism)
Files: `web/scripts/deploy-live.sh`, `web/scripts/qa-live.sh`, `web/tests/live-qa/lib/*`, `web/vitest.config.ts`, `web/scripts/deploy-*.test.mjs` (new), `docs/ops/deploy.md` (new or extend).
1. **Manifest truth**: stamp `git_sha`, `git_tree_dirty`, `merge_in_progress` at the START of the build (before gate 1); refuse to build when the tree is dirty or a merge/rebase is in progress unless `DEPLOY_ALLOW_DIRTY=1`; gate 11 compares the live `/api/status.version`+sha (add `git_sha` to `/api/status`) against the stamped value and fails the deploy when they differ ("always verify the live bundle").
2. **Lock etiquette**: `deploy-live.sh --wait` blocks on `/tmp/blockid-deploy.lock` (flock without `-n`, with a 30-min ceiling) instead of aborting; default stays abort-with-holder-pid; print the holder's start time and gate. `qa-live.sh` takes its own `flock` on `/tmp/blockid-live-qa.lock` and refuses/waits the same way (two concurrent runs shared `run-state.json` and produced false failures).
3. **Deterministic tests**: vitest `testTimeout` 20 s for `**/pdf/**`, `**/*-pdf.test.tsx`, `**/pdf/route.test.ts` via a project-level override (not per-test edits); a `scripts/test-flake-report.mjs` that reads the vitest JSON reporter output from gate 6 and appends slow (> 5 s) / retried tests to `content/reports/test-flakes.jsonl`; gate 6 keeps `--retry 0` (a retry hides bugs) but prints the top-10 slowest.
4. **Live-qa resilience**: `tests/live-qa/lib/api.ts` honours `Retry-After` on 429 for idempotent probes (max 2 waits, capped 30 s) and classifies 52x as `edge_timeout` in evidence; the suite fails fast with a clear message when `run-state.json` belongs to a run < 20 min old that is still alive.
5. **Rollback drill**: `scripts/deploy-live.sh --rollback --dry-run` prints exactly what would swap; `docs/ops/deploy.md` documents lock, wait, dirty-tree, rollback, and "verify the live bundle".

### R2 — Observability + alerting (status, logs, latency, error digest)
Files: `web/src/app/api/status/route.ts` (+ `lib/status/*` new), `web/scripts/error-digest.mjs` (new), `web/scripts/latency-sample.mjs` (new), `web/scripts/deploy-live.sh` (log path only — coordinate: R1 owns the rest; R2 changes ONLY the `LOG=` line + rotation block), `docs/ops/slo.md` (new), `docs/ops/crontab-setup.md` (append), `web/scripts/crontab.production` (append).
1. **Log home**: production log → `/data/logs/blockid-production.log` with size-based rotation (keep 14 files, 50 MB) done by the deploy script's existing rotation block; `/tmp/blockid-production.log` becomes a symlink for old tooling.
2. **Error digest** (`error-digest`, every 10 min, cron-runner endpoint OR plain node — choose plain node with its own flock): parse the last window of the log, group by `[tag]` + normalised message (strip ids/uuids/numbers), write `content/reports/error-digest.jsonl` (`{ts, window_min, classes:[{tag,msg,count,first_seen}]}`); alert Telegram (30-min debounce per class) on (a) a class never seen in the last 7 days, (b) a class ≥ 5× its 24 h hourly median, (c) any `fullyDegraded` / `AIBudgetExhaustedError` / `permission denied` line. Unit-test the parser + rules with fixtures.
3. **Latency sampler** (`latency-sample`, every 10 min): parse `/var/log/nginx/access.log` tail (readable by the app user? if not, add `$request_time` to the nginx log format in `docs/ops/nginx/blockid-live.conf` and document the `adm` group step — do NOT edit `/etc/nginx` from a worktree); compute p50/p95 per route class (`/api/svi*`, `/api/funding*`, `/tbr/*`, `/workspace/*`, marketing) → `content/reports/latency.jsonl`; SLO targets in `docs/ops/slo.md` (marketing p95 < 800 ms, workspace p95 < 1.5 s, AI routes p95 < 60 s, uptime 99.9 % / 30 d); alert on 3 consecutive windows over target.
4. **`/api/status` v2** (keep every existing key): `git_sha`, `errors_1h {total, classes:[top 5]}`, `ai {providers:[{name,state: ok|cooldown|blocked, cooldown_until}], budget_exhausted_1h, fully_degraded_24h}` (read from `lib/ai-client` dispatcher state + `ai-model-health.json`), `queues {email_queued, email_failed_24h, webhook_failed_24h, report_orders_pending}`, `backups {local_last_ok_at, local_age_h, offsite_status, restore_drill_last_ok_at}`, `slo {uptime_pct_24h, latency_p95_ms:{class:ms}}`, `crons {failed_24h:[{endpoint,count,last_error}]}`. Cache 60 s. Everything is optional-null-safe when a report file is missing.
5. `/status` page (public, exists) renders the new sections read-only (no secrets, no hostnames).

### R3 — Data safety + AI resilience
Files: `scripts/db/restore-drill.sh` (new, repo root `scripts/db/`), `scripts/db-backup*.mjs` (read only; extend health rows), `web/src/lib/ai-client.ts` (health export only — a small `getProviderHealthSnapshot()` pure reader; do NOT change routing), `web/src/lib/report-pipeline/orchestrator.ts` (emit a structured `[report-pipeline] fully_degraded` line + counter file), `web/scripts/server-cleanup.sh` (stray-process sweep), `docs/runbooks/db-restore.md` (extend), `docs/ops/ai-providers.md` (extend).
1. **Restore drill** (weekly, Sun 03:30 UTC + on demand): `pg_restore` the newest `/data/backups/db-*.dump.gz` into a scratch database `blockid_restore_drill` inside the `supabase-db` container (drop + recreate each run, never touch `postgres`), count rows in 12 key tables (`app_users, projects, svi_snapshots, evaluations, funding_reports, audit_events, credit_transactions, report_orders, webhook_endpoints, intake_submissions, external_signals, schema_migrations`) and compare with the live DB (drill ≥ 95 % of live for each, since the dump is up to 24 h old), verify the audit chain head exists, drop the scratch DB, append `{job:"restore-drill", status, tables:{…}, duration_ms}` to `content/reports/backup-health.jsonl`, Telegram on failure. Unit-test the comparison logic in a `.test.mjs`.
2. **Off-site fallback**: when the Drive upload fails, `db-backup-offsite.mjs` must still (a) keep the local retention, (b) write `offsite_status: "founder_action_required"` with the exact command, (c) alert Telegram at most once per day (currently every night). The founder step stays founder-only — document it in `docs/runbooks/db-restore.md` § Off-site.
3. **AI health snapshot**: `getProviderHealthSnapshot()` in `lib/ai-client.ts` (pure: providers, cooldown_until, blocked reason, budget-exhausted counter for the last hour kept in a ring buffer, interactive order) + tests; the report pipeline records `fully_degraded` events to `content/reports/report-pipeline-health.jsonl` (`{ts, projectId? no — project_hash, reason, llm_calls}`) — R2 reads both for `/api/status.ai`.
4. **Stray-process sweep**: `server-cleanup.sh` gains `--procs`: kill `node` processes whose cwd or argv is under `/tmp/claude-*/` or `.claude/worktrees/*` and older than 12 h (never the production `next-server`, never `deploy-live.sh`, never `playwright` younger than 2 h); log what it killed; wire into the existing cleanup cron line (R3 edits `scripts/crontab.production` only for this line; R2 appends its own lines below — no overlap).
5. **cron-runner ceiling**: honour `--timeout N` up to 600 s instead of the hard 90 s cap (keep 90 s default) — several jobs already declare 300.

## 4. Acceptance (deploy gate for G15)
- Full vitest green; `tsc` clean; `eslint` 0 errors; deploy 12/12 with the new manifest fields; elevated live-qa ≥ current pass count with 0 new failures.
- `/api/status` shows `git_sha` equal to `git rev-parse HEAD` of the deployed commit; `errors_1h`, `ai`, `queues`, `backups`, `slo.latency_p95_ms`, `crons` populated (nulls allowed where a report file has no data yet).
- First restore drill run by hand succeeds and its row is in `backup-health.jsonl`.
- `error-digest` and `latency-sample` cron lines installed on the server (main session does this — worktree agents never touch the live crontab).
- Post-ship review (read-only agent) → fixes → SOT G15 close-out with a change-log row.

## 5. Founder-only (unchanged)
- Run `scripts/db-backup-offsite-auth.mjs` once (Drive quota) — until then off-site backups do not exist; local backups + the weekly restore drill are the only safety net.
- `ABR_GUID` (ABN live lookup), GA4 `hero_variant` dimension.
