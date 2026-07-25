# Partner / Accelerator Logo Assets

Files in this directory are served at `/partners/<name>.svg` and consumed by:

- `web/src/components/landing/logo-cloud.tsx`
- `web/src/components/landing/trust-strip.tsx`
- `web/src/components/marketing/partner-footer-row.tsx`

They are referenced by relative URL from `web/config/marketing-partners.json`. **No code change is required to swap a placeholder for an official press-kit asset** — replace the file in place under the same filename.

## Current inventory

| File | Program | Official press kit / brand page |
| --- | --- | --- |
| `founder-institute.svg` | Founder Institute | https://fi.co/press |
| `nvidia-inception.svg` | NVIDIA Inception | https://www.nvidia.com/en-us/startups/ (request logo via Inception portal) |
| `stripe-for-startups.svg` | Stripe for Startups | https://stripe.com/newsroom/brand-assets |
| `spacecubed-ai-fellowship.svg` | Spacecubed AI Fellowship | https://spacecubed.com/press (email hello@spacecubed.com for logo) |

All four files above are **text-only wordmark placeholders**. They render legibly at 120 px width and use `currentColor` so they inherit the surrounding ink colour (dark on light surfaces, light on the lux hero). They carry **no brand equity** — they exist so the strip can render before official assets land.

## Swap-out procedure

1. Download the official SVG from the program's press kit (the URLs above).
2. Optimise with [`svgo`](https://github.com/svg/svgo) — no config change needed:
   ```
   npx svgo --multipass logo.svg -o logo.svg
   ```
3. Edit the top of the file to preserve the contract every consumer relies on:
   - `viewBox="0 0 240 60"` — resize/reposition the logo inside this box if the press-kit viewBox differs; do **not** change the box.
   - Strip any `width=` / `height=` attributes from `<svg>` so CSS controls the render size.
   - Strip hard-coded `fill=` colours from the top-level path/text nodes so the mark inherits `currentColor`. Leave brand-required colours (e.g. Stripe's fluorescent purple) as literal `fill="#…"` — the surrounding tile will fall back to no-hover styling.
   - Keep `role="img"` on `<svg>` and a `<title>` child matching the program name — this is the accessible name announced by screen readers.
4. Save it over the existing file with the **same filename**. Commit both the new asset and (if the visual changed materially) a short entry in `docs/plans/uiux-sync-2026-07-24/01-sponsor-curator.md`.

## Adding a NEW program

Editing this directory is **not** enough — a new program must also appear in the curator log at `docs/plans/uiux-sync-2026-07-24/01-sponsor-curator.md` before `web/config/marketing-partners.json` is touched. The loader cannot verify authenticity; the review checklist is the safety net.

## Guardrail

The rendering components render `null` when `web/config/marketing-partners.json` is missing or empty. Never fabricate partner affiliations — a placeholder SVG on disk with no matching entry in the config file is inert (never displayed).
