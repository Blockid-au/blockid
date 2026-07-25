# Sponsor / Accelerator Badge Strip — Design & Curator Spec

Owner: CMO agent + curator
Date: 2026-07-24
Scope fence honoured: no edits to workspace/nav-groups, workspace-layout, lib/nav, entitlements, mentor, product-tour, feature-gates, or supabase/migrations.

## 1. Verified programs (curator sign-off)

Ordered by prestige for founder/investor audience. All four are user-confirmed as real:

| # | Program | Status | Label | Official URL |
|---|---|---|---|---|
| 1 | Founder Institute | Accepted | Accepted into | https://fi.co |
| 2 | NVIDIA Inception | Accepted | Accepted into | https://www.nvidia.com/en-us/startups/ |
| 3 | Stripe for Startups | Linked + active | Integrated with | https://stripe.com/startups |
| 4 | Spacecubed AI Fellowship | Accepted | Accepted into | https://spacecubed.com/labs/ |

Recon grep for other real programs across `web/src` + `web/content` returned only pitch/research collateral (`web/content/pitch/spacecubed-application.md`, `web/content/pitch/accelerator-research.md`, `web/content/pitch/investor-targets.md`) — no additional signed programs. Do NOT add anything from the research list until it is signed.

Curator rule (already codified at the top of `trust-strip.tsx`): if a program is not on the confirmed list, it does not render. The config file is the single source of truth; a missing entry means the strip degrades gracefully (renders nothing rather than fabricating).

## 2. Surfaces & label taxonomy

One label per strip. Never mix labels.

| Surface | Component | Label | Rows shown |
|---|---|---|---|
| Homepage (`/`, lux hero) | `TrustStrip` inside `HeroV2` (existing mount at `hero-v2.tsx:86`) | Accepted into | Founder Institute, NVIDIA Inception, Spacecubed AI Fellowship |
| Homepage (`/`, lux hero) | second `TrustStrip` variant, `label="integrations"` | Integrated with | Stripe for Startups |
| About (`/about`) | `LogoCloud` (light section, natural fit under the "Australian-Native" band) | Accepted into | all four |
| Pricing (`/pricing`) | narrow `LogoCloud` variant above final CTA (`density="compact"`) | Integrated with | Stripe for Startups (single-tile emphasis) |
| Footer (lux) — `marketing-footer.tsx` | small monochrome `<PartnerFooterRow />` | Accepted into | all four, greyscale, hover reveals colour |
| Footer (light) — `site/footer.tsx` | same `<PartnerFooterRow />` (theme-aware via CSS custom props) | Accepted into | all four |

Rationale for splitting the hero strip into two labels: Stripe is an integration, not an accelerator. Rendering it alongside FI / NVIDIA / Spacecubed under "Accepted into" would be curator-untrue and would erode the signal of the accelerator badges.

## 3. Schema — extend PartnersConfig

Both components currently accept `string[]`. Widen the type (backwards compatible — a `string` entry keeps rendering as text-only, an object entry renders the SVG + link).

```ts
// shared type (co-locate in web/src/components/landing/partners-types.ts)
export type PartnerEntry =
  | string
  | {
      name: string;
      src?: string;   // /partners/*.svg (public path)
      href?: string;  // official program URL
      alt?: string;   // defaults to `${name} logo`
      label?: "accepted" | "integrated" | "backed"; // strip grouping
    };

export interface PartnersConfig {
  headline?: string;                 // legacy — logo-cloud default label
  partners: PartnerEntry[];          // logo-cloud (about + pricing)
  investors_headline?: string;       // legacy — trust-strip default label
  investors?: PartnerEntry[];        // trust-strip (homepage hero)
  // NEW — grouped variants keyed by label
  groups?: {
    accepted?:  { headline?: string; entries: PartnerEntry[] };
    integrated?: { headline?: string; entries: PartnerEntry[] };
    backed?:     { headline?: string; entries: PartnerEntry[] };
  };
}
```

Loader helper `normalizeEntry(e)` returns `{ name, src?, href?, alt }`. Both `TrustStrip` and `LogoCloud` gain a `group?: "accepted" | "integrated" | "backed"` prop; when passed, they read `config.groups[group].entries` and use `config.groups[group].headline` as the eyebrow. When absent, they fall back to the legacy `partners` / `investors` arrays (no visual regression).

## 4. Config file (`web/config/marketing-partners.json`)

