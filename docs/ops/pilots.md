# Evaluator pilots — ops runbook (G16-C) — **RETIRED 2026-09-21 (G25)**

> **Status:** retired by founder decision on 2026-09-21 ("bỏ luôn coupon và pilot"). Neither kind of pilot below is offered any more:
> the paid Cohort Validation Pilot (G21 P0-C) and its pilot → annual credit coupons (G23-B) are gone from the code, and the
> comped evaluator pilot (G16-C) can no longer be started (`POST /api/admin/pilots` → `410 pilots_retired`; `/pilot/investor`
> and `/api/pilot/apply` are gone). Evaluators go straight to the sold ladder — Cohort 25 / Cohort 100 annual with the
> card-required trial ("Start a cohort"), or Scout / Firm / Program. What survives, read-only:
>
> - `/admin/pilots` — the ledger of past comps (`content/pilots.json`); a comp still running can be **ended early**
>   (`DELETE /api/admin/pilots/[id]`) and the expiry cron keeps reverting expired comps to `previous_plan`.
> - `pilot_orders` (migrations 0416 / 0434) — a 7-year financial record, anonymised by `erase_account()`; 0437 re-comments
>   it "retired 2026-09-21 (G25) — read-only ledger". No code writes it.
> - The success-metric form moved to the **Cohort onboarding kit** (`/workspace/accelerator/onboarding`,
>   `org_settings.onboarding_metrics`, migration 0438); the written proposal became the **Cohort proposal**
>   (`docs/ops/validation-tracker.md` § 6).
>
> Everything below this line is the historical runbook, kept for the ledger's shape and the expiry cron.


Owner: founder / admin session. Spec: `docs/plans/first-dollar-2026-09-19.md` § 3 C.
Offer terms: `docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md` § 3;
success criteria: `docs/marketing/traction-kit-2026-09/t2-accelerator-pilots.md` § 3.
Code: `web/src/lib/pilots/*` (offer, ledger, service, e-mails, applications),
`web/src/app/api/admin/pilots/**`, `web/src/app/api/cron/pilot-expiry`,
`web/src/app/api/pilot/apply`, `web/src/app/(marketing)/pilot`, `web/src/app/(app)/(admin)/admin/pilots`.

---

## 0. Two kinds of pilot (G21 P0-C, 2026-09-20)

| | Comped evaluator pilot (G16-C) | **Paid Cohort Validation Pilot** (G21 P0-C) |
|---|---|---|
| Page | `/pilot/investor` (noindex, invitation-only; apply form → `POST /api/pilot/apply`) | `/pilot` (public), `/solutions/accelerator#pilot`, `/pricing?segment=programs` pilot rung |
| Price | free — admin credit grant, cap 5 | A$1,500 (≤ 25 applicants) / A$2,500 (≤ 50) inc. GST, one-off Stripe checkout (`cohort_pilot_25` / `cohort_pilot_50`, `lib/pricing/pilot-skus.ts`) |
| Start | admin `POST /api/admin/pilots` → `startPilot()` | Stripe webhook `checkout.session.completed` (`metadata.kind = cohort_pilot`) → `lib/pilots/paid-orders.ts fulfilPaidPilot()` → `pilot_orders` row (migration 0416) + `startPaidPilot()` (`source: "paid"`) |
| Tier | `investor_vc_small` (Program) for 30 d | `accelerator_starter` (25) / `accelerator_growth` (50) for 90 d; a buyer with a live Stripe subscription keeps their plan (warning in the ops alert — grant by hand) |
| Ledger row | `source` absent / `comp` | `source: "paid"`, `order_id`, `applicants_cap`; never counts against the comp cap |
| End | admin end / expiry cron reverts to `previous_plan` | same cron, same revert (the row carries the tier it granted) |
| Env | — | `STRIPE_PRICE_COHORT_PILOT_25` / `_50` — unset → checkout `409 sku_unconfigured`, buttons link to `/contact?topic=pilot`; mint with `node scripts/stripe/seed-pilot-prices.mjs --live` (founder only) |
| Desk | — | `/workspace/accelerator` banner "Cohort Validation Pilot active — up to N applicants · until <date>" from `pilot_orders` |

## 1. What a pilot is (F-1 defaults)

