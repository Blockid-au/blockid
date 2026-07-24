# CPO Design — Onboarding v2 + Per-Feature Walkthrough System

Owner: CPO agent — blockid.au
Date: 2026-07-24
Related surfaces: `web/src/app/onboarding/`, `web/src/components/onboarding/*`, `web/src/components/workspace/product-tour.tsx`, `web/src/components/workspace/welcome-guide.tsx`, `web/src/app/guide/[chapter]/page.tsx`

## 1. Problem statement

Founders sign up and land on the workspace. Today they see:
- A one-shot `WelcomeGuide` card with 3 static links (SVI, Evidence, Dashboard).
- A phase banner (`ProductTour`) that only prints "You are on Phase X of 12".
- A `/guide/[chapter]` marketing surface that is not connected to in-app spotlights.

There is no visual, animated, per-feature walkthrough. Nothing "shows" the founder what a button does or where to click next. New surfaces (metrics dashboard, cap-table manager, oauth connector, integration cards, priority tasks, roadmap steps, weekly reports) launch without any spotlight — founders miss features and churn.

## 2. Design goals

1. First-run experience: on first workspace load after signup, run a **5-step guided tour** that adapts to the founder's current growth phase (1–12).
2. Per-feature first-visit spotlight: every feature route (evidence, cap-table, metrics, integrations, vesting, reports) shows a highlight overlay the first time it opens, with a short animation, screenshot, and CTA.
3. Contextual "next step" recommendation card that stays parked in the sidebar and always points to the highest-leverage action for the current phase.
4. Dismissible + resumable — all tours can be re-opened from `/guide/[chapter]` and from a "Take the tour again" link in the profile menu.
5. Bilingual (EN/VI) copy, keyboard accessible, respects `prefers-reduced-motion`.
6. Zero new npm deps (no react-joyride/shepherd/driver.js). Built on existing shadcn primitives + Framer-free CSS animations.

## 3. System architecture

```
                          +-------------------------+
                          |  tour-state.ts (pure)   |
                          |  phase → chapter slug   |
                          +------------+------------+
                                       |
      +--------------------------------+---------------------------------+
      |                                |                                 |
+-----v-------+                +-------v----------+              +-------v-------+
| ProductTour |                | FeatureSpotlight |              | NextStepCard  |
| (banner+cta)|                | (overlay+anchor) |              | (sidebar tile)|
+-----+-------+                +-------+----------+              +-------+-------+
      |                                |                                 |
      |                     +----------v----------+                      |
      |                     | feature-tours.ts    |                      |
      |                     | registry:           |                      |
      |                     |  id, steps[],       |                      |
      |                     |  targetSelector,    |                      |
      |                     |  screenshot, i18n   |                      |
      |                     +----------+----------+                      |
      |                                |                                 |
      |                     +----------v----------+                      |
      |                     | tour-media.tsx      |                      |
      |                     | /public/tour/<id>.png                      |
      |                     +---------------------+                      |
      |                                                                  |
      +--------------+---------------------+-----------------------------+
                     |                     |
              +------v-------+     +-------v---------+
              | localStorage |     | /api/tour/state |
              | (fallback)   |     | (persist per-  |
              +--------------+     |  user completion|
                                   +-----------------+
```

## 4. First-run 5-step tour (phase-tied)

`ProductTour` upgraded from a single banner into a **step-machine overlay**. The 5 steps for a Phase-1 (Idea/Validation) founder:

| # | Anchor selector           | Copy (EN)                                   | Media                        |
|---|---------------------------|---------------------------------------------|------------------------------|
| 1 | `[data-tour="phase-map"]` | "You are on Phase 1 — Validation."          | `/tour/phase-map.png`        |
| 2 | `[data-tour="svi-score"]` | "Get your SVI score in 60 seconds."         | `/tour/svi-score.png`        |
| 3 | `[data-tour="evidence"]`  | "Upload evidence to boost score."           | `/tour/evidence.png`         |
| 4 | `[data-tour="agents"]`    | "AI agents run analyses for you."           | `/tour/agents.png`           |
| 5 | `[data-tour="next-step"]` | "Your next best action is always here."     | `/tour/next-step.png`        |

Steps swap when phase changes: Phase 4 (Team) surfaces cap-table + ESOP steps, Phase 8 (Growth) surfaces reseller/integrations, etc. Mapping lives in `feature-tours.ts` under `PHASE_TO_TOUR_STEPS`.

