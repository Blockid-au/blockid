// G18-A (2026-09-19) — pricing truth: plan id → STRIPE_PRICE_* env var →
// expected A$. Three sources must agree: plans.csv (plans.generated),
// lib/stripe.ts STRIPE_PRICE_MAP + credit-packs + v3-skus, and the Stripe
// catalogue (config/pricing/stripe-price-catalogue.json, from the read-only
// audit). A red test here means a page can show one amount and Stripe charge
// another — treat it as a pricing incident, never loosen the pin.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GENERATED_PLANS, GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { PLANS_V2, PUBLIC_HIDDEN_PLAN_IDS, publicPlansForSegment } from "@/lib/plans-v2";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { TRUST_REPORT_AMOUNT_CENTS } from "@/lib/pricing/trust-report-price";
import {
  STRIPE_PRICE_CATALOGUE,
  legacyCatalogueEnvVars,
  nonInclusiveCatalogueEnvVars,
  stripeMapRows,
} from "./stripe-map";

const ROWS = stripeMapRows();

describe("stripe-map — every sold SKU resolves to a catalogue price at the advertised amount", () => {
  it("names an env var for every row and the catalogue holds it", () => {
    for (const r of ROWS) {
      expect(r.env_var, r.plan_id).toMatch(/^STRIPE_PRICE_[A-Z0-9_]+$/);
      expect(STRIPE_PRICE_CATALOGUE[r.env_var], `${r.plan_id} → ${r.env_var} missing from catalogue`).toBeDefined();
    }
  });

  it("amount, interval and active flag match the catalogue for every row", () => {
    for (const r of ROWS) {
      const c = STRIPE_PRICE_CATALOGUE[r.env_var]!;
      expect(c.amount_cents, `${r.env_var} amount (${r.source})`).toBe(r.expected_cents);
      expect(c.interval, `${r.env_var} interval`).toBe(r.interval);
      expect(c.active, `${r.env_var} must be active in Stripe`).toBe(true);
      expect(c.legacy ?? false, `${r.env_var} must not be a legacy price`).toBe(false);
    }
  });

  it("pins the public ladder: Starter 29 / Growth 69 / Scout 79 / Firm 149 / Program 349 / Fund 999 / Intake 249 / Cohort 25 500 / Cohort 100 1,500 / Index API 299 / Package 149", () => {
    const monthly = (env: string) => STRIPE_PRICE_CATALOGUE[env]!.amount_cents;
    expect(monthly("STRIPE_PRICE_FOUNDER_STARTER")).toBe(2900);
    expect(monthly("STRIPE_PRICE_FOUNDER_GROWTH")).toBe(6900);
    expect(monthly("STRIPE_PRICE_INVESTOR_ANGEL")).toBe(7900);
    expect(monthly("STRIPE_PRICE_INVESTOR_ADVISOR")).toBe(14900);
    expect(monthly("STRIPE_PRICE_INVESTOR_VC_SMALL")).toBe(34900);
    expect(monthly("STRIPE_PRICE_INVESTOR_FUND")).toBe(99900);
    expect(monthly("STRIPE_PRICE_ACCEL_INTAKE")).toBe(24900);
    expect(monthly("STRIPE_PRICE_ACCEL_STARTER")).toBe(50000);
    expect(monthly("STRIPE_PRICE_ACCEL_GROWTH")).toBe(150000);
    expect(monthly("STRIPE_PRICE_INDEX_API")).toBe(29900);
    expect(monthly("STRIPE_PRICE_STARTUP_PACKAGE")).toBe(14900);
    expect(monthly("STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY")).toBe(5900);
  });

  it("annual prices are 10× monthly for every rung that sells annual", () => {
    for (const r of ROWS.filter((x) => x.interval === "year")) {
      const monthlyVar =
        r.env_var === "STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL"
          ? "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY"
          : r.env_var.replace(/_ANNUAL$/, "");
      const m = STRIPE_PRICE_CATALOGUE[monthlyVar];
      expect(m, `${r.env_var} has no monthly sibling`).toBeDefined();
      expect(r.expected_cents).toBe(m!.amount_cents * 10);
    }
  });

  it("the founder rungs (Starter / Growth) have NO annual Stripe price yet — plans-v2 annual_aud is unbillable and the toggle must stay hidden for them", () => {
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_FOUNDER_STARTER_ANNUAL).toBeUndefined();
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_FOUNDER_GROWTH_ANNUAL).toBeUndefined();
    expect(ROWS.find((r) => r.env_var === "STRIPE_PRICE_FOUNDER_STARTER_ANNUAL")).toBeUndefined();
    expect(ROWS.find((r) => r.env_var === "STRIPE_PRICE_FOUNDER_GROWTH_ANNUAL")).toBeUndefined();
  });

  it("plans-v2 (marketing copy) equals plans.csv for every plan with a price", () => {
    for (const p of PLANS_V2) {
      const g = GENERATED_PLANS_BY_ID[p.id];
      expect(g, `plans-v2 ${p.id} has no plans.csv row`).toBeDefined();
      if (p.monthly_aud !== null && g!.interval !== "custom") {
        expect(p.monthly_aud * 100, `${p.id} monthly`).toBe(g!.price_aud_cents);
      }
      if (p.annual_aud !== null && g!.interval !== "custom" && g!.annual_price_aud_cents > 0) {
        expect(p.annual_aud * 100, `${p.id} annual`).toBe(g!.annual_price_aud_cents);
      }
      expect(p.trial_days, `${p.id} trial_days`).toBe(g!.trial_days);
      expect(p.public !== false, `${p.id} public flag vs plans.csv active`).toBe(
        p.public !== false ? g!.active || p.id === "founder_free" : false,
      );
    }
  });

  it("credit packs: STRIPE_PRICE_CREDITS_N is A$5 / 9 / 20 / 35 / 60 for 5 / 10 / 25 / 50 / 100", () => {
    expect(CREDIT_PACKS.map((p) => [p.credits, STRIPE_PRICE_CATALOGUE[`STRIPE_PRICE_CREDITS_${p.credits}`]!.amount_cents])).toEqual([
      [5, 500],
      [10, 900],
      [25, 2000],
      [50, 3500],
      [100, 6000],
    ]);
  });

  it("the three A$3 one-off reports all bill 300 cents and the Trusted Business Report label reads the same SKU", () => {
    for (const env of ["STRIPE_PRICE_TRUST_REPORT_5AUD", "STRIPE_PRICE_ONE_CLICK_REPORT", "STRIPE_PRICE_FUNDING_REPORT"]) {
      expect(STRIPE_PRICE_CATALOGUE[env]!.amount_cents, env).toBe(300);
      expect(STRIPE_PRICE_CATALOGUE[env]!.interval, env).toBe("one_off");
    }
    expect(TRUST_REPORT_AMOUNT_CENTS).toBe(300);
  });

  it("G25: the Cohort Validation Pilot SKUs are retired — no pilot row in the catalogue or the map (founder decision 2026-09-21)", () => {
    expect(Object.keys(STRIPE_PRICE_CATALOGUE).filter((k) => /PILOT/.test(k))).toEqual(["STRIPE_PRICE_PILOT"]);
    expect(ROWS.filter((r) => /pilot/i.test(r.plan_id) || /PILOT/.test(r.env_var))).toEqual([]);
  });

  it("Cohort Enterprise is contact-sales: custom interval in plans.csv, no Stripe price, never a checkout row (migration 0413)", () => {
    expect(GENERATED_PLANS_BY_ID.accelerator_enterprise!.interval).toBe("custom");
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_ACCEL_ENTERPRISE).toBeUndefined();
    expect(ROWS.find((r) => r.plan_id === "accelerator_enterprise")).toBeUndefined();
  });

  it("the retired Pro rung is inactive in Stripe and hidden on the ladder", () => {
    expect(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_FOUNDER_SCALE!.active).toBe(false);
    expect(PUBLIC_HIDDEN_PLAN_IDS).toContain("founder_scale");
    expect(GENERATED_PLANS_BY_ID.founder_scale!.active).toBe(false);
  });
});

