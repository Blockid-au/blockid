// G18-A — scripts/stripe-price-audit.mjs: the weekly Stripe ↔ catalogue diff.
// Pins the pure diff (amount / currency / interval / active / tax_behavior),
// the dry-run contract (no Stripe factory touched, every set var reported as
// "set"), the live path with a fake Stripe (match / drift / lookup_failed
// with the price id redacted) and the exit contract (ok only when nothing
// drifts and every non-legacy var resolves).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { diffPrice, runAudit, stripeInterval } from "./stripe-price-audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = JSON.parse(
  readFileSync(join(HERE, "..", "src", "config", "pricing", "stripe-price-catalogue.json"), "utf8"),
);

const monthly = { unit_amount: 6900, currency: "aud", active: true, type: "recurring", recurring: { interval: "month" }, tax_behavior: "inclusive" };

describe("stripeInterval", () => {
  it("maps one_time → one_off, month/year recurring → month/year", () => {
    expect(stripeInterval({ type: "one_time" })).toBe("one_off");
    expect(stripeInterval(monthly)).toBe("month");
    expect(stripeInterval({ type: "recurring", recurring: { interval: "year" } })).toBe("year");
    expect(stripeInterval({ type: "recurring", recurring: { interval: "week" } })).toBe("recurring/week");
  });
});

describe("diffPrice", () => {
  const expected = CATALOGUE.prices.STRIPE_PRICE_FOUNDER_GROWTH;

  it("returns no problems for a matching Growth price", () => {
    expect(diffPrice(expected, monthly)).toEqual([]);
  });

  it("flags amount, currency, interval, active and tax_behavior independently", () => {
    expect(diffPrice(expected, { ...monthly, unit_amount: 9900 })).toEqual(["amount 9900 ≠ 6900"]);
    expect(diffPrice(expected, { ...monthly, currency: "usd" })).toEqual(["currency usd"]);
    expect(diffPrice(expected, { ...monthly, recurring: { interval: "year" } })).toEqual(["interval year ≠ month"]);
    expect(diffPrice(expected, { ...monthly, active: false })).toEqual(["active false ≠ true"]);
    expect(diffPrice(expected, { ...monthly, tax_behavior: "unspecified" })).toEqual(["tax_behavior unspecified ≠ inclusive"]);
  });

  it("treats a missing tax_behavior as unspecified (what the unspecified catalogue rows expect)", () => {
    const scout = CATALOGUE.prices.STRIPE_PRICE_INVESTOR_ANGEL;
    const price = { unit_amount: 7900, currency: "aud", active: true, type: "recurring", recurring: { interval: "month" } };
    expect(diffPrice(scout, price)).toEqual([]);
  });

  it("the retired Pro price must be INACTIVE in Stripe — an active one is drift", () => {
    const pro = CATALOGUE.prices.STRIPE_PRICE_FOUNDER_SCALE;
    expect(diffPrice(pro, { ...monthly, unit_amount: 29900, active: true })).toEqual(["active true ≠ false"]);
    expect(diffPrice(pro, { ...monthly, unit_amount: 29900, active: false })).toEqual([]);
  });
});

describe("runAudit — dry run", () => {
  it("never constructs Stripe and reports set / unset / unset_legacy per var", async () => {
    const factory = vi.fn();
    const resolveEnv = (k) => (k === "STRIPE_PRICE_FOUNDER_GROWTH" ? "price_x" : "");
    const res = await runAudit({ dryRun: true, resolveEnv, stripeFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    expect(res.dry_run).toBe(true);
    expect(res.counts.set).toBe(1);
    expect(res.counts.unset_legacy).toBe(9);
    expect(res.counts.unset).toBe(Object.keys(CATALOGUE.prices).length - 1 - 9);
    // Dry run is informational: never fails on unset vars.
    expect(res.rows.find((r) => r.env_var === "STRIPE_PRICE_FOUNDER_GROWTH").status).toBe("set");
    expect(res.rows.find((r) => r.env_var === "STRIPE_PRICE_FOUNDING50").status).toBe("unset_legacy");
    // No price id or key ever appears in the output.
    expect(JSON.stringify(res)).not.toContain("price_x");
  });
});

describe("runAudit — live path with a fake Stripe", () => {
  function fakeStripe(prices) {
    return () => ({
      prices: {
        retrieve: async (id) => {
          const p = prices[id];
          if (p instanceof Error) throw p;
          if (!p) throw new Error(`No such price: ${id}`);
          return p;
        },
      },
    });
  }

  function envFor(map) {
    return (k) => (k === "STRIPE_SECRET_KEY" ? "sk_test_fake" : (map[k] ?? ""));
  }

  it("fails when STRIPE_SECRET_KEY cannot be resolved", async () => {
    const res = await runAudit({ dryRun: false, resolveEnv: () => "", stripeFactory: fakeStripe({}) });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/STRIPE_SECRET_KEY/);
  });

  it("ok when every non-legacy var resolves and matches; legacy vars may stay unset", async () => {
    const env = {};
    const prices = {};
    for (const [k, v] of Object.entries(CATALOGUE.prices)) {
      if (v.legacy) continue;
      env[k] = `price_${k.toLowerCase()}`;
      prices[env[k]] = {
        unit_amount: v.amount_cents,
        currency: "aud",
        active: v.active,
        type: v.interval === "one_off" ? "one_time" : "recurring",
        recurring: v.interval === "one_off" ? null : { interval: v.interval },
        tax_behavior: v.tax_behavior,
      };
    }
    const res = await runAudit({ dryRun: false, resolveEnv: envFor(env), stripeFactory: fakeStripe(prices) });
    expect(res.ok).toBe(true);
    expect(res.counts.drift).toBe(0);
    expect(res.counts.unset).toBe(0);
    expect(res.counts.unset_legacy).toBe(9);
    expect(res.counts.match).toBe(Object.keys(env).length);
  });

  it("reports drift with the reason, and a lookup failure with the price id redacted", async () => {
    const env = { STRIPE_PRICE_FOUNDER_GROWTH: "price_growth_live", STRIPE_PRICE_CREDITS_5: "price_missing_abc" };
    const prices = { price_growth_live: { ...monthly, unit_amount: 9900 } };
    const res = await runAudit({ dryRun: false, resolveEnv: envFor(env), stripeFactory: fakeStripe(prices) });
    expect(res.ok).toBe(false);
    const growth = res.rows.find((r) => r.env_var === "STRIPE_PRICE_FOUNDER_GROWTH");
    expect(growth.status).toBe("drift");
    expect(growth.problems).toEqual(["amount 9900 ≠ 6900"]);
    const c5 = res.rows.find((r) => r.env_var === "STRIPE_PRICE_CREDITS_5");
    expect(c5.status).toBe("lookup_failed");
    expect(c5.problems[0]).not.toContain("price_missing_abc");
    expect(c5.problems[0]).toContain("price_…");
    // Every other non-legacy var is unset → counted, and fails the run too.
    expect(res.counts.unset).toBeGreaterThan(0);
    expect(res.drift.map((r) => r.env_var).sort()).toEqual(["STRIPE_PRICE_CREDITS_5", "STRIPE_PRICE_FOUNDER_GROWTH"]);
  });
});