| Term | Value | Where it lives |
|---|---|---|
| Tier | `investor_vc_small` (Program, A$349/mo list) | `PILOT_TIER` in `lib/pilots/offer.ts`; price read from `plans-v2.ts` |
| Length | 30 days (admin may pass 1–90) | `DEFAULT_PILOT_DAYS` |
| Cap | 5 `active` pilots; the 6th → 409 | `PILOT_CAP` |
| Applicants | ≤ 60 (the intake link's `max_submissions`) | `PILOT_MAX_APPLICANTS` |
| Credits | `FEATURE_COSTS.trust_report` (A$3) × 60 = **180** by default | `defaultPilotCredits()` |
| Comp mechanism | `app_users.plan` set directly + `grantCredits()` — **never a Stripe coupon, no card** | `lib/pilots/service.ts` `startPilot` |
| Revert | on end / expiry → `previous_plan` (or `free`) **unless** `subscription_trial_state` has a `trialing / active / past_due` row for the user, or the plan is no longer the pilot tier | `endPilot` |

Every start / end / expiry writes an `audit_events` row (`pilot.started` / `pilot.ended` /
`pilot.expired`, actor `admin` or `cron`) through `appendAudit`, e-mails the evaluator
(welcome / ended) and pages ops (Telegram → e-mail fallback). E-mail / alert / audit
failures never roll back the comp — they come back as `warnings[]` in the API response.

## 2. The ledger — `web/content/pilots.json`

* Committed, small, **admin-edited only through the API** (atomic temp-file + rename).
* On production the app writes to the **live checkout**
  (`BLOCKID_WEB_DIR` → `/home/dovanlong/blockid.au/web` → cwd), not the release copy.
* Durability: `content/reports/pilots-journal.jsonl` (gitignored, append-only) records
  every mutation; `readLedger()` replays journal rows newer than the file's copy and
  logs `ledger recovered N row(s)`. This covers the self-upgrade loop's
  `git reset --hard` on a failed gate, which would otherwise restore an older
  `pilots.json`.
* **After every start / end, commit the ledger:**

  ```sh
  cd /home/dovanlong/blockid.au && git add web/content/pilots.json && \
    git commit -m "chore(pilots): ledger — <program> started|ended" && git push origin master
  ```

Row shape: `{id, user_id, email, program_name, tier, previous_plan, started_at, expires_at,
credits_granted, intake_id, intake_slug, status: active|ended|expired, ended_at,
ended_reason, reminder_sent_at, plan_reverted, updated_at, started_by, note}`.

## 3. API

| Call | Auth | Result |
|---|---|---|
| `GET /api/admin/pilots` | admin (401 anon / 403 non-admin) | `{ pilots:[…+days_left, submissions, reports_run, assessments, email_masked, intake_url], active, cap }` |
| `POST /api/admin/pilots` `{email, program_name, days?, credits?, intake_slug?, intake_name?}` | admin | 201 new · 200 `existing:true` (idempotent on e-mail) · 400 · **404 unknown evaluator (never creates accounts)** · 409 cap · 503 |
| `DELETE /api/admin/pilots/<id>` `{reason?: ended_early|converted|withdrawn|other, note?}` | admin | 200 `{plan_reverted}` · 404 · 409 already ended |
| `GET|POST /api/cron/pilot-expiry[?dry=1]` | `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` | `{reminded:[…], expired:[…], warnings}` |
| `POST /api/pilot/apply` | anonymous; honeypot `company_website` → 204; 5 / IP / 10 min → 429 | 200 `{id}` — appended to `content/reports/pilot-applications.jsonl`, ops paged, applicant auto-replied |

Counts: `intake_submissions` (by `intake_id`), `evaluation_reports.user_id`,
`evaluation_assessments.assessor_user_id` — both since `started_at`.

## 4. Cron

`web/scripts/crontab.production` (under `# G16-C`):

```
20 4 * * * bash $RUN pilot-expiry --timeout 120
```

Install with `crontab /home/dovanlong/blockid.au/web/scripts/crontab.production` (the
single source — see `docs/ops/crontab-setup.md`). Inspect without side effects:

```sh
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/pilot-expiry?dry=1" | jq
```

T-3 d reminder is sent once (`reminder_sent_at`); expiry runs the same revert logic as
"end early" with reason `expired`.

## 5. Throw-away pilot (post-deploy acceptance — main session)

Needs an existing evaluator account. Use the live-QA evaluator seat if a run is in
progress, or register a throw-away `qa-live-evaluator-<stamp>@blockid.au` first.

```sh
# 1. start (admin session cookie; or from /admin/pilots → "Start pilot")
curl -s -X POST https://blockid.au/api/admin/pilots \
  -H "content-type: application/json" -b "blockid_session=$ADMIN_SESSION" \
  -d '{"email":"<evaluator e-mail>","program_name":"Throw-away pilot","days":1,"credits":3}' | jq
#    expect 201, pilot.tier = investor_vc_small, previous_plan = <old plan>, intake_url = /apply/<slug>
#    check: welcome e-mail arrived (data sentence, intake URL); Telegram/e-mail ops alert; audit row
#    psql: select action, detail->>'program_name' from audit_events where action like 'pilot.%' order by id desc limit 3;

# 2. list + dry expiry
curl -s https://blockid.au/api/admin/pilots -b "blockid_session=$ADMIN_SESSION" | jq '.pilots[0] | {program_name, days_left, submissions, reports_run, assessments, status}'
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/pilot-expiry?dry=1" | jq

# 3. end early (or the "End early" button on /admin/pilots)
curl -s -X DELETE https://blockid.au/api/admin/pilots/<id> \
  -H "content-type: application/json" -b "blockid_session=$ADMIN_SESSION" \
  -d '{"reason":"withdrawn","note":"post-deploy acceptance"}' | jq
#    expect 200, plan_reverted = true (no Stripe subscription on the throw-away), pilot.status = ended
#    psql: select plan from app_users where email = '<evaluator e-mail>';   -- back to previous_plan / free

# 4. commit the ledger (see § 2), then erase the throw-away account if it was created for this
```

## 6. Erasure

The ledger and the applications file are **files, not tables** (G16 § 2: no new
`app_users` FKs), so `lib/privacy/erasure-map.ts` does not see them. When an account
erasure request names an evaluator or applicant e-mail:

1. `web/content/pilots.json` — replace `email` with the tombstone
   (`erased+<id>@blockid.invalid`), keep the row (audit / cap history); commit.
2. `web/content/reports/pilots-journal.jsonl` — delete lines whose `pilot.email` matches
   (`grep -v` into a temp file, then `mv`); the file is gitignored.
3. `web/content/reports/pilot-applications.jsonl` — delete lines whose `email` matches
   (same `grep -v` + `mv`).
4. `audit_events` rows carry only ids (no e-mail) — nothing to do.

Record the step in the erasure ticket like any other manual sink.

## 7. Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `404 user_not_found` | evaluator has no `app_users` row | they sign up first (e-mail or Google); pilots never create accounts |
| `409 cap_reached` | 5 active | end one (`DELETE`) or wait for expiry |
| `warnings: ["intake create: …not_migrated"]` | 0405 not applied | apply `0405_program_intakes.sql`; link an intake later via `intake_slug` on a fresh start (after ending) |
| `plan_reverted: false` on end | Stripe subscription row or plan changed since | expected — never downgrade a payer; check `subscription_trial_state` |
| ledger row missing after a deploy | `git reset --hard` restored an old file | `readLedger()` replays the journal on the next read; commit `pilots.json` |

## 8. Pilot → annual Cohort plan (G23-B, 2026-09-21)

The paid pilot ends in one of two ways: the program converts to the annual Cohort rung its SKU maps to (Cohort 25 for `cohort_pilot_25`, Cohort 100 for `cohort_pilot_50`) with the pilot fee credited against the first year, or it lapses. Pricing, the coupon env NAMES and the credit rule live in `docs/ops/pricing-truth.md` § 11 — this section is the ops view.

| Step | Where | What happens |
|---|---|---|
| Offer | `/workspace/accelerator/pilot` card "Convert to Cohort 25 / Cohort 100 (annual)" (`lib/pilots/conversion.ts` `conversionOffer`) | rendered for the newest paid `pilot_orders` row (`findLatestPilotOrder` — the card outlives the entitlement by the 60-day window); quotes the annual price inc. GST, the credit and the first-year figure; `data-convert-mode` = `checkout` (coupon set) · `contact` (coupon unset → `/contact?topic=pilot`) · `closed` · `converted` |
| Checkout | `POST /api/stripe/checkout { plan, interval: "annual", convert_from_pilot: <order id> }` | owner + window + SKU → rung checks, then the founder-minted coupon (env NAME only); `409 coupon_unconfigured` + fallback until the founder mints it |
| Record | webhook `customer.subscription.created` with `metadata.pilot_order_id` | `pilot_orders.converted_at`, `converted_plan`, `converted_subscription_id` (migration `0434`, idempotent on `converted_at IS NULL`); audit `pilot.converted`; FI event `subscription_started` with `channel: "pilot_conversion"` |
| Tracker | `/admin/validation` auto rows | a converted pilot is an **L5** row ("Pilot converted to Cohort 25 (annual) — same organisation paid again"), counted when the pilot was ≥ A$1,500 |

**By hand (coupon not yet minted, or the program pays by invoice):** create the annual subscription from the Stripe dashboard with the credit applied, then `update pilot_orders set converted_at = now(), converted_plan = 'accelerator_starter', converted_subscription_id = '<sub_…>' where id = '<order id>';` — the card and the tracker read the row, not Stripe.

**Failure modes:** `409 conversion_plan_mismatch` — the program picked the wrong rung (a 25 pilot converts to Cohort 25 only; upsells are a sales conversation); `409 conversion_window_closed` — more than 60 days after `entitlement_until` (sell at list price); `404 order_not_found` / `403 not_order_owner` — the converting account is not the buyer (the pilot was paid from another login — convert from that login or by hand); the webhook logs `pilot conversion skipped` when the subscription carries no `pilot_order_id` (a plain Cohort checkout — nothing to do).

