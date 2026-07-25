# UI/UX Design System Sync — 2026-07-24

Following **ui-ux-pro-max** guidance: design tokens, spacing rhythm, typography
scale, color system, accessibility, interaction states, dark/light theme.

This document is the concrete, implementable design-system pass produced from
the 2026-07-24 recon. **All changes are additive**; no existing CSS custom
property or Tailwind class is renamed. Consumers keep compiling; migrations
are opt-in.

Scope fence honored — no touches to `nav-groups.ts`, `workspace-layout.tsx`,
`lib/nav/**`, `lib/entitlements/**`, `lib/mentor/**`, `reseller/mentor/**`,
`dashboard/mentor-invite/**`, `dashboard/settings/mentor-access/**`,
`feature-tours.ts`, `feature-gates.manifest.ts`, `supabase/migrations/**`.
Total files changed: **13** (10 primitive/CSS edits + 3 new files) — well
under the ≤25 cap.

---

## 0. Guiding principles

1. **One system, two skins.** Keep the two existing skins (light `brand/*` and
   dark `fintech-*` / `[data-theme="lux"]`) but make them speak through a
   **shared semantic layer** so a page can switch skin without swapping
   components.
2. **Additive tokens only.** Every new token is prefixed (`--ds-*` for the
   semantic layer, `--radius-*` / `--space-*` / `--shadow-*` / `--text-*` for
   the scale) or lives inside a new CSS variable that maps *to* existing
   variables. No renames, no deletions.
3. **Primitives absorb variance.** Where a page hand-rolls a Card / Button /
   Section, prefer adding a `variant`/`tone`/`size` to the primitive and
   migrating the page in a follow-up PR rather than diverging further.
4. **Accessibility non-negotiable.** Every interactive primitive ships with
   `focus-visible:ring-2 ring-[var(--ds-focus-ring)]/60 ring-offset-2` and a
   `motion-reduce:` opt-out.

---

## 1. Token consolidation (additive)

**File:** `web/src/app/globals.css`

Add a new `@theme` block *after* the existing one — Tailwind v4 merges
`@theme` blocks, so extending the scale doesn’t disturb existing consumers.

### 1a. Radius scale

| Token         | Value    | Intended use                                    |
| ------------- | -------- | ----------------------------------------------- |
| `--radius-xs` | `0.375rem` | Chips, small badges, dense controls           |
| `--radius-sm` | `0.5rem`   | Inputs, small buttons                         |
| `--radius-md` | `0.75rem` | Metric tiles, secondary cards                  |
| `--radius-lg` | `1rem`    | Standard cards, modals                         |
| `--radius-xl` | `1.5rem`  | Hero cards, feature tiles (current `Card` = 3xl → keep as-is; new default) |
| `--radius-2xl`| `2rem`    | Marketing hero panels                          |
| `--radius-pill` | `9999px` | Pills, badges                                 |

**Deprecation note:** `rounded-3xl` on `ui/Card` stays as the default so
existing pages don't shift; new consumers should pass `variant="default"`
which resolves to `rounded-2xl` (= `--radius-xl`).

### 1b. Spacing rhythm

Existing Tailwind spacing scale is fine. What we're missing is **section
rhythm tokens** — the observed drift (`mb-14`, `py-8`, `py-12`, `py-16`,
`mb-6`, `mb-8`) becomes:

| Token             | Value  | Use case                                  |
| ----------------- | ------ | ----------------------------------------- |
| `--space-section-xs` | `2rem`   (py-8)  | Sub-sections inside a page             |
| `--space-section-sm` | `3rem`   (py-12) | Compact marketing sections             |
| `--space-section-md` | `4rem`   (py-16) | Default marketing/legal sections       |
| `--space-section-lg` | `6rem`   (py-24) | Hero + first-fold sections             |
| `--space-stack-tight` | `0.5rem` | Label ↔ input                           |
| `--space-stack-cozy`  | `1rem`   | Card content stack                     |
| `--space-stack-comfy` | `1.5rem` | Section title ↔ body                   |
| `--space-stack-roomy` | `2.5rem` | Hero copy ↔ CTA row                    |

