# UX Information Architecture — Startup Flow (Machine-Readable Goal)

> **Source of truth: [SOURCE-OF-TRUTH.md](./SOURCE-OF-TRUTH.md)** — this file is a specialised view; consult the source-of-truth first for status.

```yaml
---
goal_id: ux-ia-startup-flow-v1
status: in_progress
version: 2026-07-24.1
owner: admin@blockid.au
created: 2026-07-24
loop_flag_env: UX_IA_AUTONOMOUS_LOOP
kill_switch: env UX_IA_AUTONOMOUS_LOOP=off

success_criteria:
  - Top nav has <=7 items; each item is either a phase-of-journey cluster or a global surface (Demo / Pricing / Login).
  - Every current feature is reachable within 2 clicks from any page.
  - New signup lands on a dashboard showing exactly ONE next-step tile plus a step ladder that visualises where they are in the 12-phase journey.
  - "Demo" menu item is visible in the top nav from every page (logged-in and logged-out) and links to /showcase/atlassian?step=1.
  - The step ladder HIGHLIGHTS the founder's current phase; later phases render "not yet" (dimmed + tooltip).
  - Step-by-step guide chapters remain aligned with the same 12-phase model everywhere (docs/plans lib/journey-map.ts + lib/showcase/gallery.ts:PHASE_LABELS).
  - Menu progressive-disclosure never HIDES a feature (breaking muscle memory is worse than clutter); it DIMS later-phase groups with a "unlocks at phase N" tooltip.
  - E2E test asserts (a) anonymous top-nav has a Demo link to /showcase/atlassian, (b) founder logged-in dashboard renders the journey step ladder, (c) role-specific menus (founder/investor/reseller/admin) surface the correct nav group.

file_boundary_safe_zones:
  - web/src/components/landing/nav-v2.tsx            # public marketing top-nav (MarketingShell)
  - web/src/components/marketing/marketing-footer.tsx # public marketing footer
  - web/src/components/site/navbar.tsx               # legacy public top-nav (still used on /docs, /team, /benchmarks, /onboarding)
  - web/src/components/site/footer.tsx               # legacy public footer
  - web/src/components/workspace/nav-groups.ts       # NAV_GROUPS catalogue (single source of truth for sidebar)
  - web/src/components/workspace/workspace-layout.tsx # logged-in shell (top bar + sidebar renderer)
  - web/src/components/dashboard/journey-step-ladder.tsx # NEW — 12-phase visual ladder
  - web/src/app/dashboard/page.tsx                   # mount point for the step ladder
  - docs/plans/ux-ia-startup-flow-goal.md            # THIS doc
  - docs/user/menu-walkthrough.md                    # short user-facing note
  - web/tests/e2e/nav/menu-structure.spec.ts         # NEW E2E test

file_boundary_do_not_touch:
  - web/src/lib/plans.ts                             # owned by Pricing agent 5.10
  - web/src/lib/pricing-data.ts                      # owned by Pricing agent
  - web/src/app/pricing/**                           # owned by Pricing agent
  - web/src/lib/plans/trial-copy.ts                  # owned by Trial agent 5.11
  - web/src/components/workspace/trial-banner.tsx    # owned by Trial agent
  - web/src/components/dashboard/next-step-tile.tsx  # owned by Round 5.1 - do NOT modify
  - web/src/components/dashboard/journey-bar.tsx     # keep — ladder is additive, not a replacement
  - migrations, docker configs, CI

phased_tracks:
  P0_audit:
    status: done
    tick: 1
    completed_at: 2026-07-24
    description: Current menu inventory + IA gap analysis (Section A + B of this doc)
  P1_ia_design:
    status: done
    tick: 1
    completed_at: 2026-07-24
    description: New IA proposal — <=7 top-level items, submenus grouped by startup phase (Section C)
  P2_demo_visibility:
    status: done
    description: Global DEMO nav item (NavV2, site/navbar, workspace-layout, both footers)
  P3_journey_map:
    status: done
    description: nav-groups.ts stays as-is (already phase-grouped); ADDITIVE journey-step-ladder mounted on /dashboard
  P4_step_ladder:
    status: done
    description: 12-phase visual ladder on dashboard; horizontal desktop / vertical mobile
  P5_progressive_disclosure:
    status: shipped
    description: |
      Round 5.13 polish — sidebar rows now carry a `title="Unlocks after
      Phase N: <PHASE_LABELS>"` tooltip + a lock glyph; group-header badge
      switches from "Beta" to "Locked" when ahead of currentPhase; groups
      more than +3 phases ahead collapse into a single "Later phases (X)"
      disclosure button rather than dimming each row individually.
      File: web/src/components/workspace/workspace-layout.tsx.
  P6_role_specific_menus:
    status: shipped
    description: |
      Round 5.13 — extracted role-menu-overlay helper to
      web/src/lib/nav/role-menu-overlay.ts. Returns
      { hiddenGroups, topNavExtras, sidebarOrder } per RoleKey (founder,
      investor_angel, investor_vc, advisor, accelerator, incubator,
      reseller, journalist, admin). workspace-layout consumes it: hidden
      groups drop pre-render; remaining groups sort by role priority;
      topNavExtras render alongside Demo (Reseller Console + Admin gear
      surface here now). Segment-gating in resolveGroup() still runs.
  P7_a11y_and_mobile:
    status: shipped
    description: |
      Round 5.13 — NavV2 dropdown triggers now use aria-haspopup="menu"
      (was "true") + aria-label="<group> menu"; workspace <nav> gains
      aria-label="Workspace navigation"; Later-phases collapse is a
      button with aria-expanded/aria-controls; E2E pins these contracts.
      Full audit: docs/design/menu-a11y-audit.md. Tap-vs-hover verified —
      NavV2 + ToolsDropdown already had onClick alongside onMouseEnter,
      so no data-open shim was needed.
  P8_founder_review:
    status: human_blocked
    description: Founder reviews §C new IA proposal (esp. Q1..Q4) before P9 ship-hardening
  P9_ship_hardening:
    status: proposed
    description: E2E test, docs push, SOURCE-OF-TRUTH entry, menu-walkthrough.md

