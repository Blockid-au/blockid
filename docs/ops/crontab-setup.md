# Crontab setup — trial charge warning

The pre-charge warning email cron (`/api/cron/trial-charge-warning`) is
triggered by the host crontab. The BlockID deploy pipeline deliberately
does **not** touch host crontabs — this is a one-time manual setup step
per host.

## Line to install

```
0 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/trial-charge-warning > /var/log/blockid-cron.log 2>&1
```

- Runs at the top of every hour.
- Requires the deploy shell to export `CRON_SECRET` (same value as
  `process.env.CRON_SECRET` on the app server).
- Writes JSON summary + errors to `/var/log/blockid-cron.log` — rotate
  with the usual logrotate config for that path.

## Idempotent installer

`scripts/setup-cron-trial-warning.sh` appends the line if not already
present. It exits `0` on either "already there" or "successfully added":

```bash
export CRON_SECRET=<same as server env>
./scripts/setup-cron-trial-warning.sh
```

Confirm the cron with:

```bash
crontab -l | grep trial-charge-warning
```

## Verifying it works

Trigger the endpoint manually from the deploy shell:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://blockid.au/api/cron/trial-charge-warning | jq
```

Expected response shape:

```json
{
  "ok": true,
  "scanned": 0,
  "sent": 0,
  "skipped_no_plan": 0,
  "skipped_email_failed": 0,
  "errors": []
}
```

If `scanned > 0` and `sent == 0`, check `errors` for the reason.

## Related crons

The Stripe `customer.subscription.trial_will_end` webhook (fires at T-3d)
runs a redundant drip through `sendTrialChargeWarning`. The hourly cron
is the primary trigger; the webhook is a safety net.

## Investor weekly digest — `/api/cron/investor-weekly-digest`

Weekly digest for active investors (angel + VC) covering the top-5
watchlisted tickers by SVI movement since the last digest. See
`docs/plans/atlassian-standard-mapping-goal.md` §P7 for the spec.

### Line to install

```
30 22 * * 0 curl -sS -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/investor-weekly-digest >> /var/log/blockid-investor-digest.log 2>&1
```

- Runs Sunday 22:30 UTC (Monday 08:30 AEST — before the working week).
- Requires `CRON_SECRET` in the environment.
- Honours the per-user `email_preferences.weekly_reports` flag; opted-
  out investors are skipped silently.
- Kill switch: set `INVESTOR_DIGEST=off` on the app server env to
  short-circuit the endpoint without touching the crontab.

### Dry-run

Verify the compose step without sending mail:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/investor-weekly-digest?skip_email=1" | jq
```

Expected response shape:

```json
{
  "ok": true,
  "investor_count": 42,
  "emailed": 0,
  "failures": 0,
  "dry_run": [
    {
      "investor_id": "…",
      "email": "…",
      "ticker_count": 3,
      "is_empty": false,
      "subject": "Your weekly investor digest — 3 tracked startups moved"
    }
  ]
}
```

An empty `dry_run` array with `investor_count > 0` means every eligible
investor has opted out of `weekly_reports` — expected on fresh
environments.

## Mandate fit refresh — `/api/cron/mandate-fit-refresh`

G13 S-T2 (2026-09-16). Nightly investors → startups pass: every active
`investor_mandates` row × every founder-visible project (public index,
consent ≥ `reports_shared`, or the `/score` investor-visible opt-in) is
scored with `FIT_WEIGHTS_V2` (`web/src/lib/investors/fit-v2.ts`) and
upserted into `mandate_fit_scores` keyed on `(mandate_id, project_id)` —
what `/workspace/investor/dealflow` reads. Requires migration
`0393_investor_mandates_v2.sql` to be applied first; until then the run
returns `{ ok: true, migrated: false }` and writes nothing.

### Line to install

```
35 16 * * * bash $RUN mandate-fit-refresh --timeout 300
```

- Runs daily 16:35 UTC (02:35 AEST — off-peak, after the 16:00–16:20
  index / report jobs, before the 17:00 block). `$RUN` is
  `web/scripts/cron-runner.sh`, which adds the Bearer `CRON_SECRET` and
  appends the JSON summary to `content/reports/cron-health.jsonl`.
