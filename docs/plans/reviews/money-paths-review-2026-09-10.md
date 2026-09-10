> **Disposition (2026-09-10 21:50 UTC):** all P0/P1 and the P2 items #10–#19 fixed on master (`a7edb6b81`, `91900689e`, `550038880`), migrations 0324 (`spend_credits_atomic`) + 0325 (batch leases, idempotency key) applied to production; deploy scheduled 2026-09-11 12:05 UTC (off-peak). Only #11's `pending_payment`-without-marker edge and the P2 note on calendar-token rotation remain open (low).

# Money / access path review — G11 Money Finder + G12 Evaluator ladder (120a840d3..HEAD, 2026-09-10)

Read-only review. Paths relative to `web/`. Every finding below was verified by reading the code path (and the live `plans` table where a flag mattered); speculative items were dropped.

## P0

**1. Evaluator Trust BizReport: credits spent AFTER the run, failed spend swallowed → free reports**
`src/app/api/evaluations/[id]/report/route.ts:160-175`; `src/lib/credits.ts` `spendCredits` (`.gte("balance",cost)` guard → `{ok:false}`).
Scenario: balance 3, two concurrent `confirm:true` POSTs (rate limit is 12/h). Both previews see `via:"credits"`, both pipelines run (13-agent AI cost), spend #1 ok, spend #2 `ok:false` → only `console.error`; route still returns 200 with `report_url`/`share_token`, and `evaluation_reports` says `paid_via='credits', credits_cost=3`. Same outcome for any balance drop between preview and spend.
Fix: spend (or reserve) before `runTrustReportForProject` and `grantCredits` back on throw; at minimum treat `spend.ok===false` as a failure (no share token, row marked `spend_failed`).

## P1

**2. Money Finder signed-in report: `spend_failed` row still fully readable via JSON API**
`src/app/api/funding/report/route.ts:151-167` marks the row `spend_failed` but the row already holds grants/programs/narrative; `src/lib/funding/reports.ts:370-388` `publicFundingReport` returns them for any status and `src/app/api/funding/report/[id]/route.ts:39-41` serves them with 202. The page (`(marketing)/funding/report/[id]/page.tsx:65`) hides them, the API does not.
Scenario: balance 3, two concurrent POSTs → both pass `canAfford`, both insert `ready`, second spend fails → owner GETs `/api/funding/report/<id>` and receives the full report for 0 credits.
Fix: in `publicFundingReport` (or the GET route) blank `grants/programs/timeline/narrative_md/meta.summary` unless `status === "ready"`.

**3. Grant application draft: spend failure leaves a fully-written draft the editor loads**
`src/app/api/funding/draft/route.ts:134-154` inserts the draft (with AI answers) then spends; on `!spent.ok` it returns 402 but the row persists, and `latestGrantDraft` (`src/lib/funding/application-drafts.ts:203-218`) orders by `updated_at` with no status filter, so the editor opens it.
Scenario: Starter user, balance 2, two concurrent confirmed POSTs (limit 20/h) → second draft free.
Fix: on spend failure delete the row (or set `status='spend_failed'` and exclude it in `latestGrantDraft`/`getGrantDraft`).

**4. Startup Package (A$149) buyers never receive the "Growth extras" they paid for**
`src/lib/funding/growth-extras.ts:30-38` and `src/lib/funding/analysis-refresh.ts:383-385` gate on `can(user,"startup_package")`. Nothing grants that flag to a buyer: the package webhook (`src/app/api/stripe/webhook/route.ts:1298-1425`) stamps credits + `money_radar_until` but never changes `app_users.plan` nor writes an `entitlements` row; live `plans.founder_free.feature_flags = ["svi.public"]`, `founder_starter` has no `startup_package`.
Scenario: package buyer on Free/Starter opens `/api/funding/draft` → `unlimited=false` → charged 2 credits per draft (or 403 `plan_required` on Free since `grant_finder` is only timed for `money_radar`); quarterly `analysis_refreshes` and investor reverse-match never produced for them. Inverse hazard: `LEGACY_FEATURE_FALLBACK.founder_free` (`src/lib/entitlements.ts:128`) *does* contain `startup_package`, so a DB outage / fallback path gives every free user unlimited drafts.
Fix: gate on the purchase (`startup_package_purchases` / `projects.package_purchased_at`, or `money_radar_until > now()`), not the `startup_package` feature; drop `startup_package` from the `founder_free` fallback.

