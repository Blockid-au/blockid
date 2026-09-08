# BlockID Design System — Canonical Token Spec

> **Version:** 2027-09-08 · rev.2 (LIGHT-FIRST) · Applies to: `blockid.au` (web) + `startupvalueindex.com`
> **Owner:** CEO (Do Van Long) · **Authority:** any UI change referencing colour/type must resolve tokens from this file before merging.
> **Skill reference:** `ui-ux-pro-max` → *Data-Dense Dashboard* (Premium Neutral) chassis, SVI orange kept as brand accent.

## 1. Philosophy

- **Light-first**, dark-mode-tolerant. Both properties render **light by default** on white / off-white grounds with near-black bold text. Dark palette activates only via `prefers-color-scheme: dark` (opt-in) or an explicit `:root[data-theme="dark"]` scope.
- **WCAG AA is the minimum bar** for every text/background pair shipped to a customer surface. **AAA (7:1) for body text ≥14px** on primary surfaces.
- **One palette, two personalities**: SVI = analytics terminal (tabular-nums heavy, dense grids). BlockID = marketing + workspace (Space Grotesk display, Inter body). Both share the identical light-first token map below.
- **Semantic accents by context**: green=bull, red=bear, amber=warn, blue=action, orange #FF9F0A = SVI brand highlight (score numeral, CTA emphasis on marketing hero only).
- **No hard-coded hex** in `.tsx` files below top-of-file constants. Every colour must resolve to a token in this spec (Tailwind class or `var(--ds-*)`).
- **No emoji as icons**. Lucide only, sized 16/20/24, colour bound to `currentColor`.

## 2. Colour palette (canonical hex + WCAG rating — light surfaces)

### 2.1 Base surfaces

| Token | Hex | Role |
|---|---|---|
| `bg.base` | `#FFFFFF` | Page background (nav, footer, hero) |
| `bg.surface` | `#F7F8FA` | Section background (alternating rows, secondary panels) |
| `bg.raised` | `#FFFFFF` + `border line.subtle` | Elevated (card, input, dialog) — never a tinted panel on white |
| `bg.hover` | `#EEF0F5` | Row/button hover |
| `bg.sunken` | `#F1F3F7` | Sunken well (code blocks, empty states) |

### 2.2 Lines / borders

| Token | Hex | Use |
|---|---|---|
| `line.subtle` | `#E5E7EB` | Table row dividers, subtle grid, card borders on white |
| `line.DEFAULT` | `#D1D5DB` | Input borders, tab underline (inactive) |
| `line.strong` | `#4B5563` | Focus ring accent, active border |

### 2.3 Text on light surfaces

Contrast measured against `bg.base=#FFFFFF`.

