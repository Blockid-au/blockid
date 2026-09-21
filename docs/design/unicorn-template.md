# Unicorn template v2 — light only: tokens, primitives, chrome, rules

**Goal:** G26 (`docs/plans/g26-light-template-redesign-2026-09-21.md`, § 1 decision) — supersedes v1 (G17 D1–D7, 2026-09-19) wherever the two disagree.
**Shipped:** v2 foundation (lane T), 2026-09-21 — tokens, primitives, nav + footer, guard; the four page lanes (marketing, founder workspace, evaluator/admin, reports) roll it out.
**Owner:** every page under `web/src/app/**` — marketing, workspace, admin and reports share ONE template and ONE palette. There is no second palette for the app.

**The decision in one line:** light is the only default. Every page renders on white / soft-grey surfaces with dark, high-contrast ink; brand navy is the single primary action colour, cyan-muted the single secondary accent; no dark bands, no dark nav island, no dark footer, no dark hero. The OS dark preference does nothing; `[data-theme="dark"]` is an explicit opt-in scope kept for the report/PDF theme contract and the user's own toggle.

If a page needs markup that is not one of the primitives below, add a primitive here first — do not write page-local hero, card or table markup.

---

## 1. Research basis (ui-ux-pro-max, 2026-09-19)

- **Pattern:** minimal single column — single CTA focus, large type, whitespace, ≤ 3 benefits per band, proof *before* the second CTA.
- **Style:** flat / modern SaaS — one elevation scale (two shadow levels), 150–200 ms transitions, SVG icons (Lucide) only, **light only** (v2: the dark pairing is an opt-in scope, never the page).
- **v2 palette check (ui-ux-pro-max, 2026-09-21):** "Style selection → consistency" (one style across all pages), "Typography & color → semantic tokens, no raw hex in components, darker text on light backgrounds", "Accessibility → 4.5:1 body / 3:1 UI, visible 2 px focus rings", "Touch → 44 px targets". Navy + cyan-muted on white is the classic fintech-SaaS pairing (Stripe / Mercury on light): one saturated action colour, one cool accent, everything else neutral.
- **Type:** Space Grotesk headings (`font-display`), Inter body, IBM Plex Mono for figures (`font-mono`, `tabular-nums`). Body 16 px, line-height 1.5–1.6.
- **Quick-reference rules applied:** contrast ≥ 4.5:1 on every text token (pinned in `globals.contrast.test.ts`), visible 2 px focus rings, ≥ 44 px touch targets, sequential headings (one `h1`, `h2` per section, `h3` per card), `aria-hidden` on decorative icons, `prefers-reduced-motion` freezes the ring.

## 2. Tokens — light only (`web/src/app/globals.css`; contrast pinned in `src/design/palette-contrast.test.ts`)

Every value below is the `:root` (and `[data-theme="light"]`) value. Contrast is on white (`#ffffff`) unless stated; the sunken ground `#f7f8fa` changes each ratio by < 3 %.

| Token (`--ds-*`) | Utility | Light value | Contrast | Use |
| --- | --- | --- | --- | --- |
| `surface` | `bg-surface` | `#ffffff` | — | page ground, cards, nav, inputs |
| `surface-sunken` | `bg-surface-sunken` | `#f7f8fa` | — | alternating bands, footer, table head, zebra rows |
| `surface-hover` | `bg-surface-hover` | `#eef0f5` | — | hover wash on rows / ghost buttons |
| `border` / `border-strong` | `border-line-subtle` / `border-line` | `#e5e7eb` / `#d1d5db` | — | the 1 px line on every card, nav, footer, input |
| `ink` | `text-primary` = `text-ink` | `#0b0f1a` | 19.6:1 | headings, body |
| `ink-muted` | `text-secondary` = `text-ink-muted` | `#1f2937` | 15.4:1 | ledes, secondary copy |
| `ink-subtle` | `text-muted` = `text-ink-subtle` | `#4b5563` | 7.56:1 | meta, captions (still AAA — the old 8.94 note was wrong) |
| `ink-tertiary` | `text-tertiary` | `#6b7280` | 5.7:1 | placeholders, disabled labels |
| `accent` | `bg-action` / `text-action` | **`#1b2a5e` brand navy** | 13.6:1 (white label 13.6:1) | the ONE primary action: buttons, active nav pill, link colour |
| `accent-hover` | `bg-action-hover` | `#22326b` | 12.5:1 | primary hover |
| `accent-contrast` | `text-on-action` | `#ffffff` | — | label on the primary |
| `accent-secondary` | `text-action-secondary` / `bg-action-secondary` | **`#0e7490` cyan-muted** | 5.4:1 | the ONE secondary accent: the `.au` dot, section-heading tints, live chips. `#0891b2` was 3.7:1 and is NOT allowed as text |
| `highlight` | `text-accent` | `#6d28d9` violet | 7.2:1 | **eyebrows only** (+ `bg-accent-soft` pills) |
| `focus-ring` | `ring-brand-navy` | `#1b2a5e` | 13.6:1 | every `focus-visible` ring |
| `success` / `warn` / `danger` | `text-bull` / `text-warn` / `text-bear` | `#047857` / `#b45309` / `#b91c1c` | 6.4 / 5.9 / 7.3 | unchanged semantic colours (+ `bg-…` pill grounds) |
| `brand` (`svi-500`) | `bg-svi-500` | `#ff9f0a` | 2.0:1 | **graphic only** — never text |