- Bounded: mandates × visible projects in memory, 500-row upsert batches.
- Dry-run (scores everything, writes nothing):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/mandate-fit-refresh?dry=1" | jq
```

Expected shape: `{ ok, dryRun, migrated, mandates, projects, pairs, upserts,
deleted_inactive, batches, errors, ms }`.

## Traction snapshot — `/api/cron/traction-snapshot`

G14 S33 (2026-09-16). Daily count of everything an investor update or the
deck provenance table quotes, written by `buildTractionSnapshot()`
(`web/src/lib/traction/snapshot.ts`) to
`web/content/reports/traction-snapshot.json` (latest) and appended to
`traction-history.jsonl` (one line per run). QA / seeded / erased accounts
(`qa-*@blockid.au`, `qa-live-*`, `deleted+*@erased.blockid.au` — the
`QA_ACCOUNT_EMAIL_PATTERNS` constant) are excluded from every per-user
figure and reported as `users.excluded_count`. MRR is given two ways
(`mrr_aud_cents.from_subscriptions` = active `subscription_trial_state` ×
plan monthly price; `from_revenue_events` = trailing-30-day subscribe +
renewal cash) plus `stripe_reconciled` (Stripe active-subscription
head-count agrees with the DB, `null` when Stripe is not configured). A
missing table (for example `evaluation_assessments` before G13 S-D2) is one
`warnings[]` line and a `null` figure — never a failure and never a `0`.

### Line to install

```
20 3 * * * bash $RUN traction-snapshot --timeout 120
```

- Runs daily 03:20 UTC (13:20 AEST). Readers: `/api/status` →
  `traction: ok | stale | missing` (stale once the file is > 26 h old, so a
  skipped run is visible the same day), `/api/platform-stats` (serves
  `founders` / `analyses` / `paidCustomers` from the file while fresh, live
  query otherwise), `/admin/traction` (KPI tiles + MRR diff + warnings) and
  `cd web && npm run investor:update` (the monthly investor-update draft).
- Dry-run (builds, writes nothing):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/traction-snapshot?dry=1" | jq '.snapshot | {users, mrr_aud_cents, warnings}'
```

Expected shape: `{ ok, dry, persisted, duration_ms, snapshot }` where
`snapshot` validates against `tractionSnapshotSchema` (`users`, `analyses`,
`tbr`, `evaluators`, `assessments`, `share_links`, `api_keys_active`,
`webhooks_active`, `mrr_aud_cents`, `funnel_7d`, `generated_at`, `git_sha`,
`warnings`).

## AU comparables ingest — `/api/cron/comparables-ingest`

G13 S-R5 (2026-09-16). Weekly pull of the three allow-listed public
sources (`INGEST_SOURCES` in `web/src/lib/valuation/comparables-ingest.ts`:
Cut Through Venture monthly deal roundups, the Startup Daily "Funding" RSS
feed, ASX announcements) → regex extraction (no LLM, no spend) → dedupe on
`(name_key, round_date)` → rows inserted into `au_comparable_raises` as
`status='pending'` (≤ 50 per run). Nothing reaches a report until an admin
flips the row to `verified` on `/admin/comparables`; the valuation chapter
and the landing copy read `v_au_comparable_raises_verified` (static 32-row
fallback while it is empty). Requires migration `0402` applied first —
before it the route answers 500 (`relation … does not exist`) and the
repo keeps citing the static rows.

### Line to install

```
40 17 * * 0 bash $RUN comparables-ingest --timeout 120
```

- Runs weekly, Sunday 17:40 UTC (Monday 03:40 AEST) — after the week's
  Friday roundups and the Sunday newsletter posts, before the Monday
  review. Readers: `/admin/comparables` (review queue), `/admin` KPI tile
  (`comparables N`), `ValuationChapter.comparables.n` (via the repo cache,
  10-minute TTL — approve/reject invalidates it).
