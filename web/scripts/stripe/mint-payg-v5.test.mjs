// G35 P1 — scripts/stripe/mint-payg-v5.mjs against a mocked, stateful Stripe
// client. Pins: flag/key safety (test key only sk_test_, live needs
// --confirm-live + sk_live_), dry run makes no API call, fresh mint creates
// exactly six Product + Price pairs with the right params, a re-run is
// idempotent, drift / ambiguity is reported and never mutated, the legacy
// archive is live-only, archives (never deletes) and refuses non-A$3 Prices,
// the SKU table equals src/lib/pricing/v5-payg.ts, and no secret is printed.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { PAYG_SKU_LIST } from "@/lib/pricing/v5-payg";
import {
  LEGACY_ARCHIVE_ENV_VARS,
  V5_MINT_SKUS,
  loadEnv,
  parseArgs,
  planSku,
  resolveSecretKey,
  run,
} from "./mint-payg-v5.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEST_KEY = "sk_test_FAKEtestKEY123";
const LIVE_KEY = "sk_live_FAKEliveKEY456";

/** Stateful fake Stripe: products/prices persist across calls; every call recorded. */
function fakeStripe({ products = [], prices = [], pageSize = 100 } = {}) {
  const state = { products: [...products], prices: [...prices], calls: [] };
  let seq = 0;
  const page = (items, params) => {
    let start = 0;
    if (params?.starting_after) start = items.findIndex((x) => x.id === params.starting_after) + 1;
    const limit = Math.min(params?.limit ?? 100, pageSize);
    const data = items.slice(start, start + limit);
    return { data, has_more: start + limit < items.length };
  };
  const stripe = {
    products: {
      list: vi.fn(async (params) => {
        state.calls.push(["products.list", params]);
        return page(state.products, params);
      }),
      create: vi.fn(async (params, opts) => {
        state.calls.push(["products.create", params, opts]);
        const p = { id: `prod_${++seq}`, active: true, ...params };
        state.products.push(p);
        return p;
      }),
      search: vi.fn(async () => {
        throw new Error("search must not be used (eventually consistent)");
      }),
      del: vi.fn(async () => {
        throw new Error("delete is forbidden");
      }),
    },
    prices: {
      list: vi.fn(async (params) => {
        state.calls.push(["prices.list", params]);
        return page(state.prices.filter((p) => !params?.product || p.product === params.product), params);
      }),
      create: vi.fn(async (params, opts) => {
        state.calls.push(["prices.create", params, opts]);
        const p = { id: `price_${++seq}`, active: true, type: "one_time", recurring: null, ...params };
        state.prices.push(p);
        return p;
      }),
      retrieve: vi.fn(async (id) => {
        state.calls.push(["prices.retrieve", id]);
        const p = state.prices.find((x) => x.id === id);
        if (!p) throw new Error(`No such price: '${id}'`);
        return p;
      }),
      update: vi.fn(async (id, params) => {
        state.calls.push(["prices.update", id, params]);
        const p = state.prices.find((x) => x.id === id);
        Object.assign(p, params);
        return p;
      }),
      del: vi.fn(async () => {
        throw new Error("delete is forbidden");
      }),
    },
  };
  return { stripe, state };
}

async function runWith({ argv = [], env = {}, stripe = null }) {
  const lines = [];
  const factory = vi.fn(() => stripe);
  const code = await run({ argv, env, stripeFactory: factory, log: (s) => lines.push(s) });
  return { code, out: lines.join("\n"), factory };
}

const mutating = (state) => state.calls.filter(([n]) => /create|update|del/.test(n));

