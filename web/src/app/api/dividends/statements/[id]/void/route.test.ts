// Colocated tests for POST /api/dividends/statements/[id]/void (S25-B):
// admin+ (editor 403), reason required / max length, another project's id
// 404, one-way (409 on a second call), update contract, summary returned.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { SAMPLE_STATEMENT } from "@/lib/dividends/fixtures";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST, REASON_MAX_LEN } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    project_id: "proj-1",
    user_id: "user-caller",
    dividend_record_id: "11111111-1111-4111-8111-111111111111",
    shareholder_id: null,
    shareholder_key: "name:jane founder",
    statement_no: "DS-7K3MP-Q9X2A",
    content_hash: "blockid:v1:" + "ab".repeat(32),
    payload: SAMPLE_STATEMENT,
    credits_charged: 0,
    issued_at: "2026-07-16T02:00:00.000Z",
    voided_at: null,
    void_reason: null,
    ...over,
  };
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown, id = ID) =>
  POST(new Request(`http://localhost/api/dividends/statements/${id}/void`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ dividend_statements: [row()] });
});

describe("POST /api/dividends/statements/[id]/void", () => {
  it("401 / 404 non-uuid / 400 reason", async () => {
    auth.user = null;
    expect((await post({ reason: "x" })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await post({ reason: "x" }, "nope")).status).toBe(404);
    expect((await post({})).status).toBe(400);
    expect((await post({ reason: "   " })).status).toBe(400);
    expect((await post({ reason: "x".repeat(REASON_MAX_LEN + 1) })).status).toBe(400);
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: "nope" }), ctx())).status).toBe(400);
  });

  it("editor → 403; admin member → allowed; owner → allowed", async () => {
    scopeState.role = "editor";
    expect((await post({ reason: "wrong holding" })).status).toBe(403);
    expect(db.sb!.find("dividend_statements", "update")).toHaveLength(0);

    scopeState.role = "admin";
    const res = await post({ reason: "Wrong holding" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.statement.statementNo).toBe("DS-7K3MP-Q9X2A");
    const upd = db.sb!.find("dividend_statements", "update")[0].args[0] as Record<string, unknown>;
    expect(upd.void_reason).toBe("Wrong holding");
    expect(typeof upd.voided_at).toBe("string");
    expect(db.sb!.hasEq("dividend_statements", "project_id", "proj-1")).toBe(true);
  });

  it("another project's statement → 404; already voided → 409", async () => {
    db.sb = fakeSupabase({ dividend_statements: [row({ project_id: "proj-2" })] });
    expect((await post({ reason: "x" })).status).toBe(404);
    db.sb = fakeSupabase({ dividend_statements: [row({ voided_at: "2026-07-20T00:00:00Z", void_reason: "r" })] });
    const res = await post({ reason: "again" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_voided");
  });
});
