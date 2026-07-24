# CMO — Menu / IA Restructure (Progressive-Disclosure Rebuild)

> Owner: CMO agent · Date: 2026-07-24 · Scope: logged-in `WorkspaceLayout`
> Companion of: `docs/plans/ux-ia-startup-flow-goal.md` (§C).
> Complaint driving this work: *"Quá nhiều tính năng — người dùng bị rối.
> Chỉ khi nào cần tính năng nào thì mới dẫn ra chức năng đó. Đề xuất next
> step và có gợi ý cụ thể."*

## 1. Diagnosis

The current sidebar renders **10 groups × avg 6 items ≈ 60 rows** always
visible. Phase-dimming (§C.5 of ux-ia-startup-flow-goal.md) reduces opacity
but does **not** reduce visual noise — a phase-0 founder still scrolls past
Cap Table, ESOP, Dividends, Exit, Investor, Advisor, Accelerator, Reseller.
Hick's Law: choice count drives decision latency; progressive disclosure by
*journey phase* is the standard fix (YC, Techstars, Startmate, Antler all do
this). We already have the plumbing (`minPhase`, `PHASE_LABELS`, the P5
"Later phases" collapse) — the work is to **flip the default** from
"everything visible, dim later phases" to "current phase expanded, others
collapsed under one-tap headers, and ONE explicit recommended next step at
the top".

## 2. Design principles

1. **One next step, one click.** A `RecommendedNextStepTile` pinned above
   the nav resolves the founder's single most-relevant feature from
   `/api/nudge/next-steps` (already shipped) and links directly to it with a
   reason ("Because you're at Phase 2: MVP — publish your first Evidence
   Vault entry"). This *replaces* nav-scanning as the default action.
2. **Five pillars, not ten groups.** Collapse the current 10 groups into 5
   fixed pillars driven by *journey role*, not feature taxonomy:
   - **Overview** — always expanded (My Startups, Portfolio, SVI, Action Plan).
   - **Now** — the single phase-cluster matching `currentPhase` (auto-expanded).
   - **Coming up** — the next 1–2 phase-clusters (collapsed, `Lock` glyph).
   - **Later phases** — everything else, single-line disclosure (existing P5).
   - **Account** — always at the bottom, collapsed by default.
3. **Role clusters (Investor / Advisor / Accelerator / Reseller) collapse
   into a single "My workspace" pill** when the account only has one role.
   When the user is dual-role, we render one expandable header per role
   instead of stacking them.
4. **Never hide — only collapse.** Muscle memory > cleanliness. Every
   feature stays reachable within 2 clicks (open pillar → open item).
5. **Persistence.** Per-user sidebar collapse state stored in `localStorage`
   (`blockid_nav_collapse_v1`) so power users lock the shape they want.

## 3. Target sidebar (founder, Phase 2 example)

```
┌──────────────────────────────────────────┐
│ [Logo]                                 ‹ │
├──────────────────────────────────────────┤
│ ✨ Recommended next step                 │  ← NEW tile (top)
│   Publish your first Evidence Vault      │
│   Because you're at Phase 2 (MVP).       │
│   [ Open Evidence Vault →           ]    │
├──────────────────────────────────────────┤
│ OVERVIEW                                 │  ← always expanded
│   My Startups · SVI Score · Action Plan  │
│                                          │
│ ▼ NOW · MVP → Launch                     │  ← auto-expanded (matches phase)
│   Evaluation · Evidence · Metrics …      │
│                                          │
│ ▸ COMING UP · Pre-seed → Series A  🔒    │  ← collapsed by default
│                                          │
│ ▸ Later phases (18)               🔒     │  ← existing P5 disclosure
│                                          │
│ ▸ Account                                │  ← collapsed by default
├──────────────────────────────────────────┤
│ [Credit badge] · Back to Home            │
└──────────────────────────────────────────┘
```

Investor / Advisor / Accelerator / Reseller groups replace **Now** for
non-founder segments — driven entirely by `role-menu-overlay.ts`.

## 4. Files touched

- `web/src/components/workspace/nav-groups.ts` — add `defaultCollapsed?: boolean` + `pillar` field.
- `web/src/components/workspace/workspace-layout.tsx` — mount tile,
  per-group collapse toggle, per-user persistence.
- `web/src/lib/nav/role-menu-overlay.ts` — rewrite `sidebarOrder` to the
  5-pillar model; introduce `defaultCollapsedGroups`.
- **NEW** `web/src/lib/nav/next-step-recommender.ts` — pure phase→feature
  map + fallback when `/api/nudge/next-steps` is unavailable.
- **NEW** `web/src/components/workspace/recommended-next-step-tile.tsx` —
  client tile; fetches nudge; falls back to `recommendNextStep(phase)`.
- **NEW** `web/src/lib/nav/nav-collapse-store.ts` — tiny
  `useSyncExternalStore` wrapper over `localStorage` for collapse state.
- **NEW** `web/tests/unit/next-step-recommender.test.ts` — asserts phase-→-href map.
- **NEW** `web/tests/e2e/nav/menu-progressive-disclosure.spec.ts` — asserts
  a phase-0 founder sees ≤5 headers with only Overview + Now expanded.

## 5. Acceptance criteria

- A first-time founder (phase 0, free plan) sees **≤5 pillar headers**
  above the fold and exactly **2 expanded** (Overview + Now).
- The `RecommendedNextStepTile` renders at the top of the sidebar on every
  workspace route and links to the same href returned by
  `/api/nudge/next-steps` when available.
- Toggling a pillar header persists across page loads via `localStorage`.
- Every previously-reachable NavItem is still reachable within 2 clicks.
- E2E: `menu-progressive-disclosure.spec.ts` passes on 3 fixtures (founder-p0,
  founder-p6, investor_angel).
- No regressions to segment-gating (`Investor` group still hides for
  founders; feature-gated `Reseller` still hides without `reseller.console`).

## 6. Risks

- **Muscle memory.** Users who know exact positions of items lose them
  once collapsed. Mitigation: initial banner "New: collapsed by default —
  click Later phases to see everything" + `localStorage` remembers per-user
  expansion.
- **Recommender wrong.** If `/api/nudge/next-steps` misroutes the tile,
  founders click a dead-end. Mitigation: fallback map in
  `next-step-recommender.ts` keyed on `PHASE_LABELS` so the tile always
  renders *something* sane; add `data-testid="rec-next-step"` for QA.
- **Discoverability regression** — features locked behind an extra click.
  Mitigation: command-palette (Cmd-K) shortcut lists every NavItem flat
  (out of scope for this ticket; tracked separately).
- **Role overlap.** Dual-role users (founder + advisor) previously saw both
  groups stacked; now they collapse under separate pillar headers. Confirm
  with sample dual-role account before ship.
