# BlockID — Design System Master

> When building a page, check `design-system/blockid/pages/[page].md` first. If it exists, it overrides this file. Otherwise, follow the rules below.

**Project:** BlockID — Persistent Identity & Trust Infrastructure for Private Capital Markets
**Style direction:** Enterprise Trust + Bento Grid (selected by user)
**Audience:** AU seed-to-Series-A founders + VCs / accelerators / accountants

---

## Brand Voice

- Tone: confident, institutional, plain English. No hype, no crypto jargon.
- Headline pattern: short noun phrase + outcome (e.g. "Investor-Ready in 5 minutes").
- Always position as: *"Persistent Identity & Trust Infrastructure for Private Capital Markets"*.
- Never lead with: blockchain, tokens, sovereign chains, marketplace.

---

## Color Palette (Enterprise Trust — navy/slate + deep teal)

| Role | Hex | Tailwind token | Usage |
|------|-----|----------------|-------|
| Background base | `#0B1220` | `bg-ink-950` | Page background (dark sections) |
| Surface | `#0F172A` | `bg-ink-900` | Cards, hero surface |
| Surface raised | `#172033` | `bg-ink-800` | Bento tiles |
| Border subtle | `#1F2A44` | `border-ink-700` | Card borders |
| Text primary (on dark) | `#F8FAFC` | `text-slate-50` | Headlines |
| Text secondary (on dark) | `#94A3B8` | `text-slate-400` | Body |
| Text muted (on dark) | `#64748B` | `text-slate-500` | Captions |
| Background light | `#F8FAFC` | `bg-paper-50` | Pricing / data sections |
| Surface light | `#FFFFFF` | `bg-white` | Cards on light bg |
| Text primary (on light) | `#0F172A` | `text-ink-900` | Headlines |
| Text secondary (on light) | `#475569` | `text-slate-600` | Body |
| **Accent (primary CTA)** | `#0FB5A9` | `bg-teal-500` | Primary buttons, score gauges, key data |
| Accent hover | `#0E9F94` | `bg-teal-600` | Hover state |
| Accent soft glow | `rgba(15,181,169,0.15)` | — | Glow under CTA / focus rings |
| Success | `#22C55E` | `text-green-500` | Score uplift, positive deltas |
| Warning | `#F59E0B` | `text-amber-500` | Cap table dilution warnings |
| Danger | `#EF4444` | `text-red-500` | Risk flags |

Rationale: deep navy projects institutional trust (Bloomberg / Carta); teal accent reads as "data + verification" without falling into crypto-green. Avoid gold (too consumer-fintech) and purple (too crypto).

---

## Typography

