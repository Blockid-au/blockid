# Free reports — the two-free allowance (G25-C, 2026-09-21)

Owner: lane C of G25 · Spec: `docs/plans/g25-remove-pilot-claude-cli-2026-09-21.md` · Pricing: `docs/ops/pricing-truth.md` § 12

Related: `web/src/lib/reports/free-grants-rules.ts` (rules, pure) · `free-grants.ts` (ledger I/O) · `free-report-gate.ts` (the gate `POST /api/intake` runs) · `free-report-copy.ts` (EN/VI copy) · `web/supabase/migrations/0439_free_report_grants.sql` · `0440_erasure_map_free_report_grants.sql` · `tests/live-qa/43-free-reports.spec.ts`

Founder decision 2026-09-21 (verbatim, Vietnamese): *"cho phép phân tích 2 lần đầu miễn phí, nhưng cần ghi nhận email để gởi report về và ghi nhận vào hệ thống số lượng người submit và nhận report biz"* — the first **two** analyses are free, an **e-mail address is required** so the business report can be sent, and the system **records how many people submitted and how many received the report**.

---

## 1. What a visitor sees

**Guest** (`/analyze`, or the homepage hero handoff):

1. Types an idea / pastes a URL / drops a deck. Before anything is sent, the **e-mail panel** asks where the report goes (one consent line naming Auschain PTY LTD + "unsubscribe any time", and the approved data-principle sentence). The address is remembered on that browser (`localStorage` `blockid_report_email`) so the second run is one click. No account, no card.
2. The run starts. The results page shows "Free report 1 of 2 · e-mailed to f***@… as a PDF the moment it is written" and streams the seven C-level sections (never locked — the address is on the row from birth). The PDF + secure download link (`/api/analyses/[id]/report.pdf?token=…`) go out when the job lands (`deliverFullReport`).
3. Second run: "2 of 2 · This is your last free report."
4. Third run: **nothing runs** — the page shows the quote: "Your two free reports are used — the next one is the full Trusted Business Report, A$3 inc. GST." A deck / URL opens the existing guest A$3 checkout (address pre-filled); a typed idea offers "Create a free account to buy it" (→ workspace unlock rail → `ReportPaywallGate`).

**Signed-in founder:** no panel (the account address is used). Same two-free rule on that address — a guest who used both on the same e-mail then signs up gets the quote, not a third free report. A paid report entitlement (`report.basic` / `report.premium`) is never counted.

**Over the daily cap:** the submission is accepted and recorded, the page says "Today's free reports are all taken, so yours is in the queue — we e-mail it the moment it is written. You can close this page." and polls slowly (60 s). The cron starts the run when the cap allows.

## 2. The ledger — `free_report_grants` (0439)

One row per free report. Reserved **before** the pipeline runs (`recordSubmission`, `delivery_status = queued`), attached to the `analyses` row (`attachAnalysis`), stamped when the PDF e-mail is accepted (`markDelivered` → `sent`, `delivered_at`) or refused (`failed`). A run that never saved releases its reservation (`releaseGrant`).

| Column | Meaning |
|---|---|
| `email_hash` | sha256 of the normalised address — the identity the allowance is counted on |
| `email` | the address as given (lower-cased; plain text like `analyses.full_report_email`) |
| `analysis_id` | the `analyses` row (no FK; AGENTS.md: FKs to `projects` only) · `project_id` optional FK → `projects` |
| `ip_hash` | `lib/iphash.ts hashIp()` — sha256 + **daily-rotating** salt (`IP_HASH_SALT` or the date); never a raw IP |
| `sequence_no` | 1 \| 2 — UNIQUE with `email_hash`: the database is the arbiter of "first", "second" and "no third" |
| `source` | `guest` \| `account` |
| `delivery_status` | `queued` \| `sent` \| `failed` |

RLS: service-role only. The gate's counts **fail open** (a database wobble opens the free path; the UNIQUE index still bounds it); the reservation failing lets the run proceed **without** a grant (logged `[free-report-gate] ledger unavailable`).

## 3. Metrics

