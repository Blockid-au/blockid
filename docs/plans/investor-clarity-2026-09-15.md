# G13 — Investor Clarity: Investor Dossier + startup taxonomy, simplified menus & post-login, Trusted Business Report v2 (8-dimension agents + visuals) — Goal Doc

> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](./SOURCE-OF-TRUTH.md) § G13 (consult first).
> **Opened:** 2026-09-15 (planning session, founder brief in VI; BA / PM / Product agents) · **Owner:** CEO · **Status:** plan approved for execution, sprint W1 first.
> **Companion specs (same folder, read in this order):** [`01-audit-investor-side.md`](./investor-clarity-2026-09-15/01-audit-investor-side.md) · [`02-audit-navigation.md`](./investor-clarity-2026-09-15/02-audit-navigation.md) · [`03-audit-agents-visuals.md`](./investor-clarity-2026-09-15/03-audit-agents-visuals.md) · **[`10-ba-investor-dossier-taxonomy.md`](./investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md)** · **[`11-pm-ia-post-login.md`](./investor-clarity-2026-09-15/11-pm-ia-post-login.md)** · **[`12-product-ai-tbr-v2.md`](./investor-clarity-2026-09-15/12-product-ai-tbr-v2.md)**.
> **Supersedes / amends:** G7 `ux-ia-startup-flow-goal.md` (sidebar catalogue → persona nav v4), G8 unlock (phase scale canonical = 12 growth phases), `.claude/goals/report-v2-compelling.md` + `sub-agent-report-pipeline.md` (→ ReportV2 contract), G12 evaluator surfaces (→ Investor Dossier). Entity rules unchanged (marketing PPL Food PTY LTD; billing/legal Auschain PTY LTD). Never "PhD".

---

## 0. Founder brief (2026-09-15) → what this goal delivers

| # | Founder asked for | G13 answer | Workstream |
|---|---|---|---|
| 1 | Investors must see the Trusted Business Report **and evaluators' assessments** of a startup clearly, structured, easy to read | **Investor Dossier** — one page per startup (`/workspace/evaluations/[evaluationId]`): header → TBR summary (radar + weighted 8-dim table + 13 criteria) → 5-method valuation vs ask → evidence by consent tier → **Evaluator Assessment** (new structured verdict: per-dim rating/agree-disagree, conviction, thesis fit, risks, questions, PASS/TRACK/PROCEED, history, Firm/Program multi-seat consensus, IC memo) → progress radar → actions | A (BA §A) |
| 2 | Investors follow many startups and pick **categories / industry / startup type** in their profile; research the taxonomy and plan the upgrade | **One canonical startup taxonomy** (22 AU/ANZSIC-anchored industries + professional_services + unclassified · 10 business models · 8 canonical stages · customer type · AU state/geo · 11 tags) persisted in `startup_taxonomy`, auto-suggested by the pipeline, founder-confirmed; **Investor mandate** form on `investor_mandates`; fit scorer v2 (industry 25 / model 15 / stage 20 / geo 10 / cheque 10 / tags 10 / floors 10) driving deal-flow AND "investors who match"; saved views/filters | A (BA §B) |
| 3 | Founder menus are cluttered/duplicated; after login both founder and investor groups need a coherent, benefit-first follow-up; merge/remove confusing submenus | **Nav v4**: founder sidebar 7 groups/98 leaves → **4 groups (Home · Prove · Money · Company)**, 10 leaves at phase 0; evaluator sidebar 3 groups (Home · Deal flow · Reports); 17 hub pages with tabs absorb ~75 duplicate/orphan pages; ~95 permanent redirects; **one founder landing with 5 blocks** (Where you stand · Next best action · Money on the table · Evidence to add · Your reports) and **one recommender**; **persona-aware investor landing** (4 blocks); one onboarding wizard; one header/footer | B (PM §A–E) |
| 4 | Analysis must follow the defined 8-dimension structure and render the **most visual report** with the most effective agent analyses; upgrade agent frameworks/know-how per dimension | **Trusted Business Report v2**: one JSON contract (`ReportV2`) rendered by web/PDF/DOCX/email/Dossier; 8 chapters in weight order each with owner agent, score/band/percentile, ≥1 mandatory SVG, evidence table, criterion cards, S/G/next, auditor stamp; **dimension-owner matrix** (TRE→CRO, MPC→CMO, FTV→CHRO, PTD→CTO, **CGH→CFO, IRI→CLO, LCO→CLO, SVM→CEO**, CDO evidence officer, CISO/COO always-on cards); knowledge injection (skill-map, `.claude/knowledge-base`, `agent_knowledge_base`, 31k lines of `src/lib/agents/*` modules); phase-aware selection (13×12); 5-method valuation in body; deterministic `report-visuals/` package | C (Product §A–D) |
| 5 | Sell these features strongly without confusing users | One naming system (**SVI** = score · **Trusted Business Report** = the startup document · **Investor Dossier** = evaluator view · **Progress Radar** = weekly Δ), tier matrix, CTAs at the exact moments, EN/VI messaging, "why not ChatGPT" reuse from G12 §4b, live comparables count | C (Product §E) |

