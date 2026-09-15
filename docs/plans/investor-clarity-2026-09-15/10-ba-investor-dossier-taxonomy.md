> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G13 · goal doc [`../investor-clarity-2026-09-15.md`](../investor-clarity-2026-09-15.md). Workstream spec produced 2026-09-15 by the planning session (BA / PM / Product agents); corrections applied at merge are marked **[merge-fix]**.

# BA Specification — Investor Dossier, Evaluator Assessment, Startup Taxonomy & Investor Appetite Profile

Author: Business Analyst (BA-pro style) · Date: 2026-09-15 · Scope: brief items 1 + 2 (00-brief.md)
Inputs: 01-explore-investor.md, 03-explore-agents.md, code verified read-only under `web/` (paths below are relative to `web/` unless prefixed `docs/`).
House rules applied: Auschain PTY LTD for billing/legal; Australia-only; reseller never touches Stripe; no Stripe changes proposed here at all; migrations applied by hand (docker exec psql); deploy via `scripts/deploy-live.sh`; SVG-first visuals; approved data-principle sentence reused verbatim.

---

## 0. Problem statement and goals

**Today** an evaluator who pays A$3 for a Trust BizReport lands on the same 1,678-line founder-oriented `BusinessReportClient` (`src/app/(app)/(founder)/workspace/business-report/business-report-client.tsx`) and has nowhere to record a verdict except a 20k-char `evaluations.notes` blob and three `#tag:` markers in `watchlist.notes`. There is no radar, no valuation-vs-ask, no structured decision, no IC memo, and no way for three Firm seats to see each other's view. Deal-flow filters are no-ops because the `scores`→account join is broken and sector/stage are free text in six vocabularies.

**Goals (measurable)**
- G-A: One evaluator page per startup ("Investor Dossier") that renders in < 1.5 s TTFB from persisted snapshots, with a structured Evaluator Assessment that survives re-scores and is shared only on explicit consent.
- G-B: One canonical startup taxonomy (industry × business model × stage × customer type × geography × tags) persisted per project, auto-filled by the analysis pipeline, confirmed by the founder, and used by every list, filter, benchmark and multiples lookup.
- G-C: Investor appetite profile (mandate) that drives both directions of matching — deal-flow for investors, "investors who match" for founders — with saved views.
- KPI targets (90 days after ship): ≥ 60 % of paid Trust BizReports followed by a saved assessment within 7 days; ≥ 70 % of active projects with founder-confirmed taxonomy; deal-flow filter → dossier open rate ≥ 25 %.

---

## A. INVESTOR DOSSIER — the investor view of one startup

### A.1 Route, access and entry points

| Item | Decision |
|---|---|
| Route | `/workspace/evaluations/[evaluationId]` (NEW page under the existing `(app)/(founder)/workspace/evaluations/` folder). Keyed on `evaluations.id`, not `projects.id`, so consent tier and evaluator ownership are enforced by one lookup (`canAccessProjectAsEvaluator()` in `src/lib/evaluations.ts`). |
| Aliases | `/workspace/investor/startup/[projectId]` → 302 to the dossier of the caller's evaluation row (or "Add to my evaluations" interstitial if none). Deal-flow, watchlist and cohort rows all deep-link here. |
| Gate | `FeatureGate investor.dealflow` OR evaluator persona (`isEvaluatorPersona()`, `src/lib/evaluations/progress-shared.ts`). Founder-claimed rows: founder can open a **read-only "what my evaluator sees" preview** — never the assessment unless shared (see C.1). |
| Public share | Existing `/tbr/[token]` remains the public artefact; the dossier is never public. IC memo export is a signed PDF via the existing Playwright `?pdf=1` path. |

### A.2 Information architecture (top → bottom)

```
┌ HEADER ──────────────────────────────────────────────────────────────┐
│ Startup name · ticker · website · [Industry] [Business model] [Stage] │
│ SVI 62 (▲ +4 / 30 d) · Percentile p61 (stage cohort) · Consent tier  │
│ Last snapshot 12 Sep 2026 · Evidence 17 items (3 connected sources)   │
│ Decision chip: PASS / TRACK / PROCEED (mine) · Firm consensus (3/3)   │
│ Actions ▸ Re-score A$1 · Add to watchlist · Request intro · Export IC  │
└──────────────────────────────────────────────────────────────────────┘
 1  Trusted Business Report summary   (radar + weighted table + 13 criteria)
 2  Valuation                         (5 methods · consensus range · vs ask)
 3  Evidence & data-room access       (consent-tiered list, request upgrade)
 4  Evaluator Assessment              (NEW structured verdict, history, seats)
 5  Progress radar                    (weekly Δ, movers, deadlines)
 6  Actions & audit trail             (batch, watchlist, intro, share log)
```

Every block is a server component reading persisted rows; only block 4 (assessment form) and the action bar are client components.

### A.3 Block-by-block specification and data mapping

#### Header
| Field | Source (existing) | Notes |
|---|---|---|
| Name, website, state | `projects.name`, `evaluations.website`, `evaluations.state` (0314) | |
| Industry / business model / stage badges | NEW `startup_taxonomy` (B.5); fallback `projects.industry`, `sviStageToCanonical(projects.stage)` (`src/lib/journey-vocabulary.ts`) | Badge shows "Unclassified" when null — never guessed silently. |
| SVI + delta | latest `svi_snapshots` for `project_id` (`total_svi`, `dimension_scores` 0027) + `startup_score_history` (20260905) | Delta = latest − snapshot ≥ 30 days old; fall back to `evaluation_reports.svi_total` history (0317). |
| Percentile | `src/lib/agents/cohort-percentile.ts` against `svi_index_snapshots` (0052) | Cache 10 min per (stage, industry). |
| Consent tier | `evaluations.consent_tier` | Chip colours: attributed_only grey, reports_shared blue, full_mentor green. |
| Evidence count | `svi_snapshots.analysis_json.evidence[]` + `computeEvidenceCompleteness` (`src/lib/svi/computeEvidenceCompleteness.ts`) | Shows "n items · m connected (Stripe/Xero/GA4/GitHub)". |
| Decision chip | NEW `evaluation_assessments.decision` (A.4) | Firm/Program: also `n_of_m` seat consensus. |

#### Block 1 — Trusted Business Report summary
- **8-dimension radar (SVG, server-rendered)**: reuse `RadarChartSVG` from `src/lib/pdf/svi-report-pdf.tsx` (extract to `src/components/charts/svi-radar-svg.tsx` so web + PDF share one renderer; homepage `dimension-radar` and dashboard `svi-radar-chart` (recharts) stay for now). Overlay: startup vs stage-cohort p50 (`src/lib/svi-dimension-benchmarks.ts` ANCHORS).
- **Weighted table** (weights are house constants; display the weight column only to evaluator personas, per svi-scoring guardrail "never share raw weights publicly" — the public `/tbr/[token]` continues not to show them):

| Dim | Weight | Score | Δ30d | Cohort p50 | Band | Owning agent |
|---|---|---|---|---|---|---|
| FTV | 15 | … | … | … | … | CHRO |
| MPC | 18 | | | | | CMO/CPO |
| PTD | 12 | | | | | CTO |
| TRE | 20 | | | | | CFO/CRO |
| CGH | 12 | | | | | CFO (ESOP module) |
| IRI | 10 | | | | | CLO/CFO |
| LCO | 8 | | | | | CLO |
| SVM | 5 | | | | | CEO/CPO |

Source: `svi_snapshots.dim_results` (20260903_wave25a: `Record<DimKey, DimState>`) + `dimension_scores`. Owning agent column is static from `src/lib/evaluation-criteria.ts` (`primaryAgent`).
- **13 criteria strip**: one row per criterion from `svi_snapshots.criterion_results` (`CriterionState[]`: `score`, `verdict` sentence, `strengths[]`, `gaps[]`, `next_action`). Columns: criterion (idea, market, founder_profile, code_git, website, team, customer_size, gtm_strategy, documents, dataroom, team_structure, roadmap, revenue) · score ring (reuse `CriterionRing`) · verdict sentence · evidence count (count of `analysis_json.evidence[]` whose `criterion` matches) · "AI says / I say" toggle that opens the per-criterion rating in block 4.
- Link "Open full Trusted Business Report" → `/workspace/business-report?project=…` (existing) or `/tbr/[share_token]` when `evaluation_reports.share_token` exists.

