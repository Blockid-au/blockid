# BlockID.au — SOURCE OF TRUTH

> **Version:** 2026-07-23 (rev.317) · **Owner:** CEO (Do Van Long) · **Consumer:** founders, human team, autonomous loop agents.
> **Rule:** Consult this file BEFORE any specialised plan doc. Every specialised plan carries a top-of-file back-link to this one.
> **Entity:** PPL Food PTY LTD · Sydney NSW (founder decision 2026-09-10; no ABN/ACN shown in copy).

---

## 1. Active Goals

### G1 — Reseller module v1
- **Source:** [`docs/plans/reseller-module-goal.md`](./reseller-module-goal.md) · plan [`docs/plans/reseller-module-plan.md`](./reseller-module-plan.md) · delta [`docs/plans/plan-delta-2026-07-23.md`](./plan-delta-2026-07-23.md)
- **Tick:** 317 · **Track A focus:** `P2_redemption_attribution` (P0/P1/P2 landed, P3/P4/P5/P6/P7/P8 shipped except P8.5, P10 pin-hardening in-flight). **Track B focus:** `done` (B1..B10 shipped).
- **Status:** in-progress; C-Level blocking reviewers all approved; advisory notes closed at tick 68.
- **Next action:** P10 wire-shape pin cross-surface pairs continue (auto-loop). Track A HUMAN-BLOCKED on P1.5 (InfoVision seed) + P8.5 (Stripe env vars).
- **Blocker:** H.20 InfoVision ABN + GST status; `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY|ANNUAL` env mint.

### G2 — Real-world workflow parity
- **Source:** [`docs/plans/real-world-workflow-parity-audit-2026-07-23.md`](./real-world-workflow-parity-audit-2026-07-23.md)
- **Status:** audit remediation in-flight; 7/10 shipped this session, 3 remain founder-review-blocked.
- **Top-10 remediation (ranked):**
  1. Publish canonical 8-stage vocabulary (`architecture-designer`, S) — **shipped** (`7f499264`).
  2. Wire 12↔8 bucket map `web/src/lib/journey-map.ts` (`typescript-pro`, M) — **shipped** (`c4b70877` + `a1bf4542`).
  3. Extend data-room to 60+ items with AU compliance (`au-compliance`, M) — **shipped** (`b0ae8d8b`).
  4. Add Tax + AU-Compliance sections to template library (`au-compliance`, M) — **shipped** (`b0ae8d8b`).
  5. Overlay canonical-stage badges on 4 showcase cases (`react-expert`, S) — **shipped** (`b9ee0b7f`; dashboard parity `29c00fe1`).
  6. Add Airwallex + Culture Amp showcases (`deep-research` → `react-expert`, L) — founder review.
  7. Reseller `customer_stage` tracking (`db-migrate` + `fullstack-guardian`, M) — founder review.
  8. Add Step 6 "Create first startup" to onboarding wizard (`nextjs-developer`, S) — **shipped** (`41ab0cfc`; Stripe-return route fix `b176ffea`).
  9. Rename SCN externally + cite framework overlays (`code-documenter`, S) — **shipped** (`9e5d71e8`).
  10. "Real founder was here" callouts across 12 guide chapters (`deep-research` + `typescript-pro`, L) — founder review.
- **Next action:** items #6, #7, #10 await founder sign-off on wording/scope; no unblocked audit lane this window.
- **Blocker:** items 6, 7, 10 need founder sign-off on wording/scope.

### G3 — SVI Exchange (SVI EXC)
- **Source:** [`.claude/goals/svi-exchange-orchestration.md`](../../.claude/goals/svi-exchange-orchestration.md) · queue `web/content/reports/svi-exchange-tasks.json`
- **T_SVI_EXC_0001** Watchlist table + API (v0.2) — **DONE** (`shipped_v2.18`).
- **T_SVI_EXC_0012** Founder-side secondary offer intake form (v0.5) — **DONE** (tick shipped 2026-07-23, commit `bfd7a5bf`).
- **T_SVI_EXC_0013** Investor EOI book (v0.6) — **DONE** (`shipped_v0.4.0_ujveHxHJR157`).
- **T_SVI_EXC_0014** Institutional API tier — pricing + auth (v0.9) — **DONE** (`marked_deployed`).
- **Next action:** orchestrator (6-hour cron) picks next pending T_SVI_EXC_xxxx from queue.
- **Blocker:** none (four EXC anchors closed).

### G4 — Feature-upgrade roadmap v2
- **Source:** [`.claude/goals/feature-upgrade-roadmap-v2.md`](../../.claude/goals/feature-upgrade-roadmap-v2.md)
- **Status:** Q3 2026 in-flight (partially shipped; 21 sections). **v3.9.23 sync — items 1 and 2 shipped as Contact Sales row** (Enterprise custom + Accelerator A$500+ + VC A$349+ landed via B8 `58f34d45d`).
- **Top-5 open Q3 items:**
  1. Enterprise tier + team features — **shipped** (Contact Sales row + Pro A$299/mo tier delivered team features via `58f34d45d`).
  2. Accelerator partnership pricing — **shipped** (Contact Sales row Accelerator from A$500 via `58f34d45d`).
  3. PDF branding customisation for paid plans — **shipped** (feature-gate + settings form `26678366`; renderer wire `880df71c`).
  4. Dashboard personalisation (pin/reorder widgets) — `react-expert`.
  5. ProductHunt launch campaign — `cmo` + `media-studio`.
- **Next action:** items 4-5 remain open — G4 continues.
- **Blocker:** none.

### G5 — Pricing upgrade v2 — **✅ CLOSED (v3.9.23, 2026-09-07)**
- **Source:** [`docs/pricing-upgrade-plan-2026-07-16.md`](../pricing-upgrade-plan-2026-07-16.md)
- **Status:** **CLOSED** — Universal 3-rung ladder shipped v3.9.23 workstream B (B1..B8). Founding-50 marketing surface purged (Stripe SKU grandfathered only). GST unified (exclusive). Credit packs monotonic. Persona pages deep-link to `#tier-growth`/`#tier-pro`. `share_management` gate resolved for Growth. Trial-days copy reconciled (7-day public / 14-day pilot).
- **Ship commits (v3.9.23):**
  1. B1+B2 pricing consolidated to Free / Growth / Pro public ladder + `public:false` flag on hidden SKUs — `5f45f0b63`.
  2. B3-lite legacy `PRICING_TIERS` array retired — `d68a37eb9`.
  3. B3-tail Founding-50 legacy marketing surface purged; Stripe SKU kept for grandfathered renewals only — `1ec7f2657`.
  4. B4 GST-exclusive unified — `1820f99f8` + `20a7541fb` (FAQ JSON-LD + body stragglers).
  5. B5 persona pages deep-link `#tier-growth`/`#tier-pro` — `da9f36000` + `e6c99cbc3`.
  6. B6 share_management gate resolved — `1188c130e`.
  7. B7 trial-days copy reconciled — `2ddc7381d`.
  8. B8 3-card ladder + ContactSalesRow (Accelerator A$500+ / VC A$349+ / Enterprise custom) + credit-pack monotonic fix — `58f34d45d`.
- **Residual:** PRC-EQ Equity-for-solution workflow remains `human_blocked` on `legal_review_passed=true` — carries forward under G4 as its own tracked item.
- **Blocker:** none — goal closed.

