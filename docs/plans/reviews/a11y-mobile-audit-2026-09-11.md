# Accessibility + mobile audit — UI shipped 2026-09-10/11 (S8-B)

**Date:** 2026-09-11 · **Method:** code-level review against WCAG 2.2 AA + a 400 px viewport, using the `ui-ux-pro-max` accessibility / responsive checklist and the `qa-lead` mobile + accessibility categories. No dependencies added; assertions are `renderToStaticMarkup` render tests colocated with each component plus one Playwright hydrated case.
**Scope:** dashboard tiles (Money Radar, Next Unlock, widget grid), Money Finder (`/funding` intake + paywall, report cards, Gantt, draft editor, Radar upsell, `/workspace/funding` tabs), evaluations (`/workspace/evaluations` client, report + batch dialogs, trial banner, cohort table), investor visibility switch, `nav-v2` menus + mobile sheet, `/docs/unlocks`, `/compare/*`, `/funding/programs/[capital]`.
**Result:** 31 findings — **26 fixed**, 5 deferred (listed with reasons). TypeScript 0 errors, ESLint 0 errors, vitest 615/615 in scope (56 files), 1 new Playwright case.

## Colour tokens (verified against `globals.css`)

The deadline ladder in `lib/funding/deadline-status.ts` (`DEADLINE_TONE`) and `status-chip.tsx` use only semantic ink tokens: `text-bull` = `#047857` (6.36:1 on white), `text-warn` = `#b45309` (5.93:1), `text-bear` = `#b91c1c` (7.29:1), `text-action` = `#1d4ed8` (8.59:1), `text-tertiary` = `#6b7280` (5.74:1). The `bg-*/10` tints move the ground < 0.2 in luminance, so every chip stays ≥ 5.5:1 in light mode; the dark palette re-steps the same names (`#34d399`, `#fbbf24`, `#f87171` on `#0b0f1a`, all > 7:1). Every chip also carries a text label (`DEADLINE_LABELS`) — colour is never the sole carrier. **No change needed** for the ladder itself.

## Findings

