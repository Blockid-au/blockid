# BlockID.au — SOURCE OF TRUTH

> **Version:** 2026-07-23 (rev.317) · **Owner:** CEO (Do Van Long) · **Consumer:** founders, human team, autonomous loop agents.
> **Rule:** Consult this file BEFORE any specialised plan doc. Every specialised plan carries a top-of-file back-link to this one.
> **Entity:** Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW.

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
- **Status:** Q3 2026 in-flight (partially shipped; 21 sections).
- **Top-5 open Q3 items:**
  1. Enterprise tier + team features ($499/mo) — `cro` + `cto`.
  2. Accelerator partnership pricing ($20K/year per cohort) — `cro` + `cmo`.
  3. PDF branding customisation for paid plans — **shipped** (feature-gate + settings form `26678366`; renderer wire `880df71c`).
  4. Dashboard personalisation (pin/reorder widgets) — `react-expert`.
  5. ProductHunt launch campaign — `cmo` + `media-studio`.
- **Next action:** CRO agent to spec Enterprise tier SKU + pricing.csv entry.
- **Blocker:** none.

### G5 — Pricing upgrade v2
- **Source:** [`docs/pricing-upgrade-plan-2026-07-16.md`](../pricing-upgrade-plan-2026-07-16.md)
- **Status:** Phase-3 (impl) partially shipped; 12-SKU tier matrix defined.
- **Top-3 open lanes:**
  1. Investor/Advisor per-seat SKUs (Angel A$79, Advisor A$149, VC Small A$349, VC Enterprise custom) — `cro` + `typescript-pro`.
  2. Accelerator cohort SKUs (A$500 / A$1,500 / A$3,500 tiers) — `cro` + `nextjs-developer`.
  3. Equity-for-solution workflow (compliance-gated) — `clo` + `au-compliance` + `blockchain-expert`.
- **Next action:** ship investor-side per-seat SKUs (largest ARR wedge, no legal gate).
- **Blocker:** #3 legal-review gate `legal_review_passed=true`.

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
- **Status:** P0–P7 + P9 all shipped. Only P8 (founder review of Q1–Q4) remains and is `human_blocked` — no code lane is gated on it (all four open questions are `blocking: false`).
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
- **Status:** P0–P8 all `open`. Audit complete, no code shipped yet.
- **Audit findings (ranked):**
  1. **⚠ Blocking defect** — two different 12-phase taxonomies are silently conflated. `startup_phase_progress.phase_id` stores string ids; `PHASE_CRITERION_SUBSET` + `COMPLIANCE_PHASE_GATES` key off numeric `PhaseKey 1-12` with **different phase-N semantics** (string #6 = `legal_equity`, numeric #6 = Revenue/Business Model). `web/src/lib/nudge/next-steps.ts:426` bridges via `indexOfGrowthPhase(id)+1` — mis-scores every founder. **P0 fixes this before any gate work.**
  2. **No advance-gate exists for the 12-phase model** — only `completion_pct`. The engine must be built (P1); Unicorn S0–S5 has one (`computeStageProgress()`), Growth-12 does not.
  3. **~70 pages render with no shell** — `/reseller/*` 13/13, `/showcase/*` 15, `/admin/*` 24/36, `/compliance/*` 7/7, `/workspace/*` orphans 8, marketing strays 7. Root layout renders no chrome (`web/src/app/layout.tsx:96-172`); shells are opt-in per file.
  4. **No footer in `WorkspaceLayout` or `AdminLayout`** — ~107 pages have no bottom bar.
  5. **Unlock machinery built but imported by nothing** — `web/src/lib/nav/filter-nav-for-user.ts:94` and `web/src/lib/nav/hide-when-locked.ts:47` already implement decision D2 exactly; the live renderer `workspace-layout.tsx:141-168` ignores `persona`, `journeyGroup`, `hideWhenLocked` and dims `minPhase` groups instead of hiding them.
  6. `web/src/app/reseller/layout.tsx:11` carries a "P4 hardening will replace this with the reused WorkspaceLayout" TODO that was never executed.
- **Evaluation criteria (§2c of goal doc):** 12 phase exit gates, each requiring named criteria at ≥ `good` (from the 13 in `web/src/lib/evaluation-criteria.ts:66`, weights = 100) **plus** an SVI dimension floor (from the 8 in `web/src/lib/svi-analysis.ts:1195-1275`). Compliance gates re-mapped by intent: `rd→product_dev`, `gst→go_to_market`, `esic→investor_review`, `s708→investor_review`.
- **Next action:** P0 taxonomy unification (`typescript-pro` + `architecture-designer`) — blocks the whole unlock lane. P5 shell matrix can start in parallel.
- **Blocker:** none for P0/P5. Q1–Q3 in the goal doc are founder-review only and non-blocking.

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
| G8-P0 | unlock-next-level-2026-07-31 | taxonomy | open | typescript-pro | — (blocks G8-P1..P4) |
| G8-P1 | unlock-next-level-2026-07-31 | gate-engine | open | typescript-pro | — |
| G8-P2 | unlock-next-level-2026-07-31 | data-model | open | db-migrate | — (migration 0300) |
| G8-P3 | unlock-next-level-2026-07-31 | nav-hybrid | open | react-expert | — |
| G8-P4 | unlock-next-level-2026-07-31 | next-unlock UI | open | cpo | — |
| G8-P5 | unlock-next-level-2026-07-31 | shell-matrix | open | nextjs-developer | — |
| G8-P6 | unlock-next-level-2026-07-31 | chrome-backfill | open | nextjs-developer | — (~70 pages) |
| G8-P7 | unlock-next-level-2026-07-31 | CI-guard | open | test-master | — |
| G8-P8 | unlock-next-level-2026-07-31 | docs | open | code-documenter | — |
| DR-SBOM-01 | dataroom license-risk review | licence-classifier | shipped | typescript-pro | `563a3124` |

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
- `[MARKER: phase-close]` — none this tick.
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
| 2026-07-23 | qa/regression sweep | Iteration 5-9 sync: G1 tick 290 → 317; G2 audit #1/2/3/4/5/8/9 flipped to shipped with commit SHAs (#6/7/10 remain founder-review-blocked); G4 Top-5 #3 PDF branding flipped to shipped; requirements register rows added for AUD-R1/2/3/4/5/8/9 + Q3-PDF-BRAND; §3 shipped-log expanded with audit-remediation, product/branding, QA/infra subsections. |

