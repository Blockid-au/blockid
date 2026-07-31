// Colocated vitest for the pricing A/B harness.
//
// `ab-pricing.ts` powers the Founding-100 price experiment: assignment via
// deterministic hash bucketing, exposure/checkout/paid event logging into
// `ab_pricing_events`, and the admin-dashboard aggregation. The callers that
// depend on this module (checkout button on /founding-50, Stripe webhook,
// /admin/pricing-test) rely on the following pinned contracts:
//
//   • FOUNDING_PRICE_EXPERIMENT.variants preserved in order — the weight
//     cumulative-sum in pickVariant is order-sensitive
//   • hash-based assignment sticky per identity — the same anon_id cookie
//     always resolves to the same variant across sessions
//   • getFoundingPriceVariant returns variants[0] when experiment inactive
//     (control fallback — never crashes the checkout page)
//   • logAbEvent is non-blocking — supabase absence or insert errors are
//     swallowed so a pricing-analytics wobble never breaks the paid flow
//   • buildExperimentReport aggregates by variant_id and ignores unknown
//     variants (so a legacy row in the DB after a variant rename is not
//     counted against a live cohort)
//   • report percentages rounded to 2dp, rps to 4dp, revenue to cents
//
// Uses vi.mock for next/headers + @/lib/supabase so the assignment + logging
// paths can be exercised without a live request scope or Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module state that mocks read from ─────────────────────────────────

interface InsertCapture {
  table: string;
  payload: Record<string, unknown>;
}

interface SelectCapture {
  table: string;
  cols: string;
  eqCalls: Array<{ col: string; val: unknown }>;
  gteCalls: Array<{ col: string; val: unknown }>;
  lteCalls: Array<{ col: string; val: unknown }>;
  limitValue: number | null;
}

interface FakeState {
  adminConfigured: boolean;
  cookieStoreThrows: boolean;
  cookieStore: Map<string, string>;
  insertShouldThrow: boolean;
  insertResult: { data: unknown; error: { message: string } | null };
  selectResult: { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
  selectShouldThrow: boolean;
  inserts: InsertCapture[];
  selects: SelectCapture[];
}

const state: FakeState = {
  adminConfigured: true,
  cookieStoreThrows: false,
  cookieStore: new Map(),
  insertShouldThrow: false,
  insertResult: { data: null, error: null },
  selectResult: { data: [], error: null },
  selectShouldThrow: false,
  inserts: [],
  selects: [],
};

function resetState() {
  state.adminConfigured = true;
  state.cookieStoreThrows = false;
  state.cookieStore = new Map();
  state.insertShouldThrow = false;
  state.insertResult = { data: null, error: null };
  state.selectResult = { data: [], error: null };
  state.selectShouldThrow = false;
  state.inserts = [];
  state.selects = [];
}

// ─── module mocks (must precede the import under test) ─────────────────

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (state.cookieStoreThrows) throw new Error("outside request scope");
    return {
      get(name: string) {
        const v = state.cookieStore.get(name);
        return v === undefined ? undefined : { name, value: v };
      },
    };
  },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? fakeAdmin() : null),
}));

function fakeAdmin() {
  return {
    from(table: string) {
      return {
        async insert(payload: Record<string, unknown>) {
          if (state.insertShouldThrow) throw new Error("insert boom");
          state.inserts.push({ table, payload });
          return state.insertResult;
        },
        select(cols: string) {
          const cap: SelectCapture = {
            table,
            cols,
            eqCalls: [],
            gteCalls: [],
            lteCalls: [],
            limitValue: null,
          };
          state.selects.push(cap);
          const chain = {
            eq(col: string, val: unknown) {
              cap.eqCalls.push({ col, val });
              return chain;
            },
            gte(col: string, val: unknown) {
              cap.gteCalls.push({ col, val });
              return chain;
            },
            lte(col: string, val: unknown) {
              cap.lteCalls.push({ col, val });
              return chain;
            },
            async limit(n: number) {
              cap.limitValue = n;
              if (state.selectShouldThrow) throw new Error("select boom");
              return state.selectResult;
            },
          };
          return chain;
        },
      };
    },
  };
}

// Import after all vi.mock hoists.
import {
  EXPERIMENTS,
  FOUNDING_PRICE_EXPERIMENT,
  buildExperimentReport,
  getFoundingPriceVariant,
  logAbEvent,
  type ExperimentId,
} from "./ab-pricing";

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── shape pins ────────────────────────────────────────────────────────

