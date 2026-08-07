// Unit tests for /api/secondary-offer — P9-secondary-offer-route-test.
//
// Founder-facing endpoint that declares intent to list a secondary parcel.
// Gated: SVI ≥ 80 AND governance-score ≥ 60 on the latest SVI analysis.
// Status starts as 'draft'; admin promotes to 'live'. Path A of T_0011:
// sophisticated-investor-only (eligible_investor_type = "sophisticated").
//
// Silent regressions this pins against:
//   - dropping the auth gate on POST or GET (both leak/allow mutation);
//   - loosening the ticker regex (^[A-Z]{1,8}-[A-Z0-9]{1,8}$) — a laxer regex
//     would allow injection / cross-tenant listing on invalid symbols;
//   - forgetting to uppercase+trim the ticker (case-sensitive mismatch with
//     the existing-offer duplicate check would let a founder list the same
//     symbol twice in mixed case);
//   - dropping either eligibility gate (svi >= 80, governance >= 60) —
//     these are the ONLY SVI Exchange guardrails on secondary listings;
//   - flipping the eligible_investor_type off "sophisticated" on insert
//     (would breach T_0011 s708(8)/(11) exemption boundary);
//   - dropping .in("status", ["draft","live"]) on the existing-offer check
//     (would resurrect a cancelled/expired offer instead of creating a new
//     draft — silent data-lineage break);
//   - dropping .eq("account_id", me.id) on either the existing-offer check
//     or the GET listing (the ONLY tenancy boundary — founders would see
//     or overwrite each other's drafts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, POST, dynamic } from "./route";

type Response = { data: unknown; error: { message: string } | null };

interface FakeState {
  fromCalls: string[];
  selectCalls: string[];
  eqCalls: Array<{ col: string; val: unknown }>;
  inCalls: Array<{ col: string; vals: unknown[] }>;
  orderCalls: Array<{ col: string; opts: unknown }>;
  limitCalls: number[];
  updatePayload: Record<string, unknown> | null;
  insertPayload: Record<string, unknown> | null;
  updateEqAfter: Array<{ col: string; val: unknown }>; // eq calls after update()
  responses: Response[]; // FIFO for terminal calls
  afterInsertSelect: boolean;
  afterUpdate: boolean;
}

const state: FakeState = freshState();

function freshState(): FakeState {
  return {
    fromCalls: [],
    selectCalls: [],
    eqCalls: [],
    inCalls: [],
    orderCalls: [],
    limitCalls: [],
    updatePayload: null,
    insertPayload: null,
    updateEqAfter: [],
    responses: [],
    afterInsertSelect: false,
    afterUpdate: false,
  };
}

function resetState() {
  Object.assign(state, freshState());
}

function nextResponse(): Response {
  const r = state.responses.shift();
  return r ?? { data: null, error: null };
}

function makeFakeSupabase() {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select(cols: string) {
      state.selectCalls.push(cols);
      return chain;
    },
    eq(col: string, val: unknown) {
      state.eqCalls.push({ col, val });
      if (state.afterUpdate) state.updateEqAfter.push({ col, val });
      return chain;
    },
    in(col: string, vals: unknown[]) {
      state.inCalls.push({ col, vals });
      return chain;
    },
    order(col: string, opts: unknown) {
      state.orderCalls.push({ col, opts });
      return chain;
    },
    limit(n: number) {
      state.limitCalls.push(n);
      return chain;
    },
    update(payload: Record<string, unknown>) {
      state.updatePayload = payload;
      state.afterUpdate = true;
      return chain;
    },
    insert(payload: Record<string, unknown>) {
      state.insertPayload = payload;
      return chain;
    },
    maybeSingle() {
      return Promise.resolve(nextResponse());
    },
    single() {
      return Promise.resolve(nextResponse());
    },
    then(resolve: (v: Response) => unknown) {
      return Promise.resolve(nextResponse()).then(resolve);
    },
  });
  return {
    from(table: string) {
      state.fromCalls.push(table);
      state.afterUpdate = false;
      return chain;
    },
  };
}

