/**
 * Prices for the persona pages under `/solutions/*`, read from the catalogue.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-09 all four persona pages were advertising a product that has
 * never been sold: a "Trust Report" at A$5.50 (`report_orders` has never held
 * a row), a "Trusted Advisor session" at A$149 (`advisor_portal` and
 * `advisor_notes` do not exist in the database), and a "13-area analysis"
 * against a product that scores eight dimensions. Every one of those figures
 * was a literal in `en.json` / `vi.json`, which is exactly why they could sit
 * there for months after the product moved: a string cannot follow a price
 * change it does not know about. The same fault had already put three wrong
 * amounts on `/for/*`.
 *
 * So no persona string names an amount any more. Copy carries a token —
 * `{growthPrice}`, `{freePages}` — and `fillPrices()` substitutes the value
 * the catalogue holds at build time. Change `plans.csv` and both the English
 * page and its Vietnamese mirror follow, because both run their strings
 * through the same substitution inside `SolutionsPageShell`.
 *
 * Every token below resolves to a module that already owns the number:
 *
 *   freePages       `FREE_SUMMARY_PAGE_COUNT` — lib/analyses/free-summary
 *   reportPrice     `ONE_CLICK_REPORT_3AUD`   — lib/pricing/v3-skus
 *   founderPrice    `founder_starter`         — config/pricing/plans.generated
 *   growthPrice     `founder_growth`          — config/pricing/plans.generated
 *   equityAddon     `EQUITY_ADDON_MONTHLY_AUD`— lib/plans-v2
 *   founderCredits  `founder_starter.usage_limits.monthly_credits`
 *   growthCredits   `founder_growth.usage_limits.monthly_credits`
 *
 * Evaluator ladder (G12, founder decision D2 2026-09-10 — Scout / Firm /
 * Program re-use the `investor_angel` / `investor_advisor` /
 * `investor_vc_small` rows):
 *
 *   scoutPrice, firmPrice, programPrice        `price_aud_cents`
 *   scoutReports, firmReports, programReports  `usage_limits.reports_per_month`
 *   scoutStartups, firmStartups, programStartups `usage_limits.profiles`
 *   firmSeats, programSeats                    `usage_limits.seats`
 *
 * A token nobody defined is left in place rather than blanked, so a typo
 * surfaces as a visible `{typo}` in the rendered page and in the colocated
 * suite instead of silently deleting half a sentence.
 */

import { FREE_SUMMARY_PAGE_COUNT } from "@/lib/analyses/free-summary";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { EQUITY_ADDON_MONTHLY_AUD } from "@/lib/plans-v2";

/** A$ from cents, with no trailing `.00` on a whole dollar amount. */
function aud(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `A$${dollars.toLocaleString("en-AU")}`
    : `A$${dollars.toFixed(2)}`;
}

/**
 * Throw rather than print a wrong or empty amount.
 *
 * This module is imported by server components at build time, so a plan id
 * that stops existing fails the build instead of rendering "A$0" or "A$NaN"
 * to a visitor. A marketing page showing the wrong price is a compliance
 * problem, not a copy problem.
 */
function planCents(planId: string): number {
  const plan = GENERATED_PLANS_BY_ID[planId];
  if (!plan) {
    throw new Error(`/solutions copy names unknown plan "${planId}"`);
  }
  return plan.price_aud_cents;
}

function planCredits(planId: string): number {
  const plan = GENERATED_PLANS_BY_ID[planId];
  if (!plan) {
    throw new Error(`/solutions copy names unknown plan "${planId}"`);
  }
  const credits = plan.usage_limits.monthly_credits;
  if (typeof credits !== "number" || credits <= 0) {
    throw new Error(`/solutions copy names plan "${planId}" with no credit grant`);
  }
  return credits;
}

/** A named usage limit from a plan row; throws when the row does not carry it. */
function planLimit(planId: string, key: string): number {
  const plan = GENERATED_PLANS_BY_ID[planId];
  if (!plan) {
    throw new Error(`/solutions copy names unknown plan "${planId}"`);
  }
  const value = (plan.usage_limits as Record<string, unknown>)[key];
  if (typeof value !== "number" || value <= 0) {
    throw new Error(`/solutions copy names plan "${planId}" with no "${key}" limit`);
  }
  return value;
}

function reportCents(): number {
  const cents = ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents;
  if (typeof cents !== "number" || !Number.isFinite(cents)) {
    throw new Error("/solutions copy names the report SKU, which has no price");
  }
  return cents;
}

/** Token -> rendered value. Every value comes from the catalogue. */
export const SOLUTION_PRICE_TOKENS: Readonly<Record<string, string>> = {
  freePages: String(FREE_SUMMARY_PAGE_COUNT),
  reportPrice: aud(reportCents()),
  founderPrice: aud(planCents("founder_starter")),
  growthPrice: aud(planCents("founder_growth")),
  equityAddon: `A$${EQUITY_ADDON_MONTHLY_AUD}`,
  founderCredits: String(planCredits("founder_starter")),
  growthCredits: String(planCredits("founder_growth")),
  // Evaluator ladder — every number below is a plans.csv cell.
  scoutPrice: aud(planCents("investor_angel")),
  firmPrice: aud(planCents("investor_advisor")),
  programPrice: aud(planCents("investor_vc_small")),
  scoutReports: String(planLimit("investor_angel", "reports_per_month")),
  firmReports: String(planLimit("investor_advisor", "reports_per_month")),
  programReports: String(planLimit("investor_vc_small", "reports_per_month")),
  scoutStartups: String(planLimit("investor_angel", "profiles")),
  firmStartups: String(planLimit("investor_advisor", "profiles")),
  programStartups: String(planLimit("investor_vc_small", "profiles")),
  firmSeats: String(planLimit("investor_advisor", "seats")),
  programSeats: String(planLimit("investor_vc_small", "seats")),
};

const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/g;

/**
 * Substitute every `{token}` in a persona string.
 *
 * Unknown tokens are returned untouched — a `{slug}` in "publish to
 * /listings/{slug}" is a URL shape, not a price, and blanking it would make
 * the sentence say something else. The colocated suite pins that behaviour.
 */
export function fillPrices(text: string): string {
  return text.replace(TOKEN_PATTERN, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(SOLUTION_PRICE_TOKENS, name)
      ? SOLUTION_PRICE_TOKENS[name]
      : whole,
  );
}