### G6 — Unicorn masterplan
- **Source:** [`.claude/goals/unicorn-masterplan.md`](../../.claude/goals/unicorn-masterplan.md)
- **Pillars (1-sentence status each):**
  - **Revenue trajectory** — 2026 H2 A$60K ARR target; SVI credits + subscriptions live, reseller channel booked (2027 A$150K → 2030 A$8M).
  - **Cap-table & Fundraise** — Pre-Seed A$500K target; deck v1.1 shipped with Channel-Economics slide; data-room GTM one-pager shipped.
  - **Product roadmap (8 phases)** — Phases 1-3 shipped; Phase 4 (Equity/Cap Table) in-flight via reseller add-on (P8) + Share Management drawer.
  - **C-Level self-upgrade** — 11 C-Level agents on cron; CTO/CFO/CISO/CLO advisory notes closed tick 68.
  - **Blockchain (CBO)** — Private EVM (Anvil chainId 420) + Otterscan live at `:5173`; ping.pub reserved for Cosmos testnet.
  - **Governance & Compliance (CLO/CISO)** — APP 5 notice + reseller agreement template shipped; SOC2 lite backlog open.
  - **Team/ESOP (CHRO)** — Div 83A qualifying-tests checklist landed tick 2026-07-23; ESOP scheme placeholder in ch08.

### G7 — UX information architecture (startup flow)
- **Source:** [`docs/plans/ux-ia-startup-flow-goal.md`](./ux-ia-startup-flow-goal.md) · user note [`docs/user/menu-walkthrough.md`](../user/menu-walkthrough.md)
- **Status:** P0–P7 + P9 all shipped. **P8 founder review status (v3.9.23 sync):** still `human_blocked` — no code lane is gated on it. The v3.9.23 Free Tools dropdown grouping (A7, commit `9c247175d`) resolves one of the Q-questions (top-nav grouping strategy) in-flight; other Q's remain founder-review.
- **Ship commits:**
  1. `43f172f3` — goal doc with audit + IA proposal + phased plan (313 lines).
  2. `27ab1553` — global DEMO menu (NavV2 + legacy site/navbar + WorkspaceLayout topbar + both footers) linking `/showcase/atlassian?step=1`.
  3. `79672c4a` (auto-tick) — `JourneyStepLadder` 12-phase visual + dashboard mount.
  4. `a5c295e0` — E2E `web/tests/e2e/nav/menu-structure.spec.ts` pinning nav contracts per role.
  5. Round 5.13 — P5 progressive-disclosure polish (`Later phases (N)` collapse + lock glyph), P6 role-menu-overlay helper (`web/src/lib/nav/role-menu-overlay.ts`), P7 a11y contracts (`aria-haspopup="menu"`, workspace `aria-label`, disclosure buttons) + `docs/design/menu-a11y-audit.md`.
  6. This tick — P9 close-out: SOURCE-OF-TRUTH + `docs/user/menu-walkthrough.md` refreshed to reflect P5–P7 shipped; goal doc `phased_tracks.P9` flipped to `shipped`.
- **Next action:** founder review of Q1–Q4 (top-nav phase-cluster count, DEMO placement, ladder collapse rule on mobile, returning-founder skip-tutorial). No code work queued.
- **Blocker:** founder review only. No new deps, no CI touch, tsc clean.
- **Successor:** G8 continues this lane — G7 built the IA, G8 makes it phase-aware and closes the chrome gaps G7 left untouched.