| # | Component | Finding (WCAG) | Status |
|---|-----------|----------------|--------|
| 1 | `next-unlock-card.tsx` | Card rendered dark-theme `text-slate-100/200/400` on the **light** dashboard `bg-surface` (heading 1.07:1, body 1.3:1, meta 2.9:1); pct badge `amber-400` on light = 1.7:1 (1.4.3) | **Fixed** — semantic `text-primary/secondary/tertiary`, `bg/text-bull|warn|bear` (exported `progressColor` / `progressTextColor`), test pins no `slate-*` / `-400` shades |
| 2 | `next-unlock-card.tsx` | Progress bar had no role/value; card had no landmark (4.1.2, 1.3.1) | **Fixed** — `role="progressbar"` + `aria-valuenow/min/max`, `role="region" aria-labelledby`, `motion-reduce:transition-none` |
| 3 | `widget-grid.tsx` | Drag handle was `role="button"` on a `<div>` without `tabIndex` — unreachable by keyboard; no non-drag way to reorder (2.1.1, 2.5.7 Dragging Movements) | **Fixed** — handle `tabIndex=0`, Arrow/Home/End keys reorder via `moveIndex()`; explicit **Move up / Move down** buttons (disabled at the edges); sr-only hint via `aria-describedby`; extracted `WidgetEditControls` for the render test |
| 4 | `widget-grid.tsx` | Pin toggle lacked `aria-pressed`; "Show hidden widgets (n)" had an `aria-label` that did not contain the visible text (4.1.2, 2.5.3 Label in Name) | **Fixed** — `aria-pressed={isPinned}`; mismatched `aria-label` removed |
| 5 | `widget-grid.tsx` | Moves / pin / hide gave no screen-reader feedback (4.1.3) | **Fixed** — polite `role="status"` live region mounted from first render, updated on every change |
| 6 | `widget-grid.tsx` | While customising, widget bodies were `pointer-events-none` but still in the Tab order (2.4.3) | **Fixed** — preview wrapper is `inert` |
| 7 | `widget-grid.tsx` | "Pinned" badge used `aria-label` on a plain `<span>` (ignored by most AT); decorative icons not hidden | **Fixed** — visible text only, all lucide icons `aria-hidden` |
| 8 | `money-radar-tile.tsx` | `T-12` deadline chips exposed the rung + date only through `title` (not on touch, not read by most SRs) (1.3.1) | **Fixed** — visible `T-n` is `aria-hidden`, sr-only "Closing soon, 12 days left, closes 22 Sep 2026 (AEST)" |
| 9 | `money-radar-tile.tsx` | `target="_blank"` links gave no warning; truncated "why" line had no full-text fallback | **Fixed** — sr-only "(opens in a new tab)"; `title` on the truncated line |
| 10 | `funding-paywall.tsx` | Email input `focus:outline-none` with no replacement ring (2.4.7); error not associated with the field (3.3.1) | **Fixed** — `focus-within` ring on the wrapper; `aria-describedby="fp-error"` + `aria-invalid` when an error is shown |
| 11 | `funding-paywall.tsx` | Busy states only swapped the button label (4.1.3) | **Fixed** — `aria-busy` on all three rail buttons + sr-only `role="status"` ("Opening checkout" / "Generating your report") |
| 12 | `funding-intake.tsx` | No announcement when the preview loads / lands; focus stayed on the button after `scrollIntoView` (4.1.3, 2.4.3) | **Fixed** — sr-only live region ("Matching…", "Preview ready: n grants and m programs"); result `<h3 tabIndex={-1}>` receives focus; scroll honours `prefers-reduced-motion`; preview card is a labelled `<section>` |
| 13 | `funding-intake.tsx` | `aria-controls="fi-drawer"` pointed at an element absent while collapsed; industry chip row and founder-group checkboxes had no group semantics (1.3.1) | **Fixed** — drawer always in DOM (`hidden`), `role="group" aria-labelledby` for the chips, `<fieldset>/<legend>` for the checkboxes |
| 14 | `funding-intake.tsx` | Stage radio rows ~32 px tall and non-wrapping (2.5.8; VI strings) | **Fixed** — `min-h-11 flex-wrap` |
| 15 | `grant-draft-editor.tsx` | Notice `role="status"` mounted only with its text — first message often not announced; "Copied" and generating states silent (4.1.3) | **Fixed** — live region always mounted; generating / copied / notice all inside it |
| 16 | `grant-draft-editor.tsx` | Generate button unmounts when the inline confirm appears → focus lost to `<body>` (2.4.3); Cancel had a ~20 px target (2.5.8) | **Fixed** — Confirm gets focus, Cancel returns focus to Generate; `min-h-6` + padding on both |
| 17 | `grant-draft-editor.tsx` | Textareas not described by their guidance / word count; no focus ring; `bg-amber-50 text-amber-800` warn tone ignored the theme | **Fixed** — `aria-describedby` wiring, `focus:ring-2 ring-action/30`, `bg-warn/10 text-warn` |
| 18 | `timeline-gantt.tsx` | Table twin had no `<caption>` and no `scope` on headers (1.3.1) | **Fixed** — sr-only caption, `scope="col"` × 6; `<desc>` now points to the table twin. SVG already `role="img"` + `<title>/<desc>` inside `overflow-x-auto` (min-width 640) |
| 19 | `report-cards.tsx` | ✓ / ✗ / ? glyphs carried their meaning via `aria-label` on a plain `<span>` (1.3.3, 4.1.2) | **Fixed** — glyph `aria-hidden`, sr-only "pass:" / "fail:" / "unknown:" text |
| 20 | `funding-workspace.tsx` | `role="tablist"` had all 8 tabs in the Tab order and no arrow-key navigation (ARIA APG tabs; 2.1.1) | **Fixed** — roving `tabIndex`, ArrowLeft/Right/Home/End via `rovingIndex()`, `tabpanel` focusable (`tabIndex=0`), `min-h-11` tabs with a visible focus outline |
| 21 | `funding-workspace.tsx` | Capital-map icon-only links were 14 px targets (2.5.8) | **Fixed** — 28 px hit box, name says "(opens in a new tab)" |
| 22 | `report-dialog.tsx`, `batch-dialog.tsx`, `evaluations-client.tsx` (Add dialog) | `role="dialog" aria-modal` with no focus trap, no Escape, no initial focus, no focus return (2.1.2, 2.4.3, APG dialog) | **Fixed** — new `useModalDialog()` hook (`src/hooks/useModalDialog.ts`) on `trapTab()` / `focusableWithin()` from `src/lib/a11y/keyboard.ts`; initial focus = title / first field; Escape → `onClose`; opener re-focused on close |
| 23 | `report-dialog.tsx`, `batch-dialog.tsx` | Cost preview arriving asynchronously was not announced; no `aria-describedby`; spinner / X icons not hidden; run button lacked `aria-busy` | **Fixed** — `role="status" aria-live="polite"` on the cost box, `aria-describedby`, `aria-busy`, icons `aria-hidden`; sliders are a labelled `role="group"` with `aria-valuetext`, disclosure has `aria-expanded/controls` |
| 24 | `cohort-table.tsx` | `aria-sort` + `<button>` headers were present, but no `<caption>`, sort icons unlabelled, "Open" links ambiguous, `text-ink-400` dash at 2.9:1 | **Fixed** — sr-only caption + sort state text, icons hidden, "Open Acme report (opens in a new tab)", `text-ink-500` |
| 25 | `evaluations-client.tsx` | Table lacked a caption; Dismiss (16 px) and label-edit icons (22 px) below the 24 px floor; deadline badge / sparkline meaning in `title` only; batch progress bar hidden from AT | **Fixed** — caption, `p-1.5` / `-m-1 p-1` hit boxes, sr-only deadline text + SVG `<title>`, `role="progressbar"` on the cohort bar, `text-ink-400` → `ink-500` |
| 26 | `investor-visibility-form.tsx` | Switch named by a duplicated `aria-label`; inputs had `placeholder:text-slate-400` (2.9:1) and no focus ring | **Fixed** — `aria-labelledby` to the visible heading + `aria-describedby`, `aria-busy`, `placeholder:text-slate-500`, focus ring, knob `aria-hidden` + `motion-reduce` |
| 27 | `nav-v2.tsx` | Escape closed desktop dropdowns but not the mobile sheet; sheet had no max height so a tall menu under the sticky header could not be scrolled to on short phones; panel was an unlabelled `<div>` | **Fixed** — Escape closes + re-focuses the toggle; `max-h-[calc(100dvh-4rem)] overflow-y-auto`; `<nav aria-label="Mobile">`. Desktop menus verified: `aria-haspopup/expanded/controls`, ArrowUp/Down cycle, Escape restores trigger focus |
| 28 | `/docs/unlocks` | Both tables lacked a `<caption>`; plan-column `title` tooltips not exposed to AT | **Fixed** — sr-only captions, sr-only "— plan, segment" text; `overflow-x-auto` + `scope="col"` were already correct |
| 29 | `trial-report-banner.tsx` | Spinner not hidden; separator dots read aloud; button 30 px | **Fixed** — `aria-hidden`, `aria-busy`, `min-h-6` |
| 30 | `/compare/*` | `<caption>`, `scope="col"/"row"`, `overflow-x-auto`, `min-w-[720px]` inside the scroller | **Pass** — no change |
| 31 | `/funding/programs/[capital]` | Cards: `<h3>` per card, status chip text, "(opens the official site in a new tab)" sr-only, calendar `<ol>` with month `<h3>` | **Pass** — no change |

