// Colocated vitest for POST + GET /api/fundraise — P9 batch
// (P9-fundraise-route-test).
//
// The route configures a fundraise round: auth → supabase-null-guard →
// JSON parse → field validation → ESIC marketing detection → ESIC gate →
// Div 83A gate → shareholder + ESOP fetch → calculateRound → insert.
// The GET side lists existing rounds for the caller. Every branch is
// asserted in isolation from the underlying modules so the auth-gate
// ordering, per-field 400 messages, 412 gate short-circuit, warn/
// marketing envelope, and per-tenant scoping stay regression-guarded.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 branch so a stranger can seed a
//     fundraise row against no account (or worse, against user_id=null).
//   - Dropping the getSupabaseAdmin() 503 guard so an env-degraded tick
//     500s instead of returning the graceful 503 the /workspace UI reads.
//   - Dropping the JSON try/catch so a body-less curl 500s instead of a
//     structured 400.
//   - Regressing any of the four required-field 400 messages — the
//     /workspace form keys off the exact strings for inline errors.
//   - Losing the s708(8) wholesale-only ESIC 412 (requireEligible=true)
//     — a wholesale round marketed with the Div 360 tax offset is the
//     highest-risk s1041H exposure BlockID.au can enable.
//   - Losing the ESIC marketing detection so a retail round pitching
//     "20% ESIC tax offset" ships without the wholesale-grade block.
//   - Losing the Div 83A wholesale block so an "eligible" ESOP claim
//     goes out with an unchecked grant on file.
//   - Dropping the try/catch around the gates so a compliance-service
//     outage 500s the fundraise creation flow (must degrade).
//   - Regressing the shareholder scope so the response leaks another
//     tenant's cap table into the dilution model.
//   - Dropping the "No shareholders → 400" guard so the calculator gets
//     a zero-share cap table and throws with a generic 400.
//   - Dropping the calculateRound try/catch so a domain error 500s
//     instead of returning err.message with 400 (the /workspace form
//     shows the caught message inline).
//   - Regressing the fundraise_rounds insert shape so the row lands
//     with the wrong instrument_type / status / dilution snapshot.
//   - Losing the {ok:true, esic_warn?, div83a_warn?, marketing_*}
//     envelope so the /workspace UI's compliance-callout column blanks
//     out.
//   - GET losing the .eq("account_id", user.id) so a stranger sees
//     every fundraise round on the platform, or losing the ordering so
//     the newest round no longer surfaces first.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getActiveProject: vi.fn(),
  calculateRound: vi.fn(),
  assertESIC: vi.fn(),
  assertDiv83A: vi.fn(),
  detectMarketing: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/projects", () => ({
  getActiveProject: (id: string) => mocks.getActiveProject(id),
}));
vi.mock("@/lib/fundraise", () => ({
  calculateRound: (r: unknown, c: unknown) => mocks.calculateRound(r, c),
}));
vi.mock("@/lib/compliance/esic-funding-gate", () => ({
  assertESICEligibleOrWarn: (s: unknown, i: unknown) => mocks.assertESIC(s, i),
}));
vi.mock("@/lib/compliance/div83a-funding-gate", () => ({
  assertDiv83AEligibleOrWarn: (s: unknown, i: unknown) => mocks.assertDiv83A(s, i),
}));
vi.mock("@/lib/compliance/esic-marketing-gate", () => ({
  detectEsicMarketing: (i: unknown) => mocks.detectMarketing(i),
}));

import { POST, GET } from "./route";
import { NextRequest } from "next/server";

const USER = { id: "user-1", email: "founder@example.com" };
const PROJECT = { id: "proj-1", name: "Acme" };

interface FakeTables {
  shareholders?: {
    data?: unknown[] | null;
    error?: { message: string } | null;
  };
  esopPool?: {
    data?: { total_pool_shares: number; allocated_shares: number } | null;
    error?: { message: string } | null;
  };
  fundraiseInsert?: {
    data?: unknown;
    error?: { message: string } | null;
  };
  fundraiseList?: {
    data?: unknown[] | null;
    error?: { message: string } | null;
  };
}

interface Calls {
  shareholderEqs: Array<[string, unknown]>;
  esopEqs: Array<[string, unknown]>;
  insertRows: Array<Record<string, unknown>>;
  listEqs: Array<[string, unknown]>;
  listOrders: Array<[string, { ascending: boolean }]>;
}

