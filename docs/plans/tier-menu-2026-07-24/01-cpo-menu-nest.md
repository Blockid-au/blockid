# CPO Plan — Nested Workflow-Step Sidebar

Date: 2026-07-24
Owner: CPO agent (tier-menu wave)
Scope: `web/src/components/workspace/nav-groups.ts`, new nav-schema, new nested-sidebar component.

## 1. Top-Level Groups (7)

Ordered by startup workflow. Every leaf lists `requiredFeature` (must match `web/src/lib/feature-gates.manifest.ts` when a gate exists), `minTier` (PlanTier from `web/src/lib/segments.ts`), and `growthPhase` (0–5, maps to `startup-growth-phases.ts`).

| # | Group             | Pillar     | Phase span | Notes |
|---|-------------------|------------|-----------|-------|
| 1 | Home              | overview   | 0–5       | Always visible. No subgroups. |
| 2 | Validate          | now        | 0–1       | Ideate + Validate merged. |
| 3 | Build             | now        | 2         | Ownership & Equity. |
| 4 | Fundraise         | now        | 3         | |
| 5 | Scale & Exit      | now        | 4–5       | Grow + Exit merged. |
| 6 | Roles             | role       | –         | Investor/Advisor/Accelerator/Reseller/Mentor as subgroups; only matching segment renders. |
| 7 | Account           | account    | –         | Utility. |

## 2. Subgroup Tree (submenu-of-submenu)

### 2. Validate  (min phase 0)
- **Discover** (phase 0)
  - Market Size — `/dashboard/market-size` — feature `market_size`, minTier `starter`, phase 0
  - Knowledge Base — `/workspace/knowledge-base` — minTier `starter`, phase 0
- **Evaluate** (phase 1)
  - Evaluation (13) — `/workspace/evaluation` — feature `svi.run`, minTier `starter`, phase 1
  - Evidence Vault — `/workspace/evidence` — feature `evidence.upload`, minTier `starter`, phase 1
  - Metrics — `/workspace/metrics` — minTier `growth`, phase 1
- **Track** (phase 0)
  - Weekly Reports — `/workspace/reports` — minTier `free`, phase 0

### 3. Build  (min phase 2)
- **Equity Setup** (phase 2)
  - Equity Setup — `/workspace/equity-setup` — minTier `starter`, addOn `share_management`
  - Equity Split — `/workspace/equity`
  - Cap Table — `/workspace/cap-table` — feature `cap_table.write`
- **People** (phase 2)
  - Shareholders — `/workspace/shareholders`
  - ESOP Setup — `/workspace/esop`
  - Vesting — `/workspace/vesting`
  - ESOP Manage — `/workspace/equity-esop` — minTier `growth`
- **Blockchain** (phase 2)
  - Wallet — `/workspace/wallet` — minTier `scale`
  - Blockchain Sync — `/workspace/equity-dashboard` — feature `blockchain.sync`, minTier `scale`
  - Equity Offer — `/workspace/equity-offer` — feature `equity_offer.request`, minTier `scale`

### 4. Fundraise  (min phase 3)
- **Valuation & Finance**
  - VC Valuation — `/dashboard/valuation` — minTier `starter`, phase 3
  - CFO Advisor — `/dashboard/cfo`
  - Finance P&L — `/dashboard/finance` — lifecycle beta
  - Fundraise Readiness — `/dashboard/fundraise`
- **Data Room**
  - Data Room — `/workspace/data-room` — feature `data_room.access`, minTier `growth`
  - Documents — `/workspace/documents`
  - ESIC Self-Assessment — `/workspace/esic-assessment`
- **Accelerators**
  - Accelerator Tracker — `/dashboard/accelerator` — minTier `growth`, lifecycle beta
  - Accelerator Criteria — `/dashboard/accelerator-criteria`
- **Raise**
  - Raise Capital — `/workspace/fundraise` — feature `investor_links`, minTier `starter`
  - ESOP Manager — `/dashboard/esop`
  - Team & Salaries — `/dashboard/team`

### 5. Scale & Exit  (min phase 4)
- **Revenue**
  - Revenue — `/workspace/revenue` — minTier `growth`, phase 4
  - Dividends — `/workspace/dividends` — minTier `growth`
  - Growth Journal — `/workspace/journal` — minTier `scale`
- **Exit**
  - Exit Modeling — `/workspace/exit` — minTier `growth`, phase 5
  - Exit Benchmark — `/dashboard/exit-readiness` — minTier `starter`

### 6. Roles  (audience-scoped subgroups)
Only the subgroup whose `segments[]` intersects the user's segment renders. Empty groups collapse.