describe("catalogue parity — the script's SKU table equals src/lib/pricing/v5-payg.ts", () => {
  it("same ids, amounts, env vars and product names, in the same order", () => {
    expect(V5_MINT_SKUS.map((s) => [s.sku, s.amountCents, s.envVar, s.productName])).toEqual(
      PAYG_SKU_LIST.map((s) => [s.id, s.amountCents, s.envVar, s.productName]),
    );
  });

  it("scripts/sync-stripe-pricing.mjs audits the same six rows at the same cents and never mints them", () => {
    const src = readFileSync(join(HERE, "..", "sync-stripe-pricing.mjs"), "utf8");
    for (const s of PAYG_SKU_LIST) {
      const m = new RegExp(`planId:\\s*"${s.id}"[^\\n]*?configCents:\\s*(\\d+)[^\\n]*?envVar:\\s*"([A-Z_]+)"[^\\n]*?mintVia:\\s*"mint-payg-v5"`).exec(src);
      expect(m, s.id).not.toBeNull();
      expect(Number(m[1]), s.id).toBe(s.amountCents);
      expect(m[2], s.id).toBe(s.envVar);
    }
  });
});

describe("parseArgs", () => {
  it("defaults to test mode, no dry run, no archive", () => {
    expect(parseArgs([])).toMatchObject({ mode: "test", confirmLive: false, dryRun: false, archiveLegacy: false, error: null });
  });

  it("live mode requires --confirm-live (both spellings of --mode)", () => {
    expect(parseArgs(["--mode", "live"]).error).toMatch(/--confirm-live/);
    expect(parseArgs(["--mode=live"]).error).toMatch(/--confirm-live/);
    expect(parseArgs(["--mode", "live", "--confirm-live"]).error).toBeNull();
  });

  it("--archive-legacy is live-only; --confirm-live without live is rejected; unknown flags and modes are rejected", () => {
    expect(parseArgs(["--archive-legacy"]).error).toMatch(/live-only/);
    expect(parseArgs(["--confirm-live"]).error).toMatch(/--mode live/);
    expect(parseArgs(["--mode", "prod"]).error).toMatch(/test" or "live/);
    expect(parseArgs(["--force"]).error).toMatch(/Unknown argument/);
    expect(parseArgs(["--mode", "live", "--confirm-live", "--archive-legacy", "--dry-run"]).error).toBeNull();
  });
});

describe("resolveSecretKey", () => {
  it("test mode reads STRIPE_TEST_SECRET_KEY only and requires sk_test_", () => {
    expect(resolveSecretKey({ mode: "test", env: { STRIPE_TEST_SECRET_KEY: TEST_KEY } })).toEqual({ ok: true, key: TEST_KEY });
    expect(resolveSecretKey({ mode: "test", env: {} }).ok).toBe(false);
    expect(resolveSecretKey({ mode: "test", env: { STRIPE_TEST_SECRET_KEY: LIVE_KEY } }).error).toMatch(/sk_test_/);
    expect(resolveSecretKey({ mode: "test", env: { STRIPE_TEST_SECRET_KEY: "rk_test_x" } }).ok).toBe(false);
    // Never falls back to the (live) STRIPE_SECRET_KEY.
    expect(resolveSecretKey({ mode: "test", env: { STRIPE_SECRET_KEY: TEST_KEY } }).ok).toBe(false);
  });

  it("live mode reads STRIPE_SECRET_KEY and requires sk_live_", () => {
    expect(resolveSecretKey({ mode: "live", env: { STRIPE_SECRET_KEY: LIVE_KEY } })).toEqual({ ok: true, key: LIVE_KEY });
    expect(resolveSecretKey({ mode: "live", env: { STRIPE_SECRET_KEY: TEST_KEY } }).ok).toBe(false);
    expect(resolveSecretKey({ mode: "live", env: { STRIPE_TEST_SECRET_KEY: LIVE_KEY } }).ok).toBe(false);
  });
});

describe("loadEnv", () => {
  it("process env wins over web/.env.runtime over web/.env; missing files are fine", () => {
    const env = loadEnv({ webDir: join(HERE, "__no_such_dir__"), processEnv: { A: "1", EMPTY: "" } });
    expect(env).toEqual({ A: "1" });
  });
});

