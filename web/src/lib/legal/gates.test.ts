// Tests for the fail-closed legal gates.
//
// Every gate maps a compliance precondition to a thrown LegalGateError with
// a stable `.status` + `.code` pair that route handlers translate 1:1 into
// HTTP status codes. This suite pins the wire contract so a silent rename
// (e.g. `wholesale_required` → `not_wholesale`) can never ship without
// updating every downstream handler that switches on `err.code`.
//
// Uses a table-driven in-memory fake `SupabaseClient` covering the three
// query shapes the module uses:
//   sessions.select(user_id).eq(token, ?).maybeSingle()
//   app_users.select(?).eq(id, ?).maybeSingle()
//   consent_events.select(?).eq(...).eq(...).eq(...).order(...).limit(1).maybeSingle()
//
// Per-table failure injection via `state.fail` mirrors the pattern used by
// nudge/compliance-status.test.ts and dataroom/populate.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

interface FakeState {
  adminConfigured: boolean;
  cookieToken: string | null;
  rows: {
    sessions: Row[];
    app_users: Row[];
    consent_events: Row[];
  };
  fail: {
    sessions?: string;
    app_users?: string;
    consent_events?: string;
  };
}

const state: FakeState = {
  adminConfigured: true,
  cookieToken: null,
  rows: { sessions: [], app_users: [], consent_events: [] },
  fail: {},
};

function resetState() {
  state.adminConfigured = true;
  state.cookieToken = null;
  state.rows = { sessions: [], app_users: [], consent_events: [] };
  state.fail = {};
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      if (name !== "blockid_session") return undefined;
      return state.cookieToken === null
        ? undefined
        : { name, value: state.cookieToken };
    },
  }),
}));

vi.mock("./../supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? fakeAdmin() : null),
}));

vi.mock("./../auth", () => ({ SESSION_COOKIE: "blockid_session" }));

vi.mock("./versions", () => ({
  getCurrentVersion: (kind: string) => {
    if (kind === "tos") return "v2.0-2026-07-16";
    if (kind === "privacy") return "v2.0-2026-07-16";
    if (kind === "general_advice_warning") return "v1.0-2026-07-16";
    throw new Error(`getCurrentVersion: unknown disclaimer kind '${kind}'`);
  },
}));

function fakeAdmin() {
  return {
    from(table: string) {
      const tbl = table as keyof FakeState["rows"];
      const filters: Array<{ col: string; val: unknown }> = [];
      const chain = {
        select(_cols: string) {
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return chain;
        },
        order(_col: string, _opts: { ascending: boolean }) {
          return chain;
        },
        limit(_n: number) {
          return chain;
        },
        async maybeSingle() {
          const failMsg = state.fail[tbl];
          if (failMsg) {
            return { data: null, error: { message: failMsg } };
          }
          const rows = state.rows[tbl] ?? [];
          const match = rows.find((row) =>
            filters.every(({ col, val }) => row[col] === val),
          );
          return { data: match ?? null, error: null };
        },
      };
      return chain;
    },
  };
}

// Import after all vi.mock hoists.
import { LegalGateError } from "./gates";
import {
  assertLegalReviewPassed,
  assertWholesaleCertified,
  requireAck,
} from "./gates";

beforeEach(() => {
  resetState();
});

async function catchError<T>(promise: Promise<T>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err;
  }
}

// -----------------------------------------------------------------------
// LegalGateError shape
// -----------------------------------------------------------------------