- **Display / Headings:** `Inter` (variable, weights 500–800, tight tracking). Use for marketing headings.
- **Body / UI:** `Inter` (400/500/600).
- **Numerics, scores, code, data labels:** `IBM Plex Mono` (500/600). Use for the Investor-Ready Score number, ABN/ASIC codes, money figures inside cards, comparable-companies multiples.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');
```

Type scale (Tailwind):
- Hero H1: `text-5xl md:text-7xl font-semibold tracking-tight`
- Section H2: `text-3xl md:text-5xl font-semibold tracking-tight`
- Card title: `text-lg font-semibold`
- Body: `text-base md:text-lg leading-relaxed text-slate-400` (dark) / `text-slate-600` (light)
- Eyebrow: `text-xs uppercase tracking-[0.2em] text-teal-400 font-medium`
- Score number: `font-mono text-7xl tabular-nums tracking-tight text-teal-400`

---

## Layout

- Container: `max-w-7xl mx-auto px-6`.
- Section vertical rhythm: `py-24 md:py-32`.
- Bento grid: 12-col on desktop, 6-col on tablet, 1-col on mobile. Tile heights 1× / 2× of base unit. Gap: `gap-4 md:gap-6`.
- Floating navbar: `fixed top-4 left-4 right-4` with `backdrop-blur` and `border border-white/10` on dark bg.

---

## Spacing & Radius

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 64px |
| Radius card | 16px (`rounded-2xl`) |
| Radius button | 10px (`rounded-[10px]`) |
| Radius pill | 9999px |

## Shadows / Glow

- `--shadow-card`: `0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)` (dark surfaces)
- `--shadow-cta`: `0 0 0 1px rgba(15,181,169,0.4), 0 8px 32px rgba(15,181,169,0.25)`
- Light surfaces: `shadow-sm`/`shadow-md` only — no heavy drop shadows.

---

## Component Specs

### Primary CTA button
```
bg-teal-500 hover:bg-teal-600 text-ink-950 font-semibold
px-5 py-3 rounded-[10px] cursor-pointer
transition-colors duration-200
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60
shadow-[0_8px_32px_rgba(15,181,169,0.25)]
```

### Secondary CTA button (on dark)
```
bg-white/5 hover:bg-white/10 text-slate-50 font-medium
border border-white/10 px-5 py-3 rounded-[10px] cursor-pointer
transition-colors duration-200
```

### Bento tile
```
group relative overflow-hidden rounded-2xl
bg-ink-800 border border-ink-700
p-6 md:p-8 cursor-default
transition-colors duration-200 hover:border-teal-500/40
```
- No layout-shifting hover; only border + subtle teal glow.
- Each tile: eyebrow tag → bold one-line title → 1 short paragraph → mini visual (chart / score / list).

### Score gauge (Investor-Ready Score)
- Large mono number (e.g. `87`) + `/100` slate-500 suffix.
- Sub-bars: 5 stacked horizontal bars (Financials, Cap Table Hygiene, Governance, Founder Background, Documentation), each 6px tall, teal fill on `bg-ink-700`.

### Inputs
```
bg-ink-900 border border-ink-700 rounded-[10px] px-4 py-3
text-slate-50 placeholder:text-slate-500
focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30
transition-colors duration-200
```

---

## Page Pattern (Landing)

Section order:
1. **Floating nav** — Logo · Product · Pricing · Tools · Login · `Get Score` (primary)
2. **Hero** — eyebrow "Australian-built" → H1 "Persistent Identity & Trust Infrastructure for Private Capital Markets" → subline → primary `Get Investor-Ready Score — Free` + secondary `Book a 15-min demo` → mock score card on the right.
3. **Logo cloud** — accelerators (Startmate, Antler, BlueChilli, Stone & Chalk, Cicada) — grayscale, 60% opacity, hover full color.
4. **Bento features** — 7 tiles for the Winning Features (Score, Investor View Link, Term Sheet AI, Cap Table Diff, Comparable Companies Wall, AU Compliance, Stripe + Xero plug).
5. **Comparable Companies Wall** mock — table with anonymized AU SMEs, multiples, sector medians.
6. **AU Compliance moat** — ASIC · ESIC · R&D · AUSTRAC, badges row + short copy.
7. **Pricing** — 5 tiers (Free, Founder $99, Growth $499, Pilot Concierge $5k, Accelerator $20–60k).
8. **For Investors / VCs** — Investor Welcome Pack pitch.
9. **FAQ** — objection handling (Carta? blockchain? trust?).
10. **CTA strip** — "Get your score in 5 minutes" + email capture.
11. **Footer** — links + ABN line + AU data residency line.

CTA strategy: every section ends with one teal CTA pointing to `/score`. Secondary always "Book a demo".

---

## Style Guidelines

- **Style family:** Enterprise / Trust + Bento grid + minimal data viz.
- **Effects:** subtle teal glow under CTA, count-up animation on score, fade-in on logo cloud, no parallax, no glassmorphism overdose.
- **Iconography:** Lucide icons only, `w-5 h-5`, stroke-width 1.75. NEVER emoji.
- **Numbers:** all financial / score numbers in `IBM Plex Mono` with `tabular-nums`.
- **Imagery:** no stock photos of handshakes / cityscapes. Use product UI mocks (score card, cap table diff, dilution chart) as the hero image.

---

## Anti-Patterns (forbidden)

- ❌ Emojis as icons — use Lucide SVG.
- ❌ Crypto/blockchain language above the fold.
- ❌ Gradient backgrounds spanning entire sections (cheap-fintech feel).
- ❌ Layout-shifting hovers (`scale-105` etc.). Allowed: border color, glow, opacity.
- ❌ Light teal text on dark bg (contrast). Teal only for accent surfaces, CTAs, key numerics.
- ❌ Marketing copy > 2 lines per paragraph.
- ❌ Mixing more than 2 fonts.
- ❌ Containers wider than `max-w-7xl`.
- ❌ Body text < 16px on mobile.

---

## Pre-Delivery Checklist

- [ ] No emoji icons; Lucide SVG only.
- [ ] `cursor-pointer` on every clickable element; `cursor-default` on bento tiles.
- [ ] Hover transitions 150–250ms, color/border/opacity only.
- [ ] Text contrast ≥ 4.5:1 (verified for slate-400 on ink-900).
- [ ] Focus rings visible (teal-400/60 ring).
- [ ] `prefers-reduced-motion` respected (disable count-up + fades).
- [ ] Responsive at 375 / 768 / 1024 / 1440.
- [ ] No content hidden behind floating navbar (account for `pt-28` on hero).
- [ ] No horizontal scroll on mobile.
- [ ] Lighthouse a11y ≥ 95.
