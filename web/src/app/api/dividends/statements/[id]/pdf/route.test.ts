// Colocated tests for GET /api/dividends/statements/[id]/pdf (S25-B):
// auth, non-uuid 404, viewer allowed, non-member 404, another project's
// statement 404 (never 403), renders from the frozen payload with the
// content hash + statement number headers, `?for=` watermark header, voided
// header.

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

const render = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/pdf/dividend-statement-pdf", () => ({
  renderDividendStatementPdf: async (props: unknown) => {
    render.calls.push(props);
    return Buffer.from("%PDF-1.4 fake");
  },
}));

import { GET } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";
const HASH = "blockid:v1:" + "ab".repeat(32);

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    project_id: "proj-1",
    user_id: "user-caller",
    dividend_record_id: "11111111-1111-4111-8111-111111111111",
    shareholder_id: null,
    shareholder_key: "name:jane founder",
    statement_no: "DS-7K3MP-Q9X2A",
    content_hash: HASH,
    payload: SAMPLE_STATEMENT,
    credits_charged: 0,
    issued_at: "2026-07-16T02:00:00.000Z",
    voided_at: null,
    void_reason: null,
    ...over,
  };
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const get = (url = `http://localhost/api/dividends/statements/${ID}/pdf`, id = ID) => GET(new Request(url) as never, ctx(id));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ dividend_statements: [row()] });
  render.calls = [];
});

describe("GET /api/dividends/statements/[id]/pdf", () => {
  it("401 without a session; 404 for a non-uuid; 404 non-member; 404 no project", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await get("http://localhost/x", "nope")).status).toBe(404);
    scopeState.nonMember = true;
    expect((await get()).status).toBe(404);
    scopeState.nonMember = false;
    scopeState.projectId = null;
    expect((await get()).status).toBe(404);
  });

  it("viewer downloads the PDF rendered from the frozen payload; headers carry the statement number", async () => {
    scopeState.role = "viewer";
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("dividend-statement-DS-7K3MP-Q9X2A.pdf");
    expect(res.headers.get("x-blockid-statement")).toBe("DS-7K3MP-Q9X2A");
    expect(res.headers.get("x-blockid-watermark")).toBeNull();
    expect(res.headers.get("x-blockid-statement-voided")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]).toMatchObject({ data: SAMPLE_STATEMENT, contentHash: HASH, watermark: null, voidedAt: null });
    expect(db.sb!.hasEq("dividend_statements", "project_id", "proj-1")).toBe(true);
  });

  it("another project's statement → 404, never rendered", async () => {
    db.sb = fakeSupabase({ dividend_statements: [row({ project_id: "proj-2" })] });
    expect((await get()).status).toBe(404);
    expect(render.calls).toHaveLength(0);
  });

  it("?for= burns the watermark; a voided statement still renders with the voided header", async () => {
    db.sb = fakeSupabase({ dividend_statements: [row({ voided_at: "2026-07-20T00:00:00Z", void_reason: "wrong holding" })] });
    const res = await get(`http://localhost/api/dividends/statements/${ID}/pdf?for=Jane%20Founder`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-watermark")).toBe("1");
    expect(res.headers.get("x-blockid-statement-voided")).toBe("1");
    expect(render.calls[0]).toMatchObject({ voidedAt: "2026-07-20T00:00:00Z", voidReason: "wrong holding" });
    expect((render.calls[0] as { watermark: string }).watermark).toMatch(/^Prepared for Jane Founder · /);
  });
});