### G8 — Progressive unlock & chrome parity
- **Source:** [`docs/plans/unlock-next-level-2026-07-31.md`](./unlock-next-level-2026-07-31.md) · continues G7 · founder request 2026-07-31
- **Decisions (founder, 2026-07-31):** unlock spine = **Growth phases 12** (`vision`…`funding`, the taxonomy `startup_phase_progress.phase_id` already stores) · lock policy = **hybrid** (progress-locked ⇒ hidden, tier-locked ⇒ dimmed + upgrade chip).
- **Status:** **P0 + P1 shipped** (taxonomy unification closed the blocking defect; the phase-gate engine now exists). P2–P8 `open`.
- **Audit findings (ranked):**
  1. **✅ FIXED (P0)** — two different 12-phase taxonomies were silently conflated. `startup_phase_progress.phase_id` stores string ids; `PHASE_CRITERION_SUBSET` + `COMPLIANCE_PHASE_GATES` key off numeric `PhaseKey 1-12` with **different phase-N semantics** (string #6 = `legal_equity`, numeric #6 = Revenue/Business Model). `web/src/lib/nudge/next-steps.ts:426` bridges via `indexOfGrowthPhase(id)+1` — mis-scored every founder. Closed by `web/src/lib/growth/phase-taxonomy.ts`: string ids are canonical, the numeric bridge is explicit and test-pinned, and `readiness_by_phase` + `current_phase.slug` now key on growth ids.
  2. **✅ FIXED (P1)** — no advance-gate existed for the 12-phase model, only `completion_pct`. `web/src/lib/growth/phase-gate.ts` now mirrors Unicorn's `computeStageProgress()`: `PHASE_EXIT_RULES` (required criteria + SVI dimension floors per §2c), four typed blocker codes, partial-credit `completionPct`, opt-in deliverable gating.
  3. **~70 pages render with no shell** — `/reseller/*` 13/13, `/showcase/*` 15, `/admin/*` 24/36, `/compliance/*` 7/7, `/workspace/*` orphans 8, marketing strays 7. Root layout renders no chrome (`web/src/app/layout.tsx:96-172`); shells are opt-in per file.
  4. **No footer in `WorkspaceLayout` or `AdminLayout`** — ~107 pages have no bottom bar.
  5. **Unlock machinery built but imported by nothing** — `web/src/lib/nav/filter-nav-for-user.ts:94` and `web/src/lib/nav/hide-when-locked.ts:47` already implement decision D2 exactly; the live renderer `workspace-layout.tsx:141-168` ignores `persona`, `journeyGroup`, `hideWhenLocked` and dims `minPhase` groups instead of hiding them.
  6. `web/src/app/reseller/layout.tsx:11` carries a "P4 hardening will replace this with the reused WorkspaceLayout" TODO that was never executed.
- **Evaluation criteria (§2c of goal doc):** 12 phase exit gates, each requiring named criteria at ≥ `good` (from the 13 in `web/src/lib/evaluation-criteria.ts:66`, weights = 100) **plus** an SVI dimension floor (from the 8 in `web/src/lib/svi-analysis.ts:1195-1275`). Compliance gates re-mapped by intent: `rd→product_dev`, `gst→go_to_market`, `esic→investor_review`, `s708→investor_review`.
- **Next action:** P2 persist unlock state (migration 0300 on `startup_phase_progress`) then P3 nav wiring. ⚠ The autonomous loop is concurrently landing route-group moves (`(marketing)`/`(app)`/`(persona)` — commits `76f2febe`, `e34f3fed`, `9ae661ff`) that overlap P5/P6; reconcile the shell matrix against that work before starting chrome backfill.
- **Blocker:** none for P0/P5. Q1–Q3 in the goal doc are founder-review only and non-blocking.

### G9 — Value-First Hero (user outcome copy enforcement)
- **Source:** [`docs/plans/value-first-hero-goal.md`](./value-first-hero-goal.md)
- **Status:** open — reference/enforcement goal; no autonomous loop (VALUE_FIRST_HERO_LOOP=off).
- **Principle:** Every hero section must lead with what the user GETS and what hard problem it SOLVES — not with product identity or marketing copy. Marketing/pricing CTAs are lower priority.
- **Success criteria (summary):**
  1. All `/tools/*` hero H1s lead with a concrete user outcome + the hard problem solved — never a product name or category label.
  2. Landing page hero sub-headline quantifies benefit with numbers (time, AUD, %, count).
  3. No tool page H1 starts with "tool" or "calculator".
  4. Tool page CTA buttons use outcome language ("Get my valuation") not action language ("Submit", "Calculate").
  5. Dashboard first-view shows a live founder-relevant metric above the fold — not a welcome banner.
- **Phased tracks:** P0 audit → P1 tool hero copy → P2 CTA language → P3 landing numbers strip → P4 dashboard metric card.
- **File boundaries:** `web/src/app/tools/*/page.tsx` (copy only) · `web/src/components/landing/hero-v3.tsx` (numbers strip) · `web/src/app/dashboard/page.tsx` (additive metric card). Do NOT touch `web/src/lib/**`, `nav-v2.tsx` (G7), `/pricing/**` (G5), migrations, or CI.
- **Blocker:** Q1 (which live metric for dashboard card) is founder-review-blocking for P4. P0–P3 have no blockers.

### G10 — v3.9.23 Unify sprint (message truth + pricing + feature drift)
- **Source:** approved plan `h-y-review-t-on-b-foamy-pixel` (Agent C audit → workstreams A/B/C/D).
- **Status:** **✅ SHIPPED (2026-09-07)** — full messaging↔code synchronisation sprint. Release `JctZ0PfqkXowL6mTrcEs3`, git `8ed44c24a`, `web/package.json` `3.9.23`.
- **Workstreams (all closed):**
  - **A — message truth on marketing surface (8 items):** A1 score-first hero H1 + quantified subheadline (`a2b5c8971`); A2 quick-tag chips route to real targets (`4b5288699`, chips render as `<a href>` `8ed44c24a`); A3 "50+ AI agents" → "11 C-Level agents" (`f8001541a`); A4+A5 "13 criteria" → "8 SVI dimensions" verbatim PRD labels (`7080aecc8`); A6 CTA subtext scrub — no implicit user-count (`5f853225a`); A7 Nav Free Tools dropdown (17 tools grouped) + demo unify + hide Compare (`9c247175d`); A8 Revenue Tracker card → Trust Report share links (`dccb78487`).
  - **B — pricing simplification (8 items):** B1+B2 3-rung public ladder + `public:false` on hidden SKUs (`5f45f0b63`); B3-lite legacy `PRICING_TIERS` retired (`d68a37eb9`); B3-tail Founding-50 marketing purged (`1ec7f2657`); B4 GST-exclusive unified (`1820f99f8` + `20a7541fb`); B5 persona deep-links (`da9f36000` + `e6c99cbc3`); B6 share_management Growth gate (`1188c130e`); B7 trial-days (`2ddc7381d`); B8 3-card + ContactSalesRow + credit-pack monotonic (`58f34d45d`).
  - **C1 — investor pack CLevelChapter render + ToC 9 chapters** (`2dd695b98` + `f50a42be1` + colocated test).
  - **D — under-promised feature surface:** D1 `/features` page (cohort percentile, per-investor tracked share links, ATO tax invoice, dividend engine, 17 free tools, 12-chapter guide, evidence completeness, LP anonymisation) (`aead3ed1e`); D2 sitemap + nav (`0850f2b25`); D3 `/tbr/demo` hero tertiary link (`947057278`).
  - **Followups:** homepage title + og:image:alt (`abeca292e`); Playwright post-deploy smoke (`b6d83a852`).
- **Agent C drift-audit resolutions (unify list §7 P0/P1):**
  1. ✅ Founding-50 name/price drift — purged from marketing surface (B3-tail).
  2. ✅ CLevelChapter render — shipped C1.
  3. ⚠️ Agent count reconciliation — marketing surface aligned to 11 (A3, `/features`, PRD §6). Follow-up: **trend UI `Role` union in `web/src/components/dashboard/AgentTrends.tsx` still limited to 5 roles**; carried forward as G10-followup, low priority.
  4. ✅ Blockchain stack — current implementation clarified as private EVM (Anvil chainId 420) + Otterscan across README, ARCHITECTURE.md, PRD §17, blueprint §7; Cosmos SDK retagged long-term roadmap.
  5. ✅ Investor pack ToC bumped to 9 (Evidence Completeness added).
  6. ✅ Founding-50 route deleted; Stripe SKU grandfathered.
  7. ✅ Hero H1 aligned to product name and quantified promise.
  8. ✅ Under-promised capabilities surfaced at `/features`.
- **Blocker:** none. Sprint closed.
- **Docs synced (this tick):** README.md (new), ARCHITECTURE.md, GOALS.md, ROADMAP.md, KNOWLEDGE_BASE_INDEX.md, blockid_prd.md, blockid_master_project_blueprint_v1.md, blockid_gtm_sales_first_v1.md, blockid.au.md (deprecated banner), this SOURCE-OF-TRUTH.md, `/version` page + `web/CHANGELOG.md` + `web/package.json` bump to 3.9.23.

### G11 — Money Finder: simple public menu + "Do you need money?" (AU grants, programs, Founder Radar)
- **Source:** [`docs/plans/money-finder-2026-09-10.md`](./money-finder-2026-09-10.md) · seed data `web/content/data/grants-au.seed.json` (56 rows) + `web/content/data/programs-au.seed.json` (8 capitals + national)
- **Status (2026-09-10 13:10 UTC):** **S0 + S2 LIVE** — T0237 (loop hygiene, 0309 DB sync), T0239 (migration 0311 + 56 grants / 199 programs seeded), T0238 (5-entry nav + "Do you need money?" CTA, auth-aware NavV2, funding footer, unlock preview), T0241 (free `/funding/grants`, `/funding/programs/[capital]` directories + JSON-LD), interim `/funding` landing. Release passed 12/12 gates; nav E2E 5/5 on production. **In flight:** T0240 grant-advisor (merged to branch, 136 tests), T0250 hero one-liners (merged), T0242 `/funding` intake + A$3 report, T0243 refresh cron. Ledger = `implementing-plan.md`.
- **Founder decisions (2026-09-10):** public nav = 5 items (Get my score · Get funding ▾ · Free tools ▾ · Pricing · Demo ▾) + CTA "Do you need money?" · gate = A$3 one-off (guest SKU, same pattern as One-Click Report) + 3 credits + plan-included · programs = all 8 capitals in v1 · "Founder Radar" alerts/re-match/digest bundled into **Starter A$29** (no new tier, no add-on).
- **Parts:** A public-menu simplification (legacy `site/navbar.tsx` mirrors, not retired — 52 importers, shell swap stays in G8-P6) · B Money Finder (`au_grants`/`au_programs`/`funding_reports`/`project_grant_profiles`, `lib/agents/grant-advisor.ts`, `/funding*`, A$3 SKU) · C Founder Radar (deadline drips T-30/14/3, monthly re-match, weekly digest money block, ICS, capital map, application drafts) · D weekly refresh cron + dashboard `MoneyRadarTile` + messaging pack + **D-5 hero one-liners** (founder view F1 "See your startup the way an investor will — your score, what it's worth, and where the money is, in 60 seconds." · investor view I1 "One score across 8 investor dimensions, backed by evidence — screen an Australian startup in minutes, not weeks." · tagline "A credit score for startups."; winners recorded back in G9).
- **Amendments:** G7 public-nav file boundary and G9 "do not touch `nav-v2.tsx`" are superseded by G11-P1 for the **public** nav only; G7 "never hide a feature" continues to govern the logged-in sidebar (G8).
- **Positioning constraint:** business.gov.au says "don't pay for government grant information" — lists + official links stay free; A$3/plan buys eligibility analysis, ranking, A$ estimate, timeline, drafts. CC BY 3.0 AU attribution on reused Commonwealth text.
- **Execution model (2026-09-10 review):** the autonomous code channel is effectively off — goal-loop driver removed `fd7bb0b03` (2026-08-13), `agent-auto-improve` ships 0 (all agents FROZEN), only `self-upgrade-agent.sh` implements (1 task/night, 1–3 files, stale priority list). G11 therefore ships via **founder-driven Claude Code sessions in 6 waves** (worktrees, off-peak deploys), `project-state.json` as ledger, T-id in every commit subject so `stageUpdateArtifacts` closes tasks + bumps version. Night loop takes only S-size follow-ups (T0249).
- **Next action:** see **Unified sprint plan** below (S0 → S5). G11 lanes: S0 T0237 → S2 T0239 ∥ T0238 → T0250 → T0241 → S3 T0240 → T0242 → T0243 → S4 T0244 → T0245 → T0246 → T0247 → T0248 → T0249 → S5 T0251.
- **Blocker:** none for Wave 0–1. Human-blocked before Wave 3/5: mint `STRIPE_PRICE_FUNDING_REPORT` (T0242); Q1 Starter label (T0247); Q2 free-tier in-app alerts (T0245); GA4 `hero_variant` dimension (T0250); `ABR_GUID` env (T0244) — see §5.

### G11 + G12 — Unified sprint plan (pre-implementation review 2026-09-10, approved)
- **Source:** goal docs §9 (`money-finder-2026-09-10.md`, `evaluator-traction-2026-09-10.md`) · ledger `project-state.json` tasks carry `sprint` (S0–S5) + `priority` (P0–P3).
- **Order:** **S0 Hygiene** T0237 (re-id collisions · `nextTaskId` max+1 · `merged` status · `stagePlan` content · migration **0309** DB `plans` = csv · entity → **PPL Food PTY LTD** · header drift) → **S1 Sell to evaluators** T0268 → T0269 → T0275 → T0274-1 → **S2 Founder funnel + data** T0239 ∥ T0238 → T0250 → T0241 → **S3 Reports that make money** T0240 → T0242 ∥ T0270 → T0271 → T0243 → **S4 Retention** T0244 → T0245 → T0246 → T0247 ∥ T0273 → T0248 → T0249 (night loop) → T0274-2 → **S5 Scale** T0272 → T0251. ~14 working days, ≤ 2 parallel worktrees, deploys off-peak, T-id in every commit subject.
- **Review findings that changed scope:** nav consolidated `1c359f000` (T0238 shrinks: edit `MENU` 7→5 + CTA); DB `plans` rows for 7 B2B SKUs still 0074 seed (**blocking**, → 0309 in S0); csv flag names ≠ page gates (→ T0268 uses gate vocabulary); A$5.50 SKU re-priced in place (Q-C); `/solutions/advisor` 301 → `/for/advisor` selling Growth A$69 (→ T0274); two privacy policies, provider list only Anthropic (→ T0275); snapshot test `tier-visibility` must be regenerated with new flags; `deploy-live.sh` = 12 gates; `menu-structure.spec.ts` not run by deploy.
- **Go checklist (2026-09-10 11:45 UTC):** ✅ `npm test` on HEAD `7cb4f03fb` — 1,110 files / 28,717 tests passed (85 s) · ✅ `/api/health` ok v3.10.0 (db, stripe, audit_chain, ga4), guardian healthy every 2 min, load 0.4–1.5 — the 87.1 % 24-h figure is the earlier incident window, not a current fault · ⏳ Stripe evaluator prices (S1 ships without checkout until minted) · ✅ entity = PPL Food PTY LTD, no ABN in copy · **ready for founder "go" → S0 T0237 starts same day.**

### G12 — Evaluator Traction: pricing + positioning for investors, accelerators, incubators, consulting & service firms
- **Source:** [`docs/plans/evaluator-traction-2026-09-10.md`](./evaluator-traction-2026-09-10.md) · companion of G11 (Evaluator Progress Radar consumes G11 signals)
- **Status (2026-09-10 13:10 UTC):** **S1 LIVE** — T0268 (Scout/Firm/Program public, 2-tab `/pricing`, Trust BizReport A$3 re-priced in place, migration 0312), T0269 (evaluator signup with card-required 7-day trial, migration 0310, `segment` written), T0275 (one privacy policy v2.1 at `/legal/privacy`, provider chain listed, data principle, `EvaluatorReportDisclaimer`, migration 0313), T0274 part 1 (`/solutions/advisor` real page, `/for/advisor` 301, investor/accelerator rewrite with 6 differentiators + ChatGPT FAQ, `/investors` + `/docs` stale copy). **In flight:** T0270 evaluations object. Still human-gated: Stripe prices `STRIPE_PRICE_INVESTOR_ANGEL|ADVISOR|VC_SMALL` + the A$3 swap for `STRIPE_PRICE_TRUST_REPORT_5AUD` — evaluator signup returns `plan_not_provisioned` until minted.
- **Founder decisions (2026-09-10):** evaluator trial = 7 days **card required** (same Stripe mechanism as founders) · public rungs **Scout A$79 · Firm A$149 · Program A$349** re-using `investor_angel / investor_advisor / investor_vc_small` (accelerator A$500+/1,500/3,500 + VC Enterprise stay Contact Sales; consulting firms also via reseller 0–40 %) · **A$3 = full Trust BizReport** for founders and evaluators, A$5.50 `TRUST_REPORT_5AUD` retired, re-score A$1 · founder ladder unchanged (Free → A$3 → Starter A$29 / Growth A$69).
- **Finding:** the B2B ladder already exists (`plans.csv` rows 7–13, entitlements, investor/accelerator/advisor workspaces, reseller module, partner API) but is `public:false`, has no Stripe prices, cannot self-serve trial, and every CTA lands on a contact form that drops `?plan=`. Missing: "startups I'm evaluating" object, migrations for `investor_portfolio` / `watchlist_digest` / `advisor_client_roster`, `/solutions/advisor`, batch scoring.
- **Positioning (6 proofs):** one rubric 8 dim × 13 criteria × 12 phases · 11 C-Level agents + auditor · the startup's own accumulating evidence (weekly snapshots) · AU-native (AUD methods, ESIC/R&DTI/s708, 500+ comps, grants) · A$3 vs A$2,985+ valuer / Equidam A$635 / Kruncher US$499 floor · documented method + founder's doctoral (DBA) research — **wording pending founder sign-off, never "PhD"**. "Why not ChatGPT" paragraph + cited evidence in goal doc §4b / Appendix C.
- **Traction (90 days):** T1 angel groups + First Believers alumni → T2 three accelerator pilots (batch scoring on a live intake, from our own programs seed) → T3 advisory firms via reseller → T4 solutions pages, comparison page, 3 case studies. KPIs: trial→Scout ≥ 15 %, ≥ 4 reports/evaluator/mo, pilot→paid ≥ 50 %.
- **Next action:** see **Unified sprint plan** above. G12 lanes: S0 T0237 (0309 DB sync) → S1 T0268 → T0269 → T0275 → T0274-1 → S3 T0270 → T0271 → S4 T0273 → T0274-2 → S5 T0272.
- **Blocker:** only `STRIPE_PRICE_INVESTOR_ANGEL|ADVISOR|VC_SMALL` (+annual) still to mint (needed by T0268 checkout). Founder **approved 2026-09-10** the doctoral-research sentence and the data-handling sentence (§5).

---

## 2. Requirements Register

| ID | Source | Category | Status | Owner (skill) | Ship commit |
|---|---|---|---|---|---|
| D1-CTO-01 | plan-delta-2026-07-23 | data-model | shipped | database-optimizer | migration 0091 |
| D1-CTO-02 | plan-delta-2026-07-23 | data-model | shipped | database-optimizer | migration 0091 |
| D1-CTO-04 | plan-delta-2026-07-23 | ledger | shipped | database-optimizer | 0091 events table |
| D1-CTO-05 | plan-delta-2026-07-23 | seed | human_blocked | db-migrate | — (H.20 ABN/GST) |
| D2-CFO-01 | plan-delta-2026-07-23 | tax/AU | shipped | au-compliance | 0092 gst_registered+abn |
| D2-CFO-03 | plan-delta-2026-07-23 | refund-GST | shipped | typescript-pro | 3-part reversal |
| D2-CFO-04 | plan-delta-2026-07-23 | economics | shipped | typescript-pro | `web/src/lib/reseller/cogs.ts` |
| D2-CFO-06 | plan-delta-2026-07-23 | GST-invariant | shipped | au-compliance | G.2 rewrite |
| D2-CFO-07 | plan-delta-2026-07-23 | KPI | shipped | typescript-pro | C.6 CSV schema |
| D2-CFO-08 | plan-delta-2026-07-23 | sandbox-cap | shipped | secure-code-guardian | tick 317 pins |
| D3-CISO-01 | plan-delta-2026-07-23 | RLS | shipped | secure-code-guardian | `reseller/supabase.ts` |
| D3-CISO-02 | plan-delta-2026-07-23 | feature-gates | shipped | secure-code-guardian | manifest tick 44 |
| D3-CISO-03 | plan-delta-2026-07-23 | k-anonymity | shipped | secure-code-guardian | progression queries |
| D3-CISO-04 | plan-delta-2026-07-23 | redaction | shipped | secure-code-guardian | reseller view |
| D3-CISO-05 | plan-delta-2026-07-23 | sandbox-cap | shipped | secure-code-guardian | tick 317 |
| D3-CISO-06 | plan-delta-2026-07-23 | Stripe-portal | shipped | secure-code-guardian | `fd4a1eb3` |
| D3-CISO-07 | plan-delta-2026-07-23 | hash-metadata | shipped | secure-code-guardian | `reseller/hash.ts` |
| D3-CISO-08 | plan-delta-2026-07-23 | CI-lints | shipped | test-master | R-01..R-09 |
| D4-CLO-01 | plan-delta-2026-07-23 | APP 5 notice | shipped | au-compliance | EN+VI |
| D4-CLO-02 | plan-delta-2026-07-23 | legal-agreement | human_blocked | clo | requires counsel |
| RES-U.4 | reseller-module-plan §U | wholesale | shipped | fullstack-guardian | P4 console |
| RES-U.7 | reseller-module-plan §U | progression | shipped | react-expert | drawer overview |
| RES-U.8 | reseller-module-plan §U | guide-ch1-12 | shipped | typescript-pro | ticks 48/49/50 |
| RES-U.9 | reseller-module-plan §U | auto-DataRoom | shipped | fullstack-guardian | phase snapshot |
| AUD-R1 | real-world-audit §6 | taxonomy | shipped | architecture-designer | `7f499264` |
| AUD-R2 | real-world-audit §6 | 12↔8 map | shipped | typescript-pro | `c4b70877` + `a1bf4542` |
| AUD-R3 | real-world-audit §6 | data-room AU | shipped | au-compliance | `b0ae8d8b` |
| AUD-R4 | real-world-audit §6 | Tax+AU template | shipped | au-compliance | `b0ae8d8b` |
| AUD-R5 | real-world-audit §6 | showcase badges | shipped | react-expert | `b9ee0b7f` + `29c00fe1` |
| AUD-R7 | real-world-audit §6 | reseller-stage | founder_blocked | fullstack-guardian | — |
| AUD-R8 | real-world-audit §6 | onboarding step 6 | shipped | nextjs-developer | `41ab0cfc` + `b176ffea` |
| AUD-R9 | real-world-audit §6 | SCN rename | shipped | code-documenter | `9e5d71e8` |
| Q3-PDF-BRAND | feature-upgrade-roadmap-v2 | PDF branding | shipped | cpo + ui-ux-pro-max | `26678366` + `880df71c` |
| PRC-INV | pricing-upgrade-plan | per-seat SKU | open | cro | — |
| PRC-ACC | pricing-upgrade-plan | accelerator SKU | shipped | cro | placeholder Stripe IDs, iter-7 |
| PRC-EQ | pricing-upgrade-plan | equity-for-solution | blocked | clo | legal_review_passed=false |
| EXC-0001 | svi-exchange-tasks | watchlist | shipped | fullstack-guardian | v2.18 |
| EXC-0012 | svi-exchange-tasks | founder-side offer | shipped | nextjs-developer | `bfd7a5bf` |
| EXC-0013 | svi-exchange-tasks | investor EOI book | shipped | fullstack-guardian | v0.4.0 |
| EXC-0014 | svi-exchange-tasks | institutional API tier | shipped | typescript-pro | marked_deployed |
| SHOWCASE-ATL | atlassian-standard-mapping-goal | showcase-walkthrough | shipped | react-expert + nextjs-developer + test-master | fixture `aa2f8808`; shell test `5fed65f8`; guide `42bfad17`; summary + landing CTA `4bcd4c09` |
| G8-P0 | unlock-next-level-2026-07-31 | taxonomy | shipped | typescript-pro | `4f7a922f` + `6c8819f6` |
| G8-P1 | unlock-next-level-2026-07-31 | gate-engine | shipped | typescript-pro | `885acbd7` |
| G8-P2 | unlock-next-level-2026-07-31 | data-model | open | db-migrate | — (migration 0300) |
| G8-P3 | unlock-next-level-2026-07-31 | nav-hybrid | open | react-expert | — |
| G8-P4 | unlock-next-level-2026-07-31 | next-unlock UI | open | cpo | — |
| G8-P5 | unlock-next-level-2026-07-31 | shell-matrix | open | nextjs-developer | — |
| G8-P6 | unlock-next-level-2026-07-31 | chrome-backfill | open | nextjs-developer | — (~70 pages) |
| G8-P7 | unlock-next-level-2026-07-31 | CI-guard | open | test-master | — |
| G8-P8 | unlock-next-level-2026-07-31 | docs | open | code-documenter | — |
| DR-SBOM-01 | dataroom license-risk review | licence-classifier | shipped | typescript-pro | `563a3124` |
| G11-P0 | money-finder-2026-09-10 | goal-doc + seed data | shipped | senior-pm | (this commit) |
| G11-P1 (T0238) | money-finder-2026-09-10 | public-nav 5 items + CTA | open | react-expert + nextjs-developer | — |
| G11-P2 (T0239) | money-finder-2026-09-10 | migration 0308 + seed script + /admin/funding | open | db-migrate + fullstack-guardian | — |
| G11-P3 (T0240) | money-finder-2026-09-10 | grant-advisor agent + tests | open | cfo-advisor + clo-advisor + typescript-pro | — |
| G11-P4 (T0242) | money-finder-2026-09-10 | /funding landing + preview + A$3 SKU + report API + grant_finder flag | open | fullstack-guardian + stripe-saas-billing | — |
| G11-P5 (T0244) | money-finder-2026-09-10 | paid report page + PDF + dataroom save + workspace leaf | open | react-expert + nextjs-developer | — |
| G11-P6 (T0241) | money-finder-2026-09-10 | public directories /funding/grants, /funding/programs/[city] | open | seo-content-au + nextjs-developer | — |
| G11-P7 (T0243) | money-finder-2026-09-10 | refresh-funding-sources cron + fetch helper + research topics | open | cto + rnd | — |
| G11-P8 (T0249, night loop) | money-finder-2026-09-10 | pricing row, insight links, GA4 events, stripe sync drift | open | cmo + code-documenter | — |
| G11-P9 (T0245) | money-finder-2026-09-10 | funding_matches + money-radar-sweep + notification kinds + email category + ICS | open | fullstack-guardian + db-migrate | — |
| G11-P10 (T0246) | money-finder-2026-09-10 | radar drips T-30/14/3 + digest money block + events + svi_trend_alert writer | open | cto + cmo | — |
| G11-P11 (T0247) | money-finder-2026-09-10 | Founder Radar packaging in Starter + upsell card | open | cro + stripe-saas-billing | — |
| G11-P12 (T0251) | money-finder-2026-09-10 | Growth extras: investor reverse-match, per-grant drafts, quarterly refresh (v2) | open | investor-relations + cfo-advisor | — |
| G11-P13 (T0248) | money-finder-2026-09-10 | MoneyRadarTile + /workspace/funding tabs + messaging copy EN/VI | open | react-expert + cmo + conversion-optimizer | — |
| G11-P14 (T0250) | money-finder-2026-09-10 | hero one-liners (founder/investor/general, EN+VI) + 5-second test + A/B | open | cmo + cro + conversion-optimizer | — |
| G11-W0 (T0237) | money-finder-2026-09-10 §8 | loop hygiene: nextTaskId max+1, stagePlan content, TaskStatus merged, self-upgrade priority list | open | cto | — |
| G12-P1 (T0268) | evaluator-traction-2026-09-10 | Scout/Firm/Program public + limits + A$5.50 retired | open | cro + stripe-saas-billing | — (needs Stripe prices) |
| G12-P2 (T0269) | evaluator-traction-2026-09-10 | evaluator signup, card-required 7-day trial, account_type | open | cto | — |
| G12-P3 (T0270) | evaluator-traction-2026-09-10 | evaluations object + missing migrations | open | cto + db-migrate | — |
| G12-P4 (T0271) | evaluator-traction-2026-09-10 | in-workspace A$3 Trust BizReport + re-score A$1 | open | cfo + fullstack-guardian | — |
| G12-P5 (T0272) | evaluator-traction-2026-09-10 | batch scoring + sponsor/LP report | open | cpo | — |
| G12-P6 (T0273) | evaluator-traction-2026-09-10 | Evaluator Progress Radar digest (G11 signals) | open | cmo | — (after T0245) |
| G12-P7 (T0274) | evaluator-traction-2026-09-10 | /solutions/advisor + rewrites + ChatGPT comparison + messaging + GA4 | open | cmo + seo-content-au | — |
| G12-P8 (T0275) | evaluator-traction-2026-09-10 | compliance wording, disclaimers, doctoral-research sign-off | open | clo + au-compliance | — (founder wording) |

---

## 3. Shipped Log (last 24h)

**Total commits in window:** 294 (154 substantive `feat/fix/docs`; 140 `chore(loop)` autonomous ticks). Sample below capped at 40.

### Reseller module (P10 pin-hardening — 74 substantive commits)
- Admin/reseller list + detail wire-shape pins (ticks 219–290): `commission_share_pct`, `gst_registered`, `allowed_tiers`, `monthly_credit_budget`, `monthly_sandbox_credits`, `created_at`, `updated_at`, `decision_at`, `decision_reason`, `decision_by`, `requested_by`, `linked_credit_transaction_id`, `reseller_id`, `status`, `request_type`, `payload`, `resellers(code,display_name)` embed, `progression[0]`, `masked_email`, `promo_code`, `reseller.code`.
- Loop-status observability schema pins (ticks 235–258): `human_review_minutes_7d`, `last_log`, `phase_dispatched`, `delegated_dispatch`, `auto_deploy_{triggered,skipped,finished,failed}`, `auto_commit_{started,finished,failed}`, `phase_failed`, `human_blocked_snapshot`, `cron_removal`, `goal_completed`, `frontier_computed`, `tick_start_end`, `idle`, `error`.
- Wave-3 credit-grant chain: rows 152 → 156c four-chain HTTP + DB companion (ticks 200–213).
- Wave-5 audit-log strict-equality tightening (ticks 214–217).
- Fix: split `node:crypto` out of `attribution.ts` (client bundle) — `7eca0c95`.
- Fix: remove `/admin/resellers/[slug]` route (conflicts with `[code]`) — `d19c777e`.
- Advisory: Customer-Success VI translation for Grant modal + Customer drawer — `6cf9400f`.
- P12.9 Playwright E2E for user management — `3b676853`.

### Security / compliance
- CISO D3-CISO-06 — block Stripe customer portal for wholesale-provisioned founders (`fd4a1eb3`).

### ESOP / HR
- CHRO Div 83A qualifying-tests checklist in API + knowledge base (`6213d649`).

### SVI Exchange
- T_SVI_EXC_0012 v0.5 founder-side secondary offer intake page (`bfd7a5bf`).

### Content / SEO
- Auto SEO article publish via cron (`db66d18b`).

### Docs / audit
- Real-world workflow parity audit (`442d5fba`).
- CRO Share-Mgmt remove-path finding marked resolved at tick 56 (`95d71d9c`).

### Audit remediation (iteration 5-9)
- AUD-R1 canonical 8-stage vocabulary published (`7f499264`).
- AUD-R2 12-phase ↔ 8-stage bucket map (`c4b70877`); startup-growth-phases bridged (`a1bf4542`).
- AUD-R3 + AUD-R4 data-room expanded to 60+ items with Tax + AU-Compliance sections (`b0ae8d8b`).
- AUD-R5 canonical 8-stage badges on Atlassian/Canva/Xero/SafetyCulture showcase timelines (`b9ee0b7f`); parity on founder dashboard + SCN payloads (`29c00fe1`).
- AUD-R8 Step 6 "Create first startup" onboarding wizard (`41ab0cfc`); Stripe-hosted checkout return route fix (`b176ffea`).
- AUD-R9 SCN renamed externally to "Startup Compass"; Sean Ellis/T2D3/Porter/JTBD/BVP framework overlays cited (`9e5d71e8`).

### Product / branding
- PDF branding feature-gate + settings form for Growth+/Scale/Enterprise (`26678366`); brand_settings threaded into SVI report renderer (`880df71c`).
- Showcase OG + Twitter card images for /showcase/blockid (`05d30fe2`).

### QA / infra
- `@axe-core/playwright` installed; a11y CI lens unlocked (`f9c04c7c`).

### Orchestrator
- Platform auto-upgrade 2026-07-23 (`6b81bf40`).
- Reports-snapshot before parallel-agent burst (`f61540fa`).

### Atlassian demo walkthrough (SHOWCASE-ATL — SHIPPED)
- **Status:** SHIPPED. Reference: [`docs/plans/atlassian-standard-mapping-goal.md`](./atlassian-standard-mapping-goal.md), user-facing guide [`docs/demos/atlassian.md`](../demos/atlassian.md).
- **Scope:** 9-step anonymous visitor walkthrough of Atlassian's 2002–2026 journey through every BlockID surface (landing → dashboard → SVI report → 12-phase map → 7 C-Level agents → data-room → valuation → 12-chapter guide → wrap-up); typed fixture (20 milestones / 12 phase snapshots / 13 SVI scores / 7 agent reports / 65 data-room rows / 16 valuation snapshots); walkthrough shell + provider; E2E smoke covering the 9-step visitor journey.
- **Commits (Round 1a/1b/1c/2):** fixture extraction `aa2f8808`; walkthrough shell navigation test `5fed65f8`; goal doc `72d461a4`; guide mirror page (step 8) `42bfad17`; summary mirror (step 9) + landing CTA `4bcd4c09`; E2E smoke `pending-commit`.
- **Links:** `/showcase/atlassian?step=1` (landing) · `?step=2` (dashboard) · `?step=3` (SVI report) · `?step=4` (growth-phases) · `?step=5` (agents/ceo) · `?step=6` (data-room) · `?step=7` (valuation) · `?step=8` (guide) · `?step=9` (summary).
- **Follow-ups (open in `atlassian-standard-mapping-goal.md`):** P3-P7 nudge engine wiring, data-room auto-populate from public disclosure feed, Xero/Canva/SafetyCulture parallel walkthroughs.

---

## 4. Skills → Areas Map

| Skill | Owns |
|---|---|
| `typescript-pro` | shared libs (`web/src/lib/**`), types, pure helpers (commission, cogs, hash, scope) |
| `react-expert` | workspace/dashboard/drawer components, `share-mgmt-drawer`, sidebar, radar/line charts |
| `nextjs-developer` | routes, RSC, `generateMetadata`, App-Router segments, redirects |
| `secure-code-guardian` | auth, hashing, RLS, feature-gate manifest, Stripe-portal gate, CI R-01..R-09 |
| `au-compliance` | APP 5 notice, ATO/GST wording, ESIC/AFSL/AsIC disclaimers, Div 83A |
| `test-master` | vitest suites, Playwright specs, wire-shape pin patterns |
| `database-optimizer` / `db-migrate` | Supabase migrations (0091-0097), indexes, NOTIFY pgrst reload |
| `fullstack-guardian` | end-to-end features (data-room UI ↔ API ↔ DB), console + drawer + API + DB together |
| `code-documenter` | JSDoc, SCN rename, framework-overlay citations |
| `deep-research` | showcase RESEARCH.md authoring (Airwallex, Culture Amp), competitor rows |
| `architecture-designer` | canonical taxonomy publication, 12↔8 bucket-map spec, ADRs |
| `blockchain-expert` | Anvil chainId 420, Otterscan, SVToken, equity-for-solution contracts |
| `media-studio` | pitch videos, ProductHunt assets, thumbnails |
| `investor-relations` | pitch deck slides, data-room one-pagers, GTM memos |
| `customer-success` | onboarding wizard, VI translations, welcome emails |
| `senior-pm` | portfolio health, WSJF prioritisation on this SOT |
| `qa-lead` | release readiness, go-live checklist |
| **Pairs** | `react-expert` + `au-compliance` for consent modals; `db-migrate` + `secure-code-guardian` for RLS-heavy migrations |

---

## 5. Human-blocked Queue

| Item | What's blocked | What's needed | Ping |
|---|---|---|---|
| InfoVision seed (P1.5) | Reseller module row-1 insert | Auschain's InfoVision ABN + GST status (H.20) | Founder → LegalVision AU or existing counsel |
| Stripe env vars (P8.5) | Share-Management add-on Playwright green | Mint `STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY` + `STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL` in Stripe dashboard | Founder (Stripe account owner) |
| Stripe dashboard owner email | U.1 gap — record `stripe.account_owner_email` | Confirm at `dashboard.stripe.com` (`info@` vs `admin@blockid.au`) + verify ABN + `statement_descriptor` + payout bank | Founder |
| Reseller agreement executed (D4-CLO-02) | P3 go-live formality | Sign InfoVision-Auschain deed (template `docs/legal/reseller-agreement-template.md`) | Founder + human counsel |
| Equity-for-solution (PRC-EQ) | Pricing plan Phase 3 lane | `legal_review_passed=true` flag flip on jurisdiction gate | Founder + CLO agent + human counsel |
| Audit remediation #3/#6/#7/#10 | Real-world audit ship-list | Founder sign-off on wording/tone/vocabulary | Founder |
| Founder tier labels (audit #1) | Canonical 8-stage vocab publication | Founder to approve final EN+VI labels for 8 stages | Founder |
| Stripe price `STRIPE_PRICE_FUNDING_REPORT` (G11 T0242) | A$3 Money Finder guest checkout | Mint one-off A$3.00 inc-GST price in Stripe dashboard; add env | Founder (Stripe owner) |
| Starter public label (G11 Q1, T0247) | Founder Radar packaging copy on `/pricing` | Decide "Founder Radar" rename vs "Starter + Radar badge" | Founder |
| Free-tier in-app deadline alerts (G11 Q2, T0245) | Radar sweep fan-out rules | Yes/no for A$3 buyers (in-app only, no email) | Founder |
| GA4 `hero_variant` custom dimension (G11 T0250) | Hero one-liner A/B measurement | Create dimension in GA4 property | Founder (GA4 admin) |
| `ABR_GUID` env present? (G11 T0244) | ABN lookup for `project_grant_profiles` | Confirm ABR web-services GUID in `web/.env` | Founder |
| Legal entity split (resolved 2026-09-10) | Footers/marketing vs billing/legal | **Rule (deliberate, in code comments `logo-band.tsx`, `(marketing)/page.tsx`): marketing surfaces = PPL Food PTY LTD; billing, legal disclaimers, tax invoices, consent notices, JSON-LD = Auschain PTY LTD (ACN 659 615 111 · ABN 79 659 615 111).** Founder chose PPL Food for public copy and no ABN there; tax invoices legally need the ABN, so the billing entity stays Auschain until founder + CLO decide otherwise. | Founder + CLO (only if invoices should change) |
| Stripe prices for evaluator rungs (G12 T0268) | Scout/Firm/Program self-serve checkout | **DONE 2026-09-10 13:25 UTC (founder approved):** prices already existed in Stripe live (`price_1Ttznb…` Scout, `price_1Ttznc…` Firm, `price_1Ttznd…` Program + annual) → synced into `plans.stripe_price_id` via `seed-stripe.mjs`; new one-off prices minted: Trust BizReport A$3 `price_1UE7mF…` (env `STRIPE_PRICE_TRUST_REPORT_5AUD`, id kept per D3) and Money Finder A$3 `price_1UE7mG…` (env `STRIPE_PRICE_FUNDING_REPORT`); env written to `web/.env` + `web/.env.runtime` (backups `.bak-2026-09-10-s3`), live from the S3 deploy | ✅ |
| Doctoral-research sentence (G12 D4, T0275) | Positioning claim #6 on /solutions/* and comparison page | **APPROVED by founder 2026-09-10:** "grounded in the founder's doctoral research (DBA) on startup valuation"; never "PhD" | Founder ✅ |
| Provider data-handling sentence (G12 T0275) | "confidential" claim in the ChatGPT comparison | **APPROVED by founder 2026-09-10 (data principle):** "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what." T0275 publishes it on /solutions/*, comparison page and privacy policy, and verifies each provider's policy in the free-model chain so the claim holds end-to-end. | Founder ✅ (CISO verification at T0275) |

---

## 6. Sync-back rules

When you (loop agent) ship a task, you MUST — in the same commit or the immediately-following one:

1. **Update this doc's §3 shipped-log** with the commit SHA + area.
2. **Update the specific plan file's status** (e.g. flip a `- [ ]` to `- [x]`, bump `tick:`, update `current_focus:`, close a requirement row in §2 with the ship commit).
3. **If the task maps to a public surface** (roadmap page `/roadmap`, team page `/team`, status page `/status`, stats page `/stats`, pricing page `/pricing`, showcase page `/showcase/*`) — leave a marker in §7 for the next `update-status`/`update-roadmap` agent tick to sync.
4. **If the task closes a phase (Pn → done)** — spawn the `senior-pm` skill or leave a `[MARKER: phase-close]` in §7 so the next tick reviews cross-surface impact.
5. **If the task changes pricing or SKU shape** — update `web/src/config/pricing/plans.csv` AND `docs/pricing-upgrade-plan-2026-07-16.md` AND this doc's §2 in the same commit.
6. **If the task changes a public copy string** — ship EN + VI parity in one commit (never English-only).
7. **If the task is a security fix** — add a `- [ ]` line under a new §8 that this doc auto-appends on next SOT-refresh tick.
8. **Never delete rows from §2 or §3.** Requirements move to `shipped`; shipped-log rows stay.

---

## 7. Cross-repo sync markers

Live markers for downstream update agents. Consume by grepping this section for `[MARKER: …]`.

- `[MARKER: update /roadmap when a P{n} phase closes]` — reseller P8.5, audit R1-R10 land, pricing Investor SKUs land.
- `[MARKER: update /team when a C-Level agent ships a milestone]` — CHRO Div 83A, CISO D3-CISO-06 already shipped in window.
- `[MARKER: update /status when human-blocked item unblocks]` — H.20 InfoVision ABN, STRIPE_PRICE_ADDON_* env.
- `[MARKER: update /stats when a shipped-log entry crosses a bucket boundary]` — reseller tick crosses 300, roadmap Q3 closes >80%.
- `[MARKER: update /pricing when plans.csv changes]` — Investor SKUs (Angel/Advisor/VC), Accelerator SKUs.
- `[MARKER: update /showcase when a new case ships]` — Airwallex + Culture Amp (audit #6).
- `[MARKER: update /guide when a chapter callout ships]` — audit #10, 12-chapter arc.
- `[MARKER: update-status agent should consume §3 shipped-log commit count 294 for this cycle]`.
- `[MARKER: update-roadmap agent should consume §1 Top-5 open Q3 items list].`
- `[MARKER: update /roadmap when T0238 or T0239 closes]` (G11 Wave 1) — Money Finder lanes; `feature-upgrade-roadmap-v2.md` Q4 checklist + `ROADMAP.md` §4 rows mirror SOT §2 G11-P0..P13.
- `[MARKER: update /pricing when T0268 (G12 Evaluator tab) or G11-P11 ships]` — Starter gains Founder Radar (`money_radar` flag), A$3 `FUNDING_REPORT_3AUD` SKU; also touch `docs/pricing-upgrade-plan-2026-07-16.md` (amendment note already present).
- `[MARKER: phase-close]` — G11-P0 (plan-only) closed 2026-09-10.
- `[MARKER: security-fix]` — `fd4a1eb3` (Stripe portal wholesale gate).

---

## 8. Shipped (last 30 days)

<!-- shipped:begin -->
_Auto-regenerated by `scripts/docs/regenerate-team-page.mjs` +
`scripts/docs/regenerate-changelog.mjs`. Hand edits **above** the
`<!-- shipped:begin -->` sentinel survive re-runs; anything between
the sentinels is overwritten._

**Reseller / wholesale (Phase 2.7)** — P11.40 `895969c`, P11.41 `4459a6e`, P11.42 `8c32ed6`, P11.43 `e299f24`, P11.44 `4003c39`, P11.45 `1d4da77`. Back-link: [reseller-module-plan.md](./reseller-module-plan.md).

**Compliance (Phase 2.8)** — P1n-gst-form `c832dd0`, P1n-s708-form `334b716`, P10-s708counter `0110952`, P10-s708counter-adapter `6d758a3`, P1n-esic-route `aa11769`. Back-link: [real-world-workflow-parity-audit-2026-07-23.md](./real-world-workflow-parity-audit-2026-07-23.md).

**Atlassian-goal / exit-readiness (Phase 2.9)** — P10 s708 counter adapter `6d758a3`, P11-acquisition-pattern `875e6a0`, P12a AU exits `adf61d9`, P12b investor pack `5d4af69`, P12b-cfo valuation `37613d1`, P12b-tile `/dashboard/exit-readiness` `87a1441`. Back-link: [atlassian-standard-mapping-goal.md](./atlassian-standard-mapping-goal.md).

**Real-world workflow parity (Phase 2.10)** — items 1-5, 8, 9 shipped in-window; items 6, 7, 10 remain founder-review. Back-link: [real-world-workflow-parity-audit-2026-07-23.md](./real-world-workflow-parity-audit-2026-07-23.md).

**Security** — `fd4a1eb3` (Stripe portal wholesale gate — CISO D3-CISO-06).

**Deploy manifest** — `web/.deploy-manifest.json` @ v2.0.0-beta.10 (git_sha `6d034c4b`, deployed 2026-07-24T18:21:49Z).
<!-- shipped:end -->

---

## Appendix A. Change log for this file

| When | Who | What |
|---|---|---|
| 2026-07-23 | loop agent (SOT consolidation task) | Initial consolidation. §1–§7 authored; back-links applied to reseller-plan + unicorn-masterplan; memory pointer added. |
| 2026-09-10 | CEO + Claude (pre-implementation review) | Reviewed G11+G12 against HEAD `120a840d3` and live v3.10.0: nav consolidated by `1c359f000`, DB `plans` B2B rows stale (0074 seed), csv/gate flag mismatch, A$5.50 SKU wiring, `/solutions/advisor` redirect selling Growth A$69, two privacy policies, entity name split (PPL Food vs Auschain → **PPL Food PTY LTD** decided), orchestrator ID collision at 12:00 UTC. Unified sprint plan S0–S5 with P0–P3; ledger tasks tagged `sprint`/`priority`; T0237/T0268/T0269/T0270/T0274/T0275 re-scoped; goal docs §9 appended; ROADMAP header price drift fixed. |
| 2026-09-10 | Founder | Approved G12 wording: doctoral-research sentence (DBA, never "PhD") and conservative provider data-handling sentence; §5 rows flipped to approved. Stripe evaluator prices remain to mint. |
| 2026-09-10 | CEO + Claude (plan session, 3rd pass) | G12 Evaluator Traction opened (plan-only): goal doc `evaluator-traction-2026-09-10.md` (ladder Scout/Firm/Program, A$3 per startup report, 6 differentiators + ChatGPT comparison, 90-day traction, appendices: 54 competitors, JTBD, ChatGPT evidence, AU sizing); ledger T0268–T0275; §2 rows G12-P1..P8; §5 +3 human-blocked; roadmaps + pricing plan + G11 cross-link merged. |
| 2026-09-10 | CEO + Claude (plan session, 2nd pass) | G11 execution plan approved: source/loop review findings (goal loops removed, auto-improve frozen, nextTaskId collision, version drift) → 6-wave founder-driven session model; ledger tasks T0237–T0251 added to `project-state.json`, 16 overlapping pending tasks merged, 16 duplicate IDs re-numbered (T0252–T0267), version 3.9.0→3.10.0; goal doc §8 rewritten; §2 rows carry T-ids; §5 gains 5 human-blocked rows; stale goal-loop notes fixed in `web/AGENTS.md` + `docs/ops/crontab-setup.md`. |
| 2026-09-10 | CEO + Claude (plan session) | G11 Money Finder opened (P0 shipped, plan-only): goal doc `money-finder-2026-09-10.md`, §2 rows G11-P0..P14, §7 markers; amendments recorded in G7/G9 goal docs, `feature-upgrade-roadmap-v2.md` Q4, `ROADMAP.md` §4, `pricing-upgrade-plan-2026-07-16.md`, `GOALS.md` Goal 3, `role-based-2026-07-25/founder.md` gap #8; seed data `web/content/data/grants-au.seed.json` + `programs-au.seed.json`. |
| 2026-07-23 | qa/regression sweep | Iteration 5-9 sync: G1 tick 290 → 317; G2 audit #1/2/3/4/5/8/9 flipped to shipped with commit SHAs (#6/7/10 remain founder-review-blocked); G4 Top-5 #3 PDF branding flipped to shipped; requirements register rows added for AUD-R1/2/3/4/5/8/9 + Q3-PDF-BRAND; §3 shipped-log expanded with audit-remediation, product/branding, QA/infra subsections. |