```json
{
  "//": "Marketing partner display config. LEAVE ARRAYS EMPTY UNTIL A PARTNERSHIP IS REAL AND SIGNED.",
  "headline": "Working with",
  "partners": [],
  "investors_headline": "Accepted into",
  "investors": [],
  "groups": {
    "accepted": {
      "headline": "Accepted into",
      "entries": [
        { "name": "Founder Institute",        "src": "/partners/founder-institute.svg",        "href": "https://fi.co",                             "alt": "Founder Institute — accepted" },
        { "name": "NVIDIA Inception",         "src": "/partners/nvidia-inception.svg",         "href": "https://www.nvidia.com/en-us/startups/",    "alt": "NVIDIA Inception — accepted" },
        { "name": "Spacecubed AI Fellowship", "src": "/partners/spacecubed-ai-fellowship.svg", "href": "https://spacecubed.com/labs/",              "alt": "Spacecubed AI Fellowship — accepted" }
      ]
    },
    "integrated": {
      "headline": "Integrated with",
      "entries": [
        { "name": "Stripe for Startups", "src": "/partners/stripe-for-startups.svg", "href": "https://stripe.com/startups", "alt": "Stripe for Startups — integrated" }
      ]
    },
    "backed": { "headline": "Backed by", "entries": [] }
  }
}
```

## 5. Placeholder SVG assets

Store at `web/public/partners/*.svg`. Since we cannot fetch official press-kit logos in this environment, ship clean text-based SVG placeholders. Uniform grid so every tile weighs the same visually:

- `viewBox="0 0 240 60"`
- `fill="currentColor"` on `<text>` so the tile inherits ink colour (survives light/dark/lux + grayscale hover)
- `font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"`
- `font-weight="700"`, `font-size="20"`, `letter-spacing="0.5"`
- `text-anchor="middle"`, positioned at `(120, 38)`
- `role="img"` + `<title>` element for AT
- No external fonts, no raster, no colour — brand-neutral so it inherits page theme

Template:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" role="img" aria-labelledby="t">
  <title id="t">Founder Institute</title>
  <text x="120" y="38" text-anchor="middle" fill="currentColor"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-weight="700" font-size="20" letter-spacing="0.5">Founder Institute</text>
</svg>
```

Four files:
- `web/public/partners/founder-institute.svg`
- `web/public/partners/nvidia-inception.svg`
- `web/public/partners/stripe-for-startups.svg`
- `web/public/partners/spacecubed-ai-fellowship.svg`

Documented swap-out in `web/public/partners/README.md`:
1. Download the official press-kit SVG from each program's brand page.
2. Optimise via `svgo --multipass`.
3. Preserve `viewBox="0 0 240 60"` (crop/pad transparent — never distort).
4. Strip `width`/`height`, `fill="#..."` (leave `currentColor` where possible so monochrome mode still works), and any inline `<style>` blocks.
5. Add `role="img"` + `<title>`, matching the placeholder pattern.
6. Replace the file in place — no code change needed; the `src` in `marketing-partners.json` is unchanged.
7. Verify: `pnpm dev`, load `/`, `/about`, `/pricing`, and both footers. Check dark-mode via the theme toggle and greyscale via the strip's hover behaviour.

## 6. Component rendering rules

### 6.1 `TrustStrip` (lux hero, dark)
- Height per tile: `h-10` (unchanged).
- Image: `<img src={entry.src} alt={entry.alt} loading="lazy" decoding="async" width={120} height={30} className="h-6 w-auto opacity-70 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0" />`.
- Wrap in `<a href={entry.href} target="_blank" rel="noopener noreferrer">` when `href` present, else `<span>`.
- Focus-visible: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]` — matches the fintech pattern the surrounding hero already uses (fixes one of the recon focus-drift findings on this surface).
- When `group="integrated"`, render tighter: `gap-x-6` instead of `gap-x-12`, single-row.

### 6.2 `LogoCloud` (light, about + pricing)
- New prop `density?: "default" | "compact"`. Default keeps existing 6-col grid; `compact` renders `flex flex-wrap justify-center gap-x-10 gap-y-6 py-6` and drops the eyebrow's `mt-8` to `mt-4` — for the pricing above-CTA strip.
- Image: `<img ... className="h-7 w-auto text-ink-600 opacity-70 transition-opacity duration-200 hover:opacity-100" />` — `text-ink-600` propagates via `currentColor` in the SVG.
- Link wrapping + focus-visible ring: `focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-100` — matches the light `ui/Button` primitive.