function jsonReq(body: unknown): NextRequest {
  return new Request("http://x/api/secondary-offer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

function rawReq(bodyText: string): NextRequest {
  return new Request("http://x/api/secondary-offer", {
    method: "POST",
    body: bodyText,
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

const OK_BODY = {
  ticker: "BLK-ABC",
  slug: "blockid-au",
  shares_for_sale: 1000,
  price_band_low_aud: 1.0,
  price_band_high_aud: 2.0,
  lock_up_months: 12,
  buyer_profile: "sophisticated-investor",
  notes: "test notes",
};

function queueSviAnalysis(svi: number, governance: number, slug = "blockid-au") {
  state.responses.push({
    data: {
      total_svi: svi,
      analysis_json: { governance_score: governance },
      slug,
    },
    error: null,
  });
}

function queueExistingOffer(row: { id: string; status: string } | null) {
  state.responses.push({ data: row, error: null });
}

function queueMutationResult(res: Response) {
  state.responses.push(res);
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "founder-1", email: "f@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("/api/secondary-offer — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so writes and reads are never cached / prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/secondary-offer — auth + config gates", () => {
  it("returns 401 { ok: false, error: 'Sign in required' } when anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Sign in required" });
  });

  it("does NOT touch supabase on the anonymous branch (short-circuits before getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq(OK_BODY));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toEqual([]);
  });

  it("returns 500 { ok: false, error: 'DB unavailable' } when supabase admin is null (bad env, not a leak of missing-service-role details)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "DB unavailable" });
  });

  it("checks auth BEFORE supabase — anonymous in an unconfigured env still 401s, never 500s", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/secondary-offer — body parsing", () => {
  it("returns 400 { error: 'Invalid JSON' } when the body is not valid JSON (safely swallows the parse throw)", async () => {
    const res = await POST(rawReq("not-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON" });
  });

  it("400 on invalid JSON short-circuits BEFORE any DB query (ticker regex + SVI lookup skipped)", async () => {
    await POST(rawReq("<<<"));
    expect(state.fromCalls).toEqual([]);
  });
});

describe("POST /api/secondary-offer — ticker validation", () => {
  it("400 { error: 'Invalid ticker' } when ticker is missing entirely (defaults to '' → fails regex)", async () => {
    const res = await POST(jsonReq({ ...OK_BODY, ticker: undefined }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid ticker" });
  });

  it("400 when ticker missing the hyphen (regex requires ^[A-Z]{1,8}-[A-Z0-9]{1,8}$)", async () => {
    const res = await POST(jsonReq({ ...OK_BODY, ticker: "BLKABC" }));
    expect(res.status).toBe(400);
  });

  it("400 when ticker LHS exceeds 8 chars (regex clamps to 1..8 on each side)", async () => {
    const res = await POST(jsonReq({ ...OK_BODY, ticker: "TOOLONGXX-A" }));
    expect(res.status).toBe(400);
  });

  it("400 when ticker RHS contains a non-alphanumeric char (regex is [A-Z0-9]{1,8}, no dashes/underscores)", async () => {
    const res = await POST(jsonReq({ ...OK_BODY, ticker: "BLK-AB_C" }));
    expect(res.status).toBe(400);
  });

  it("uppercases + trims incoming ticker before the regex check (so 'blk-abc  ' still validates and is stored uppercase)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-id" }, error: null });
    const res = await POST(jsonReq({ ...OK_BODY, ticker: "  blk-abc  " }));
    expect(res.status).toBe(200);
    expect((state.insertPayload as { ticker: string }).ticker).toBe("BLK-ABC");
  });

  it("ticker regex allows digits on the RHS (BLK-0001 is a valid secondary parcel symbol)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-id" }, error: null });
    const res = await POST(jsonReq({ ...OK_BODY, ticker: "BLK-0001" }));
    expect(res.status).toBe(200);
  });

  it("ticker validation happens BEFORE the SVI lookup (invalid ticker never touches svi_analyses)", async () => {
    await POST(jsonReq({ ...OK_BODY, ticker: "invalid" }));
    expect(state.fromCalls).toEqual([]);
  });
});