* `GET /api/status` (trusted, `Authorization: Bearer $STATUS_FULL_TOKEN`) → `free_reports: { submitted, delivered, unique_emails, today, cap, converted_to_paid, last_7_days[7] }` — 60-s cache, bounded to the newest 20 000 rows; a failed read answers the empty block with the cap (never a 500). Absent from the public payload.
* `/admin/funnel` → "Free reports" block: Submitted / Delivered / People / Today vs cap / Converted to paid, plus the 7-day sparkline (line = submitted, dots = delivered). Live from the ledger.
* Funnel events (`analytics_events` + GA4): `free_report_submitted { grant_id, sequence_no, source, queued, analysis_id }` once per grant (idempotent event id) and `free_report_delivered` once per grant when the e-mail is accepted. Both carry `qa: true` for `qa-live-*` addresses. Listed in `GA4_AUDIT_EVENTS`.
* `converted_to_paid` = distinct grant addresses that later paid: a paid `guest_analyses` row on the same address, or a member (`app_users.email`) with a `report_orders` row in `PAID` / `GENERATING` / `READY` / `EXPIRED`.

## 4. The cap — `FREE_REPORTS_DAILY_CAP`

Env NAME only (default **50**; `0` pauses free runs for the day; blank / garbage → default). Counted on `submitted_at ≥ today 00:00 UTC`. When reached:

* `POST /api/intake` still accepts, records and saves the row (`full_report_status = queued`, attempts 0) but does **not** start the job; the response carries `freeReport.queued: true`.
* The `first-analysis-report` cron (`sweepFirstAnalysisReports`) holds **never-started** rows (`queued`, attempts 0) while the cap is reached (`heldForCap[]` in its summary) and runs them once it is not — in-flight, failed and partial rows keep going; e-mails are never held.
* `GET /api/analyses/[id]/full-report` does not kick a held row either (`heldForCap: true`, `pollAfterSec: 60`).

Set it in `web/.env.production` and restart; no deploy. Runs deferred today are started by the cron on the next UTC day (or as soon as the cap is raised).

## 5. Abuse guard (in order, cheapest first)

1. Honeypot `company_website` filled → 400 (answered as `email_invalid` so a bot learns nothing).
2. Disposable domains (`DISPOSABLE_DOMAINS`, the same list `api/funding/checkout` and `api/guest-analysis/create-order` carry) → 400 `email_disposable`.
3. **≤ 3 free reports per IP hash per UTC day** (`FREE_REPORTS_PER_IP_PER_DAY`) → 429 `free_ip_limit`. Skipped for signed-in callers and when no client IP is known.
4. The per-address allowance → 200 `free_allowance_used` (the quote).
5. The platform cap → queued, never refused.

The S32 anonymous run ceiling (`checkAnonRunLimit`, per-IP per hour/day on the pipeline) and the write rate limit are unchanged underneath.

## 6. Granting a third report by hand

The allowance is the two rows. To let one address run again for free, remove (or re-sequence) one of its rows:

```sql
-- see what they have
select id, sequence_no, source, delivery_status, delivered_at, analysis_id
  from public.free_report_grants where email = lower('founder@example.com') order by sequence_no;

-- give one back: delete the row that was never delivered (or the older one)
delete from public.free_report_grants where email = lower('founder@example.com') and delivery_status <> 'sent' and sequence_no = 2;
```

The next submission then reserves `sequence_no = 2` again. (There is deliberately no admin endpoint: a comp is a founder decision, and the ledger row is the audit trail — the deleted row's report stays on `analyses`.) A stuck reservation (`analysis_id IS NULL`, `delivery_status = queued`, older than an hour) means a run that failed after reserving and could not release — delete it the same way.

## 7. Erasure

`free_report_grants` is keyed by the address (no `app_users` FK) → `NON_FK_EXTRAS` `by: email, mode: delete` in `lib/privacy/erasure-map.ts`; migration **0440** re-emits `erase_account()` with the row. Guests without an account: `delete from public.free_report_grants where email = lower($1)` by hand on request (the same 30-day class as `analyses` guest rows).

## 8. Verification

* Unit: `lib/reports/free-grants-rules.test.ts` (normalisation, caps, sequence, cap message, env), `free-report-gate.test.ts`, `free-grants.test.ts`, `api/intake/route.test.ts` § G25-C, `first-analysis/sweep.test.ts` § cap, `job.test.ts` § ledger stamp, `api/analyses/[id]/full-report/route.test.ts` § held, `api/status/route.test.ts` § free_reports, `components/analyze/free-report-panels.test.tsx`, `privacy/erasure-map.test.ts`, `i18n/messages-parity.test.ts` § free_report.*.
* Live: `tests/live-qa/43-free-reports.spec.ts` — 400s, the seeded third run → quote (guest + account), trusted status block, erase dry-run lists the table. Real free runs only with `LIVE_QA_SPEND_OK=1`.