- Dry-run (fetches + extracts, writes nothing):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/comparables-ingest?dry=1" | jq '{sources, candidates, duplicates, rows: (.rows | length)}'
```

Expected shape: `{ ok, dryRun, ranAt, sources[{id,status,pages,candidates}],
candidates, duplicates, inserted, rows[{name,round_date,stage,sector,amount_aud,source_name,confidence}],
duration_ms }`. The same run is available from a shell without the server:
`node scripts/comparables/ingest-public-roundups.mjs [--write] [--only=<source>] [--json]`.

## Report email sweep — `/api/cron/report-email-sweep`

G13 S-R5 (2026-09-16, W4-review follow-up b). The founder's "Your Business
Report is ready" email carries the full PDF plus three inlined PNGs — 5–8 s
of react-pdf + sharp CPU that used to run inside the SSE stream request's
fire-and-forget. The pipeline now stamps `svi_snapshots.report_email_queued_at`
(migration `0402`) and this sweep (`web/src/lib/svi/email-queue.ts`) renders
and sends off the request path: ≤ 5 snapshots per tick, oldest first,
owner resolved from `projects.user_id`, `report_email_sent_at` stays the
idempotency marker, rows older than 48 h or without an owner / email are
dropped from the queue, transient send failures retry next tick. Before
`0402` is applied the column is missing, the route answers
`{ ok:true, error:"not_migrated" }` and the pipeline sends inline as before.

### Line to install

```
*/5 * * * * bash $RUN report-email-sweep --timeout 120
```

- Runs every 5 minutes (a founder waits ≤ 5 min for the email after the
  stream finishes; the on-screen report is unaffected).
- Dry-run (lists the queue, sends nothing):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/report-email-sweep?dry=1" | jq '{candidates, skipped}'
```

Expected shape: `{ ok, dryRun, candidates, sent[], skipped[{id,reason}],
failed[{id,reason}], duration_ms }`.

## SVI backtest v0 / calibration — `npm run backtest`

G14 S39 (2026-09-16). Scores every curated AU comparable
(`web/src/lib/data/au-comparables-backtest.ts`: hand-curated pre-raise profile
+ ≥ 1 public URL per row, the union of `au-comparable-raises.ts` and
`data/au-comparables.ts`) with `computeSVI()` at confidence pinned to
`document_uploaded`, then reports Spearman ρ of SVI vs log(round) and vs
log(valuation) — pooled and within stage — with a 1,000-resample seeded
bootstrap 95 % CI and an SVI-quartile → median-round bucket table
(`web/src/lib/backtest/`). Writes `web/content/reports/svi-backtest-latest.json`
and appends `svi-backtest-history.jsonl`. Readers: `/methodology/calibration`
(+ `/vi/…`; empty state when the file is absent) and `/api/status`
`svi_backtest: ok | stale | missing` (stale > 8 days). Claim scope is **rank
calibration only** (every row raised — survivorship); the caveats in the JSON
are rendered verbatim on the page. Not a cron-runner endpoint — it is a tsx
script, run directly like `db-backup-offsite.mjs`.

### Line to install

```
40 3 * * 0 cd /home/dovanlong/blockid.au/web && npx tsx scripts/backtest/run.ts >> /tmp/blockid-svi-backtest.log 2>&1
```

- Runs weekly, Sunday 03:40 UTC (13:40 AEST), after the restore drill and
  disk cleanup, before the migration audit. Commit the regenerated JSON +
  history line (`chore(ops): logs` sweep or by hand) — the server's
  `git reset --hard` discards uncommitted files.
- **Re-run `npm run backtest` whenever `web/src/lib/svi-analysis.ts` changes**
  (a weight, bonus or stage rule edit shifts every SVI in the set). The JSON
  carries `svi_version` + `git_sha`; the page prints both, so a stale engine
  is visible. Commit the regenerated files in the same change.