describe("POST /api/secondary-offer — SVI + governance gating", () => {
  it("returns 403 with the founder's actual SVI in the message when svi < 80 (transparent, no silent block)", async () => {
    queueSviAnalysis(50, 70);
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/SVI must be ≥ 80/);
    expect(body.error).toMatch(/yours: 50/);
  });

  it("returns 403 with governance score in the message when svi ≥ 80 but governance < 60", async () => {
    queueSviAnalysis(85, 40);
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Governance score must be ≥ 60/);
    expect(body.error).toMatch(/yours: 40/);
  });

  it("treats missing latest analysis as svi=0, gov=0 (defaults, never NaN or undefined leaks into the message)", async () => {
    state.responses.push({ data: null, error: null });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/yours: 0/);
  });

  it("queries svi_analyses filtered by caller's email (tenancy: another founder's SVI cannot unlock your listing)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "alice@x.com" });
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-id" }, error: null });
    await POST(jsonReq(OK_BODY));
    expect(state.fromCalls[0]).toBe("svi_analyses");
    const emailEq = state.eqCalls.find((c) => c.col === "email");
    expect(emailEq).toBeDefined();
    expect(emailEq!.val).toBe("alice@x.com");
  });

  it("orders svi_analyses by created_at DESC and limits to 1 (picks the LATEST — not the first — analysis)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-id" }, error: null });
    await POST(jsonReq(OK_BODY));
    const created = state.orderCalls.find((c) => c.col === "created_at");
    expect(created).toBeDefined();
    expect(created!.opts).toEqual({ ascending: false });
    expect(state.limitCalls).toContain(1);
  });

  it("boundary: svi exactly 80 with governance exactly 60 passes both gates (>= is inclusive on both ends)", async () => {
    queueSviAnalysis(80, 60);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-id" }, error: null });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/secondary-offer — existing-offer update path", () => {
  it("existing draft/live offer for the caller+ticker → UPDATE, not INSERT (no duplicate parcels)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "existing-42", status: "draft" });
    queueMutationResult({ data: null, error: null });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: "updated", id: "existing-42" });
    expect(state.updatePayload).not.toBeNull();
    expect(state.insertPayload).toBeNull();
  });

  it("existing-offer check filters by account_id AND ticker AND status ∈ ['draft','live'] (won't resurrect a cancelled row)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "existing-42", status: "draft" });
    queueMutationResult({ data: null, error: null });
    await POST(jsonReq(OK_BODY));
    const accountEq = state.eqCalls.find((c) => c.col === "account_id" && c.val === "founder-1");
    const tickerEq = state.eqCalls.find((c) => c.col === "ticker" && c.val === "BLK-ABC");
    const statusIn = state.inCalls.find((c) => c.col === "status");
    expect(accountEq).toBeDefined();
    expect(tickerEq).toBeDefined();
    expect(statusIn).toBeDefined();
    expect(statusIn!.vals).toEqual(["draft", "live"]);
  });

  it("UPDATE payload preserves the caller-supplied slug when present (does not silently overwrite with latest svi.slug)", async () => {
    queueSviAnalysis(85, 70, "svi-slug");
    queueExistingOffer({ id: "e1", status: "live" });
    queueMutationResult({ data: null, error: null });
    await POST(jsonReq({ ...OK_BODY, slug: "founder-picked-slug" }));
    expect((state.updatePayload as { slug: string }).slug).toBe("founder-picked-slug");
  });

  it("UPDATE payload falls back to latest svi.slug when body.slug is absent (defaults, never null-blanks the slug)", async () => {
    queueSviAnalysis(85, 70, "svi-slug");
    queueExistingOffer({ id: "e1", status: "live" });
    queueMutationResult({ data: null, error: null });
    const { slug: _drop, ...noSlug } = OK_BODY;
    void _drop;
    await POST(jsonReq(noSlug));
    expect((state.updatePayload as { slug: string }).slug).toBe("svi-slug");
  });

  it("UPDATE payload stamps updated_at to a fresh ISO string (audit trail must move on every edit)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "e1", status: "draft" });
    queueMutationResult({ data: null, error: null });
    const before = Date.now();
    await POST(jsonReq(OK_BODY));
    const after = Date.now();
    const stamp = (state.updatePayload as { updated_at: string }).updated_at;
    const ts = Date.parse(stamp);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("UPDATE .eq('id', existing.id) is the ONLY filter on the mutation (a missing filter would blast every row)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "existing-42", status: "draft" });
    queueMutationResult({ data: null, error: null });
    await POST(jsonReq(OK_BODY));
    expect(state.updateEqAfter).toEqual([{ col: "id", val: "existing-42" }]);
  });

  it("UPDATE failure surfaces the supabase error message with status 500 (not a generic 'DB unavailable')", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "e1", status: "draft" });
    queueMutationResult({ data: null, error: { message: "boom-update" } });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "boom-update" });
  });

  it("UPDATE default lock_up_months = 12 when caller omits the field (matches ASIC-friendly one-year secondary lockup convention)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "e1", status: "draft" });
    queueMutationResult({ data: null, error: null });
    const { lock_up_months: _drop, ...noLock } = OK_BODY;
    void _drop;
    await POST(jsonReq(noLock));
    expect((state.updatePayload as { lock_up_months: number }).lock_up_months).toBe(12);
  });

  it("UPDATE clamps shares_for_sale to Math.max(1, floor(n)) — fractional/negative shares are illegal parcel sizes", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "e1", status: "draft" });
    queueMutationResult({ data: null, error: null });
    await POST(jsonReq({ ...OK_BODY, shares_for_sale: -5.9 }));
    expect((state.updatePayload as { shares_for_sale: number }).shares_for_sale).toBe(1);
  });

  it("UPDATE truncates buyer_profile and notes to 2000 chars (bounds free-text so the row never exceeds column budget)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer({ id: "e1", status: "draft" });
    queueMutationResult({ data: null, error: null });
    const long = "a".repeat(2500);
    await POST(jsonReq({ ...OK_BODY, buyer_profile: long, notes: long }));
    expect((state.updatePayload as { buyer_profile: string }).buyer_profile).toHaveLength(2000);
    expect((state.updatePayload as { notes: string }).notes).toHaveLength(2000);
  });
});

