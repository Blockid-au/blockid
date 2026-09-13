// Colocated tests for GET /api/dividends/[recordId]/register.pdf (S25-B):
// auth, viewer allowed, another project's record 404, the register is built
// from the frozen statements (live + voided) with the founder's entity, the
// watermark header on `?for=`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { SAMPLE_STATEMENT, SAMPLE_STATEMENT_WITHHELD } from "@/lib/dividends/fixtures";
import type { DividendRegisterPayload } from "@/lib/dividends/statement";

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

const render = vi.hoisted(() => ({ calls: [] as Array<{ data: DividendRegisterPayload; watermark: string | null }> }));
vi.mock("@/lib/pdf/dividend-register-pdf", () => ({
  renderDividendRegisterPdf: async (props: { data: DividendRegisterPayload; watermark: string | null }) => {
    render.calls.push(props);
    return Buffer.from("%PDF-1.4 fake");
  },
}));

import { GET } from "./route";

const REC = "11111111-1111-4111-8111-111111111111";

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    dividend_records: [
      { id: REC, account_id: "user-caller", project_id: "proj-1", period: "2026-06", net_income: 100_000, distribution_pct: 50, total_dividend: 50_000, per_share_dividend: 0.05, franking_rate: 0.25, franking_pct: 100, tfn_withholding_rate: 0, paid_at: "2026-07-15", payouts: [], created_at: "2026-07-01T00:00:00.000Z" },
    ],
    project_grant_profiles: [{ abn: "12345678901", acn: "123456789" }],
    dividend_statements: [
      { id: "s1", project_id: "proj-1", dividend_record_id: REC, statement_no: "DS-7K3MP-Q9X2A", content_hash: "h", payload: SAMPLE_STATEMENT, issued_at: "2026-07-16T02:00:00Z", voided_at: null, void_reason: null },
      { id: "s2", project_id: "proj-1", dividend_record_id: REC, statement_no: "DS-ABCDE-FGHJK", content_hash: "h", payload: SAMPLE_STATEMENT_WITHHELD, issued_at: "2026-07-16T02:00:00Z", voided_at: "2026-07-20T00:00:00Z", void_reason: "dup" },
    ],
    ...over,
  });
}

const ctx = (recordId = REC) => ({ params: Promise.resolve({ recordId }) });
const get = (url = `http://localhost/api/dividends/${REC}/register.pdf`, id = REC) => GET(new Request(url) as never, ctx(id));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  render.calls = [];
});

describe("GET /api/dividends/[recordId]/register.pdf", () => {
  it("401 / non-uuid 404 / non-member 404 / other project's record 404", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await get("http://localhost/x", "nope")).status).toBe(404);
    scopeState.nonMember = true;
    expect((await get()).status).toBe(404);
    scopeState.nonMember = false;
    seed({ dividend_records: [{ id: REC, account_id: "user-caller", project_id: "proj-2", period: "2026-06", payouts: [], created_at: "2026-07-01T00:00:00Z", total_dividend: 1 }] });
    expect((await get()).status).toBe(404);
    expect(render.calls).toHaveLength(0);
  });

  it("viewer downloads the register built from live + voided statements with the founder's entity", async () => {
    scopeState.role = "viewer";
    seed({ dividend_records: [{ id: REC, account_id: "user-owner", project_id: "proj-1", period: "2026-06", total_dividend: 50_000, per_share_dividend: 0.05, franking_rate: 0.25, franking_pct: 100, payouts: [], created_at: "2026-07-01T00:00:00Z" }] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("dividend-register-2026-06.pdf");
    expect(res.headers.get("x-blockid-register-statements")).toBe("1");
    const { data, watermark } = render.calls[0];
    expect(watermark).toBeNull();
    expect(data.entity).toEqual({ name: "P", abn: "12 345 678 901", acn: "123 456 789", address: null, isBaseRateEntity: true });
    expect(data.rows.map((r) => [r.statementNo, r.status])).toEqual([["DS-7K3MP-Q9X2A", "issued"], ["DS-ABCDE-FGHJK", "voided"]]);
    expect(data.totals.statementsIssued).toBe(1);
    expect(data.totals.grossAud).toBe(30_000);
    expect(data.reconciled).toBe(false);
    expect(JSON.stringify(data.entity)).not.toMatch(/Auschain/);
  });

  it("?for= burns the watermark", async () => {
    const res = await get(`http://localhost/api/dividends/${REC}/register.pdf?for=accountant%40firm.test`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-blockid-watermark")).toBe("1");
    expect(render.calls[0].watermark).toMatch(/^Prepared for accountant@firm\.test · /);
  });
});