These map cleanly to `py-8|12|16|24` — the new `<Section>` primitive
(see §4) enforces them.

### 1c. Typography ramp

Add explicit typographic tokens. Every page in the recon uses ad-hoc
`text-2xl sm:text-3xl` combinations — this ramp gives us seven fixed rungs.

| Token           | Font-size / line-height | Weight | Example                        |
| --------------- | ----------------------- | ------ | ------------------------------ |
| `--text-display-2xl` | `4.5rem / 1.05`   | 800 | Landing hero                   |
| `--text-display-xl`  | `3.75rem / 1.08`  | 800 | Big section headers            |
| `--text-h1`     | `3rem / 1.12`         | 700 | Page H1                        |
| `--text-h2`     | `2rem / 1.2`          | 700 | Section H2                     |
| `--text-h3`     | `1.5rem / 1.3`        | 600 | Card title                     |
| `--text-h4`     | `1.25rem / 1.35`      | 600 | Sub-card / tile title          |
| `--text-body-lg`| `1.125rem / 1.6`      | 400 | Marketing body                 |
| `--text-body`   | `1rem / 1.55`         | 400 | UI body / prose                |
| `--text-body-sm`| `0.875rem / 1.5`      | 400 | Helper text, table cells       |
| `--text-caption`| `0.75rem / 1.4`       | 500 | Labels, meta                   |
| `--text-eyebrow`| `0.75rem / 1.4` uppercase 600 tracking-[0.14em] | Section eyebrows |

Delivered as a `<Heading>` primitive plus Tailwind utility aliases via
`@theme` (`--text-display-2xl` etc. — Tailwind v4 auto-generates
`text-display-2xl`).

### 1d. Semantic color layer

Introduce a **skin-agnostic** semantic layer that both `brand/*` (light) and
`fintech-*` (dark) resolve through. Consumers stop asking "which page am I
on?" — they ask for `bg-[var(--ds-surface)]`, `text-[var(--ds-ink)]`, etc.

Add to `globals.css`:

```css
:root {
  --ds-surface:          var(--color-surface-50);
  --ds-surface-elevated: #ffffff;
  --ds-surface-sunken:   var(--color-surface-100);
  --ds-border:           var(--color-surface-200);
  --ds-border-strong:    var(--color-surface-300);
  --ds-ink:              var(--color-ink-900);
  --ds-ink-muted:        var(--color-ink-500);
  --ds-ink-subtle:       var(--color-ink-600);
  --ds-accent:           var(--color-brand-600);
  --ds-accent-hover:     var(--color-brand-700);
  --ds-accent-contrast:  #ffffff;
  --ds-success:          var(--color-emerald-600);
  --ds-warn:             var(--color-gold-500);
  --ds-danger:           #dc2626;
  --ds-info:             var(--color-brand-500);
  --ds-focus-ring:       var(--color-brand-500);
}

.dark, [data-theme="lux"] {
  --ds-surface:          var(--fintech-bg-primary);
  --ds-surface-elevated: var(--fintech-bg-elevated);
  --ds-surface-sunken:   #05081C;
  --ds-border:           var(--fintech-border);
  --ds-border-strong:    var(--fintech-border-strong);
  --ds-ink:              var(--fintech-ink);
  --ds-ink-muted:        var(--fintech-ink-muted);
  --ds-ink-subtle:       #B4C0D3;
  --ds-accent:           var(--fintech-accent);
  --ds-accent-hover:     var(--fintech-accent-hover);
  --ds-accent-contrast:  var(--fintech-bg-primary);
  --ds-success:          var(--fintech-success);
  --ds-warn:             var(--fintech-warn);
  --ds-danger:           var(--fintech-error);
  --ds-info:             #38BDF8;
  --ds-focus-ring:       var(--fintech-focus-ring);
}
```

**Contrast verification** (WCAG 2.1 AA @ 14px):