#### Block 2 — Valuation
- Source of truth: `buildVcValuationReport()` in `src/lib/agents/cfo-valuation.ts` (5 blended methods: revenue_multiple, berkus, dcf_proxy, comparables, risk_factor_summation) — **persist its output** into `svi_snapshots.valuation_json` (column exists since 0046_snapshot_valuation; today the TBR renders `src/lib/svi/three-case-valuation.ts` instead). Requirement: the report pipeline writes the 5-method object at snapshot time; the dossier never recomputes.
- Visual: horizontal **method range bars** (SVG, reuse `ValuationRangeSVG` from `svi-report-pdf.tsx`): five bars (low–high per method), a shaded consensus band (weighted blend ± risk spread), and a vertical marker "Founder ask" from `funding_intakes.raise_amount`/pre-money if present, else `analysis_json.targetRaise`. Below: table of method · weight · low · mid · high · sector multiple used (`src/lib/valuation/sector-multiples.ts` resolver, key derived from taxonomy, see B.4) · comparables count (honest number from `src/lib/data/au-comparables.ts`; do not say "500+" until the dataset is expanded — flagged risk R6).
- Evaluator can enter **"My valuation view"** (low/high AUD + note) in block 4; the chart overlays it as a second marker.

#### Block 3 — Evidence & data-room access
| Consent tier (`src/lib/mentor/access-tiers.ts`) | What the dossier shows |
|---|---|
| attributed_only | Masked KPIs (bands, not values), phase, evidence *counts* per dimension, no documents. CTA "Invite founder to share reports" → existing invite flow (`invite_token`, `POST /api/evaluations/claim/[token]`). |
| reports_shared | Full TBR, criterion evidence list (type, source, date, freshness), connector freshness (Stripe/Xero/GA4/GitHub from `connector_snapshots` 0349), no data-room files. CTA "Request data-room access" → founder notification + `dataroom_*` grant flow. |
| full_mentor | Everything above + data-room index (`dataroom_*` tables), cap-table summary (`cap_table`), exit-readiness, founder notes. |
- Every evidence row carries `source_kind` (self_declared / public_url / document_uploaded / connected_source — the `EVIDENCE_BONUS` ladder in `src/lib/svi-analysis.ts`) so the evaluator sees *how* trustworthy a claim is. Reuse of `claim_verdicts` vocabulary (VERIFIED … INSUFFICIENT_DATA) is proposed for **phase 2** once a claims-extraction step exists (A.6).
- Data principle banner (approved sentence, verbatim): "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what."

#### Block 4 — EVALUATOR ASSESSMENT (new object)
Purpose: turn a A$3 report into a durable, comparable investment opinion. One assessment row per (evaluation, evaluator seat, version). Latest version is "current"; older versions are the history.

**Object shape (`evaluation_assessments`)**
```
id                    uuid PK
evaluation_id         uuid FK evaluations(id) ON DELETE CASCADE
project_id            uuid FK projects(id)               -- denormalised for cohort queries
assessor_user_id      uuid FK app_users(id)              -- the seat who wrote it (Firm: 3 seats)
org_id                uuid NULL FK investor_organisations(id)   -- Firm/Program grouping
snapshot_id           uuid NULL FK svi_snapshots(id)     -- which AI snapshot was on screen
version               int  NOT NULL DEFAULT 1            -- unique(evaluation_id, assessor_user_id, version)
status                text CHECK IN ('draft','submitted')
decision              text CHECK IN ('pass','track','proceed')          -- required on submit
conviction            smallint CHECK 1..5                -- overall
thesis_fit_pct        smallint CHECK 0..100              -- prefilled from mandate_fit_scores, editable
dimension_ratings     jsonb  -- {FTV:{rating:1..5, stance:'agree'|'disagree'|'unsure', note}, … 8 keys}
criterion_ratings     jsonb  -- {idea:{stance, note}, … 13 keys}  (optional)
valuation_view        jsonb  -- {low_aud, high_aud, method_note}
risks                 jsonb  -- [{title, severity:'low'|'medium'|'high'|'critical', dimension, note}]
questions_for_founder jsonb  -- [{text, dimension, sent_at NULL}]
private_notes         text   CHECK ≤ 20000               -- NEVER shared
shared_notes          text   CHECK ≤ 20000               -- shared only when shared_with_founder_at set
shared_with_founder_at timestamptz NULL
submitted_at          timestamptz NULL
created_at / updated_at timestamptz
```
- **UI**: two-column card. Left = "AI verdict" (score, verdict sentence per dimension, read-only). Right = "My view" (1–5 stars + Agree/Disagree/Unsure + note). Sticky footer: conviction ★, thesis-fit %, decision segmented control, "Save draft" / "Submit assessment" / "Share with founder" (secondary, confirm dialog listing exactly which fields are shared: dimension_ratings, risks, questions_for_founder, shared_notes — never decision/conviction/private_notes/valuation_view unless ticked).
- **Prefill rules**: `thesis_fit_pct` ← `mandate_fit_scores.score` (B.7); risks ← top-3 `criterion_results[].gaps` with lowest score (editable, marked "suggested by AI"); questions ← `next_action` sentences rewritten as questions by a 1-call haiku prompt (cost ≈ 0; interactive budget per commit 782d62ea6).
- **History**: version timeline (v1 12 Aug → v2 12 Sep) with "what changed" diff (decision, conviction, per-dimension rating deltas) alongside the SVI delta between the two `snapshot_id`s → answers "did the startup move or did my opinion move".
- **Multi-evaluator view (Firm 3 seats / Program)**: table seats × dimensions; consensus row (median rating, decision tally 2 PROCEED / 1 TRACK); disagreements highlighted (range ≥ 2). Seats resolved via `investor_organisation_members` (exists, unused) — a Firm plan owner creates the org once; Scout gets a personal org auto-created (`kind='angel'`).
- **IC memo export**: "Export IC memo" builds a `ic_reports` row (`kind='memo'`, `sections` jsonb = {summary, svi_table, valuation, thesis_fit, risks, questions, decision, seats}) and renders via `src/lib/pdf/` (new `ic-memo-pdf.tsx`, reuse `RadarChartSVG`, `ValuationRangeSVG`). One-page variant `kind='one_page'`.

#### Block 5 — Progress radar
- Reuse `src/lib/evaluations/progress-radar.ts` (`EvaluatorProgress`, `SCORE_HISTORY_LEN`, `formatDelta`) scoped to one evaluation: weekly Δ sparkline (SVG), movers per dimension, deadlines (`ProgressDeadline` — grant closes, program dates from `funding_matches`), last progress email sent (`evaluator_progress_sends` 0321).
- New: "Since my last assessment" callout comparing `assessment.snapshot_id` vs latest snapshot.

#### Block 6 — Actions & audit trail
| Action | Existing wiring | Change |
|---|---|---|
| Re-score A$1 | `POST /api/evaluations/[id]/report` kind=rescore; `FEATURE_COSTS.trust_report_rescore` (`src/lib/credits.ts:211`); confirm-before-charge dialog (`report-dialog.tsx`) | none — reuse; show quota remaining (`src/lib/evaluations/report-quota.ts`). |
| Full Trust BizReport A$3 | same route kind=full | none. |
| Add to watchlist / portfolio | `watchlist` (0066) is **ticker-keyed**; `investor_portfolio` (0314) has no write UI | Add `project_id uuid NULL` to `watchlist` (migration) and write both; portfolio "Mark as invested" writes `investor_portfolio`. |
| Request intro | mailto today (`src/lib/funding/investor-match.ts` `intro_href`) | Keep mailto for Scout; Firm/Program: writes `investor_contacts` (0375) row on the *founder's* project when founder-claimed and consent ≥ reports_shared, so the founder's CRM shows the inbound. |
| Add to batch | `evaluation_batches` (0322) | reuse `batch-dialog.tsx`. |
| Audit trail | `audit_events` (0076, HMAC chain via `appendAudit()` in `src/lib/audit.ts`) | log view, assessment submit, share, export, consent change (C.2). |

### A.4 Data mapping summary — reuse vs new