**Graphic-only / legacy tokens (documented, not for text on light):** `--color-brand-cyan #22D3EE` (logo star, 1.6:1), `--color-brand-ink #F8FAFC` and `--color-brand-ink-muted #CBD5E1` (near-white — the old on-navy text; the guard flags `text-brand-ink*` outside the allow-list), `--color-brand-navy-deep`, `bg-lux-radial` / `bg-brand-star` gradients, the `--fintech-*` set. `--color-brand-navy` itself equals `--ds-accent`; use `bg-action` rather than `bg-brand-navy` so the hover / label pair comes with it.

**Scopes.** `:root` = light. `[data-theme="light"]` re-asserts light inside a legacy dark wrapper (the nav does this). `:root[data-theme="dark"]`, `.dark` and `[data-theme="lux"]` = the explicit opt-in dark ramp (report/PDF contract, the workspace toggle when the user chose dark, the lux wrappers the page lanes are removing). **There is no `@media (prefers-color-scheme: dark)` block** — `globals.contrast.test.ts` fails if one comes back.

**Theme toggle** (`components/ui/theme-toggle.tsx`): server renders light; the hash-pinned `THEME_RESTORE_SCRIPT` only adds `.dark` when `localStorage.blockid_theme === "dark"`, so a light user never flashes and a dark user restores before paint. Choosing light removes the key. `<meta name="theme-color">` is `#FFFFFF` only.

**Type, radius, shadow, motion** (unchanged from v1): Space Grotesk `font-display` headings, Inter body, IBM Plex Mono figures; `rounded-lg` buttons / `rounded-xl` cards; `shadow-1` resting / `shadow-2` hover — nothing else; `--dur-base` 200 ms, `--ease-out`.

**No raw hex / rgb in components.** `template.test.tsx` fails on any `#rrggbb` inside the template; the site-wide guard (§ 6) flags `bg-[#…]` / `text-[rgb(…)]` in every `className`.

## 3. Primitives (`web/src/components/marketing/template/`)

Import from `@/components/marketing/template`. All are server components; every interactive element carries `FOCUS_RING` and a ≥ 44 px hit area (`min-h-11`).

