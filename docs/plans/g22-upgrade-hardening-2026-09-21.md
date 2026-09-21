# G22 — Upgrade hardening: cohort membership completeness · organisation model · localisation parity · validation tracker

**Opened:** 2026-09-21 (founder: "review kết quả đã làm, test, commit, deploy, chạy QA/QC và fix, tiếp tục plan/goal trong phiên bản upgrade, spawn agent khi cần và dùng skill phù hợp").
**Owner:** Claude session loop — worktree lanes → merge → full `--project unit` + pdf → 12-gate deploy → elevated live-qa + link-check + page sweep → read-only review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G22 · `ROADMAP.md` row G22.
**Source:** every engineering follow-up recorded at the G21 close (SOT § G21) plus the P0–P3 review P2/P3 rows that were deferred. Nothing new in positioning; this goal makes the shipped upgrade complete for the people who use it daily (program reviewers, org owners, Vietnamese founders) and gives the founder the validation tracker the advisor plan asks for.

## 1. Baseline (v3.21.0 + P3 review fixes, 2026-09-21)
| Gap | Where | Effect today |
|---|---|---|
| Batch members cannot open dossiers | `lib/evaluations/dossier.ts` `resolveDossierAccess` (evaluator or same-org seat only) | reviewer clicks "Dossier" on a cohort row → 404 |
| Members do not see invited batches | `lib/evaluations/batch.ts` `listBatches` creator-only; `/workspace/evaluations` Cohorts list | invite e-mail link is the only way in |
| `weights_version` never bumped | no weights editor after batch creation | snapshots always stamp v1 |
| `cohort_snapshots` has no member SELECT policy | 0423 | future user-JWT clients |
| Dialog focus not returned | `OverrideDialog`, `CompareDrawer` | keyboard users lose position |
| Dossier P3 loaders sequential | `dossier.ts` context / freshness / signature / outcomes awaited one after another | ~+150 ms per view |
| Trajectory missing on the cohort compare drawer | `CompareDrawer` takes `CohortRow` only | P3-A third mount deferred |
| Org retention / export scoped to the owner account | `evaluation_batches` / `program_intakes` carry no `org_id` | a seat's cohorts are outside the org even when run for it |
| English-only bands on `/vi` | `TrustBand`, `PilotRung`, `PilotBuyButton` copy, governance `/vi` h1 | mixed-language Vietnamese pages |
| `docs/api/institutional.md` linked to GitHub | `/developers/api` | leaves the site for a doc |
| Validation targets not tracked | advisor plan § 29 (5 interviews · 3 demos · 2 proposals · 1 paid pilot · 1 renewal) | founder keeps it in their head |

## 2. Lanes (all in parallel worktrees; each must run the FULL unit suite + guards before reporting)