| Need | Existing table | Verdict | Concrete change |
|---|---|---|---|
| Dimension + criteria + evidence | `svi_snapshots.criterion_results / dim_results / dimension_scores / analysis_json` | **Reuse as-is** | none; index `(project_id, created_at desc)` already used by TBR. |
| 5-method valuation | `svi_snapshots.valuation_json` (0046) | **Reuse column, change writer** | `run-for-project.ts` persists `VcValuationReport` (blended, methods[], bear/base/bull). |
| Paid report history | `evaluation_reports` | Reuse | none. |
| Consent / ownership | `evaluations` | Reuse | none. |
| Evaluator verdict | `investor_decisions` (unused) | **Do NOT reuse** | Keyed on `company_id` (no FK to `projects`), `UNIQUE(company_id, as_of)` prevents multi-seat, opaque `payload`, no RLS, no evaluator id. Replace with `evaluation_assessments` above; leave table in place (zero code refs). |
| Per-claim verdicts | `claims` + `claim_verdicts` | **Reuse in phase 2** | Needs claims extraction from `analysis_json`; verdict enum is good. Add `project_id` alias column or treat `company_id` = `projects.id` (document in migration header). |
| IC memo | `ic_reports` | **Reuse with ALTER** | `ADD COLUMN evaluation_id uuid FK`, `assessment_id uuid FK`, `user_id uuid FK`; `company_id` = `projects.id`; RLS owner policy on `user_id`. `markdown_vi` already nullable. |
| Investor score (11-dim) | `investor_scores` | **Deprecate** | Different model from SVI 8-dim; mark in migration comment; no code. |
| Mandate fit cache | `mandate_fit_scores` | **Reuse** | `company_id` = `projects.id`; add index `(mandate_id, score desc)`; `reasons` jsonb = `InvestorMatch.reasons/gaps`. |
| Mandate | `investor_mandates` | **Reuse with ALTER** (B.6) | `org_id` nullable + `owner_user_id`; add `business_models text[]`, `customer_types text[]`, `tags_include text[]`, `tags_exclude text[]`, `min_svi smallint`, `thesis text`, `is_default boolean`. |
| Seats | `investor_organisations`, `investor_organisation_members` | **Reuse** | Auto-create personal org on first save; Firm/Program owner invites seats (limit from `plans.csv` seats 1/3/5). |
| Watchlist | `watchlist` (0066) | Reuse with ALTER | `ADD COLUMN project_id uuid NULL`, backfill from ticker→`svi_accounts`→`projects` where possible. |
| Portfolio | `investor_portfolio` (0314) | Reuse | write UI only. |
| Progress | `evaluator_progress_sends`, `startup_score_history` | Reuse | none. |
| Funding context | `funding_matches`, `funding_intakes` | Reuse | source for "founder ask" and deadlines. |

**Proposed migration `0392_evaluation_assessments.sql`** (hand-applied; rollback block in header per house style): creates `evaluation_assessments` (+ `set_updated_at` trigger, RLS: assessor or same-org member select; assessor insert/update; service-role all), ALTERs `ic_reports`, `watchlist`, `mandate_fit_scores` index. Separate `0393_investor_mandates_extend.sql` (B.6) and `0394_startup_taxonomy.sql` (B.5) so each can be applied and rolled back independently.

### A.5 User stories with acceptance criteria

**Persona S — Scout (investor_angel, 1 seat, 25 profiles, 10 reports/mo)**

S1. *Open a dossier from deal-flow.*
Given I am on `/workspace/investor/dealflow` and click a startup row · When the page loads · Then I land on `/workspace/evaluations/[id]` (creating the evaluation row if I had none, counted against `profiles` quota), the header shows SVI, Δ30d, consent tier and last-snapshot date, and TTFB ≤ 1.5 s measured by the `live-qa` lane.

S2. *Read the report summary without the founder's clutter.*
Given the startup has a snapshot · When block 1 renders · Then I see the 8-dim radar with cohort overlay, the weighted table with the weight column visible (evaluator persona only), and 13 criterion rows each with score, verdict sentence and evidence count; criteria with no evidence show "0 evidence — self-declared" not a blank.

S3. *Record my view.*
Given block 4 · When I set ratings on ≥ 1 dimension and click "Save draft" · Then a `status='draft'` row is stored with `snapshot_id` = the snapshot on screen; When I click "Submit" without a decision · Then validation blocks with "Choose pass / track / proceed"; When submitted · Then `submitted_at` is set, the header chip updates, and `audit_events` gets `assessment.submitted`.

S4. *Privacy by default.*
Given a submitted assessment · When the founder (claimed) opens their read-only preview · Then they see NOTHING from block 4; When I click "Share with founder" and confirm · Then only the ticked sections appear on the founder side and `shared_with_founder_at` is set; `private_notes`, `decision`, `conviction` are never included in the share payload (unit test asserts field allow-list).

S5. *Re-score and compare.*
Given an assessment v1 on snapshot A · When I pay A$1 re-score and open the dossier · Then the "Since my last assessment" callout shows SVI Δ and per-dimension Δ between A and the new snapshot, and "Update my assessment" creates v2 pre-filled from v1.

S6. *IC memo export (one-page for Scout).*
Given a submitted assessment · When I click "Export one-pager" · Then an `ic_reports` row (`kind='one_page'`) is created and a PDF with radar + valuation bars + my decision is returned; the PDF footer states "Prepared with BlockID.au · Auschain PTY LTD · not financial advice".

**Persona F — Firm (investor_advisor, 3 seats, 50 profiles, 30 reports/mo)**

F1. *Seats see one shared dossier, separate assessments.*
Given seats A, B, C in one `investor_organisations` row · When B opens a startup A added · Then B sees the same report/valuation blocks, A's assessment in the "Seats" table (not editable), and an empty "My view" form.

F2. *Consensus view.*
Given ≥ 2 submitted assessments · When block 4 renders · Then the consensus row shows median rating per dimension, decision tally, and highlights any dimension where seat ratings differ by ≥ 2 with a "Discuss" marker.

F3. *IC memo with seats.*
Given ≥ 1 submitted assessment · When the org owner exports `kind='memo'` · Then the memo contains a "Seat views" section with each seat's decision, conviction and top risk; private notes are excluded; `generated_by` = owner.

F4. *Seat limit.*
Given 3 seats already exist · When the owner invites a 4th · Then the invite is refused with the plan-limit message and an upgrade link to Program (no Stripe change — existing plan gate).

**Persona P — Program (investor_vc_small / accelerator, batch/cohort)**

P1. *Cohort table with decisions.*
Given `/workspace/evaluations/cohort/[batchId]` · When it renders · Then each row shows SVI, Δ, taxonomy badges, and the latest decision/conviction from `evaluation_assessments`; columns are sortable; CSV export (existing `/batch/[id]/export.csv`) gains decision, conviction, thesis_fit_pct columns.

P2. *Bulk assess.*
Given a cohort · When I select n rows and choose "Set decision: track" · Then n draft assessments are created/updated (one per evaluation, my seat), each stamped with the latest `snapshot_id`; audit logs one `assessment.bulk_set` event with the id list.

P3. *Rubric weights stay display-only.*
Given cohort `rubric_weights` (0322) · When I change weights · Then only the displayed cohort score re-aggregates; `svi_snapshots` and assessments are untouched (existing behaviour preserved, regression test).

P4. *Quarterly LP report picks up decisions.*
Given `/api/reports/quarterly?batch=` · When generated · Then the "Pipeline" section counts pass/track/proceed from assessments (feature `lp_report` gate unchanged).

### A.6 Phase-2 backlog (not in this sizing): claims extraction → `claims`/`claim_verdicts` per criterion; founder answers to `questions_for_founder` (`sixteen_answers` table candidate); dd_projects/dd_items checklist for PROCEED decisions.

---

## B. STARTUP TAXONOMY + INVESTOR APPETITE PROFILE

### B.1 Why one taxonomy
Six sector vocabularies (`detectSector` 27 slugs in `src/lib/svi-analysis.ts:122`; `Sector` 27 keys in `src/lib/valuation/sector-multiples-static.ts`; `BenchmarkSector` 9 in `src/lib/svi/sector-map.ts`; `INDUSTRY_OPTIONS` 22 in `src/lib/funding/intake.ts`; `SECTOR_LABEL` 8 in `src/lib/startup-index-listings.ts`; free text `projects.industry` / `startup_listings.sector` / `svi_index_snapshots.sector`) and five stage vocabularies mean filters silently miss rows and benchmarks/multiples pick "default". The fix is a **canonical, versioned taxonomy module** `src/lib/taxonomy/startup-taxonomy.ts` (single source), each legacy vocabulary becoming a *derived crosswalk* from it, never edited independently again.

Design principles: (1) industry ≠ business model — "marketplace" and "SaaS" are how you make money, "agtech" is whom you serve; (2) AU-relevant, ANZSIC-anchored (ABS 2006 rev 2.0 divisions) so CMO/CFO agents can cite ABS data; (3) every axis has an explicit `unclassified` value; (4) machine suggestion + founder confirmation, both recorded.

### B.2 Axis (i) — Industry (22 canonical values) with crosswalk

