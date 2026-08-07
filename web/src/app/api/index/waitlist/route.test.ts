// Colocated vitest for POST /api/index/waitlist — P9-index-waitlist-route-test.
//
// This route is the SIGN-UP endpoint for the Founding 100 waitlist promoted by
// the /index landing page. It writes into `founding50_waitlist` (the table name
// predates the 50 → 100 cap bump — the physical table was NOT renamed to keep
// the migration history / RLS policies pinned; see docs/plans/pricing v3.3.1).
// Silent regressions this pins:
//   - dropping the 400 guard on missing email/name, which would insert
//     `null` rows the CFO dashboard reads as valid waitlist entries;
//   - dropping the 503 guard when `getSupabaseAdmin()` returns null, which
//     would surface a 500 stack trace to the founder-facing form and count
//     as a form-submit failure in GA4;
//   - flipping the 23505 unique-violation branch off 409, which would surface
//     a 500 to a founder who signed up twice (a benign UX case that the form
//     hides behind "you're already on the list");
//   - inserting into the wrong table name (the physical `founding50_waitlist`
//     table is what /admin/waitlist reads; renaming here silently splits the
//     write path from the read path);
//   - inserting extra caller-controlled fields via body spread (only `email`
//     and `name` should reach the DB — a caller stuffing `is_admin: true` or
//     `granted_credits: 999999` must not persist);
//   - flipping the response envelope off `{ ok: true, message: ... }` — the
//     landing page toast reads both fields.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------

type InsertResult = { error: { code?: string; message?: string } | null };

const insertMock = vi.fn<(rows: unknown) => Promise<InsertResult>>();
const fromMock = vi.fn<(table: string) => { insert: typeof insertMock }>();
const getSupabaseAdminMock =
  vi.fn<() => { from: typeof fromMock } | null>();

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import must come AFTER the mocks are registered.
import { POST } from "./route";

// --- Helpers ----------------------------------------------------------------

function makeRequest(body: unknown | string): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/index/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

async function callPost(body: unknown | string): Promise<{
  status: number;
  headers: Headers;
  body: { ok?: boolean; message?: string; error?: string };
}> {
  const res = await POST(makeRequest(body));
  const parsed = (await res.json()) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  return { status: res.status, headers: res.headers, body: parsed };
}

// --- Setup ------------------------------------------------------------------

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockReset();
  getSupabaseAdminMock.mockReset();

  insertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock });
  getSupabaseAdminMock.mockReturnValue({ from: fromMock });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── validation guards ────────────────────────────────────────────────────

