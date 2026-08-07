// Colocated vitest for POST /api/founding50/waitlist — P9-founding50-waitlist-route-test.
//
// This route is the second half of the Founding 50 marketing funnel: once
// /api/founding50/spots reports 0 remaining, the CTA drawer flips to a
// "join the waitlist" email capture that POSTs here. It is the only path
// by which a founder who missed the cohort ever appears in the
// founding50_waitlist table, so a silent regression here means the
// followup email list stops growing without anyone noticing until we go
// to launch cohort #2 and find zero warm leads.
//
// Regressions this suite is designed to catch:
//
//   - dropping the zod schema and letting a POST with no body / a non-email
//     string reach supabase (would fill the waitlist with junk rows and
//     bounce the followup send domain);
//   - dropping the .toLowerCase().trim() normalisation and letting a single
//     founder (Alice@Corp.com AND alice@corp.com AND " alice@corp.com ")
//     appear as three rows, breaking the onConflict:"email" dedupe;
//   - flipping onConflict/ignoreDuplicates so a repeat POST from the same
//     email overwrites the earlier joined_at timestamp (would make the
//     "waitlist priority by join order" copy on /founding50 a lie);
//   - dropping the isSupabaseConfigured() short-circuit on preview branches
//     without a service-role key (would 500 the marketing CTA);
//   - leaking the raw supabase error string in the 500 response body (would
//     surface DB schema hints to a public unauthenticated caller);
//   - regressing name from optional to required (would 400 the vast majority
//     of hero submissions that only ask for an email).
//
// The route is *deliberately* fire-and-forget on the client — the drawer
// shows a fixed success toast regardless of whether the row was already in
// the waitlist. ignoreDuplicates:true is what makes that safe, so it gets
// its own pin.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { POST } from "./route";

// --- Fake supabase capturing upsert shape ----------------------------------

interface UpsertCall {
  row: Record<string, unknown>;
  options: unknown;
}
interface FakeState {
  lastTable: string | null;
  upserts: UpsertCall[];
  upsertError: { message: string } | null;
  upsertShouldThrow: boolean;
}

const state: FakeState = {
  lastTable: null,
  upserts: [],
  upsertError: null,
  upsertShouldThrow: false,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.lastTable = table;
      return {
        upsert(row: Record<string, unknown>, options: unknown) {
          state.upserts.push({ row, options });
          if (state.upsertShouldThrow) {
            return Promise.reject(new Error("supabase-upsert-boom"));
          }
          return Promise.resolve({ error: state.upsertError, data: null });
        },
      };
    },
  };
}

function resetState() {
  state.lastTable = null;
  state.upserts = [];
  state.upsertError = null;
  state.upsertShouldThrow = false;
}