open_questions:
  Q1:
    text: "How many phases should be visible as top-nav CTAs vs collapsed under a single 'My Startup' menu?"
    recommendation: "Keep 5 phase-clusters visible (My Startup, Build, Fundraise, Compliance, Resources). Anything beyond that = cognitive overload per Miller's 7±2."
    human_owner: admin@blockid.au
    blocking: false
  Q2:
    text: "Should 'Demo' always be a top-nav link, or a floating CTA (bottom-right) so it never crowds the main nav?"
    recommendation: "Top-nav link on every page. Floating CTA only on landing pages where the fold is already busy — but that requires a new component. Ship top-nav link first."
    human_owner: admin@blockid.au
    blocking: false
  Q3:
    text: "Should the dashboard step ladder show all 12 phases at once, or just current + next 2?"
    recommendation: "All 12 on desktop (horizontal rail — fits in ~1200px wide); collapsed to current + next 2 on mobile with a 'Show all' toggle."
    human_owner: admin@blockid.au
    blocking: false
  Q4:
    text: "How do we handle a returning founder who is already at phase 6 — they don't want tutorials for phase 1-5?"
    recommendation: "Completed phases render as check-marks (already implemented in journey-bar); clicking them jumps to their landing route (evidence/cap-table/etc.). Show a 'Skip to current phase' anchor when the ladder is first seen."
    human_owner: admin@blockid.au
    blocking: false

references:
  - https://www.ycombinator.com/library — YC library groups guidance by stage (Prelaunch, Launch, Growth, Fundraise)
  - https://toolkit.techstars.com/ — Techstars Toolkit indexed by "Where are you in your journey?" phase selector
  - https://500.co/education — 500 Global education tracks by pre-seed / seed / Series A
  - https://www.startmate.com/curriculum — Startmate accelerator curriculum organised by week + phase
  - https://www.antler.co/academy — Antler Academy 10-week program stepped by weekly milestone
  - https://www.atlassian.com/agile — Atlassian's phased playbooks (used as our showcase demo)