describe("LegalGateError", () => {
  it("carries status + code + name + inherits Error", () => {
    const err = new LegalGateError("boom", { status: 403, code: "nope" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LegalGateError");
    expect(err.status).toBe(403);
    expect(err.code).toBe("nope");
    expect(err.message).toBe("boom");
  });
});

// -----------------------------------------------------------------------
// assertLegalReviewPassed()
// -----------------------------------------------------------------------

describe("assertLegalReviewPassed", () => {
  it("throws 503 supabase_unavailable when admin client is not configured", async () => {
    state.adminConfigured = false;
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err).toBeInstanceOf(LegalGateError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("supabase_unavailable");
  });

  it("throws 401 unauthenticated when no session cookie is present", async () => {
    // cookieToken null → cookies().get(SESSION_COOKIE) returns undefined
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthenticated");
  });

  it("throws 401 unauthenticated when session token does not resolve to a user_id (no row)", async () => {
    state.cookieToken = "stale-token";
    // no matching sessions row
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthenticated");
  });

  it("throws 401 unauthenticated when the sessions lookup errors (currentUserId swallows exceptions)", async () => {
    state.cookieToken = "t1";
    state.fail.sessions = "network down";
    // The sessions lookup returns {error: ...} — currentUserId returns null,
    // which the outer gate maps to 401 unauthenticated, NOT 500. This pin
    // matches the module's "no cookie == no user == 401" posture.
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthenticated");
  });

  it("throws 500 lookup_failed when the app_users query errors", async () => {
    state.cookieToken = "t1";
    state.rows.sessions.push({ token: "t1", user_id: "u1" });
    state.fail.app_users = "connection reset";
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("lookup_failed");
    expect(err.message).toContain("connection reset");
  });

  it("throws 403 legal_review_required when app_users row is missing entirely", async () => {
    state.cookieToken = "t1";
    state.rows.sessions.push({ token: "t1", user_id: "u1" });
    // no app_users row for u1
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("legal_review_required");
  });

  it("throws 403 legal_review_required when legal_review_passed is false", async () => {
    state.cookieToken = "t1";
    state.rows.sessions.push({ token: "t1", user_id: "u1" });
    state.rows.app_users.push({ id: "u1", legal_review_passed: false });
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("legal_review_required");
    expect(err.message).toMatch(/Legal review/);
  });

  it("throws 403 legal_review_required when legal_review_passed is null (falsy)", async () => {
    state.cookieToken = "t1";
    state.rows.sessions.push({ token: "t1", user_id: "u1" });
    state.rows.app_users.push({ id: "u1", legal_review_passed: null });
    const err = (await catchError(
      assertLegalReviewPassed(),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("legal_review_required");
  });

  it("resolves silently when legal_review_passed is true", async () => {
    state.cookieToken = "t1";
    state.rows.sessions.push({ token: "t1", user_id: "u1" });
    state.rows.app_users.push({ id: "u1", legal_review_passed: true });
    await expect(assertLegalReviewPassed()).resolves.toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// assertWholesaleCertified()
// -----------------------------------------------------------------------

describe("assertWholesaleCertified", () => {
  it("throws 400 bad_request when user_id is empty string", async () => {
    const err = (await catchError(
      assertWholesaleCertified(""),
    )) as LegalGateError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
  });

  it("throws 503 supabase_unavailable when admin client is not configured (after user_id guard)", async () => {
    state.adminConfigured = false;
    const err = (await catchError(
      assertWholesaleCertified("u1"),
    )) as LegalGateError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("supabase_unavailable");
  });

  it("throws 500 lookup_failed when the app_users query errors", async () => {
    state.fail.app_users = "timeout";
    const err = (await catchError(
      assertWholesaleCertified("u1"),
    )) as LegalGateError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("lookup_failed");
    expect(err.message).toContain("timeout");
  });

  it("throws 403 wholesale_required when the app_users row is missing", async () => {
    // no row for u1
    const err = (await catchError(
      assertWholesaleCertified("u1"),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("wholesale_required");
    // Anchor the statutory citation so a copy-paste rewrite can't drop it.
    expect(err.message).toContain("s708(8)/(11)");
  });

  it("throws 403 wholesale_required when wholesale_status is 'unverified'", async () => {
    state.rows.app_users.push({ id: "u1", wholesale_status: "unverified" });
    const err = (await catchError(
      assertWholesaleCertified("u1"),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("wholesale_required");
  });

  it("throws 403 wholesale_required when wholesale_status is null", async () => {
    state.rows.app_users.push({ id: "u1", wholesale_status: null });
    const err = (await catchError(
      assertWholesaleCertified("u1"),
    )) as LegalGateError;
    expect(err.status).toBe(403);
    expect(err.code).toBe("wholesale_required");
  });

  it("throws 403 wholesale_required when wholesale_status is any non-certified string (strict equality)", async () => {
    // Guard against a silent widening of the accept-list.
    for (const badStatus of ["pending", "expired", "wholesale", "CERTIFIED"]) {
      state.rows.app_users = [{ id: "u1", wholesale_status: badStatus }];
      const err = (await catchError(
        assertWholesaleCertified("u1"),
      )) as LegalGateError;
      expect(err.code, `status=${badStatus}`).toBe("wholesale_required");
    }
  });

  it("resolves silently when wholesale_status === 'wholesale_certified' (exact match)", async () => {
    state.rows.app_users.push({
      id: "u1",
      wholesale_status: "wholesale_certified",
    });
    await expect(
      assertWholesaleCertified("u1"),
    ).resolves.toBeUndefined();
  });

  it("scopes the query by the supplied user_id — a certified peer does not lift another user", async () => {
    state.rows.app_users.push({
      id: "u1",
      wholesale_status: "wholesale_certified",
    });
    state.rows.app_users.push({ id: "u2", wholesale_status: "unverified" });
    await expect(
      assertWholesaleCertified("u1"),
    ).resolves.toBeUndefined();
    const err = (await catchError(
      assertWholesaleCertified("u2"),
    )) as LegalGateError;
    expect(err.code).toBe("wholesale_required");
  });
});

// -----------------------------------------------------------------------
// requireAck()
// -----------------------------------------------------------------------

describe("requireAck", () => {
  it("throws 400 bad_request when user_id is empty", async () => {
    const err = (await catchError(
      requireAck("", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("bad_request");
  });

  it("throws 503 supabase_unavailable when admin client is not configured", async () => {
    state.adminConfigured = false;
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("supabase_unavailable");
  });

  it("propagates the underlying Error when getCurrentVersion rejects the disclaimer kind (guards against unknown kinds slipping past routes)", async () => {
    const err = (await catchError(
      requireAck("u1", "not_a_real_kind"),
    )) as Error;
    // getCurrentVersion throws a plain Error — NOT a LegalGateError — so the
    // route handler's LegalGateError branch does not catch it. This pin
    // ensures a typo in a callsite is a 500 hard failure, not a silent 409.
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LegalGateError);
    expect(err.message).toMatch(/unknown disclaimer kind/);
  });

  it("throws 500 lookup_failed when the consent_events query errors", async () => {
    state.fail.consent_events = "db down";
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("lookup_failed");
    expect(err.message).toContain("db down");
  });

  it("throws 409 consent_missing when no consent row exists at the current version", async () => {
    // No consent_events rows.
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(409);
    expect(err.code).toBe("consent_missing");
    // Anchor the version in the message so a downstream re-consent flow can
    // surface the exact version the user is behind.
    expect(err.message).toContain("v2.0-2026-07-16");
    expect(err.message).toContain("'tos'");
  });

  it("throws 409 consent_missing when the only row is at a stale version (bump forces re-consent)", async () => {
    state.rows.consent_events.push({
      id: "c1",
      user_id: "u1",
      consent_kind: "tos",
      disclaimer_version: "v1.0-2024-01-01",
      granted: true,
      ts: "2024-01-01T00:00:00Z",
    });
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(409);
    expect(err.code).toBe("consent_missing");
  });

  it("throws 409 consent_revoked when the current-version row has granted=false", async () => {
    state.rows.consent_events.push({
      id: "c2",
      user_id: "u1",
      consent_kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      granted: false,
      ts: "2026-07-20T00:00:00Z",
    });
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.status).toBe(409);
    expect(err.code).toBe("consent_revoked");
    expect(err.message).toContain("'tos'");
  });

  it("returns {id, granted:true} when a granted current-version consent row exists", async () => {
    state.rows.consent_events.push({
      id: "c3",
      user_id: "u1",
      consent_kind: "privacy",
      disclaimer_version: "v2.0-2026-07-16",
      granted: true,
      ts: "2026-07-25T00:00:00Z",
    });
    const result = await requireAck("u1", "privacy");
    expect(result).toEqual({ id: "c3", granted: true });
  });

  it("Boolean-coerces a truthy granted value (e.g. 1) into `granted: true`", async () => {
    // The module returns `Boolean(data.granted)` — pins the coercion so a
    // Postgres bit / smallint drift can't silently produce granted=1 leaking
    // into downstream callers that switch on `=== true`.
    state.rows.consent_events.push({
      id: "c4",
      user_id: "u1",
      consent_kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      granted: 1,
      ts: "2026-07-25T00:00:00Z",
    });
    const result = await requireAck("u1", "tos");
    expect(result).toEqual({ id: "c4", granted: true });
  });

  it("scopes the query by both user_id AND consent_kind — a peer's granted row cannot lift another user", async () => {
    state.rows.consent_events.push({
      id: "peer",
      user_id: "u2",
      consent_kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      granted: true,
      ts: "2026-07-25T00:00:00Z",
    });
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.code).toBe("consent_missing");
  });

  it("scopes by consent_kind — a granted 'privacy' consent does not satisfy a 'tos' requireAck", async () => {
    state.rows.consent_events.push({
      id: "cx",
      user_id: "u1",
      consent_kind: "privacy",
      disclaimer_version: "v2.0-2026-07-16",
      granted: true,
      ts: "2026-07-25T00:00:00Z",
    });
    const err = (await catchError(
      requireAck("u1", "tos"),
    )) as LegalGateError;
    expect(err.code).toBe("consent_missing");
  });
});