describe("run — refusals", () => {
  it("test mode refuses when only the live key exists (the server today) and never builds a client", async () => {
    const { code, out, factory } = await runWith({ env: { STRIPE_SECRET_KEY: LIVE_KEY } });
    expect(code).toBe(2);
    expect(out).toMatch(/STRIPE_TEST_SECRET_KEY/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("test mode refuses a live key placed in STRIPE_TEST_SECRET_KEY", async () => {
    const { code, factory } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: LIVE_KEY } });
    expect(code).toBe(2);
    expect(factory).not.toHaveBeenCalled();
  });

  it("live mode without --confirm-live exits 2 before reading any key", async () => {
    const { code, factory } = await runWith({ argv: ["--mode", "live"], env: { STRIPE_SECRET_KEY: LIVE_KEY } });
    expect(code).toBe(2);
    expect(factory).not.toHaveBeenCalled();
  });

  it("live mode with a test key in STRIPE_SECRET_KEY is refused", async () => {
    const { code, factory } = await runWith({ argv: ["--mode", "live", "--confirm-live"], env: { STRIPE_SECRET_KEY: TEST_KEY } });
    expect(code).toBe(2);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("run — dry run", () => {
  it("prints the six-SKU plan with no key and no Stripe client", async () => {
    const { code, out, factory } = await runWith({ argv: ["--dry-run"] });
    expect(code).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    for (const s of V5_MINT_SKUS) {
      expect(out).toContain(s.sku);
      expect(out).toContain(`${s.amountCents}¢`);
      expect(out).toContain(s.envVar);
    }
    expect(out).toMatch(/nothing was sent to Stripe/);
  });

  it("live dry run with --archive-legacy only describes the archive", async () => {
    const { code, out, factory } = await runWith({ argv: ["--mode", "live", "--confirm-live", "--archive-legacy", "--dry-run"] });
    expect(code).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    for (const v of LEGACY_ARCHIVE_ENV_VARS) expect(out).toContain(v);
    expect(out).toMatch(/LIVE MODE/);
  });
});

describe("run — minting (test mode, mocked Stripe)", () => {
  it("fresh account: creates six Products (metadata.sku) + six one-time AUD inclusive Prices, prints ENV lines, never prints the key", async () => {
    const { stripe, state } = fakeStripe();
    const { code, out, factory } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(code).toBe(0);
    expect(factory).toHaveBeenCalledWith(TEST_KEY);
    expect(stripe.products.create).toHaveBeenCalledTimes(6);
    expect(stripe.prices.create).toHaveBeenCalledTimes(6);
    for (const s of V5_MINT_SKUS) {
      const prod = state.products.find((p) => p.metadata.sku === s.sku);
      expect(prod, s.sku).toMatchObject({ name: s.productName, metadata: { sku: s.sku, pricing_version: "v5" } });
      const price = state.prices.find((p) => p.product === prod.id);
      expect(price, s.sku).toMatchObject({
        currency: "aud",
        unit_amount: s.amountCents,
        tax_behavior: "inclusive",
        metadata: { sku: s.sku, pricing_version: "v5" },
      });
      expect(price.recurring ?? null).toBeNull();
      expect(out).toContain(`${s.envVar}=${price.id}`);
    }
    // Every create carries an idempotency key.
    for (const [name, , opts] of state.calls.filter(([n]) => n.endsWith(".create"))) {
      expect(opts?.idempotencyKey, name).toMatch(/^blockid-mint-payg-v5:test:/);
    }
    expect(stripe.products.search).not.toHaveBeenCalled();
    expect(out).not.toContain(TEST_KEY);
  });

  it("is idempotent: a second run reuses every Product + Price and creates nothing", async () => {
    const { stripe } = fakeStripe();
    await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    stripe.products.create.mockClear();
    stripe.prices.create.mockClear();
    const second = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(second.code).toBe(0);
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(second.out.match(/^STRIPE_PRICE_[A-Z_]+=price_\d+$/gm)).toHaveLength(6);
  });

  it("finds Products across list pages (pagination) without duplicating", async () => {
    const filler = Array.from({ length: 5 }, (_, i) => ({ id: `prod_other_${i}`, active: true, metadata: {} }));
    const existing = { id: "prod_full", active: true, metadata: { sku: "report_full" } };
    const { stripe } = fakeStripe({
      products: [...filler, existing],
      prices: [{ id: "price_full_ok", product: "prod_full", active: true, type: "one_time", recurring: null, currency: "aud", unit_amount: 4900, tax_behavior: "inclusive" }],
      pageSize: 2,
    });
    const { code, out } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(code).toBe(0);
    expect(out).toContain("STRIPE_PRICE_REPORT_FULL=price_full_ok");
    expect(stripe.products.create).toHaveBeenCalledTimes(5);
    expect(stripe.prices.create).toHaveBeenCalledTimes(5);
  });

  it("an existing Product with no active Price gets only a new Price (archived Prices are ignored, never reactivated)", async () => {
    const { stripe } = fakeStripe({
      products: [{ id: "prod_snap", active: true, metadata: { sku: "report_snapshot" } }],
      prices: [{ id: "price_old", product: "prod_snap", active: false, type: "one_time", currency: "aud", unit_amount: 1900, tax_behavior: "inclusive" }],
    });
    const { code } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(code).toBe(0);
    const snapPriceCreates = stripe.prices.create.mock.calls.filter(([p]) => p.product === "prod_snap");
    expect(snapPriceCreates).toHaveLength(1);
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("drift: an active Price at a different amount / tax_behavior is reported, never mutated, and nothing new is minted for that SKU", async () => {
    const { stripe, state } = fakeStripe({
      products: [{ id: "prod_ver", active: true, metadata: { sku: "report_verified" } }],
      prices: [{ id: "price_ver_bad", product: "prod_ver", active: true, type: "one_time", recurring: null, currency: "aud", unit_amount: 9900, tax_behavior: "exclusive" }],
    });
    const { code, out } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(code).toBe(1);
    expect(out).toMatch(/report_verified\s+drift/);
    expect(out).toContain("9900¢");
    expect(out).not.toContain("STRIPE_PRICE_REPORT_VERIFIED=");
    expect(stripe.prices.create.mock.calls.filter(([p]) => p.product === "prod_ver")).toEqual([]);
    expect(state.prices.find((p) => p.id === "price_ver_bad")).toMatchObject({ unit_amount: 9900, active: true });
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });

  it("blocked: two Products with the same metadata.sku, or an archived Product, are reported and left alone", async () => {
    const { stripe } = fakeStripe({
      products: [
        { id: "prod_a", active: true, metadata: { sku: "report_full" } },
        { id: "prod_b", active: true, metadata: { sku: "report_full" } },
        { id: "prod_fund", active: false, metadata: { sku: "report_funding" } },
      ],
    });
    const { code, out } = await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY }, stripe });
    expect(code).toBe(1);
    expect(out).toMatch(/report_full\s+blocked/);
    expect(out).toMatch(/report_funding\s+blocked/);
    expect(stripe.prices.create.mock.calls.filter(([p]) => ["prod_a", "prod_b", "prod_fund"].includes(p.product))).toEqual([]);
    expect(stripe.products.create.mock.calls.map(([p]) => p.metadata.sku)).not.toContain("report_full");
  });

  it("never deletes and never archives anything in test mode", async () => {
    const { stripe, state } = fakeStripe();
    await runWith({ env: { STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_PRICE_TRUST_REPORT_5AUD: "price_legacy" }, stripe });
    expect(stripe.products.del).not.toHaveBeenCalled();
    expect(stripe.prices.del).not.toHaveBeenCalled();
    expect(stripe.prices.update).not.toHaveBeenCalled();
    expect(mutating(state).every(([n]) => n.endsWith(".create"))).toBe(true);
  });
});

describe("planSku (pure)", () => {
  const spec = V5_MINT_SKUS[1];
  it("matches only an active one-time AUD inclusive Price at the exact amount", () => {
    const ok = { id: "p1", active: true, type: "one_time", recurring: null, currency: "aud", unit_amount: 4900, tax_behavior: "inclusive" };
    expect(planSku(spec, [{ id: "prod", active: true }], [ok])).toMatchObject({ action: "exists", priceId: "p1" });
    expect(planSku(spec, [{ id: "prod", active: true }], [{ ...ok, type: "recurring", recurring: { interval: "month" } }]).action).toBe("drift");
    expect(planSku(spec, [{ id: "prod", active: true }], [{ ...ok, currency: "usd" }]).action).toBe("drift");
    expect(planSku(spec, [{ id: "prod", active: true }], [{ ...ok, tax_behavior: "unspecified" }]).action).toBe("drift");
    expect(planSku(spec, [], []).action).toBe("create_product_and_price");
    expect(planSku(spec, [{ id: "prod", active: true }], []).action).toBe("create_price");
  });
});

describe("run — live --archive-legacy (mocked Stripe)", () => {
  const LIVE_ARGV = ["--mode", "live", "--confirm-live", "--archive-legacy"];

  function liveAccount(extraPrices = []) {
    const products = V5_MINT_SKUS.map((s) => ({ id: `prod_${s.sku}`, active: true, metadata: { sku: s.sku, pricing_version: "v5" } }));
    const prices = V5_MINT_SKUS.map((s) => ({ id: `price_${s.sku}`, product: `prod_${s.sku}`, active: true, type: "one_time", recurring: null, currency: "aud", unit_amount: s.amountCents, tax_behavior: "inclusive" }));
    return fakeStripe({ products, prices: [...prices, ...extraPrices] });
  }

  const legacy = (id, over = {}) => ({ id, product: "prod_legacy", active: true, type: "one_time", recurring: null, currency: "aud", unit_amount: 300, tax_behavior: "inclusive", ...over });

  it("archives (active:false) the three A$3 Prices named by env — never deletes — once every v5 Price exists", async () => {
    const { stripe, state } = liveAccount([legacy("price_tbr"), legacy("price_oneclick"), legacy("price_money")]);
    const env = {
      STRIPE_SECRET_KEY: LIVE_KEY,
      STRIPE_PRICE_TRUST_REPORT_5AUD: "price_tbr",
      STRIPE_PRICE_ONE_CLICK_REPORT: "price_oneclick",
      STRIPE_PRICE_FUNDING_REPORT: "price_money",
    };
    const { code, out, factory } = await runWith({ argv: LIVE_ARGV, env, stripe });
    expect(code).toBe(0);
    expect(factory).toHaveBeenCalledWith(LIVE_KEY);
    expect(stripe.prices.update.mock.calls).toEqual([
      ["price_tbr", { active: false }],
      ["price_oneclick", { active: false }],
      ["price_money", { active: false }],
    ]);
    expect(stripe.prices.del).not.toHaveBeenCalled();
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(state.prices.filter((p) => p.unit_amount === 300).every((p) => p.active === false)).toBe(true);
    expect(out).not.toContain(LIVE_KEY);
  });

  it("refuses to archive a Price that is not the A$3 one-off, skips unset env vars and already-archived Prices", async () => {
    const { stripe } = liveAccount([legacy("price_tbr", { unit_amount: 4900 }), legacy("price_money", { active: false })]);
    const env = { STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_PRICE_TRUST_REPORT_5AUD: "price_tbr", STRIPE_PRICE_FUNDING_REPORT: "price_money" };
    const { code, out } = await runWith({ argv: LIVE_ARGV, env, stripe });
    expect(code).toBe(1);
    expect(stripe.prices.update).not.toHaveBeenCalled();
    expect(out).toMatch(/STRIPE_PRICE_TRUST_REPORT_5AUD refused/);
    expect(out).toMatch(/STRIPE_PRICE_ONE_CLICK_REPORT skipped/);
    expect(out).toMatch(/STRIPE_PRICE_FUNDING_REPORT already_archived/);
  });

  it("does not archive anything while a v5 SKU is in drift", async () => {
    const { stripe, state } = liveAccount([legacy("price_tbr")]);
    state.prices.find((p) => p.id === "price_report_full").unit_amount = 5900;
    const { code, out } = await runWith({ argv: LIVE_ARGV, env: { STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_PRICE_TRUST_REPORT_5AUD: "price_tbr" }, stripe });
    expect(code).toBe(1);
    expect(out).toMatch(/--archive-legacy skipped/);
    expect(stripe.prices.update).not.toHaveBeenCalled();
  });
});
