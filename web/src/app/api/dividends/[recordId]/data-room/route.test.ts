// Colocated tests for POST /api/dividends/[recordId]/data-room (S25-B):
// editor+ (viewer 403), no live statements → 409, files the register +
// every LIVE statement under the project OWNER's user id with stable slugs
// (re-save replaces), clean pages (no watermark), save-deliverable error
// codes pass through.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { SAMPLE_STATEMENT, SAMPLE_STATEMENT_WITHHELD } from "@/lib/dividends/fixtures";

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

const render = vi.hoisted(() => ({ statements: [] as unknown[], registers: [] as unknown[] }));
vi.mock("@/lib/pdf/dividend-statement-pdf", () => ({
  renderDividendStatementPdf: async (props: unknown) => {
    render.statements.push(props);
    return Buffer.from("%PDF-1.4 statement");
  },
}));
vi.mock("@/lib/pdf/dividend-register-pdf", () => ({
  renderDividendRegisterPdf: async (props: unknown) => {
    render.registers.push(props);
    return Buffer.from("%PDF-1.4 register");
  },
}));

const save = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, failAt: -1 }));
vi.mock("@/lib/dataroom/save-deliverable", () => ({
  saveDeliverable: async (input: Record<string, unknown>) => {
    save.calls.push(input);
    if (save.calls.length - 1 === save.failAt) return { ok: false, error: "storage_upload_failed", status: 502 };
    return { ok: true, dataroomFileId: `df-${save.calls.length}`, storagePath: `startup-proj-1/dividends/${input.template_slug}-ds-v1.pdf`, downloadUrl: null };
  },
}));

import { POST, registerTemplateSlug, statementTemplateSlug } from "./route";

const REC = "11111111-1111-4111-8111-111111111111";

function seed(statements: Array<Record<string, unknown>> | null = null) {
  db.sb = fakeSupabase({
    dividend_records: [{ id: REC, account_id: "user-caller", project_id: "proj-1", period: "2026-06", total_dividend: 50_000, per_share_dividend: 0.05, franking_rate: 0.25, franking_pct: 100, payouts: [], created_at: "2026-07-01T00:00:00Z" }],
    project_grant_profiles: [],
    dividend_statements: statements ?? [
      { id: "s1", project_id: "proj-1", dividend_record_id: REC, statement_no: "DS-7K3MP-Q9X2A", content_hash: "h1", payload: SAMPLE_STATEMENT, issued_at: "2026-07-16T02:00:00Z", voided_at: null, void_reason: null },
      { id: "s2", project_id: "proj-1", dividend_record_id: REC, statement_no: "DS-ABCDE-FGHJK", content_hash: "h2", payload: SAMPLE_STATEMENT_WITHHELD, issued_at: "2026-07-16T02:00:00Z", voided_at: "2026-07-20T00:00:00Z", void_reason: "dup" },
    ],
  });
}

const ctx = (recordId = REC) => ({ params: Promise.resolve({ recordId }) });
const post = (id = REC) => POST(new Request(`http://localhost/api/dividends/${id}/data-room`, { method: "POST" }), ctx(id));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  render.statements = [];
  render.registers = [];
  save.calls = [];
  save.failAt = -1;
});

describe("POST /api/dividends/[recordId]/data-room", () => {
  it("401 / non-uuid 404 / viewer 403 / no project 404", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await post("nope")).status).toBe(404);
    scopeState.role = "viewer";
    expect((await post()).status).toBe(403);
    scopeState.role = "owner";
    scopeState.projectId = null;
    expect((await post()).status).toBe(404);
    expect(save.calls).toHaveLength(0);
  });

  it("409 when no live statement exists (voided only or none)", async () => {
    seed([]);
    expect((await post()).status).toBe(409);
    seed([{ id: "s2", project_id: "proj-1", dividend_record_id: REC, statement_no: "DS-ABCDE-FGHJK", content_hash: "h2", payload: SAMPLE_STATEMENT_WITHHELD, issued_at: "x", voided_at: "2026-07-20T00:00:00Z", void_reason: "dup" }]);
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_statements");
  });

  it("editor member files the register + each live statement under the OWNER, clean pages, stable slugs", async () => {
    scopeState.role = "editor";
    db.sb!.rows.dividend_records[0].account_id = "user-owner";
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.register.dataroomFileId).toBe("df-1");
    expect(body.statements).toEqual([{ statementNo: "DS-7K3MP-Q9X2A", dataroomFileId: "df-2", storagePath: expect.stringContaining("dividend-statement-ds-7k3mp-q9x2a") }]);

    expect(save.calls).toHaveLength(2);
    for (const c of save.calls) {
      expect(c.userId).toBe("user-owner");
      expect(c.email).toBe("owner@x.test");
      expect(c.projectId).toBe("proj-1");
      expect(c.mime).toBe("application/pdf");
      expect(c.folder).toBe("dividends");
      expect(c.svi_dimension).toBe("cgh");
      expect(c.template_version).toBe("ds-v1");
    }
    expect(save.calls[0].template_slug).toBe(registerTemplateSlug(REC));
    expect(save.calls[0].filename).toBe("Dividend register 2026-06.pdf");
    expect(save.calls[1].template_slug).toBe(statementTemplateSlug("DS-7K3MP-Q9X2A"));
    expect(save.calls[1].filename).toBe("Dividend statement DS-7K3MP-Q9X2A — Jane Founder.pdf");

    // Clean pages; the voided statement is never rendered as a statement PDF.
    expect(render.registers).toHaveLength(1);
    expect(render.statements).toHaveLength(1);
    expect(render.statements[0]).toMatchObject({ contentHash: "h1", watermark: null });
    expect((render.registers[0] as { data: { rows: unknown[] } }).data.rows).toHaveLength(2);
  });

  it("save-deliverable failure passes its status through", async () => {
    save.failAt = 0;
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_upload_failed");
  });
});
