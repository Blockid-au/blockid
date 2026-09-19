# Evaluator pilots — ops runbook (G16-C)

Owner: founder / admin session. Spec: `docs/plans/first-dollar-2026-09-19.md` § 3 C.
Offer terms: `docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md` § 3;
success criteria: `docs/marketing/traction-kit-2026-09/t2-accelerator-pilots.md` § 3.
Code: `web/src/lib/pilots/*` (offer, ledger, service, e-mails, applications),
`web/src/app/api/admin/pilots/**`, `web/src/app/api/cron/pilot-expiry`,
`web/src/app/api/pilot/apply`, `web/src/app/(marketing)/pilot`, `web/src/app/(app)/(admin)/admin/pilots`.

---

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
