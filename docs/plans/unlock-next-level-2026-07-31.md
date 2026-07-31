# Progressive Unlock & Chrome Parity — Goal Doc

> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](./SOURCE-OF-TRUTH.md) — consult that file first.
> **Goal ID:** G8 · **Opened:** 2026-07-31 · **Owner:** CEO (Do Van Long)
> **Continues:** [`docs/plans/ux-ia-startup-flow-goal.md`](./ux-ia-startup-flow-goal.md) (G7, P0–P9 shipped) ·
> [`docs/plans/tier-menu-2026-07-24/`](./tier-menu-2026-07-24/) · [`docs/plans/role-based-2026-07-25/`](./role-based-2026-07-25/)
> **Entity:** Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW.

Founder request (2026-07-31), verbatim intent:

1. Every sub-page must carry a topbar, bottom bar and full menu so the user can always link back to the parent project.
2. Do **not** show menus/features the account has not yet reached — research an "unlock next level" model so the menu matches what the founder has actually built, per BlockID's own framework.
3. Make the evaluation criteria explicit, expressed against the business-development dimensions.
4. Merge into the existing plan and the next implementation roadmap.

---

## 0. Decisions taken (founder, 2026-07-31)

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D1 | Unlock spine | **Growth phases 12** (`vision`…`funding`) | Matches what the DB already stores. **The advance-gate engine does not exist and must be built** — today only `completion_pct` is tracked. |
| D2 | Locked-item policy | **Hybrid** | Progress-locked ⇒ *hidden*. Tier-locked ⇒ *dimmed + upgrade chip*. Preserves upsell discovery while removing menu overload. |

Rejected alternatives are recorded for posterity: Unicorn S0–S5 (has a working `canAdvance()` but a parallel DB catalogue), canonical-8 `journey-vocabulary.ts` (prose criteria, nothing persisted).

Both remain in the codebase and keep their current jobs:
- **Unicorn S0–S5** — investor-facing trust/verification track (`business_stage_progress`, `stage_ai_runs`).
- **Canonical 8** (`idea`…`public_exit`) — display vocabulary for investors and exports.
- **Growth 12** — **the unlock spine** (this goal).

---

## 1. Audit findings

### 1a. Chrome gaps — pages with no shell

