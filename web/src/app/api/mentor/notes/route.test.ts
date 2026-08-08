// Colocated vitest for /api/mentor/notes — P9-mentor-notes-route-test.
//
// The route is the mentor console's private note surface (CRUD).
// It hangs off scopedReseller() to constrain writes to the mentor's
// attributed founders, uses decideReveal() to reject out-of-scope
// subject_user_ids, and writes an audit row to reseller_audit_log
// through resellerSupabase(scope).auditLog for every mutation.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 gate so any visitor can drop
//     private mentor notes on any founder.
//   - Dropping the scopedReseller() 403 gate (or letting a raw error
//     other than ResellerScopeError leak a 500) — the route MUST NOT
//     leak scope internals to the client.
//   - Dropping `decideReveal(subject_user_id, allowedCustomerIds)` so
//     a mentor writes a note against a founder outside their scope.
//   - Dropping the validateBody() gate so mentors can persist empty
//     or oversized notes (writing straight to the audit log which
//     downstream digests join to).
//   - Regressing the visibility default (must fall back to "private"
//     when the client omits it) — a founder-shared note by accident
//     is a compliance incident.
//   - Regressing the ownership gate on PATCH/DELETE so a mentor can
//     rewrite or hard-delete another mentor's note.
//   - Dropping the auditLog write on any mutation so incident-response
//     loses the trail (see reseller-module-plan.md § D.3 / E.3).
//   - Leaking note body into the audit metadata (diffAudit intentionally
//     scrubs body content — only the visibility transition is echoed).
//   - Dropping `.eq('mentor_user_id', user.id)` on UPDATE/DELETE so a
//     stale row snapshot can be used to race a cross-mentor mutation.
//   - Regressing DELETE's id resolver: it MUST accept id from either
//     the JSON body OR the ?id= query string (both surfaces are used).
//   - Regressing the "delete_failed" envelope so the widget cannot
//     distinguish a lookup failure from a delete failure.
//   - Losing `export const dynamic = "force-dynamic"` — this route reads
//     per-request auth state and cannot be pinned to the build cache.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email?: string } | null>>(),
  scopedReseller: vi.fn<(u: unknown) => Promise<unknown>>(),
  decideReveal: vi.fn<
    (id: unknown, allowed: string[]) =>
      | { ok: true; customerId: string }
      | { ok: false; reason: "missing_id" | "invalid_id" | "not_in_scope" }
  >(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
  resellerSupabase: vi.fn<(scope: unknown) => { auditLog: (entry: unknown) => Promise<void> }>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));

vi.mock("@/lib/reseller/scope", () => {
  class ResellerScopeError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
      this.name = "ResellerScopeError";
    }
  }
  return {
    scopedReseller: (u: unknown) => mocks.scopedReseller(u),
    ResellerScopeError,
  };
});

vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (scope: unknown) => mocks.resellerSupabase(scope),
}));

