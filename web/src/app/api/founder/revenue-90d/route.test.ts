// Unit tests for GET /api/founder/revenue-90d — Phase 3.1 revenue tracker.
//
// Guards against silent regressions in the 90-day founder revenue aggregator:
//   - 401 gate: never leak Stripe totals to an anonymous caller.
//   - 200 happy path: Stripe charges + GA4 rows fold into the documented
//     envelope with correct AUD math and window bookkeeping.
//   - 200 empty defaults: a founder with no `stripe_customer_id` (i.e. never
//     connected Stripe) must still get a shape-compatible response — the tile
//     renders the "Connect Stripe" empty state on `stripe.connected === false`
//     rather than a 500 that would blow up the dashboard.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

const supabaseSingleMock = vi.fn<
  () => Promise<{ data: { stripe_customer_id: string | null } | null }>
>();
const getSupabaseAdminMock = vi.fn<() => unknown>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const isStripeConfiguredMock = vi.fn<() => boolean>();
const chargesListMock = vi.fn();
const getStripeMock = vi.fn<() => unknown>();
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => isStripeConfiguredMock(),
  getStripe: () => getStripeMock(),
}));

const isGa4ConfiguredMock = vi.fn<() => boolean>();
const runReportMock = vi.fn();
vi.mock("@/lib/ga4/data-api-client", () => ({
  isGa4Configured: () => isGa4ConfiguredMock(),
  runReport: (req: unknown) => runReportMock(req),
}));

import { GET, dynamic } from "./route";

// Build a supabase.from().select().eq().maybeSingle() chain that resolves to
// whatever supabaseSingleMock returns.
function buildSupabaseChain(): unknown {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => supabaseSingleMock(),
        }),
      }),
    }),
  };
}

const NOW_SEC = Math.floor(Date.now() / 1000);
const DAY_SEC = 86_400;

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  supabaseSingleMock.mockReset();
  getSupabaseAdminMock.mockReset();
  isStripeConfiguredMock.mockReset();
  chargesListMock.mockReset();
  getStripeMock.mockReset();
  isGa4ConfiguredMock.mockReset();
  runReportMock.mockReset();

  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  getProjectIdFromRequestMock.mockResolvedValue("proj-1");
  getSupabaseAdminMock.mockReturnValue(buildSupabaseChain());
  supabaseSingleMock.mockResolvedValue({
    data: { stripe_customer_id: "cus_123" },
  });
  isStripeConfiguredMock.mockReturnValue(true);
  getStripeMock.mockReturnValue({
    charges: { list: (args: unknown) => chargesListMock(args) },
  });
  chargesListMock.mockResolvedValue({
    data: [
      {
        status: "succeeded",
        amount_captured: 10_000, // A$100.00
        amount_refunded: 0,
        created: NOW_SEC - 5 * DAY_SEC,
        customer: "cus_a",
      },
      {
        status: "succeeded",
        amount_captured: 25_000, // A$250.00
        amount_refunded: 5_000, // A$50 refund → net A$200
        created: NOW_SEC - 10 * DAY_SEC,
        customer: "cus_b",
      },
      {
        status: "failed", // must be excluded
        amount_captured: 99_999,
        amount_refunded: 0,
        created: NOW_SEC - 3 * DAY_SEC,
        customer: "cus_c",
      },
      {
        status: "succeeded",
        amount_captured: 40_000, // A$400 — prior 90d window
        amount_refunded: 0,
        created: NOW_SEC - 120 * DAY_SEC,
        customer: "cus_d",
      },
    ],
  });
  isGa4ConfiguredMock.mockReturnValue(true);
  runReportMock.mockImplementation(async (req: { dimensions?: Array<{ name: string }> }) => {
    if (!req.dimensions) {
      // Totals call
      return {
        rows: [
          {
            metricValues: [{ value: "45000" }, { value: "78" }],
          },
        ],
      };
    }
    // by-source call
    return {
      rows: [
        {
          dimensionValues: [{ value: "google" }, { value: "organic" }],
          metricValues: [{ value: "22000" }],
        },
        {
          dimensionValues: [{ value: "(direct)" }, { value: "(none)" }],
          metricValues: [{ value: "10000" }],
        },
      ],
    };
  });
});

