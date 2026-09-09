// The three rungs, and where every number on them comes from.
//
// The homepage's provenance rule (see `sample-runs.ts`) is that no figure is
// typed into a component by hand. It applies to prices at least as strictly as
// it applies to scores: a price that drifts from what Stripe actually charges
// is a compliance problem, not a copy problem. So each tier reads its own
// price from the module that already owns it —
//
//   free    A$0        · page count from `@/lib/analyses/free-summary`
//   report  A$3.00     · `ONE_CLICK_REPORT_3AUD` in `@/lib/pricing/v3-skus`
//   work    A$29/month · `founder_starter` in `@/config/pricing/plans.generated`
//
// — and the colocated suite asserts the rendered labels equal the values those
// modules hold. Change a price at its source and the homepage follows; change
// it here and the suite fails.
//
// WHY THREE, IN THIS ORDER
//
// Each rung asks for exactly one more thing than the one below it, and each
// gives something the one below it cannot:
//
//   1. Nothing at all → the score and the valuation range, on screen.
//   2. An email       → the same thing written down, five pages, forwardable.
//   3. A$3            → the working behind it, ten pages or more.
//   4. A$29/month     → an account, the workspace, and equity you can issue.
//
// Rungs 1 and 2 are one card on the page: the visitor does not experience
// "run it" and "have it emailed" as two products, and splitting them into two
// cards would make the free tier look like it costs something.

import {
  FREE_SUMMARY_PAGE_COUNT,
  FREE_SUMMARY_PAGES,
} from "@/lib/analyses/free-summary";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";

/** The plan behind the subscription rung. */
const STARTER = GENERATED_PLANS_BY_ID.founder_starter;

/**
 * A price we are willing to print, or nothing at all.
 *
 * `V3Sku.unit_amount_incl_gst_cents` is nullable (some SKUs are quote-only).
 * A nullable price reaching a rendered rung would print "A$0" for something we
 * charge for, so it fails loudly at module load instead. The colocated suite
 * pins the real values, so this can only fire if somebody nulls a price at its
 * source — which is a thing that should stop a deploy, not reach a visitor.
 */
export function requireCents(cents: number | null, label: string): number {
  if (typeof cents !== "number" || !Number.isFinite(cents)) {
    throw new Error(`homepage tier "${label}" has no price to display`);
  }
  return cents;
}

/** A$ from cents, with no trailing `.00` on a whole dollar amount. */
export function audLabel(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `A$${dollars}`
    : `A$${dollars.toFixed(2)}`;
}

export interface HomepageTier {
  id: "free" | "report" | "workspace";
  /** Short name, used in the hero strip and as the card eyebrow. */
  name: string;
  /** The headline figure. */
  price: string;
  /** What follows the figure — "one-off", "a month", or nothing. */
  priceSuffix: string | null;
  /** The single thing this rung asks of the visitor. */
  ask: string;
  /** One line: what you get for it. Used in the hero strip. */
  gist: string;
  /** The card's body list. Every line is a thing the product does today. */
  includes: readonly string[];
  cta: { label: string; href: string };
  /** Marks the rung we point people at next. Not a popularity claim. */
  emphasis: boolean;
}

export const HOMEPAGE_TIERS: readonly HomepageTier[] = [
  {
    id: "free",
    name: "Free",
    price: "A$0",
    priceSuffix: null,
    ask: "An email address, and only if you want the written version",
    gist: `Score and valuation on screen, then a ${FREE_SUMMARY_PAGE_COUNT}-page summary emailed`,
    includes: [
      "Your score and valuation range on screen, before anything is asked of you",
      `A ${FREE_SUMMARY_PAGE_COUNT}-page written summary, emailed — yours to forward`,
      ...FREE_SUMMARY_PAGES.slice(0, 3).map((page) => page.title),
      "One-click unsubscribe on every email we send",
    ],
    cta: { label: "Start with an idea, a link or a deck", href: "#top" },
    emphasis: false,
  },
  {
    id: "report",
    name: "Full report",
    price: audLabel(
      requireCents(
        ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents,
        "report",
      ),
    ),
    priceSuffix: "one-off, inc GST",
    ask: "A$3, once. No account, no subscription",
    gist: "The written report — the working behind the number, 10+ pages",
    includes: [
      "Everything in the free summary, plus the working behind it",
      "Four valuation methods, their inputs, and where they disagree",
      "A page per dimension with the rationale, not just the number",
      "Risk landscape and a 90-day roadmap",
      "Emailed as a PDF, usually within a few minutes",
    ],
    cta: { label: "Get the full report", href: "/one-click-report" },
    emphasis: true,
  },
  {
    id: "workspace",
    name: "Workspace",
    price: audLabel(requireCents(STARTER.price_aud_cents, "workspace")),
    priceSuffix: "a month",
    ask: "An account. Cancel whenever you like",
    gist: "Track the score over time, and issue equity when you are ready",
    includes: [
      `Up to ${STARTER.usage_limits.svi_per_month} analyses a month, kept on your account`,
      "Your score tracked over time, not one snapshot",
      "The data room, filling up in the order investors ask",
      "Cap table, vesting and an ESOP you can actually issue",
      "Share a live link with an investor instead of a PDF",
    ],
    cta: { label: "See plans and pricing", href: "/pricing" },
    emphasis: false,
  },
];

/** The hero's one-line ladder: name + price + gist, in ladder order. */
export interface TierChip {
  id: HomepageTier["id"];
  label: string;
  gist: string;
}

export function heroTierChips(): TierChip[] {
  return HOMEPAGE_TIERS.map((tier) => ({
    id: tier.id,
    label:
      tier.id === "free"
        ? "Free"
        : tier.priceSuffix === "a month"
          ? `${tier.price}/mo`
          : tier.price,
    gist: tier.gist,
  }));
}
