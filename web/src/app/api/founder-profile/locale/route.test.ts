// Colocated vitest for POST /api/founder-profile/locale — P9-founder-profile-locale-route-test.
//
// The route persists a signed-in founder's language preference (T-1403.11).
// It is called by the locale switcher after the user picks EN or VI so the
// choice survives across sessions and devices via founder_profiles.preferred_locale
// (see migration 0117). Anonymous callers get a soft 204 — the cookie already
// covers them and we don't want unauth traffic to amplify auth cost.
//
// Silent regressions this suite pins against:
//   - Dropping the anonymous short-circuit would fire getSupabaseAdmin()
//     for every unauth locale-switch click and either 500-loop the switcher
//     or leak that the founder_profiles table exists to unauth traffic;
//   - Dropping the isLocale() guard would let a body like `{locale: "de"}`
//     land in founder_profiles.preferred_locale, and every downstream
//     translate.ts lookup would silently fall back to EN with no signal;
//   - Dropping the typeof-string guard would let `{locale: null}` slip
//     through the isLocale() call and blow up before the response, 500-ing
//     the switcher instead of returning a structured 400;
//   - Regressing the getSupabaseAdmin() null-check to a truthy chain would
//     500 instead of 503 when the service key is missing, breaking the
//     runbook that reads 503 as "config problem, not code problem";
//   - Regressing the "eq account_id" clause on the initial update would
//     let a compromised service key set every founder's locale to whatever
//     the caller picked — this is the ONLY tenancy boundary;
//   - Regressing the update-then-upsert fallback to a single upsert would
//     erase the `email` field on every existing profile row (upsert without
//     the existing row's other columns would null them out under Supabase's
//     onConflict semantics);
//   - Regressing the upsert onConflict from "account_id" to a stale name
//     would insert a second row per founder and the /account page would
//     load whichever came first (non-deterministic locale);
//   - Regressing the 500 passthrough of the upsert error would 200-lie to
//     the switcher and the UI would show "Saved" while nothing was written;
//   - Flipping the successful response's `preferred_locale` from the
//     coerced Locale to the raw body would echo attacker-controlled data
//     into a JSON response the switcher renders as trusted;
//   - Dropping the `runtime = "nodejs"` export would move this to the Edge
//     runtime, which cannot use the service-role Supabase client.
//   - Dropping the `dynamic = "force-dynamic"` export would let Next cache
//     the response and the switcher would return a stale locale to the
//     wrong founder.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALES } from "@/lib/i18n/locales";

// --- Types -----------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
  displayName?: string | null;
}

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn<() => Promise<AppUser | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST, runtime, dynamic } from "./route";

// --- Fake Supabase chain ---------------------------------------------------

interface FakeState {
  updateTable: string | null;
  updatePayload: Record<string, unknown> | null;
  updateEqCol: string | null;
  updateEqVal: unknown;
  updateResult: { error: { message: string } | null };
  upsertTable: string | null;
  upsertPayload: Record<string, unknown> | null;
  upsertOptions: Record<string, unknown> | null;
  upsertResult: { error: { message: string } | null };
  fromCalls: string[];
  updateCalls: number;
  upsertCalls: number;
}

const state: FakeState = {
  updateTable: null,
  updatePayload: null,
  updateEqCol: null,
  updateEqVal: null,
  updateResult: { error: null },
  upsertTable: null,
  upsertPayload: null,
  upsertOptions: null,
  upsertResult: { error: null },
  fromCalls: [],
  updateCalls: 0,
  upsertCalls: 0,
};

function resetState() {
  state.updateTable = null;
  state.updatePayload = null;
  state.updateEqCol = null;
  state.updateEqVal = null;
  state.updateResult = { error: null };
  state.upsertTable = null;
  state.upsertPayload = null;
  state.upsertOptions = null;
  state.upsertResult = { error: null };
  state.fromCalls = [];
  state.updateCalls = 0;
  state.upsertCalls = 0;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return {
        update(payload: Record<string, unknown>) {
          state.updateCalls += 1;
          state.updateTable = table;
          state.updatePayload = payload;
          return {
            eq(col: string, val: unknown) {
              state.updateEqCol = col;
              state.updateEqVal = val;
              return Promise.resolve(state.updateResult);
            },
          };
        },
        upsert(
          payload: Record<string, unknown>,
          options: Record<string, unknown>,
        ) {
          state.upsertCalls += 1;
          state.upsertTable = table;
          state.upsertPayload = payload;
          state.upsertOptions = options;
          return Promise.resolve(state.upsertResult);
        },
      };
    },
  };
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/founder-profile/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