- **Investor** — segments `investor_angel`, `investor_vc`
  - Deal Flow — `/workspace/deal-flow`
  - Watchlist — `/workspace/watchlist` — feature `watchlist`
  - Portfolio — `/workspace/portfolio` — minTier `vc_small`
  - Preferences — `/workspace/investor-preferences`
- **Advisor** — segment `advisor`, minTier `advisor`
  - Client Roster — `/workspace/client-roster`
  - Notes — `/workspace/advisor-notes`
  - Weekly Digest — `/workspace/weekly-digest`
- **Accelerator** — segment `accelerator`, minTier `accel_starter`
  - Cohort — `/workspace/cohort` — feature `cohort.view`
  - Applications — `/workspace/applications`
  - LP Report — `/workspace/lp-report` — feature `lp_report`, minTier `accel_growth`
- **Reseller** — feature `reseller.console` on every item (plan `reseller_admin`)
  - Dashboard, Customers, Codes, Credits, Requests, Reports, Settings (paths unchanged)
- **Mentor** — preserved from workflow wf2tywpoq; feature `reseller.console`
  - Roster, Check-in Inbox, Reports Feed, Cohort View (paths unchanged)

### 7. Account
- **Profile**
  - My Profile — `/workspace/profile`
  - Founder Profile — `/workspace/founder-profile`
  - Referrals — `/workspace/referrals`
- **Billing**
  - Billing — `/workspace/billing`
  - Notifications — `/workspace/notifications`
  - Integrations — `/workspace/integrations`
- **Enterprise**
  - Custom Branding — `/workspace/branding` — feature `pdf_branding`, minTier `enterprise`
  - White-label — `/workspace/white-label` — feature `white_label`, minTier `scale`
  - API Keys — `/workspace/api-keys` — feature `api.access`, minTier `enterprise`
  - SSO — `/workspace/sso` — feature `sso`, minTier `enterprise`
  - Advisor Portal — `/dashboard/advisor` — feature `advisor_portal`, minTier `growth`

## 3. Files

### Modify
- `web/src/components/workspace/nav-groups.ts` — restructure `NAV_GROUPS` to nested shape (see schema below). Preserve every existing `href`. Delete top-level Investor/Advisor/Accelerator/Reseller/Mentor groups; move them into `Roles.subgroups`.

### New
- `web/src/lib/nav/nav-schema.ts` — typed shape.
- `web/src/lib/nav/workflow-steps.ts` — canonical workflow steps + phase mapping.
- `web/src/components/workspace/nested-sidebar.tsx` — accordion renderer with per-user `localStorage` open-state (`blockid.nav.open.<userId>`), tier-hide filter, and one-time "we reorganized" tooltip (localStorage key `blockid.nav.reorg-seen.v1`).

### Schema sketch (nav-schema.ts)
```ts
export interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredFeature?: string;   // feature-gates.manifest.ts key
  minTier?: PlanTier;
  growthPhase?: 0|1|2|3|4|5;
  segments?: Segment[];
  lifecycle?: FeatureLifecycle;
  addOnKey?: "share_management";
}
export interface NavSubgroup {
  id: string;
  label: string;
  minTier?: PlanTier;
  segments?: Segment[];
  items: NavLeaf[];
}
export interface NavGroupV2 {
  id: string;
  label: string;
  pillar: NavPillar;
  stage?: string;
  minPhase?: number;
  minTier?: PlanTier;
  segments?: Segment[];
  subgroups?: NavSubgroup[];   // preferred
  items?: NavLeaf[];           // for Home only
  defaultCollapsed?: boolean;
}
```

## 4. Hide-vs-Lock Rules

- Nav computes visibility server-side: leaf renders iff `can(user, requiredFeature)` AND `meetsMinPlan(user.tier, minTier)` AND (segments empty OR intersects user segment).
- Failing leaves are ABSENT (no lock icon in the tree).
- A single "Recommended next step" tile on `/dashboard` may surface one blocked feature that matches the user's `growthPhase` (existing mega-batch component; wire the tier gap into its data feed).
- Server-side enforcement remains at each `page.tsx` and `route.ts` via `requireFeature()`; unauthorized URL hits redirect to `/pricing?feature=<slug>&from=<path>`.

## 5. Migration Notes

- Legacy top-level Investor/Advisor/Accelerator/Reseller/Mentor groups are replaced by `Roles` subgroups. Deep links (`/workspace/deal-flow` etc.) unchanged; command-palette continues to work.
- Mentor group from wf2tywpoq preserved verbatim as `Roles > Mentor` subgroup — feature and hrefs untouched.
- `PLAN_ID_TO_TIER` bridge in `segments.ts` unchanged.
