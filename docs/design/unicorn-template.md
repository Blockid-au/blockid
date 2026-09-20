# Unicorn marketing template — tokens, primitives, rules

**Goal:** G17 (`docs/plans/unicorn-homepage-2026-09-19.md`, decisions D1–D7).
**Shipped:** Phase 1, 2026-09-19 — tokens, primitives, nav + footer, homepage v6, `/product`, `/samples`.
**Owner:** every page under `web/src/app/(marketing)/` (Phase 2 rolls the template out to the rest; `/pricing` keeps its ladder).

This is the one design system for the public site. If a page under `(marketing)` needs markup that is not one of the primitives below, add a primitive here first — do not write page-local hero or section markup.

---

## 1. Research basis (ui-ux-pro-max, 2026-09-19)

- **Pattern:** minimal single column — single CTA focus, large type, whitespace, ≤ 3 benefits per band, proof *before* the second CTA.
- **Style:** flat / modern SaaS — one elevation scale (two shadow levels), 150–200 ms transitions, SVG icons (Lucide) only, light default with a full dark pairing.
- **Type:** Space Grotesk headings (`font-display`), Inter body, IBM Plex Mono for figures (`font-mono`, `tabular-nums`). Body 16 px, line-height 1.5–1.6.
- **Quick-reference rules applied:** contrast ≥ 4.5:1 on every text token (pinned in `globals.contrast.test.ts`), visible 2 px focus rings, ≥ 44 px touch targets, sequential headings (one `h1`, `h2` per section, `h3` per card), `aria-hidden` on decorative icons, `prefers-reduced-motion` freezes the ring.

## 2. Tokens (`web/src/app/globals.css` `@theme` + the `:root` / dark scopes)

| Token | Light | Dark (`prefers-color-scheme: dark` and `[data-theme="dark"]`) | Use |
| --- | --- | --- | --- |
| `--color-accent-50…900` | Tailwind violet ramp, **600 = `#7c3aed`** | same ramp (numeric steps do not invert) | `ring-accent-600` focus, `bg-accent-600` dots |
| `--color-accent` → `--ds-highlight` | `#6d28d9` (accent-700, 7.2:1 on white) | `#c4b5fd` (accent-300, 9.5:1 on `#0b0f1a`) | **the only violet allowed as text**: `text-accent` eyebrows |
| `--color-accent-soft` → `--ds-highlight-soft` | `#f5f3ff` | `rgba(139,92,246,.16)` | `bg-accent-soft` eyebrow pills, icon tiles, hero wash |
| `--ds-ring-start` / `--ds-ring-end` | `#2563eb` → `#7c3aed` | `#60a5fa` → `#a78bfa` | the search-ring conic gradient (`.asf-wrap::before`) |
| `--radius-sm / md / lg / xl` | 8 / 12 / 16 / 24 px (already existed) | — | `rounded-lg` buttons, `rounded-xl` cards |
| `--shadow-1` | 1–3 px hairline | — | resting cards (`shadow-1`) |
| `--shadow-2` | 8–24 px lift | — | hover / the featured card (`shadow-2`) — **nothing else** |
| `--dur-fast` / `--dur-base` | 150 ms / 200 ms | — | `duration-(--dur-base)` on every transition |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | — | `ease-out` |

Brand blue (`--color-brand-600 #2563eb`, semantic `action`) **stays the primary** — every primary button is `bg-action`. The violet accent is for the ring, eyebrows and focus rings only (founder decision F-2). Tailwind mirror: `tailwind.config.ts` `colors.accent`.

**No raw hex in components.** `template.test.tsx` fails on any `#rrggbb` inside `components/marketing/template/*`.

## 3. Primitives (`web/src/components/marketing/template/`)

Import from `@/components/marketing/template`. All are server components; every interactive element carries `FOCUS_RING` and a ≥ 44 px hit area (`min-h-11`).

