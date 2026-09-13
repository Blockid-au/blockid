// Colocated tests for GET /api/dividends/statements (S25-B) — the panel's
// read: records of the active project (other projects' stamped rows
// excluded) with their statements grouped, role, listed cost, included flag.

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
const gate = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/dividends/gate", () => ({ statementsIncluded: async () => ({ included: gate.included, via: gate.included ? "growth" : null }) }));

import { GET } from "./route";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  gate.included = false;
  db.sb = fakeSupabase({
    dividend_records: [
      { id: R1, account_id: "user-caller", project_id: "proj-1", period: "2026-06", total_dividend: 50_000, per_share_dividend: 0.05, franking_rate: 0.25, payouts: [{ name: "A", grossDividend: 1 }], created_at: "2026-07-01T00:00:00Z" },
      { id: R2, account_id: "user-caller", project_id: "proj-2", period: "2026-05", total_dividend: 1, payouts: [], created_at: "2026-06-01T00:00:00Z" },
    ],
    dividend_statements: [
      { id: "s1", project_id: "proj-1", dividend_record_id: R1, statement_no: "DS-7K3MP-Q9X2A", content_hash: "h", payload: SAMPLE_STATEMENT, credits_charged: 2, issued_at: "2026-07-16T02:00:00Z", voided_at: null, void_reason: null },
    ],
  });
});

describe("GET /api/dividends/statements", () => {
  it("401 without a session; empty list without a project", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    scopeState.projectId = null;
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, records: [], role: null, cost: 2, included: false });
  });

  it("lists the project's records with grouped statements, role, cost and included", async () => {
    scopeState.role = "editor";
    db.sb!.rows.dividend_records[0].account_id = "user-owner";
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("editor");
    expect(body.cost).toBe(2);
    expect(body.included).toBe(false);
    expect(body.records.map((r: { id: string }) => r.id)).toEqual([R1]); // proj-2 row excluded
    expect(body.records[0].registerUrl).toBe(`/api/dividends/${R1}/register.pdf`);
    expect(body.records[0].payoutCount).toBe(1);
    expect(body.records[0].statements).toHaveLength(1);
    expect(body.records[0].statements[0]).toMatchObject({ id: "s1", statementNo: "DS-7K3MP-Q9X2A", shareholderName: "Jane Founder", grossAud: 30_000, pdfUrl: "/api/dividends/statements/s1/pdf" });
    expect(db.sb!.hasEq("dividend_records", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("dividend_statements", "project_id", "proj-1")).toBe(true);
  });

  it("reports included for Growth+ / add-on holders", async () => {
    gate.included = true;
    const body = await (await GET()).json();
    expect(body.included).toBe(true);
    expect(body.includedVia).toBe("growth");
  });
});
