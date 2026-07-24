# CRO Plan — Tier → Feature Visibility Matrix + Contextual Upgrade Nudges

**Date:** 2026-07-24
**Owner:** CRO agent
**Scope:** wf-cro (workflow: tier-menu 2026-07-24)
**Coexists with:** wf2tywpoq (Mentor console pillar) and Product/UX nav-groups rework

---

## 0. Problem statement

Today the workspace nav does three inconsistent things when a user does not
have a feature:

1. `segments[]` mismatch → item is silently hidden.
2. `minPlan` mismatch → item is rendered as a **greyed-out lock**.
3. `feature` mismatch → item renders empty until `useEntitlement()` resolves,
   then hides.

The result: every founder sees a wall of locked padlocks in the sidebar. That
is a discoverability tax on the free tier and a nag tax on the paid tier. It
also fights our "recommended next step" tile because the same feature appears
twice — once as a padlock in the nav, once as a positive upgrade prompt.

The CRO position: **hide, do not lock**. Move all "you don't have this yet"
signalling into a single, phase-aware, rate-limited nudge, and treat the nav
as a menu of things the user *actually has today*.

---

## 1. Single source of truth

New file: `web/src/lib/entitlements/tier-visibility.ts`

Exports a typed constant `VISIBILITY` keyed by the same feature slugs that
appear in `web/src/lib/feature-gates.manifest.ts` (server-side gate manifest)
and the `feature` string on nav items. This guarantees one map bridges
`FEATURE_GATES.required_feature` ↔ `NAV_GROUPS[*].items[*].feature` ↔ CTA copy.