| Primitive | Props | Renders |
| --- | --- | --- |
| `PageHero` | `eyebrow?`, `title` (ReactNode — the page's **one** `h1`, id `page-hero-heading`), `sub?`, `ctas?: Cta[]` (≤ 2: first primary, second secondary), `visual?` (slot under the CTAs — the search box, a card), `footnote?`, `align?: "center" \| "start"`, `titleProps?` (`data-*` on the h1) | `<section aria-labelledby="page-hero-heading">` with the accent wash behind the visual |
| `Section` | `id` (**required** — heading is `${id}-heading`), `eyebrow?`, `title?` (h2), `lede?`, `align?`, `tone?: "base" \| "sunken"` (`"dark"` is a **deprecated alias of `sunken`** — accepted, renders light, no scope), `spacing?: "sm" \| "md" \| "lg"` (48/64/96), `actions?: Cta[]`, `divider?`, `ariaLabel?` (when no title), `children` | the band: `max-w-6xl` container, `scroll-mt-20` so `/page#id` clears the sticky nav; `data-tone="base|sunken"` |
| `FeatureGrid` | `items: { icon: LucideIcon, title, body, href?, cta?, ctaId? }[]`, `columns?: 2 \| 3 \| 4`, `numbered?` (renders `<ol>` with "Step n"), `ariaLabel?` | icon tile + h3 + sentence; a card with `href` is **one** `<a>` covering the whole card |
| `StatStrip` | `stats: { value, label, hint?, href? }[]` (2–6), `caption?`, `ariaLabel?` | tiles with `tabular-nums` values; `data-testid="stat-strip"` |
| `ProofBand` | `eyebrow?`, `items: { label, sub?, href? }[]` | a quiet centred row of names/facts — text only, "empty until real"; `data-testid="proof-band"` |
| `CtaBand` | `id?` (default `cta`), `title`, `sub?`, `primary: Cta`, `secondary?: Cta`, `footnote?`, `tone?` (default `sunken`; `dark` deprecated → `sunken`) | the closing band (`RHYTHM.lg`), one h2 — the navy primary button is the punctuation, not a dark ground |
| `TrustBand` (G21 P0-A) | `id?` (default `trust`), `eyebrow?`, `title?`, `sviVersion?` (defaults to `SVI_VERSION`) | the compact "who stands behind the score" band above `CtaBand`: the four `trustRows()` from `lib/site/legal-entity` (entity · ACN/ABN · methodology version · support) + four bullets (privacy → `/legal/privacy`, score disclaimer lifted from `DISCLAIMER_SURFACES.general_all`, audit trail → `/methodology#audit`, `DATA_PRINCIPLE_SENTENCE`); `data-testid="trust-band"`. Mounted on `/product`, `/pricing`, `/methodology`, `/solutions/{investor,founder,advisor}` (the shell's `showTrustBand`); home + `/solutions/accelerator` mount it from their own lanes |
| `Prose` | `measure?: "narrow" (42rem) \| "wide" (56rem)`, `children` | `.tpl-prose` long-form styles (in `globals.css`) |
| `Faq` | `items: { question, answer: ReactNode, answerText? }[]`, `jsonLd?` | native `<details>/<summary>` (no JS); `jsonLd` emits one `FAQPage` block — only on the page that owns the FAQ |
| `CtaLink` / `CtaRow` | `Cta` = `{ href, label, variant?: "primary" \| "secondary" \| "ghost" \| "link", ctaId? }` | the button skins (`CTA_CLASS`); `ctaId` → `data-cta-id` for GA4 |

### 3.1 App primitives (v2 — `template/ui.tsx`, same import)

The in-app half of the template. Workspace, evaluator and admin pages use these; there is no second component set.

| Primitive | Props | Renders |
| --- | --- | --- |
| `PageHeader` | `eyebrow?`, `title` (the page's **one** h1), `lede?`, `actions?: Cta[]` (≤ 2), `aside?` (chip / toolbar, right on `sm+`), `layout?: "contained" \| "bare"` | white header band, 1 px bottom line, eyebrow · h1 · lede left-aligned |
| `Card` | `title?` (h3), `sub?`, `aside?`, `interactive?` (hover → `shadow-2`), `padding?: "default" \| "none"`, `as?: "section" \| "div" \| "article" \| "li"` | `bg-surface-raised border-line-subtle rounded-xl shadow-1 p-6` |
| `Table` (+ `TableWrap`, `Th`, `Td`) | `columns: { key, header, align?: "start" \| "num", className? }[]`, `rows: Record<string, ReactNode>[]`, `rowKey?`, `caption?`, `empty?` | sticky sunken `<thead>`, zebra `even:bg-surface-sunken` rows, `hover:bg-surface-hover`, 44 px rows, numeric columns right-aligned `font-mono tabular-nums`, horizontal scroll wrapper on phones |
| `Field` | `id`, `label`, `hint?`, `error?`, `required?`, `as?: "input" \| "textarea" \| "select"` + the native attributes | visible `<label for>`, 44 px control on white with `border-line` and the navy focus ring, `aria-describedby` → hint / error ids, `aria-invalid` + `role="alert"` on error |
| `Button` | `variant?: "primary" \| "secondary" \| "ghost"`, `loading?`, native button props (`type` defaults to `button`) | `BUTTON_CLASS[variant]`; `loading` → `disabled` + `aria-busy` |

Button set (`BUTTON_CLASS`): **primary** `bg-action text-on-action hover:bg-action-hover` (navy, white label) · **secondary** `border border-line bg-surface text-primary hover:bg-surface-hover` (outline) · **ghost** `text-primary hover:bg-surface-hover`. All `min-h-11`, `rounded-lg`, `focus-visible:ring-2 focus-visible:ring-brand-navy`, `disabled:opacity-50`.

Shared contract constants: `CONTAINER` (`mx-auto w-full max-w-6xl px-6`), `RHYTHM`, `TONE_CLASS`, `resolveTone()`, `FOCUS_RING`, `MOTION`, `EYEBROW`, `CTA_CLASS`, `BUTTON_CLASS`, `CARD_CLASS`, `CARD_INTERACTIVE_CLASS`, `FIELD_*_CLASS`, `TABLE_*_CLASS`, `headingId(id)`.

## 4. Chrome (identical on every page)

- **Nav** (`components/landing/nav-v2.tsx`) — **light island**: `bg-surface/95 backdrop-blur` with a 1 px `border-line-subtle` bottom line, `text-secondary` links → `text-primary` on hover, the `.au` dot and dropdown section headings in `text-action-secondary`, the primary CTA `bg-action text-on-action` (navy), "My workspace" as the outline secondary, avatar navy. Dropdown panels and the mobile sheet are `bg-surface` / `bg-surface-raised` with `shadow-2`. The header always stamps `data-theme="light"`; `variant` is deprecated and ignored (there is no navy skin). `MENU`: Product `/product` · Solutions ▾ (Investors `/solutions/investor`, Accelerators `/solutions/accelerator`, Advisors `/solutions/advisor`, Founders `/solutions/founder`) · Samples `/samples` · Pricing `/pricing` · Docs `/docs`. Right: Sign in + **Score a startup** → `/analyze` (`data-cta-id="score_startup"`). Mobile sheet mirrors it. Desktop from `lg`.
- **Footer** (`components/marketing/footer.tsx` + `footer-columns.ts`) — **light sunken**: `bg-surface-sunken` under a 1 px line, `text-secondary` body, `text-action` column headings, `Logo variant="light"`, partner marks as drawn (no invert). Four columns **Product · For · Company · Legal** (Samples, Docs and For Advisors live here, not in the bar), the brand block names the marketing operator and the bottom row renders `marketingLine()` from `lib/site/legal-entity` — both roles explicit (marketing operator · seller of record with its ABN); never hard-code an entity name (the config's guard test forbids literals outside it), the AU support row, the version chip, and an EN / Tiếng Việt language row. Everything that left the bar (funding rail, free tools, Atlassian demo, changelog/roadmap/status) is in these columns — the colocated tests walk `src/app` so no footer or nav href can 404.
- Both are mounted by `MarketingShell` (`components/marketing/marketing-shell.tsx`); the homepage mounts `NavV2` + `Footer` directly around its own `<main id="main-content">`.
- **Workspace / admin shell** (page lanes W1 / W2): sidebar `bg-surface-sunken` with a 1 px right line, header `bg-surface` with a 1 px bottom line, content on `bg-surface`; the same tokens, the same nav CTA skins. No `ProShell` dark scope, no `[data-theme="lux"]` wrappers.

## 5. Copy rules

- One `h1` per page, ≤ 9 words, a verb first ("Score any Australian startup in 60 seconds."). Sub-line ≤ 2 sentences, ≤ 20 words per breath (the `hero-variants.ts` speakability test).
- Speak to the **evaluator ladder first** (investors → accelerators → advisory firms), founders second (D1). No "SVI", "SCN", "tokenisation" in hero copy — say "the score", "eight dimensions", "Investor Dossier".
- **No prices on the homepage** — no `A$` strings at all (the page test pins `/A\$\d/`). Prices live on `/pricing` only. A valuation range on a sample card is written `$850K – $2.1M` + `AUD`.
- Eyebrows are short noun phrases in the accent; H2s are one clause; ledes are one or two sentences on a 42rem measure.
- Numbers come from published files (`lib/marketing/home-stats.ts` reads `traction-snapshot.json`, `external-signals-latest.json`, `svi-backtest-latest.json`) — never typed into copy, never fetched client-side.
- Every CTA is a real route. Grep `src/app` before adding an href; add a `legacy-redirects.ts` row only when you retire a path that had inbound links.

## 6. Do / don't (v2)

**Do**
- Build a marketing page as `PageHero` → `Section`s → `CtaBand` inside `MarketingShell`; an app page as `PageHeader` → `Card`s / `Table`s / `Field`s inside the workspace shell.
- Alternate `tone="base"` (white) and `tone="sunken"` (`#f7f8fa`) bands — that is the only rhythm. A navy 2–4 px accent line (`border-t-4 border-action`) or an eyebrow marks emphasis, never a navy band.
- One `h1` per page (`PageHero` / `PageHeader` own it); `h2` per section; `h3` per card.
- Keep section `id`s stable — they are deep-link targets (`/product#worth`, `#state`, `#journey`, `#next`, `#unlock`).
- Contrast: body ≥ 4.5:1, headings and primary ink ≥ 7:1, the primary button label ≥ 12:1 — the tokens already clear these (§ 2); use them and the page inherits the numbers.
- Every interactive element: `min-h-11` and `FOCUS_RING` (`ring-brand-navy`).
- Put CSS animations / descendant styles in `globals.css` (CSP: no inline `<style>`/`<script>`).
- Reserve height for anything that could reflow (`min-h-*` on the sample card).

**Don't**
- **No dark bands, dark heroes, dark nav, dark footer** — no `bg-brand-navy*`, `bg-slate/gray/zinc/neutral-9xx`, `bg-black`, `bg-[#0…]`, `bg-ink-9xx`, `from-slate-9xx`, and no `data-theme="dark"` / `"lux"` wrappers on page markup. The dark ramp is for the report/PDF contract and the user's toggle only.
- No `text-white` / `text-brand-ink*` as page text. White text lives only on a saturated fill on the same element (a primary button, a chip, a step dot) — those are allow-listed by pattern, everything else is a defect.
- No raw hex / `rgb()` in a `className` (`bg-[#0B1220]`, `text-[rgb(…)]`) — use the token utilities.
- No second button style, no third shadow, no new radius, no emoji icon, no transition > 200 ms, no violet on buttons or body text, no cyan `#22D3EE` / `#0891B2` as text.
- Don't fetch on the client for marketing content; don't add `A$` to the home; don't add a top-level nav entry (the bar is capped at five, `menu-structure.spec.ts`).

**Guard** — `src/design/light-template.guard.test.ts` scans every `.tsx` under `src/app` and `src/components` for the three rules above (`dark-surface`, `text-on-dark`, `raw-color`), minus `src/design/light-template.allowlist.json` (`{ file, rule?, pattern, reason }`, ≤ 30 entries, every entry must still match a hit). It always prints the per-rule × per-area summary and top offenders; **enforcing by default since G26-X (2026-09-21)** — any hit outside the allow-list fails `npm test`. Run `npx vitest run src/design/light-template.guard.test.ts` (or `npx tsx scripts/light-guard-report.ts`, `FLAT=1` for one line per hit, `LIGHT_GUARD_SRC=` to scan another checkout) to see the remaining defects; `LIGHT_GUARD_REPORT_ONLY=1` forces report mode for a survey. The page sweep (`scripts/page-sweep.mjs`, `docs/ops/page-sweep.md`) adds the rendered check: `light_body_bg` / `light_section_bg` (computed ground luminance ≤ 0.85) and `light_text` (body text luminance ≥ 0.35); `--no-light` disables it.

### 6.1 Migration notes for the page lanes

| Today | Replace with | Notes |
| --- | --- | --- |
| `<section className="bg-brand-navy … text-white">` hero / band | `<Section tone="base">` (or `PageHero`) + `text-primary`; emphasise with `border-t-4 border-action` or an eyebrow | the navy becomes a line, not a ground |
| `<Section tone="dark">` / `<CtaBand tone="dark">` | `tone="sunken"` | the prop still compiles (alias) — change it anyway so the guard's `data-theme` rule is not needed later |
| `data-theme="dark"` / `data-theme="lux"` wrappers, `ProShell` dark scope | remove the attribute; the page inherits light | the workspace shell is `bg-surface` / `bg-surface-sunken` |
| `text-white` on a dark ground | `text-primary` (`text-ink`) | on a saturated fill (button / chip) keep `text-on-action` |
| `text-brand-ink` / `text-brand-ink-muted` | `text-primary` / `text-secondary` | they are near-white legacy tokens |
| `text-ink-muted` / `text-slate-300…400` on a dark ground | `text-muted` (`text-ink-subtle`) on the light ground | `text-secondary` for ledes |
| `bg-slate-900` / `bg-ink-900` / `bg-black` panels | `bg-surface-sunken` + `border-line-subtle`; `bg-black/40–60` scrims on `fixed inset-0` overlays stay (allow-listed) | code samples in `<pre>` may keep the editor-dark ground |
| `bg-[#0B1220]`, `text-[#3B7DD8]`, `border-[rgba(…)]` | `bg-surface`, `text-action`, `border-line-subtle` | any raw colour → the nearest semantic token |
| `bg-brand-600 text-white` / `bg-brand-navy text-white` buttons | `BUTTON_CLASS.primary` / `<Button>` / `CtaLink` (`bg-action text-on-action`) | one button set site-wide |
| `border border-white/10`, `bg-white/5` | `border-line-subtle`, `bg-surface-sunken` | translucent-white washes only exist for dark grounds |
| `text-brand-cyan` (`#22D3EE`) as text | `text-action-secondary` (`#0e7490`) | 5.4:1 on white |
| `focus-visible:ring-brand-cyan` / `ring-accent-600` | `focus-visible:ring-brand-navy` (`FOCUS_RING`) | |
| `Logo variant="dark"` on chrome | `Logo variant="light"` | |
| Charts on dark: grid `rgba(255,255,255,.1)`, axis `#94a3b8` | grid `var(--ds-border)`, axis `var(--ds-ink-subtle)`, series from `--ds-accent`, `--ds-accent-secondary`, `--ds-success`, `--ds-warn`, `--ds-danger` | inline SVG reads the CSS variables |
| `[&_img]:invert` on partner / logo rows | remove | marks are drawn for light |

## 7. Adding a page (checklist)

1. `src/app/(marketing)/<slug>/page.tsx`: `export const metadata = pageMetadata({ title (≤ 60 incl. " | BlockID.au"), description (140–160), path })`; `export const revalidate = 300` unless it needs request state.
2. Copy/data in a sibling `<slug>-content.ts` (Next only allows route-segment exports from `page.tsx`).
3. `MarketingShell` → `PageHero` (one h1) → `Section`s with stable `id`s, alternating `base` / `sunken` → `CtaBand` (sunken). App pages: workspace shell → `PageHeader` (one h1) → `Card` / `Table` / `Field` / `Button`.
4. Add the URL to `src/app/sitemap.ts` and, if it belongs in the chrome, to `footer-columns.ts` (never the nav).
5. `page.test.tsx`: render with `renderToReadableStream` (mock `MarketingShell`), pin one h1, the section ids, every href, and metadata lengths. The `site-meta` sweep (`src/lib/seo/site-meta.test.ts`) picks the page up automatically.
6. `npx eslint`, the colocated tests, `tsc --noEmit`, and `LIGHT_GUARD_ENFORCE=1 npx vitest run src/design/light-template.guard.test.ts` — zero hits for the new file (no dark surface, no `text-white`, no raw colour).
7. Screenshot at 375 and 1280 (Playwright against `next build && next start`): white page, dark ink, one navy primary, light nav, light footer.

## 8. Test ids Phase 2 can rely on

`hero-search` (the omnibox wrapper; inner `smart-intake`, `smart-intake-text`, `smart-intake-cta`), `home-go-deeper`, `sample-result-card`, `stat-strip`, `proof-band`, `unlock-preview` (on `/product`), `nav-v2-auth-skeleton`; section ids `audiences · how · sample · proof · cta` on the home, `worth · state · journey · next · unlock` on `/product`, `runs · dossiers · journeys` on `/samples`; `data-cta-id`s: `score_startup`, `hero_score`, `hero_sample`, `home_audience_*`, `home_sample_dossier`, `home_sample_report`, `home_final_score`, `product_*`, `samples_*`.

## 9. Screenshots

Captured post-deploy with the tour pipeline (`scripts/tour-capture.mjs`, localhost:4001) into `docs/design/screenshots/` — home, `/product`, `/samples`, a solutions page at 375 and 1440 (Phase 2 / close-out).
