// Unit tests for the project_members scope helpers.
//
// Q4 Multi-project #3 (iteration-13 T4). Covers the happy paths for
// invite/accept/revoke plus the "caller is not the project owner"
// rejection wired through assertProjectOwner.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Chainable Supabase query-builder mock
// ---------------------------------------------------------------------------
//
// The real SupabaseJS client returns `this` from every filter method and
// resolves the terminal promise. Recreating a full fake would be noisy —
// we only need `from().select().eq().maybeSingle()` and
// `from().insert().select().single()` etc. This mock records the last
// `from(table)` and dispatches the terminal method to a per-table handler
// map that each test sets up.

type Handler = () => Promise<{ data: unknown; error: unknown }>;

interface TableHandlers {
  select?: Handler;
  insert?: Handler;
  update?: Handler;
  delete?: Handler;
}

const handlers = new Map<string, TableHandlers>();
const lastInsert = new Map<string, unknown>();
const lastUpdate = new Map<string, unknown>();

function chain(table: string, kind: keyof TableHandlers): any {
  const resolve = () =>
    handlers.get(table)?.[kind]?.() ?? Promise.resolve({ data: null, error: null });
  const proxy: any = {
    select: () => proxy,
    eq: () => proxy,
    is: () => proxy,
    order: () => proxy,
    limit: () => proxy,
    maybeSingle: () => resolve(),
    single: () => resolve(),
    // Thenable — allows `await supabase.from(t).update(x).eq(...)` to
    // hit the terminal without an explicit `.single()`. Mirrors the
    // PostgrestBuilder API.
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  };
  return proxy;
}

const supabaseMock = {
  from(table: string) {
    return {
      select: () => chain(table, "select"),
      insert: (row: unknown) => {
        lastInsert.set(table, row);
        return chain(table, "insert");
      },
      update: (patch: unknown) => {
        lastUpdate.set(table, patch);
        return chain(table, "update");
      },
      delete: () => chain(table, "delete"),
    };
  },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseMock,
}));

import {
  assertProjectOwner,
  listMembers,
  inviteMember,
  acceptInvite,
  revokeMember,
  ProjectMemberScopeError,
} from "./scope";

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function setHandler(
  table: string,
  kind: keyof TableHandlers,
  data: unknown,
  error: unknown = null,
) {
  const existing = handlers.get(table) ?? {};
  existing[kind] = () => Promise.resolve({ data, error });
  handlers.set(table, existing);
}

beforeEach(() => {
  handlers.clear();
  lastInsert.clear();
  lastUpdate.clear();
});

// ---------------------------------------------------------------------------
// assertProjectOwner
// ---------------------------------------------------------------------------

