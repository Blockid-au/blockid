# Demo cohort — runbook (G24-C, 2026-09-21)

The demo cohort is one `evaluation_batches` row per evaluator (or acting organisation) flagged `is_demo`, holding **five fictional startups** so a program buyer — or the founder in a sales call — can run the whole cohort workflow (filters, compare, overrides, snapshots, Cohort Report, demo-day pack, feedback letters) before a single real applicant is imported.

**Plan:** `docs/plans/g24-report-readability-demo-cohort-2026-09-21.md` § 2 C · **Code:** `web/src/lib/evaluations/demo-cohort{,-shared,-labels}.ts`, `web/src/app/api/evaluations/batch/demo/route.ts`, `web/src/components/evaluations/DemoCohort{Chip,Actions}.tsx` · **Migration:** `web/supabase/migrations/0436_evaluation_batches_is_demo.sql` (apply with `scripts/db/apply-migration.sh`; until it is applied the create route answers `503 migration_pending` and every reader falls back on 42703).

## What it is

| Fact | Value |
|---|---|
| Startups | Wattlebyte Compliance · Coralwind Health · Pelicanpay Ledger · Brolgafield Agsense · Emberquay Climate — every name ends in "(demo)", coinages that are not registered AU business names, **no ABN** |
| Scores | Deterministic, **no AI call, zero cost**: each startup holds a subset of the demo evidence register (`lib/report-v2/fixtures.ts`, the same rows `/tbr/demo` renders) and its 8 dimension scores scale the register's scores by coverage (`buildDemoCohortItems`) |
| Spread | Verification levels L1–L5 (one each), evidence confidence 30–95, stage Idea → Early traction |
| Risk stories | Pelicanpay carries one **conflicting claim** (deck MRR ≠ Stripe); Coralwind one **stale connector** (Xero, 97 days) |
| Rows written | `projects` (5, evaluator-owned, `demo-cohort-<key>` slug, `verification_level`), `evaluations` (5, note "Demo data — fictional…"), `evaluation_batches` (1, `is_demo`, status `done`), `evaluation_batch_items` (5, `done`, `svi_total` + `dimension_scores`) — **nothing else** (pinned by `demo-cohort.test.ts`) |
| Label | Every company card / row / header carries the "Demo data — fictional" chip (`data-testid="demo-chip"`); the cohort page and the journey show a banner |

## Where it is excluded (each pinned by a test)

| Surface | How | Test |
|---|---|---|
| Benchmarks, assessment-context pools, Startup Index, calibration, outcome signals | By construction — the seeder never writes `svi_analyses` / `svi_snapshots` / `evaluation_reports` / `claims` / connector rows, which are the only tables those pools read | `lib/evaluations/demo-cohort.test.ts` ("writes only the four allowed tables") |
| Institutional API `/api/v1/institutional/cohorts` (+ `/cohorts/[id]`, `/snapshots`) | `listReadableBatches` drops `isDemo`; keyed reads answer 404 | `lib/api-v1/institutional-data.demo.test.ts` |
| Organisation audit export + retention | `lib/org/scope.ts` removes `is_demo` ids from the org scope (fail-soft before 0436) | `lib/org/scope.test.ts` |
| `/admin/validation` auto rows | never a "Cohort scored" row; a demo loaded by a **non-admin** seat is a Level-2 "Workflow demo run" signal (counts: false); loaded by an admin it is nothing | `lib/validation/model.test.ts`, `auto.test.ts` |
| Institutional funnel North Star (assessed / paying batches) | items of an `is_demo` batch are skipped | `lib/funnel/institutional.test.ts` |

## Routes

| Route | Who | Answer |
|---|---|---|
| `POST /api/evaluations/batch/demo` | evaluator entitlement (`lp_export` OR `accelerator.cohort` — the same gate as every cohort route) | `201 { created: true, batch_id }` first time; `200 { created: false, batch_id }` idempotent (one demo per evaluator / acting org); `403 feature_locked` Scout / Firm; `503 migration_pending` before 0436 |
| `DELETE /api/evaluations/batch/demo` | the **creator** only | `200 { removed: true, removed_projects: 5 }`; `404` when the caller holds no demo cohort or did not create it |

Both are audited (`apiRoute`) and write `cohort.demo_created` / `cohort.demo_removed` audit rows; 10 calls / minute / user.

## Where the button lives

- `/workspace/evaluations/cohort` — empty state: **Import CSV** beside **Load a demo cohort**; with cohorts present, a "Load a demo cohort" button beside "New cohort" until one exists.
- `/workspace/evaluations` — Cohorts section empty state: the same pair.
- `/workspace/accelerator` — Intake panel (beside "Import applicants from CSV") and the Assessment empty state; the journey banner carries **Remove demo cohort** for the owner.
- `/workspace/accelerator/pilot` — "Book a pilot" card (evaluator seats) and the delivery checklist, whose first step is now **Demo run** ("Ran the demo cohort").
- The cohort page banner carries **Remove demo cohort** (owner). The CSV import is hidden on a demo cohort — real applicants get a real cohort.

Copy is catalogued (`demoCohort.*` in `lib/i18n/messages/{en,vi}.json`) and reaches the client components as props (`loadDemoCohortLabels()` reads the `blockid_lang` cookie).

## Operating notes

- **Before a public demo** the founder approves the five company names (defaults ship; edit `DEMO_STARTUPS` in `demo-cohort-shared.ts` — the scorer test pins the numbers, update it in the same commit).
- **Leftovers:** removing the demo deletes only projects with the `demo-cohort-` slug owned by the batch creator (evaluations + items cascade). A leftover demo project from an interrupted create only bumps the next slug suffix.
- **Live QA:** `tests/live-qa/37-cohort.spec.ts` lane (k) creates the demo on the elevated evaluator seat, checks the five chips, the Cohort Report (200), that the institutional API does not list it, then removes it (404 afterwards).
- **Erasure:** the demo rows are ordinary evaluator-owned rows — the account erasure path removes them with everything else.
