// Colocated vitest for POST /api/coupon/validate — P9-coupon-validate-route-test.
//
// This route is a revenue-impacting surface: every promo code entered on the
// pricing / checkout / founding-50 CTA hits it. It is intentionally
// unauthenticated so anonymous prospects can validate before signing up, which
// makes the shape of its four branches — `not found`, `inactive`, `expired`,
// `usage-limit` — the *only* thing standing between a valid promotion and a
// silent 100%-off discount slipping into the checkout metadata.
//
// A silent regression here would (a) misapply an expired coupon, (b) let a
// deactivated code through, (c) exceed `max_uses` when the caller passes
// `max_uses=null` semantics wrongly, or (d) skip the normalise-to-uppercase
// step so `blockid50` vs `BLOCKID50` return different results for the same
// physical coupon row. Each branch is pinned separately so a "refactor" can't
// merge two of them without a test failure.
//
// The test mocks `@/lib/supabase` with a tiny chainable `.from().select().eq().maybeSingle()`
// stub with per-call state so we can assert the exact eq(code, NORMALISED)
// argument the route sends (that's the case-insensitivity contract).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------

interface MaybeSingleResult {
  data: unknown;
  error: unknown;
}

const maybeSingleMock = vi.fn<() => Promise<MaybeSingleResult>>();
const eqMock = vi.fn<(column: string, value: unknown) => { maybeSingle: typeof maybeSingleMock }>(
  () => ({ maybeSingle: maybeSingleMock }),
);
const selectMock = vi.fn<(cols: string) => { eq: typeof eqMock }>(() => ({ eq: eqMock }));
const fromMock = vi.fn<(table: string) => { select: typeof selectMock }>(
  () => ({ select: selectMock }),
);

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const supabaseAdminMock = vi.fn<() => { from: typeof fromMock } | null>();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => supabaseAdminMock(),
}));

// Route import MUST come after the mock is registered.
import { POST, dynamic } from "./route";

