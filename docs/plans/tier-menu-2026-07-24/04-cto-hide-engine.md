# CTO Plan — Hide-Not-Lock Tier Engine

Date: 2026-07-24
Owner: CTO agent
Related: 01-recon, 02-cpo (workflow menu), 03-cro (upgrade nudges), 05-mentor coexistence (wf2tywpoq)

## 1. Summary

Three cooperating layers replace today's "always render, then lock" pattern with
"hide server-side, guard server-side, discover client-side".

### (a) Server-side nav resolver — `filterNavForUser`

- Pure function: `filterNavForUser(navTree, ctx) → NavTree` where
  `ctx = { tier: PlanTier, role: AccountType, segment: Segment, growthPhase: number, features: Set<Feature> }`.
- Walks the `NAV_GROUPS` schema recursively (supports submenu-of-submenu) and
  DROPS any group/item whose:
  - `minPlan` outranks `ctx.tier` (via `PLAN_TIER_RANK` from `segments.ts`);
  - `minPhase > ctx.growthPhase`; OR
  - `segments` present and does not include `ctx.segment`; OR
  - `feature` present and not in `ctx.features`; OR
  - `role` present and does not include `ctx.role`.
- Empty groups (all children dropped) are also dropped — no orphan headers.
- Preserves item order and lifecycle chip; does NOT mutate original schema.
- Called from `workspace-layout.tsx` (already an RSC): the sidebar renders the
  already-filtered tree so no locked-item flash on first paint and no client
  round-trip.
- Coexistence: the Mentor pillar (from wf2tywpoq) is treated like any other
  role-gated group — the filter drops it for non-mentors instead of the current
  `feature='reseller.console'` hack. Mentor group keeps its `pillar:'role'` and
  gains an explicit `role:['mentor']` tag (see §3 for schema patch).

### (b) Server-side page-level gate — `requireTierForPage`

- Helper called at the top of every gated `page.tsx` (Server Component):
  ```ts
  await requireTierForPage({ feature: 'cap_table.write', minTier: 'growth' });
  ```
- Resolves the current user via `getCurrentUser()` + `resolveSegment()` (both
  already server-only, cookie-authenticated).
- If missing tier OR feature: `redirect('/pricing?feature=<slug>&from=<pathname>')`.
- `fromPath` is captured via `headers().get('x-invoke-path')` (populated by our
  edge middleware) with a fallback to the `pathname` param the caller passes.
- Uses `redirect()` from `next/navigation` — throws a `NEXT_REDIRECT` control
  signal, safe inside RSC. No layout re-render loop because `filterNavForUser`
  will already have hidden the link.
- This is the SECURITY layer — nav hiding is UX only.

### (c) Client-side "discovery hint" wrapper — `<TierDiscoveryHint />`

- Renders the "Recommended next step" tile only when the CRO recommender
  (already built in mega-batch) selects THIS feature for this user + phase.
- Reads from `useUpgradeRecommendation()` hook (existing) — no new poll.
- Never rendered for features the user already has; never rendered for features
  outside the user's growth phase; suppressible via localStorage dismiss.
- Only surface for "just out of reach" nudges — NOT a global upsell wall.

### Data flow

```
Request → RSC workspace-layout
        → getCurrentUser() + getUserTierContext()   [request-cached]
        → filterNavForUser(NAV_GROUPS, ctx)
        → <Sidebar nav={filtered} />  (no client fetch, no flash)

Request → RSC gated page.tsx
        → requireTierForPage({ feature, minTier })   [request-cached ctx reused]
        → either renders content OR redirect('/pricing?feature=…&from=…')

Client → <TierDiscoveryHint feature="cap_table.write" />
        → useUpgradeRecommendation() picks 0..1 features to nudge
        → renders inline card OR nothing
```

## 2. File changes (edit existing)