| Primitive | Props | Renders |
| --- | --- | --- |
| `PageHero` | `eyebrow?`, `title` (ReactNode — the page's **one** `h1`, id `page-hero-heading`), `sub?`, `ctas?: Cta[]` (≤ 2: first primary, second secondary), `visual?` (slot under the CTAs — the search box, a card), `footnote?`, `align?: "center" \| "start"`, `titleProps?` (`data-*` on the h1) | `<section aria-labelledby="page-hero-heading">` with the accent wash behind the visual |
| `Section` | `id` (**required** — heading is `${id}-heading`), `eyebrow?`, `title?` (h2), `lede?`, `align?`, `tone?: "base" \| "sunken" \| "dark"`, `spacing?: "sm" \| "md" \| "lg"` (48/64/96), `actions?: Cta[]`, `divider?`, `ariaLabel?` (when no title), `children` | the band: `max-w-6xl` container, `scroll-mt-20` so `/page#id` clears the sticky nav; `dark` self-scopes `data-theme="dark"` |
| `FeatureGrid` | `items: { icon: LucideIcon, title, body, href?, cta?, ctaId? }[]`, `columns?: 2 \| 3 \| 4`, `numbered?` (renders `<ol>` with "Step n"), `ariaLabel?` | icon tile + h3 + sentence; a card with `href` is **one** `<a>` covering the whole card |
| `StatStrip` | `stats: { value, label, hint?, href? }[]` (2–6), `caption?`, `ariaLabel?` | tiles with `tabular-nums` values; `data-testid="stat-strip"` |
| `ProofBand` | `eyebrow?`, `items: { label, sub?, href? }[]` | a quiet centred row of names/facts — text only, "empty until real"; `data-testid="proof-band"` |
| `CtaBand` | `id?` (default `cta`), `title`, `sub?`, `primary: Cta`, `secondary?: Cta`, `footnote?`, `tone?` | the closing band (`RHYTHM.lg`), one h2 |
| `TrustBand` (G21 P0-A) | `id?` (default `trust`), `eyebrow?`, `title?`, `sviVersion?` (defaults to `SVI_VERSION`) | the compact "who stands behind the score" band above `CtaBand`: the four `trustRows()` from `lib/site/legal-entity` (entity · ACN/ABN · methodology version · support) + four bullets (privacy → `/legal/privacy`, score disclaimer lifted from `DISCLAIMER_SURFACES.general_all`, audit trail → `/methodology#audit`, `DATA_PRINCIPLE_SENTENCE`); `data-testid="trust-band"`. Mounted on `/product`, `/pricing`, `/methodology`, `/solutions/{investor,founder,advisor}` (the shell's `showTrustBand`); home + `/solutions/accelerator` mount it from their own lanes |
| `Prose` | `measure?: "narrow" (42rem) \| "wide" (56rem)`, `children` | `.tpl-prose` long-form styles (in `globals.css`) |
| `Faq` | `items: { question, answer: ReactNode, answerText? }[]`, `jsonLd?` | native `<details>/<summary>` (no JS); `jsonLd` emits one `FAQPage` block — only on the page that owns the FAQ |
| `CtaLink` / `CtaRow` | `Cta` = `{ href, label, variant?: "primary" \| "secondary" \| "link", ctaId? }` | the button skins (`CTA_CLASS`); `ctaId` → `data-cta-id` for GA4 |

Shared contract constants: `CONTAINER` (`mx-auto w-full max-w-6xl px-6`), `RHYTHM`, `TONE_CLASS`, `FOCUS_RING`, `MOTION`, `EYEBROW`, `CTA_CLASS`, `headingId(id)`.

## 4. Chrome (identical on every page)

- **Nav** (`components/landing/nav-v2.tsx` `MENU`): Product `/product` · Solutions ▾ (Investors `/solutions/investor`, Accelerators `/solutions/accelerator`, Advisors `/solutions/advisor`, Founders `/solutions/founder`) · Samples `/samples` · Pricing `/pricing` · Docs `/docs`. Right: Sign in + **Score a startup** → `/analyze` (`data-cta-id="score_startup"`). Mobile sheet mirrors it. Desktop from `lg`.
- **Footer** (`components/marketing/footer.tsx` + `footer-columns.ts`): four columns **Product · For · Company · Legal** (Samples, Docs and For Advisors live here, not in the bar), the brand block names the marketing operator and the bottom row renders `marketingLine()` from `lib/site/legal-entity` — both roles explicit (marketing operator · seller of record with its ABN); never hard-code an entity name (the config's guard test forbids literals outside it), the AU support row, the version chip, and an EN / Tiếng Việt language row. Everything that left the bar (funding rail, free tools, Atlassian demo, changelog/roadmap/status) is in these columns — the colocated tests walk `src/app` so no footer or nav href can 404.
- Both are mounted by `MarketingShell` (`components/marketing/marketing-shell.tsx`); the homepage mounts `NavV2` + `Footer` directly around its own `<main id="main-content">`.

## 5. Copy rules

- One `h1` per page, ≤ 9 words, a verb first ("Score any Australian startup in 60 seconds."). Sub-line ≤ 2 sentences, ≤ 20 words per breath (the `hero-variants.ts` speakability test).
- Speak to the **evaluator ladder first** (investors → accelerators → advisory firms), founders second (D1). No "SVI", "SCN", "tokenisation" in hero copy — say "the score", "eight dimensions", "Investor Dossier".
- **No prices on the homepage** — no `A$` strings at all (the page test pins `/A\$\d/`). Prices live on `/pricing` only. A valuation range on a sample card is written `$850K – $2.1M` + `AUD`.
- Eyebrows are short noun phrases in the accent; H2s are one clause; ledes are one or two sentences on a 42rem measure.
- Numbers come from published files (`lib/marketing/home-stats.ts` reads `traction-snapshot.json`, `external-signals-latest.json`, `svi-backtest-latest.json`) — never typed into copy, never fetched client-side.
- Every CTA is a real route. Grep `src/app` before adding an href; add a `legacy-redirects.ts` row only when you retire a path that had inbound links.

## 6. Do / don't

**Do**
- Build a page as `PageHero` → `Section`s → `CtaBand` inside `MarketingShell`.
- Keep section `id`s stable — they are deep-link targets (`/product#worth`, `#state`, `#journey`, `#next`, `#unlock`).
- Use `tone="sunken"` to alternate bands; use `tone="dark"` at most once per page (plus the dark footer edge).
- Reserve height for anything that could reflow (`min-h-*` on the sample card).
- Put CSS animations / descendant styles in `globals.css` (CSP: no inline `<style>`/`<script>`).

**Don't**
- Don't write a page-local `<section className="py-…">` with its own heading markup.
- Don't add a third shadow, a new radius, a raw hex, an emoji icon, or a transition > 200 ms.
- Don't use violet for buttons or body text; don't use `text-accent` on the dark nav island.
- Don't fetch on the client for marketing content; don't add `A$` to the home.
- Don't add a top-level nav entry — the bar is capped at five (`menu-structure.spec.ts`).

## 7. Adding a page (checklist)

1. `src/app/(marketing)/<slug>/page.tsx`: `export const metadata = pageMetadata({ title (≤ 60 incl. " | BlockID.au"), description (140–160), path })`; `export const revalidate = 300` unless it needs request state.
2. Copy/data in a sibling `<slug>-content.ts` (Next only allows route-segment exports from `page.tsx`).
3. `MarketingShell` → `PageHero` (one h1) → `Section`s with stable `id`s → `CtaBand`.
4. Add the URL to `src/app/sitemap.ts` and, if it belongs in the chrome, to `footer-columns.ts` (never the nav).
5. `page.test.tsx`: render with `renderToReadableStream` (mock `MarketingShell`), pin one h1, the section ids, every href, and metadata lengths. The `site-meta` sweep (`src/lib/seo/site-meta.test.ts`) picks the page up automatically.
6. `npx eslint`, the colocated tests, `tsc --noEmit`.

## 8. Test ids Phase 2 can rely on

`hero-search` (the omnibox wrapper; inner `smart-intake`, `smart-intake-text`, `smart-intake-cta`), `home-go-deeper`, `sample-result-card`, `stat-strip`, `proof-band`, `unlock-preview` (on `/product`), `nav-v2-auth-skeleton`; section ids `audiences · how · sample · proof · cta` on the home, `worth · state · journey · next · unlock` on `/product`, `runs · dossiers · journeys` on `/samples`; `data-cta-id`s: `score_startup`, `hero_score`, `hero_sample`, `home_audience_*`, `home_sample_dossier`, `home_sample_report`, `home_final_score`, `product_*`, `samples_*`.

## 9. Screenshots

Captured post-deploy with the tour pipeline (`scripts/tour-capture.mjs`, localhost:4001) into `docs/design/screenshots/` — home, `/product`, `/samples`, a solutions page at 375 and 1440 (Phase 2 / close-out).