```ts
// web/src/lib/entitlements/tier-visibility.ts
import type { PlanTier } from "@/lib/segments";

export type FeatureSlug =
  | "svi.run.limited"
  | "svi.run"
  | "evidence.upload"
  | "report.basic"
  | "report.premium"
  | "cap_table.read"
  | "cap_table.write"
  | "data_room.read"
  | "data_room.write"
  | "data_room.access"
  | "term_sheet.ai"          // canonical
  | "investor_links"
  | "investor_links.premium"
  | "profile.multi"
  | "pdf_branding"
  | "equity_offer.request"
  | "esop.manage"
  | "blockchain.sync"
  | "advisor_portal"
  | "white_label"
  | "sso"
  | "api.access"             // canonical (api alias handled at gate layer)
  | "multi_entity"
  | "sla"
  | "watchlist"
  | "advisory_equity"
  | "portfolio"
  | "diligence_pack"
  | "lp_export"
  | "multi_fund"
  | "cohort.view"
  | "cohort.view.stats"
  | "cohort.manage"
  | "accelerator.cohort"
  | "lp_report"
  | "reseller.console"
  | "reseller.create_startup"
  | "reseller.grant_credits";

export interface VisibilityRule {
  /** PlanTier at/above which this feature is visible in nav & unlocked. */
  minTier: PlanTier;
  /** Short benefit line shown inside "Recommended next step" tile. */
  discoveryHint: string;
  /** Short imperative for the upgrade button. */
  upgradeCTA: string;
  /**
   * Which SVI growth phase (1..12) the feature is *most useful* at.
   * The next-best-upgrade selector uses this to rank nudges.
   */
  bestAtPhase: number;
  /** Estimated monthly $ delta over free tier (marketing figure). */
  monthlyDeltaAud: number;
  /** Optional add-on slug — routes to /workspace/billing?openAddon=<key>. */
  addOnKey?: string;
}

export const VISIBILITY: Record<FeatureSlug, VisibilityRule> = {
  // ── Founder ladder ──
  "svi.run.limited":       { minTier: "free",       discoveryHint: "Score your startup in minutes.",             upgradeCTA: "Try free",              bestAtPhase: 1,  monthlyDeltaAud: 0   },
  "svi.run":               { minTier: "starter",    discoveryHint: "Unlimited SVI runs + history.",              upgradeCTA: "Upgrade to Starter",     bestAtPhase: 2,  monthlyDeltaAud: 29  },
  "evidence.upload":       { minTier: "starter",    discoveryHint: "Attach evidence to lift your SVI score.",    upgradeCTA: "Upgrade to Starter",     bestAtPhase: 2,  monthlyDeltaAud: 29  },
  "report.basic":          { minTier: "starter",    discoveryHint: "Investor-ready 10-page report.",             upgradeCTA: "Upgrade to Starter",     bestAtPhase: 3,  monthlyDeltaAud: 29  },
  "investor_links":        { minTier: "starter",    discoveryHint: "Shareable link — track who opened it.",      upgradeCTA: "Upgrade to Starter",     bestAtPhase: 3,  monthlyDeltaAud: 29  },
  "report.premium":        { minTier: "growth",     discoveryHint: "Full unlimited-page multi-agent report.",    upgradeCTA: "Upgrade to Growth",      bestAtPhase: 4,  monthlyDeltaAud: 99  },
  "cap_table.read":        { minTier: "growth",     discoveryHint: "See a live ownership table.",                upgradeCTA: "Upgrade to Growth",      bestAtPhase: 4,  monthlyDeltaAud: 99  },
  "cap_table.write":       { minTier: "growth",     discoveryHint: "Model rounds, SAFEs and dilution.",          upgradeCTA: "Upgrade to Growth",      bestAtPhase: 5,  monthlyDeltaAud: 99  },
  "data_room.read":        { minTier: "growth",     discoveryHint: "Curate a data room investors can browse.",   upgradeCTA: "Upgrade to Growth",      bestAtPhase: 6,  monthlyDeltaAud: 99  },
  "data_room.access":      { minTier: "growth",     discoveryHint: "Grant time-boxed investor access.",          upgradeCTA: "Upgrade to Growth",      bestAtPhase: 6,  monthlyDeltaAud: 99  },
  "term_sheet.ai":         { minTier: "growth",     discoveryHint: "AI-drafted term sheet in your jurisdiction.",upgradeCTA: "Upgrade to Growth",      bestAtPhase: 7,  monthlyDeltaAud: 99  },
  "investor_links.premium":{ minTier: "growth",     discoveryHint: "Per-viewer watermark + full analytics.",     upgradeCTA: "Upgrade to Growth",      bestAtPhase: 6,  monthlyDeltaAud: 99  },
  "profile.multi":         { minTier: "growth",     discoveryHint: "Run multiple startup profiles in one seat.", upgradeCTA: "Upgrade to Growth",      bestAtPhase: 5,  monthlyDeltaAud: 99  },
  "pdf_branding":          { minTier: "growth",     discoveryHint: "Ship reports with your logo, not ours.",     upgradeCTA: "Upgrade to Growth",      bestAtPhase: 5,  monthlyDeltaAud: 99  },
  "equity_offer.request":  { minTier: "growth",     discoveryHint: "Send binding equity offers to advisors.",    upgradeCTA: "Upgrade to Growth",      bestAtPhase: 6,  monthlyDeltaAud: 99  },
  "data_room.write":       { minTier: "scale",      discoveryHint: "Upload evidence & manage folders.",          upgradeCTA: "Upgrade to Scale",       bestAtPhase: 7,  monthlyDeltaAud: 299 },
  "esop.manage":           { minTier: "scale",      discoveryHint: "Employee options, vesting, exercise flows.", upgradeCTA: "Upgrade to Scale",       bestAtPhase: 8,  monthlyDeltaAud: 299, addOnKey: "share_management" },
  "blockchain.sync":       { minTier: "scale",      discoveryHint: "Anchor cap table on-chain (optional).",      upgradeCTA: "Upgrade to Scale",       bestAtPhase: 9,  monthlyDeltaAud: 299 },
  "advisor_portal":        { minTier: "scale",      discoveryHint: "Give advisors their own portal login.",      upgradeCTA: "Upgrade to Scale",       bestAtPhase: 8,  monthlyDeltaAud: 299 },
  "white_label":           { minTier: "scale",      discoveryHint: "Ship the workspace under your own brand.",   upgradeCTA: "Upgrade to Scale",       bestAtPhase: 9,  monthlyDeltaAud: 299 },
  "sso":                   { minTier: "enterprise", discoveryHint: "Okta / Azure AD single sign-on.",            upgradeCTA: "Talk to sales",          bestAtPhase: 10, monthlyDeltaAud: 0   },
  "api.access":            { minTier: "enterprise", discoveryHint: "Programmatic access to your entitlements.",  upgradeCTA: "Talk to sales",          bestAtPhase: 10, monthlyDeltaAud: 0   },
  "multi_entity":          { minTier: "enterprise", discoveryHint: "One dashboard across many entities.",         upgradeCTA: "Talk to sales",          bestAtPhase: 11, monthlyDeltaAud: 0   },
  "sla":                   { minTier: "enterprise", discoveryHint: "24/7 SLA + named CSM.",                       upgradeCTA: "Talk to sales",          bestAtPhase: 12, monthlyDeltaAud: 0   },
  // ── Investor ladder ──
  "watchlist":             { minTier: "starter",    discoveryHint: "Save promising deals to a watchlist.",       upgradeCTA: "Upgrade to Angel",       bestAtPhase: 2,  monthlyDeltaAud: 79  },
  "advisory_equity":       { minTier: "growth",     discoveryHint: "Negotiate advisory equity in-app.",          upgradeCTA: "Upgrade to Advisor",     bestAtPhase: 4,  monthlyDeltaAud: 149 },
  "portfolio":             { minTier: "scale",      discoveryHint: "Multi-fund portfolio dashboard.",            upgradeCTA: "Upgrade to VC SM",       bestAtPhase: 7,  monthlyDeltaAud: 349 },
  "diligence_pack":        { minTier: "scale",      discoveryHint: "One-click DD pack per company.",             upgradeCTA: "Upgrade to VC SM",       bestAtPhase: 6,  monthlyDeltaAud: 349 },
  "lp_export":             { minTier: "enterprise", discoveryHint: "LP-ready capital account statements.",       upgradeCTA: "Talk to sales",          bestAtPhase: 11, monthlyDeltaAud: 0   },
  "multi_fund":            { minTier: "enterprise", discoveryHint: "Roll up many funds under one login.",        upgradeCTA: "Talk to sales",          bestAtPhase: 11, monthlyDeltaAud: 0   },
  // ── Accelerator ladder ──
  "cohort.view":           { minTier: "starter",    discoveryHint: "See a live snapshot of one cohort.",         upgradeCTA: "Upgrade to Accelerator", bestAtPhase: 3,  monthlyDeltaAud: 500 },
  "cohort.view.stats":     { minTier: "starter",    discoveryHint: "Aggregate cohort SVI stats.",                upgradeCTA: "Upgrade to Accelerator", bestAtPhase: 3,  monthlyDeltaAud: 500 },
  "accelerator.cohort":    { minTier: "starter",    discoveryHint: "Run a cohort inside BlockID.",               upgradeCTA: "Upgrade to Accelerator", bestAtPhase: 3,  monthlyDeltaAud: 500 },
  "cohort.manage":         { minTier: "growth",     discoveryHint: "Full cohort admin: invites, milestones.",    upgradeCTA: "Upgrade to Growth",      bestAtPhase: 4,  monthlyDeltaAud: 1500},
  "lp_report":             { minTier: "growth",     discoveryHint: "Auto-generate LP-ready cohort reports.",     upgradeCTA: "Upgrade to Growth",      bestAtPhase: 5,  monthlyDeltaAud: 1500},
  // ── Reseller/mentor (opaque to marketing) ──
  "reseller.console":       { minTier: "enterprise", discoveryHint: "Reseller console.",                          upgradeCTA: "Contact us",             bestAtPhase: 10, monthlyDeltaAud: 0   },
  "reseller.create_startup":{ minTier: "enterprise", discoveryHint: "Create client startups.",                    upgradeCTA: "Contact us",             bestAtPhase: 10, monthlyDeltaAud: 0   },
  "reseller.grant_credits": { minTier: "enterprise", discoveryHint: "Grant credits to client accounts.",          upgradeCTA: "Contact us",             bestAtPhase: 10, monthlyDeltaAud: 0   },
};

/** Server-safe reader: is <feature> visible for a given tier? */
export function isVisibleAtTier(feature: FeatureSlug, tier: PlanTier): boolean;
```