describe("EXPERIMENTS registry", () => {
  it("exposes exactly the founding_price_2026q3 experiment", () => {
    expect(Object.keys(EXPERIMENTS)).toEqual(["founding_price_2026q3"]);
    expect(EXPERIMENTS.founding_price_2026q3).toBe(FOUNDING_PRICE_EXPERIMENT);
  });
});

describe("FOUNDING_PRICE_EXPERIMENT shape", () => {
  it("pins id, surface, primaryMetric, and active flag", () => {
    expect(FOUNDING_PRICE_EXPERIMENT.id).toBe("founding_price_2026q3");
    expect(FOUNDING_PRICE_EXPERIMENT.surface).toBe("/founding-50");
    expect(FOUNDING_PRICE_EXPERIMENT.primaryMetric).toBe("paid");
    expect(FOUNDING_PRICE_EXPERIMENT.active).toBe(true);
  });

  it("ships exactly 4 variants in the order the cumulative weight sum depends on", () => {
    expect(FOUNDING_PRICE_EXPERIMENT.variants.map((v) => v.id)).toEqual([
      "a5",
      "a3",
      "a10",
      "a1",
    ]);
  });

  it("variant weights sum to 1 (full traffic covered)", () => {
    const sum = FOUNDING_PRICE_EXPERIMENT.variants.reduce((acc, v) => acc + v.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("priceCents matches priceAud label for every variant", () => {
    for (const v of FOUNDING_PRICE_EXPERIMENT.variants) {
      const dollars = v.priceCents / 100;
      expect(v.priceAud).toBe(`A$${dollars}`);
    }
  });

  it("every variant carries a non-empty label + description", () => {
    for (const v of FOUNDING_PRICE_EXPERIMENT.variants) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── getFoundingPriceVariant ───────────────────────────────────────────

describe("getFoundingPriceVariant", () => {
  it("returns a deterministic variant for the same identityOverride (sticky assignment)", async () => {
    const a = await getFoundingPriceVariant({ identityOverride: "founder@example.com" });
    const b = await getFoundingPriceVariant({ identityOverride: "founder@example.com" });
    expect(a.id).toBe(b.id);
  });

  it("returns one of the 4 defined variant ids", async () => {
    const result = await getFoundingPriceVariant({ identityOverride: "identity-1" });
    expect(["a5", "a3", "a10", "a1"]).toContain(result.id);
  });

  it("different identities can resolve to different variants (bucketing is not degenerate)", async () => {
    // The tiny djb-style hash used here is not strictly uniform, but across a
    // varied identity space it should route at least two distinct cohorts —
    // otherwise the whole A/B is running as a single-arm experiment.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const identity = `user-${i}@founder-${(i * 17) % 97}.example.com`;
      const v = await getFoundingPriceVariant({ identityOverride: identity });
      seen.add(v.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("assignment is idempotent across many repeated calls for the same identity", async () => {
    const identity = "founder-repeat@example.com";
    const first = await getFoundingPriceVariant({ identityOverride: identity });
    for (let i = 0; i < 25; i++) {
      const again = await getFoundingPriceVariant({ identityOverride: identity });
      expect(again.id).toBe(first.id);
    }
  });

  it("reads the blockid_anonid cookie when no identityOverride is supplied", async () => {
    state.cookieStore.set("blockid_anonid", "sticky-anon-1");
    const a = await getFoundingPriceVariant();
    const b = await getFoundingPriceVariant();
    expect(a.id).toBe(b.id);
    // Deterministic assignment across the same anon cookie identity.
    const direct = await getFoundingPriceVariant({ identityOverride: "sticky-anon-1" });
    expect(a.id).toBe(direct.id);
  });

  it("generates a fresh anon_-prefixed identity when the cookie is absent", async () => {
    // No cookie set — getOrSetAnonId produces `anon_<ts>_<rand>`. The picked
    // variant must still be one of the 4 configured ids (no crash on missing cookie).
    const v = await getFoundingPriceVariant();
    expect(["a5", "a3", "a10", "a1"]).toContain(v.id);
  });

  it("returns the control (variants[0] = a5) when the experiment is inactive", async () => {
    const original = FOUNDING_PRICE_EXPERIMENT.active;
    (FOUNDING_PRICE_EXPERIMENT as { active: boolean }).active = false;
    try {
      const v = await getFoundingPriceVariant({ identityOverride: "would-normally-pick-a10" });
      expect(v.id).toBe("a5");
    } finally {
      (FOUNDING_PRICE_EXPERIMENT as { active: boolean }).active = original;
    }
  });
});

// ─── logAbEvent ────────────────────────────────────────────────────────

describe("logAbEvent", () => {
  it("inserts a full row with snake_case columns matching the schema comment", async () => {
    await logAbEvent({
      experimentId: "founding_price_2026q3",
      variantId: "a5",
      eventType: "paid",
      identityHash: "hash-abc",
      amountCents: 500,
      stripeSessionId: "cs_test_123",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe("ab_pricing_events");
    expect(state.inserts[0].payload).toEqual({
      experiment_id: "founding_price_2026q3",
      variant_id: "a5",
      event_type: "paid",
      identity_hash: "hash-abc",
      amount_cents: 500,
      stripe_session_id: "cs_test_123",
    });
  });

  it("coerces omitted amountCents + stripeSessionId to null (never undefined jsonb)", async () => {
    await logAbEvent({
      experimentId: "founding_price_2026q3",
      variantId: "a10",
      eventType: "exposure",
      identityHash: "hash-def",
    });
    expect(state.inserts[0].payload.amount_cents).toBeNull();
    expect(state.inserts[0].payload.stripe_session_id).toBeNull();
  });

  it("is a silent no-op when getSupabaseAdmin returns null (dev env / missing service key)", async () => {
    state.adminConfigured = false;
    await expect(
      logAbEvent({
        experimentId: "founding_price_2026q3",
        variantId: "a5",
        eventType: "exposure",
        identityHash: "hash-x",
      }),
    ).resolves.toBeUndefined();
    expect(state.inserts).toHaveLength(0);
  });

  it("swallows insert errors (non-blocking — analytics must never break pricing flow)", async () => {
    state.insertShouldThrow = true;
    await expect(
      logAbEvent({
        experimentId: "founding_price_2026q3",
        variantId: "a5",
        eventType: "paid",
        identityHash: "hash-x",
        amountCents: 100,
      }),
    ).resolves.toBeUndefined();
  });

  it("supports every EventType (exposure / checkout_started / paid)", async () => {
    for (const eventType of ["exposure", "checkout_started", "paid"] as const) {
      await logAbEvent({
        experimentId: "founding_price_2026q3",
        variantId: "a5",
        eventType,
        identityHash: "h",
      });
    }
    expect(state.inserts.map((i) => i.payload.event_type)).toEqual([
      "exposure",
      "checkout_started",
      "paid",
    ]);
  });
});

// ─── buildExperimentReport ─────────────────────────────────────────────

describe("buildExperimentReport", () => {
  it("returns null for an unknown experimentId", async () => {
    const report = await buildExperimentReport("does_not_exist" as ExperimentId);
    expect(report).toBeNull();
  });

  it("returns an empty report shell when supabase is unavailable", async () => {
    state.adminConfigured = false;
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report).not.toBeNull();
    expect(report!.experimentId).toBe("founding_price_2026q3");
    expect(report!.totalExposures).toBe(0);
    expect(report!.totalPaid).toBe(0);
    expect(report!.totalRevenueAud).toBe(0);
    expect(report!.variants).toHaveLength(FOUNDING_PRICE_EXPERIMENT.variants.length);
    for (const v of report!.variants) {
      expect(v).toMatchObject({
        exposures: 0,
        checkoutStarted: 0,
        paid: 0,
        conversionPct: 0,
        startedPct: 0,
        revenueAud: 0,
        rps: 0,
      });
    }
  });

  it("wires the select chain with the experiment_id filter, ts window, and 50k row cap", async () => {
    await buildExperimentReport("founding_price_2026q3", 30);
    expect(state.selects).toHaveLength(1);
    const sel = state.selects[0];
    expect(sel.table).toBe("ab_pricing_events");
    expect(sel.cols).toBe("variant_id, event_type, amount_cents");
    expect(sel.eqCalls).toEqual([{ col: "experiment_id", val: "founding_price_2026q3" }]);
    expect(sel.gteCalls[0].col).toBe("ts");
    expect(sel.lteCalls[0].col).toBe("ts");
    expect(sel.limitValue).toBe(50_000);
  });

  it("uses the requested windowDays for the gte lower bound (approx to the minute)", async () => {
    const now = Date.now();
    await buildExperimentReport("founding_price_2026q3", 7);
    const sel = state.selects[0];
    const from = new Date(String(sel.gteCalls[0].val)).getTime();
    const to = new Date(String(sel.lteCalls[0].val)).getTime();
    const spanMs = to - from;
    expect(spanMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 60_000);
    expect(spanMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 60_000);
    // Upper bound is "now" — should be within a couple of seconds of the test clock.
    expect(Math.abs(to - now)).toBeLessThan(5_000);
  });

  it("aggregates exposures / checkoutStarted / paid + computes revenue/percentages/rps", async () => {
    state.selectResult = {
      data: [
        // a5: 4 exposures, 2 checkouts, 1 paid @ A$5
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "checkout_started", amount_cents: null },
        { variant_id: "a5", event_type: "checkout_started", amount_cents: null },
        { variant_id: "a5", event_type: "paid", amount_cents: 500 },
        // a10: 2 exposures, 1 checkout, 1 paid @ A$10
        { variant_id: "a10", event_type: "exposure", amount_cents: null },
        { variant_id: "a10", event_type: "exposure", amount_cents: null },
        { variant_id: "a10", event_type: "checkout_started", amount_cents: null },
        { variant_id: "a10", event_type: "paid", amount_cents: 1000 },
      ],
      error: null,
    };
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report).not.toBeNull();
    const a5 = report!.variants.find((v) => v.variantId === "a5")!;
    const a10 = report!.variants.find((v) => v.variantId === "a10")!;
    const a3 = report!.variants.find((v) => v.variantId === "a3")!;

    expect(a5.exposures).toBe(4);
    expect(a5.checkoutStarted).toBe(2);
    expect(a5.paid).toBe(1);
    expect(a5.revenueAud).toBe(5);
    expect(a5.conversionPct).toBe(25); // 1/4 = 25.00
    expect(a5.startedPct).toBe(50);    // 2/4 = 50.00
    expect(a5.rps).toBeCloseTo(1.25, 4); // 5 / 4

    expect(a10.exposures).toBe(2);
    expect(a10.paid).toBe(1);
    expect(a10.revenueAud).toBe(10);
    expect(a10.conversionPct).toBe(50);
    expect(a10.rps).toBeCloseTo(5, 4);

    // Untouched variants keep the zero shell.
    expect(a3.exposures).toBe(0);
    expect(a3.conversionPct).toBe(0);
    expect(a3.rps).toBe(0);

    expect(report!.totalExposures).toBe(6);
    expect(report!.totalPaid).toBe(2);
    expect(report!.totalRevenueAud).toBe(15);
  });

  it("ignores rows with an unknown variant_id (legacy row after rename does not corrupt live cohorts)", async () => {
    state.selectResult = {
      data: [
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "removed_legacy", event_type: "paid", amount_cents: 999_99 },
      ],
      error: null,
    };
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report!.totalExposures).toBe(1);
    expect(report!.totalPaid).toBe(0);
    expect(report!.totalRevenueAud).toBe(0);
  });

  it("treats amount_cents=null on a paid row as 0 revenue (defensive against malformed rows)", async () => {
    state.selectResult = {
      data: [
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "paid", amount_cents: null },
      ],
      error: null,
    };
    const report = await buildExperimentReport("founding_price_2026q3");
    const a5 = report!.variants.find((v) => v.variantId === "a5")!;
    expect(a5.paid).toBe(1);
    expect(a5.revenueAud).toBe(0);
    expect(report!.totalRevenueAud).toBe(0);
  });

  it("returns the empty shell when the select resolves with data=null", async () => {
    state.selectResult = { data: null, error: null };
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report!.totalExposures).toBe(0);
    expect(report!.variants.every((v) => v.exposures === 0)).toBe(true);
  });

  it("returns the empty shell when the select throws (never surfaces the DB error)", async () => {
    state.selectShouldThrow = true;
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report).not.toBeNull();
    expect(report!.totalExposures).toBe(0);
  });

  it("rounds revenueAud per variant to cents (avoids floating-point drift in the admin dashboard)", async () => {
    state.selectResult = {
      data: [
        { variant_id: "a5", event_type: "exposure", amount_cents: null },
        { variant_id: "a5", event_type: "paid", amount_cents: 33 },
        { variant_id: "a5", event_type: "paid", amount_cents: 33 },
        { variant_id: "a5", event_type: "paid", amount_cents: 33 },
      ],
      error: null,
    };
    const report = await buildExperimentReport("founding_price_2026q3");
    const a5 = report!.variants.find((v) => v.variantId === "a5")!;
    // 0.33 * 3 = 0.99 exactly after cents-rounding.
    expect(a5.revenueAud).toBe(0.99);
    expect(report!.totalRevenueAud).toBe(0.99);
  });

  it("preserves the variant order from FOUNDING_PRICE_EXPERIMENT.variants in the report", async () => {
    const report = await buildExperimentReport("founding_price_2026q3");
    expect(report!.variants.map((v) => v.variantId)).toEqual(
      FOUNDING_PRICE_EXPERIMENT.variants.map((v) => v.id),
    );
  });
});