- Outcome figures come from the curated rows. When `web/.env` carries
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` the verified
  `au_comparable_raises` rows (migration `0402`) fill a *null* round /
  valuation for a curated row with the same name + stage — never overwrite,
  never add a row (a table row has no curated profile). `outcome_source` in
  the JSON records whether that happened.
- Dry-run (prints the summary, writes nothing) / full JSON:

```bash
cd web && npm run backtest -- --dry
cd web && npm run backtest -- --json | jq '{n, rho, ci}'
```

Expected summary shape: engine + sha, `N = <n> scorable (<r> with round, <v>
with valuation) of <d> curated rows; <x> source rows excluded`, pooled ρ + CI
for both targets, a per-stage table (`too_few` under 5 rows), the four SVI
quartiles with median round, and `outcome_source`.
## Open AU external signals — `node scripts/external-signals/ingest.mjs`

G14 S40 (2026-09-17). Ingests three OPEN Australian registers into
`external_signals` (migration `0410`) behind the `external_sources` licence
gate: the **ABN Bulk Extract** (data.gov.au, CC BY 3.0 AU — stream-parsed,
only ABNs in the allow-set are kept), **GrantConnect grant awards** (CC BY
3.0 AU — the CSV export) and the **ATO R&D Tax Incentive transparency
report** (CC BY 2.5 AU — xlsx converted to CSV). Cut Through Venture,
Startup Muster and ACS Digital Pulse are `cite_only` rows: the CLI refuses
them (exit 3) and reports may only cite them with a link. Dedupe =
`content_hash` (sha256 of source | ABN | type | as_of | value) in memory +
the table's unique index. Writes `web/content/reports/external-signals-latest.json`
and appends `external-signals-history.jsonl`. Readers: `/admin/external-signals`,
`/methodology` "Data sources", `lib/signals/external-signals.ts`
(`signalsForAbn` → LCO / IRI / TRE evidence rows at `connected_source`;
`cohortFromRegisters` → the register cohort when a stage has < 20 scored
startups). Licences, attribution text, refresh steps and what is cite-only:
`docs/ops/data-sources.md`. Not a cron-runner endpoint — a plain node script,
run directly like the S39 backtest.

### Line to install

```
0 3 * * 6 cd /home/dovanlong/blockid.au/web && node scripts/external-signals/ingest.mjs >> /tmp/blockid-external-signals.log 2>&1
```

- Runs weekly, Saturday 03:00 UTC (13:00 AEST). It reads the **newest file**
  under `~/blockid-data/external-signals/<source-id>/` (outside the repo, so
  the server's `git reset --hard` never touches it) and never downloads on
  its own — a source with no file is `skipped`, not an error.
- Refreshing the inputs is a founder step (`--fetch`, off-peak; the ABR
  extract is ~2 GB) — see `docs/ops/data-sources.md` § "How to refresh".
- Commit the regenerated summary JSON + history line (`chore(ops): logs`
  sweep or by hand) so the release carries the last run.
- Before the first run apply `web/supabase/migrations/0410_external_signals.sql`
  (`scripts/db/apply-migration.sh`); until then the CLI exits 1 with the
  apply hint and `/methodology` renders the code catalogue.
- Dry-run against the fixtures (no DB, no network):

```bash
node scripts/external-signals/ingest.mjs --dry --source business-gov-grants --file scripts/external-signals/fixtures/grants-sample.csv --limit 5
node scripts/external-signals/ingest.mjs --dry --json --source abr-bulk --file scripts/external-signals/fixtures/abr-sample.xml --abn-file scripts/external-signals/fixtures/abn-allow-sample.txt
```

Expected summary shape: one line per source with `status` (`ok | skipped |
refused | error`), `parsed / kept / filtered / dupes / inserted`, the input
file, and a `total` line; exit 0 ok · 1 error · 2 usage · 3 every requested
source refused.

## Founder feedback letter — `/api/cron/feedback-letters`

G14-S34 (2026-09-16, goal doc D3 / F-5). Once **k ≥ 3 evaluators from ≥ 2
organisations** (a NULL org counts as its own) have SUBMITTED an assessment
on a project and shared at least `dimension_ratings` with the claimed
founder, the founder receives one anonymised "What investors said" letter:
per-dimension mean ratings and agree shares rounded to 25 % steps, risk
buckets (counts + normalised titles only), deduplicated questions — never an
evaluator id, organisation, decision, conviction, thesis fit, valuation view
or note (`web/src/lib/evaluations/feedback-letter.ts` walks the JSON against
`FOUNDER_FORBIDDEN_FIELDS` before anything is stored). Evaluators can opt a
seat out per assessment (`POST /api/evaluations/[id]/assessment/opt-out-feedback`).

Per project the route inserts a `founder_feedback_letters` row (migration
`0406`, UNIQUE `(project_id, window_end)` where `window_end` = the run's UTC
midnight, so a same-day re-run is a `skipped_dupe`), stamps the consumed
`evaluation_assessments.feedback_letter_id`, writes the in-app
`feedback_letter` notification, emails the founder
(`sendFounderFeedbackLetter`, `svi_alerts` category, status → `sent` + the
provider message id), enqueues the `feedback_letter.sent` webhook to the
founder's own endpoints only and emits the `feedback_letter_sent` server
event. A letter whose email failed stays `draft` and is retried the next
week; a project with no NEW assessment since its last letter is
`skipped_no_new`. Before `0406` is applied the store answers
`available:false` and the route returns `{ ok:true, reason:"table_missing" }`.

### Line to install

```
0 22 * * 0 bash $RUN feedback-letters --timeout 300
```

- Sunday 22:00 UTC = Monday 08:00 AEST — one hour BEFORE
  `founder-digest-weekly` (23:00 UTC) so the letter is the first thing in
  the founder's Monday inbox.
- Dry-run (computes eligibility + the subject line, writes and sends nothing):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://blockid.au/api/cron/feedback-letters?dry=1" | jq '{candidates, would_send, skipped_below_floor, projects}'
```