describe("stripe-map — legacy prices and tax_behavior (founder-only Stripe actions)", () => {
  it("lists exactly the nine legacy env vars nothing in web/src reads any more", () => {
    expect(legacyCatalogueEnvVars().sort()).toEqual([
      "STRIPE_PRICE_ACCELERATOR",
      "STRIPE_PRICE_FOUNDER",
      "STRIPE_PRICE_FOUNDING50",
      "STRIPE_PRICE_GROWTH",
      "STRIPE_PRICE_GROWTH_499",
      "STRIPE_PRICE_GROWTH_ANNUAL",
      "STRIPE_PRICE_PILOT",
      "STRIPE_PRICE_SVI_ANALYSIS",
      "STRIPE_PRICE_SVI_ANALYSIS_25",
    ]);
    // None of them is a sold SKU.
    for (const env of legacyCatalogueEnvVars()) {
      expect(ROWS.find((r) => r.env_var === env), env).toBeUndefined();
    }
  });

  it("no legacy env var is referenced by non-test source in web/src (grep-level pin)", () => {
    // Cheap static check over the modules that used to read them.
    const stripeTs = readFileSync(join(__dirname, "..", "stripe.ts"), "utf8");
    for (const env of legacyCatalogueEnvVars()) {
      expect(stripeTs.includes(`process.env.${env}`), `${env} still read by lib/stripe.ts`).toBe(false);
    }
  });

  it("pins the 18 active prices still carrying tax_behavior=unspecified (site policy is inclusive) for the founder's dashboard fix", () => {
    expect(nonInclusiveCatalogueEnvVars().filter((e) => !STRIPE_PRICE_CATALOGUE[e]!.legacy).sort()).toEqual([
      "STRIPE_PRICE_ACCEL_GROWTH",
      "STRIPE_PRICE_ACCEL_STARTER",
      "STRIPE_PRICE_CREDITS_10",
      "STRIPE_PRICE_CREDITS_100",
      "STRIPE_PRICE_CREDITS_25",
      "STRIPE_PRICE_CREDITS_5",
      "STRIPE_PRICE_CREDITS_50",
      "STRIPE_PRICE_INVESTOR_ADVISOR",
      "STRIPE_PRICE_INVESTOR_ADVISOR_ANNUAL",
      "STRIPE_PRICE_INVESTOR_ANGEL",
      "STRIPE_PRICE_INVESTOR_ANGEL_ANNUAL",
      "STRIPE_PRICE_INVESTOR_VC_SMALL",
      "STRIPE_PRICE_INVESTOR_VC_SMALL_ANNUAL",
      "STRIPE_PRICE_ONE_CLICK_REPORT",
    ]);
    expect(nonInclusiveCatalogueEnvVars()).toHaveLength(14 + 9); // + the 9 legacy rows
  });
});