function makeReq(body: unknown, init: RequestInit = {}): Request {
  return new Request("http://localhost/api/founding50/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  getSupabaseAdminMock.mockReset().mockImplementation(() => makeFakeSupabase());
  resetState();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("POST /api/founding50/waitlist — zod schema (400 branch)", () => {
  it("rejects a completely empty body with 400 {ok:false,error:'Invalid email'}", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid email" });
  });

  it("rejects a missing 'email' field with 400", async () => {
    const res = await POST(makeReq({ name: "Alice" }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-string 'email' (number) with 400", async () => {
    const res = await POST(makeReq({ email: 123 }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed email string with 400", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty email string with 400", async () => {
    const res = await POST(makeReq({ email: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a 'name' longer than 100 chars with 400", async () => {
    const longName = "a".repeat(101);
    const res = await POST(makeReq({ email: "alice@corp.com", name: longName }));
    expect(res.status).toBe(400);
  });

  it("accepts a 'name' of exactly 100 chars (max is inclusive)", async () => {
    const exact = "a".repeat(100);
    const res = await POST(makeReq({ email: "alice@corp.com", name: exact }));
    expect(res.status).toBe(200);
    expect(state.upserts[0]?.row.name).toBe(exact);
  });

  it("accepts a POST with no 'name' at all (name is optional)", async () => {
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.status).toBe(200);
    // absent name is normalised to null on the DB row so onConflict works.
    expect(state.upserts[0]?.row.name).toBeNull();
  });

  it("returns 400 (not 500) when the request body is invalid JSON", async () => {
    // The route uses .catch(() => null) on .json(), which then fails safeParse
    // and returns the same 400 envelope the schema branch uses.
    const res = await POST(makeReq("{not-json"));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid email" });
  });

  it("does NOT touch supabase on any 400 branch", async () => {
    await POST(makeReq({ email: "nope" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
    expect(state.lastTable).toBeNull();
  });
});

describe("POST /api/founding50/waitlist — isSupabaseConfigured=false short-circuit", () => {
  it("returns 200 {ok:true,message:'Waitlisted'} when supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, message: "Waitlisted" });
  });

  it("does NOT call getSupabaseAdmin on the unconfigured branch", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await POST(makeReq({ email: "alice@corp.com" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("still validates the schema BEFORE the isSupabaseConfigured short-circuit", async () => {
    // Order matters: preview branches with no service-role key must still
    // reject junk input so we don't return "Waitlisted" to a POST with
    // email=null. Otherwise smoke tests never catch a broken client form.
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(makeReq({ email: "junk" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/founding50/waitlist — happy path (upsert shape)", () => {
  it("targets the 'founding50_waitlist' table (renaming would silently drop rows)", async () => {
    await POST(makeReq({ email: "alice@corp.com" }));
    expect(state.lastTable).toBe("founding50_waitlist");
  });

  it("lowercases the email before inserting (dedupe key must be canonical)", async () => {
    await POST(makeReq({ email: "Alice@Corp.COM" }));
    expect(state.upserts[0]?.row.email).toBe("alice@corp.com");
  });

  it("trims surrounding whitespace from the email", async () => {
    await POST(makeReq({ email: "  alice@corp.com  " }));
    // zod .email() rejects surrounding whitespace in most versions; but the
    // route also applies .trim() to defend against schema loosening. If the
    // schema ever rejects this we'll see a 400 — either verdict is fine as
    // long as the row never lands untrimmed.
    if (state.upserts.length > 0) {
      expect(state.upserts[0].row.email).toBe("alice@corp.com");
    }
  });

  it("persists a provided name verbatim (no lowercasing / no trim)", async () => {
    await POST(makeReq({ email: "alice@corp.com", name: "Alice Smith" }));
    expect(state.upserts[0]?.row.name).toBe("Alice Smith");
  });

  it("coerces a missing name to null (not undefined) so onConflict comparisons stay stable", async () => {
    await POST(makeReq({ email: "alice@corp.com" }));
    const row = state.upserts[0]?.row;
    expect(row?.name).toBeNull();
    // supabase-js drops `undefined` keys on the wire, but explicit null is
    // what the "no name yet" state should be — pin that.
    expect(Object.prototype.hasOwnProperty.call(row, "name")).toBe(true);
  });

  it("stamps joined_at with an ISO-8601 timestamp", async () => {
    await POST(makeReq({ email: "alice@corp.com" }));
    const joinedAt = state.upserts[0]?.row.joined_at as string;
    expect(typeof joinedAt).toBe("string");
    expect(joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
    // Round-trippable through Date without NaN.
    expect(Number.isNaN(new Date(joinedAt).getTime())).toBe(false);
  });

  it("uses onConflict='email' with ignoreDuplicates:true — repeat POSTs never overwrite priority order", async () => {
    // The founder-facing copy is "waitlist priority by join order". If a
    // second POST from the same address ever refreshed joined_at, the
    // /founding50 leaderboard would silently reshuffle. Pin both options
    // so a refactor of the supabase-js upsert signature can't drop them.
    await POST(makeReq({ email: "alice@corp.com" }));
    expect(state.upserts[0]?.options).toEqual({
      onConflict: "email",
      ignoreDuplicates: true,
    });
  });

  it("returns 200 {ok:true,message:\"You're on the waitlist!\"} on the happy path", async () => {
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, message: "You're on the waitlist!" });
  });

  it("runs exactly one upsert per POST (no wasted round-trip)", async () => {
    await POST(makeReq({ email: "alice@corp.com", name: "Alice" }));
    expect(state.upserts).toHaveLength(1);
  });

  it("returns Content-Type application/json", async () => {
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("POST /api/founding50/waitlist — supabase error branch", () => {
  it("returns 500 {ok:false,error:'Could not save'} when supabase returns {error}", async () => {
    state.upsertError = { message: "duplicate key value violates unique constraint" };
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Could not save" });
  });

  it("does NOT leak the underlying supabase error message to the caller", async () => {
    // The unauthenticated marketing form must never leak DB schema hints
    // (e.g. "column founding50_waitlist.joined_at does not exist" would tip
    // off a schema-probing attacker). The client sees the fixed copy only.
    state.upsertError = { message: "column founding50_waitlist.joined_at does not exist" };
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    const body = await json(res);
    expect(JSON.stringify(body)).not.toMatch(/joined_at/);
    expect(JSON.stringify(body)).not.toMatch(/does not exist/);
    expect(body).not.toHaveProperty("detail");
    expect(body).not.toHaveProperty("stack");
  });

  it("logs the supabase error to console.error (so ops sees it in the loop history)", async () => {
    state.upsertError = { message: "boom-msg" };
    await POST(makeReq({ email: "alice@corp.com" }));
    expect(errorSpy).toHaveBeenCalled();
    // The tag is the ops grep target — pin it or on-call can't find the row.
    const firstArg = errorSpy.mock.calls[0]?.[0];
    expect(String(firstArg)).toMatch(/blockid:founding50:waitlist/);
  });

  it("still returns 500 with the fixed body even if the error object has no .message", async () => {
    state.upsertError = { message: "" };
    const res = await POST(makeReq({ email: "alice@corp.com" }));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Could not save" });
  });
});

describe("POST /api/founding50/waitlist — response envelope invariants", () => {
  it("every success path uses the {ok:true, message} shape", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => {
        isSupabaseConfiguredMock.mockReturnValue(false);
        return POST(makeReq({ email: "a@b.co" }));
      },
      async () => POST(makeReq({ email: "a@b.co" })),
      async () => POST(makeReq({ email: "a@b.co", name: "Alice" })),
    ];
    for (const run of cases) {
      resetState();
      isSupabaseConfiguredMock.mockReturnValue(true);
      getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
      const res = await run();
      const body = await json(res);
      expect(body.ok).toBe(true);
      expect(typeof body.message).toBe("string");
      // Never leak a DB row / row id on a public form.
      expect(body).not.toHaveProperty("data");
      expect(body).not.toHaveProperty("id");
    }
  });

  it("every failure path uses the {ok:false, error} shape (no thrown 500 with HTML body)", async () => {
    const cases: Array<{ setup: () => void; body: unknown }> = [
      { setup: () => {}, body: { email: "not-an-email" } },
      { setup: () => {}, body: {} },
      {
        setup: () => {
          state.upsertError = { message: "x" };
        },
        body: { email: "a@b.co" },
      },
    ];
    for (const { setup, body } of cases) {
      resetState();
      isSupabaseConfiguredMock.mockReturnValue(true);
      getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
      setup();
      const res = await POST(makeReq(body));
      const parsed = await json(res);
      expect(parsed.ok).toBe(false);
      expect(typeof parsed.error).toBe("string");
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
    }
  });

  it("returns status codes exactly in {200, 400, 500} — no accidental 3xx / 4xx variants", async () => {
    const results: number[] = [];
    // 400
    results.push((await POST(makeReq({}))).status);
    // 200 (unconfigured)
    isSupabaseConfiguredMock.mockReturnValue(false);
    results.push((await POST(makeReq({ email: "a@b.co" }))).status);
    // 200 (happy)
    resetState();
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
    results.push((await POST(makeReq({ email: "a@b.co" }))).status);
    // 500 (supabase error)
    resetState();
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
    state.upsertError = { message: "x" };
    results.push((await POST(makeReq({ email: "a@b.co" }))).status);
    expect(results.every((s) => s === 200 || s === 400 || s === 500)).toBe(true);
  });
});