describe("/api/founder/revenue-90d — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user reads never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — auth gate", () => {
  it("returns 401 with { ok:false, error } when the caller is anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Authentication required",
    });
  });

  it("does NOT touch Stripe or GA4 on the anonymous path (no data leak)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(chargesListMock).not.toHaveBeenCalled();
    expect(runReportMock).not.toHaveBeenCalled();
  });
});

describe("GET — happy path (Stripe + GA4 configured)", () => {
  it("returns 200 with the documented envelope", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.startup_id).toBe("proj-1");
    expect(body.window_days).toBe(90);
    expect(body.stripe.connected).toBe(true);
    expect(body.ga4.connected).toBe(true);
  });

  it("sums succeeded charges net-of-refunds and excludes failed charges", async () => {
    // A$100 + A$200 (250 − 50 refund) = A$300 in window; failed excluded; prior excluded.
    const body = await (await GET()).json();
    expect(body.stripe.total_aud).toBe(300);
    expect(body.stripe.prior_total_aud).toBe(400);
  });

  it("counts distinct customers in-window (not prior, not failed)", async () => {
    const body = await (await GET()).json();
    expect(body.stripe.new_customers).toBe(2); // cus_a + cus_b
    expect(body.stripe.arpu_aud).toBe(150); // 300 / 2
  });

  it("returns a 90-entry by_day series sorted ascending", async () => {
    const body = await (await GET()).json();
    expect(body.stripe.by_day).toHaveLength(90);
    const dates: string[] = body.stripe.by_day.map((r: { date: string }) => r.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("computes trend_pct from prior window (300 vs 400 = -25%)", async () => {
    const body = await (await GET()).json();
    expect(body.combined.trend_pct).toBe(-25);
  });

  it("folds GA4 totals + by_source into the response", async () => {
    const body = await (await GET()).json();
    expect(body.ga4.sessions).toBe(45000);
    expect(body.ga4.conversions).toBe(78);
    expect(body.ga4.conversion_rate).toBeCloseTo(78 / 45000, 6);
    expect(body.ga4.by_source[0]).toEqual({
      source: "google/organic",
      sessions: 22000,
    });
  });

  it("computes revenue_per_session_aud = total / sessions", async () => {
    const body = await (await GET()).json();
    // 300 / 45000 = 0.00666... → rounded to 3dp = 0.007
    expect(body.combined.revenue_per_session_aud).toBeCloseTo(0.007, 3);
  });
});

describe("GET — empty defaults (never 500)", () => {
  it("returns 200 with stripe.connected=false when user has no stripe_customer_id", async () => {
    supabaseSingleMock.mockResolvedValue({ data: { stripe_customer_id: null } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripe.connected).toBe(false);
    expect(body.stripe.total_aud).toBe(0);
    expect(body.stripe.by_day).toHaveLength(90);
    expect(body.stripe.new_customers).toBe(0);
    expect(chargesListMock).not.toHaveBeenCalled();
  });

  it("returns 200 with stripe.connected=false when Stripe env is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stripe.connected).toBe(false);
    expect(chargesListMock).not.toHaveBeenCalled();
  });

  it("returns 200 with ga4.connected=false when GA4 env is not configured", async () => {
    isGa4ConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ga4.connected).toBe(false);
    expect(body.ga4.sessions).toBe(0);
    expect(runReportMock).not.toHaveBeenCalled();
  });

  it("degrades to empty Stripe block (connected=true) when charges.list throws", async () => {
    chargesListMock.mockRejectedValue(new Error("stripe boom"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stripe.connected).toBe(true);
    expect(body.stripe.total_aud).toBe(0);
    expect(body.stripe.by_day).toHaveLength(90);
  });

  it("degrades to empty GA4 block when runReport throws", async () => {
    runReportMock.mockRejectedValue(new Error("ga4 boom"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ga4.sessions).toBe(0);
    expect(body.ga4.by_source).toEqual([]);
  });

  it("returns trend_pct = null when both windows are zero", async () => {
    chargesListMock.mockResolvedValue({ data: [] });
    const body = await (await GET()).json();
    expect(body.combined.trend_pct).toBeNull();
    expect(body.stripe.total_aud).toBe(0);
  });

  it("returns startup_id = null when no active project is selected", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.startup_id).toBeNull();
    expect(body.ok).toBe(true);
  });
});