describe("POST /api/secondary-offer — insert (create) path", () => {
  it("no existing offer → INSERT with { ok: true, action: 'created', id } (draft status implied by column default flow)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "new-created-id" }, error: null });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: "created", id: "new-created-id" });
    expect(state.insertPayload).not.toBeNull();
  });

  it("INSERT payload stamps eligible_investor_type='sophisticated' and status='draft' (T_0011 s708(8)/(11) gate + admin-promotion workflow)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    await POST(jsonReq(OK_BODY));
    expect((state.insertPayload as { eligible_investor_type: string }).eligible_investor_type).toBe("sophisticated");
    expect((state.insertPayload as { status: string }).status).toBe("draft");
  });

  it("INSERT stamps account_id from the authenticated caller (not from the body — bodies must not choose their owner)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "authenticated-fid", email: "f@x.com" });
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    await POST(jsonReq({ ...OK_BODY, account_id: "spoofed-account" } as unknown as Record<string, unknown>));
    expect((state.insertPayload as { account_id: string }).account_id).toBe("authenticated-fid");
  });

  it("INSERT computes total_raise_aud = shares * price_band_high (denormalised for exchange rank ordering — must be sharesHigh, not sharesLow)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    await POST(jsonReq({ ...OK_BODY, shares_for_sale: 1000, price_band_low_aud: 1.0, price_band_high_aud: 2.5 }));
    expect((state.insertPayload as { total_raise_aud: number }).total_raise_aud).toBe(2500);
  });

  it("INSERT total_raise_aud is null when either shares or high-band is null (no false 0 across the exchange)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    const { shares_for_sale: _drop, ...noShares } = OK_BODY;
    void _drop;
    await POST(jsonReq(noShares));
    expect((state.insertPayload as { total_raise_aud: number | null }).total_raise_aud).toBeNull();
  });

  it("INSERT failure surfaces the supabase error message with status 500", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: null, error: { message: "boom-insert" } });
    const res = await POST(jsonReq(OK_BODY));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "boom-insert" });
  });

  it("INSERT price bands are Math.max(0, n) — negative bids/asks are illegal", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    await POST(jsonReq({ ...OK_BODY, price_band_low_aud: -5, price_band_high_aud: -10 }));
    expect((state.insertPayload as { price_band_low_aud: number }).price_band_low_aud).toBe(0);
    expect((state.insertPayload as { price_band_high_aud: number }).price_band_high_aud).toBe(0);
  });

  it("INSERT lock_up_months = Math.max(0, n) when caller passes a negative (never a negative lock-up)", async () => {
    queueSviAnalysis(85, 70);
    queueExistingOffer(null);
    queueMutationResult({ data: { id: "n1" }, error: null });
    await POST(jsonReq({ ...OK_BODY, lock_up_months: -3 }));
    expect((state.insertPayload as { lock_up_months: number }).lock_up_months).toBe(0);
  });
});

describe("GET /api/secondary-offer", () => {
  it("returns 401 { ok: false, error: 'Sign in required' } when anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Sign in required" });
  });

  it("returns { ok: false, rows: [] } when supabase admin is null (silent no-op, HTTP 200 so the UI renders empty state)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, rows: [] });
  });

  it("filters by account_id = current user (tenancy: only the caller's own offers come back)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    state.responses.push({ data: [{ id: "o1", ticker: "BLK-A" }], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const accountEq = state.eqCalls.find((c) => c.col === "account_id");
    expect(accountEq).toBeDefined();
    expect(accountEq!.val).toBe("founder-42");
    expect(await res.json()).toEqual({ ok: true, rows: [{ id: "o1", ticker: "BLK-A" }] });
  });

  it("orders results by created_at DESC (newest offer first — matches UI expectation)", async () => {
    state.responses.push({ data: [], error: null });
    await GET();
    const created = state.orderCalls.find((c) => c.col === "created_at");
    expect(created).toBeDefined();
    expect(created!.opts).toEqual({ ascending: false });
  });

  it("returns rows: [] (never null) when supabase's data is null (UI can rely on array.map without null-guarding)", async () => {
    state.responses.push({ data: null, error: null });
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, rows: [] });
  });
});