Expected shape: `{ ok, dryRun, window_end, candidates, processed, sent,
would_send, sent_no_email, email_failed, skipped_below_floor,
skipped_no_new, skipped_no_founder, skipped_dupe, skipped_unsubscribed,
failed, budget_exceeded, duration_ms, projects[{project_id, k, org_count,
new_rows, weakest_dim, subject?, letter_id?, outcome}] }`.

## Autonomous goal loops

> **Removed 2026-08-13** (`fd7bb0b03`): the three loops below and their crontab lines no longer exist; this section is kept for history. Autonomous implementation now = orchestrator (`agent-orchestrator`, 12/14/16/18 UTC) + `self-upgrade-agent.sh` (18:30 UTC) reading `web/content/reports/project-state.json`. Larger goals ship via founder-driven sessions (see `docs/plans/money-finder-2026-09-10.md` §8).

Three long-running goal loops grind unblocked phases from machine-readable
goal files. All three share the reusable driver in
`scripts/cron/goal-loop.mjs` (each wrapper is ~25 lines of parameters).

| Loop            | Wrapper script                             | Goal file                                                | Cadence   | Kill env                    | Status file                          | History JSONL                                                |
| --------------- | ------------------------------------------ | -------------------------------------------------------- | --------- | --------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| reseller        | `scripts/cron/reseller-goal-loop.mjs`      | `docs/plans/reseller-module-goal.md`                     | every 5m  | `RESELLER_AUTONOMOUS_LOOP`  | `/tmp/blockid-reseller-loop.status`  | `web/content/reports/reseller-goal-history.jsonl`            |
| atlassian       | `scripts/cron/atlassian-goal-loop.mjs`     | `docs/plans/atlassian-standard-mapping-goal.md`          | every 10m (offset :07) | `ATLASSIAN_GOAL_LOOP`       | `/tmp/blockid-atlassian-loop.status` | `web/content/reports/atlassian-goal-history.jsonl`           |
| ux-ia           | `scripts/cron/ux-ia-goal-loop.mjs`         | `docs/plans/ux-ia-startup-flow-goal.md`                  | every 10m (offset :03) | `UX_IA_GOAL_LOOP`           | `/tmp/blockid-ux-ia-loop.status`     | `web/content/reports/ux-ia-goal-history.jsonl`               |

Cadence staggering (reseller :00,:05,…; atlassian :07,:17,…;
ux-ia :03,:13,…) means no two loops fire in the same minute — keeps CPU
predictable and avoids `claude` CLI contention. Each entry is wrapped in
`flock -n` against a per-loop lock file so a slow tick never overlaps
itself.

### Reading live state

The admin endpoint `GET /api/admin/goal-loop-status` merges all three
status files into one JSON response (admin-auth only). Shape:

```json
{
  "ok": true,
  "loops": {
    "reseller":  { "loop_label": "reseller-goal-loop",  "current_stage": "tick_end", ... },
    "atlassian": { "loop_label": "atlassian-goal-loop", "current_stage": "tick_end", ... },
    "ux_ia":    { "loop_label": "ux-ia-goal-loop",     "current_stage": "tick_end", ... }
  },
  "generated_at": "2026-07-24T..."
}
```

Loops that have never fired return `null` for that key.

### Kill switches — one-step disable

Each loop honours its kill env. For a **session-only** disable:

