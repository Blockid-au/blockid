# CRO — Sales CTA & Conversion Optimization

**Owner:** CRO agent · **Date:** 2026-07-24 · **Status:** Design

## User ask
> "Phần sale cần có CTA rõ ràng và gợi ý để khuyến khích tối đa người dùng mua."
> (The sales surface needs a clear CTA and prompts that maximize purchase intent.)

## Summary
Introduce a coherent conversion layer across marketing and workspace:

1. **Sticky primary CTA on marketing pages** — persistent bottom-right button ("Start 7-day free trial") always visible on `/pricing`, `/founding-50`, marketing landing pages. Dismissible; state cached in `localStorage` (`bid_sticky_cta_dismissed_v1`) capped to 7 days.
2. **Pricing page hero refactor** — collapse to ONE primary CTA above the fold ("Start free trial — no charge till Day 8") + one secondary ("Talk to sales"). Removes decision paralysis from the current dual guarantees strip.
3. **Contextual paywall nudge** — dashboard modal shown when a user on a lower plan touches a paywalled feature (report export, deep audit, extra credits). Modal shows: locked feature name, cheapest unlock plan, "Upgrade now" CTA, "Not now" (cooldown 24h).
4. **Trial countdown banner** — top-of-workspace banner during Day 3 → Day 7 of a trial ("3 days left in your free trial — add a card to keep your data"). Auto-hides after conversion or dismissal.
5. **Exit-intent modal** on `/pricing` — offers Founding-50 promo at A$5 if spots remain; otherwise offers a 20% first-month coupon from `cta-variants.ts`.
6. **A/B variant hook** — CTA copy/tone chosen by SVI phase (Vision/Validation/Traction/Growth) via `cta-variants.ts`.

## GA4 events
| Event | When |
|-------|------|
| `cta_view` | Sticky CTA scrolled into view / hero rendered |
| `cta_click` | Any primary/secondary CTA clicked (params: `location`, `variant`, `plan_hint`) |
| `paywall_hit` | Paywall nudge opened (params: `feature`, `current_plan`) |
| `paywall_upgrade_click` | Upgrade CTA in paywall nudge clicked |
| `trial_banner_view` / `trial_banner_dismiss` | Countdown banner |
| `exit_intent_shown` / `exit_intent_convert` | Exit modal |

## File changes

### `web/src/app/pricing/page.tsx`
- Replace the current `MarketingHero` block with a single **primary CTA** button: `Start 7-day free trial` linking to `/signup?plan=founder-starter&trial=1`.
- Add secondary text link: `See all 12 plans below` (anchors to `#pricing-matrix`).
- Keep the 3-check guarantee strip but move it directly under the primary CTA.
- Mount `<StickyCta variant="pricing" />` inside `MarketingShell` (client boundary).
- Wrap `PricingMatrix` in an id-tagged `<section id="pricing-matrix">` so anchor works.
- Preserve `PageViewTracker` and SSR segment resolution — no behavioural change.

### `web/src/components/workspace/workspace-layout.tsx`
- Add a slot above `<main>` for `<TrialCountdownBanner />` (client component; reads `trialEndsAt` from user context or `/api/stripe/trial-status`).
- Mount `<PaywallNudge />` at the layout root as a portal target so any child can trigger `openPaywall({ feature, currentPlan })` via a lightweight context.
- Do not touch existing nav/sidebar markup.

## New files

### `web/src/components/sales/sticky-cta.tsx` (client)
- Fixed bottom-right (bottom-4 right-4) pill button with glassy backdrop.
- Props: `variant: "pricing" | "founding50" | "landing"`, `hrefOverride?`, `labelOverride?`.
- Reads `getCtaVariant(sviPhase, variant)` from `cta-variants.ts`.
- Dismiss button ("×") writes `localStorage.setItem('bid_sticky_cta_dismissed_v1', Date.now())`; re-shows after 7 days.
- Uses IntersectionObserver on itself to fire `cta_view` once, click fires `cta_click`.
- Hidden on mobile <sm to avoid covering forms; shown as full-width bar at bottom instead.
- Respects `prefers-reduced-motion`.

