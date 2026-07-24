/**
 * CTA copy + destination table, keyed by (SVI phase, surface).
 *
 * Central source of truth so the sticky CTA, marketing hero, and paywall
 * modal never drift apart, and so A/B experiments can swap a single row
 * without hunting through JSX. Pure module — no React, no side effects,
 * trivially unit-testable.
 *
 * SVI phases mirror the platform 8-phase roadmap (see
 * project_platform_roadmap): vision → validation → traction → growth →
 * fundraising → scale. Surfaces are the marketing pages we mount the
 * CTA on today.
 */

export const SVI_PHASES = [
  "vision",
  "validation",
  "traction",
  "growth",
  "fundraising",
  "scale",
] as const;

export type SviPhase = (typeof SVI_PHASES)[number];

export const CTA_SURFACES = [
  "pricing",
  "founding50",
  "landing",
] as const;

export type CtaSurface = (typeof CTA_SURFACES)[number];

export type CtaTone = "accent" | "amber" | "emerald";

export interface CtaVariant {
  /** Button label. Never empty. */
  label: string;
  /** Internal href; must start with "/". */
  href: string;
  /** Colour token bucket — the sticky CTA maps this to a design token class. */
  tone: CtaTone;
  /** Optional one-line subtext (used by sticky CTA on desktop). */
  subtext?: string;
}

// Copy table keyed by `${phase}:${surface}`. Kept flat so the type-checker
// can verify every combination is present (see the exhaustive-loop test in
// __tests__/cta-variants.test.ts).
const VARIANTS: Record<`${SviPhase}:${CtaSurface}`, CtaVariant> = {
  // ── Vision (day 0 – no product yet) ──────────────────────────────────
  "vision:pricing": {
    label: "Get your first SVI score — free",
    href: "/signup?plan=free&from=pricing",
    tone: "accent",
    subtext: "No card required. Takes 2 minutes.",
  },
  "vision:founding50": {
    label: "Claim a Founding-50 spot — A$5",
    href: "/founding-50",
    tone: "amber",
    subtext: "Lifetime SVI account. 100 spots only.",
  },
  "vision:landing": {
    label: "Score my startup — free",
    href: "/signup?plan=free&from=landing",
    tone: "accent",
    subtext: "First SVI score in 2 minutes.",
  },

  // ── Validation ────────────────────────────────────────────────────────
  "validation:pricing": {
    label: "Start 7-day free trial",
    href: "/signup?plan=founder-starter&trial=1",
    tone: "accent",
    subtext: "Card required. Charged on Day 8.",
  },
  "validation:founding50": {
    label: "Lock in Founding-50 price",
    href: "/founding-50",
    tone: "amber",
    subtext: "A$5 lifetime — 100 spots only.",
  },
  "validation:landing": {
    label: "Start 7-day free trial",
    href: "/signup?plan=founder-starter&trial=1",
    tone: "accent",
    subtext: "Cancel any time before Day 8.",
  },

  // ── Traction (early revenue / users) ─────────────────────────────────
  "traction:pricing": {
    label: "Start 7-day trial — Founder Pro",
    href: "/signup?plan=founder-pro&trial=1",
    tone: "accent",
    subtext: "Full workspace + investor exports.",
  },
  "traction:founding50": {
    label: "Founding-50 A$5 — includes Pro",
    href: "/founding-50",
    tone: "amber",
    subtext: "Cheaper than one month of Pro.",
  },
  "traction:landing": {
    label: "Start 7-day Pro trial",
    href: "/signup?plan=founder-pro&trial=1",
    tone: "accent",
    subtext: "Everything you need to raise.",
  },

  // ── Growth (post-seed) ────────────────────────────────────────────────
  "growth:pricing": {
    label: "Talk to sales",
    href: "/contact?intent=growth",
    tone: "emerald",
    subtext: "Custom pricing for growth teams.",
  },
  "growth:founding50": {
    label: "See growth plans",
    href: "/pricing?tier=founder&highlight=founder-growth",
    tone: "accent",
    subtext: "Or claim a Founding-50 spot below.",
  },
  "growth:landing": {
    label: "Book a demo",
    href: "/contact?intent=demo",
    tone: "emerald",
    subtext: "See BlockID mapped to your stage.",
  },

  // ── Fundraising ───────────────────────────────────────────────────────
  "fundraising:pricing": {
    label: "Start 7-day Investor trial",
    href: "/signup?plan=investor-pro&trial=1",
    tone: "accent",
    subtext: "Deal-room + LP exports.",
  },
  "fundraising:founding50": {
    label: "Founding-50 A$5 — includes Investor",
    href: "/founding-50",
    tone: "amber",
    subtext: "Data room + LP evidence pack.",
  },
  "fundraising:landing": {
    label: "Open a fundraise deal-room",
    href: "/signup?plan=investor-pro&trial=1",
    tone: "accent",
    subtext: "7-day trial. Card on Day 8.",
  },

  // ── Scale ─────────────────────────────────────────────────────────────
  "scale:pricing": {
    label: "Contact enterprise",
    href: "/contact?intent=enterprise",
    tone: "emerald",
    subtext: "SSO, API, dedicated CSM.",
  },
  "scale:founding50": {
    label: "See enterprise pricing",
    href: "/pricing?tier=accelerator",
    tone: "accent",
    subtext: "Founding-50 not sized for scale.",
  },
  "scale:landing": {
    label: "Book an enterprise demo",
    href: "/contact?intent=enterprise-demo",
    tone: "emerald",
    subtext: "Multi-entity, SSO, API access.",
  },
};

/**
 * Return the CTA copy + destination for a given (phase, surface) pair.
 * Falls back to the `validation:<surface>` row when the phase is unknown
 * (defensive — the type system already narrows this at the callsite).
 */
export function getCtaVariant(
  phase: SviPhase,
  surface: CtaSurface,
): CtaVariant {
  const key = `${phase}:${surface}` as const;
  const hit = VARIANTS[key];
  if (hit) return hit;
  // Type-checker guarantees every combination is present, but keep a
  // runtime safety net so a bad enum value never returns undefined.
  return VARIANTS[`validation:${surface}` as const];
}

/**
 * Enumerate every (phase, surface) pair. Used by tests to guarantee full
 * branch coverage.
 */
export function allCtaKeys(): Array<{ phase: SviPhase; surface: CtaSurface }> {
  const out: Array<{ phase: SviPhase; surface: CtaSurface }> = [];
  for (const phase of SVI_PHASES) {
    for (const surface of CTA_SURFACES) {
      out.push({ phase, surface });
    }
  }
  return out;
}
