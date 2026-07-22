# GA4 Event Catalogue — Showcase Surfaces (Track B)

Source of truth for the GA4 / GTM `dataLayer` events emitted from the four
public Track B surfaces. Closes CDO advisory §23 rec #2 (CMO/CPO joint) —
before this catalogue, `<PageTracker />` mounted on every showcase page but
no matching entry existed in the dispatcher, so the showcase funnel was
invisible in GA4 reports.

## Event dispatcher

- Registry: `web/src/lib/analytics.ts` (`AnalyticsEventMap`)
- Client emitter: `web/src/lib/analytics.ts` (`trackEvent`)
- Pure resolver: `web/src/lib/analytics/showcase-tracker.ts`
- Mount point: `web/src/components/analytics/page-tracker.tsx`

Every showcase surface renders `<PageTracker page="…" />` at the top of its
JSX. The `useEffect` fires exactly once per mount and calls
`resolveShowcasePageEvent(page, ctx)` — a pure function whose output feeds
`trackEvent(name, params)`. The pure indirection lets Vitest cover the
mapping without a jsdom environment.

## Surface → event map

| Surface (`page=`) | Event | Params | Notes |
|---|---|---|---|
| `/showcase/blockid` (`showcase-blockid`) | `showcase_public_viewed` | `{ referrer: string }` | Referrer collected client-side from `document.referrer`, then trimmed to `origin + pathname` (no query, no hash). Empty string when the user typed the URL directly. |
| `/guide/reports` (`guide-reports`) | `showcase_reports_viewed` | `{ total_reports: number, source: "marketing" }` | `total_reports` is the count returned by `summariseGallery(rows).total_rows` on the server render, so the client event carries the same headline number the page displays. |
| `/guide/[chapter]` (`guide-chapter`) | `showcase_guide_viewed` | `{ chapter: 1..12, locale: "en" \| "vi", source: "marketing" }` | `chapter` is the `Chapter.phase` value from `web/src/lib/guide/startup-journey.ts` (already the U.9 phase number). `locale` mirrors the `blockid_lang` cookie via `getLocale()`. |
| `/workspace/guide/[chapter]` (`workspace-guide-chapter`) | `showcase_guide_viewed` | `{ chapter: 1..12, locale: "en" \| "vi", source: "onboarding" }` | Same event as the marketing surface; `source="onboarding"` distinguishes authenticated founder reads from anonymous marketing reads. |

## GA4 audience recipes

- **Anonymous funnel top:** `showcase_public_viewed` OR `showcase_reports_viewed` in
  the last 28 days → segment into GA4 "Showcase visitors".
- **Guide engagement:** count `showcase_guide_viewed` where `source=marketing`
  and group by `chapter`. Compare against the same event with
  `source=onboarding` to see how many founders return to the same chapter
  once inside the workspace.
- **VI locale reach:** filter `showcase_guide_viewed` where `locale=vi` —
  useful for tracking the ROI of the VI parity effort landed in B2–B4.

## Related events (already registered, not fired from these surfaces)

- `showcase_phase_advanced` — cron-emitted from the daily deploy/tick loop
  when BlockID.au's own phase pointer moves.
- `showcase_report_downloaded` — reserved for the per-row `/guide/reports`
  download button; the plan §284 redaction pipeline is still pending, so
  the button isn't shipped yet and this event doesn't fire.
- `showcase_integration_wired` — fires from `/workspace/integrations` when
  an OAuth connector transitions to `active`.

## Test coverage

- `web/src/lib/analytics/showcase-tracker.test.ts` — 12 cases covering the
  four page slugs plus edge cases (missing chapter/locale, out-of-range
  chapter, malformed referrer, empty referrer, explicit source override).

## Change control

- Adding a new showcase event: extend `AnalyticsEventMap` in
  `web/src/lib/analytics.ts`, then teach `resolveShowcasePageEvent` about
  the new mapping, add a Vitest case, and update this catalogue.
- Retiring an event: keep the registry entry for at least one GA4 lookback
  window (28 days) so historical reports don't 404, then remove the
  resolver arm + tests + this catalogue row in the same PR.