| Path | Change |
|---|---|
| `web/src/components/workspace/workspace-layout.tsx` | Import & call `filterNavForUser(NAV_GROUPS, ctx)` server-side; pass filtered tree to `<Sidebar />`. Remove client-side `useEntitlement()` gating from the sidebar renderer (keep for icons/chips only). |
| `web/src/components/workspace/nav-groups.ts` | Add optional `role?: AccountType[]` field to `NavGroup` and `NavItem` types; add `role:['mentor']` to Mentor group (from wf2tywpoq); replace `feature:'reseller.console'` blanket on Reseller/Mentor items with `role:['reseller']` / `role:['mentor']` respectively. Keep `feature` field for finer-grained item gates. |
| `web/src/lib/reseller/scope.ts` | Add `getUserTier(userId): Promise<PlanTier>` helper if missing (wraps `PLAN_ID_TO_TIER[plan]` with grandfathered legacy map). |
| `web/src/lib/entitlements.ts` | Export `getEntitlementsForUser(user)` returning `Set<Feature>` (currently returns `string[]` via `getEntitlements(planId)`). Add request-memoization via `React.cache`. |
| `web/src/app/api/entitlement/me/route.ts` | Return `tier` alongside `plan` in the payload so the client mirror stays consistent when nav hides items. |
| `web/src/components/access/FeatureGate.tsx` | Add prop `mode?: 'lock' \| 'hide'` (default `lock` for BC). When `hide`, renders `null` on deny — used for inline sub-features that the nav filter can't reach. |

## 3. New files

| Path | Purpose |
|---|---|
| `web/src/lib/nav/filter-nav-for-user.ts` | Pure recursive filter: `(navTree, ctx) → NavTree`. No I/O. Uses `PLAN_TIER_RANK.meetsMinPlan` and set membership. |
| `web/src/lib/nav/filter-nav-for-user.test.ts` | Vitest: covers free/starter/growth/scale/enterprise + investor_angel + reseller + mentor + phase-locked; asserts empty-group pruning; asserts submenu-of-submenu is walked; asserts original tree is not mutated. |
| `web/src/lib/nav/user-nav-context.ts` | `getUserNavContext(): Promise<NavContext>` — RSC-only, wraps `getCurrentUser + resolveSegment + getUserTier + getEntitlementsForUser + getGrowthPhase`, wrapped in `React.cache` for per-request dedupe. |
| `web/src/lib/entitlements/require-tier-for-page.ts` | `requireTierForPage({ feature?, minTier?, pathname? })` — resolves ctx, checks, calls `redirect('/pricing?feature=<slug>&from=<path>')` on miss. |
| `web/src/lib/entitlements/require-tier-for-page.test.ts` | Vitest: `vi.mock('next/navigation')` to capture `redirect()` calls; covers feature miss, tier miss, both-pass, unauthenticated (redirect to `/login?next=<path>`), fromPath preserved. |
| `web/src/lib/entitlements/current-user-tier.ts` | `getCurrentUserTier()` — thin RSC-only accessor around `getUserNavContext().tier`, exported for gates that only need tier not features. |
| `web/src/lib/entitlements/current-user-tier.test.ts` | Vitest: mocks `getCurrentUser`, asserts legacy plan ids (`free`, `founding50`, `growth`, `growth_annual`) map correctly. |
| `web/src/components/discovery/TierDiscoveryHint.tsx` | Client component reading `useUpgradeRecommendation()`; renders "Recommended next step" tile or null. |
| `docs/plans/tier-menu-2026-07-24/04-cto-hide-engine.md` | This document. |

## 4. Acceptance criteria