describe("assertProjectOwner", () => {
  it("resolves silently when the caller owns the project", async () => {
    setHandler("projects", "select", { user_id: "u1" });
    await expect(assertProjectOwner("p1", "u1")).resolves.toBeUndefined();
  });

  it("throws not_owner when caller is not the owner", async () => {
    setHandler("projects", "select", { user_id: "other" });
    await expect(assertProjectOwner("p1", "u1")).rejects.toMatchObject({
      code: "not_owner",
    });
  });

  it("throws not_found when the project does not exist", async () => {
    setHandler("projects", "select", null);
    await expect(assertProjectOwner("missing", "u1")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe("inviteMember", () => {
  it("inserts a fresh row with a generated token (happy path)", async () => {
    setHandler("app_users", "select", null); // invitee not yet in DB
    setHandler("project_members", "insert", {
      id: "m1",
      project_id: "p1",
      user_email: "cofounder@example.com",
      user_id: null,
      role: "editor",
      status: "invited",
      invited_by: "u1",
      invited_at: "2026-07-23T00:00:00Z",
      accepted_at: null,
      revoked_at: null,
      token: "TOKEN123",
    });

    const member = await inviteMember(
      "p1",
      "  CoFounder@example.com  ",
      "editor",
      "u1",
    );

    expect(member.userEmail).toBe("cofounder@example.com");
    expect(member.role).toBe("editor");
    expect(member.status).toBe("invited");
    expect(member.token).toBe("TOKEN123");

    const insertRow = lastInsert.get("project_members") as any;
    expect(insertRow.user_email).toBe("cofounder@example.com");
    expect(insertRow.role).toBe("editor");
    expect(insertRow.invited_by).toBe("u1");
    // token is generated inside the helper — assert only shape
    expect(typeof insertRow.token).toBe("string");
    expect(insertRow.token).toHaveLength(64); // 32 bytes hex
  });

  it("pre-fills user_id when the invitee already has an app_users row", async () => {
    setHandler("app_users", "select", { id: "u2" });
    setHandler("project_members", "insert", {
      id: "m1",
      project_id: "p1",
      user_email: "known@example.com",
      user_id: "u2",
      role: "viewer",
      status: "invited",
      invited_by: "u1",
      invited_at: "2026-07-23T00:00:00Z",
      accepted_at: null,
      revoked_at: null,
      token: "TOK",
    });

    await inviteMember("p1", "known@example.com", "viewer", "u1");
    const insertRow = lastInsert.get("project_members") as any;
    expect(insertRow.user_id).toBe("u2");
  });

  it("rejects invalid roles up-front", async () => {
    await expect(
      // @ts-expect-error — intentional bad role
      inviteMember("p1", "x@y.com", "owner", "u1"),
    ).rejects.toMatchObject({ code: "invalid_role" });
  });

  it("surfaces unique_violation as duplicate", async () => {
    setHandler("app_users", "select", null);
    setHandler(
      "project_members",
      "insert",
      null,
      { code: "23505", message: "duplicate key" },
    );

    await expect(
      inviteMember("p1", "dupe@example.com", "viewer", "u1"),
    ).rejects.toMatchObject({ code: "duplicate" });
  });
});

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

describe("acceptInvite", () => {
  it("flips status='invited' → 'accepted' and stamps user_id", async () => {
    setHandler("project_members", "select", {
      id: "m1",
      project_id: "p1",
      status: "invited",
      user_email: "x@y.com",
      role: "viewer",
    });
    setHandler("project_members", "update", {
      id: "m1",
      project_id: "p1",
      user_email: "x@y.com",
      user_id: "u2",
      role: "viewer",
      status: "accepted",
      invited_by: "u1",
      invited_at: "2026-07-23T00:00:00Z",
      accepted_at: "2026-07-23T01:00:00Z",
      revoked_at: null,
      token: "TOK",
    });

    const member = await acceptInvite("TOK", "u2");
    expect(member.status).toBe("accepted");
    expect(member.userId).toBe("u2");

    const patch = lastUpdate.get("project_members") as any;
    expect(patch.status).toBe("accepted");
    expect(patch.user_id).toBe("u2");
    expect(typeof patch.accepted_at).toBe("string");
  });

  it("rejects an unknown token", async () => {
    setHandler("project_members", "select", null);
    await expect(acceptInvite("nope", "u2")).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects an already-accepted invite", async () => {
    setHandler("project_members", "select", { id: "m1", status: "accepted" });
    await expect(acceptInvite("TOK", "u2")).rejects.toMatchObject({
      code: "already_accepted",
    });
  });

  it("rejects a revoked invite", async () => {
    setHandler("project_members", "select", { id: "m1", status: "revoked" });
    await expect(acceptInvite("TOK", "u2")).rejects.toMatchObject({
      code: "revoked",
    });
  });
});

// ---------------------------------------------------------------------------
// revokeMember
// ---------------------------------------------------------------------------

describe("revokeMember", () => {
  it("owner can revoke — sets status='revoked' + revoked_at", async () => {
    // First .select() is the member row read; then assertProjectOwner reads
    // projects; then the update happens. Our mock stores one handler per
    // (table, kind), so both selects (member + project) resolve through
    // separate tables which is what happens in real code.
    setHandler("project_members", "select", {
      id: "m1",
      project_id: "p1",
      status: "invited",
    });
    setHandler("projects", "select", { user_id: "u1" });
    setHandler("project_members", "update", {
      id: "m1",
      project_id: "p1",
      user_email: "x@y.com",
      user_id: null,
      role: "viewer",
      status: "revoked",
      invited_by: "u1",
      invited_at: "2026-07-23T00:00:00Z",
      accepted_at: null,
      revoked_at: "2026-07-23T02:00:00Z",
      token: "TOK",
    });

    const member = await revokeMember("m1", "u1");
    expect(member.status).toBe("revoked");
    expect(member.revokedAt).toBeTruthy();

    const patch = lastUpdate.get("project_members") as any;
    expect(patch.status).toBe("revoked");
    expect(typeof patch.revoked_at).toBe("string");
  });

  it("non-owner is rejected with not_owner (via assertProjectOwner)", async () => {
    setHandler("project_members", "select", {
      id: "m1",
      project_id: "p1",
      status: "invited",
    });
    setHandler("projects", "select", { user_id: "u1" });

    await expect(revokeMember("m1", "someone-else")).rejects.toBeInstanceOf(
      ProjectMemberScopeError,
    );
    await expect(revokeMember("m1", "someone-else")).rejects.toMatchObject({
      code: "not_owner",
    });
  });

  it("returns the existing row idempotently when already revoked", async () => {
    setHandler("project_members", "select", {
      id: "m1",
      project_id: "p1",
      user_email: "x@y.com",
      user_id: null,
      role: "viewer",
      status: "revoked",
      invited_by: "u1",
      invited_at: "2026-07-23T00:00:00Z",
      accepted_at: null,
      revoked_at: "2026-07-20T00:00:00Z",
      token: "TOK",
    });
    setHandler("projects", "select", { user_id: "u1" });

    const member = await revokeMember("m1", "u1");
    expect(member.status).toBe("revoked");
    // No second update should have happened.
    expect(lastUpdate.get("project_members")).toBeUndefined();
  });

  it("throws not_found for a bogus memberId", async () => {
    setHandler("project_members", "select", null);
    await expect(revokeMember("bogus", "u1")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

describe("listMembers", () => {
  it("maps rows through the row→ProjectMember mapper", async () => {
    setHandler("project_members", "select", [
      {
        id: "m1",
        project_id: "p1",
        user_email: "a@x.com",
        user_id: null,
        role: "viewer",
        status: "invited",
        invited_by: "u1",
        invited_at: "2026-07-23T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
        token: "T1",
      },
      {
        id: "m2",
        project_id: "p1",
        user_email: "b@x.com",
        user_id: "u2",
        role: "admin",
        status: "accepted",
        invited_by: "u1",
        invited_at: "2026-07-22T00:00:00Z",
        accepted_at: "2026-07-22T01:00:00Z",
        revoked_at: null,
        token: "T2",
      },
    ]);

    const rows = await listMembers("p1");
    expect(rows).toHaveLength(2);
    expect(rows[0].userEmail).toBe("a@x.com");
    expect(rows[0].status).toBe("invited");
    expect(rows[1].role).toBe("admin");
    expect(rows[1].acceptedAt).toBe("2026-07-22T01:00:00Z");
  });
});
