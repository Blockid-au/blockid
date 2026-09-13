// Colocated tests for POST /api/dividends/tax-statements/data-room (S28-A):
// editor+ (viewer 403), bad FY 400, no CURRENT statement for the FY → 409,
// files every current statement under the project OWNER's user id with
// stable slugs (re-save replaces), clean pages, save-deliverable error
// codes pass through.

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
const save = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, failAt: -1 }));
vi.mock("@/lib/dataroom/save-deliverable", () => ({
  saveDeliverable: async (input: Record<string, unknown>) => {
    save.calls.push(input);
    if (save.calls.length - 1 === save.failAt) return { ok: false, error: "storage_upload_failed", status: 502 };
    return { ok: true, dataroomFileId: `df-${save.calls.length}`, storagePath: `startup-proj-1/dividends/${input.template_slug}-ts-v1.pdf`, downloadUrl: null };
  },
}));

import { POST, taxStatementTemplateSlug } from "./route";

const row = (id: string, no: string, over: Record<string, unknown> = {}) => ({ id, project_id: "proj-1", user_id: "u", fy: "2025-26", shareholder_id: null, shareholder_key: `k:${id}`, statement_no: no, content_hash: `h-${id}`, totals: SAMPLE_TAX_STATEMENT.totals, payload: SAMPLE_TAX_STATEMENT, credits_charged: 2, version: 1, issued_at: "2026-07-20T02:00:00Z", superseded_at: null, superseded_by: null, ...over });

function seed(rows: Array<Record<string, unknown>> | null = null) {
  db.sb = fakeSupabase({ shareholder_tax_statements: rows ?? [row("t1", "TS-2025-26-1"), row("t0", "TS-2025-26-0", { superseded_at: "2026-07-11T00:00:00Z" })] });
}
const post = (body: unknown = { fy: "2025-26" }) => POST(new Request("http://localhost/api/dividends/tax-statements/data-room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  render.calls = [];
  save.calls = [];
  save.failAt = -1;
});

describe("POST /api/dividends/tax-statements/data-room", () => {
  it("401 / bad fy 400 / viewer 403 / no project 404 / no current statement 409", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await post({ fy: "2025" })).status).toBe(400);
    scopeState.role = "viewer";
    expect((await post()).status).toBe(403);
    scopeState.role = "owner";
    scopeState.projectId = null;
    expect((await post()).status).toBe(404);
    Object.assign(scopeState, makeScopeState());
    seed([row("t0", "TS-2025-26-0", { superseded_at: "2026-07-11T00:00:00Z" })]);
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_statements");
    expect(save.calls).toHaveLength(0);
  });

  it("editor member files every CURRENT statement under the OWNER, clean pages, stable slugs", async () => {
    scopeState.role = "editor";
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, fy: "2025-26" });
    expect(body.statements).toEqual([{ statementNo: "TS-2025-26-1", dataroomFileId: "df-1", storagePath: expect.stringContaining("tax-statement-ts-2025-26-1") }]);
    expect(save.calls).toHaveLength(1);
    expect(save.calls[0]).toMatchObject({ userId: "user-owner", email: "owner@x.test", projectId: "proj-1", mime: "application/pdf", folder: "dividends", svi_dimension: "cgh", template_version: "ts-v1", template_slug: taxStatementTemplateSlug("TS-2025-26-1"), filename: "Annual tax statement 2025-26 TS-2025-26-1 — Jane Founder.pdf" });
    expect(render.calls).toHaveLength(1);
    expect(render.calls[0]).toMatchObject({ contentHash: "h-t1", watermark: null, version: 1 });
  });

  it("save-deliverable failure passes its status through", async () => {
    save.failAt = 0;
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_upload_failed");
  });
});