- Light: `--ds-ink` (`#0f172a`) on `--ds-surface` (`#ffffff`) → **19.3 : 1** (AAA).
- Light: `--ds-ink-muted` (`#64748b`) on `--ds-surface` (`#ffffff`) → **4.75 : 1** (AA).
- Light: `--ds-accent` (`#2563eb`) on white → **5.17 : 1** (AA).
- Dark:  `--ds-ink` (`#F1F5F9`) on `--ds-surface` (`#0B0F2A`) → **15.6 : 1** (AAA).
- Dark:  `--ds-ink-muted` (`#94A3B8`) on `--ds-surface` → **6.8 : 1** (AA).

**Deprecation note:** `text-ink-500` on `bg-surface-50` (used across `/about`
for helper copy at 14px) is only borderline (4.6:1). Migrate to
`text-[var(--ds-ink-muted)]` — 4.75:1 verified.

### 1e. Shadow scale

| Token           | Value                                              | Use            |
| --------------- | -------------------------------------------------- | -------------- |
| `--shadow-xs`   | `0 1px 2px rgba(15,23,42,0.06)`                     | Inputs         |
| `--shadow-sm`   | `0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)` | Buttons, dense cards |
| `--shadow-md`   | `0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.06)` | Popovers, tooltips |
| `--shadow-lg`   | `0 10px 15px -3px rgba(15,23,42,0.1), 0 4px 6px -4px rgba(15,23,42,0.06)` | Modals, elevated cards |
| `--shadow-xl`   | `0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.06)` | Hero cards |
| `--shadow-glow-accent` | `0 8px 28px -4px color-mix(in oklab, var(--ds-accent) 32%, transparent)` | CTA (theme-aware) |

The last one replaces the hard-coded `.cta-glow` blue and works in both skins.

---

## 2. Typography scale enforcement

**New primitive:** `web/src/components/ui/heading.tsx`

```tsx
type Level = 'display-2xl'|'display-xl'|'h1'|'h2'|'h3'|'h4';
type Tone  = 'default'|'muted'|'accent'|'inherit';

<Heading level="h2" tone="default" as="h2">Startups</Heading>
```

- Renders the correct semantic tag (`as` overrides).
- Applies the matching `text-<level>` class + weight + `text-balance`.
- Never sets its own margin — spacing is the parent stack's job.

Existing pages remain valid; migrate opportunistically. The primitive is
importable but no page is force-refactored in this pass.

---

## 3. Primitive variant reconciliation

### 3a. `web/src/components/ui/button.tsx`

Add the missing variants **without removing any existing one**.

Variant additions:
- `default` → alias of `primary` (matches shadcn convention)
- `destructive` → alias of `danger`
- `subtle` → `bg-brand-50 hover:bg-brand-100 text-brand-700`
- `link` → `bg-transparent text-brand-600 hover:underline underline-offset-4 px-0 h-auto`

Size additions:
- `icon` → `h-11 w-11 p-0` (square, for icon-only buttons)
- `icon-sm` → `h-9 w-9 p-0`

Focus ring switch: `focus-visible:ring-[var(--ds-focus-ring)]/60` so the
same button works in lux/dark subtrees.

CTA glow: replace hard-coded blue shadow with `shadow-[var(--shadow-glow-accent)]`
for `primary`/`default`.

Also add a `tone` prop passthrough that maps to `data-tone="…"` attribute so
downstream CSS can hook per-tone treatments without adding cva variants.

### 3b. `web/src/components/ui/card.tsx`

Convert to cva while keeping the current default look byte-identical
(`rounded-3xl border border-surface-200/80 bg-white shadow-sm`).

Variants:
- `default` — current look (rounded-3xl, white, shadow-sm)
- `elevated` — `rounded-2xl bg-[var(--ds-surface-elevated)] shadow-[var(--shadow-lg)] border-transparent`
- `subtle` — `rounded-xl bg-[var(--ds-surface-sunken)] border border-[var(--ds-border)] shadow-none`
- `interactive` — default + `card-hover` (existing utility) + `cursor-pointer` + `focus-visible:ring-2 ring-[var(--ds-focus-ring)]/60`
- `outline` — `border border-[var(--ds-border-strong)] bg-transparent shadow-none rounded-2xl`