### Design invariants

1. Keys are **only** slugs that already exist in
   `feature-gates.manifest.ts::FEATURE_GATES.required_feature` or in a
   `nav-groups.ts::items[*].feature`. A companion test walks both sources
   and asserts every slug in either source has a `VISIBILITY[...]` row.
2. `minTier` is the **PlanTier enum** (from `segments.ts`), never a plan id.
   Cross-segment rank comparison keeps working via `meetsMinPlan()`.
3. `bestAtPhase` maps into the 12-phase `startup-growth-phases.ts` taxonomy
   — filled in for every founder-ladder feature; investor/accelerator use
   the closest analogue in their journey map.
4. Add-on features (`share_management`) route to the drawer, not the
   pricing page. The nudge card reads `addOnKey` and rewrites its CTA URL.

---

## 2. Next-best-upgrade selector

New file: `web/src/lib/entitlements/next-best-upgrade.ts`

```ts
import { PlanTier, PLAN_TIER_RANK, meetsMinPlan } from "@/lib/segments";
import { VISIBILITY, type FeatureSlug, type VisibilityRule } from "./tier-visibility";

export interface NextBestUpgradeInput {
  currentTier: PlanTier;
  currentPhase: number;                     // 1..12 SVI growth phase
  ownedFeatures: readonly FeatureSlug[];    // resolved from entitlements
  excludeFeatures?: readonly FeatureSlug[]; // e.g. already-dismissed slugs
}

export interface NextBestUpgrade {
  feature: FeatureSlug;
  rule: VisibilityRule;
  reason: "phase-match" | "phase-adjacent" | "next-tier";
  monthlyDeltaAud: number;
}

/**
 * Rank features that are (a) NOT owned yet and (b) sit above the user's
 * current tier, prioritising those whose bestAtPhase matches the user's
 * current SVI phase. Ties broken by cheapest monthlyDeltaAud (lowest
 * commitment first — CRO rule of thumb: land, then expand).
 */
export function nextBestUpgrade(input: NextBestUpgradeInput): NextBestUpgrade | null;
```