**5. Startup Package buyers are excluded from the Money Radar sweep**
`src/lib/funding/radar-sweep.ts:596-655` `listSubscribers` builds the audience from `plans.feature_flags ∋ money_radar` + `entitlements(feature=money_radar)` only; `money_radar_until` appears 0 times in the file. The webhook (`webhook/route.ts:1327-1347`) only stamps `money_radar_until`.
Scenario: Free founder buys the package → `can(user,"money_radar")` true (timed layer), calendar.ics works, but the Sunday sweep never targets them → no deadline alerts / `radar_t30|t14|t3` drips for the 90 days.
Fix: add `app_users.money_radar_until > now()` (or `liveTimedGrants`) as a third audience source with channels `["inapp","email","ics"]`.

**6. Batch item claim not atomic → an item can be scored twice (2 reports, 2 quota rows)**
`src/lib/evaluations/batch.ts:323-344` selects `status='queued'`, `markItem` (`:358-368`) updates by id only; `claimNextBatch` (`:302-317`) same. `scripts/cron-runner.sh:34-36` hard-kills the runner shell at 90 s and its `trap` releases the flock while the Next handler keeps running (`BUDGET_MS=240_000`, `evaluation-batch-runner/route.ts:53`), so a second tick / manual POST can overlap.
Fix: `update … set status='running' where id=? and status='queued'` (`.select("id")`), skip on 0 rows; same guard on the batch flip.

**7. Stuck `running` item wedges the platform-wide batch queue**
`batch.ts:302-317` always picks the oldest `queued|running` batch; `finaliseBatch` (`:387-418`) treats `running` as pending; items have no lease/`started_at`. A restart/deploy mid-item (deploys share the 12-20 UTC window) leaves the item `running` forever → that batch never closes → no later batch from any user is ever claimed, and `countPendingBatchItems` (`:94-115`) keeps reserving the user's quota.
Fix: stamp `started_at` on items; runner requeues/fails items `running` longer than N min before `nextQueuedItems`.

**8. Quota reservation is one-way → more included reports than the plan**
`src/lib/evaluations/report-quota.ts:225-231` `previewReportCharge` ignores queued batch items (only `batch/route.ts:88-90` subtracts them); the runner (`evaluation-batch-runner/route.ts:137-163`) never re-checks quota/plan and always writes `paid_via='quota'`.
Scenario: Program user queues 100, then runs N direct full reports at `via:"quota"`; cron still scores all 100 → 100+N included. Downgrade/cancel after queuing still gets the batch processed.
Fix: subtract `countPendingBatchItems` in `previewReportCharge`; runner calls `getReportQuota` per item and marks `failed:"quota_exhausted"` at 0.

**9. Client timeout tells the evaluator "Nothing was charged" while the server keeps running and charges**
`src/app/(app)/(founder)/workspace/evaluations/report-dialog.tsx:139-140`; route has no idempotency key. Cloudflare's 100 s origin cap is below the "1–3 min" UI estimate → user retries → second run, second charge.
Fix: return an existing `evaluation_reports` row for (evaluation, kind) created within ~10 min instead of re-running, or make full runs async (the batch runner is the seam).

## P2