Non-negotiables carried from house rules: every old route keeps working (redirects); no Stripe change for resellers; migrations hand-applied + ledger; deploy each sprint immediately then review → `npm run qa:live` → fix; data-ownership sentence verbatim; no "beta" chips in the sidebar; VI parity for every new key.

---

## 1. Evidence from the codebase audit (why now)

- **Investor side:** investors land on the founder `/dashboard` (persona landing never wired); `(investor)` route group is empty; the Preferences page edits only firm/thesis/discoverable ("full form ships in a follow-up"); deal-flow join keys on email vs `account_id` so sector/stage filters are no-ops; evaluators can only store `label` + free `notes` — **no structured verdict**; ≥ 6 sector vocabularies + ≥ 5 stage vocabularies; 16 `investor_portal_core` tables exist with **zero code references** (mandates, decisions, IC reports…). → [`01-audit-investor-side.md`](./investor-clarity-2026-09-15/01-audit-investor-side.md)
- **Navigation:** live sidebar = `nav-groups.ts` (7 groups, 98 leaves + 8 admin); three nav architectures in code, one mounted; `/dashboard` (landing) has no sidebar entry while "SVI Score" is a second dashboard; 8 report surfaces, 4 document pages, 5 funding pages, 3 roadmaps, ESOP in 3 subgroups, identical titles under `/dashboard/*` and `/workspace/*`; five competing "what next" widgets on two phase scales; two onboarding wizards; two headers, two footers; ~25 orphan pages. → [`02-audit-navigation.md`](./investor-clarity-2026-09-15/02-audit-navigation.md)
- **Report & agents:** the report customers see (`api/svi/dimensions/stream`) uses a single generic analyst persona; the 11 C-level agents run only in the enhanced pipeline; `visuals: []` is hardcoded and `chart-generator.ts` is orphaned → **every dimension chapter is text-only**; skill-map/knowledge-base/`agent_knowledge_base` never reach a prompt; no primary owner for CGH/SVM; GATHER tech/repo audits are stubs; valuation in the body is a hardcoded stage band; "500+ AU comparables" vs 33 in code. → [`03-audit-agents-visuals.md`](./investor-clarity-2026-09-15/03-audit-agents-visuals.md)

---

## 2. Target state (one paragraph each)