Rules:

- **phase-match** (score +100): `rule.bestAtPhase === input.currentPhase`.
- **phase-adjacent** (score +40): `|rule.bestAtPhase - currentPhase| === 1`.
- **next-tier** (score +10): `rule.minTier` is exactly one rank above
  `currentTier` (via `PLAN_TIER_RANK`).
- Ties → cheapest monthly delta wins.
- Owned or excluded features always drop out.
- Returns `null` if nothing qualifies (user is already Enterprise, or
  currentPhase is unknown).

This function is pure, isomorphic and cache-friendly. It is called from the
"Recommended next step" tile server component with `ownedFeatures` derived
from `getEntitlements(planId)` — no client fetch needed.

---

## 3. Phase-aware upgrade card

New file: `web/src/components/sales/phase-aware-upgrade-card.tsx`

- **Client component**, small (~120 LOC), rendered *inside* the existing
  "Recommended next step" tile on the workspace overview page.
- Props: `{ suggestion: NextBestUpgrade; currentTier: PlanTier; segment: string }`.
- Renders a compact card with:
  - Discovery hint (`rule.discoveryHint`).
  - "Best at phase X of your journey — you are at phase Y" microcopy.
  - Estimated cost delta: `+A$${monthlyDeltaAud}/mo`.
  - Primary CTA: `rule.upgradeCTA` → `/pricing?tier=<segment>&feature=<slug>&from=<path>`
    OR the add-on drawer when `rule.addOnKey` is set.
  - Secondary "Not now" button that writes a per-slug cooldown key.
- **GA4 events (fire via existing `fireGa()` helper pattern):**
  - `tier_upgrade_impression` `{ feature, current_tier, target_tier, phase, session_slot }` — fired **once per mount per slug per session** (session slot tracked in `sessionStorage`).
  - `tier_upgrade_click` `{ feature, current_tier, target_tier, monthly_delta_aud, cta_label }` — fired on primary CTA.
  - `tier_upgrade_dismiss` `{ feature, current_tier, target_tier }` — fired on Not now.
