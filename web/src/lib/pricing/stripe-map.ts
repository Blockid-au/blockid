// stripe-map — plan id → Stripe env var → expected A$ (G18-A, 2026-09-19).
//
// The ONE table that says which `STRIPE_PRICE_*` env var each sold SKU
// bills through and what that price must be. Three sources feed it:
//   • `plans.csv` → plans.generated (subscription rows, `stripe_env_var`,
//     annual = `${stripe_env_var}_ANNUAL`, matching plans-db.ts)
//   • `lib/stripe.ts` STRIPE_PRICE_MAP (credit packs, one-off reports,
//     the Equity add-on, the Startup Package)
//   • `config/pricing/stripe-price-catalogue.json` — what Stripe holds today
//     (from the read-only audit; names + amounts, never ids)
// `stripe-map.test.ts` asserts the three agree; `scripts/stripe-price-audit.mjs`
// asserts Stripe still matches the catalogue every week.
//
// Pure module, no I/O — safe anywhere.

import catalogue from "@/config/pricing/stripe-price-catalogue.json";
import { GENERATED_PLANS } from "@/config/pricing/plans.generated";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { REPORT_SKUS } from "@/lib/pricing/v3-skus";
import { EQUITY_ADDON_MONTHLY_AUD } from "@/lib/plans-v2";

export type CatalogueInterval = "month" | "year" | "one_off";
export type TaxBehavior = "inclusive" | "exclusive" | "unspecified";

export interface CataloguePrice {
  plan_id: string;
  name: string;
  amount_cents: number;
  interval: CatalogueInterval;
  tax_behavior: TaxBehavior;
  active: boolean;
  legacy?: boolean;
  retired?: boolean;
  /** G21 P0-C: sold by the site, price not yet minted by the founder (env var unset → contact fallback). */
  founder_mints?: boolean;
}

export const STRIPE_PRICE_CATALOGUE: Readonly<Record<string, CataloguePrice>> =
  catalogue.prices as Record<string, CataloguePrice>;

/** One sold SKU → the env var it bills through and the amount the site shows. */
export interface StripeMapRow {
  plan_id: string;
  env_var: string;
  interval: CatalogueInterval;
  /** A$ the site advertises, in cents, GST-inclusive. */
  expected_cents: number;
  /** Where the row's expectation comes from. */
  source: "plans.csv" | "credit-packs" | "v3-skus" | "plans-v2";
}

/**
 * Every SKU the site can sell today, with the env var checkout resolves.
 * Free / custom / retired rows are excluded (they mint no Stripe price or
 * are archived); the catalogue's `legacy` rows are excluded because nothing
 * in web/src reads them any more.
 */
export function stripeMapRows(): StripeMapRow[] {
  const rows: StripeMapRow[] = [];

  for (const p of GENERATED_PLANS) {
    if (!p.active || !p.stripe_env_var) continue;
    if (p.interval !== "monthly" && p.interval !== "once") continue;
    if (p.price_aud_cents <= 0) continue;
    rows.push({
      plan_id: p.id,
      env_var: p.stripe_env_var,
      interval: p.interval === "once" ? "one_off" : "month",
      expected_cents: p.price_aud_cents,
      source: "plans.csv",
    });
    const annualVar = `${p.stripe_env_var}_ANNUAL`;
    if (p.interval === "monthly" && p.annual_price_aud_cents > 0 && annualVar in STRIPE_PRICE_CATALOGUE) {
      rows.push({
        plan_id: p.id,
        env_var: annualVar,
        interval: "year",
        expected_cents: p.annual_price_aud_cents,
        source: "plans.csv",
      });
    }
  }

  for (const pack of CREDIT_PACKS) {
    rows.push({
      plan_id: `credits_${pack.credits}`,
      env_var: `STRIPE_PRICE_CREDITS_${pack.credits}`,
      interval: "one_off",
      expected_cents: pack.priceAudCents,
      source: "credit-packs",
    });
  }

  const SKU_ENV: Record<string, string> = {
    sku_trust_report_5aud: "STRIPE_PRICE_TRUST_REPORT_5AUD",
    sku_one_click_report_3aud: "STRIPE_PRICE_ONE_CLICK_REPORT",
    sku_funding_report_3aud: "STRIPE_PRICE_FUNDING_REPORT",
  };
  for (const sku of REPORT_SKUS) {
    if (!sku.stripe_managed || sku.unit_amount_incl_gst_cents === null) continue;
    rows.push({
      plan_id: sku.id,
      env_var: SKU_ENV[sku.id],
      interval: "one_off",
      expected_cents: sku.unit_amount_incl_gst_cents,
      source: "v3-skus",
    });
  }

  rows.push(
    {
      plan_id: "addon_share_mgmt",
      env_var: "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY",
      interval: "month",
      expected_cents: EQUITY_ADDON_MONTHLY_AUD * 100,
      source: "plans-v2",
    },
    {
      plan_id: "addon_share_mgmt",
      env_var: "STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL",
      interval: "year",
      expected_cents: EQUITY_ADDON_MONTHLY_AUD * 10 * 100,
      source: "plans-v2",
    },
  );

  return rows;
}

/** Catalogue rows nothing in web/src reads any more — founder may archive them in Stripe. */
export function legacyCatalogueEnvVars(): string[] {
  return Object.entries(STRIPE_PRICE_CATALOGUE)
    .filter(([, v]) => v.legacy)
    .map(([k]) => k);
}

/** Active catalogue rows whose tax_behavior is not `inclusive` — a Stripe-dashboard fix only the founder can make. */
export function nonInclusiveCatalogueEnvVars(): string[] {
  return Object.entries(STRIPE_PRICE_CATALOGUE)
    .filter(([, v]) => v.active && v.tax_behavior !== "inclusive")
    .map(([k]) => k);
}
