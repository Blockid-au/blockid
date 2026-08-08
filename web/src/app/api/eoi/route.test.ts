// Colocated vitest for /api/eoi — P9-eoi-route-test.
//
// The verified-investor Expression-of-Interest surface (POST submits/updates
// an EOI against a live secondary offer; GET lists the caller's EOIs;
// OPTIONS handles the CORS preflight from startupvalueindex.com). A silent
// regression here would either leak the surface to non-investors (dropping
// the segment/account_type gate so any signed-in caller can flood a
// founder's inbox), let an unverified investor register EOIs (dropping the
// `verified_at` guard), let a POST land on a paused/closed offer (dropping
// the `.eq("status", "live")` filter so a founder gets EOIs on a withdrawn
// listing), duplicate an EOI when one already exists (dropping the
// existing-row lookup so the same investor spams the founder), fail to XSS-
// escape the founder-facing notes blockquote (dropping the `[<>]` replace so
// a hostile investor's notes render as raw HTML in the founder's mailbox),
// or emit the CORS preflight without the fixed startupvalueindex.com origin
// (breaking the embedded SVI widget flow).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { AppUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MeRow {
  account_type: string;
  segment: string | null;
  verified_at: string | null;
  display_name: string | null;
  email: string;
}

interface OfferRow {
  id: string;
  ticker: string;
  status: string;
  account_id: string;
}

interface FounderRow {
  email: string;
  display_name: string | null;
}

interface FakeState {
  me: MeRow | null;
  offer: OfferRow | null;
  founder: FounderRow | null;
  existingEoi: { id: string } | null;
  listRows: unknown[];
  lastInsert: Record<string, unknown> | null;
  lastUpdate: { patch: Record<string, unknown>; id: string } | null;
  lastEoiSelectFilters: { offer_id?: string; investor_id?: string };
  lastListFilters: { investor_id?: string; orderCol?: string; ascending?: boolean };
  lastOfferSelectFilters: { id?: string; status?: string };
  lastMeSelectId?: string;
  lastFounderSelectId?: string;
}

const state: FakeState = {
  me: null,
  offer: null,
  founder: null,
  existingEoi: null,
  listRows: [],
  lastInsert: null,
  lastUpdate: null,
  lastEoiSelectFilters: {},
  lastListFilters: {},
  lastOfferSelectFilters: {},
};

function resetState() {
  state.me = null;
  state.offer = null;
  state.founder = null;
  state.existingEoi = null;
  state.listRows = [];
  state.lastInsert = null;
  state.lastUpdate = null;
  state.lastEoiSelectFilters = {};
  state.lastListFilters = {};
  state.lastOfferSelectFilters = {};
  state.lastMeSelectId = undefined;
  state.lastFounderSelectId = undefined;
}

// Tracks whether the current app_users select-chain is targeting "me" or the
// founder. First app_users query in POST fetches the current user, then a
// second app_users query fetches the founder. GET only fetches the caller.
let appUsersSelectCols = "";

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "app_users") {
        return {
          select(cols: string) {
            appUsersSelectCols = cols;
            return this;
          },
          eq(col: string, val: string) {
            if (col === "id") {
              if (appUsersSelectCols.includes("account_type")) {
                state.lastMeSelectId = val;
              } else {
                state.lastFounderSelectId = val;
              }
            }
            return this;
          },
          maybeSingle() {
            if (appUsersSelectCols.includes("account_type")) {
              return Promise.resolve({ data: state.me, error: null });
            }
            return Promise.resolve({ data: state.founder, error: null });
          },
        };
      }
      if (table === "secondary_offers") {
        return {
          select(_cols: string) {
            return this;
          },
          eq(col: string, val: string) {
            if (col === "id") state.lastOfferSelectFilters.id = val;
            if (col === "status") state.lastOfferSelectFilters.status = val;
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: state.offer, error: null });
          },
        };
      }
      if (table === "eoi_book") {
        const chain = {
          _mode: "" as "select" | "update" | "insert" | "",
          _patch: null as Record<string, unknown> | null,
          select(_cols: string) {
            this._mode = "select";
            return this;
          },
          insert(row: Record<string, unknown>) {
            state.lastInsert = row;
            return Promise.resolve({ data: null, error: null });
          },
          update(patch: Record<string, unknown>) {
            this._mode = "update";
            this._patch = patch;
            return this;
          },
          eq(col: string, val: string) {
            if (this._mode === "update" && col === "id") {
              state.lastUpdate = { patch: this._patch!, id: val };
              return Promise.resolve({ data: null, error: null });
            }
            if (this._mode === "select") {
              // Distinguish list-my-EOIs (GET) from existing-check (POST) by
              // the columns filter set: GET filters only by investor_id; POST
              // filters by offer_id + investor_id.
              if (col === "offer_id") state.lastEoiSelectFilters.offer_id = val;
              if (col === "investor_id") {
                state.lastEoiSelectFilters.investor_id = val;
                state.lastListFilters.investor_id = val;
              }
            }
            return this;
          },
          order(col: string, opts: { ascending: boolean }) {
            state.lastListFilters.orderCol = col;
            state.lastListFilters.ascending = opts.ascending;
            return Promise.resolve({ data: state.listRows, error: null });
          },
          maybeSingle() {
            return Promise.resolve({ data: state.existingEoi, error: null });
          },
        };
        return chain;
      }
      throw new Error(`unknown table ${table}`);
    },
  };
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => mocks.sendEmailMock(args),
}));