### A — Cohort membership completeness (skills: architecture-designer, supabase-postgres, api-designer, react-expert)
Files: `lib/evaluations/{dossier,batch,batch-members}.ts`, `api/evaluations/**`, `workspace/evaluations/**`, `components/evaluations/{OverrideDialog,CompareDrawer,CohortTable}.tsx`, `lib/svi/trajectory-load.ts` (read), migration `0432_cohort_snapshots_member_select.sql`.
1. `resolveDossierAccess` gains a `viaBatch` role: a batch member (`assertBatchRole` viewer+) opens the dossier of any item in that batch read-only as an assessor (consent tier = the evaluation's tier, never wider); IC memo route the same; audit row carries `via_batch_id`.
2. `listBatches(userId)` returns created + member batches (role on each); `/workspace/evaluations` Cohorts list shows the role chip; `CohortIndex` + tests.
3. **Weights editor**: `PATCH /api/evaluations/batch/[id]/weights` (owner) → `rubric_weights` + `weights_version + 1` + audit; the cohort page gets an "Edit program weights" dialog (reuse `RubricWeightsSliders`); a snapshot taken after a change stamps the new version; the delta view says "weights changed" when versions differ (P2-A's `weightsChanged`).
4. Focus return on `OverrideDialog` / `CompareDrawer` close (store `document.activeElement`).
5. Compact `TrajectoryTimeline` inside `CompareDrawer` per selected row (data via a small route `GET /api/evaluations/batch/[id]/items/[itemId]/trajectory` gated viewer+, tier-gated values).
6. `0432`: `cohort_snapshots_member_select` policy (members of the batch read its snapshots). Apply by hand at merge.
7. `dossier.ts`: the four P3 loaders in one `Promise.all`.
Live-qa: extend `37-cohort` — invite the QA evaluator's second seat? (no second seat exists) → assert the weights PATCH bumps `weights_version` and the cohort header shows v2; the dossier link on a row resolves 200 for the owner.

### B — Organisation model (skills: supabase-postgres, postgres-pro, db-migrate, security-audit)
Files: migration `0433_org_id_on_batches_intakes.sql`, `lib/evaluations/batch.ts`, `lib/intake/program-intakes.ts`, `lib/org/{retention,audit-export,admin}.ts`, `api/org/**`, `docs/ops/retention.md`, settings pages copy.
1. `evaluation_batches.org_id` + `program_intakes.org_id` (uuid → `investor_organisations` set null, indexed); stamped at creation from `resolveActingOrg(user)` (the org the creator acts for); backfill script `scripts/org/backfill-org-ids.mjs` (owner → their org; dry-run default; the merge session runs it).
2. Retention + export scope = `org_id = org` (falls back to owner-owned rows without an org id); tests updated; docs + page copy say "cohorts created for this organisation".
3. `resolveOrgAdmin` unchanged; add an "Organisation" chip on the cohort page header when `org_id` is set.
Live-qa: `38-program-journey` asserts the cohort report route still 200 for the elevated seat after the column lands (fail-soft before apply).

### C — Localisation parity + docs route + polish (skills: **ui-ux-pro-max** before markup, nextjs-16-expert, seo-content-au)
Files: `components/marketing/template/TrustBand.tsx`, `components/marketing/{PilotOffer,PilotBuyButton}.tsx`, `app/vi/**` pilot + governance + versions mirrors, `lib/i18n/messages/{en,vi}.json`, `app/(marketing)/developers/api/**`, new `app/(marketing)/docs/api/institutional/page.tsx` (renders `docs/api/institutional.md` in-app on the template), `docs/design/messaging.md` VI rows.
1. `TrustBand` takes `locale` (VI copy table for eyebrow, title, labels, four bullets, disclaimer link text); `/vi` pages pass it.
2. `PilotRung` / `PilotOffer` / `PilotBuyButton` strings via i18n keys (EN/VI), `/vi/pilot` mirror page (paid pilot landing) with sitemap + hreflang.
3. `/vi/methodology/governance` and `/vi/methodology/versions` h1 + eyebrows translated (bodies may stay EN with a note, as today).
4. `/docs/api/institutional` in-app page (markdown → Prose) and `/developers/api` links to it; link checker happy.
5. A ui-ux-pro-max pass at 375 px + dark mode over the new P1–P3 pages: `/workspace/evidence/outcomes`, `/workspace/evidence/corrections`, `/workspace/evaluations/cohort/[id]`, `/workspace/accelerator?stage=*`, `/workspace/settings/retention` — fix what is found (no page overflow, token colours only, one h1, focus rings).
Live-qa: `31-marketing` adds `/vi/pilot` 200 + `/docs/api/institutional` 200; `33-page-sweep` already covers the workspace pages.

### D — Validation tracker + G21 regression lane (skills: analytics, customer-success, playwright-e2e, qa-lead)
Files: `lib/validation/*`, `app/admin/validation/**`, `content/reports/validation-tracker.json` (admin-edited via API), `tests/live-qa/41-g21-regression.spec.ts`, `scripts/crontab.production` (weekly), `docs/ops/validation-tracker.md`.
1. `/admin/validation`: the five advisor-plan levels (5 qualified interviews · 3 workflow demos · 2 written pilot proposals · 1 paid pilot ≥ A$1,500 · 1 renewal / second customer) with counters the founder edits (organisation, date, note, objection captured) — stored in a JSON ledger under `content/reports/` (gitignored? no: committed like `pilots.json`; add to `DEPLOY_DIRTY_IGNORE` if not covered), plus auto-filled rows from data: paid pilots (`pilot_orders`), pilot metrics captured, feedback letters sent, cohorts scored; a "next objection to answer" list; North Star line from `lib/funnel/institutional.ts`.
2. `41-g21-regression.spec.ts` (anonymous + elevated): one assertion per G21 acceptance line that has no lane yet — home hero, nav 7 items, TrustBand on 8 pages, `/methodology/{governance,versions,calibration}` 200, `/tbr/demo` Assessment Card (SVI + Evidence Confidence, no benchmark line without `n =`), corrections page 200, outcomes page 200, cohort index 200, `/api/v1/institutional/methodology` 401 anon, `/pilot` offer cards, `/api/status` `data_moat` present on the trusted payload. Weekly cron (Sun 05:10) via the live-qa runner, results into `live-qa-history.jsonl`.

## 3. Acceptance
0432 + 0433 applied + ledger; backfill run; full unit + pdf green; deploy 12/12; elevated live-qa ≥ 258 + lane 41 green; production link-check 0 internal broken; page sweep 0 defects; read-only review → fixes; `version.json` v3.22.0; SOT § G22 closed; memory updated.

## 4. Founder decisions (defaults ship if silent)
- F-1 Org-scoped retention/export widens automatically once `org_id` is backfilled (owner's org).
- F-2 The validation tracker's manual counters live in a committed JSON ledger (auditable), not the DB.