- **Frequency cap** — reuses the existing 24h rate-limit + cooldown
  storage used by `paywall-nudge.tsx`, plus:
  - Session cap: **max 1 impression per feature per session**
    (`sessionStorage['bid_upgrade_seen_' + feature]`).
  - Daily cap: **max 3 total upgrade cards per user per rolling 24h**
    across all features (`localStorage['bid_upgrade_daily'] = { at: [] }`).
  - Never re-mounts inside the same page navigation; the tile short-circuits
    when the cap is exceeded and falls back to a neutral "Overview" state.

---

## 4. Extending paywall-nudge.tsx

Change surface: `web/src/components/sales/paywall-nudge.tsx`

- Add optional `variant?: "modal" | "phase-card"` to `PaywallRequest`
  (defaults to `"modal"` — preserves today's behaviour).
- Add optional `phase?: number`, `bestAtPhase?: number`,
  `monthlyDeltaAud?: number` for the new variant.
- Refactor `fireGa()` calls to emit the CRO analytics namespace when
  `variant === "phase-card"`:
  - `paywall_hit` remains for modal path; add `tier_upgrade_impression`
    for card path — mirroring the phase card so the two entry points
    reconcile in GA4 under the same event schema.
- Add a small `useContextualUpgrade({ feature, tier, phase })` hook that
  wraps `nextBestUpgrade()` + `usePaywall().openPaywall({ variant: "phase-card", ... })`.
  Used by the workspace shell when a hidden-in-nav feature is deep-linked
  (URL path matches a `FEATURE_GATES` row the user cannot access) — the
  server redirects to `/workspace?nudge=<slug>`; the shell picks up the
  query and opens the card once.
- The existing modal path is untouched for callers already using it
  (`report_export`, etc.).

---

## 5. Server-side hardening (already assumed)

For every route enumerated in `feature-gates.manifest.ts`:

1. Page component (RSC) at the same path must call `requireFeature(user, slug)`
   and `redirect('/pricing?tier=' + segment + '&feature=' + slug + '&from=' + pathname)`
   on `EntitlementError`. This is already the P8.2 pattern — this plan
   does not change route handlers, only adds a **matching redirect for
   navigable pages** so URL-typing users never land on a blank locked screen.
2. `nav-groups.ts` items keep their `feature` string. The renderer
   (`workspace-layout.tsx`) is switched from "render + lock" to
   "filter by `isVisibleAtTier(item.feature, currentTier) && can(user, item.feature)`".
   `minPlan` becomes a **cross-check** rather than a display state.

---

## 6. Golden-snapshot test

New file: `web/src/lib/entitlements/tier-visibility.test.ts`

- For each canonical tier `free`, `starter`, `growth`, `scale`, `enterprise`
  (founder segment) plus the three investor tiers and three accelerator
  tiers, compute:
  ```
  Object.keys(VISIBILITY).filter(f => meetsMinPlan(tier, VISIBILITY[f].minTier))
  ```
- Sort alphabetically and snapshot to
  `__snapshots__/tier-visibility.test.ts.snap` — one block per tier.
- Also snapshot the *inverse*: for each tier, list features whose
  `bestAtPhase` sits inside that tier's expected phase window (e.g.
  free = phases 1–2, growth = phases 3–6). This makes phase-drift
  reviewable in diff.
- Any change to `VISIBILITY` intentionally requires
  `vitest -u tier-visibility` and a human-visible diff in code review
  ("golden snapshot" pattern — same convention we already use for
  `feature-gates.manifest.test.ts`).
- Additional invariants asserted:
  - Every `FEATURE_GATES[i].required_feature` has a `VISIBILITY[...]` row.
  - Every `NAV_GROUPS[*].items[*].feature` has a `VISIBILITY[...]` row.
  - No slug in `VISIBILITY` is orphaned (unused in either source), unless
    listed in `OPAQUE_SLUGS` (`reseller.*` intentionally unlisted in nav).