vi.mock("@/lib/reseller/customer-reveal", () => ({
  decideReveal: (id: unknown, allowed: string[]) => mocks.decideReveal(id, allowed),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));

import { POST, PATCH, DELETE, dynamic } from "./route";
import { ResellerScopeError } from "@/lib/reseller/scope";

// ---------------------------------------------------------------------------
// Fake supabase — records every write against `mentor_notes` so the audit
// order / eq filters can be asserted without touching a real database.
// ---------------------------------------------------------------------------

interface Eq {
  col: string;
  val: unknown;
}
interface UpdateCall {
  payload: Record<string, unknown>;
  eqs: Eq[];
}
interface InsertCall {
  payload: Record<string, unknown>;
  selectCols: string | null;
}
interface DeleteCall {
  eqs: Eq[];
}

interface FakeState {
  lookupRow: Record<string, unknown> | null;
  lookupError: { message: string } | null;
  insertRow: Record<string, unknown> | null;
  insertError: { message: string } | null;
  updateRow: Record<string, unknown> | null;
  updateError: { message: string } | null;
  deleteError: { message: string } | null;
  selectEqs: Eq[];
  selectCols: string | null;
  inserts: InsertCall[];
  updates: UpdateCall[];
  deletes: DeleteCall[];
}

let state: FakeState;
let auditCalls: Array<Record<string, unknown>>;
let auditThrow: Error | null;

function makeSupabase(): unknown {
  return {
    from(table: string) {
      if (table !== "mentor_notes") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        // ── SELECT ──────────────────────────────────────────────────
        select: (cols: string) => {
          state.selectCols = cols;
          const api: Record<string, unknown> = {};
          api.eq = (col: string, val: unknown) => {
            state.selectEqs.push({ col, val });
            return api;
          };
          api.maybeSingle = () =>
            Promise.resolve({ data: state.lookupRow, error: state.lookupError });
          api.single = () =>
            Promise.resolve({ data: state.lookupRow, error: state.lookupError });
          return api;
        },
        // ── INSERT ──────────────────────────────────────────────────
        insert: (payload: Record<string, unknown>) => {
          const call: InsertCall = { payload, selectCols: null };
          state.inserts.push(call);
          return {
            select: (cols: string) => {
              call.selectCols = cols;
              return {
                single: () =>
                  Promise.resolve({ data: state.insertRow, error: state.insertError }),
              };
            },
          };
        },
        // ── UPDATE ──────────────────────────────────────────────────
        update: (payload: Record<string, unknown>) => {
          const call: UpdateCall = { payload, eqs: [] };
          state.updates.push(call);
          const api: Record<string, unknown> = {};
          api.eq = (col: string, val: unknown) => {
            call.eqs.push({ col, val });
            return api;
          };
          api.select = (_cols: string) => ({
            single: () =>
              Promise.resolve({ data: state.updateRow, error: state.updateError }),
          });
          return api;
        },
        // ── DELETE ──────────────────────────────────────────────────
        delete: () => {
          const call: DeleteCall = { eqs: [] };
          state.deletes.push(call);
          const api: Record<string, unknown> = {};
          api.eq = (col: string, val: unknown) => {
            call.eqs.push({ col, val });
            // Awaiting the chain resolves to { error }
            (api as { then?: unknown }).then = (
              resolve: (v: { error: { message: string } | null }) => unknown,
            ) => resolve({ error: state.deleteError });
            return api;
          };
          return api;
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const USER = { id: "mentor-1", email: "mentor@example.com" };
const OTHER_MENTOR = "mentor-2";
const SUBJECT = "00000000-0000-4000-8000-000000000001";
const NOTE_ID = "note-abc";
const ALLOWED = [SUBJECT];

const SCOPE = {
  reseller_id: "res-1",
  role: "owner" as const,
  allowedCustomerIds: async () => ALLOWED,
};

function req(init?: {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  url?: string;
}): Request {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(init?.url ?? "http://x/api/mentor/notes", {
    method: init?.method ?? "POST",
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state = {
    lookupRow: null,
    lookupError: null,
    insertRow: {
      id: NOTE_ID,
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
      visibility: "private",
    },
    insertError: null,
    updateRow: {
      id: NOTE_ID,
      updated_at: "2026-08-08T00:00:01Z",
      visibility: "private",
    },
    updateError: null,
    deleteError: null,
    selectEqs: [],
    selectCols: null,
    inserts: [],
    updates: [],
    deletes: [],
  };
  auditCalls = [];
  auditThrow = null;

  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.scopedReseller.mockResolvedValue(SCOPE);
  mocks.decideReveal.mockImplementation((id) =>
    typeof id === "string" && id === SUBJECT
      ? { ok: true, customerId: SUBJECT }
      : { ok: false, reason: "not_in_scope" as const },
  );
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase());
  mocks.resellerSupabase.mockReturnValue({
    auditLog: async (entry: unknown) => {
      auditCalls.push(entry as Record<string, unknown>);
      if (auditThrow) throw auditThrow;
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

describe("route module", () => {
  it("exports dynamic='force-dynamic' — per-request auth state must NOT be cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST — auth + scope gates", () => {
  it("401 when getCurrentUser() returns null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "unauthorised" });
  });

  it("401 never runs scopedReseller / decideReveal / supabase writes", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(mocks.scopedReseller).not.toHaveBeenCalled();
    expect(mocks.decideReveal).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([]);
  });

  it("403 with ResellerScopeError.code when scopedReseller throws it", async () => {
    mocks.scopedReseller.mockRejectedValueOnce(new ResellerScopeError("no_reseller"));
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "no_reseller" });
  });

  it("re-throws non-ResellerScopeError from scopedReseller (bubbles a 500-shaped throw)", async () => {
    mocks.scopedReseller.mockRejectedValueOnce(new Error("boom"));
    await expect(POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }))).rejects.toThrow(
      "boom",
    );
  });
});

describe("POST — body + target gates", () => {
  it("400 invalid_body when JSON body is not present", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("403 not_in_scope when subject_user_id is not in allowedCustomerIds", async () => {
    const res = await POST(req({ body: { subject_user_id: "not-in-scope", body: "hi" } }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_in_scope" });
  });

  it("400 missing_id when decideReveal returns missing_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "missing_id" });
    const res = await POST(req({ body: { body: "hi" } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "missing_id" });
  });

  it("400 invalid_id when decideReveal returns invalid_id", async () => {
    mocks.decideReveal.mockReturnValue({ ok: false, reason: "invalid_id" });
    const res = await POST(req({ body: { subject_user_id: "not-a-uuid", body: "hi" } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_id" });
  });

  it("400 empty when validateBody rejects an empty string", async () => {
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "   " } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "empty" });
  });

  it("400 too_long when validateBody rejects a >4000-char body", async () => {
    const res = await POST(
      req({ body: { subject_user_id: SUBJECT, body: "x".repeat(4001) } }),
    );
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "too_long" });
  });

  it("400 invalid_type when body is not a string", async () => {
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: 42 } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_type" });
  });
});

describe("POST — persistence + audit", () => {
  it("503 when getSupabaseAdmin() returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_configured" });
    expect(auditCalls).toEqual([]);
  });

  it("500 insert_failed when supabase.insert returns an error", async () => {
    state.insertError = { message: "conflict" };
    state.insertRow = null;
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "insert_failed", error: "conflict" });
    expect(auditCalls).toEqual([]);
  });

  it("500 audit_failed when auditLog throws — surfaces the error message", async () => {
    auditThrow = new Error("audit-boom");
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "audit_failed", error: "audit-boom" });
  });

  it("200 success returns the inserted note envelope", async () => {
    const res = await POST(req({ body: { subject_user_id: SUBJECT, body: "  first note  " } }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({
      ok: true,
      note: {
        id: NOTE_ID,
        created_at: "2026-08-08T00:00:00Z",
        updated_at: "2026-08-08T00:00:00Z",
        visibility: "private",
      },
    });
  });

  it("insert payload uses session user.id as mentor_user_id (never trusts client)", async () => {
    await POST(
      req({
        body: {
          subject_user_id: SUBJECT,
          body: "hi",
          mentor_user_id: "attacker-666", // MUST be ignored
        },
      }),
    );
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]!.payload.mentor_user_id).toBe(USER.id);
  });

  it("insert payload writes subject_user_id from decideReveal (not the raw client value)", async () => {
    await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(state.inserts[0]!.payload.subject_user_id).toBe(SUBJECT);
  });

  it("insert payload defaults visibility to 'private' when client omits it", async () => {
    await POST(req({ body: { subject_user_id: SUBJECT, body: "hi" } }));
    expect(state.inserts[0]!.payload.visibility).toBe("private");
  });

  it("insert payload defaults visibility to 'private' when client sends an unknown value", async () => {
    await POST(
      req({ body: { subject_user_id: SUBJECT, body: "hi", visibility: "public-mistake" } }),
    );
    expect(state.inserts[0]!.payload.visibility).toBe("private");
  });

  it("insert payload preserves visibility='shared_with_founder' when explicitly set", async () => {
    state.insertRow = { ...state.insertRow!, visibility: "shared_with_founder" };
    await POST(
      req({ body: { subject_user_id: SUBJECT, body: "hi", visibility: "shared_with_founder" } }),
    );
    expect(state.inserts[0]!.payload.visibility).toBe("shared_with_founder");
  });

  it("insert payload trims trailing whitespace from the body (validateBody contract)", async () => {
    await POST(req({ body: { subject_user_id: SUBJECT, body: "hello  \n" } }));
    expect(state.inserts[0]!.payload.body).toBe("hello");
  });

  it("audit log fires with mentor_note_create + note_id + route + IP + UA from headers", async () => {
    await POST(
      req({
        body: { subject_user_id: SUBJECT, body: "hi" },
        headers: {
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
          "user-agent": "vitest-ua/1.0",
        },
      }),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      actor_user_id: USER.id,
      subject_user_id: SUBJECT,
      action: "mentor_note_create",
      route: "/api/mentor/notes",
      ip: "203.0.113.7",
      user_agent: "vitest-ua/1.0",
    });
    expect((auditCalls[0]!.metadata as Record<string, unknown>).note_id).toBe(NOTE_ID);
  });

  it("audit log falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await POST(
      req({
        body: { subject_user_id: SUBJECT, body: "hi" },
        headers: { "x-real-ip": "198.51.100.42" },
      }),
    );
    expect(auditCalls[0]!.ip).toBe("198.51.100.42");
  });

  it("audit metadata NEVER includes the note body (only visibility + note_id) — leak guard", async () => {
    await POST(
      req({ body: { subject_user_id: SUBJECT, body: "secret-tone: founder is de-risking pivot" } }),
    );
    const meta = auditCalls[0]!.metadata as Record<string, unknown>;
    const fields = auditCalls[0]!.fields as string[];
    expect(JSON.stringify(meta)).not.toContain("secret-tone");
    expect(JSON.stringify(fields)).not.toContain("secret-tone");
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe("PATCH — auth + body gates", () => {
  it("401 when getCurrentUser() returns null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "unauthorised" });
  });

  it("403 with ResellerScopeError.code when scopedReseller throws it", async () => {
    mocks.scopedReseller.mockRejectedValueOnce(new ResellerScopeError("no_reseller"));
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(403);
  });

  it("400 invalid_body when body has no string id", async () => {
    const res = await PATCH(req({ method: "PATCH", body: { body: "x" } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("503 when getSupabaseAdmin() returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("PATCH — ownership + validation gates", () => {
  it("500 lookup_failed when the SELECT returns an error", async () => {
    state.lookupError = { message: "db-oops" };
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "lookup_failed", error: "db-oops" });
  });

  it("404 not_found when SELECT returns no row", async () => {
    state.lookupRow = null;
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(404);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_found" });
  });

  it("403 not_owner when the mentor_user_id on the row is a different mentor", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: OTHER_MENTOR,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "x" } }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_owner" });
    expect(state.updates).toEqual([]);
    expect(auditCalls).toEqual([]);
  });

  it("400 empty when body is whitespace-only", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "   " } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "empty" });
  });

  it("400 invalid_visibility when visibility is not in the enum", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await PATCH(
      req({ method: "PATCH", body: { id: NOTE_ID, visibility: "public" } }),
    );
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_visibility" });
  });
});

