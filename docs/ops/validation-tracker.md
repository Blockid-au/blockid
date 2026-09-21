# Validation tracker — ops runbook (G22-D)

Owner: founder (edits) / admin session. Spec: `docs/plans/g22-upgrade-hardening-2026-09-21.md` § 2 lane D;
levels + targets from the advisor plan (`docs/plans/g21-fi-upgrade-2026-09-20.md` § 4 and the FI targets).
Code: `web/src/lib/validation/{model,ledger,auto}.ts`, `web/src/app/api/admin/validation/route.ts`,
`web/src/app/(app)/(admin)/admin/validation/**`. Page: `/admin/validation` (admin only, noindex, sidebar → Content & Growth → Validation tracker).

---

## 1. What the five levels mean

| Level | Label | Target | An entry counts (`outcome: done`) when… |
|---|---|---|---|
| L1 | Qualified interviews | 5 | a 30–45 min conversation with someone who screens startups and owns or influences the budget, with notes captured (the 14-question script below) |
| L2 | Real workflow demonstrations | 3 | the buyer ran a real intake, cohort or dossier workflow on **their own** applicants — not a slide walkthrough |
| L3 | Written pilot proposals | 2 | a written proposal with scope, price and dates was sent to a named organisation |
| L4 | Paid pilot ≥ A$1,500 | 1 | a paid Cohort Validation Pilot order of at least A$1,500 — **auto-filled** from `pilot_orders` (a manual `done` row also counts, e.g. an invoice outside Stripe) |
| L5 | Renewal or second institutional customer | 1 | the same organisation paid again, or a second organisation paid — **auto-filled** from `pilot_orders` |

`actual` on the ladder = founder entries recorded as `done` + auto rows that count (L4 / L5 paid orders). `booked` and `declined` are shown beside the rung but never counted. Every number on the page is a **target** or an **actual count of recorded events** — it is never a claim about the business and must not be quoted on a marketing surface (the claims register in `docs/design/messaging.md` governs what may be said publicly).

## 2. Where the ledger lives

`web/content/reports/validation-tracker.json` — `{ version: 1, updated_at, entries: [...] }`, one entry per conversation / demo / proposal / payment:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | minted by the API |
| `organisation` | string ≤ 160 | required; the organisation, not a person |
| `contact_role` | string ≤ 120 | e.g. "Program manager" — never a name (public repo) |
| `date` | `YYYY-MM-DD` | when it happened / is booked |
| `level` | 1–5 | the rung the entry is evidence for |
| `outcome` | `booked` · `done` · `declined` | only `done` counts |
| `objection` | string ≤ 500 | in their words, verbatim where possible |
| `objection_answered` | boolean | tick once the answer is on the site / in the proposal — drops it from "Next objection to answer" |
| `next_step` | string ≤ 300 | |
| `note` | string ≤ 2 000 | answers to the script questions, who else was in the room |
| `proposal_generated_at` | ISO or absent | G23-B — stamped by the proposal route each time the PDF is generated (§ 6); PATCH `null` to clear |
| `created_at` / `updated_at` | ISO | |

Rules:
- **Founder-edited only through the page** (`GET/POST/PATCH/DELETE /api/admin/validation`, admin-gated, zod-strict, 60 writes / h, every mutation audited as `validation.entry_created` / `_updated` / `_deleted`). Never hand-edit the JSON on the server — the API writes atomically (temp file + rename) to the live checkout.
- **Committed with the reports.** The file sits under `content/reports/`, which `deploy-live.sh`'s `DEPLOY_DIRTY_IGNORE` leaves alone, so an uncommitted edit never blocks a deploy — but the self-upgrade loop's `git reset --hard` on a failed gate would restore it to HEAD. Commit it after a session of edits:
  ```sh
  cd /home/dovanlong/blockid.au && git add web/content/reports/validation-tracker.json && git commit -m "chore(validation): tracker ledger $(date -u +%F)" && git push
  ```
- No names, e-mail addresses or anything that identifies a person (the repository is public). Organisation names are fine.
- Cap: 2 000 entries (`LEDGER_MAX_ENTRIES`); the API answers 409 `ledger_full` past it.

## 3. How the auto rows are derived (`lib/validation/model.ts` `deriveAutoRows`)

Read-only, source-labelled, QA accounts (`qa-live-*`) dropped from every source. Only paid orders count toward the ladder; everything else is a **signal** shown for context.