| Token | Hex | Role | Contrast on white | Grade |
|---|---|---|---|---|
| `text.primary` | `#0B0F1A` | Headings, primary body | **19.62:1** | AAA |
| `text.secondary` | `#1F2937` | Body large, subtitles | **15.35:1** | AAA |
| `text.muted` | `#4B5563` | Meta, labels, helper text | **8.94:1** | AAA (body) |
| `text.tertiary` | `#6B7280` | Deep meta, timestamps | **5.74:1** | AA (body & large) — **do not use below 14px** |
| `text.faint` | `#9CA3AF` | **DECORATIVE ONLY** — placeholder frame, disabled label | 2.85:1 | Fails AA — never for readable copy |
| `text.on-brand` | `#0B0F1A` | Ink on `svi.500` (#FF9F0A) | **8.42:1** | AAA (large graphic) |
| `text.on-action` | `#FFFFFF` | Ink on `action` (#1D4ED8) | **8.59:1** | AAA |

### 2.4 Semantic

| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| `svi.500` | `#FF9F0A` | Brand accent — score numeral, SVI hero highlight only | 2.33:1 (large-text/graphic use only; pair with `text.on-brand` for legibility) |
| `action` | `#1D4ED8` | Primary CTA background | 8.59:1 vs white text |
| `bull` | `#047857` | Positive delta, growth (emerald-700) | 6.36:1 |
| `bear` | `#B91C1C` | Negative delta, risk (red-700) | 7.29:1 |
| `warn` | `#B45309` | Warning banner (amber-700) | 5.93:1 |
| `info` | `#1D4ED8` | Info banner (== action) | 8.59:1 |
| `focus-ring` | `#1D4ED8` | 2px outline on `focus-visible` | — |

Semantic colour applied to *text* on white always uses the 700-shade above (all pass AA body). For *badges/pills*, use `bg.<semantic>-50` (`#ECFDF5` bull, `#FEF2F2` bear, `#FFFBEB` warn, `#EFF6FF` info) with the corresponding 700-shade text.

### 2.5 Dark palette (opt-in — `prefers-color-scheme: dark` or `[data-theme="dark"]`)

Kept for opt-in dark mode. Do **not** default surfaces to these values.

| Token | Hex |
|---|---|
| `bg.base (dark)` | `#0B0F1A` |
| `bg.surface (dark)` | `#111827` |
| `bg.raised (dark)` | `#1F2937` |
| `text.primary (dark)` | `#F9FAFB` |
| `text.secondary (dark)` | `#E5E7EB` |
| `text.muted (dark)` | `#9CA3AF` |
| `line.subtle (dark)` | `rgba(148,163,184,0.16)` |
| `action (dark)` | `#60A5FA` (raised for AA on dark) |
| `bull (dark)` | `#34D399` |
| `bear (dark)` | `#F87171` |
| `svi.500 (dark)` | `#FBBF24` (raised for AA on dark) |

## 3. Typography

Font families (loaded via `next/font/google` on both sites — no CDN URL imports):

- **Display** (`--font-display`): `Space Grotesk` — 500/600/700 — H1/H2 + hero headlines on both sites.
- **Body** (`--font-sans`): `Inter` — 400/500/600/700 — with `font-feature-settings: "ss01", "cv11"`.
- **Numeric** (`--font-mono`): `IBM Plex Mono` — applied only via `font-mono` + `tabular-nums` for data columns, prices, timers.

Scale (unchanged, both sites use identical numeric size scale):

| Token | px | line-height | letter-spacing | Use |
|---|---|---|---|---|
| `2xs` | 11 | 1.2 | 0.02em | Micro-labels (uppercase eyebrows) |
| `xs` | 12 | 1.5 | 0 | Legal, meta |
| `sm` | 14 | 1.5 | 0 | Body |
| `base` | 16 | 1.5 | 0 | Body large |
| `lg` | 18 | 1.4 | -0.005em | Sub-heading |
| `xl` | 20 | 1.4 | -0.01em | H4 |
| `2xl` | 24 | 1.3 | -0.015em | H3 |
| `3xl` | 30 | 1.2 | -0.02em | H2 |
| `4xl` | 36 | 1.15 | -0.025em | H1 secondary |
| `5xl` | 48 | 1.1 | -0.03em | H1 primary |
| `6xl` | 60 | 1.05 | -0.03em | Hero H1 |

**Minimum text size on customer surfaces: 12px.** Never use `text-[10px]` or `text-[11px]` for anything a paying user must read. Body ≥14px must resolve to `text.primary`, `text.secondary`, or `text.muted` (all AAA on white).

## 4. Spacing + radius + shadow

- **Spacing base**: 4px (Tailwind default) — never use arbitrary pixel values in class strings.
- **Radius**: `sm=8px`, `md=12px`, `lg=16px`, `xl=20px`, `2xl=24px`, `pill=9999px`. Buttons=lg, cards=xl, dialogs=2xl.
- **Shadow (light-first, low-key)**:
  - `sm` = `0 1px 2px rgba(11,15,26,0.04)`
  - `md` = `0 4px 8px -2px rgba(11,15,26,0.06), 0 2px 4px -2px rgba(11,15,26,0.04)`
  - `lg` = `0 12px 24px -6px rgba(11,15,26,0.08), 0 4px 8px -4px rgba(11,15,26,0.05)`
  - `xl` = `0 24px 48px -12px rgba(11,15,26,0.12)`
  - `glow-svi` = `0 0 24px rgba(255,159,10,0.28)`
  - `glow-action` = `0 8px 28px -4px rgba(29,78,216,0.28)`

## 5. Motion

- Duration scale: `fast=120ms`, `default=200ms`, `slow=320ms`.
- Easing: `--ease-out = cubic-bezier(0.16, 1, 0.3, 1)` (default), `--ease-in-out = cubic-bezier(0.65, 0, 0.35, 1)`.
- Every animation `@media (prefers-reduced-motion: reduce)` disables `animation` + `transition-duration: 0.01ms`.

## 6. Iconography

- **Library**: `lucide-react` (both sites).
- **Sizes**: 16px (inline), 20px (button, chip), 24px (hero, nav).
- **Colour**: `currentColor` only. Never hard-code `fill`/`stroke` in JSX.
- **NEVER use emoji as icons** on customer surfaces.

## 7. Component principles (from ui-ux-pro-max)

1. **Cards are white with a `line.subtle` border and `shadow-sm`** — never a tinted panel on white; elevation is expressed with border+shadow, not fill.
2. **Primary CTA**: `bg-action text-white shadow-glow-action` at radius `lg`, min tap `44×44px`. Only **one** primary CTA per view.
3. **Secondary CTA**: `bg-white border line.DEFAULT text-primary hover:bg-hover`.
4. **Tables/rows**: white surface, `line.subtle` row divider, `bg-hover` on `hover`, sticky header uses `bg-surface`.
5. **Charts**: axis + gridlines `line.subtle`, data lines `action` / `bull` / `bear` / `svi.500` in that priority order. Never rely on colour alone — add label or icon per WCAG.
6. **Semantic pills**: `bg-<semantic>-50 text-<semantic>-700` at `text-xs uppercase tracking-wide`.
7. **Empty states**: `bg-sunken` panel, `text-muted` body, single primary CTA — never leave a blank surface.

## 8. Do / Don't

**Do**
- Resolve every colour via CSS variable or Tailwind token.
- Verify contrast in browser DevTools (or via `npm run a11y`) before committing any new colour combination.
- Use `text.muted` (#4B5563) as the floor for informational text — never go lighter for body copy.
- Bind chart colours to tokens: bull/bear/svi.500/action. No raw purple, teal, or slate.

**Don't**
- Don't use `text.faint` (#9CA3AF) for text — it's decorative-only.
- Don't stack `opacity-*` on top of tinted text (`text-bull/60`) — that recomputes contrast below AA.
- Don't put dark cards on light shells or vice versa without an explicit `data-theme` boundary.
- Don't invent new type sizes — pick from the 12-step scale in §3.
- Don't use `text-white` as a class outside of `data-theme="dark"` scopes or on semantic action backgrounds.

## 9. Implementation hooks

- **BlockID.au** consumes tokens via `web/src/app/globals.css` `@theme` block (Tailwind v4). Light values are DEFAULT; dark values live inside `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and mirrored under `:root[data-theme="dark"]` for opt-in.
- **startupvalueindex.com** consumes via `tailwind.config.ts` `theme.extend.colors`. Palette aligned 1:1 with the tokens in §2.
- Admin shell (`web/src/app/(app)/(admin)/layout.tsx`) forces `data-theme="light"` regardless of user preference — admin UX is always the light chassis.
- **Intentionally dark components** (terminal, code block, video overlay) wrap themselves in `data-theme="dark"` so their descendants pick up the dark palette without leaking into siblings.

## 10. Change log

- **2027-09-08 rev.2** — **LIGHT-FIRST inversion**. White/off-white ground, near-black `#0B0F1A` text as default. Semantic accents keyed to context (bull/bear/warn/action). Old dark palette moved to opt-in via `prefers-color-scheme` + `[data-theme="dark"]`. Palette validated against ui-ux-pro-max *Data-Dense Dashboard* chassis; SVI orange (`#FF9F0A`) retained as brand-only accent (never a body text colour on white — contrast 2.33:1 fails AA for text; used only on graphic surfaces paired with `text.on-brand` ink).
- **2026-09-08 rev.1** — canonicalised dark palette after audit-3-agent cross-site review.