10. `publicFundingReport` (`reports.ts:383`) returns `meta` verbatim, which the webhook stamps with `stripe_payment_intent`, `stripe_event_id`, `paid_amount_cents` (`reports.ts:233-239,153`) — contradicts the route header "Stripe ids never leave the server". Strip those keys.
11. Webhook `funding_report`: `update_failed`/`row_missing` return `ok:false` without throwing (`reports.ts:243-246`, `webhook/route.ts:1259-1267`) → row stays `pending_payment`, no email, no revenue event, and a Stripe retry is deduped by `claimWebhookEvent` anyway. A `failed` generation gets a "being prepared" email pointing at a page that says contact support; no automatic regeneration exists. Add a small `funding-report-retry` sweep for `status in ('paid','failed') and meta->>'paid_at' is not null`.
12. Startup Package re-purchase resets rather than extends Radar: `webhook/route.ts:1332-1337` writes `now+90d` when the column is NULL or earlier; buying a second package on day 30 yields d120, not d180. If intent is additive, use `greatest(coalesce(money_radar_until,now()),now()) + 90d`; otherwise document.
13. Evaluator progress weekly: slot is claimed before `notifyEvaluatorProgress`/`canSendEmail`; a throw there hits the outer catch (`evaluator-progress-weekly/route.ts:208-212`) without `releaseProgressSend` → that user's week is lost (no duplicate). Release in the catch when `claim==="claimed"`.
14. `?cohort=` on `/api/reports/quarterly` (`route.ts:45-53`) selects `owner_id, stage, latest_svi, is_active` from `cohort_members`, whose live schema (migration 0021) has none of them → always 404 (fails closed); the accelerator page link is equally dead. `accelerator_*` plans have no `usage_limits.reports_per_month` so `canBatchScore` admits them but batch POST always 402s.
15. `cron-runner.sh:36` 90 s watchdog vs `BUDGET_MS=240_000` — every non-idle batch tick logs a curl error + Telegram alert (no data loss). Lower items-per-tick/budget or exempt the endpoint.
16. Evaluator radar "money signals" block (`progress-radar.ts:407-412`) filters `funding_matches` by `user_id = evaluator`, but rows are keyed to the founder → always empty.
17. register-with-card accepts `founder_enterprise` (custom-priced, `trial_days 0`) via `SIGNUP_ALLOWED_PLAN_IDS` (`src/lib/plans/signup-plans.ts:25-29`); only unprovisioned env keeps it from self-serve. Reject `plan.interval === "custom"`. Also `account_type` is client-chosen independent of plan (segment mis-bucketing only; entitlements are plan-based).
18. Pre-existing but exercised by every new credit path: `spendCredits` (`credits.ts:640-672`) computes `newBalance` from a stale read and guards with `.gte("balance",cost)` — two concurrent spends from 6 both write 3 (net -3 for two features). Move to an RPC `balance = balance - cost where balance >= cost`.
19. Calendar token: plaintext in `app_users.calendar_token`, no rotate/revoke endpoint; `escapeIcsText` omits `\r`. Cron Bearer checks are plain `!==` (fail closed; same as every existing cron).

## Checked, OK
- `/api/funding/checkout`: row before Stripe, `stripe_session_id` UNIQUE, price from server map, disposable-email + IP/email rate limits, failed Stripe call marks row `failed`.
- Webhook `funding_report`: short-circuits before subscription branches; advances only from `pending_payment` (`.eq("status","pending_payment")`), replay → `already_processed`, no double email/revenue event; `money_radar_until` stamped only for `blockid_user_id` set server-side at checkout, never shortened.
- `canViewFundingReport`: owner / 24-byte `access_token` (constant-time compare) / Stripe session id; unknown → 404; `save-to-dataroom` owner+project-owner only; PDF 409 until `ready`.
- Draft route: `plan_required` 403 before any cost, preview returns cost with no spend, AI failure (`ai_ok=false`) never charged, PATCH scoped by `user_id`.
- Evaluations: every read/write filters `evaluator_user_id`/`user_id`; batch items/CSV/quarterly `?batch=` reachable only via owner-checked batch; claim token nanoid(24), email-bound, idempotent, never echoed; founders cannot run reports; `paid_via` full→quota while remaining>0 else credits, rescore never quota; row only after success; throw → no row, no spend.
- Batch create: all-or-nothing quota check incl. pending items, `BATCH_MAX_ITEMS`, `UNIQUE(batch_id,evaluation_id)`, compensating delete.
- Quarterly HTML: all user strings through `esc()`; nonce from `x-nonce` (set by `proxy.ts:148`, `/api` inside matcher) matches response CSP; CSV has BOM/CRLF/RFC4180 + formula guard.
- calendar.ics: user-scoped `funding_matches`, `money_radar` re-checked per fetch, race-safe mint, ICS text escaped.
- register-with-card: plan allow-listed, Stripe price + `trial_days` from the plan row, `email` UNIQUE blocks double-submit, customer+row deleted on Stripe failure.
- timed-grants: UTC ms arithmetic, unparseable → fail closed, anonymous → `[]`, union-only.
- Crons: all fail closed on missing `CRON_SECRET`; flock per endpoint; radar drips dedupe on `(email,campaign,ref_id)` 45 d + `funding_matches` identity key; progress-weekly claims `(user_id,period_start)` UNIQUE before send; refresh-funding-sources writes only `upcoming→open`, rest to review queue; fetch-source has timeouts/2 MB cap and seed-only URLs.
- Migrations 0309–0323: RLS on every new table; owner-only `auth.uid()` selects + `service_role` all; public read only on `au_grants`/`au_programs` (catalogue); `app_users` has no anon policies; CHECKs match TS enums (`owner_kind`, `consent_tier`, `state`, `kind`, `paid_via`, batch/item `status`, `email_drips.campaign`, `ref_kind`, draft `status`, `account_type`/`segment`); `funding_reports.status` has no CHECK so `spend_failed` is legal.