| Source | Row | Level | Counts? |
|---|---|---|---|
| `pilot_orders` (`status = paid`, ordered by `created_at`) | first paid order per buyer | L4 | yes when `amount_cents ≥ 150 000` (A$1,500); a smaller order is listed "below A$1,500 — not counted" |
| `pilot_orders` | a later paid order by the **same buyer** (renewal) or a paid order by a **second distinct buyer** (second organisation) | L5 | same A$1,500 rule |
| `pilot_orders` (`converted_at` set — G23-B, migration 0434) | "Pilot converted to Cohort 25 / Cohort 100 (annual) — same organisation paid again" | L5 | same A$1,500 rule (on the pilot amount) |
| `pilot_orders.metrics` (jsonb non-empty, ignoring `updated_at` / `updated_by`) | "Pilot metrics captured · n fields", plus "case-study consent given" when `case_study_consent = true` | L4 | no (signal) |
| `content/reports/pilot-applications.jsonl` | comp pilot applications from `/pilot/investor` (programme name, cohort size, intake month) | L1 | no (signal) |
| `founder_feedback_letters` (`status ∈ sent, opened`) | feedback letter sent (k, org count) | L2 | no (signal) |
| `evaluation_batches` (`done_count > 0`; owner e-mail via `app_users` for the QA filter; `program_name` when 0422 is applied) | cohort scored | L2 | no (signal) |

The organisation column shows the buyer's e-mail **domain** (never the address) for orders, the programme name for applications, `project <8 chars>` for letters, and the programme / batch name for cohorts. A missing table or column is a warning at the foot of the page (`data-testid="validation-warnings"`), never a fake 0.

**North Star + window** come verbatim from `lib/funnel/institutional.ts` `readInstitutionalFunnel` (the same reader `/admin/funnel` uses): startups assessed through paying institutional workflows this month, and the funnel's live metrics for its 28-day window.

## 4. The 14-question script

Rendered as a checklist card on the page (`lib/validation/model.ts` `VALIDATION_SCRIPT`). Ticks are for the call in front of you and are **not saved** — the answers go in the entry note. The questions are the advisor plan's script verbatim (never "Do you like BlockID?"): opening "Walk me through your current intake process."; Q12 "Would you pay A$1,500 to use it on the next cohort?"; Q13 "What would prevent you paying today?" — its answer goes verbatim into the entry's `objection`; Q14, the one that matters: "Will you pay for the next cohort now?" — record the answer exactly. The 8-question research script in `docs/research/evaluator-interviews-2026-09.md` § 4 is the longer, anonymised research instrument; this one is the sales-validation script.

## 5. Weekly checks

- `/admin/validation` — the ladder reflects last week's calls; every objection answered on the site or in a proposal is ticked `objection_answered`.
- Commit the ledger (§ 2).
- The G21 regression canary (`tests/live-qa/41-g21-regression.spec.ts`, Sun 05:10 UTC in `scripts/crontab.production`) appends to `content/reports/live-qa-history.jsonl`; a red row there is a product regression, not a tracker problem.

## 6. "Generate proposal" — the written pilot proposal (G23-B, 2026-09-21)

Level 3 counts a **written proposal with scope, price and dates sent to a named organisation**. Every entry row on `/admin/validation` has a **Proposal** button (`data-testid="validation-entry-proposal"`) → `GET /api/admin/validation/<id>/proposal` (admin only; 401 anon / 403 non-admin / 404 unknown entry / 30 per hour) → a 4-page PDF downloads, named `blockid-pilot-proposal-<organisation-slug>-<date>.pdf`.

What it contains (`lib/validation/proposal.ts` `buildPilotProposal`, rendered by `lib/pdf/pilot-proposal-pdf.tsx`): cover (organisation, contact role, date, valid 30 days, prepared by the legal entity) · **the problem in their words** (the entry's `objection` quoted verbatim + the `note`) · scope and price for the size the entry implies (a number followed by "applicants / startups / …" in the note, next step or objection; ≤ 25 → the A$1,500 pilot, otherwise the A$2,500 pilot; override with `?applicants=<n>`) · what is delivered (the six stages `/solutions/accelerator` ships, from the EN catalogue) · the six success metrics · timeline (acceptance → setup → intake → assessment → workshop → report, 90 days of workspace access) · data and consent (the approved data sentence, the applicant consent paragraph, the privacy-policy § 4 retention line) · after the pilot (Cohort 25 / Cohort 100 annual, the 60-day credit rule) · acceptance + signature block · entity / ABN footer · the general-advice disclaimer. Every number is a constant (`pilot-skus.ts`, `plans-v2.ts`, `conversion.ts`); nothing is stored — the entry gains `proposal_generated_at` and an audit row `validation.proposal_generated`.

Workflow: record the interview (L1/L2) → add an L3 row `booked` for the organisation with the objection verbatim → **Proposal** → read it once (the founder approves the wording for a real target) → send → set the L3 row to `done` and tick `objection_answered`. A signed acceptance becomes the paid pilot (L4, auto-filled from `pilot_orders` once paid).