describe("validation guards", () => {
  it("returns 400 when email is missing (a null email would land in the CFO waitlist dashboard as a valid signup)", async () => {
    const { status, body } = await callPost({ name: "Jane" });
    expect(status).toBe(400);
    expect(body.error).toBe("Email and name are required");
  });

  it("returns 400 when name is missing (the founder greeting email personalises with `name`; a null would send 'Hi ,')", async () => {
    const { status, body } = await callPost({ email: "jane@example.com" });
    expect(status).toBe(400);
    expect(body.error).toBe("Email and name are required");
  });

  it("returns 400 when both email and name are missing (empty body)", async () => {
    const { status, body } = await callPost({});
    expect(status).toBe(400);
    expect(body.error).toBe("Email and name are required");
  });

  it("returns 400 when email is empty string (the `!email` guard treats '' as missing)", async () => {
    const { status } = await callPost({ email: "", name: "Jane" });
    expect(status).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    const { status } = await callPost({ email: "jane@example.com", name: "" });
    expect(status).toBe(400);
  });

  it("does NOT call getSupabaseAdmin when validation fails (cheap validation short-circuits before the DB round-trip)", async () => {
    await callPost({ name: "Jane" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ─── config guard ─────────────────────────────────────────────────────────

describe("config guard", () => {
  it("returns 503 with 'Database not configured' when getSupabaseAdmin returns null (missing SUPABASE_SERVICE_ROLE_KEY at boot)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const { status, body } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(status).toBe(503);
    expect(body.error).toBe("Database not configured");
  });

  it("does NOT reach insert when admin client is null (guard short-circuits)", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    await callPost({ email: "jane@example.com", name: "Jane" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ─── happy path ───────────────────────────────────────────────────────────

describe("happy path", () => {
  it("returns 200 for a valid signup", async () => {
    const { status } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(status).toBe(200);
  });

  it("response body is exactly { ok: true, message: 'Successfully added to waitlist' } (landing page toast reads both fields)", async () => {
    const { body } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(body.ok).toBe(true);
    expect(body.message).toBe("Successfully added to waitlist");
  });

  it("inserts into the `founding50_waitlist` table (physical table name pinned; renaming here silently splits the write path from /admin/waitlist read path)", async () => {
    await callPost({ email: "jane@example.com", name: "Jane" });
    expect(fromMock).toHaveBeenCalledWith("founding50_waitlist");
  });

  it("insert row shape is an array of one { email, name } object (not a bare object — Supabase's .insert typing accepts both but the CFO backfill script parses the array form)", async () => {
    await callPost({ email: "jane@example.com", name: "Jane" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith([
      { email: "jane@example.com", name: "Jane" },
    ]);
  });

  it("does NOT persist extra caller-controlled fields (attacker sends is_admin/granted_credits — only email + name reach the DB)", async () => {
    await callPost({
      email: "jane@example.com",
      name: "Jane",
      is_admin: true,
      granted_credits: 999_999,
    });
    expect(insertMock).toHaveBeenCalledWith([
      { email: "jane@example.com", name: "Jane" },
    ]);
    const call = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(Object.keys(call[0]).sort()).toEqual(["email", "name"]);
  });
});

// ─── duplicate email ──────────────────────────────────────────────────────

describe("duplicate email (Postgres 23505)", () => {
  it("returns 409 when insert error code is 23505 (unique_violation on the email column)", async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const { status } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(status).toBe(409);
  });

  it("returns the founder-facing 'This email is already on the waitlist' message (not the raw Postgres error text)", async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "founding50_waitlist_email_key"' },
    });
    const { body } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(body.error).toBe("This email is already on the waitlist");
  });
});

// ─── other DB errors ──────────────────────────────────────────────────────

describe("other DB errors", () => {
  it("returns 500 with the generic 'Internal server error' when insert fails with a non-23505 code (must NOT leak raw error text to the founder)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({
      error: { code: "42P01", message: "relation \"founding50_waitlist\" does not exist" },
    });
    const { status, body } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toMatch(/founding50_waitlist/);
    consoleSpy.mockRestore();
  });

  it("returns 500 when insert error has no code (raw thrown by supabase-js on network fault)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({
      error: { message: "network error" },
    });
    const { status, body } = await callPost({
      email: "jane@example.com",
      name: "Jane",
    });
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    consoleSpy.mockRestore();
  });

  it("logs to console.error on non-duplicate DB error (ops runs on this log line — dropping console.error blinds the on-call dashboard)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({
      error: { code: "42P01", message: "relation does not exist" },
    });
    await callPost({ email: "jane@example.com", name: "Jane" });
    expect(consoleSpy).toHaveBeenCalled();
    const firstArg = consoleSpy.mock.calls[0][0] as string;
    expect(firstArg).toContain("[index:waitlist]");
    consoleSpy.mockRestore();
  });

  it("does NOT log to console.error on the 23505 duplicate branch (that path is a benign UX case, not an ops alert)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate" },
    });
    await callPost({ email: "jane@example.com", name: "Jane" });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── malformed body ───────────────────────────────────────────────────────

describe("malformed body", () => {
  it("returns 500 with 'Internal server error' when the body is not JSON (request.json() throws SyntaxError)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await callPost("not json {[");
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    consoleSpy.mockRestore();
  });

  it("logs to console.error when body parse throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await callPost("not json {[");
    expect(consoleSpy).toHaveBeenCalled();
    const firstArg = consoleSpy.mock.calls[0][0] as string;
    expect(firstArg).toContain("[index:waitlist]");
    consoleSpy.mockRestore();
  });
});