- [ ] `filterNavForUser` runs 100% server-side inside `workspace-layout.tsx`; view-source of `/workspace` on a `founder_free` account contains ZERO Growth/Scale/Enterprise nav labels (grep-verifiable).
- [ ] No locked-item flash on first paint (Lighthouse first-paint DOM contains only permitted labels).
- [ ] Every route listed in `feature-gates.manifest.ts` has a corresponding `requireTierForPage` at the top of its `page.tsx` (or is a mutation-only endpoint handled by `requireFeature`). Enforced by extending `feature-gates.manifest.test.ts` with a page-gate presence check.
- [ ] URL-typing test: authenticated `founder_free` user hitting `/workspace/cap-table` is redirected to `/pricing?feature=cap_table.write&from=%2Fworkspace%2Fcap-table` — asserted in an integration test.
- [ ] Tier resolution memoized per request: instrument counter shows `getCurrentUser` invoked exactly once even when 5 gated components render on the same page.
- [ ] Tests cover free / starter / growth / scale / enterprise + investor_angel + reseller_admin + mentor role + grandfathered legacy plan ids.
- [ ] Mentor group from wf2tywpoq still renders for `role:'mentor'` accounts; disappears for non-mentors.
- [ ] Post-upgrade landing: `/pricing?feature=…&from=…` flow stores `from` in checkout metadata and redirects to it after successful Stripe checkout (already partially wired; add test).
- [ ] No new npm deps; App Router RSC-first; contract preserved for `useEntitlement()` client hook.

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Perf**: N gated components each re-resolving user tier could hit Supabase N times per render. | Wrap `getUserNavContext` in `React.cache` (per-request memo) and rely on existing 60s in-process `getPlanCached`. Add instrumentation counter in dev. |
| **Client loop**: `filterNavForUser` called inside a client `useEffect` could ping-pong. | Type it as a server-only module (`import 'server-only'`) so a client import fails at build time. |
| **Grandfathered users** with legacy plan ids (`free`, `founding50`, `growth`, `growth_annual`) losing nav items they had before. | `getUserTier` runs through both `LEGACY_PLAN_MAP` and `PLAN_ID_TO_TIER`; snapshot test locks the mapping. |
| **Dual-key features** (`term_sheet.ai`/`term_sheet_ai`, `api`/`api.access`). | `getEntitlementsForUser` returns a `Set` seeded with BOTH spellings whenever either is granted (add a small alias table). |
| **Mentor coexistence** — wf2tywpoq is landing concurrently; schema clash on `NavGroup`. | Add the `role` field additively (optional); do not remove existing `feature` field. Both workflows can merge without conflict. |
| **Feature manifest drift** — nav filter reads `feature` strings that aren't in the `Feature` union. | Extend `feature-gates.manifest.test.ts` to also validate every `feature` string on nav items exists in the entitlements Feature union. |
| **Redirect loop**: `/pricing` itself accidentally being tier-gated. | Add explicit unit test that `/pricing`, `/login`, `/workspace/billing`, `/workspace/upgrade` are NEVER passed to `requireTierForPage`. |
| **Server-side redirect swallowing analytics**: gate-hit beacon currently fires from client `FeatureGate`. | Add server-side `recordGateHit` call inside `requireTierForPage` before `redirect()` so analytics still fires when hide-mode short-circuits the client. |
| **Empty sidebar** for a brand-new founder_free user in an unrelated segment (e.g. investor default). | Always keep an "Overview" pillar unfiltered; add regression test asserting minimum 1 group always renders for any authenticated user. |

## 6. Rollout

1. Land the pure `filter-nav-for-user.ts` + tests (no behaviour change yet).
2. Land `require-tier-for-page.ts` + tests; add to 2-3 highest-traffic gated pages behind a killswitch `TIER_HIDE_ENGINE=1`.
3. Flip killswitch in staging; run screenshot-tour to confirm no visual regressions on `founder_free`, `founder_growth`, `founder_scale`, `investor_angel`, `reseller_admin`.
4. Extend `requireTierForPage` to all gated pages; extend manifest test to enforce presence.
5. Wire `filterNavForUser` into `workspace-layout.tsx`; remove client-side nav gating.
6. Ship discovery hint tile on `Overview` and the current-phase pillar only.
