// Colocated tests for POST/GET /api/valuation/clevel — S18-A member access.
//
// POST inserts a valuation snapshot on the project's svi_accounts row, so it
// is editor+. GET (S18-A review P2-5) is a viewer+ READ-ONLY compute — same
// numbers, no snapshot insert — so a viewer can see the valuation. The
// record is the OWNER's on a shared project either way.
//
// IDOR fix pinned here: `body.email` used to be honoured as the lookup key,
// letting ANY signed-in user read another founder's SVI record and write a
// snapshot on it. The key is now always `scope.dataEmail` (or the caller's
// own email with no project) — `body.email` is ignored.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState, keyCalls } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user, ADMIN_EMAIL: "admin@x.test" }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST, GET } from "./route";
import type { NextRequest } from "next/server";

function post(body: Record<string, unknown> = {}) {
  return new Request("http://x/api/valuation/clevel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", startup_name: "Acme", sector: "SaaS" } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({
    svi_analyses: [{ svi_score: 130, stage: 3, dimensions: { ftv: 60 } }],
    startup_metrics: [{ mrr: 5000, burn_rate: 2000, runway_months: 18, total_customers: 40 }],
    svi_snapshots: [],
  });
}

beforeEach(reset);

describeMemberAccess("POST /api/valuation/clevel", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(post()),
  expectKeyFns: ["findSVIAccountWithFallback"],
  onMemberOk: (_res, body) => {
    expect((body as { ok: boolean }).ok).toBe(true);
  },
});

describe("POST /api/valuation/clevel — body.email override removed", () => {
  it("owner: body.email is ignored — the caller's own record is used", async () => {
    const res = await POST(post({ email: "victim@x.test" }));
    expect(res.status).toBe(200);
    const calls = keyCalls(scopeState, "findSVIAccountWithFallback");
    expect(calls).toHaveLength(1);
    expect(calls[0].email).toBe("caller@x.test");
    expect(calls[0].projectId).toBe("proj-1");
    // snapshot lands on the caller's project account, never the victim's
    const inserts = db.sb!.find("svi_snapshots", "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].args[0] as { account_id: string }).account_id).toBe("acct-1");
    expect(JSON.stringify(scopeState.calls)).not.toContain("victim@x.test");
    expect(JSON.stringify(db.sb!.calls)).not.toContain("victim@x.test");
  });

  it("editor on a shared project: body.email ignored — the OWNER's record is used, fallback bound to caller", async () => {
    scopeState.role = "editor";
    const res = await POST(post({ email: "victim@x.test" }));
    expect(res.status).toBe(200);
    const [call] = keyCalls(scopeState, "findSVIAccountWithFallback");
    expect(call.email).toBe("owner@x.test");
    expect((call.opts as { callerEmail?: string }).callerEmail).toBe("caller@x.test");
    expect(JSON.stringify(scopeState.calls)).not.toContain("victim@x.test");
  });

  it("no project: body.email ignored — the caller's own legacy record is used", async () => {
    scopeState.projectId = null;
    const res = await POST(post({ email: "victim@x.test" }));
    expect(res.status).toBe(200);
    const [call] = keyCalls(scopeState, "findSVIAccountWithFallback");
    expect(call.email).toBe("caller@x.test");
    expect(call.projectId).toBeNull();
  });

  it("viewer: POST → 403 before any read or snapshot insert", async () => {
    scopeState.role = "viewer";
    const res = await POST(post({ email: "victim@x.test" }));
    expect(res.status).toBe(403);
    expect(keyCalls(scopeState, "findSVIAccountWithFallback")).toEqual([]);
    expect(db.sb!.calls).toEqual([]);
  });

  it("401 when unauthenticated", async () => {
    auth.user = null;
    expect((await POST(post())).status).toBe(401);
  });
});

// S18-A review P2-5 — GET is a viewer+ read-only compute.
function get() {
  return new Request("http://x/api/valuation/clevel", { method: "GET" }) as unknown as NextRequest;
}

describeMemberAccess("GET /api/valuation/clevel", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(get()),
  expectKeyFns: ["findSVIAccountWithFallback"],
});

describe("GET /api/valuation/clevel — viewer read-only compute (S18-A P2-5)", () => {
  it("viewer on a shared project: 200 with the valuation, computed on the OWNER's record, NO svi_snapshots insert", async () => {
    scopeState.role = "viewer";
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; valuation: unknown; persisted: boolean };
    expect(body.ok).toBe(true);
    expect(body.valuation).toBeTruthy();
    expect(body.persisted).toBe(false);
    const [call] = keyCalls(scopeState, "findSVIAccountWithFallback");
    expect(call.email).toBe("owner@x.test");
    expect(call.projectId).toBe("proj-1");
    expect(call.opts).toEqual({ callerEmail: "caller@x.test" });
    expect(db.sb!.find("svi_snapshots", "insert")).toEqual([]);
    expect(scopeState.lastMinRole).toBe("viewer");
  });

  it("owner: GET never inserts a snapshot either (reads svi_analyses + startup_metrics only)", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(db.sb!.find("svi_snapshots", "insert")).toEqual([]);
    expect(db.sb!.calls.some((c) => c.table === "svi_analyses")).toBe(true);
    expect(db.sb!.calls.some((c) => c.table === "startup_metrics")).toBe(true);
  });

  it("POST (editor) still inserts the snapshot — the write path is unchanged", async () => {
    scopeState.role = "editor";
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(db.sb!.find("svi_snapshots", "insert")).toHaveLength(1);
    expect(scopeState.lastMinRole).toBe("editor");
  });

  it("GET 401 when unauthenticated; 503 without a DB", async () => {
    auth.user = null;
    expect((await GET(get())).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test" };
    db.sb = null;
    expect((await GET(get())).status).toBe(503);
  });
});
