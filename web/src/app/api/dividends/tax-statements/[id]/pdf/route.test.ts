// Colocated tests for GET /api/dividends/tax-statements/[id]/pdf (S28-A):
// 401 / non-uuid 404 / no project 404 / non-member 404 / another project's
// row 404; viewer+ gets the PDF rendered from the FROZEN payload with the
// statement headers; `?for=` burns the watermark; a superseded version
// still renders with the SUPERSEDED header.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { SAMPLE_TAX_STATEMENT } from "@/lib/dividends/fixtures";

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
vi.mock("@/lib/pdf/shareholder-tax-statement-pdf", () => ({
  renderShareholderTaxStatementPdf: async (props: unknown) => {
    render.calls.push(props);
    return Buffer.from("%PDF-1.4 tax");
  },
}));

import { GET } from "./route";
import type { NextRequest } from "next/server";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (over: Record<string, unknown> = {}) => ({ id: ID, project_id: "proj-1", user_id: "u", fy: "2025-26", shareholder_id: null, shareholder_key: "id:x", statement_no: "TS-2025-26-1", content_hash: "blockid:v1:" + "0".repeat(64), totals: SAMPLE_TAX_STATEMENT.totals, payload: SAMPLE_TAX_STATEMENT, credits_charged: 2, version: 2, issued_at: "2026-07-20T02:00:00Z", superseded_at: null, superseded_by: null, ...over });

const get = (id = ID, qs = "") => GET(new Request(`http://localhost/api/dividends/tax-statements/${id}/pdf${qs}`) as unknown as NextRequest, { params: Promise.resolve({ id }) });

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ shareholder_tax_statements: [row()] });
  render.calls = [];
});

describe("GET /api/dividends/tax-statements/[id]/pdf", () => {
  it("401 / non-uuid 404 / no project 404 / non-member 404 / another project's row 404", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await get("nope")).status).toBe(404);
    scopeState.projectId = null;
    expect((await get()).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ nonMember: true }));
    expect((await get()).status).toBe(404);
    Object.assign(scopeState, makeScopeState());
    db.sb = fakeSupabase({ shareholder_tax_statements: [row({ project_id: "proj-2" })] });
    expect((await get()).status).toBe(404);
    expect(render.calls).toHaveLength(0);
  });

  it("viewer gets the PDF from the frozen payload with the statement headers; ?for= burns the watermark", async () => {
    scopeState.role = "viewer";
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("annual-tax-statement-TS-2025-26-1.pdf");
    expect(res.headers.get("x-blockid-statement")).toBe("TS-2025-26-1");
    expect(res.headers.get("x-blockid-watermark")).toBeNull();
    expect(res.headers.get("x-blockid-statement-superseded")).toBeNull();
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect(render.calls[0]).toMatchObject({ data: SAMPLE_TAX_STATEMENT, contentHash: "blockid:v1:" + "0".repeat(64), watermark: null, version: 2, supersededAt: null });

    const wm = await get(ID, "?for=Jane%27s%20accountant");
    expect(wm.headers.get("x-blockid-watermark")).toBe("1");
    expect((render.calls[1] as { watermark: string }).watermark).toContain("Prepared for Jane's accountant");
  });

  it("a superseded version still renders, flagged", async () => {
    db.sb = fakeSupabase({ shareholder_tax_statements: [row({ superseded_at: "2026-08-01T00:00:00Z" })] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-statement-superseded")).toBe("1");
    expect(render.calls[0]).toMatchObject({ supersededAt: "2026-08-01T00:00:00Z" });
  });
});
