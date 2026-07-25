# Sponsor / Accelerator Curator Strip — Design Spec

## 1. Curator log (verified programs)

Only the four programs listed here may appear in `web/config/marketing-partners.json`. Adding a fifth requires a signed record filed under `web/content/pitch/` **before** the config is touched.

| Program | Group | Official URL | Basis for inclusion |
| --- | --- | --- | --- |
| Founder Institute | accepted | https://fi.co | Program acceptance (curator to file evidence in web/content/pitch/) |
| NVIDIA Inception | accepted | https://www.nvidia.com/en-us/startups/ | Program acceptance (curator to file evidence) |
| Spacecubed AI Fellowship | accepted | https://spacecubed.com/labs/ | Program acceptance (curator to file evidence) |
| Stripe for Startups | integrated | https://stripe.com/startups | Live Stripe integration in production |

## 2. Surfaces & label taxonomy

| Surface | Component | Group(s) | Density |
| --- | --- | --- | --- |
| Home `/` (v2 hero) | `TrustStrip` | `accepted` + `integrated` (two rows) | default |
| `/about` (below Australian-Native band) | `LogoCloud` | `accepted` | default |
| `/pricing` (immediately above final CTA) | `LogoCloud` | `integrated` | compact |
| Site `Footer` (dark) | `PartnerFooterRow` | `accepted` | monochrome |
| `MarketingFooter` (lux) | `PartnerFooterRow` | `accepted` | monochrome |

## 3. Schema

`web/config/marketing-partners.json` is widened but backward compatible:

```jsonc
{
  "headline": "Working with",          // legacy LogoCloud eyebrow
  "partners": [],                       // legacy LogoCloud entries — kept empty
  "investors_headline": "Backed by",   // legacy TrustStrip eyebrow
  "investors": [],                      // legacy TrustStrip entries — kept empty
  "groups": {
    "accepted":   { "label": "Accepted into",  "entries": [...] },
    "integrated": { "label": "Integrated with", "entries": [...] },
    "backed":     { "label": "Backed by",       "entries": [] }
  }
}
```

Each entry is either a bare string (legacy, label-only render) or an object:

```ts
type PartnerEntry =
  | string
  | { name: string; src?: string; href?: string; alt?: string; label?: string };
```

`normaliseEntry` in `web/src/components/landing/partners-types.ts` narrows the union before any rendering — no `any`, no unchecked object access.

## 4. Rendering rules

- Every `href` opens in a new tab: `target="_blank" rel="noopener noreferrer"`.
- Every logo has a non-empty `alt` (falls back to `name` if omitted).
- SVGs use `currentColor` so they inherit the surrounding ink token — grayscale/hover works without extra CSS.
- Focus rings: `brand-500` on light surfaces (about, pricing, site footer), `--fintech-accent` on lux hero + marketing footer.
- Rendering is inert when: config missing, JSON malformed, resolved group missing, or resolved entries array empty. No error, no layout break.

## 5. Acceptance criteria

1. Four strips render on the five surfaces above.
2. Every tile is a valid SVG at `viewBox="0 0 240 60"` with `currentColor` fill and a non-empty accessible name.
3. Every tile links to its program's official URL with `target="_blank" rel="noopener noreferrer"`.
4. Deleting the config file or emptying `groups` renders nothing on every surface.
5. Focus-visible ring appears on every logo link (brand or fintech accent by surface).
6. `pnpm lint` + `pnpm typecheck` pass; the PartnerEntry union narrows through `normaliseEntry` before rendering.
7. This log stays authoritative — adding to the config without updating section 1 is a PR blocker.

## 6. Risks

- Placeholder SVGs are text-only wordmarks — they read as clean but carry no brand equity. NVIDIA Inception and Stripe brand guidelines require official assets; swap the SVG files under `web/public/partners/` before external announcement (no code change needed).
- `web/src/app/page.tsx` gates on `NEXT_PUBLIC_UPGRADE_V2`. The strip lives inside the v2 branch. If we ever revert to v1, `SVIEntrance` must also mount the strip.
- Two-footer split (site `Footer` light-on-dark vs `MarketingFooter` lux) is a pre-existing recon finding. `PartnerFooterRow` renders on both for parity but does not resolve the duplication.
- Curator drift risk — a config edit without a corresponding entry in section 1 above would silently publish an unverified affiliation. Enforce through PR review; the loader cannot verify authenticity.
- Homepage renders two adjacent TrustStrip rows. Verify at <640px that the eyebrows do not compete visually; collapse `mt-8` → `mt-6` if a design QA pass calls for it.