**Investor.** Logs in → `/workspace/investor` (4 blocks: startups I'm evaluating + movers · deal flow matching my mandate · reports quota/trial · set your mandate). Opens a startup → Investor Dossier rendered from persisted snapshots (< 1.5 s TTFB, no model call): score + radar + weighted table + 13 criteria, valuation range vs ask, evidence they are allowed to see, their own assessment (private by default, shareable field-by-field with the founder), what changed since last view, one-click IC memo. Firm/Program seats see consensus. Deal flow and "investors who match" use the same fit scorer on the same taxonomy.

**Founder.** Logs in → `/dashboard` with five benefit-ordered blocks and one next-best-action; sidebar Home · Prove · Money · Company (+ Settings), groups unlock by phase; every tool lives in one hub with tabs (`/workspace/score`, `/workspace/evidence`, `/workspace/plan`, `/workspace/reports`, `/workspace/investors`, `/workspace/valuation`, `/workspace/raise`, `/workspace/finance`, `/workspace/equity`, `/workspace/esop`, `/workspace/team`, `/workspace/strategy`, `/workspace/documents`, `/workspace/exit`, `/workspace/settings`, `/workspace/projects`, `/workspace/accelerators`). Labels are verb-first, ≤ 3 words, benefit in the tooltip, EN + VI.

**Report.** One `ReportV2` JSON per run: cover (ring + radar + Where/Worth/Next) → CEO summary → TRE 20 · MPC 18 · FTV 15 · PTD 12 · CGH 12 · IRI 10 · LCO 8 · SVM 5 chapters (owner agent, score/band/percentile, mandatory SVG, evidence table by source Stripe/GA4/GitHub/Xero/LinkedIn/uploads, criterion cards, strengths/gaps/next, auditor stamp) → valuation (5 methods, consensus, vs ask, sector multiples with source date, comparables N live) → 13×12 phase gates → money on the table (grants/programs/investors) → 90-day plan → appendix (method, data principle, disclaimer). Same structure on web, PDF, DOCX, email and the Dossier.

---

## 3. Decisions taken in this plan (and the ones the founder still owns)

**Taken (recorded here; change only via SOT):**
- D1 Dossier is keyed on `evaluations.id` (consent + ownership in one lookup); public `/tbr/[token]` unchanged; the Dossier is never public.
- D2 Evaluator verdict = new `evaluation_assessments` table (migration 0392); reuse `investor_mandates`, `investor_organisations(+members)`, `mandate_fit_scores`, `ic_reports` with ALTERs (0393); **do not** reuse `investor_decisions`/`investor_scores`; `claims`/`claim_verdicts` deferred to phase 2.
- D3 Taxonomy persisted in `startup_taxonomy` (1:1 with `projects`, migration 0394) with `sources/confidence/suggested`; "Unclassified" is an honest state; protected tags founder-declared only; confirmed fields never overwritten.
- D4 Canonical phase scale = the 12 `GrowthPhaseId`s (`web/src/lib/growth/phase-taxonomy.ts`); the 0..5 band stays internal for sidebar collapsing; `workflow-steps.ts` deleted.
- D5 One nav config (`nav-groups.ts` v4) + one `persona.ts`; delete `nested-sidebar`, `journey-sidebar`/`persona-rail`, `role-taxonomy.ts`, `role-menu-overlay.ts`; Account leaves the sidebar (avatar menu + Settings link).
- D6 Every old route redirects (308/301) — `/workspace/billing`, `/workspace/evaluations`, `/analyze`, `/startup-package`, `/reseller/*` never move.
- D7 Visuals are deterministic SVG from `web/src/lib/report-visuals/` (recharts on web, react-pdf twins in PDF, PNG in DOCX/email); AI images leave the scored body.
- D8 Dimension owners: TRE→CRO, MPC→CMO, FTV→CHRO, PTD→CTO, CGH→CFO, IRI→CLO, LCO→CLO, SVM→CEO; CDO = evidence & cohort officer on every chapter; CISO/COO always-on deterministic cards; single table `dimension-owners.ts` replaces the 3 rubric copies.
- D9 Cost guard for the A$3 report: ≤ 30 LLM calls, COGS ≤ A$0.60, ≤ 120 s; free 10-page report ≤ 16 calls; budget degrade → deterministic cards, never a failed report.
- D10 Routes renamed: `/workspace/evaluation` (founder rubric) → `/workspace/score/criteria`; `/workspace/investor/preferences` → `/workspace/investor/mandate`; founder "Portfolio" → "Compare"; live prices unchanged (Free → A$3 → Starter A$29 / Growth A$69; Scout A$79 / Firm A$149 / Program A$349).

**Founder decisions needed (ask before the sprint that needs them; defaults in brackets ship if silent):**
- F1 Unify the public name "Trust BizReport" → **"Trusted Business Report"** everywhere (SKU key `trust_report` unchanged) [default: yes, S-R1].
- F2 Public rename `/investors` (invest-in-BlockID pitch) → `/about/invest` with 301 [default: yes, S-IA5; CMO sign-off].
- F3 Show the dimension **weights** to authenticated evaluators on the Dossier (never on public `/tbr`) [default: yes; IC memo shows weighted score only unless Program].
- F4 Allow CEO + CFO chapters on a paid Sonnet-class model inside the A$3 COGS envelope (`MODEL_AGENT_CEO/CFO`) [default: yes, S-R2].
- F5 Replace "500+ AU comparables" copy with the **live count** until the comparables table reaches 500 [default: yes, S-R1].
- F6 Final EN/VI sidebar label set (PM §D.2 table, 40 rows) [default: ship as proposed, S-IA1].

---

## 4. Integrated execution plan — 15 sprints in 5 waves (each sprint ≤ 1 session; deploy immediately → review → `qa:live` → fix)

Dependency spine: taxonomy core → mandate/fit scorer → investor landing block 2; ReportV2 contract → Dossier render; nav v4 → hubs → landings. Waves can run two sprints in parallel worktrees (`scripts/cleanup-merged-worktrees.sh` rule applies).

| Wave | Sprint | Scope (see spec §) | Migrations | Exit check |
|---|---|---|---|---|
| **W1 Foundation** | **S-IA1** Nav v4 + persona.ts + ~95 redirects + delete dead nav systems + `nav_click` event + walkthrough regen | PM §E S-IA1 | — | founder phase-0 sidebar ≤ 10 links; investor sidebar 3 groups, no Fundraise; redirect table test green |
| | **S-R1** `ReportV2` contract + `dimension-owners.ts` + `report-visuals/` (ring, radar, funnel, heatmap, range bars, sparkline, donut, gauge, checklist, timeline, route map, 2×2) + web TBR split into chapters (adapter from today's snapshots) | Product §F S-R1 | `svi_snapshots.report_v2`, `assembled_reports.report_json` | `/tbr/demo` + `/workspace/business-report` show 8 `svg[role=img]`; free fixture ≤ 10 pages |
| | **S-T1** Taxonomy core: enums + crosswalk + tests; `startup_taxonomy` + backfill script; `suggestTaxonomy()` in pipeline (silent fill) | BA E1.1–E1.3 | 0394 | backfill report: % unclassified printed; no UI change yet |
| **W2 Dossier & hubs** | **S-IA2** `HubTabs` + 17 hub layouts; pages `git mv` into tabs; Reports hub "All reports"; Investors hub Matches/Pipeline/Access; Documents hub Files/Data room/Compliance | PM §E S-IA2 | — | hydrated smoke: every hub root shows a tablist; TBR + investor pack generate at new URLs |
| | **S-R2** Agent ownership matrix + `buildAgentPrompt` v2 slots (role card, phase lens, skill addon, knowledge, modules, evidence, schema) + `knowledge-loader.ts` + phase-aware `agent-selector` + W4 dimension chapters with visuals + goal-tree research topics per dimension + 24 prompt-eval fixtures | Product §B, §C.2, C.4, C.6, C.10 | — | prompt snapshot tests per role × 3 phases; nightly eval green; delete `DIM_META`/`DIMENSION_INFO` |
| | **S-D1** Dossier readable: `evaluation_assessments` migration + lib + API; route `/workspace/evaluations/[evaluationId]` + loader with server-side consent masking; block 1 (radar SVG shared with PDF, weighted table, 13-criteria strip) | BA E4.1, E3.1–E3.2 | 0392 | evaluator opens dossier < 1.5 s TTFB; founder cannot see assessment fields |
| **W3 Money & valuation** | **S-IA3** Founder landing = 5 blocks + single recommender (`impact` field); move ladder/plan widgets to `/workspace/plan`; move WidgetGrid/LivingSVI to `/workspace/score`; delete 9 next-step components; `landing_viewed` / `landing_block_click` | PM §B, §E S-IA3 | — | `/dashboard` ≤ 250 lines server page; time-to-first-action median < 20 s |
| | **S-R3** Pipeline unification (stream route = thin SSE over `runReportPipeline`), GATHER un-stub (deepTechAudit, auditGitHubRepo, connector snapshots), 5-method valuation chapter in body, `svi_deck_cache.pipeline_version` | Product §C.1, C.3, C.5, §F S-R3 | `svi_deck_cache.pipeline_version` | standard TBR ≤ 30 calls, COGS ≤ A$0.60 (3-day median in `ai-spend-daily.json`), grounded ≥ 80 % |
| | **S-T2** Investor mandate: 0393 ALTER + personal org bootstrap; mandate form (7 sections) at `/workspace/investor/mandate` (+ prefs mirror one release); `FIT_WEIGHTS_V2` scorer both directions; nightly `mandate-fit-refresh` → `mandate_fit_scores` keyed on `project_id` (fixes deal-flow join); filters + saved views | BA E2.1–E2.5 | 0393 | deal-flow rows carry industry/stage; "investors who match" reads mandates; cron in crontab off-peak |
| **W4 Persona landings & parity** | **S-IA4** Investor/advisor/accelerator landing (4 blocks) + persona redirect from `/dashboard`; single `/onboarding` (3 steps × founder/evaluator flow); delete `/dashboard/onboarding` + progress bar; auth `next` resolved through `PERSONAS` | PM §C, §B.3, §E S-IA4 | — | seeded evaluator lands on `/workspace/investor`, sees 4 blocks; onboarding completion by persona tracked |
| | **S-R4** PDF/DOCX/email parity from `ReportV2` (react-pdf twins, PNG for DOCX/email) + Dossier consumes `ReportV2` (mandate fit, decision record, Δ since last view) + GA4 `dossier_view`, `investor_decision_saved` | Product §F S-R4 | `evaluation_reports.report_v2` | identical chapter structure on 5 surfaces; page-count gate |
| | **S-D2** Assessment form (AI-vs-me per dimension, risks, questions, decision, prefill from mandate fit) + share-with-founder allow-list + founder read-only preview + history timeline; founder taxonomy confirmation card + project settings form; legacy writers through crosswalk | BA E4.2–E4.4, E1.4–E1.5 | — | assessment private by default; share shows "founder will see exactly these items"; unclassified share falls |
| **W5 Scale & sell** | **S-IA5** One header (NavV2 with `variant="light"`), one footer, shared user menu, one Demo entry, `/investors` → `/about/invest` (F2) | PM §E S-IA5 | — | a11y: exactly one `<header>`/`<footer>`; `seo-audit` clean |
| | **S-R5** Comparables table + weekly allow-listed ingest + admin review (live N in copy); LinkedIn upload/URL parser; richer GA4 signals; cap table → CGH input in `computeSVI`; KPI admin tile; nightly eval extended | Product §C.7, §F S-R5 | `au_comparable_raises`, `founder_signals`, `ga4_signal_snapshots` | comparables copy true; CGH moves when cap table changes |
| | **S-D3** Seats & consensus (org invite within plan seat limits 1/3/5), IC memo PDF via `ic_reports`, cohort decision columns + CSV + LP report counts, watchlist `project_id`, portfolio write UI, intro → `investor_contacts`; `qa:live` dossier lane; docs merge close-out | BA E4.5–E4.7, E3.3–E3.7, E2.6, E5 | (0392 covers watchlist ALTER) | Program batch shows decisions; LP report counts decisions; SOT G13 closed |

Sizing: BA ≈ 54 engineer-days, PM ≈ 5 sessions, Product ≈ 5 sessions → **≈ 15 sessions of autonomous work + 3 hand-applied migrations (0392–0394) + 4 small schema adds**. Critical path W1 → W2 (S-D1 needs S-R1 radar + 0392) → W3 (S-T2 needs S-T1) → W4 (S-IA4 needs S-T2 for block 2; S-R4 needs S-R3) → W5.

---

## 5. Sales & packaging (from Product §E — the parts that gate copy)

- **Naming:** SVI (score) · Trusted Business Report (document, all surfaces) · Investor Dossier (evaluator view) · Progress Radar (weekly Δ). Kill: "Enhanced SVI report", "SVI report", "business report", "evaluation report".
- **Tier matrix (what the report unlocks):** Free 10 p. = cover + TRE/MPC/FTV/PTD chapters + cards for CGH/IRI/LCO/SVM + valuation range + current phase row + top-3 money · A$3 = all 8 chapters + 5-method valuation + full phase gates + money + share link · Starter A$29 / Growth A$69 = weekly re-run + Δ, DOCX, investor leads, 4 connectors (Growth: editable valuation scenarios + application drafts) · Scout A$79 / Firm A$149 / Program A$349 = Investor Dossier (mandate fit, decision record) with 10 / 30 / 100 reports per month, Firm white-label, Program cohort ranking + LP export.
- **CTA moments:** after free score (weakest dimension → A$3, cost + words shown before charge) · after evidence added (re-score A$1 or "included Sunday") · weekly Δ email · after an investor reads the share link ("CGH is the chapter investors open next") · evaluator after adding a startup ("Dossier ready in ~2 min, N reports left").
- **Messaging (≤ 3 lines, EN/VI) and the "why not ChatGPT" paragraph:** Product §E.4; G12 §4b reused verbatim.
- **KPIs:** `tbr_view → tbr_share_created` ≥ 25 % (7 d) · free `score_done → trust_report_purchased` ≥ 12 % (72 h) · reports/evaluator/month ≥ 6 Scout / 15 Firm / 40 Program · `dossier_view → investor_decision_saved` ≥ 40 % (14 d) · report-clarity survey ≥ 8.5/10 (N ≥ 30/mo) with `quality.groundedShare` median ≥ 0.85 as internal twin · nav: time-to-first-action after login median < 20 s, "can't find" feedback −50 % in 30 days, % sessions reaching a report up vs prior 14 days.

---

## 6. Verification (per sprint + goal close-out)

1. Unit: `npm run test` (new: `report-v2.schema`, `report-visuals/*`, `dimension-owners`, `startup-taxonomy` crosswalk, `investor-match` v2, `assessment-share`, `nav-groups` label rules + old-href redirect snapshot, `next-step-recommender` impact).
2. E2E on :4001 before deploy: `tests/e2e/nav/*` (fix the `/overview/i` first-group assertion; ladder test re-targets `/workspace/plan`; new investor-landing spec), `tests/e2e/smoke/post-deploy.spec.ts` (+ table-driven redirect HEAD test, + one tablist assertion per hub, + 8 `svg[role=img]` on TBR).
3. Deploy: `web/scripts/deploy-live.sh` gates 1–12; then `npm run qa:live` (new lanes: dossier TTFB/masking/share allow-list; founder lane; evaluator lane seeded via `scripts/seed-test-users.mjs`).
4. Prompt quality: `prompt-eval-nightly` on 24 TBR fixtures (score bands p25–p75, must-have gaps, no hallucination, ≥ 1 citation, primary visual kind); canary demotion on fail.
5. Cost: `ai-spend-daily.json` standard-report COGS ≤ A$0.60 median for 3 days after S-R3; call counter hard stop per tier.
6. Docs: `node scripts/docs/render-unlock-matrix.mjs --check` clean after every nav sprint; migration ledger updated for 0392–0394; SOT G13 row + register rows flipped per sprint; screenshot-tour re-run after S-IA3/S-IA4.

---

## 7. Risks (top 8; full registers in the specs)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Deep links in cron emails/tours/docs point at old routes | redirects cover all; grep + rewrite in S-IA1; table-driven redirect test |
| 2 | Hand-applied migrations land after deploy → 42P01 | every reader renders "not migrated" (0314 pattern); `qa:live` checks table presence |
| 3 | Backfill leaves a high "Unclassified" share | print % before enabling filters; founder confirmation card; honest state |
| 4 | Weight disclosure to evaluators (svi-scoring guardrail) | authenticated Dossier only (F3); public `/tbr` unchanged |
| 5 | Report COGS/latency creep with W4 chapters | call counter + `budgetOk()` degrade to deterministic cards; chapter-level cache for weekly Δ |
| 6 | Evaluator landing block 2 empty until the join fix | S-T2 before S-IA4; "Set your mandate" takes the slot meanwhile |
| 7 | Label change confusion during transition | one-time "We simplified the menu" toast; `aliases[]` per leaf for search; walkthrough doc regenerated |
| 8 | Founder-share chills honest evaluator notes | private by default; field-listed share; copy states exactly what the founder sees |

---

## 8. Ledger & doc changes made at open (2026-09-15)

- SOT: § G13 entry (status, decisions, next action), §2 register rows G13-W1…W5 (15 sprints), §5 human-blocked F1–F6, change-log row.
- `docs/ROADMAP.md` §4: new phase block "Phase 3.2 — Investor Clarity (G13)" with the 15 sprint checkboxes.
- `.claude/goals/feature-upgrade-roadmap-v2.md`: Q4 2026 checklist block "G13 Investor Clarity" + superseded notes on `report-v2-compelling.md` and `sub-agent-report-pipeline.md`.
- `GOALS.md` Implementation Priority: Phase 4 rows rewritten to point at G13 (investor share page → Investor Dossier; partner portal → persona landing).
- G7/G12 goal docs: amendment lines pointing to G13 (nav catalogue; evaluator surfaces).