```bash
export RESELLER_AUTONOMOUS_LOOP=off
export ATLASSIAN_GOAL_LOOP=off
export UX_IA_GOAL_LOOP=off
```

(Only applies to shells that export the var — cron ignores your shell
env, so this is for manual runs only.)

For a **permanent** disable, comment out the loop's line in
`web/scripts/crontab.production` and re-apply:

```bash
crontab /home/dovanlong/blockid.au/web/scripts/crontab.production
crontab -l | grep -E 'atlassian|ux-ia|reseller'
```

The loops also self-uninstall when their goal file's top-level
`status: done`: on that tick the wrapper writes
`/tmp/blockid-<loop>-goal-done` and calls
`crontab -l | grep -v <wrapper-script>.mjs | crontab -`.

### Dry-run smoke

Every wrapper accepts `--dry-run` — logs one `tick_start` row (with
`dry_run: true`) and exits before dispatching to `claude`:

```bash
node scripts/cron/atlassian-goal-loop.mjs --dry-run
node scripts/cron/ux-ia-goal-loop.mjs --dry-run
```

## G15-R2 — error digest + latency sampler (2026-09-18)

Two plain-node observability crons (no `cron-runner.sh`; each takes its own pid
lock in `/tmp/blockid-error-digest.lock` / `/tmp/blockid-latency-sample.lock`).
Spec: `docs/plans/reliability-2026-09-18.md` § 3 R2; targets and runbook:
`docs/ops/slo.md`.

| Script | Reads | Writes | Alerts |
|---|---|---|---|
| `scripts/error-digest.mjs` | `/data/logs/blockid-production.log` from the byte offset in `/data/logs/.error-digest.offset` (offset > size ⇒ rotated ⇒ restart at 0) | `content/reports/error-digest.jsonl` (`{ts, window_min, total, classes:[{tag,msg,count,first_seen}]}`), `error-digest-state.json` (7-day class memory) | Telegram (same `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` as the fleet, 30-min debounce per class): class not seen in 7 d · ≥ 5× its 24 h hourly median and ≥ 10 lines · any `fully_degraded` / `AIBudgetExhaustedError` / `permission denied` line |
| `scripts/latency-sample.mjs` | tail of `/var/log/nginx/access.log` (+ `.1` right after logrotate) | `content/reports/latency.jsonl` (`{ts, window_min, classes:{name:{n,p50_ms,p95_ms,err_rate_5xx}}}`), `latency-state.json` (breach streaks) | Telegram after 3 consecutive 10-min windows over a class target, re-alert hourly, one "recovered" |

### Lines to install

```
*/10 * * * * cd /home/dovanlong/blockid.au/web && node scripts/error-digest.mjs >> /data/logs/blockid-error-digest.log 2>&1; bash scripts/rotate-production-log.sh >> /data/logs/blockid-error-digest.log 2>&1
*/10 * * * * cd /home/dovanlong/blockid.au/web && node scripts/latency-sample.mjs >> /data/logs/blockid-latency.log 2>&1
```

- The rotation call runs **after** the digest so the digest consumes the tail
  first; `rotate-production-log.sh` only acts at ≥ 50 MB (keep 14 files,
  copy-truncate) and always keeps `/tmp/blockid-production.log` as a symlink.
- `/data/logs` is created by the first deploy (`deploy-live.sh`) or by
  `bash scripts/rotate-production-log.sh --ensure`; mode 0750.
- `latency-sample` needs the app user in `adm` (already true: `id` shows
  `4(adm)`). If a rebuilt server loses it the script logs `skipped: no_access`
  and exits 0 — fix with `sudo usermod -aG adm dovanlong`.
- p50/p95 stay `null` until the `blockid_timing` `log_format` from
  `docs/ops/nginx/blockid-live.conf` is installed and nginx reloaded; the 5xx
  rate works with the stock `combined` format.

### Dry-run smoke

```bash
cd web && node scripts/error-digest.mjs --dry-run      # prints classes, writes nothing, no Telegram
cd web && node scripts/latency-sample.mjs --dry-run    # prints per-class n / p50 / p95 / 5xx
```

Surfaces: `/api/status` → `errors_1h`, `ai`, `queues`, `backups_detail`,
`slo.latency_p95_ms`, `crons_failed_24h` (full detail with the bearer,
redacted counts/states anonymously) and the public `/status` page.
