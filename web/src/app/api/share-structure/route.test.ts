// Colocated vitest for GET+POST /api/share-structure — P9 batch 5.
//
// Founder-facing share-structure config endpoint. Reads / upserts one row per
// account in the `share_structure` table, and mixes SVI-driven price
// computation into the response. Covers:
//
//   - GET 401 unauth
//   - GET 503 db not configured
//   - GET returns default config + computed:null when no row exists
//   - GET returns stored config + computed:null when row exists without lastSviScore
//   - GET returns stored config + computed price when lastSviScore present
//   - GET numeric coercion of authorized_shares / share_price_aud / valuation_aud strings
//   - POST 401 unauth
//   - POST 503 db not configured
//   - POST 400 bad JSON
//   - POST mode defaulting: unknown mode → fixed_shares
//   - POST mode passthrough: dynamic_shares honoured
//   - POST authorizedShares defaults to 10_000_000 when missing/zero
//   - POST computes sharePriceAud + valuationAud when sviScore is provided
//   - POST leaves sharePriceAud/valuationAud null when sviScore is falsy
//   - POST upsert payload shape (account_id, mode, authorized_shares, etc.)
//   - POST upsert onConflict uses account_id
//   - POST 500 on upsert error (and error is logged)
//   - POST happy path returns { ok, config, computed }
//   - POST computed:null when sviScore missing even on happy path

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  computeSharePriceFromSVI: vi.fn(),
  getDefaultShareStructure: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/share-structure", () => ({
  computeSharePriceFromSVI: (svi: number, cfg: unknown) =>
    mocks.computeSharePriceFromSVI(svi, cfg),
  getDefaultShareStructure: () => mocks.getDefaultShareStructure(),
}));

import { GET, POST } from "./route";

const USER = { id: "user-123", email: "founder@test.au", plan: "free" };
const DEFAULT_CONFIG = {
  mode: "fixed_shares" as const,
  authorizedShares: 10_000_000,
  sharePriceAud: null,
  valuationAud: null,
  lastSviScore: null,
  autoRecompute: true,
};

type SelectResult = { data: Record<string, unknown> | null };
type UpsertResult = { data: Record<string, unknown> | null; error: { message: string } | null };

function makeSb(opts?: {
  selectResult?: SelectResult;
  upsertResult?: UpsertResult;
  captureUpsert?: (payload: unknown, options: unknown) => void;
}) {
  const selectResult: SelectResult = opts?.selectResult ?? { data: null };
  const upsertResult: UpsertResult = opts?.upsertResult ?? {
    data: { id: "row-1", account_id: USER.id, mode: "fixed_shares" },
    error: null,
  };

  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
      upsert: (payload: unknown, options: unknown) => {
        opts?.captureUpsert?.(payload, options);
        return {
          select: () => ({
            single: vi.fn().mockResolvedValue(upsertResult),
          }),
        };
      },
    })),
  };
}

function postReq(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/share-structure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.getDefaultShareStructure.mockReturnValue(DEFAULT_CONFIG);
  mocks.computeSharePriceFromSVI.mockReturnValue({
    pricePerShare: 1.234,
    totalShares: 10_000_000,
    valuationAud: 12_340_000,
    mode: "fixed_shares",
    priceChangeFromLast: null,
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/share-structure", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("Authentication required");
  });

  it("returns 503 when supabase admin missing", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns default config + computed:null when no row exists", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.config).toEqual(DEFAULT_CONFIG);
    expect(body.computed).toBeNull();
    expect(mocks.getDefaultShareStructure).toHaveBeenCalledTimes(1);
  });

  it("returns stored config + computed:null when lastSviScore is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({
        selectResult: {
          data: {
            mode: "dynamic_shares",
            authorized_shares: 5_000_000,
            share_price_aud: 0.5,
            valuation_aud: 2_500_000,
            last_svi_score: null,
            auto_recompute: false,
          },
        },
      }),
    );
    const res = await GET();
    const body = await json(res);
    const config = body.config as Record<string, unknown>;
    expect(config.mode).toBe("dynamic_shares");
    expect(config.authorizedShares).toBe(5_000_000);
    expect(config.sharePriceAud).toBe(0.5);
    expect(config.valuationAud).toBe(2_500_000);
    expect(config.lastSviScore).toBeNull();
    expect(config.autoRecompute).toBe(false);
    expect(body.computed).toBeNull();
    expect(mocks.computeSharePriceFromSVI).not.toHaveBeenCalled();
  });

  it("returns stored config + computed value when lastSviScore present", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({
        selectResult: {
          data: {
            mode: "fixed_shares",
            authorized_shares: 10_000_000,
            share_price_aud: 1.0,
            valuation_aud: 10_000_000,
            last_svi_score: 72,
            auto_recompute: true,
          },
        },
      }),
    );
    const res = await GET();
    const body = await json(res);
    expect(body.computed).toBeDefined();
    expect(mocks.computeSharePriceFromSVI).toHaveBeenCalledTimes(1);
    expect(mocks.computeSharePriceFromSVI).toHaveBeenCalledWith(
      72,
      expect.objectContaining({ mode: "fixed_shares", lastSviScore: 72 }),
    );
  });

  it("coerces stringy numeric columns from the DB into numbers", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({
        selectResult: {
          data: {
            mode: "fixed_shares",
            authorized_shares: "7500000",
            share_price_aud: "2.5",
            valuation_aud: "18750000",
            last_svi_score: 60,
            auto_recompute: true,
          },
        },
      }),
    );
    const res = await GET();
    const config = (await json(res)).config as Record<string, unknown>;
    expect(config.authorizedShares).toBe(7_500_000);
    expect(config.sharePriceAud).toBe(2.5);
    expect(config.valuationAud).toBe(18_750_000);
  });

  it("keeps sharePriceAud + valuationAud null when the DB stores nullish falsy values", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({
        selectResult: {
          data: {
            mode: "fixed_shares",
            authorized_shares: 10_000_000,
            share_price_aud: null,
            valuation_aud: null,
            last_svi_score: null,
            auto_recompute: true,
          },
        },
      }),
    );
    const config = ((await json(await GET())).config) as Record<string, unknown>;
    expect(config.sharePriceAud).toBeNull();
    expect(config.valuationAud).toBeNull();
  });
});