---
```

---

## §A — Current Menu Inventory (P0 audit)

### A.1 Public marketing top-nav (`web/src/components/landing/nav-v2.tsx`)

| Item     | Kind      | Children                                                                                                                                                    | Journey slot          |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Product  | dropdown  | Investor-ready score, Cap table + ESOP, Data room, Valuation, Investor pack                                                                                 | Cross-phase           |
| For      | dropdown  | Founders, Investors, Advisors, Accelerators                                                                                                                 | Audience filter       |
| Pricing  | link      | —                                                                                                                                                           | Global commerce       |
| Compare  | dropdown  | vs Cake, vs Carta, vs Foundersuite, vs Visible, vs AngelList                                                                                                | Commerce (comparison) |
| Docs     | dropdown  | Changelog, Roadmap, Status, Security audit                                                                                                                  | Global reference      |
| Sign in  | CTA       | —                                                                                                                                                           | Auth                  |
| Start free| CTA      | /onboarding                                                                                                                                                 | Conversion            |

**Total top-level: 5 links + 2 CTAs = 7.** Already ≤7 — but there is NO Demo/Case-Studies entry (major gap).

### A.2 Legacy public top-nav (`web/src/components/site/navbar.tsx`) — used on /docs, /team, /benchmarks, /onboarding, /dataset, /terms, /nps, /insights…

| Item        | Kind     | Children                                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------------------- |
| Get SVI Score | link   | —                                                                                                 |
| Free Tools  | dropdown | Idea Valuation, Equity Split, Co-founder Match, Funding Plan; Dilution, Cap Table, Term Sheet, Data Room |
| Product     | link     | /#product                                                                                         |
| Pricing     | link     | /#pricing                                                                                         |
| Benchmarks  | link     | /benchmarks                                                                                       |
| Insights    | link     | /insights                                                                                         |
| Version     | link     | /version                                                                                          |

**Total top-level: 7.** Over-flat: Benchmarks + Insights + Version could nest under "Resources".

### A.3 Logged-in sidebar (`web/src/components/workspace/nav-groups.ts:NAV_GROUPS`)

Already phase-clustered:

| Group            | Stage tag                 | minPhase | Items (count) |
| ---------------- | ------------------------- | -------- | ------------- |
| Overview         | —                         | —        | 6             |
| Build & Validate | Idea → MVP                | 0        | 5             |
| Ownership & Equity | MVP → Launch            | 2        | 10            |
| Fundraise        | Pre-seed → Series A       | 3        | 11            |
| Grow & Scale     | Revenue → Scale           | 4        | 4             |
| Investor         | Deal flow → Portfolio     | —        | 4 (segment-gated) |
| Advisor          | Clients → Insights        | —        | 3 (segment-gated) |
| Accelerator      | Cohort → LP Report        | —        | 3 (segment-gated) |
| Reseller         | Partners → Payout         | —        | 7 (feature-gated) |
| Account          | —                         | —        | 12            |

**Observation:** already well-structured, with `minPhase` dimming logic in `workspace-layout.tsx:193`. The gap is not in the sidebar — it's in the **public** surfaces (no Demo, no journey-visualisation on landing) and in **dashboard visibility** (JourneyBar shows 6 phases; the canonical model is 12).

### A.4 Footers

- `web/src/components/site/footer.tsx` — 4 columns (Product / Tools / Company / Legal). No Demo link.
- `web/src/components/marketing/marketing-footer.tsx` — similar. No Demo link.

---

## §B — Gap Analysis

1. **No global Demo entry-point.** A visitor cannot understand what the platform does without signing up. The Atlassian walkthrough (`/showcase/atlassian/*`) is buried — not linked from top-nav or footer.
2. **Two competing public navs** (NavV2 + site/navbar). Both need the Demo link, otherwise depending on which page a visitor lands on, the CTA disappears.
3. **JourneyBar (dashboard) shows 6 phases** but the canonical model (PHASE_LABELS + PHASE_TO_STAGE) is 12. The founder sees a coarser view than the analytics/reports they'll later read.
4. **Sidebar has phase-clusters but no "you are here" annotation** — a founder in phase 3 sees all groups equally weighted. Some dim (`opacity-60`) but there's no explicit "you are HERE" indicator.
5. **No cross-cutting phase ladder on the dashboard.** The founder sees `NextStepTile` (single next action) + `JourneyBar` (6-phase strip) + `GrowthProgressDashboard`, but nothing that ties them to the 12-phase journey and shows what's coming after the current next action.
6. **Nav items don't broadcast "coming up next"** — a founder can't see "when I finish Idea Validation, my next unlock is Market Research".

---

## §C — New IA Proposal

### C.1 Public top-nav (logged-out) — target structure

Keeping NavV2 as the canonical public shell (MarketingShell is what /pricing, /roadmap, /changelog, /status, /security-audit, /demo, /svi, /for/*, /legal/* already use).

```
NavV2 (target — after this goal ships):
  Product ▾            [unchanged]
  For ▾                [unchanged]
  Pricing              [unchanged]
  Demo ▾               [NEW]
    - Atlassian journey (live walkthrough)
    - Canva journey
    - Xero journey
    - SafetyCulture journey
    - All case studies
  Compare ▾            [unchanged]
  Docs ▾               [unchanged — Changelog, Roadmap, Status, Security audit]

CTAs: Sign in · Start free
```

Item count: **6 nav items + 2 CTAs.** Still ≤7. Demo is nested (case studies are 4) so the dropdown is warranted; the single most-important sub-link ("Atlassian journey") is the first row for one-click access.

### C.2 Public top-nav (legacy site/navbar) — target structure

The legacy navbar still runs on `/docs`, `/team`, `/benchmarks`, `/onboarding`, `/dataset`, `/terms`. Minimal change:

```
site/navbar:
  Get SVI Score        [unchanged]
  Free Tools ▾         [unchanged]
  Demo ▾               [NEW — same submenu as NavV2 for consistency]
  Product              [unchanged]
  Pricing              [unchanged]
  Resources ▾          [NEW — nests Benchmarks + Insights + Version]

CTA: Get your Score (or user menu when signed in)
```

Item count drops from 7 to 6 (Benchmarks + Insights + Version collapse into Resources; Demo added).

### C.3 Logged-in top-nav (WorkspaceLayout header) — target

```
WorkspaceLayout top-bar right-cluster (in addition to project switcher + user menu):
  Demo                 [NEW — always visible link to /showcase/atlassian?step=1]
  [existing: NotificationBell, CreditBadge, ProjectSwitcher, user menu]
```

The sidebar (NAV_GROUPS) stays as-is — it's already phase-grouped. What ships in P2 is: **a single "Demo" link at the top of the sidebar under Overview**, so a founder can rewatch the walkthrough at any point.

### C.4 Dashboard step ladder — new visual

```
[NextStepTile — existing]           [MetricCards — existing]
[JourneyBar — existing 6-phase]

──────────────────── NEW ─────────────────────
[Journey Step Ladder — 12 phases]
  Vision → Validate → Research → MVP → PMF → Revenue →
    Growth → Team → Funding-Ready → Fundraise → Scale → Exit
  (current phase highlighted; completed = green check;
   future = dim + "unlocks at phase N" tooltip)
──────────────────────────────────────────────

[LivingSVIDashboard — existing]     [GrowthRoadmap — existing]
[GrowthProgressDashboard — existing]
```

### C.5 Progressive-disclosure rules

| Founder phase | Sidebar behaviour                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| 0 (Idea)      | Overview + Build & Validate at full opacity. Ownership/Fundraise/Grow dimmed 60% with tooltip "unlocks at phase N". |
| 2 (MVP)       | Overview + Build + Ownership at full opacity. Fundraise still dimmed. Grow deeper dim. |
| 4 (Revenue)   | Everything at full opacity except Grow (opacity 90% — nudge but don't block).                                |
| 6+ (Fundraise-ready) | Everything at full opacity. Ladder shows late-stage phases as the next unlock.                        |

**Rule: never HIDE. Only DIM.** Breaking muscle memory is worse than clutter.

### C.6 Role-specific overlays (documented only in this iteration)

| Role             | Extra top-nav item              | Sidebar group        |
| ---------------- | ------------------------------- | -------------------- |
| founder          | (default)                       | Overview → Build → Ownership → Fundraise → Grow → Account |
| investor_angel/vc| —                               | Overview → Investor group unlocked (Deal Flow / Watchlist / Portfolio) |
| advisor          | —                               | Overview → Advisor group (Clients / Notes / Digest)      |
| accelerator      | —                               | Overview → Accelerator (Cohort / Applications / LP Report) |
| reseller         | Reseller Console link           | Overview → Reseller group (already gated by `feature: reseller.console`) |
| admin            | Admin gear                      | Overview → ADMIN_NAV_GROUP appended                       |

Segment gating already lives in `nav-groups.ts` — no new code required for the sidebar overlay; the DEMO top-bar link is added once and shows to everyone.

### C.7 Demo visibility spec

- **Placement:** every top-nav (NavV2, site/navbar, workspace-layout header).
- **Copy:** desktop: `Demo`. Mobile: `Demo: Atlassian journey`.
- **Badge:** small pill "Live" — hints it's interactive.
- **Href:** `/showcase/atlassian?step=1` (deep-links to walkthrough step 1).
- **Dismiss:** never dismissible — it's a permanent top-nav link, not a modal.
- **Footer link:** both footers get a "Case Studies" column entry linking to `/showcase`.

### C.8 Implementation task list (ordered)

1. **Add DEMO to NavV2** — insert new MenuEntry group between Pricing and Compare. `web/src/components/landing/nav-v2.tsx`, ~15 lines.
2. **Add DEMO to site/navbar** — insert into `navItems` array; collapse Benchmarks/Insights/Version under new Resources dropdown. `web/src/components/site/navbar.tsx`, ~20 lines.
3. **Add DEMO link to workspace layout top-bar** — small `<Link>` beside the user menu. `web/src/components/workspace/workspace-layout.tsx`, ~10 lines.
4. **Add Case Studies column to both footers** — `web/src/components/site/footer.tsx` + `web/src/components/marketing/marketing-footer.tsx`, ~8 lines each.
5. **Ship `journey-step-ladder.tsx`** — new component, 12 phases, horizontal desktop / vertical mobile, uses `PHASE_LABELS`. ~180 lines.
6. **Mount ladder on dashboard** — `web/src/app/dashboard/page.tsx`, insert one JSX line + import.
7. **E2E test** — `web/tests/e2e/nav/menu-structure.spec.ts`, ~120 lines.
8. **Docs** — `docs/user/menu-walkthrough.md` (short user-facing note) + `docs/plans/SOURCE-OF-TRUTH.md` entry.

---

## §D — Metrics of Success (post-ship)

- Time-to-first-action for a new signup < 30s (currently ~90s per session replays).
- % of anonymous visitors who click Demo before Pricing > 25% (target).
- Bounce on /dashboard for phase-0 founders drops from 42% → <30% within 14 days of ship (attribution via GA4 event `nav.demo_click` + `dashboard.step_ladder_view`).

## §E — Non-Goals

- No new npm dependencies.
- No visual redesign of `/pricing`, `/onboarding`, or `NextStepTile`.
- No enforcement of phase-gates (a founder in phase 0 can still click "Cap Table" — the item just visually dims). Access control stays with `useEntitlement().can()`.
- No new migration; the journey model already ships in code.