function makeSupabase(tables: FakeTables, calls: Calls) {
  return {
    from(name: string) {
      if (name === "shareholders") {
        const t = tables.shareholders ?? { data: [] };
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                calls.shareholderEqs.push([col, val]);
                return {
                  order(_c: string, _o: unknown) {
                    return Promise.resolve({
                      data: t.data ?? null,
                      error: t.error ?? null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (name === "esop_pool") {
        const t = tables.esopPool ?? { data: null };
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                calls.esopEqs.push([col, val]);
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: t.data ?? null,
                      error: t.error ?? null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (name === "fundraise_rounds") {
        return {
          insert(row: Record<string, unknown>) {
            calls.insertRows.push(row);
            const t = tables.fundraiseInsert ?? { data: { id: "r-1" } };
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: t.data ?? null,
                      error: t.error ?? null,
                    });
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(col: string, val: unknown) {
                calls.listEqs.push([col, val]);
                return {
                  order(c: string, o: { ascending: boolean }) {
                    calls.listOrders.push([c, o]);
                    const t = tables.fundraiseList ?? { data: [] };
                    return Promise.resolve({
                      data: t.data ?? null,
                      error: t.error ?? null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected from(${name})`);
    },
  };
}

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new NextRequest("http://localhost/api/fundraise", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body ?? {}),
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function goodBody(overrides: Record<string, unknown> = {}) {
  return {
    roundName: "Seed",
    targetAmount: 1_000_000,
    preMoneyValuation: 5_000_000,
    instrumentType: "priced",
    ...overrides,
  };
}

function calcResult(overrides: Record<string, unknown> = {}) {
  return {
    sharePrice: 5,
    newShares: 200_000,
    dilutionPct: 16.67,
    dilutionTable: [{ name: "Founder", pctBefore: 100, pctAfter: 83.33 }],
    newCapTable: [{ id: "s1", pct: 83.33 }],
    postMoneyValuation: 6_000_000,
    ...overrides,
  };
}

let calls: Calls;

beforeEach(() => {
  calls = {
    shareholderEqs: [],
    esopEqs: [],
    insertRows: [],
    listEqs: [],
    listOrders: [],
  };
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getSupabaseAdmin.mockReturnValue(
    makeSupabase(
      {
        shareholders: {
          data: [{ id: "s1", name: "Founder", role: "founder", shares_held: 1_000_000 }],
        },
        esopPool: { data: { total_pool_shares: 200_000, allocated_shares: 50_000 } },
        fundraiseInsert: { data: { id: "r-1", round_name: "Seed" } },
      },
      calls,
    ),
  );
  mocks.getActiveProject.mockResolvedValue(PROJECT);
  mocks.calculateRound.mockReturnValue(calcResult());
  mocks.assertESIC.mockResolvedValue({ ok: true, disclaimer: "esic-disc" });
  mocks.assertDiv83A.mockResolvedValue({ ok: true, disclaimer: "div-disc" });
  mocks.detectMarketing.mockReturnValue({
    marketed: false,
    signals: [],
    disclaimer: "marketing-disc",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/fundraise", () => {
  it("401 when no user (before any DB read, JSON parse, or gate call)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body.error).toBe("Authentication required");
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.assertESIC).not.toHaveBeenCalled();
    expect(mocks.calculateRound).not.toHaveBeenCalled();
  });

  it("503 when supabase admin is null (env-degraded)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(503);
    const body = await bodyOf(res);
    expect(body.error).toBe("Database not configured");
    expect(mocks.assertESIC).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body — never hits validation or gates", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toBe("Invalid JSON body");
    expect(mocks.assertESIC).not.toHaveBeenCalled();
    expect(mocks.calculateRound).not.toHaveBeenCalled();
  });

  it("400 when roundName is missing", async () => {
    const res = await POST(postReq({ ...goodBody(), roundName: undefined }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe("roundName is required");
  });

  it("400 when targetAmount is not a positive number", async () => {
    const res = await POST(postReq({ ...goodBody(), targetAmount: 0 }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe("targetAmount must be a positive number");
  });

  it("400 when preMoneyValuation is not a positive number", async () => {
    const res = await POST(postReq({ ...goodBody(), preMoneyValuation: -1 }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe("preMoneyValuation must be a positive number");
  });

  it("400 when instrumentType is not priced/safe/convertible_note", async () => {
    const res = await POST(postReq({ ...goodBody(), instrumentType: "grant" }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe(
      "instrumentType must be priced, safe, or convertible_note",
    );
  });

  it("412 when ESIC gate blocks a wholesale-only round (requireEligible propagated)", async () => {
    mocks.assertESIC.mockResolvedValue({
      ok: false,
      reason: "no_assessment_on_file",
      url_to_fix: "/compliance/esic",
      message: "no assessment",
      disclaimer: "esic-disc",
    });
    const res = await POST(postReq({ ...goodBody(), wholesaleOnly: true }));
    expect(res.status).toBe(412);
    const body = await bodyOf(res);
    expect(body.error).toBe("esic_gate_blocked");
    expect(body.reason).toBe("no_assessment_on_file");
    expect(body.url_to_fix).toBe("/compliance/esic");
    // requireEligible must be true when wholesaleOnly=true.
    const [, input] = mocks.assertESIC.mock.calls[0];
    expect((input as { requireEligible: boolean }).requireEligible).toBe(true);
    expect((input as { action: string }).action).toBe("fundraise_round_create");
    // Div83A + calculate + insert must not fire when ESIC blocks.
    expect(mocks.assertDiv83A).not.toHaveBeenCalled();
    expect(mocks.calculateRound).not.toHaveBeenCalled();
    expect(calls.insertRows).toHaveLength(0);
  });

  it("412 with marketing_signals when a retail round pitches the ESIC tax offset", async () => {
    mocks.detectMarketing.mockReturnValue({
      marketed: true,
      signals: ["pitch_description_mentions_offset"],
      disclaimer: "marketing-disc",
    });
    mocks.assertESIC.mockResolvedValue({
      ok: false,
      reason: "not_esic_eligible",
      url_to_fix: "/compliance/esic",
      message: "not eligible",
      disclaimer: "esic-disc",
    });
    const res = await POST(
      postReq({ ...goodBody(), pitchDescription: "20% offset" }),
    );
    expect(res.status).toBe(412);
    const body = await bodyOf(res);
    expect(body.error).toBe("esic_gate_blocked");
    expect(body.marketing_signals).toEqual(["pitch_description_mentions_offset"]);
    expect(body.marketing_disclaimer).toBe("marketing-disc");
    // Action tag flips to the *marketed* variant so analytics can slice.
    const [, input] = mocks.assertESIC.mock.calls[0];
    expect((input as { requireEligible: boolean }).requireEligible).toBe(true);
    expect((input as { action: string }).action).toBe(
      "fundraise_round_create_marketed_esic",
    );
  });

  it("412 when Div83A gate blocks a wholesale-only round", async () => {
    mocks.assertDiv83A.mockResolvedValue({
      ok: false,
      reason: "grants_ineligible",
      url_to_fix: "/workspace/esop/grants",
      message: "ineligible grants",
      disclaimer: "div-disc",
    });
    const res = await POST(postReq({ ...goodBody(), wholesaleOnly: true }));
    expect(res.status).toBe(412);
    const body = await bodyOf(res);
    expect(body.error).toBe("div83a_gate_blocked");
    expect(body.reason).toBe("grants_ineligible");
    expect(body.url_to_fix).toBe("/workspace/esop/grants");
    // ESIC ran first and passed; calc/insert must not run.
    expect(mocks.assertESIC).toHaveBeenCalledOnce();
    expect(mocks.calculateRound).not.toHaveBeenCalled();
    expect(calls.insertRows).toHaveLength(0);
  });

  it("gate exceptions are swallowed — the fundraise flow still proceeds to 200", async () => {
    // A compliance-service outage must never break the primary flow —
    // the try/catch in the route logs + continues. Prove it by making
    // the ESIC gate throw and asserting we still reach the 200 insert.
    mocks.assertESIC.mockRejectedValue(new Error("compliance down"));
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(200);
    expect(calls.insertRows).toHaveLength(1);
  });

  it("500 when shareholders fetch errors", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase(
        {
          shareholders: { data: null, error: { message: "boom" } },
        },
        calls,
      ),
    );
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("Failed to fetch cap table");
    expect(mocks.calculateRound).not.toHaveBeenCalled();
  });

  it("400 when there are no shareholders on file", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ shareholders: { data: [] } }, calls),
    );
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe(
      "No shareholders found. Set up a cap table first.",
    );
    expect(mocks.calculateRound).not.toHaveBeenCalled();
  });

  it("400 with caught error message when calculateRound throws", async () => {
    mocks.calculateRound.mockImplementation(() => {
      throw new Error("Cannot calculate round with zero existing shares");
    });
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe(
      "Cannot calculate round with zero existing shares",
    );
    expect(calls.insertRows).toHaveLength(0);
  });

  it("400 with generic string when calculateRound throws a non-Error", async () => {
    mocks.calculateRound.mockImplementation(() => {
      throw "boom";
    });
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toBe("Calculation failed");
  });

  it("500 when the fundraise_rounds insert errors", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase(
        {
          shareholders: {
            data: [{ id: "s1", name: "F", role: "founder", shares_held: 1_000_000 }],
          },
          fundraiseInsert: { data: null, error: { message: "constraint" } },
        },
        calls,
      ),
    );
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("Failed to save fundraise round");
  });

  it("200 happy path — scopes shareholders + ESOP by account_id, inserts full snapshot, echoes round + tables", async () => {
    const res = await POST(postReq(goodBody({ safeDiscount: 20, safeCap: 4_000_000 })));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.ok).toBe(true);
    expect(body.round).toEqual({ id: "r-1", round_name: "Seed" });
    expect(body.dilutionTable).toEqual([
      { name: "Founder", pctBefore: 100, pctAfter: 83.33 },
    ]);
    expect(body.newCapTable).toEqual([{ id: "s1", pct: 83.33 }]);

    // Shareholders + ESOP were scoped by account_id (the caller's user.id).
    expect(calls.shareholderEqs).toEqual([["account_id", USER.id]]);
    expect(calls.esopEqs).toEqual([["account_id", USER.id]]);

    // Insert row reflects the request + calculator output.
    expect(calls.insertRows).toHaveLength(1);
    expect(calls.insertRows[0]).toMatchObject({
      account_id: USER.id,
      round_name: "Seed",
      target_amount: 1_000_000,
      pre_money_valuation: 5_000_000,
      instrument_type: "priced",
      safe_discount: 20,
      safe_cap: 4_000_000,
      share_price: 5,
      new_shares: 200_000,
      dilution_pct: 16.67,
      status: "draft",
    });
  });

  it("200 attaches esic_warn / div83a_warn when gates return warnings (non-blocking)", async () => {
    mocks.assertESIC.mockResolvedValue({
      ok: true,
      warn: { reason: "assessment_stale", message: "stale", url_to_fix: "/compliance/esic" },
      disclaimer: "esic-disc",
    });
    mocks.assertDiv83A.mockResolvedValue({
      ok: true,
      warn: { reason: "check_stale", message: "stale check", url_to_fix: "/workspace/esop/grants" },
      disclaimer: "div-disc",
    });
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.esic_warn).toEqual({
      reason: "assessment_stale",
      message: "stale",
      url_to_fix: "/compliance/esic",
    });
    expect(body.div83a_warn).toEqual({
      reason: "check_stale",
      message: "stale check",
      url_to_fix: "/workspace/esop/grants",
    });
  });

  it("200 marketing envelope: signals + disclaimer echoed only when detector fires", async () => {
    mocks.detectMarketing.mockReturnValue({
      marketed: true,
      signals: ["explicit_marketed_flag"],
      disclaimer: "marketing-disc",
    });
    const res = await POST(postReq({ ...goodBody(), marketedAsEsic: true }));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.marketing_signals).toEqual(["explicit_marketed_flag"]);
    expect(body.marketing_disclaimer).toBe("marketing-disc");
    // ESIC gate flipped to requireEligible=true because marketing fired
    // (even though wholesaleOnly wasn't set).
    const [, input] = mocks.assertESIC.mock.calls[0];
    expect((input as { requireEligible: boolean }).requireEligible).toBe(true);
  });

  it("200 without marketing keys when detector reports non-marketed", async () => {
    const res = await POST(postReq(goodBody()));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.marketing_signals).toBeUndefined();
    expect(body.marketing_disclaimer).toBeUndefined();
    // requireEligible stays false for a standard retail round.
    const [, input] = mocks.assertESIC.mock.calls[0];
    expect((input as { requireEligible: boolean }).requireEligible).toBe(false);
    expect((input as { action: string }).action).toBe("fundraise_round_create");
  });
});

describe("GET /api/fundraise", () => {
  it("401 when no user (before any DB read)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).error).toBe("Authentication required");
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("503 when supabase admin is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).error).toBe("Database not configured");
  });

  it("500 when the list query errors", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase(
        { fundraiseList: { data: null, error: { message: "boom" } } },
        calls,
      ),
    );
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("Failed to fetch fundraise rounds");
  });

  it("200 returns [] when supabase yields null (no rounds on file)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ fundraiseList: { data: null, error: null } }, calls),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.ok).toBe(true);
    expect(body.rounds).toEqual([]);
  });

  it("200 with rounds, scoped by account_id and ordered newest-first", async () => {
    const rows = [{ id: "r-2" }, { id: "r-1" }];
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ fundraiseList: { data: rows } }, calls),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.rounds).toEqual(rows);
    // Multi-tenant scoping + newest-first ordering are the two silent
    // regressions this assertion pins.
    expect(calls.listEqs).toEqual([["account_id", USER.id]]);
    expect(calls.listOrders).toEqual([["created_at", { ascending: false }]]);
  });
});