### 6.3 `PartnerFooterRow` (both footers)
- New tiny leaf co-located as `web/src/components/marketing/partner-footer-row.tsx` (marketing dir is inside scope). Consumed by both `site/footer.tsx` and `marketing-footer.tsx`.
- Reads `config.groups.accepted.entries`.
- Renders: eyebrow "Accepted into" (`text-[10px] uppercase tracking-[0.24em] text-ink-500 dark:text-white/50`), then a `flex flex-wrap items-center gap-x-6 gap-y-3` row of `<img class="h-5 w-auto opacity-60 hover:opacity-90" />` wrapped in the official-URL `<a>`.
- Guardrail: if `groups.accepted.entries` is empty or the config is missing, renders `null`. Same non-fabrication rule as the other two components.

## 7. File changes summary

| Path | Change | Fenced? |
|---|---|---|
| `web/src/components/landing/logo-cloud.tsx` | widen `PartnersConfig`, accept `PartnerEntry` objects, add `density` + `group` props, render `<img>` inside `<a>` when `src`/`href` present, keep string fallback | No |
| `web/src/components/landing/trust-strip.tsx` | same widened schema, add `group` prop, render logo tiles with focus-visible ring | No |
| `web/src/components/marketing/partner-footer-row.tsx` | NEW leaf component | No |
| `web/config/marketing-partners.json` | populate `groups.accepted` + `groups.integrated`; leave legacy `partners`/`investors` empty | No |
| `web/src/app/page.tsx` (or `hero-v2.tsx` where TrustStrip already mounts) | render `<TrustStrip group="accepted" className="mt-16" />` and `<TrustStrip group="integrated" className="mt-8" />` | No |
| `web/src/app/about/page.tsx` | import `LogoCloud`, place under the "Australian-Native" band with `group="accepted"` | No |
| `web/src/app/pricing/page.tsx` | import `LogoCloud`, place `<LogoCloud group="integrated" density="compact" />` above the final CTA section | No |
| `web/src/components/site/footer.tsx` | mount `<PartnerFooterRow />` above the copyright row | No |
| `web/src/components/marketing/marketing-footer.tsx` | mount `<PartnerFooterRow />` above the copyright row (inherits dark surface via CSS custom props) | No |
| `web/public/partners/founder-institute.svg` | NEW placeholder | No |
| `web/public/partners/nvidia-inception.svg` | NEW placeholder | No |
| `web/public/partners/stripe-for-startups.svg` | NEW placeholder | No |
| `web/public/partners/spacecubed-ai-fellowship.svg` | NEW placeholder | No |
| `web/public/partners/README.md` | NEW — swap-out procedure | No |

## 8. Acceptance criteria

1. Four real strips render on four surfaces: homepage hero (2 labels), about (Accepted-into row of 3), pricing (Integrated-with above CTA), footer (both light + lux footers).
2. Each `<img>` renders a valid SVG placeholder (24×60 aspect preserved) with `alt` text present and non-empty.
3. Each logo is wrapped in an `<a target="_blank" rel="noopener noreferrer">` pointing at the official program URL from section 1.
4. If `web/config/marketing-partners.json` is deleted or `groups` is empty, every surface degrades to nothing (no console errors, no broken layout). Non-fabrication guarantee preserved.
5. Focus-visible rings render on every logo link — brand ring on light surfaces, fintech-accent ring on the lux hero + lux footer.
6. Dark-mode / lux theme: the greyscale-to-colour hover works because SVGs use `currentColor` and inherit ink from the surrounding surface.
7. `pnpm lint` + `pnpm typecheck` pass; no new TypeScript errors introduced by the widened union type (`normalizeEntry` narrows before use).
8. Curator log entry in this file lists the four verified programs; adding a fifth requires a signed record in `web/content/pitch/` before the config is updated.

## 9. Risks / follow-ups

- Placeholder SVGs are text-based. They read as "professional plain wordmarks" but do not carry brand equity. Prioritise pulling the real press-kit SVGs within one sprint of publish.
- `web/src/app/page.tsx` gates on `NEXT_PUBLIC_UPGRADE_V2` (recon finding). The TrustStrip lives inside the v2 branch (`hero-v2.tsx`); the v1 fallback (`SVIEntrance`) will NOT show the strip. Acceptable while v2 is default; if we ever fall back to v1 we will need to mount the strip there too.
- `site/footer.tsx` (light) vs `marketing-footer.tsx` (lux) inconsistency is called out in recon. Adding `PartnerFooterRow` to both keeps parity for now but does not fix the deeper two-footer problem — that is out of scope for this ticket.
- Legal: NVIDIA Inception and Stripe brand-usage terms require the official logo (not a wordmark placeholder) and forbid modification. The placeholder is a **temporary** stand-in; swap to press-kit SVGs before any external announcement.