Behaviour:
- On mount, fetch `/api/tour/state` for `firstRunCompleted` flag (falls back to `localStorage.blockid_tour_v2_firstrun`).
- If not completed, dim page (`bg-ink-900/40`), render step popover anchored to the DOM node matched by `targetSelector`.
- Popover contains: media, title, body, "Skip tour", "Back", "Next" (or "Finish").
- On finish/skip → POST `/api/tour/state` `{ firstRunCompleted: true, dismissedAt }`.

## 5. Per-feature spotlight

`FeatureSpotlight` is a small client component wired into each feature page:

```tsx
<FeatureSpotlight tourId="cap-table-v1" />
```

Reads registry entry from `feature-tours.ts`, checks completion in `localStorage.blockid_ft_<tourId>`, and if not seen, renders an overlay tour scoped to that page.

Registry entry shape:

```ts
export interface FeatureTour {
  id: string;                        // "cap-table-v1"
  route: string;                     // "/workspace/cap-table"
  triggerPhase?: number[];           // only show for these phases
  steps: FeatureTourStep[];
}
export interface FeatureTourStep {
  targetSelector: string;            // '[data-tour="add-shareholder"]'
  title: { en: string; vi: string };
  body:  { en: string; vi: string };
  media?: { src: string; alt: string }; // /public/tour/*.png
  placement?: "top" | "bottom" | "left" | "right";
}
```

Initial feature tours to ship:
- `svi-score-v1` (Chapter 2)
- `evidence-upload-v1` (Chapter 2)
- `cap-table-v1` (Chapter 5)
- `esop-vesting-v1` (Chapter 6)
- `metrics-dashboard-v1` (Chapter 8)
- `integrations-oauth-v1` (Chapter 8)
- `weekly-report-v1` (Chapter 9)
- `exit-readiness-v1` (Chapter 12)

## 6. Contextual "Next Step" recommendation card

A persistent card in the workspace sidebar that reads:
- Current phase (from `/api/svi/phase-progress`).
- Highest-priority pending task (from `priority-tasks.tsx` source).

Card renders:
```
[icon]  Next best step
        "Upload financial model to unlock CFO agent"
        [Take me there →]  [Why this?]
```

Component: reuse existing `PriorityTasks` selection logic but present as single tile with animated pulse ring on `data-tour="next-step"`.

## 7. Persistence + resumability

- Server: new route `web/src/app/api/tour/state/route.ts` (GET/PUT) reading/writing `user_tour_state` table (`user_id`, `first_run_completed`, `dismissed_feature_ids jsonb`, `updated_at`).
- Client fallback: `localStorage.blockid_tour_v2_*` mirrors.
- Guide chapter page gets a floating "Restart tour for this chapter" button that calls a `resetFeatureTour(chapterSlug)` helper — clears both localStorage keys and issues DELETE to `/api/tour/state`.
- Profile menu adds "Restart product tour" that clears `firstRunCompleted`.

## 8. Accessibility + motion

- Overlay uses `role="dialog"` `aria-modal="true"` `aria-labelledby`.
- Focus trap inside popover; ESC skips step; arrow keys move Next/Back.
- Fade/scale animation gated on `matchMedia('(prefers-reduced-motion: reduce)')`.
- Dim layer uses `pointer-events: auto` only when active step exists; step targets get `z-index: 60; box-shadow: 0 0 0 4px var(--tw-ring-color)`.

## 9. i18n

- All copy sourced from `feature-tours.ts` `{ en, vi }` shape (same convention as `startup-journey.ts`).
- `useLocale()` already provides current locale (see `product-tour.tsx`).

## 10. Rollout plan

1. Land `feature-tours.ts` registry with 3 tours (svi, evidence, cap-table) behind flag `NEXT_PUBLIC_TOUR_V2=1`.
2. Ship `FeatureSpotlight` + `TourMedia` components with tests.
3. Refactor `ProductTour` into step-machine overlay; keep old banner as `<PhaseBanner />` fallback when flag off.
4. Upgrade `WelcomeGuide` into `NextStepCard` sidebar tile.
5. Wire persistence route + guide restart button.
6. Flip flag on for 10% of new signups, monitor `onboarding_completed` GA4 event.
7. Roll to 100% + backfill remaining feature tours.