import { GET, POST, OPTIONS, dynamic } from "./route";

const INVESTOR: AppUser = {
  id: "investor-1",
  email: "vc@fund.com",
  displayName: "VC Ava",
  createdAt: "2026-01-01T00:00:00Z",
  lastLoginAt: null,
  role: "user",
  plan: "free",
  googleId: null,
  avatarUrl: null,
  discountPct: null,
  startupName: null,
  startupStage: null,
  industry: null,
  onboardingCompleted: true,
  startupGoals: null,
};

const VERIFIED_ME: MeRow = {
  account_type: "investor",
  segment: "investor_angel",
  verified_at: "2026-02-01T00:00:00Z",
  display_name: "VC Ava",
  email: "vc@fund.com",
};

const LIVE_OFFER: OfferRow = {
  id: "offer-1",
  ticker: "ACME",
  status: "live",
  account_id: "founder-1",
};

const FOUNDER: FounderRow = {
  email: "founder@example.com",
  display_name: "Founder Bob",
};

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new NextRequest("http://x/api/eoi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  resetState();
  state.me = { ...VERIFIED_ME };
  state.offer = { ...LIVE_OFFER };
  state.founder = { ...FOUNDER };
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(INVESTOR);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.sendEmailMock.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("route module exports", () => {
  it("marks route dynamic — EOI submissions must never be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// OPTIONS
// ---------------------------------------------------------------------------

describe("OPTIONS /api/eoi", () => {
  it("204 preflight pins the SVI widget origin + allowed methods + headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://startupvalueindex.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });
});

// ---------------------------------------------------------------------------
// POST — auth + gate branches
// ---------------------------------------------------------------------------

describe("POST /api/eoi — auth + gate branches", () => {
  it("401 when getCurrentUser resolves null — never reads DB", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("401 preserves the SVI-widget CORS origin so the embedded flow sees the same header", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://startupvalueindex.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("500 when getSupabaseAdmin returns null — auth passed but storage down", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "DB unavailable" });
  });

  it("403 when app_users row is missing entirely — protects against orphaned sessions", async () => {
    state.me = null;
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Verified investor account required",
    });
    expect(state.lastInsert).toBeNull();
  });

  it("403 when segment=founder AND account_type!=investor — non-investors can't submit EOIs", async () => {
    state.me = { ...VERIFIED_ME, segment: "founder", account_type: "founder" };
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(403);
  });

  it("passes the gate when segment=investor_angel — the new-column path", async () => {
    state.me = { ...VERIFIED_ME, segment: "investor_angel", account_type: "founder" };
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(200);
  });

  it("passes the gate when segment=investor_vc — VC branch of the new column", async () => {
    state.me = { ...VERIFIED_ME, segment: "investor_vc", account_type: null as unknown as string };
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(200);
  });

  it("passes the gate on legacy account_type='investor' with segment=null — backfill fallback per migration 0073", async () => {
    state.me = { ...VERIFIED_ME, segment: null, account_type: "investor" };
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(200);
  });

  it("403 when verified_at is null — unverified investors cannot submit", async () => {
    state.me = { ...VERIFIED_ME, verified_at: null };
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(403);
  });

  it("me lookup filters by the SIGNED-IN user id — never a body override", async () => {
    await POST(postReq({ offer_id: "offer-1", account_id: "attacker" }));
    expect(state.lastMeSelectId).toBe(INVESTOR.id);
  });
});

// ---------------------------------------------------------------------------
// POST — body validation + offer resolution
// ---------------------------------------------------------------------------

describe("POST /api/eoi — body validation + offer resolution", () => {
  it("400 on invalid JSON — never queries offers/EOIs", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON" });
    expect(state.lastOfferSelectFilters.id).toBeUndefined();
    expect(state.lastInsert).toBeNull();
  });

  it("400 when offer_id is missing — never queries offers", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "offer_id required" });
    expect(state.lastOfferSelectFilters.id).toBeUndefined();
  });

  it("404 when offer is missing OR not live — pins the .eq('status','live') filter", async () => {
    state.offer = null;
    const res = await POST(postReq({ offer_id: "offer-1" }));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Offer not found or not live",
    });
    expect(state.lastOfferSelectFilters.status).toBe("live");
    expect(state.lastInsert).toBeNull();
  });

  it("offer lookup uses the body offer_id verbatim — pins the .eq('id', body.offer_id) filter", async () => {
    await POST(postReq({ offer_id: "offer-9" }));
    expect(state.lastOfferSelectFilters.id).toBe("offer-9");
  });
});