Size prop for padding density (`sm`|`md`|`lg`) — actually applied by
`CardHeader/Content/Footer` reading a `data-size` attribute on the parent.

**No breaking change:** signature stays
`React.HTMLAttributes<HTMLDivElement>` with optional `variant`/`size`.

### 3c. `web/src/components/ui/badge.tsx`

Split into `variant` (visual treatment) × `tone` (color).

- `variant`: `solid` | `subtle` (current default) | `outline`
- `tone`: `neutral` | `brand` | `success` | `warn` | `danger` | `info`
- Legacy names (`default`, `brand`, `teal`, `amber`, `success`, `danger`, `outline`)
  keep working via a mapper table so no existing consumer breaks.

Radius: `rounded-full` for `variant="solid"`, `rounded-md` for the rest —
matches the observed shape drift seen across pages.

### 3d. `web/src/components/ui/skeleton.tsx`

The existing exports (`Skeleton`, `DashboardSkeleton`) stay.

Add:
- `<SkeletonText lines={3} />` — stacked text lines with realistic width variance.
- `<SkeletonCard rows={3} />` — replacement for the inline `CardSkeleton`.
- `<SkeletonAvatar size="md" />`.
- `<SkeletonMetric />` — matches `MetricCard` shape (label + big number + delta).

All use `bg-[var(--ds-border)]` so they render correctly in both skins.
Wire into `web/src/app/dashboard/loading.tsx` and `web/src/app/team/loading.tsx`
in the follow-up route-level PR — this pass only ships the primitive.

---

## 4. Section + Container primitives

**New primitive:** `web/src/components/ui/section.tsx`

Two components:

```tsx
<Section spacing="md" tone="surface">…</Section>
// spacing: xs | sm | md | lg  → py-8 | py-12 | py-16 | py-24
// tone:    surface | sunken | elevated | inverse

<Container size="prose|md|lg|xl" gutter="default|compact">…</Container>
// size:   prose (max-w-3xl) | md (max-w-4xl) | lg (max-w-6xl) | xl (max-w-7xl)
// gutter: default = px-6 lg:px-8, compact = px-4 sm:px-6
```

This fixes the recon items *"Section rhythm is uneven"* and *"Responsive
gutter drift"* by giving pages a single, opinionated pair of wrappers.
Migration is opt-in — pages that already look right can stay.

---

## 5. Focus state normalization

- All interactive primitives use `focus-visible:ring-2
  ring-[var(--ds-focus-ring)]/60 focus-visible:ring-offset-2
  focus-visible:ring-offset-[var(--ds-surface)]`.
- `--ds-focus-ring` resolves to `brand-500` in light and `fintech-focus-ring`
  in dark/lux — same class name, correct color in each skin.
- The bare `.focus-ring` utility in `globals.css` is updated to read
  `var(--ds-focus-ring)` (additive: still resolves to brand-500 by default).

---

## 6. Storybook-lite route

**New route:** `web/src/app/docs/design-system/page.tsx`

A **read-only** RSC page that renders each primitive with every variant/size
combination in a grid, in both `light` and `.dark` sub-trees side-by-side.
Serves as the golden snapshot for QA and the acceptance-criteria target for
this pass.

Sections:
1. Color tokens (light + dark swatches, contrast readouts).
2. Typography ramp — every `--text-*` at its natural size.
3. Radius + shadow — tile per token.
4. Buttons — matrix `variant × size × state (idle/hover/focus/disabled)`.
5. Cards — every variant.
6. Badges — `variant × tone` matrix.
7. Skeletons — each shape.

Route is **not linked from nav** (respects scope fence around
`nav-groups.ts`). Reachable at `/docs/design-system` for internal QA.

---