The root layout renders **no chrome at all** ([`web/src/app/layout.tsx:96-172`](../../web/src/app/layout.tsx#L96-L172) — providers, analytics, JSON-LD only). Every page imports its own shell, so a topbar is opt-in per file. Six competing shells exist: `MarketingShell`, `WorkspaceLayout`, `AdminLayout`, ad-hoc `Navbar`+`Footer`, plus bespoke headers under `/reseller` and `/innovator`.

| Area | Bare pages | Evidence |
|---|---|---|
| `/reseller/*` | **13 / 13** | [`reseller/layout.tsx:11`](../../web/src/app/reseller/layout.tsx#L11) — TODO says "P4 hardening will replace this with the reused WorkspaceLayout"; never done. Renders an `<h1>` only. |
| `/showcase/*` | **15** | Public demo funnel. The 9 `/showcase/atlassian/*` pages get the stepper **only when `?step=N` is present** — [`atlassian-walkthrough-provider.tsx:42`](../../web/src/components/showcase/atlassian-walkthrough-provider.tsx#L42) bails to bare children otherwise. |
| `/admin/*` | **24 / 36** | Two-thirds bypass `AdminLayout`. `/admin/listings` wrongly uses the *public* Navbar. |
| `/compliance/*` | **7 / 7** | Linked *from* the workspace sidebar ([`nav-groups.ts:342`](../../web/src/components/workspace/nav-groups.ts#L342)) — user clicks and loses the sidebar. |
| `/workspace/*` orphans | **8** | Incl. 5 sidebar-linked stubs (`applications`, `sso`, `team`, `weekly-digest`, `white-label`). |
| Marketing / public | **7** | `signup`, `version`, `verify/[proofId]`, `legal-templates`(×2), `docs/design-system`, `invites/[token]`. |
| `/startup-package/*` children | **2** | Parent has `MarketingShell`; `interview` and `[projectId]` do not. |
| `/innovator/*` | **4** | 4-pill nav only, no topbar/footer. |

Plus: **no footer exists in `WorkspaceLayout` or `AdminLayout`** — ~107 pages have no bottom bar at all. `/s/[slug]` has a Footer but no Navbar.

### 1b. The unlock machinery is built but not wired

[`nav-groups.ts:79-196`](../../web/src/components/workspace/nav-groups.ts#L79-L196) already declares `minPhase`, `minPlan`, `minTier`, `growthPhase`, `segments`, `persona`, `journeyGroup`, `hideWhenLocked`.

The live renderer [`workspace-layout.tsx:141-168`](../../web/src/components/workspace/workspace-layout.tsx#L141-L168) **ignores `persona`, `journeyGroup` and `hideWhenLocked`**, and renders `minPhase` groups *dimmed with a "Locked" pill* rather than hiding them — the exact overload the founder asked to remove.

Written, tested, and imported by **nothing**:
- [`filter-nav-for-user.ts:94`](../../web/src/lib/nav/filter-nav-for-user.ts#L94) — `filterNavForUser()`; phase check at `:65`, group `minPhase` at `:101`.
- [`hide-when-locked.ts:47,62`](../../web/src/lib/nav/hide-when-locked.ts#L47) — `decideVisibility()` returning `"show" | "show_dimmed" | "hide"`. **This is already exactly decision D2.**
- `nav/persona-rail.tsx`, `nav/journey-sidebar.tsx`, `workspace/nested-sidebar.tsx`, `nav/tier-gate.tsx`, `nav/upgrade-chip.tsx`.

So a large share of this goal is **finishing abandoned wiring**, not greenfield work.

### 1c. ⚠ Blocking defect — the two 12-phase taxonomies are silently conflated

There are **two different 12-phase models** with different phase-N semantics:

| N | String id — [`startup-growth-phases.ts:44`](../../web/src/lib/startup-growth-phases.ts#L44) | Numeric — [`showcase/gallery.ts:23`](../../web/src/lib/showcase/gallery.ts#L23) |
|---|---|---|
| 3 | `revenue_model` | Market Research |
| 6 | `legal_equity` | Revenue / Business Model |
| 9 | `investor_review` | Funding-Ready |

`startup_phase_progress.phase_id` stores the **string** ids. But `PHASE_CRITERION_SUBSET` ([`readiness-by-phase.ts:59`](../../web/src/lib/nudge/readiness-by-phase.ts#L59)) and `COMPLIANCE_PHASE_GATES` ([`next-steps.ts:289`](../../web/src/lib/nudge/next-steps.ts#L289)) key off the **numeric** `PhaseKey 1-12`.

[`next-steps.ts:426`](../../web/src/lib/nudge/next-steps.ts#L426) bridges them with `indexOfGrowthPhase(id) + 1` — i.e. it treats the string ordinal as the numeric key. **This is wrong**: a founder at `legal_equity` (string #6) is scored against "Revenue / Business Model" criteria (numeric #6).

**P0 below fixes this first.** Building unlock gates on top of the current bridge would mis-fire every gate.

---

## 2. Evaluation criteria per business dimension

This is the "làm rõ các tiêu chí đánh giá" deliverable. Three existing layers are joined into one gate.

### 2a. Layer 1 — the 13 evaluation criteria (evidence)
[`web/src/lib/evaluation-criteria.ts:66`](../../web/src/lib/evaluation-criteria.ts#L66). Weights sum to 100. Quality ladder: `incomplete → basic → good → strong → exceptional`.

| Criterion | Weight | Primary dimension |
|---|---|---|
| `market` | 12 | mpc |
| `idea` | 10 | mpc |
| `customer_size` | 10 | tre |
| `revenue` | 10 | tre |
| `founder_profile` | 8 | ftv |
| `team` | 8 | ftv |
| `gtm_strategy` | 8 | tre |
| `documents` | 7 | iri |
| `code_git` | 6 | ptd |
| `roadmap` | 6 | ptd |
| `website` | 5 | ptd |
| `dataroom` | 5 | iri |
| `team_structure` | 5 | cgh |

### 2b. Layer 2 — the 8 SVI business dimensions (scoring engine)
[`web/src/lib/svi-analysis.ts:1195-1275`](../../web/src/lib/svi-analysis.ts#L1195-L1275): `ftv` Founder & Team · `mpc` Market & Problem · `ptd` Product & Technical · `tre` Traction & Revenue · `cgh` Cap Table & Governance · `iri` Investor Readiness · `lco` Legal & Compliance · `svm` valuation multiplier.

### 2c. Layer 3 — phase exit gates (**new**)

Each phase advances only when *all three* hold: required criteria at ≥ `good`, dimension floors met, and phase deliverables complete.

| # | Phase (`GrowthPhaseId`) | Required criteria (≥ good) | Dimension floor | Unlocks on exit |
|---|---|---|---|---|
| 1 | `vision` | `idea`, `founder_profile` | mpc ≥ 40 | Validate group, SVI re-score |
| 2 | `customer_dev` | `market`, `customer_size` | mpc ≥ 55 | Benchmarks, competitor analysis |
| 3 | `revenue_model` | `revenue`, `gtm_strategy` | tre ≥ 40 | Valuation tools |
| 4 | `pitch` | `documents`, `website` | iri ≥ 45 | Pitch builder, shareable score links |
| 5 | `mentor_review` | `roadmap` + mentor sign-off | — | Mentor console, advisor requests |
| 6 | `legal_equity` | `team_structure`, `documents` | cgh ≥ 50, lco ≥ 45 | **Cap Table, ESOP, Equity** |
| 7 | `go_to_market` | `gtm_strategy`, `customer_size` | tre ≥ 55 | Growth analytics, GA4 · **GST** |
| 8 | `product_dev` | `code_git`, `website` | ptd ≥ 55 | Tech DD, SBOM/licence inventory · **R&D** |
| 9 | `investor_review` | `dataroom`, `documents` | iri ≥ 65 | **Data Room, investor access log** · **ESIC, s708** |
| 10 | `team` | `team`, `team_structure` | ftv ≥ 60 | ESOP admin, vesting schedules |
| 11 | `growth` | `revenue`, `customer_size` | tre ≥ 70 | Listings / SVI index, tokenisation preview |
| 12 | `funding` | all 13 ≥ good | iri ≥ 75, cgh ≥ 65 | **Tokenisation, dividend, exit, marketplace** |

**Compliance gates re-mapped by intent, not ordinal.** Current numeric `COMPLIANCE_PHASE_GATES = { rd: 5, gst: 6, esic: 9, s708: 9 }` must become:

```ts
const COMPLIANCE_PHASE_GATES: Record<string, GrowthPhaseId> = {
  rd:    "product_dev",       // R&D incentive needs real dev spend
  gst:   "go_to_market",      // registration bites at A$75k turnover
  esic:  "investor_review",   // ESIC test runs at raise time
  s708:  "investor_review",   // sophisticated-investor certificates
};
```

Translating by ordinal instead would have put R&D at `mentor_review` and GST at `legal_equity` — both wrong.

---

## 3. Phased implementation

### P0 — Taxonomy unification *(blocking prerequisite)* — ✅ **shipped**
- ✅ New `web/src/lib/growth/phase-taxonomy.ts` — canonical `GrowthPhaseId` keys, `GROWTH_PHASE_ORDER`, `GROWTH_PHASE_LABELS` (EN+VI), `isGrowthPhaseId()`, `orderToGrowthPhase()`, `nextGrowthPhase()`, `growthPhaseAtLeast()`.
- ✅ `PHASE_CRITERION_SUBSET` re-keyed to `GrowthPhaseId` per §2c.
- ✅ `COMPLIANCE_PHASE_GATES` re-keyed by intent: `rd→product_dev`, `gst→go_to_market`, `esic→investor_review`, `s708→investor_review`.
- ✅ `indexOfGrowthPhase(id) + 1` bridge deleted. `detectCurrentPhase` now prefers a recognisable `phase_id` and reconstructs from `phase_order` only as a fallback, so the emitted (id, order) pair is always self-consistent even on legacy rows.
- ✅ Phase labels now come from `GROWTH_PHASE_LABELS`, not `showcase/gallery.ts PHASE_LABELS` — `legal_equity` no longer renders as "Revenue / Business Model".
- ✅ Crossing into the numeric taxonomy goes through `GROWTH_PHASE_TO_TEMPLATE_PHASE`, and a test asserts that bridge is only valid where `PHASE_TO_STAGE` and `GROWTH_PHASE_TO_STAGE` agree — a future re-order now fails loudly.
- ✅ **Wire-format change:** `NudgeResult.current_phase.slug` and every `readiness_by_phase` key are now growth-phase ids (`"vision"`…`"funding"`) instead of `"1"`…`"12"`. Founder-facing copy still renders the ordinal via `growthPhaseOrder()`. Pre-G8 `svi_readiness_snapshots` rows carry numeric keys and gap-fill to `score=0` rather than erroring.
- ✅ Tests: 13 new in `phase-taxonomy.test.ts`; 287 green across `growth/`, `nudge/`, `email/`, `dashboard/`.
- Owner: `typescript-pro` + `architecture-designer`.

### P1 — Phase gate engine *(new)*
- New `web/src/lib/growth/phase-gate.ts`, mirroring the shape of `computeStageProgress()` in [`unicorn/framework.ts:196`](../../web/src/lib/unicorn/framework.ts#L196) so both engines stay comparable:

```ts
export type PhaseBlockerCode =
  | "criteria_below_threshold"
  | "missing_required_criteria"
  | "deliverables_incomplete"
  | "dimension_below_floor"
  | "compliance_unmet";

export interface PhaseGateResult {
  currentPhase: GrowthPhaseId;
  nextPhase: GrowthPhaseId | null;
  completionPct: number;
  canAdvance: boolean;
  blockers: PhaseBlocker[];
  unlockedFeatures: Feature[];
}
```

- Pure module: no I/O, no network. Inputs = `evaluation_criteria` rows + SVI dimension scores + `startup_phase_progress`.
- **Test:** one case per blocker code, plus a full 12-phase walk.
- Owner: `typescript-pro` + `test-master`.

### P2 — Persist unlock state
- Migration `0300_growth_phase_gates.sql`: add `unlocked_features text[]`, `gate_evaluated_at timestamptz`, `blockers jsonb` to `startup_phase_progress`.
- Nightly cron re-evaluates gates (model on `api/cron/unicorn-nightly-progress`).
- Apply via `docker exec psql` + `NOTIFY pgrst reload` per [`reference_db_migrations`](../../.claude/projects/-home-dovanlong-blockid-au/memory/reference_db_migrations.md) — **not** auto-applied on deploy.
- Owner: `db-migrate` + `database-optimizer`.

### P3 — Wire hybrid nav filtering *(the visible win)*
- Wire `filterNavForUser()` + `decideVisibility()` into `resolveGroup()` / `renderNavGroup()`.
- Hybrid policy per D2:
  - `growthPhase` / `minPhase` unmet ⇒ **hide** (`hide`)
  - `minPlan` / `minTier` / `feature` unmet ⇒ **dim + UpgradeChip** (`show_dimmed`)
- Honour the already-declared-but-ignored `persona`, `journeyGroup`, `hideWhenLocked` fields.
- **Expected effect** at `vision` phase, Founder tier: sidebar drops from 7 groups to ~3 + 1 upgrade teaser.
- **Test:** extend `web/tests/e2e/nav/menu-structure.spec.ts` with a phase×tier matrix.
- Owner: `react-expert` + `nextjs-developer`.

### P4 — "Next unlock" surface
- Dashboard card + sidebar footer: current phase, `completionPct`, top-3 blockers, single next action.
- Reuse `computeNextSteps()` ([`nudge/next-steps.ts:225`](../../web/src/lib/nudge/next-steps.ts#L225)) rather than a second recommender.
- Owner: `cpo` + `ui-ux-pro-max`.

### P5 — Chrome parity: shell decision matrix
- Document one rule: which shell each route group gets.

| Route group | Shell |
|---|---|
| `/`, marketing, `/showcase/*`, `/legal-templates/*`, `/startup-package/*` | `MarketingShell` |
| `/dashboard/*`, `/workspace/*`, `/compliance/*`, `/reseller/*`, `/innovator/*` | `WorkspaceLayout` |
| `/admin/*` | `AdminLayout` |
| `/auth/*`, `/invites/[token]`, `/verify/[proofId]` | minimal shell w/ logo + footer |

- Add a footer to `WorkspaceLayout` and `AdminLayout` (currently ~107 pages with no bottom bar).
- Convert via route-group `layout.tsx` files so pages stop importing shells individually.
- Owner: `nextjs-developer` + `ui-ux-pro-max`.

### P6 — Chrome backfill (by blast radius)
1. `/reseller/*` — 13 pages → `WorkspaceLayout` (closes the `layout.tsx:11` TODO).
2. `/showcase/*` — 15 pages → `MarketingShell` (public funnel; restores path back to Pricing/Signup).
3. `/compliance/*` — 7 pages → `WorkspaceLayout`.
4. `/admin/*` — 24 pages → `AdminLayout`; fix `/admin/listings` using the public Navbar.
5. `/workspace/*` orphans — 8 pages; the 5 stubs either get built or get delisted from `nav-groups.ts`.
6. Marketing strays — 7 pages.
- Owner: `nextjs-developer` + `react-expert`.

### P7 — Regression guard
- CI test asserting every `page.tsx` under a gated route group resolves to a shell (walk the route tree, assert an ancestor `layout.tsx` or a shell import).
- This is what would have prevented the current 70-page drift.
- Owner: `test-master`.

### P8 — Docs & founder walkthrough
- Refresh [`docs/user/menu-walkthrough.md`](../user/menu-walkthrough.md) with the phase×tier visibility matrix.
- Publish the §2c criteria table founder-facing so unlocks are predictable, not mysterious.
- Owner: `code-documenter` + `cpo`.

---

## 4. Sequencing

```
P0 taxonomy ──▶ P1 gate engine ──▶ P2 persist ──▶ P3 nav wiring ──▶ P4 next-unlock card
                                                        │
P5 shell matrix ──▶ P6 backfill ──▶ P7 CI guard ────────┴──▶ P8 docs
```

P0→P4 and P5→P7 are independent and can run in parallel. **P0 blocks everything on the unlock lane** — do not start P1 before it lands.

---

## 5. Requirements register rows (for SOURCE-OF-TRUTH §2)

| ID | Category | Status | Owner (skill) |
|---|---|---|---|
| G8-P0 | taxonomy | open | typescript-pro |
| G8-P1 | gate-engine | open | typescript-pro |
| G8-P2 | data-model | open | db-migrate |
| G8-P3 | nav-hybrid | open | react-expert |
| G8-P4 | next-unlock UI | open | cpo |
| G8-P5 | shell-matrix | open | nextjs-developer |
| G8-P6 | chrome-backfill | open | nextjs-developer |
| G8-P7 | CI-guard | open | test-master |
| G8-P8 | docs | open | code-documenter |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Hiding nav items breaks deep links users already hold | Route-level entitlement check stays authoritative; hidden ≠ unreachable. A hidden-but-permitted route still renders. |
| Founders feel *demoted* when the menu shrinks | P4 "next unlock" card frames it as progress, not loss. Never shrink below the 3 core groups. |
| Phase gates too strict ⇒ founders stall | Gates are advisory in v1: `canAdvance=false` blocks the *badge*, not manual phase override. Revisit after 30 days of `stage_ai_runs`-style telemetry. |
| P0 re-keying breaks live nudge output | Snapshot test pins all 12+4 mappings before the change; compare before/after on 10 real projects. |
| Chrome backfill = ~70 file touches | Sequence by blast radius (P6 order); route-group `layout.tsx` means most pages lose imports rather than gain them. |

---

## 7. Open questions (founder)

- **Q1** Should phase advance ever be **manual override**, or strictly gate-driven? (Recommend: manual override allowed, flagged `self_declared` and excluded from investor-facing trust score.)
- **Q2** Should the reseller/mentor console show the *founder's* phase gates or its own? (Recommend: founder's, read-only.)
- **Q3** Do the 5 workspace stubs (`applications`, `sso`, `team`, `weekly-digest`, `white-label`) get built or delisted?