// ---------------------------------------------------------------------------
// POST — create branch
// ---------------------------------------------------------------------------

describe("POST /api/eoi — create branch", () => {
  it("200 action:created inserts a fresh row scoped to the signed-in investor + resolved offer + status='pending'", async () => {
    const res = await POST(
      postReq({ offer_id: "offer-1", amount_aud: 25000, notes: "keen to co-invest" }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, action: "created" });
    expect(state.lastInsert).toEqual({
      offer_id: LIVE_OFFER.id,
      investor_id: INVESTOR.id,
      amount_aud: 25000,
      notes: "keen to co-invest",
      status: "pending",
    });
    expect(state.lastUpdate).toBeNull();
  });

  it("amount_aud=0 is clamped to Math.max(1, 0)=1 — the min-one-dollar floor", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 0 }));
    expect(state.lastInsert?.amount_aud).toBe(1);
  });

  it("amount_aud=-500 is clamped to 1 — negative indicative amounts never persist", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: -500 }));
    expect(state.lastInsert?.amount_aud).toBe(1);
  });

  it("non-numeric amount_aud stores as null — the `typeof === 'number'` gate", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: "25k" }));
    expect(state.lastInsert?.amount_aud).toBeNull();
  });

  it("notes longer than 1000 chars are truncated bit-for-bit — pins the .slice(0,1000)", async () => {
    const long = "x".repeat(1500);
    await POST(postReq({ offer_id: "offer-1", notes: long }));
    expect((state.lastInsert?.notes as string).length).toBe(1000);
  });

  it("notes = null when omitted — pins the `?? null` default", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    expect(state.lastInsert?.notes).toBeNull();
  });

  it("existing-row check filters by (offer_id, investor_id) — one investor, one EOI per offer", async () => {
    await POST(postReq({ offer_id: "offer-1" }));
    expect(state.lastEoiSelectFilters.offer_id).toBe(LIVE_OFFER.id);
    expect(state.lastEoiSelectFilters.investor_id).toBe(INVESTOR.id);
  });
});

// ---------------------------------------------------------------------------
// POST — update branch (existing row)
// ---------------------------------------------------------------------------