## Mobile (400 px)

* Every table in scope sits in `overflow-x-auto` (`/docs/unlocks` × 2, `/compare/*`, Gantt table twin, evaluations, cohort); the Gantt SVG scrolls inside its wrapper (`minWidth: 640`).
* `/funding` intake, paywall and tile use `grid` / `flex-wrap` with `sm:`/`md:` breakpoints only — nothing sets a width wider than the viewport.
* New Playwright case in `web/tests/e2e/smoke/post-deploy.spec.ts`: `/funding` at 400×800 asserts `document.documentElement.scrollWidth <= window.innerWidth` after the intake form hydrates.
* `nav-v2` mobile sheet now scrolls within the viewport.
* Touch targets: all controls touched here are ≥ 24 px (`min-h-6`); primary actions (tabs, stage radios, CTA buttons) ≥ 44 px.

## Motion

`globals.css` already forces `transition/animation-duration: 0.001ms` under `prefers-reduced-motion: reduce`, so every `animate-spin`, `transition-transform` and the progress-bar `transition-all` are covered globally. `motion-reduce:` utilities were added where the animation is component-specific, and the intake's `scrollIntoView` switches to `behavior: "auto"` under reduced motion.

## Deferred (with reason)

1. **`aria-hidden` sweep of the page behind a modal** — `useModalDialog` relies on `aria-modal="true"` (supported by current NVDA/JAWS/VoiceOver). Next's app-router tree puts the overlay inside the page root, so a sibling sweep would only hide toasts / dev overlays. Revisit if a portal-based dialog primitive lands.
2. **`/docs/unlocks` matrix chips' `title` tooltips** ("n rows · m dimmed") — the visible text already carries the meaning ("(2 upgrade)"); the extra count is supplementary. Low value vs. table noise.
3. **`money-radar-tile` "why" truncation** — `truncate` keeps the one-line layout the D-2 tile was designed for; full text is in `title` and on the report. A `line-clamp-2` would change the tile height.
4. **Cohort table `Δ` colour** — `formatDelta` already prefixes ▲/▼ so colour is not the only carrier; no change.
5. **Hydrated keyboard tests** (arrow-key tab switching, dialog trap in a real DOM) — this workspace has no `@testing-library` / JSDOM and adding one is out of scope; the key arithmetic and trap logic are unit-tested in `src/lib/a11y/keyboard.test.ts`, and the DOM behaviour should be verified manually on production (dev mode never hydrates — see memory note).

## Files

New: `web/src/lib/a11y/keyboard.ts` (+ `.test.ts`), `web/src/hooks/useModalDialog.ts`, `web/src/components/dashboard/widget-grid.test.tsx`, `web/src/components/funding/report-cards.test.tsx`, `web/src/components/funding/grant-draft-editor.test.tsx`, `web/src/app/(app)/(founder)/workspace/evaluations/batch-dialog.test.tsx`, `web/src/app/(app)/(founder)/workspace/evaluations/cohort/cohort-table.test.tsx`.
Changed: the components in the table above plus their colocated tests (`money-radar-tile`, `next-unlock-card`, `timeline-gantt`, `funding-intake`, `workspace/funding/page.test.tsx`) and `web/tests/e2e/smoke/post-deploy.spec.ts`.