describe("PATCH — happy path + audit", () => {
  beforeEach(() => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior body",
      visibility: "private",
    };
  });

  it("500 update_failed when supabase.update returns an error", async () => {
    state.updateError = { message: "row-locked" };
    state.updateRow = null;
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "next" } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "update_failed", error: "row-locked" });
    expect(auditCalls).toEqual([]);
  });

  it("200 returns the updated note envelope", async () => {
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "next" } }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({
      ok: true,
      note: {
        id: NOTE_ID,
        updated_at: "2026-08-08T00:00:01Z",
        visibility: "private",
      },
    });
  });

  it("update payload only writes patched fields — omitted body leaves body unchanged", async () => {
    await PATCH(
      req({
        method: "PATCH",
        body: { id: NOTE_ID, visibility: "shared_with_founder" },
      }),
    );
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.payload).not.toHaveProperty("body");
    expect(state.updates[0]!.payload.visibility).toBe("shared_with_founder");
  });

  it("update chain applies BOTH eq('id',…) AND eq('mentor_user_id', session.id) — race guard", async () => {
    await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "next" } }));
    const eqs = state.updates[0]!.eqs;
    expect(eqs).toEqual(
      expect.arrayContaining([
        { col: "id", val: NOTE_ID },
        { col: "mentor_user_id", val: USER.id },
      ]),
    );
  });

  it("audit fields include 'body' when body changed and 'visibility' when visibility changed", async () => {
    await PATCH(
      req({
        method: "PATCH",
        body: { id: NOTE_ID, body: "next", visibility: "shared_with_founder" },
      }),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.action).toBe("mentor_note_update");
    expect(auditCalls[0]!.fields).toEqual(expect.arrayContaining(["body", "visibility"]));
  });

  it("audit metadata carries visibility_before + visibility_after — no body content", async () => {
    await PATCH(
      req({
        method: "PATCH",
        body: { id: NOTE_ID, body: "next secret content", visibility: "shared_with_founder" },
      }),
    );
    const meta = auditCalls[0]!.metadata as Record<string, unknown>;
    expect(meta.visibility_before).toBe("private");
    expect(meta.visibility_after).toBe("shared_with_founder");
    expect(JSON.stringify(meta)).not.toContain("next secret content");
  });

  it("500 audit_failed when auditLog throws after a successful update", async () => {
    auditThrow = new Error("audit-boom");
    const res = await PATCH(req({ method: "PATCH", body: { id: NOTE_ID, body: "next" } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "audit_failed", error: "audit-boom" });
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE — auth + id resolution", () => {
  it("401 when getCurrentUser() returns null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "unauthorised" });
  });

  it("403 with ResellerScopeError.code when scopedReseller throws it", async () => {
    mocks.scopedReseller.mockRejectedValueOnce(new ResellerScopeError("no_reseller"));
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(403);
  });

  it("400 invalid_body when neither body.id nor ?id= is present", async () => {
    const res = await DELETE(
      new Request("http://x/api/mentor/notes", { method: "DELETE" }),
    );
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("resolves id from ?id= query string when body has no id", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await DELETE(
      new Request(`http://x/api/mentor/notes?id=${NOTE_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true, deleted_id: NOTE_ID });
  });

  it("resolves id from body when both body.id and ?id= are present (body wins)", async () => {
    state.lookupRow = {
      id: "body-id",
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await DELETE(
      req({
        method: "DELETE",
        url: `http://x/api/mentor/notes?id=query-id`,
        body: { id: "body-id" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true, deleted_id: "body-id" });
  });
});

describe("DELETE — ownership + persistence", () => {
  it("503 when getSupabaseAdmin() returns null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_configured" });
  });

  it("500 lookup_failed when SELECT errors", async () => {
    state.lookupError = { message: "db-oops" };
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "lookup_failed" });
  });

  it("404 not_found when SELECT returns no row", async () => {
    state.lookupRow = null;
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(404);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_found" });
  });

  it("403 not_owner when the mentor_user_id on the row is a different mentor", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: OTHER_MENTOR,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, reason: "not_owner" });
    expect(state.deletes).toEqual([]);
    expect(auditCalls).toEqual([]);
  });

  it("500 delete_failed with the raw error when DELETE errors", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    state.deleteError = { message: "fk-constraint" };
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "delete_failed", error: "fk-constraint" });
    expect(auditCalls).toEqual([]);
  });

  it("DELETE eqs apply BOTH id AND mentor_user_id (session id) — race guard", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]!.eqs).toEqual(
      expect.arrayContaining([
        { col: "id", val: NOTE_ID },
        { col: "mentor_user_id", val: USER.id },
      ]),
    );
  });

  it("audit fires with mentor_note_delete + note_id + no leaked body content", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior-secret",
      visibility: "shared_with_founder",
    };
    await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.action).toBe("mentor_note_delete");
    expect(auditCalls[0]!.subject_user_id).toBe(SUBJECT);
    const meta = auditCalls[0]!.metadata as Record<string, unknown>;
    expect(meta.note_id).toBe(NOTE_ID);
    expect(JSON.stringify(meta)).not.toContain("prior-secret");
  });

  it("500 audit_failed when auditLog throws after a successful delete", async () => {
    state.lookupRow = {
      id: NOTE_ID,
      mentor_user_id: USER.id,
      subject_user_id: SUBJECT,
      body: "prior",
      visibility: "private",
    };
    auditThrow = new Error("audit-boom");
    const res = await DELETE(req({ method: "DELETE", body: { id: NOTE_ID } }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toMatchObject({ ok: false, reason: "audit_failed" });
  });
});
