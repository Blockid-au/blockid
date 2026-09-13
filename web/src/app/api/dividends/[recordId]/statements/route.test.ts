// Colocated tests for /api/dividends/[recordId]/statements (S25-B).
//
//   POST — cost preview first (`confirm` absent → 200 preview, no spend, no
//          insert), confirm → spend 2 credits then insert one statement per
//          paying shareholder; equity add-on / Growth+ → included (cost 0,
//          no spend); idempotent (second call inserts nothing and charges
//          nothing); editor allowed, viewer 403, no project 404, another
//          project's record 404, non-uuid 404; no payouts → 409;
//          insufficient credits → 402 before preview; total insert failure
//          after a spend → refund.
//   GET  — viewer+ statements + register for the record.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

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

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn(), grantCredits: vi.fn() }));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return {
    FEATURE_COSTS: real.FEATURE_COSTS,
    canAfford: (...a: unknown[]) => credits.canAfford(...a),
    spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
    grantCredits: (...a: unknown[]) => credits.grantCredits(...a),
  };
});

const gate = vi.hoisted(() => ({ included: false, via: null as "addon" | "growth" | null }));
vi.mock("@/lib/dividends/gate", () => ({ statementsIncluded: async () => ({ included: gate.included, via: gate.via }) }));

const issue = vi.hoisted(() => ({ failAll: false }));
vi.mock("@/lib/dividends/server", async () => {
  const real = await vi.importActual<typeof import("@/lib/dividends/server")>("@/lib/dividends/server");
  return {
    ...real,
    issueStatementsForRecord: async (input: Parameters<typeof real.issueStatementsForRecord>[0]) =>
      issue.failAll ? { ok: true, issued: [], existing: [], failed: ["Jane Founder", "Seed Investor Pty Ltd"] } : real.issueStatementsForRecord(input),
  };
});

import { GET, POST } from "./route";

const REC = "11111111-1111-4111-8111-111111111111";
const PAYOUTS = [
  { name: "Jane Founder", role: "founder", shares: 600_000, ownershipPct: 60, grossDividend: 30_000, frankingCredit: 10_000, netDividend: 30_000 },
  { name: "Seed Investor Pty Ltd", role: "investor", shares: 400_000, ownershipPct: 40, grossDividend: 20_000, frankingCredit: 6_666.67, netDividend: 20_000 },
];