// --- Helpers ---------------------------------------------------------------

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  const payload = opts?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/coupon/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// Silence expected console.error in the DB-error branch — inspect via spy.
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  supabaseAdminMock.mockReset().mockReturnValue({ from: fromMock });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Module invariants
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — module invariants", () => {
  it('exports dynamic = "force-dynamic" so coupon lookups are never statically cached', () => {
    // A cached response would serve a stale coupon across all callers — most
    // dangerous in the "reached usage limit" branch, where a cached ok:true
    // would let unlimited redemptions through after the DB cap tripped.
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — body parsing", () => {
  it("returns 400 on invalid JSON body — no supabase touched", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Invalid JSON body" });
    expect(supabaseAdminMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — code validation", () => {
  it("returns 400 when code is missing entirely", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Coupon code is required" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when code is the empty string", async () => {
    const res = await POST(req({ code: "" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Coupon code is required");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when code is whitespace-only", async () => {
    // Trim-then-check-length so "   " doesn't silently DB-lookup an empty code.
    const res = await POST(req({ code: "   \t\n" }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when code is not a string (number)", async () => {
    const res = await POST(req({ code: 12345 }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when code is null", async () => {
    const res = await POST(req({ code: null }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body itself is null (not an object)", async () => {
    // JSON.stringify(null) is "null" — the `(body as {code?}) ?? {}` fallback
    // is what protects the destructure. Pin it so future refactors don't drop it.
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supabase configuration gate
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — supabase gate", () => {
  it("returns 503 when supabase is not configured — no DB call attempted", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ code: "SAVE10" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Service unavailable" });
    expect(supabaseAdminMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Code normalisation — case-insensitive lookup
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — code normalisation", () => {
  it('uppercases and trims the code before hitting the DB — "save10" → "SAVE10"', async () => {
    // Physical coupons in the DB are stored uppercase; without this normalise
    // step a founder who types the lowercase form sees "not found" for a
    // perfectly valid code.
    await POST(req({ code: "save10" }));
    expect(fromMock).toHaveBeenCalledWith("coupons");
    expect(eqMock).toHaveBeenCalledWith("code", "SAVE10");
  });

  it('trims surrounding whitespace before uppercasing — "  Blockid50  " → "BLOCKID50"', async () => {
    await POST(req({ code: "  Blockid50  " }));
    expect(eqMock).toHaveBeenCalledWith("code", "BLOCKID50");
  });

  it("selects exactly the columns the branch matrix needs — no over-fetch, no drift", async () => {
    // A refactor that drops `active` or `valid_until` or `max_uses` from the
    // select silently bypasses the corresponding validation branch below.
    await POST(req({ code: "X" }));
    expect(selectMock).toHaveBeenCalledWith(
      "code, discount_pct, description, active, valid_until, max_uses, current_uses",
    );
  });
});

// ---------------------------------------------------------------------------
// DB error handling
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — DB error handling", () => {
  it("returns 500 when supabase surfaces an error on the SELECT", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "boom", code: "PGRST000" },
    });
    const res = await POST(req({ code: "SAVE10" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Database error" });
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// "Coupon not found"
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — coupon not found", () => {
  it("returns 200 ok:false when maybeSingle resolves data:null with no error", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(req({ code: "UNKNOWN" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Coupon not found" });
  });
});

// ---------------------------------------------------------------------------
// Deactivation branch
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — deactivation branch", () => {
  it("returns ok:false when coupon.active === false — takes precedence over expiry / usage checks", async () => {
    // The active branch fires before expiry so a coupon rescinded by admin is
    // rejected with the correct reason even if the DB row happens to have a
    // valid_until in the future and use count under the cap.
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "OLD",
        discount_pct: 50,
        description: "Legacy",
        active: false,
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
        max_uses: 100,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "OLD" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Coupon is no longer active" });
  });
});

// ---------------------------------------------------------------------------
// Expiry branch
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — expiry branch", () => {
  it("returns ok:false when valid_until is strictly in the past", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "PAST",
        discount_pct: 25,
        description: "Expired promo",
        active: true,
        valid_until: new Date(Date.now() - 60_000).toISOString(),
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "PAST" }));
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Coupon has expired" });
  });

  it("does NOT reject on expiry when valid_until is null (open-ended coupon)", async () => {
    // The `coupon.valid_until && …` guard means null skips the expiry check.
    // Pin it — a refactor to `new Date(coupon.valid_until ?? 0)` would treat
    // null as 1970-01-01 and reject every open-ended coupon in the DB.
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "OPEN",
        discount_pct: 10,
        description: null,
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "OPEN" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("does NOT reject on expiry when valid_until is exactly now-ish in the future", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "FUTURE",
        discount_pct: 15,
        description: "Live promo",
        active: true,
        valid_until: new Date(Date.now() + 3_600_000).toISOString(),
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "FUTURE" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Usage-limit branch
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — usage-limit branch", () => {
  it("returns ok:false when current_uses >= max_uses (equality trips the cap)", async () => {
    // >= not >: a coupon capped at 100 with 100 uses should be exhausted, not
    // one-past.
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "CAPPED",
        discount_pct: 20,
        description: "Full",
        active: true,
        valid_until: null,
        max_uses: 100,
        current_uses: 100,
      },
      error: null,
    });
    const res = await POST(req({ code: "CAPPED" }));
    const body = await json(res);
    expect(body).toEqual({
      ok: false,
      reason: "Coupon has reached its usage limit",
    });
  });

  it("returns ok:false when current_uses is strictly greater than max_uses", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "OVER",
        discount_pct: 20,
        description: null,
        active: true,
        valid_until: null,
        max_uses: 5,
        current_uses: 6,
      },
      error: null,
    });
    const res = await POST(req({ code: "OVER" }));
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("Coupon has reached its usage limit");
  });

  it("does NOT enforce a cap when max_uses is null — unlimited coupon", async () => {
    // The explicit `max_uses !== null` guard is what protects unlimited
    // coupons from the JS truthiness trap where `0 >= null` is true (Number
    // coerces null to 0).
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "UNLIMITED",
        discount_pct: 5,
        description: "Team promo",
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 999_999,
      },
      error: null,
    });
    const res = await POST(req({ code: "UNLIMITED" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("does NOT trip the cap when current_uses is strictly under max_uses", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "AVAILABLE",
        discount_pct: 30,
        description: "Available",
        active: true,
        valid_until: null,
        max_uses: 10,
        current_uses: 3,
      },
      error: null,
    });
    const res = await POST(req({ code: "AVAILABLE" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — happy path", () => {
  it("returns ok:true with discount_pct + description for a valid coupon", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "SAVE20",
        discount_pct: 20,
        description: "Twenty percent off",
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "SAVE20" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      discount_pct: 20,
      description: "Twenty percent off",
    });
  });

  it("returns description:null when the DB row has description === null (nullish coalesce)", async () => {
    // The `?? null` normalises `undefined` to `null` too — but crucially it
    // does NOT drop a legitimate empty-string description, so pin the null
    // branch here and the empty-string branch below.
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "NODESC",
        discount_pct: 10,
        description: null,
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "NODESC" }));
    const body = await json(res);
    expect(body).toEqual({ ok: true, discount_pct: 10, description: null });
  });

  it("preserves empty-string description verbatim (?? only replaces nullish)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "EMPTY",
        discount_pct: 5,
        description: "",
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "EMPTY" }));
    const body = await json(res);
    expect(body).toEqual({ ok: true, discount_pct: 5, description: "" });
  });

  it("normalises description from undefined to null (nullish coalesce)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "UND",
        discount_pct: 12,
        description: undefined,
        active: true,
        valid_until: null,
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const res = await POST(req({ code: "UND" }));
    const body = await json(res);
    expect(body.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch precedence — the four rejection reasons must NOT swap order
// ---------------------------------------------------------------------------

describe("POST /api/coupon/validate — branch precedence", () => {
  it("active=false takes precedence over expired valid_until", async () => {
    // Same coupon rescinded AND expired — the deactivation reason wins so ops
    // sees the "rescinded" signal, not the "expired" one.
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "BOTH",
        discount_pct: 20,
        description: null,
        active: false,
        valid_until: new Date(Date.now() - 60_000).toISOString(),
        max_uses: null,
        current_uses: 0,
      },
      error: null,
    });
    const body = await json(await POST(req({ code: "BOTH" })));
    expect(body.reason).toBe("Coupon is no longer active");
  });

  it("expired takes precedence over usage-limit exhaustion", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        code: "BOTH2",
        discount_pct: 20,
        description: null,
        active: true,
        valid_until: new Date(Date.now() - 60_000).toISOString(),
        max_uses: 5,
        current_uses: 5,
      },
      error: null,
    });
    const body = await json(await POST(req({ code: "BOTH2" })));
    expect(body.reason).toBe("Coupon has expired");
  });
});