describe("POST /api/share-structure", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ mode: "fixed_shares" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when supabase admin missing", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ mode: "fixed_shares" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Invalid JSON");
  });

  it("defaults unknown mode to fixed_shares", async () => {
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    const res = await POST(postReq({ mode: "not_a_real_mode", authorizedShares: 5_000_000 }));
    expect(res.status).toBe(200);
    expect((captured as Record<string, unknown>).mode).toBe("fixed_shares");
  });

  it("honours dynamic_shares mode when explicitly requested", async () => {
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    await POST(postReq({ mode: "dynamic_shares", authorizedShares: 2_000_000 }));
    expect((captured as Record<string, unknown>).mode).toBe("dynamic_shares");
  });

  it("defaults authorizedShares to 10_000_000 when missing", async () => {
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    await POST(postReq({ mode: "fixed_shares" }));
    expect((captured as Record<string, unknown>).authorized_shares).toBe(10_000_000);
  });

  it("defaults authorizedShares to 10_000_000 when zero", async () => {
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    await POST(postReq({ mode: "fixed_shares", authorizedShares: 0 }));
    expect((captured as Record<string, unknown>).authorized_shares).toBe(10_000_000);
  });

  it("computes sharePrice + valuation when sviScore is supplied", async () => {
    mocks.computeSharePriceFromSVI.mockReturnValue({
      pricePerShare: 3.5,
      totalShares: 10_000_000,
      valuationAud: 35_000_000,
      mode: "fixed_shares",
      priceChangeFromLast: null,
    });
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    const res = await POST(postReq({ mode: "fixed_shares", sviScore: 80 }));
    expect(res.status).toBe(200);
    const payload = captured as Record<string, unknown>;
    expect(payload.share_price_aud).toBe(3.5);
    expect(payload.valuation_aud).toBe(35_000_000);
    expect(payload.last_svi_score).toBe(80);
    // Called twice: once to enrich the config, once to build the response `computed`.
    expect(mocks.computeSharePriceFromSVI).toHaveBeenCalledTimes(2);
  });

  it("leaves sharePriceAud/valuationAud null when sviScore is 0 (falsy)", async () => {
    let captured: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload; } }),
    );
    const res = await POST(postReq({ mode: "fixed_shares", sviScore: 0 }));
    const body = await json(res);
    const payload = captured as Record<string, unknown>;
    expect(payload.share_price_aud).toBeNull();
    expect(payload.valuation_aud).toBeNull();
    expect(payload.last_svi_score).toBeNull();
    expect(body.computed).toBeNull();
    expect(mocks.computeSharePriceFromSVI).not.toHaveBeenCalled();
  });

  it("upsert payload includes account_id, timestamps, and auto_recompute defaults", async () => {
    let captured: Record<string, unknown> | null = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (payload) => { captured = payload as Record<string, unknown>; } }),
    );
    await POST(postReq({ mode: "fixed_shares", authorizedShares: 12_345_678 }));
    expect(captured).toMatchObject({
      account_id: USER.id,
      mode: "fixed_shares",
      authorized_shares: 12_345_678,
      auto_recompute: true,
    });
    expect(typeof (captured as unknown as Record<string, unknown>).updated_at).toBe("string");
  });

  it("upsert uses onConflict=account_id (natural key)", async () => {
    let capturedOptions: unknown = null;
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ captureUpsert: (_p, options) => { capturedOptions = options; } }),
    );
    await POST(postReq({ mode: "fixed_shares" }));
    expect(capturedOptions).toEqual({ onConflict: "account_id" });
  });

  it("returns 500 when the upsert fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ upsertResult: { data: null, error: { message: "db down" } } }),
    );
    const res = await POST(postReq({ mode: "fixed_shares" }));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("Failed to save");
    expect(errSpy).toHaveBeenCalledWith(
      "[share-structure] upsert error",
      expect.objectContaining({ message: "db down" }),
    );
    errSpy.mockRestore();
  });

  it("happy path returns { ok:true, config, computed } with sviScore", async () => {
    const res = await POST(postReq({ mode: "fixed_shares", authorizedShares: 10_000_000, sviScore: 65 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.computed).toBeDefined();
  });

  it("happy path returns computed:null when sviScore omitted", async () => {
    const res = await POST(postReq({ mode: "fixed_shares" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.computed).toBeNull();
  });
});