function record(over: Record<string, unknown> = {}) {
  return {
    id: REC,
    account_id: "user-caller",
    project_id: "proj-1",
    period: "2026-06",
    net_income: 100_000,
    distribution_pct: 50,
    total_dividend: 50_000,
    per_share_dividend: 0.05,
    retained_earnings: 50_000,
    franking_rate: 0.25,
    franking_pct: 100,
    tfn_withholding_rate: 0,
    paid_at: "2026-07-15",
    payouts: PAYOUTS,
    created_at: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    dividend_records: [record()],
    shareholders: [
      { id: "22222222-2222-4222-8222-222222222222", account_id: "user-caller", project_id: "proj-1", name: "Jane Founder", role: "founder", shares_held: 600_000, tfn_on_file: true, share_class_id: null },
      { id: "33333333-3333-4333-8333-333333333333", account_id: "user-caller", project_id: null, name: "Seed Investor Pty Ltd", role: "investor", shares_held: 400_000, tfn_on_file: false, share_class_id: null },
    ],
    share_classes: [],
    project_grant_profiles: [{ abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }],
    dividend_statements: [],
    ...over,
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  gate.included = false;
  gate.via = null;
  issue.failAll = false;
}

const ctx = (recordId = REC) => ({ params: Promise.resolve({ recordId }) });
function post(body: unknown = {}, recordId = REC) {
  return POST(new Request(`http://localhost/api/dividends/${recordId}/statements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(recordId));
}

beforeEach(reset);

describe("POST /api/dividends/[recordId]/statements — gate", () => {
  it("401 without a session; 404 for a non-uuid id", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    reset();
    expect((await post({}, "nope")).status).toBe(404);
  });

  it("viewer → 403; no project → 404; non-member → 404; another project's record → 404", async () => {
    scopeState.role = "viewer";
    expect((await post()).status).toBe(403);
    reset();
    scopeState.projectId = null;
    expect((await post()).status).toBe(404);
    reset();
    scopeState.nonMember = true;
    expect((await post()).status).toBe(404);
    reset();
    seed({ dividend_records: [record({ project_id: "proj-9" })] });
    expect((await post()).status).toBe(404);
  });

  it("editor member is allowed and the record is read under the OWNER's account id", async () => {
    scopeState.role = "editor";
    seed({ dividend_records: [record({ account_id: "user-owner" })] });
    const res = await post();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("dividend_records", "account_id", "user-owner")).toBe(true);
    expect((await res.json()).creditNote).toBe("Charged to your own credits — not the project owner's.");
  });

  it("409 when the record has no paying shareholders", async () => {
    seed({ dividend_records: [record({ payouts: [] })] });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_payouts");
  });
});

describe("POST — cost preview / confirm", () => {
  it("previews the 2-credit cost, lists who will get a statement, spends nothing and inserts nothing", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.cost).toBe(2);
    expect(body.listedCost).toBe(2);
    expect(body.included).toBe(false);
    expect(body.balance).toBe(10);
    expect(body.toIssue).toEqual(["Jane Founder", "Seed Investor Pty Ltd"]);
    expect(body.alreadyIssued).toBe(0);
    expect(body.company).toEqual({ name: "P", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" });
    expect(body.record.totalDividendAud).toBe(50_000);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("dividend_statements", "insert")).toHaveLength(0);
  });

  it("402 before the preview when the caller cannot afford it", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 1, reason: "insufficient_credits" });
    const res = await post({});
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_credits");
    expect(body.creditsRequired).toBe(2);
  });

  it("confirm → spends 2 credits FIRST, then inserts one statement per paying shareholder", async () => {
    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.creditsCharged).toBe(2);
    expect(body.balance).toBe(8);
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "dividend_statements", { project_id: "proj-1", dividend_record_id: REC });
    const inserts = db.sb!.find("dividend_statements", "insert");
    expect(inserts).toHaveLength(2);
    const first = inserts[0].args[0] as Record<string, unknown>;
    expect(first.credits_charged).toBe(2);
    expect(first.user_id).toBe("user-caller");
    expect(first.shareholder_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(body.issued).toHaveLength(2);
    expect(body.issued[0].shareholderName).toBe("Jane Founder");
    expect(body.issued[0].grossAud).toBe(30_000);
    expect(body.issued[0].frankingCreditAud).toBe(10_000);
    expect(body.issued[0].pdfUrl).toMatch(/^\/api\/dividends\/statements\/.+\/pdf$/);
    expect(body.existing).toEqual([]);
    expect(body.failed).toEqual([]);
    expect(body.register.entity.name).toBe("P");
  });

  it("equity add-on: included → cost 0, no canAfford / spend, statements still issued", async () => {
    gate.included = true;
    gate.via = "addon";
    const preview = await (await post({})).json();
    expect(preview.cost).toBe(0);
    expect(preview.included).toBe(true);
    expect(preview.includedVia).toBe("addon");
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ confirm: true })).json();
    expect(body.creditsCharged).toBe(0);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("dividend_statements", "insert")).toHaveLength(2);
    expect((db.sb!.find("dividend_statements", "insert")[0].args[0] as { credits_charged: number }).credits_charged).toBe(0);
  });

  it("idempotent: with every shareholder already issued, the preview costs 0 and confirm inserts + charges nothing", async () => {
    const live = (key: string, id: string) => ({
      id,
      project_id: "proj-1",
      user_id: "user-caller",
      dividend_record_id: REC,
      shareholder_id: key.startsWith("id:") ? key.slice(3) : null,
      shareholder_key: key,
      statement_no: `DS-AAAAA-${id.slice(0, 5).toUpperCase()}`,
      content_hash: "blockid:v1:" + "0".repeat(64),
      payload: { shareholder: { name: "x", role: "r", sharesHeld: 1 }, amounts: { grossAud: 1, frankingCreditAud: 0, tfnWithheldAud: 0, netPaidAud: 1, frankingPct: 100 } },
      credits_charged: 2,
      issued_at: "2026-07-16T00:00:00Z",
      voided_at: null,
      void_reason: null,
    });
    seed({ dividend_statements: [live("id:22222222-2222-4222-8222-222222222222", "aaaaa-1"), live("id:33333333-3333-4333-8333-333333333333", "bbbbb-2")] });
    const preview = await (await post({})).json();
    expect(preview.toIssue).toEqual([]);
    expect(preview.alreadyIssued).toBe(2);
    expect(preview.cost).toBe(0);
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ confirm: true })).json();
    expect(body.ok).toBe(true);
    expect(body.issued).toEqual([]);
    expect(body.existing).toHaveLength(2);
    expect(body.creditsCharged).toBe(0);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("dividend_statements", "insert")).toHaveLength(0);
  });

  it("insert failure after a spend → refund + 500", async () => {
    issue.failAll = true;
    const res = await post({ confirm: true });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("statement_insert_failed");
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 2, "refund", expect.objectContaining({ feature: "dividend_statements", reason: "statement_insert_failed" }));
  });

  it("credit spend failure → 402, nothing inserted", async () => {
    credits.spendCredits.mockResolvedValue({ ok: false, balance: 0 });
    const res = await post({ confirm: true });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("credit_spend_failed");
    expect(db.sb!.find("dividend_statements", "insert")).toHaveLength(0);
  });

  it("text/plain body → 400", async () => {
    const res = await POST(new Request(`http://localhost/api/dividends/${REC}/statements`, { method: "POST", body: "nope" }), ctx());
    expect(res.status).toBe(400);
  });
});

describe("GET /api/dividends/[recordId]/statements", () => {
  it("viewer+ gets the record, its statements and the register; non-member 404", async () => {
    scopeState.role = "viewer";
    seed({ dividend_records: [record({ account_id: "user-owner" })] });
    const res = await GET(new Request(`http://localhost/api/dividends/${REC}/statements`), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(body.record.id).toBe(REC);
    expect(body.statements).toEqual([]);
    expect(body.register.reconciled).toBe(true);
    expect(body.register.rows).toEqual([]);

    reset();
    scopeState.nonMember = true;
    expect((await GET(new Request("http://localhost/x"), ctx())).status).toBe(404);
  });
});