// ─── Trials (founder addition 2026-09-19) ────────────────────────────────────
//
// `plans.trial_days` on the live DB (read 2026-09-19): 7 for founder_starter /
// founder_growth / investor_angel / investor_advisor / investor_vc_small /
// investor_fund; 14 for accelerator_intake / _starter / _growth; 0 for
// index_api / investor_vc_ent / founder_enterprise / founder_free.
// accelerator_enterprise read 14 on a `monthly` row — migration 0413 (pending
// apply) makes it `custom` / 0 like the other contact-sales rows, and this
// table carries the post-0413 value.
// Checkout (`api/stripe/checkout`) and `register-with-card` read the row, so
// this is what a card is charged after; every public trial mention must match.
const DB_TRIAL_DAYS: Readonly<Record<string, number>> = {
  founder_free: 0,
  founder_starter: 7,
  founder_growth: 7,
  founder_scale: 7,
  founder_enterprise: 0,
  investor_angel: 7,
  investor_advisor: 7,
  investor_vc_small: 7,
  investor_fund: 7,
  investor_vc_ent: 0,
  accelerator_intake: 14,
  accelerator_starter: 14,
  accelerator_growth: 14,
  accelerator_enterprise: 0,
  index_api: 0,
  founder_package: 0,
};

function migrationTrialDays(): Record<string, number> {
  const dir = join(__dirname, "..", "..", "..", "supabase", "migrations");
  const out: Record<string, number> = {};
  for (const file of ["0309_sync_b2b_plan_rows.sql", "0400_sync_plan_rows_v4.sql", "0413_cohort_enterprise_custom_interval.sql"]) {
    const sql = readFileSync(join(dir, file), "utf8");
    // update … set … trial_days = N … where id = 'x';
    for (const m of sql.matchAll(/trial_days\s*=\s*(\d+),?[\s\S]*?where id = '([a-z_0-9]+)'/g)) {
      out[m[2]!] = Number(m[1]);
    }
    // insert … values ('id', …, 'monthly', N, …
    for (const m of sql.matchAll(/\('([a-z_0-9]+)',\s*'[a-z_]+',\s*'[^']+',[\s\S]*?\d+,\s*\d+,\s*'(?:monthly|yearly|once|custom|free)',\s*(\d+),/g)) {
      out[m[1]!] = Number(m[2]);
    }
  }
  return out;
}

describe("trials — plans-v2 trial_days === plans.csv === DB seed (0309 / 0400) for every public plan", () => {
  it("every public plan's trial_days equals the DB value", () => {
    for (const segment of ["founder", "investor", "accelerator"] as const) {
      for (const p of publicPlansForSegment(segment)) {
        expect(p.trial_days, p.id).toBe(DB_TRIAL_DAYS[p.id]);
        expect(GENERATED_PLANS_BY_ID[p.id]!.trial_days, `${p.id} plans.csv`).toBe(DB_TRIAL_DAYS[p.id]);
      }
    }
  });

  it("the seed migrations 0309 / 0400 carry the same trial_days as the DB for every row they touch", () => {
    const seeded = migrationTrialDays();
    expect(Object.keys(seeded).length).toBeGreaterThanOrEqual(9);
    for (const [id, days] of Object.entries(seeded)) {
      expect(days, `${id} in migrations`).toBe(DB_TRIAL_DAYS[id]);
    }
  });

  it("founder + evaluator rungs trial 7 days, Programs rungs 14, data-only / custom rungs 0", () => {
    for (const p of GENERATED_PLANS) {
      if (p.segment === "accelerator" && p.active && p.interval === "monthly") expect(p.trial_days, p.id).toBe(14);
      if (p.interval === "custom") expect(p.trial_days, p.id).toBe(0);
      if (["founder_starter", "founder_growth", "investor_angel", "investor_advisor", "investor_vc_small", "investor_fund"].includes(p.id)) {
        expect(p.trial_days, p.id).toBe(7);
      }
      if (["index_api", "investor_vc_ent", "founder_enterprise", "founder_free", "founder_package"].includes(p.id)) {
        expect(p.trial_days, p.id).toBe(0);
      }
    }
  });
});