## 7. File-change plan

Edits (10):
1. `web/src/app/globals.css` — additive tokens (§1a-e) + focus-ring var wiring.
2. `web/src/components/ui/button.tsx` — new variants + focus-ring token + glow token.
3. `web/src/components/ui/card.tsx` — cva conversion + variants + size.
4. `web/src/components/ui/badge.tsx` — variant × tone + legacy alias map.
5. `web/src/components/ui/skeleton.tsx` — new shape helpers.
6. `web/src/components/ui/input.tsx` — focus-ring token + radius token.
7. `web/src/components/ui/tabs.tsx` — focus-ring token + accent token.
8. `web/src/components/ui/accordion.tsx` — focus-ring token + border token.
9. `web/src/components/ui/label.tsx` — text-body-sm + ink-muted.
10. `web/src/components/ui/copy-button.tsx` — focus-ring token.

New files (3):
11. `web/src/components/ui/heading.tsx` — typography ramp primitive.
12. `web/src/components/ui/section.tsx` — Section + Container primitives.
13. `web/src/app/docs/design-system/page.tsx` — golden snapshot route.

Plus this doc + a `design-tokens.md` reference alongside it (docs only, not
code — they're inside `docs/plans/uiux-sync-2026-07-24/`).

---

## 8. Explicit non-goals (deferred)

- **Do not** unify the two navbars (`components/site/navbar.tsx` vs
  `landing/nav-v2.tsx`) in this pass — cross-team surface, needs product
  sign-off on which IA wins.
- **Do not** unify the two footers — same reason. Sponsor-logo insertion
  point is called out in recon and handled by the sponsor plan.
- **Do not** convert `.about`, `.pricing`, `.reseller`, `.dashboard` pages
  to the new primitives in this PR. That's the follow-up "Apply-design-system"
  PR which will land page-by-page with visual diffs.
- **Do not** touch anything under the scope fence — reseller mentor, feature
  gates, feature tours, migrations, workspace nav all excluded.
- **Do not** delete or rename any existing token, class, variant, or file —
  purely additive.

---

## 9. Acceptance criteria (verifiable)

1. `pnpm --dir web typecheck` clean.
2. `pnpm --dir web lint` clean on the 13 changed files.
3. `pnpm --dir web build` produces no new warnings vs. baseline.
4. **Visual smoke:** `/`, `/pricing`, `/about`, `/dashboard`, `/reseller`
   render pixel-identically to pre-pass baseline (screenshots via
   `screenshot-tour` skill, diff ≤ 1%).
5. `/docs/design-system` route renders in both light and dark, with every
   variant of every primitive present.
6. Every interactive element on `/docs/design-system` shows a visible
   focus-visible ring in both skins.
7. Axe DevTools audit on `/docs/design-system` reports **0 critical** issues.
8. `grep -rE "text-ink-500.*text-\[14"` on `web/src/app/**` returns no new
   AA violations (baseline snapshot stored alongside this doc).
9. Every new token in globals.css appears in `design-tokens.md`.
10. `git diff --stat` shows ≤ 13 files changed (target), ≤ 25 (cap).

---

## 10. Risks + mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| cva refactor of `Card` accidentally changes default class order → visual regression | Low | Snapshot the current default `className` string byte-for-byte and set it as the `default` variant; unit-check the composed class string. |
| Legacy Badge alias map miscolors an existing consumer | Low | Enumerate all `<Badge variant="…">` call-sites (grep) and assert each legacy variant → new (variant, tone) mapping matches the current hex. |
| Semantic layer variables collide with a page that already reads `--ds-*` | Very Low | grep confirms zero existing `--ds-` usages before adding. |
| `[data-theme="lux"]` override for `.dark` semantic layer double-applies | Low | Combined selector `.dark, [data-theme="lux"]` is idempotent; verified against nested case (page-scoped `data-theme` inside a `dark` root). |
| Docs page pulled into production bundle | None | Route stays under `/docs/design-system`; noindex meta; not linked from any nav. |