---

## 7. Acceptance criteria

- [ ] `web/src/lib/entitlements/tier-visibility.ts` exports `VISIBILITY`
      with rows for every slug used in `feature-gates.manifest.ts` and
      `nav-groups.ts`.
- [ ] `web/src/lib/entitlements/next-best-upgrade.ts::nextBestUpgrade()`
      returns a deterministic top-1 given `{ currentTier, currentPhase, ownedFeatures }`.
- [ ] Golden snapshot generated per tier
      (`__snapshots__/tier-visibility.test.ts.snap`); any change to
      `VISIBILITY` fails the test unless snapshot is intentionally updated.
- [ ] `<PhaseAwareUpgradeCard>` fires `tier_upgrade_impression` on mount
      and `tier_upgrade_click` on primary CTA, both visible in GA4 DebugView.
- [ ] Session cap: same feature slug never shows more than one card per
      session (`sessionStorage['bid_upgrade_seen_' + slug]` guard).
- [ ] Daily cap: no more than 3 upgrade cards per user per rolling 24h
      across all features (`localStorage['bid_upgrade_daily']` window).
- [ ] Deep-linking to a hidden feature route redirects to
      `/pricing?tier=<segment>&feature=<slug>&from=<path>` server-side.
- [ ] No greyed-out padlocks remain in the workspace sidebar for a
      free-tier founder — locked items are absent, discovery happens
      only through the phase-aware tile.
- [ ] Mentor pillar (wf2tywpoq) still renders; `reseller.console` slug
      resolves through `VISIBILITY` without needing a marketing tier.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Nudge fatigue — users complain the upgrade card is spam. | Medium | High (churn signal) | Session cap (1/feature/session) + daily cap (3/user/24h) via localStorage; "Not now" writes 24h cooldown that suppresses BOTH card and modal for that slug. |
| Hidden nav reduces discoverability of paid features — cannibalises free-to-paid conversion. | Medium | High (CRO regression) | The phase-aware tile is *promoted* copy, not de-emphasised. A/B test with 10% holdout still seeing padlocks; success metric = paid conversion of active free users, target ≥ current. |
| `VISIBILITY` and `feature-gates.manifest.ts` drift apart. | High | Medium (dead nudges) | Test asserts both sources reference only slugs present in `VISIBILITY`. Golden snapshot forces PR-time review. |
| `bestAtPhase` guesses are wrong → nudges look off. | Medium | Low | Values are simple constants, iterable by A/B; add PostHog cohort analysis on `tier_upgrade_click / impression` ratio per feature after 30d. |
| Add-on `share_management` routes to drawer, not pricing — CTA copy could confuse. | Low | Low | Card reads `addOnKey`, rewrites CTA label to "Add to plan" and href to `/workspace/billing?openAddon=<key>`. |
| Server redirect on hidden URL breaks bookmarks (paying users who downgraded). | Low | Medium | Redirect includes `from=` param; pricing page detects `from` and shows a "you had access to this before" line so downgraded users know why. |
| localStorage caps easily bypassed (incognito, cleared storage). | Low | Low | Bypass is a user choice; server-side rate limit not needed for a marketing nudge. |
| Mentor console (wf2tywpoq) adds new items after this ships with no `VISIBILITY` row. | Medium | Medium | Golden snapshot test fails at PR time — forces the mentor workflow to add a row before merge. |

---

## 9. Rollout

1. Land `tier-visibility.ts` + `next-best-upgrade.ts` + tests behind a
   feature flag `NEXT_PUBLIC_CRO_PHASE_NUDGE=on` (default off).
2. Ship `phase-aware-upgrade-card.tsx` wired into the "Recommended next
   step" tile but only rendered when flag is on.
3. 10% flag-on holdout for 14 days; measure `tier_upgrade_click /
   tier_upgrade_impression` and net paid-conversion delta vs control.
4. If ≥ control, flip flag on globally and remove `minPlan` padlock
   rendering from `workspace-layout.tsx`.
5. If < control, keep flag off and iterate `bestAtPhase` mapping before
   re-running.