describe("POST /api/eoi — update branch", () => {
  it("200 action:updated when an EOI already exists — never inserts a duplicate", async () => {
    state.existingEoi = { id: "eoi-existing" };
    const res = await POST(
      postReq({ offer_id: "offer-1", amount_aud: 40000, notes: "raising ticket" }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, action: "updated" });
    expect(state.lastInsert).toBeNull();
    expect(state.lastUpdate?.id).toBe("eoi-existing");
    expect(state.lastUpdate?.patch.amount_aud).toBe(40000);
    expect(state.lastUpdate?.patch.notes).toBe("raising ticket");
    expect(typeof state.lastUpdate?.patch.updated_at).toBe("string");
  });

  it("update patch's updated_at is a parseable ISO string — pins the new Date().toISOString() shape", async () => {
    state.existingEoi = { id: "eoi-existing" };
    await POST(postReq({ offer_id: "offer-1", amount_aud: 100 }));
    const iso = state.lastUpdate?.patch.updated_at as string;
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });

  it("update branch does NOT invoke sendEmail — founder notify is the create-only side effect", async () => {
    state.existingEoi = { id: "eoi-existing" };
    await POST(postReq({ offer_id: "offer-1", amount_aud: 100 }));
    expect(mocks.sendEmailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — founder notification email
// ---------------------------------------------------------------------------

describe("POST /api/eoi — founder notification", () => {
  it("sendEmail invoked with founder's email + ticker + A$K subject when amount present", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 25000 }));
    expect(mocks.sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = mocks.sendEmailMock.mock.calls[0]![0];
    expect(arg.to).toBe(FOUNDER.email);
    expect(arg.subject).toBe("New EOI on ACME · A$25K indicative");
  });

  it("subject omits the amount suffix when amount_aud is null (non-numeric input)", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: "TBD" }));
    const arg = mocks.sendEmailMock.mock.calls[0]![0];
    expect(arg.subject).toBe("New EOI on ACME");
  });

  it("amount rounded to nearest K — 27499 renders as A$27K via .toFixed(0) on (n/1000)", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 27499 }));
    expect(mocks.sendEmailMock.mock.calls[0]![0].subject).toBe(
      "New EOI on ACME · A$27K indicative",
    );
  });

  it("HTML body uses investor display_name when set — never the raw email", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    const arg = mocks.sendEmailMock.mock.calls[0]![0];
    expect(arg.html).toContain("<strong>VC Ava</strong>");
    expect(arg.html).toContain("<strong>A$5,000</strong>");
  });

  it("HTML body falls back to investor email when display_name is null", async () => {
    state.me = { ...VERIFIED_ME, display_name: null };
    await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    expect(mocks.sendEmailMock.mock.calls[0]![0].html).toContain(
      "<strong>vc@fund.com</strong>",
    );
  });

  it("HTML escapes < and > in the notes blockquote — prevents raw HTML injection into the founder mailbox", async () => {
    await POST(
      postReq({
        offer_id: "offer-1",
        amount_aud: 5000,
        notes: "<script>alert(1)</script>",
      }),
    );
    const html = mocks.sendEmailMock.mock.calls[0]![0].html as string;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("HTML omits the notes blockquote entirely when notes are null — the ternary short-circuit", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    const html = mocks.sendEmailMock.mock.calls[0]![0].html as string;
    expect(html).not.toContain("<blockquote");
  });

  it("founder lookup uses offer.account_id — never a body override", async () => {
    await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    expect(state.lastFounderSelectId).toBe(LIVE_OFFER.account_id);
  });

  it("sendEmail skipped when founder row has no email — the .email truthy guard", async () => {
    state.founder = { email: "", display_name: null };
    const res = await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    expect(res.status).toBe(200);
    expect(mocks.sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendEmail skipped when founder row is missing entirely — no crash on null lookup", async () => {
    state.founder = null;
    const res = await POST(postReq({ offer_id: "offer-1", amount_aud: 5000 }));
    expect(res.status).toBe(200);
    expect(mocks.sendEmailMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — list-my-EOIs
// ---------------------------------------------------------------------------

describe("GET /api/eoi", () => {
  it("401 when not signed in — never touches supabase", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns { ok: true, rows: [] } when supabase is unavailable — does NOT 500 the client", async () => {
    mocks.getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: false, rows: [] });
  });

  it("filters eoi_book by the signed-in investor and orders by created_at desc", async () => {
    state.listRows = [
      {
        id: "eoi-1",
        offer_id: "offer-1",
        amount_aud: 5000,
        notes: null,
        status: "pending",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.rows).toEqual(state.listRows);
    expect(state.lastListFilters.investor_id).toBe(INVESTOR.id);
    expect(state.lastListFilters.orderCol).toBe("created_at");
    expect(state.lastListFilters.ascending).toBe(false);
  });

  it("returns { rows: [] } when the query returns null — pins the `?? []` fallback", async () => {
    state.listRows = null as unknown as unknown[];
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await json(res)).rows).toEqual([]);
  });
});
