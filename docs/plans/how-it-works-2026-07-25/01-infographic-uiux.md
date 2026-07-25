# How It Works — Animated Infographic Redesign

**Date:** 2026-07-25
**Owner:** ui-ux-pro-max
**Scope:** `web/src/components/landing/how-it-works.tsx` (upgradeV2 branch on `/`)

---

## 1. Design intent

Replace the 3-card "Search / Score / Share" strip with a **5-step founder-journey
infographic** that mirrors the platform's real workflow and gives the visitor a
narrative:

> Search idea → Onboard → Score → Build → Raise

The section is composed of three vertical bands, each with a distinct job:

1. **Section head** — eyebrow ("How it works"), H2 ("See How It Works"),
   deck ("Watch how BlockID helps founders go from idea to investor-ready in
   minutes.").
2. **Video hero** — 16:9 muted autoplay MP4 (produced by the Remotion agent),
   framed in a rounded-2xl gradient border, with a branded SVG poster as
   fallback.
3. **Step timeline** — five steps rendered as a **vertical 7-col grid on
   desktop** (col 1 = numbered badge + connector, cols 2-7 = card with icon,
   headline, body, mini screenshot). On mobile it collapses to a
   **horizontal snap-scroll strip** (`snap-x snap-mandatory`).
4. **Primary CTA** — single anchor: *Get your SVI in 60 seconds →* pointing
   to `/`.

### Design tokens

Reuses the `lux` theme tokens already on the page (`data-theme="lux"` set by
`page.tsx`). No new tokens introduced:

| Token                       | Usage                                   |
| --------------------------- | --------------------------------------- |
| `--brand-navy`              | Section background base                 |
| `--brand-gold`              | Accent, badge fill, CTA                 |
| `--fintech-ink`             | Headings                                |
| `--fintech-ink-muted`       | Body copy                               |
| `--fintech-border`          | Card & connector strokes                |
| `--fintech-bg-elevated`     | Card surface                            |
| `--fintech-accent`          | Icon glyph tint                         |

Spacing follows the existing 4-pt rhythm (`gap-4`, `gap-6`, `gap-10`,
`py-16`). Radii use the existing `rounded-2xl` for hero + card, `rounded-xl`
for icon chip, `rounded-full` for the numbered badge.

### Motion rules

* **No new dep.** All motion is CSS `@keyframes` + `IntersectionObserver`
  toggling a `data-in-view` attribute on each step.
* **Connector draw-in:** a vertical `1px` gradient line grows from
  `scaleY(0)` to `scaleY(1)` over 500ms when the badge column enters the
  viewport.
* **Card lift:** 12px translateY + fade-in over 400ms, staggered 80ms per
  step (via inline `animation-delay`).
* **Video:** autoplays muted, loops, `playsInline`. On `hover/focus-within`,
  reveals native `controls`.
* **Reduced motion:** the whole section respects
  `@media (prefers-reduced-motion: reduce)` — connector renders fully drawn
  immediately, cards skip translate, and the video swaps to its poster
  (`autoPlay={false}`, `controls`).

### Accessibility

* Section wrapped in `<section aria-labelledby="how-it-works-heading">`
  (already set by page.tsx — we render the visible H2 inside our component
  and mark the page-level one `sr-only`).
* Each icon has `aria-hidden="true"`; step semantics come from an
  ordered list `<ol>` with visible numbered badges.
* Video element has `<track kind="captions">` slot ready (empty in dev,
  swapped by Remotion agent) and a descriptive `aria-label`.
* Mobile snap-scroller has `role="list"` and each card `role="listitem"`
  plus `tabindex="0"` so keyboard users can arrow-tab through steps.
* Contrast: gold-on-navy passes WCAG AA at 4.7:1; ink-muted on elevated
  surface tested for AA at body-copy sizes.

---

## 2. Step content (single source of truth)

| # | Icon (lucide)  | Headline (≤3 words) | Body (1 sentence)                                                                                          | Screenshot                                    |
| - | -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1 | `Search`       | Search your idea    | Type a company name, ABN, or URL and BlockID pulls public filings to score a fresh profile instantly.       | `/tour/onboarding/step-01-home.png`           |
| 2 | `ClipboardList`| Onboard in minutes  | Answer a five-step wizard, pick your current growth phase and your next milestone goal.                     | `/tour/onboarding/step-goal.png`              |
| 3 | `Gauge`        | Score investor gaps | Thirteen criteria grade your Startup Value Index, each with cited evidence and a trend line.                | `/tour/svi/step-score.png`                    |
| 4 | `FolderOpen`   | Build the room      | Data room seeded with ten investor-ready templates, live cap table, and vesting schedules — off-chain safe. | `/tour/dataroom/step-folders.png`             |
| 5 | `Rocket`       | Raise on evidence   | Assemble investor packs, watchlist matched funds, and one-click accelerator applications.                   | `/tour/exit-readiness/step-founder-tile.png`  |

All PNG paths verified to exist in `web/public/tour/**` — no missing assets
at build time.

---

## 3. Layout wireframe

### Desktop (≥ md)

```
┌───────────────────────────────────────────────────────────────┐
│  eyebrow • H2 • deck (centered, max-w-2xl)                    │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────── video 16:9 ───────────────────────────┐ │
│  │                                                          │ │
│  │        (Remotion MP4, muted, autoplay, loop)             │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│  ol.grid.grid-cols-7                                          │
│    ┌──┐                                                       │
│    │01│───────  Icon  Search your idea                        │
│    └──┘         Body copy…                     [screenshot]   │
│     │                                                         │
│    ┌──┐                                                       │
│    │02│───────  Icon  Onboard in minutes                      │
│    └──┘         Body copy…                     [screenshot]   │
│     │                                                         │
│    …                                                          │
├───────────────────────────────────────────────────────────────┤
│                  [ Get your SVI in 60 seconds → ]             │
└───────────────────────────────────────────────────────────────┘
```

### Mobile (< md)

* Video collapses to full-width 16:9.
* Steps become a horizontal `overflow-x-auto snap-x snap-mandatory` strip;
  each card is `w-[280px]` with the numbered badge in its top-left. Scroll
  indicator dots below.

---

## 4. File plan

### 4.1 Rewritten

* **`web/src/components/landing/how-it-works.tsx`** — server component
  (module-scope constants; no hooks). Renders section head, `<HowItWorksVideo/>`,
  the `<ol>` of `<HowItWorksStep/>` cards, and the CTA. Keeps named export
  `HowItWorks` + default export so `page.tsx` doesn't change.

### 4.2 New

* **`web/src/components/landing/how-it-works-video.tsx`** — `"use client"`
  component. Renders `<video muted autoPlay loop playsInline preload="metadata"
  poster="/media/how-it-works-poster.svg">` pointing at
  `/media/how-it-works.mp4`. Uses `onError` to swap the `<video>` for the
  static poster if the MP4 404s (dev-safe). Adds `controls` on `:hover` /
  `:focus-within` via a CSS class.
* **`web/src/components/landing/how-it-works-step.tsx`** — server component.
  Props: `{ index, Icon, title, body, screenshot }`. Renders a numbered
  badge + connector `<span>` + card. Uses `IntersectionObserver` via a small
  `"use client"` boundary **only for the connector** (`how-it-works-connector.tsx`)
  — the card itself stays server-rendered to keep bundle < 8KB gz.
* **`web/public/media/how-it-works-poster.svg`** — 1920×1080 branded SVG,
  navy gradient background, gold BlockID glyph centered, five icon chips
  arranged in a row across the bottom third with the step labels beneath.
  Used as `<video poster>` and as the `<img>` fallback when the MP4 is
  missing.

Total added TSX (est.): ~180 lines. Client JS surface is one 40-line
observer hook — well under the 8 KB gz budget.

---

## 5. Interaction states

| Element             | Idle                                     | Hover / focus                                                       | Active            |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------- | ----------------- |
| Video frame         | Subtle gold ring (1px)                   | Native controls fade in over 150ms                                  | —                 |
| Step card           | Elevated surface, border `--fintech-border` | translateY(-2px) + border shifts to `--brand-gold/40`               | ring-2 gold       |
| Numbered badge      | Gold fill, navy digit                    | Slight scale(1.05), 200ms                                            | —                 |
| Connector line      | 1px gradient (gold → transparent)        | —                                                                   | grows on in-view  |
| CTA                 | Gold pill, navy text                     | brightness(1.08), translateY(-1px), shadow-lg                        | pressed ring      |

---

## 6. Acceptance criteria

1. Renders inside the `upgradeV2` branch of `web/src/app/page.tsx` with **no
   change to `page.tsx`**.
2. Works in both light + `data-theme="lux"` dark themes without style
   regressions.
3. Video autoplays muted (browser-compliant), loops, plays inline on iOS.
4. Users with `prefers-reduced-motion: reduce` see a static poster (no
   autoplay) and no timeline animations.
5. All five icons have `aria-hidden="true"`; step order is conveyed via
   `<ol>` + visible numbered badges.
6. Mobile viewport shows a horizontal snap-scrolling strip; no horizontal
   overflow on the page body.
7. Added JS payload for the section is < 8 KB gzipped
   (`next build` reports parity with baseline within 8 KB for `/`).
8. Missing `/media/how-it-works.mp4` in dev renders the SVG poster instead
   without console errors.

---

## 7. Risks & mitigations

* **MP4 not yet produced** — poster SVG designed to stand alone; component
  detects `onError` and swaps to `<img>`.
* **Autoplay blocked on Safari low-power** — muted+playsInline satisfies
  most policies; poster shown until interaction.
* **Bundle creep** — connector observer is the only client boundary; if
  size ever exceeds budget, drop the observer and always render the
  connector in "drawn" state (still passes AA).
* **Tour PNG drift** — screenshots are sourced from the tour capture
  pipeline; if a filename changes there, the step card gracefully falls
  back to an icon-only card via `next/image onError`.