### `web/src/components/sales/paywall-nudge.tsx` (client)
- Context provider `PaywallProvider` + hook `usePaywall()` → `openPaywall({ feature, currentPlan, requiredPlan })`.
- Renders a Radix Dialog / headless modal with:
  - Feature name + one-line benefit ("Unlimited SVI reports · export DOCX + PDF").
  - Suggested plan card (name, price, "You save" if annual).
  - Primary CTA `Upgrade now` → `/pricing?tier=${segment}&highlight=${requiredPlan}`.
  - Secondary `Not now` — sets `localStorage['bid_paywall_cooldown_${feature}']` for 24h.
- Fires `paywall_hit` on open, `paywall_upgrade_click` on primary click.
- Frequency cap: max 3 opens per feature per 24h (cooldown key).

### `web/src/components/sales/trial-countdown-banner.tsx` (client)
- Fetches `/api/stripe/trial-status` on mount (fallback to null → render nothing).
- Shows when `daysRemaining <= 3 && !dismissed`.
- Copy adapts: `>1` day = amber tone, `=1` day = red tone, `=0` = "Trial ends today — add payment method".
- Primary CTA `Add payment method` → `/workspace/billing`.
- Dismiss stores in `sessionStorage` (re-appears next session so user doesn't miss the deadline).
- Fires `trial_banner_view` once per session, `trial_banner_dismiss` on close.

### `web/src/lib/sales/cta-variants.ts` (pure)
- Exports:
  ```ts
  export type SviPhase = "vision" | "validation" | "traction" | "growth" | "scale";
  export type CtaSurface = "pricing" | "founding50" | "landing" | "dashboard";
  export interface CtaVariant {
    label: string;
    href: string;
    tone: "primary" | "urgent" | "friendly";
    subtext?: string;
  }
  export function getCtaVariant(
    phase: SviPhase | null,
    surface: CtaSurface,
  ): CtaVariant;
  ```
- Copy table keyed by (phase, surface). Examples:
  - `vision` × `pricing` → "Get your first SVI score free" → `/signup`.
  - `traction` × `pricing` → "Start 7-day trial — Founder Pro" → `/signup?plan=founder-pro&trial=1`.
  - `growth` × `landing` → "Book a demo — see it on your cap table" → `/contact`.
- Pure module, no React — trivially unit-testable.

### `web/src/components/sales/__tests__/cta-variants.test.ts`
- Table-driven tests: every (phase, surface) returns a non-empty `label` and valid internal `href`.

## Acceptance criteria
- `/pricing` renders exactly one primary CTA button above the fold; secondary is a text link.
- Dashboard shows the paywall modal when a paywalled action is invoked (verified via a demo trigger `/workspace/reports` export click on a free plan).
- Trial-countdown banner appears in workspace when `trial_status.days_remaining <= 3`.
- Sticky CTA visible on `/pricing`, `/founding-50`, marketing landing; hidden after user dismisses for 7 days.
- GA4 events fire: `cta_view`, `cta_click`, `paywall_hit`, `paywall_upgrade_click`, `trial_banner_view`, `trial_banner_dismiss`, `exit_intent_shown`.
- `getCtaVariant` unit tests pass with 100% branch coverage.
- No layout shift on pricing hero (Lighthouse CLS < 0.02).

## Risks & mitigations
- **Banner fatigue** → cap sticky CTA to one dismissal per 7 days; paywall modal 24h cooldown per feature; countdown banner session-scoped.
- **Accessibility** → paywall modal must trap focus, be `role="dialog" aria-modal="true"`; sticky CTA must not overlap footer links on mobile.
- **CLS regression on `/pricing`** → reserve height for the CTA block via `min-h-[...]`.
- **A/B copy drift** → all variants live in one file (`cta-variants.ts`); analytics tags `variant` so we can measure per-cell.
- **Trial-status polling load** → only fetch on workspace layout mount, cache in React context for the session.
- **Dark-mode contrast** → sticky CTA + banner must use design tokens (`--fintech-accent`, `--fintech-ink-muted`), not raw colors.

## Rollout
1. Ship `cta-variants.ts` + tests.
2. Ship `sticky-cta.tsx`; mount on `/pricing` only, measure `cta_click` uplift for 48h.
3. Expand sticky CTA to `/founding-50` and landing.
4. Ship `paywall-nudge.tsx` with one wired feature (report export); expand feature-by-feature.
5. Ship `trial-countdown-banner.tsx` once `/api/stripe/trial-status` returns `days_remaining` consistently.
6. Ship exit-intent modal last (highest annoyance risk).