// --------------------------------------------------------------------------
describe("route exports", () => {
  it('runtime is "nodejs" — the service-role Supabase client cannot run on Edge', () => {
    expect(runtime).toBe("nodejs");
  });

  it('dynamic is "force-dynamic" — Next must never cache a per-user mutation', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — anonymous branch", () => {
  it("returns 204 with an empty body when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ locale: "vi" }));
    expect(res.status).toBe(204);
    // 204 must not carry a body (the fetch-spec / HTTP spec both forbid one).
    // We can't call res.json() on a null-body response; assert the response
    // shape directly instead.
    expect(res.body).toBeNull();
  });

  it("short-circuits BEFORE parsing the body — a malformed anon call still returns 204", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq("this-is-not-json"));
    expect(res.status).toBe(204);
  });

  it("short-circuits BEFORE getSupabaseAdmin — anon traffic never touches the DB", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ locale: "vi" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toEqual([]);
    expect(state.updateCalls).toBe(0);
    expect(state.upsertCalls).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — body parse guard", () => {
  it("returns 400 { error: 'invalid_json' } when the body isn't parseable JSON", async () => {
    const res = await POST(jsonReq("this-is-not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_json" });
  });

  it("does NOT touch supabase on the invalid_json branch", async () => {
    await POST(jsonReq("this-is-not-json"));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.updateCalls).toBe(0);
    expect(state.upsertCalls).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — locale validation", () => {
  it("returns 400 { error: 'invalid_locale', allowed: LOCALES } when locale is missing", async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
    // The response echoes the registry so the client can render a picker
    // without hard-coding the list.
    expect(body.allowed).toEqual(LOCALES);
  });

  it("returns 400 when locale is null", async () => {
    const res = await POST(jsonReq({ locale: null }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
  });

  it("returns 400 when locale is a number (typeof-string guard)", async () => {
    const res = await POST(jsonReq({ locale: 42 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
  });

  it("returns 400 when locale is a boolean", async () => {
    const res = await POST(jsonReq({ locale: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
  });

  it("rejects an unknown locale code like 'de'", async () => {
    const res = await POST(jsonReq({ locale: "de" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
  });

  it("rejects a case-mismatched locale like 'EN' — the registry is lowercase-only", async () => {
    const res = await POST(jsonReq({ locale: "EN" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_locale");
  });

  it("does NOT touch supabase on the invalid_locale branch", async () => {
    await POST(jsonReq({ locale: "de" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.updateCalls).toBe(0);
    expect(state.upsertCalls).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — DB availability", () => {
  it("returns 503 { error: 'no_db' } when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq({ locale: "vi" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "no_db" });
    // The null-DB branch must fire AFTER the locale guard — that ordering
    // means an invalid_locale on a broken-config server still returns 400
    // (a client bug) rather than 503 (a server bug).
    expect(state.updateCalls).toBe(0);
    expect(state.upsertCalls).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — happy path (update succeeds)", () => {
  it("returns 200 { ok: true, preferred_locale } for a valid vi call", async () => {
    const res = await POST(jsonReq({ locale: "vi" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, preferred_locale: "vi" });
  });

  it("returns 200 { ok: true, preferred_locale } for a valid en call", async () => {
    const res = await POST(jsonReq({ locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, preferred_locale: "en" });
  });

  it("targets the founder_profiles table", async () => {
    await POST(jsonReq({ locale: "vi" }));
    expect(state.fromCalls).toEqual(["founder_profiles"]);
    expect(state.updateTable).toBe("founder_profiles");
  });

  it("update payload sets ONLY preferred_locale — must not clobber other columns", async () => {
    await POST(jsonReq({ locale: "vi" }));
    expect(state.updatePayload).toEqual({ preferred_locale: "vi" });
  });

  it("update .eq clause scopes to the authenticated user's account_id (tenancy boundary)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "x@y.com" });
    await POST(jsonReq({ locale: "vi" }));
    expect(state.updateEqCol).toBe("account_id");
    expect(state.updateEqVal).toBe("u-42");
  });

  it("does NOT fall through to upsert when the update succeeds", async () => {
    await POST(jsonReq({ locale: "vi" }));
    expect(state.updateCalls).toBe(1);
    expect(state.upsertCalls).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("POST /api/founder-profile/locale — upsert fallback (update errors)", () => {
  it("falls through to upsert when the update returns an error", async () => {
    state.updateResult = { error: { message: "row not found" } };
    const res = await POST(jsonReq({ locale: "vi" }));
    expect(state.upsertCalls).toBe(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, preferred_locale: "vi" });
  });

  it("upsert payload carries account_id, email, and preferred_locale", async () => {
    state.updateResult = { error: { message: "row not found" } };
    getCurrentUserMock.mockResolvedValue({ id: "u-9", email: "n@x.com" });
    await POST(jsonReq({ locale: "vi" }));
    expect(state.upsertPayload).toEqual({
      account_id: "u-9",
      email: "n@x.com",
      preferred_locale: "vi",
    });
  });

  it("upsert options set onConflict='account_id' — must dedupe on the natural key", async () => {
    state.updateResult = { error: { message: "row not found" } };
    await POST(jsonReq({ locale: "vi" }));
    expect(state.upsertOptions).toEqual({ onConflict: "account_id" });
  });

  it("upsert targets the founder_profiles table", async () => {
    state.updateResult = { error: { message: "row not found" } };
    await POST(jsonReq({ locale: "vi" }));
    expect(state.upsertTable).toBe("founder_profiles");
  });

  it("returns 500 { error: <upsert-msg> } when the upsert also errors", async () => {
    state.updateResult = { error: { message: "update boom" } };
    state.upsertResult = { error: { message: "upsert boom" } };
    const res = await POST(jsonReq({ locale: "vi" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    // The upsert error's `.message` is passed through so runbooks can grep
    // for the underlying constraint / RLS failure.
    expect(body).toEqual({ error: "upsert boom" });
  });
});