| # | Canonical `industry` | ANZSIC division / class anchor | detectSector slugs | sector-multiples key | Benchmark bucket | INDUSTRY_OPTIONS | Listings SECTOR_LABEL |
|---|---|---|---|---|---|---|---|
| 1 | `software_saas` | J 5910/5920, M 7000 Computer system design | saas | saas | saas | software_saas | saas |
| 2 | `ai_ml` | M 7000 / 6910 | (none → NEW regex `\bai\b|machine learning|llm|genai`) | ai | saas (deeptech if hardware tag) | ai_ml | ai |
| 3 | `fintech` | K 62 Finance, 63 Insurance, 64 Auxiliary | fintech, wealthtech, insurtech | fintech / wealthtech / insurtech (sub-industry keeps the finer key) | fintech | fintech | fintech |
| 4 | `healthtech_medtech` | Q 85 Medical & other health care | healthtech | healthtech | healthtech | healthtech_medtech | healthtech |
| 5 | `biotech_pharma` | M 6910 Scientific research; C 1841 Pharmaceutical mfg | biotech | biotech | healthtech | biotech_pharma | healthtech |
| 6 | `climate_cleantech` | D 26 Electricity, 29 Waste; M 6910 | cleantech | cleantech | climatetech | cleantech_renewables + climate (merged) | default |
| 7 | `agtech_food` | A 01 Agriculture; C 11 Food product mfg | agtech | agtech | hardware | agtech_food | default |
| 8 | `advanced_manufacturing` | C 24 Machinery & equipment mfg | deeptech (hardware branch) | deeptech | hardware | advanced_manufacturing | deeptech |
| 9 | `deeptech_quantum` | M 6910 | deeptech | deeptech | deeptech | quantum | deeptech |
| 10 | `space` | M 6910; C 2394 Aircraft mfg | spacetech | spacetech | deeptech | space | deeptech |
| 11 | `defence_dualuse` | O 7600 Defence; C 24 | (none → NEW regex `defence|dual.use|sovereign capability`) | deeptech | deeptech | defence_dualuse | deeptech |
| 12 | `mining_resources_tech` | B 06–10 Mining; 1010 exploration | (none → NEW regex `mining|METS|resources|exploration`) | default | hardware | mining_resources_tech | default |
| 13 | `edtech` | P 80–82 Education & training | edtech | edtech | default | edtech | default |
| 14 | `proptech_construction` | L 6720 Real estate services; E 30–32 Construction | proptech, constructiontech | proptech / constructiontech | default | proptech + construction | default |
| 15 | `retail_ecommerce` | G 39–43 Retail trade | ecommerce, retailtech | ecommerce / retailtech | consumer | retail_ecommerce | ecommerce |
| 16 | `media_creative_gaming` | J 55–57 Publishing/broadcasting; R 90 Creative arts | mediatech, gaming | mediatech / gaming | consumer | creative_media | default |
| 17 | `travel_tourism_hospitality` | H 44–45 Accommodation & food services; N 7220 Travel agency | traveltech | traveltech | consumer | tourism_hospitality | default |
| 18 | `transport_logistics_mobility` | I 46–53 Transport, postal & warehousing | logisticstech | logisticstech | default | transport_logistics | default |
| 19 | `hr_worktech` | N 7211 Employment placement, 7212 Labour supply | hrtech | hrtech | saas | professional_services | saas |
| 20 | `legal_regtech_govtech` | M 6931 Legal services; O 75 Public administration | legaltech, govtech | legaltech / govtech | saas | professional_services | saas |
| 21 | `cybersecurity` | M 7000 / J 5910 | cybertech | cybertech | saas | (none) | saas |
| 22 | `sports_wellness` | R 91 Sports & recreation | sportstech | sportstech | consumer | (none) | default |
| — | `professional_services` | M 69 Professional, scientific & technical | (none) | default | default | professional_services | default |
| — | `unclassified` | — | undefined | default | default | (none) | default |

Notes: 24 rows including `professional_services` and `unclassified` (22 sector industries + 2 service values). `marketplace` (detectSector/multiples) and `social_enterprise` (INDUSTRY_OPTIONS) are **not** industries: `marketplace` → business model axis; `social_enterprise` → tag `impact`. A `sub_industry` free slug (from the 27 detectSector slugs) is kept for finer multiples lookup; the multiples resolver key = `sub_industry ?? crosswalk(industry, business_model)` where `business_model='marketplace'` overrides to key `marketplace`.

### B.3 Axis (ii) — Business model / startup type (10)

| `business_model` | Definition | Valuation/benchmark implication |
|---|---|---|
| `saas_subscription` | Recurring software licences, B2B or B2C | ARR multiples; Rule of 40 |
| `marketplace_platform` | Two/multi-sided, take-rate revenue | GMV × take rate; liquidity metrics; multiples key `marketplace` |
| `transactional_fintech` | Payments/lending/insurance flows, licensed (AFSL/ACL) | Revenue take-rate; regulatory tag `regulated` auto-set |
| `consumer_app` | B2C app, ads/subscription/IAP | DAU/MAU, retention; benchmark `consumer` |
| `ecommerce_d2c` | Physical goods sold online | Gross margin, contribution margin; benchmark `consumer` |
| `hardware_devices` | Physical product + optional software | Unit economics, BOM; benchmark `hardware` |
| `deeptech_ip_licensing` | IP-heavy, long R&D, licensing/partnerships | Milestone-based (Berkus/RFS weight up); benchmark `deeptech` |
| `biotech_regulated_pipeline` | Clinical/regulatory pipeline | rNPV-style; TGA/FDA phases; tag `regulated` |
| `services_enabled_tech` | Tech-enabled services, human delivery | Lower multiples, utilisation; benchmark `default` |
| `agency_consultancy` | Time & materials, no product moat | Revenue multiple ≤ 1–2×; SVM cap flag |
| `unclassified` | — | default |

### B.4 Axes (iii)–(vi)

**(iii) Stage** = existing `CANONICAL_STAGES` (8) from `src/lib/journey-vocabulary.ts`; persisted as `stage_key`. Crosswalks (all already exist or are trivial):
- `projects.stage` int 0–7 → `sviStageToCanonical()`.
- `INTAKE_STAGES` (idea, pre_revenue_prototype, mvp, early_revenue, scaling) → idea, validation, mvp_early_revenue, mvp_early_revenue, seed.
- Investor `StageBand` (`src/lib/investor-portal.ts:27`): pre_seed → {idea, validation, mvp_early_revenue}; seed → {seed}; series_a → {series_a}; series_b → {series_b_c}; growth → {late_stage, public_exit}; any → all. Mandate UI shows the 8 canonical stages directly and derives StageBand for legacy prefs.

**(iv) Customer type**: `b2b`, `b2c`, `b2b2c`, `b2g`, `unclassified` (multi-select allowed, primary first). Source: `IntakeContext` (`src/lib/intake/detect-context.ts`) already detects business type at analysis time — persist it.

**(v) Geography**: `hq_state` ∈ AU_STATES (NSW…NT, national — existing `src/lib/evaluations.ts:57`) + `geo_scope` ∈ {`local`, `national`, `anz`, `apac`, `global`}; `hq_country` fixed `AU` for now (platform is Australia-only; column exists for future). Investor side: `geographies text[]` accepts the same state codes + `anz/apac/global`.

**(vi) Special tags** (multi): `esic_eligible`, `rdti_claimant`, `female_founded`, `first_nations`, `university_spinout`, `climate_impact`, `defence_dualuse`, `regulated`, `impact_social_enterprise`, `csiro_on_alumni`, `accelerator_alumni`. Each tag has `source` (auto / founder / evaluator) and auto tags need a rule: e.g. `esic_eligible` only when `src/lib/agents/cfo-au-tax-incentives.ts` ESIC 100-pt check ≥ 100 AND incorporated ≤ 3 yrs; `regulated` auto when business_model ∈ {transactional_fintech, biotech_regulated_pipeline} or industry ∈ {healthtech_medtech, defence_dualuse}; `female_founded`/`first_nations` are **founder-declared only** (never inferred — privacy/discrimination risk).

### B.5 Persistence — `startup_taxonomy` table (recommended over `projects.taxonomy jsonb`)

Rationale: `projects` is read by every founder surface; a 1:1 side table keeps writes isolated, gives clean array indexes (GIN on tags) for deal-flow filters, lets evaluator-owned projects carry an evaluator override without touching founder rows, and rolls back with one DROP. Generated columns on jsonb would still need a GIN index and cannot express per-field `source`.

```
create table public.startup_taxonomy (
  project_id          uuid primary key references public.projects(id) on delete cascade,
  taxonomy_version    text not null default '1.0.0',
  industry            text not null default 'unclassified',     -- B.2 enum (CHECK)
  sub_industry        text,                                      -- detectSector slug or null
  industry_secondary  text,                                      -- optional second industry
  business_model      text not null default 'unclassified',     -- B.3 enum (CHECK)
  customer_types      text[] not null default '{}',              -- b2b|b2c|b2b2c|b2g
  stage_key           text not null default 'idea',              -- CANONICAL_STAGES (CHECK)
  hq_state            text,                                      -- AU_STATES
  hq_country          text not null default 'AU',
  geo_scope           text,                                      -- local|national|anz|apac|global
  tags                text[] not null default '{}',              -- B.4(vi) enum (CHECK via trigger)
  anzsic_division     char(1),                                   -- A..S
  anzsic_class        text,                                      -- 4-digit, optional
  sources             jsonb not null default '{}'::jsonb,        -- {industry:'auto'|'founder'|'evaluator', business_model:…, tags:{esic_eligible:'auto'}}
  confidence          jsonb not null default '{}'::jsonb,        -- {industry:0.82, business_model:0.6}
  suggested           jsonb,                                     -- last pipeline suggestion (for "AI suggested X, you chose Y")
  confirmed_by        uuid references public.app_users(id),
  confirmed_at        timestamptz,
  created_at / updated_at timestamptz not null default now()
);
create index on public.startup_taxonomy (industry, stage_key);
create index on public.startup_taxonomy using gin (tags);
create index on public.startup_taxonomy using gin (customer_types);
```
RLS: project owner + evaluator with `evaluations.project_id` select; owner/evaluator update; service-role all. Trigger `set_updated_at`.

**Backfill script** `scripts/taxonomy/backfill-startup-taxonomy.mjs` (dry-run flag, idempotent): for each `projects` row → industry from `analysis_json.sector` → crosswalk, else `detectSector(name + description + industry)`, else `industryToSector()` bucket → industry; business_model from `IntakeContext` heuristics on `analysis_json` (marketplace/saas/ecommerce regexes already in `detectSector`); stage from `sviStageToCanonical(projects.stage)`; hq_state from `evaluations.state` / `funding_intakes.state` / `startup_listings.hq_state`; tags from `funding_intakes.industry_tags` (`defence_dualuse`, `climate` → `climate_impact`, `social_enterprise` → `impact_social_enterprise`); `sources` all `'auto'`, `confirmed_at` null. Writes a report to `content/reports/taxonomy-backfill.json` (counts per value, % unclassified).

**Derived writers (keep legacy columns in sync until removed)**: `svi-index-populator.ts` writes `svi_index_snapshots.sector/stage/state` from `startup_taxonomy` (crosswalk to listings `SECTOR_LABEL` key); `startup_listings.sector` same; `projects.industry` untouched (free text stays as the founder's own words).

### B.6 Auto-fill by the analysis pipeline + founder confirmation

Flow (mirrors how a real data room intake works: system suggests, owner confirms):
1. `run-for-project.ts` / `svi-analysis.ts` `analyzeStartup()` → after `extractSignals` + `IntakeContext`, call `suggestTaxonomy(analysis)` (pure, in `src/lib/taxonomy/suggest.ts`) → `{industry, sub_industry, business_model, customer_types, stage_key, tags, confidence}`.
2. Upsert into `startup_taxonomy.suggested`; if `confirmed_at` is null → also copy into the live columns with `sources='auto'`; if confirmed → never overwrite confirmed fields, only refresh `suggested` and raise a "Suggestion differs" hint.
3. **Founder confirmation UI** — one card on `/workspace` (post-analysis) and on the project settings page: "We classified your startup as *Fintech · Marketplace · Seed · B2B · NSW*. Correct?" → [Confirm] [Edit]. Edit opens the 6-axis form with the suggestion pre-selected and the confidence shown (e.g. "Industry 82 % sure"). On confirm: `confirmed_by/at`, `sources` per field, audit event `taxonomy.confirmed`. Evaluator-owned projects: the evaluator confirms (they own the row); once the founder claims, founder confirmation supersedes.
4. Analysis-time confidence < 0.5 on industry → stays `unclassified` and the card says "We couldn't classify your industry — pick one" (data-quality rule DQ-1).

### B.7 Investor profile / mandate form

Replace the stub `/workspace/investor/preferences` form (`investor-visibility-form.tsx`, "full preferences form ships in a follow-up release") with a full mandate editor backed by `investor_mandates` (+ `investor_organisations` personal org). Keep `app_users.investor_prefs` jsonb as a **read-through mirror** for one release (deal-flow and `investor-match.ts` still read it) then delete the mirror.

**ALTER `investor_mandates` (migration 0393)**: `org_id` DROP NOT NULL; `ADD owner_user_id uuid REFERENCES app_users(id)`; `CHECK (org_id IS NOT NULL OR owner_user_id IS NOT NULL)`; `ADD business_models text[] DEFAULT '{}'`, `customer_types text[] DEFAULT '{}'`, `tags_include text[] DEFAULT '{}'`, `tags_exclude text[] DEFAULT '{}'`, `min_svi smallint`, `thesis text`, `is_default boolean DEFAULT true`, `discoverable boolean DEFAULT false` (moves `app_users.investor_discoverable` semantics per mandate; keep the user flag as the master switch). RLS: owner or org member.

**Form sections (all optional except section 1; unfilled = "any")**
1. Identity: firm name, kind (vc/angel/family_office/cvc/accelerator/government/institutional — existing CHECK), thesis (280 chars), discoverable toggle (existing 0323 semantics).
2. Appetite: `sectors_include[]` / `sectors_exclude[]` (B.2 industries, chips), `business_models[]` (B.3), `customer_types[]`.
3. Stage & cheque: `stages[]` (8 canonical, chips), `cheque_min_aud` / `cheque_max_aud` (A$), `lead_or_follow`, `ownership_target_pct`, `followon_reserve_pct`.
4. Geography: `geographies[]` (AU states + anz/apac/global).
5. Traction floors: `revenue_min_aud`, `growth_min_pct`, `min_svi` (0–100 slider with cohort hint "p50 seed = 54").
6. Tags & ESG: `tags_include[]`, `tags_exclude[]`, `esg_constraints[]` (existing column; values: no_gambling, no_fossil, no_weapons, no_tobacco, impact_only), `risk_tolerance`.
7. Weights (advanced, Program only): `weights` jsonb overriding `FIT_WEIGHTS` per mandate (validated to sum 100).
Multiple mandates per org (Program: e.g. "Climate fund II", "Pre-seed generalist"); Scout: one.

### B.8 Matching score formula (extends `FIT_WEIGHTS`)

Current: `{sector 40, stage 30, geo 20, svi 10}`, floor 40, SVI hard gate. Proposed `FIT_WEIGHTS_V2` in `src/lib/funding/investor-match.ts` (kept pure/testable; default when mandate `weights` empty):

| Axis | Weight | Rule |
|---|---|---|
| industry | 25 | full if `startup.industry ∈ sectors_include` (or include empty); 12 if only `industry_secondary` matches; **0 and hard-gate** if ∈ `sectors_exclude`. |
| business_model | 15 | full if ∈ `business_models` or list empty; 0 otherwise. |
| stage | 20 | full if `stage_key ∈ stages`; 10 if adjacent stage (±1 in CANONICAL_STAGES order); 0 otherwise. |
| geo | 10 | full if `hq_state ∈ geographies` or `national`/`anz`/`global` in either; 5 if same country only. |
| cheque | 10 | full if founder ask (`funding_intakes.raise_amount` or `analysis_json.targetRaise`) overlaps [cheque_min, cheque_max] (lead) or ≤ 3× cheque_max (follow); 5 if unknown ask. |
| tags | 10 | +10·(matched include tags / requested include tags), capped; any `tags_exclude` hit → hard gate 0. |
| svi / floors | 10 | full if `svi ≥ min_svi` (or none), 0 + hard gate otherwise; `revenue_min_aud` / `growth_min_pct` also hard gates when data exists; when data unknown → 5 and reason "revenue not verified". |
Sum 100; `FIT_FLOOR` stays 40; `reasons[]`/`gaps[]` populated per axis as today (`InvestorMatch.reasons`). Unknown taxonomy (`unclassified`) never scores full on its axis and adds gap `"industry unclassified — founder confirmation pending"` (DQ-3).

**Two directions, one scorer**
- Investors → startups (deal-flow): nightly cron `mandate-fit-refresh` (add to `crontab`, off-peak) computes `mandate_fit_scores` for every discoverable mandate × every project with `investor_visible = true` (existing `scores` flag) or founder consent ≥ `reports_shared`; deal-flow page reads `mandate_fit_scores` joined to `startup_taxonomy` and latest snapshot — this **replaces the broken email→account join** (Gap 4) because the join key becomes `project_id`.
- Startups → investors (`/workspace/funding` "Investors who match", T0251): `matchInvestorsForProject()` reads `investor_mandates` instead of `investor_prefs`, same scorer; the investor's email is still never returned; "Request intro" upgraded per A.3 block 6.

**Filters / saved views**
- `/workspace/investor/dealflow` and `/workspace/evaluations`: filter bar = industry (multi), business model, stage, state, tags, SVI range, fit ≥ N, decision (mine), consent tier, "moved ≥ 5 pts in 30 d". Saved views stored in `app_users.investor_prefs.saved_views[]` (jsonb, ≤ 10, `{name, filters, sort}`), default view "My mandate" = the mandate as filters. URL-serialised so views are shareable inside the org.
- Founder side `/workspace/funding`: sort matched investors by fit, filter by stage/cheque; no investor emails.

### B.9 Data-quality rule set

| Rule | Statement | Enforcement |
|---|---|---|
| DQ-1 | Unknown → `unclassified`; never guess silently. Auto-fill sets a value only when `confidence ≥ 0.5`. | `suggestTaxonomy()` unit tests; CHECK constraints reject values outside enums. |
| DQ-2 | Every auto-filled field records `sources.<field>='auto'` and shows "AI suggested" until confirmed. | UI badge; `confirmed_at` null ⇒ dossier badge has dashed border + tooltip. |
| DQ-3 | Matching never awards full axis credit to `unclassified`; gaps say so. | scorer test. |
| DQ-4 | Protected attributes (`female_founded`, `first_nations`) are founder-declared only; never inferred; excluded from `suggested`. | `suggestTaxonomy()` cannot emit them (type-level exclusion + test). |
| DQ-5 | Confirmed fields are never overwritten by the pipeline; a new suggestion only updates `suggested` and raises a hint. | upsert SQL `... WHERE confirmed_at IS NULL` per field via `sources` check. |
| DQ-6 | Legacy sector text columns are derived, not authored; any write to `svi_index_snapshots.sector`/`startup_listings.sector` goes through the crosswalk. | lint rule + single writer function `taxonomyToLegacy()`. |
| DQ-7 | Taxonomy version string stored per row; a vocabulary change bumps `taxonomy_version` and ships a mapping. | `TAXONOMY_VERSION` const + backfill script `--from 1.0.0 --to 1.1.0`. |
| DQ-8 | Founder confirmation UI: one screen, ≤ 6 choices, each with "Not sure" → `unclassified`. Confirmation rate is a tracked KPI. | GA4 `taxonomy_confirmed` (C.5). |

### B.10 User stories (taxonomy & profile)

T1. *Founder confirms classification.* Given my first analysis completes · When the dashboard loads · Then I see the taxonomy card with the AI suggestion and confidence; When I click Confirm · Then `startup_taxonomy.confirmed_at` is set, `sources` become `founder`, and the card disappears; When I pick "Not sure" for industry · Then industry = `unclassified` and my listing shows "Unclassified" (not "Other").

T2. *Evaluator adds a startup with taxonomy.* Given `POST /api/evaluations` · When I supply `industry` (existing field) · Then it is mapped through `INDUSTRY_OPTIONS→industry` crosswalk into `startup_taxonomy` with `sources.industry='evaluator'`; unknown strings → `unclassified`.

T3. *Investor writes a mandate.* Given `/workspace/investor/preferences` · When I save sections 1–6 · Then an `investor_mandates` row (and personal org if none) is created, `app_users.investor_prefs` mirror is updated, and 402 is returned without `investor.dealflow` (existing gate).

T4. *Deal-flow reflects mandate.* Given a saved mandate with `sectors_include=[fintech]`, `stages=[seed]` · When the nightly `mandate-fit-refresh` has run · Then deal-flow lists only rows with fit ≥ 40, sorted by fit desc, each with reasons/gaps chips; a startup with `industry=unclassified` appears only if fit still ≥ 40 and is badged "Unclassified".

T5. *Founder sees matching investors.* Given my project has confirmed taxonomy · When I open `/workspace/funding` · Then "Investors who match" uses mandates, shows fit and reasons, never shows emails; "Request intro" creates an `investor_contacts` row on my project (Firm/Program investors) or opens support mailto (Scout).

T6. *Saved view.* Given deal-flow filters set · When I click "Save view" and name it · Then it appears in the views dropdown, persists across sessions, and is limited to 10 per user.

T7. *Legacy sync.* Given a confirmed taxonomy · When `svi-index-populate` cron runs · Then `svi_index_snapshots.sector` equals the crosswalk value and `/startup-index` sector filter returns the row.

---

## C. Non-functional requirements

### C.1 Privacy & consent
- Assessments (`evaluation_assessments`) are visible to: the assessor; members of the same `investor_organisations` row (Firm/Program); service role. The founder sees an assessment **only** after `shared_with_founder_at` is set and only the allow-listed fields (`dimension_ratings`, `risks`, `questions_for_founder`, `shared_notes`). `private_notes`, `decision`, `conviction`, `valuation_view`, `thesis_fit_pct` are excluded at the API serialiser (`src/lib/evaluations/assessment-share.ts` allow-list + unit test) and by RLS (founder policy selects through a view `v_assessment_founder_view` exposing only those columns).
- Dossier blocks obey `consent_tier` exactly as A.3 block 3; masked values are masked server-side (never sent to the client and hidden by CSS).
- Erasure: assessments are deleted with the evaluation (CASCADE); founder erasure runbook (release-readiness 2026-09-12) extended to null `shared_notes`/`questions_for_founder` on founder-claimed rows and to drop `startup_taxonomy` with the project.
- Data principle sentence appears once on the dossier and once on the mandate form.

### C.2 Audit log
Use `appendAudit()` (`src/lib/audit.ts`, HMAC-chained `audit_events`) with `resource_type='evaluation_assessment' | 'startup_taxonomy' | 'investor_mandate' | 'ic_report'` and actions: `assessment.saved`, `assessment.submitted`, `assessment.shared`, `assessment.unshared`, `assessment.bulk_set`, `ic_report.exported`, `dossier.viewed` (evaluator id + evaluation id; sampled 100 %), `consent.changed`, `taxonomy.suggested`, `taxonomy.confirmed`, `mandate.saved`, `intro.requested`. `detail` carries field deltas, never note bodies.

### C.3 Performance
- Dossier TTFB < 1.5 s (p95) from persisted rows: one `evaluations` lookup, one latest `svi_snapshots` (indexed by project_id), one `evaluation_assessments` query (`(evaluation_id, assessor_user_id, version desc)` index), one `mandate_fit_scores` get, cohort percentile from a 10-min in-process cache. No AI call on render; prefill questions (haiku) run on demand behind a button with a skeleton.
- Radar/valuation SVGs are server-rendered strings (no recharts on this page); page JS budget ≤ 120 kB gz beyond the workspace shell.
- Nightly `mandate-fit-refresh` bounded: discoverable mandates × visible projects; batch of 500 upserts; runs off-peak per CEO loop.
- `live-qa` lane adds a dossier timing check (`qa:live` provisions evaluator + startup, asserts TTFB and the consent masking).

### C.4 i18n (EN/VI)
Message files `src/lib/i18n/messages/en.json` + `vi.json` (parity test `messages-parity.test.ts`). Estimated new keys: dossier header/blocks 85 · assessment form/history/seats/share dialog 75 · IC memo 20 · taxonomy labels (24 industries + 10 models + 5 customer types + 5 geo scopes + 11 tags + hints) 70 · founder confirmation card 15 · mandate form 55 · filters/saved views 25 · errors/validation 20 → **≈ 365 keys × 2 locales ≈ 730 strings**. Reserved-terms test (`reserved-terms.ts`) keeps "SVI", "Trust BizReport", "BlockID" untranslated. Vietnamese labels for stages already exist in `CANONICAL_STAGE_LABELS`.

### C.5 Analytics (GA4 via `trackEvent`, add to `EventName` map in `src/lib/analytics.ts`)
`dossier_viewed {evaluation_id, consent_tier, plan}` · `dossier_block_expanded {block}` · `assessment_started` · `assessment_submitted {decision, conviction, version}` · `assessment_shared {fields_count}` · `assessment_history_viewed` · `ic_memo_exported {kind}` · `consensus_viewed {seats}` · `taxonomy_card_viewed` · `taxonomy_confirmed {changed_fields, unclassified_count}` · `taxonomy_edited {field}` · `mandate_saved {sections_filled}` · `dealflow_filter_applied {axis}` · `dealflow_view_saved` · `founder_match_viewed {matches}` · `intro_requested {channel: mailto|crm}` · `rescore_from_dossier`. Existing `evaluator_checklist_*` events stay; checklist gains step "Write your first assessment".

### C.6 Security
- All writes through service-role with in-code ownership checks (house pattern) plus the RLS above as defence in depth. Assessment and mandate routes: Zod schemas, 20 kB note limits, rate limit 60/min/user. IC memo PDF generated server-side; share tokens never embed assessment ids. CSP unchanged (no new external scripts; SVG inline).

---

## D. Sizing, dependencies, files, risks

### D.1 Epics → stories → size (S ≤ 1 d, M 2–3 d, L 4–6 d, one engineer)

| Epic | Story | Size | Depends on | Files touched (create ➕ / edit ✏️) |
|---|---|---|---|---|
| E1 Taxonomy core | E1.1 Canonical enums + crosswalk module + tests | M | — | ➕ `src/lib/taxonomy/startup-taxonomy.ts`, `crosswalk.ts`, `*.test.ts` |
| | E1.2 Migration `0394_startup_taxonomy.sql` + RLS + backfill script + report | M | E1.1 | ➕ `supabase/migrations/0394_startup_taxonomy.sql`, `scripts/taxonomy/backfill-startup-taxonomy.mjs`, ✏️ `docs/runbooks/migration-ledger` |
| | E1.3 `suggestTaxonomy()` in pipeline + upsert (DQ-1/4/5) | M | E1.1 | ➕ `src/lib/taxonomy/suggest.ts`; ✏️ `src/lib/svi-analysis.ts` (call site after extractSignals), `src/lib/report-pipeline/run-for-project.ts`, `src/lib/intake/detect-context.ts` |
| | E1.4 Founder confirmation card + project settings form + audit + GA4 | M | E1.2 | ➕ `src/components/taxonomy/taxonomy-confirm-card.tsx`, `src/app/api/projects/[id]/taxonomy/route.ts`; ✏️ `src/app/(app)/(founder)/workspace/page.tsx`, `src/lib/analytics.ts`, i18n json |
| | E1.5 Legacy writers through crosswalk (index populator, listings, sector-map, multiples key, INDUSTRY_OPTIONS, SECTOR_OPTS) | M | E1.1 | ✏️ `src/lib/svi-index-populator.ts`, `src/lib/startup-index-listings.ts`, `src/lib/svi/sector-map.ts`, `src/lib/valuation/sector-multiples.ts`, `src/lib/funding/intake.ts`, `src/lib/evaluations.ts` (create input mapping) |
| E2 Investor mandate | E2.1 Migration `0393_investor_mandates_extend.sql` + personal org bootstrap | S | — | ➕ migration; ➕ `src/lib/investor/mandates.ts` |
| | E2.2 Mandate form (7 sections) + API + prefs mirror + i18n | L | E2.1, E1.1 | ✏️ `src/app/(app)/(founder)/workspace/investor/preferences/page.tsx`, `investor-visibility-form.tsx` → replace; ✏️ `src/app/api/investor/preferences/route.ts`; ✏️ `src/lib/investor-portal.ts` (normalisePrefs mirror) |
| | E2.3 `FIT_WEIGHTS_V2` scorer + tests (both directions) | M | E1.1, E2.1 | ✏️ `src/lib/funding/investor-match.ts`, `investor-match.test.ts` |
| | E2.4 `mandate-fit-refresh` cron → `mandate_fit_scores`; deal-flow reads by `project_id` (fixes broken join) | M | E2.3, E1.2 | ➕ `src/app/api/cron/mandate-fit-refresh/route.ts`; ✏️ `src/lib/investor-portal.ts` getDealFlow, `src/app/(app)/(founder)/workspace/investor/dealflow/page.tsx`, crontab (off-peak) |
| | E2.5 Filters + saved views on deal-flow and evaluations list | M | E2.4 | ✏️ `workspace/investor/dealflow/page.tsx`, `workspace/evaluations/evaluations-client.tsx`; ➕ `src/components/investor/filter-bar.tsx` |
| | E2.6 Founder "Investors who match" on mandates + intro → `investor_contacts` | S | E2.3 | ✏️ `src/app/(app)/(founder)/workspace/funding/*`, `src/lib/funding/investor-match.ts` store |
| E3 Investor Dossier | E3.1 Route + loader (evaluation-scoped, consent masking server-side) + header | M | — | ➕ `src/app/(app)/(founder)/workspace/evaluations/[evaluationId]/page.tsx`, `src/lib/evaluations/dossier.ts` (+test) |
| | E3.2 Block 1 radar SVG extraction + weighted table + 13-criteria strip | M | E3.1 | ➕ `src/components/charts/svi-radar-svg.tsx`; ✏️ `src/lib/pdf/svi-report-pdf.tsx` (import shared), ➕ `dossier/report-summary.tsx` |
| | E3.3 Persist 5-method valuation at snapshot + Block 2 range bars + vs-ask | M | — (pipeline) | ✏️ `src/lib/report-pipeline/run-for-project.ts`, `src/lib/svi/three-case-valuation.ts` (read persisted), ➕ `dossier/valuation-block.tsx` |
| | E3.4 Block 3 evidence & consent tiers + request-access CTA | S | E3.1 | ➕ `dossier/evidence-block.tsx`; ✏️ `src/lib/mentor/access-tiers.ts` (field allow-lists per tier) |
| | E3.5 Block 5 progress + "since my last assessment" | S | E3.1, E4.1 | ✏️ `src/lib/evaluations/progress-radar.ts` (single-evaluation selector) |
| | E3.6 Block 6 actions: watchlist `project_id` migration, portfolio write, intro, batch | S | E2.6 | ✏️ `supabase/migrations/0392…` (watchlist ALTER), `src/app/api/watchlist/route.ts`, `src/lib/investor-portal.ts` |
| | E3.7 Deep links from deal-flow/watchlist/cohort/evaluations list + alias redirect | S | E3.1 | ✏️ the four list pages; ➕ `workspace/investor/startup/[projectId]/route.ts` |
| E4 Evaluator Assessment | E4.1 Migration `0392_evaluation_assessments.sql` (+ ic_reports ALTER, mandate_fit index) + lib + Zod + API (GET/PUT/submit) | M | — | ➕ migration, `src/lib/evaluations/assessment.ts`, `src/app/api/evaluations/[id]/assessment/route.ts` |
| | E4.2 Assessment form (AI vs me, risks, questions, decision) + prefill (mandate fit, gaps) + audit + GA4 | L | E4.1, E3.2 | ➕ `dossier/assessment-form.tsx`; ✏️ `src/lib/analytics.ts`, i18n |
| | E4.3 Share-with-founder allow-list + founder read-only preview + RLS view | M | E4.1 | ➕ `src/lib/evaluations/assessment-share.ts` (+test), `v_assessment_founder_view` in migration; ✏️ founder workspace page |
| | E4.4 History timeline + diff vs snapshots | S | E4.1 | ➕ `dossier/assessment-history.tsx` |
| | E4.5 Seats: org bootstrap, member invite (plan seat limit), consensus table | M | E2.1, E4.1 | ➕ `src/lib/investor/organisations.ts`, `dossier/seats-consensus.tsx`; ✏️ `src/lib/entitlements.ts` (seats) |
| | E4.6 IC memo / one-pager PDF via `ic_reports` | M | E4.1, E3.2, E3.3 | ➕ `src/lib/pdf/ic-memo-pdf.tsx`, `src/app/api/evaluations/[id]/ic-report/route.ts` |
| | E4.7 Cohort table decision columns + bulk set + CSV + LP report pipeline counts | M | E4.1 | ✏️ `workspace/evaluations/cohort/[batchId]/*`, `src/app/api/evaluations/batch/[id]/export.csv/route.ts`, `src/lib/evaluations/quarterly-report.ts` |
| E5 Quality & ops | E5.1 `qa:live` dossier lane (TTFB, masking, share allow-list) | S | E3, E4 | ✏️ `scripts/qa/live-*.mjs` |
| | E5.2 Docs merge: SOT new G-entry, ROADMAP §4, roadmap-v2, GOALS, per-goal doc; migration ledger; erasure runbook | S | all | ✏️ `docs/plans/SOURCE-OF-TRUTH.md`, `docs/ROADMAP.md`, `.claude/goals/feature-upgrade-roadmap-v2.md`, `GOALS.md`; ➕ `docs/plans/investor-dossier-taxonomy-2026-09-15.md` |

Totals: E1 ≈ 11 d · E2 ≈ 13 d · E3 ≈ 12 d · E4 ≈ 16 d · E5 ≈ 2 d → **≈ 54 engineer-days**; critical path E1.1 → E1.2 → E2.3 → E2.4 → E3.1 → E4.1 → E4.2. Suggested deploy slices (deploy-immediately cadence, each followed by review → test → fix): **Slice 1** E1.1–E1.3 + E4.1 + E3.1–E3.2 (dossier readable, taxonomy filling silently) · **Slice 2** E1.4–E1.5 + E4.2–E4.4 (founder confirms, evaluator assesses) · **Slice 3** E2.1–E2.5 + E3.3 (mandates, matching, valuation) · **Slice 4** E4.5–E4.7 + E3.4–E3.7 + E2.6 + E5.

### D.2 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Backfill produces a high `unclassified` share (thin `analysis_json` on old projects) | Filters look empty; investors distrust | Report % before switching filters; founder confirmation card drives fill; "Unclassified" is an honest state (DQ-1). |
| R2 | `investor_portal_core` tables were written for `company_id` from another product (startupvalueindex.com master prompt) and have no FKs/RLS | Data drift, silent orphan rows | Only reuse the five tables listed with explicit ALTERs adding FKs/RLS in 0392/0393; document `company_id = projects.id` in headers; never touch the rest. |
| R3 | Migrations are hand-applied; three new migrations must land before deploy | Runtime 42P01 → empty states | Every reader catches 42P01 and renders "not migrated" (house pattern in 0314); ledger runbook updated; `qa:live` checks table presence. |
| R4 | Dual writers during the `investor_prefs` mirror period | Mandate and prefs diverge | Mirror written only from the mandate API; deal-flow switches to `mandate_fit_scores` in the same slice; delete mirror after one release. |
| R5 | Weight column disclosure to evaluators conflicts with "never share raw weights publicly" | IP leak | Show weights only behind evaluator persona on authenticated dossier; PDF IC memo shows weighted score, not weights, unless org is Program; public `/tbr` unchanged. |
| R6 | Marketing "500+ AU comparables" vs 33 in `au-comparables.ts` | Credibility on the valuation block | Dossier prints the real count; separate content task to expand the dataset (out of scope here). |
| R7 | Founder-share of assessments could chill honest evaluator notes | Lower quality assessments | Private notes default; share is an explicit, field-listed action; copy says "Founder will see exactly these items". |
| R8 | `/workspace/evaluation` (founder self-eval) vs `/workspace/evaluations/[id]` collision worsens | Support confusion | Rename founder page to `/workspace/self-assessment` with redirect (belongs to brief item 3, flagged to the IA workstream). |
| R9 | Nightly fit refresh cost as projects grow | Cron overrun | Incremental: recompute only projects with a new snapshot or mandates updated in 24 h. |
| R10 | Vietnamese parity for ~365 keys | Parity test fails build | Generate VI in the same PR; parity test already gates. |

---

## Appendix 1 — API contracts (new / changed routes)

| Method · route | Auth / gate | Request | Response | Notes |
|---|---|---|---|---|
| GET `/api/evaluations/[id]/dossier` | evaluator owner or org member | — | `{header, report:{dims[8], criteria[13], evidence_counts}, valuation, evidence, assessment:{mine, seats[], consensus}, progress, actions}` masked by `consent_tier` | Server component calls the lib directly; route exists for the mobile/PDF path. |
| GET `/api/evaluations/[id]/assessment` | same | `?version=` | latest (or given) `EvaluationAssessment` + `history[]` summary | 404 when none; never returns other seats' `private_notes`. |
| PUT `/api/evaluations/[id]/assessment` | assessor | Zod `AssessmentDraft` (all fields optional except `snapshot_id`) | saved row | Creates v(n+1) when the current one is `submitted`; else updates the draft. |
| POST `/api/evaluations/[id]/assessment/submit` | assessor | `{decision, conviction}` required | row with `submitted_at` | Audit `assessment.submitted`. |
| POST `/api/evaluations/[id]/assessment/share` | assessor | `{fields: ('dimension_ratings'|'risks'|'questions_for_founder'|'shared_notes')[]}` | `{shared_with_founder_at}` | Allow-list enforced server-side; audit `assessment.shared`. |
| POST `/api/evaluations/[id]/ic-report` | assessor / org owner | `{kind:'one_page'|'memo'}` | `{ic_report_id, pdf_url}` | Writes `ic_reports`; PDF via Playwright `?pdf=1` route. |
| POST `/api/evaluations/batch/[id]/assessments` | batch owner | `{evaluation_ids[], decision?, conviction?}` | `{updated:n}` | Bulk draft set; audit `assessment.bulk_set`. |
| GET/PUT `/api/projects/[id]/taxonomy` | project owner or evaluator | PUT: 6-axis object, `confirm:boolean` | `StartupTaxonomy` + `suggested` | DQ-4: protected tags accepted only from founder. |
| GET/PUT `/api/investor/mandates` | `investor.dealflow` (402 otherwise) | PUT: mandate object (B.7) | mandate + org | Replaces the body of `/api/investor/preferences`; old route kept as alias writing the mirror. |
| GET `/api/investor/dealflow` | same | filters (B.8), `view_id?` | rows from `mandate_fit_scores` ⋈ `startup_taxonomy` ⋈ latest snapshot | Replaces the email→account join. |
| POST `/api/cron/mandate-fit-refresh` | cron auth (existing header) | — | `{mandates, projects, upserts, ms}` | Off-peak; incremental (R9). |

## Appendix 2 — `dimension_ratings` / `risks` JSON shapes (Zod in `src/lib/evaluations/assessment.ts`)

```ts
type DimKey = 'FTV'|'MPC'|'PTD'|'TRE'|'CGH'|'IRI'|'LCO'|'SVM';
interface DimensionRating { rating: 1|2|3|4|5; stance: 'agree'|'disagree'|'unsure'; note?: string /* ≤ 500 */ }
type DimensionRatings = Partial<Record<DimKey, DimensionRating>>;
interface RiskItem { title: string /* ≤ 120 */; severity: 'low'|'medium'|'high'|'critical'; dimension?: DimKey; note?: string /* ≤ 500 */; source: 'ai'|'evaluator' }
interface FounderQuestion { text: string /* ≤ 300 */; dimension?: DimKey; sent_at?: string | null }
interface ValuationView { low_aud?: number; high_aud?: number; method_note?: string /* ≤ 300 */ }
```
Consensus (Firm/Program) is computed in the loader, not stored: median rating per DimKey over submitted assessments in the same `org_id`, decision tally, and `disagreement: DimKey[]` where max−min ≥ 2.

## Appendix 3 — Taxonomy enums (copy for `src/lib/taxonomy/startup-taxonomy.ts`)

```ts
export const TAXONOMY_VERSION = '1.0.0';
export const INDUSTRIES = ['software_saas','ai_ml','fintech','healthtech_medtech','biotech_pharma','climate_cleantech','agtech_food','advanced_manufacturing','deeptech_quantum','space','defence_dualuse','mining_resources_tech','edtech','proptech_construction','retail_ecommerce','media_creative_gaming','travel_tourism_hospitality','transport_logistics_mobility','hr_worktech','legal_regtech_govtech','cybersecurity','sports_wellness','professional_services','unclassified'] as const;
export const BUSINESS_MODELS = ['saas_subscription','marketplace_platform','transactional_fintech','consumer_app','ecommerce_d2c','hardware_devices','deeptech_ip_licensing','biotech_regulated_pipeline','services_enabled_tech','agency_consultancy','unclassified'] as const;
export const CUSTOMER_TYPES = ['b2b','b2c','b2b2c','b2g','unclassified'] as const;
export const GEO_SCOPES = ['local','national','anz','apac','global'] as const;
export const TAGS = ['esic_eligible','rdti_claimant','female_founded','first_nations','university_spinout','climate_impact','defence_dualuse','regulated','impact_social_enterprise','csiro_on_alumni','accelerator_alumni'] as const;
export const PROTECTED_TAGS = ['female_founded','first_nations'] as const; // founder-declared only (DQ-4)
// stage_key: import { CANONICAL_STAGES } from '@/lib/journey-vocabulary'
```

---

## Executive summary (10 lines)
1. Build one evaluator page per startup, `/workspace/evaluations/[evaluationId]`, rendered from persisted `svi_snapshots` (radar, weighted 8-dim table, 13 criteria, evidence) — no AI call on render, TTFB < 1.5 s.
2. Persist the CFO 5-method valuation at snapshot time and show method range bars with a consensus band and the founder's ask.
3. Add a structured **Evaluator Assessment** (`evaluation_assessments`): per-dimension 1–5 + agree/disagree with the AI, conviction, thesis fit, risks, founder questions, pass/track/proceed, versioned history, Firm/Program multi-seat consensus, IC memo via `ic_reports`.
4. Assessments are private by default; founder sees only an allow-listed subset after an explicit "Share"; every action is HMAC-audited.
5. Reuse `investor_mandates`, `investor_organisations(+members)`, `mandate_fit_scores`, `ic_reports` with small ALTERs; do not reuse `investor_decisions`/`investor_scores`; defer `claims`/`claim_verdicts` to phase 2.
6. Replace six sector vocabularies with one canonical taxonomy: 22 AU/ANZSIC-anchored industries (+ professional_services, unclassified), 10 business models, the existing 8 canonical stages, customer type, AU state/geo scope, 11 tags — persisted in `startup_taxonomy`, backfilled, auto-suggested by the pipeline and confirmed by the founder.
7. Full investor mandate form (appetite, stage, cheque, geography, floors, tags/ESG, weights) and a v2 fit scorer (industry 25 / model 15 / stage 20 / geo 10 / cheque 10 / tags 10 / floors 10) that powers both deal-flow and "investors who match", fixing the broken deal-flow join by keying on `project_id`.
8. Data-quality rules: unknown → "Unclassified", never guess silently, protected tags founder-declared only, confirmed fields never overwritten.
9. Four deploy slices, ≈ 54 engineer-days, three hand-applied migrations (0392–0394), ~365 i18n keys, 17 GA4 events; no Stripe or reseller changes.
10. Top risks: unclassified share after backfill, hand-applied migrations, weight disclosure — each has a named mitigation above.
