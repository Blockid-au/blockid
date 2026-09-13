// Colocated tests for /api/board-resolutions/[kind]/[recordId] (S26-B).
//
//   POST — cost preview first (`confirm` absent → 200 preview with cost /
//          company / directors / facts, no spend, no insert), confirm →
//          spend 1 credit then insert the frozen payload; equity add-on /
//          Growth+ → included (cost 0, no spend); already generated →
//          existing, nothing charged; editor allowed, viewer 403, no project
//          404, another project's record 404, bad kind 400, non-uuid 404;
//          insufficient credits → 402 before preview; insert failure after a
//          spend → refund; all three kinds resolve their record.
//   GET  — viewer+ `resolution` or null.

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

const issue = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/board-resolutions/server", async () => {
  const real = await vi.importActual<typeof import("@/lib/board-resolutions/server")>("@/lib/board-resolutions/server");
  return {
    ...real,
    issueResolution: async (input: Parameters<typeof real.issueResolution>[0]) => (issue.fail ? { ok: false, error: "insert_failed" } : real.issueResolution(input)),
  };
});

import { GET, POST } from "./route";

const TX = "44444444-4444-4444-8444-444444444444";
const DIV = "11111111-1111-4111-8111-111111111111";
const POOL = "55555555-5555-4555-8555-555555555555";
const JANE = "22222222-2222-4222-8222-222222222222";
const SEED = "33333333-3333-4333-8333-333333333333";
const CLS = "66666666-6666-4666-8666-666666666666";

function seed(over: Record<string, Array<Record<string, unknown>>> = {}, owner = "user-caller") {
  db.sb = fakeSupabase({
    share_transactions: [{ id: TX, account_id: owner, project_id: "proj-1", transaction_type: "issue", to_shareholder_id: SEED, share_class_id: CLS, shares: 400_000, price_per_share: "0.2500", total_value: "100000.00", round_name: "Seed", notes: null, effective_date: "2026-08-01" }],
    shareholders: [
      { id: JANE, account_id: owner, project_id: "proj-1", name: "Jane Founder", role: "founder & director", shares_held: 600_000 },
      { id: SEED, account_id: owner, project_id: null, name: "Seed Investor Pty Ltd", role: "investor", shares_held: 400_000 },
    ],
    share_classes: [{ id: CLS, name: "Ordinary" }],
    dividend_records: [{ id: DIV, account_id: owner, project_id: "proj-1", period: "2026-06", net_income: 100_000, distribution_pct: 50, total_dividend: 50_000, per_share_dividend: 0.05, retained_earnings: 50_000, franking_rate: 0.25, franking_pct: 100, tfn_withholding_rate: 0, paid_at: "2026-07-15", payouts: [{ name: "Jane Founder", grossDividend: 30_000 }, { name: "Seed Investor Pty Ltd", grossDividend: 20_000 }], created_at: "2026-07-01T00:00:00.000Z" }],
    esop_pool: [{ id: POOL, account_id: owner, project_id: "proj-1", total_pool_shares: 1_000_000, allocated_shares: 150_000, pool_pct: 10 }],
    esop_pools: [],
    project_grant_profiles: [{ abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }],
    board_resolutions: [],
    ...over,
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 1 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 9 });
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  gate.included = false;
  gate.via = null;
  issue.fail = false;
}

const ctx = (kind: string, recordId: string) => ({ params: Promise.resolve({ kind, recordId }) });
function post(body: unknown = {}, kind = "share-issue", recordId = TX) {
  return POST(new Request(`http://localhost/api/board-resolutions/${kind}/${recordId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(kind, recordId));
}
function get(kind = "share-issue", recordId = TX) {
  return GET(new Request(`http://localhost/api/board-resolutions/${kind}/${recordId}`), ctx(kind, recordId));
}

beforeEach(reset);

describe("POST — gate", () => {
  it("401 without a session; 400 bad kind; 404 non-uuid", async () => {
    auth.user = null;
    expect((await post()).status).toBe(401);
    reset();
    expect((await post({}, "minutes")).status).toBe(400);
    expect((await post({}, "share-issue", "nope")).status).toBe(404);
  });

  it("viewer → 403; no project → 404; non-member → 404; another project's record → 404; a non-issue transaction → 404", async () => {
    scopeState.role = "viewer";
    expect((await post()).status).toBe(403);
    reset();
    scopeState.projectId = null;
    expect((await post()).status).toBe(404);
    reset();
    scopeState.nonMember = true;
    expect((await post()).status).toBe(404);
    reset();
    seed({ share_transactions: [{ id: TX, account_id: "user-caller", project_id: "proj-9", transaction_type: "issue", shares: 1 }] });
    expect((await post()).status).toBe(404);
    reset();
    seed({ share_transactions: [{ id: TX, account_id: "user-caller", project_id: "proj-1", transaction_type: "transfer", shares: 1 }] });
    expect((await post()).status).toBe(404);
  });

  it("editor member is allowed and the record is read under the OWNER's account id", async () => {
    scopeState.role = "editor";
    seed({}, "user-owner");
    const res = await post();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("share_transactions", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
    expect((await res.json()).creditNote).toBe("Charged to your own credits — not the project owner's.");
  });
});

describe("POST — preview / confirm", () => {
  it("previews the 1-credit cost with the company, directors and facts; spends nothing and inserts nothing", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.cost).toBe(1);
    expect(body.listedCost).toBe(1);
    expect(body.included).toBe(false);
    expect(body.company).toEqual({ name: "P", acn: "123 456 789", abn: "12 345 678 901", address: "Sydney NSW" });
    expect(body.directors).toEqual([{ name: "Jane Founder" }]);
    expect(body.soleDirector).toBe(true);
    expect(body.title).toContain("issue of shares");
    expect(body.facts).toEqual(expect.arrayContaining([{ label: "Allottee", value: "Seed Investor Pty Ltd (investor)" }, { label: "Number of shares", value: "400,000" }, { label: "Issue price", value: "A$0.2500 per share" }]));
    expect(body.existing).toBeNull();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("board_resolutions", "insert")).toHaveLength(0);
  });

  it("confirm → spends 1 credit then inserts the frozen payload with the hash and the charge", async () => {
    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "board_resolution", { project_id: "proj-1", kind: "share-issue", record_id: TX });
    const inserts = db.sb!.find("board_resolutions", "insert");
    expect(inserts).toHaveLength(1);
    const row = inserts[0].args[0] as Record<string, unknown>;
    expect(row.project_id).toBe("proj-1");
    expect(row.user_id).toBe("user-caller");
    expect(row.kind).toBe("share-issue");
    expect(row.record_id).toBe(TX);
    expect(row.credits_charged).toBe(1);
    expect(String(row.content_hash)).toMatch(/^blockid:v1:[0-9a-f]{64}$/);
    const payload = row.payload as { version: string; resolutions: string[]; company: { name: string } };
    expect(payload.version).toBe("br-v1");
    expect(payload.company.name).toBe("P");
    expect(payload.resolutions[0]).toContain("400,000 fully paid Ordinary shares");
    expect(body.creditsCharged).toBe(1);
    expect(body.balance).toBe(9);
    expect(body.existing).toBe(false);
    expect(body.resolution.pdfUrl).toBe(`/api/board-resolutions/share-issue/${TX}/pdf`);
  });

  it("included (add-on / Growth+) → cost 0, no spend, credits_charged 0", async () => {
    gate.included = true;
    gate.via = "addon";
    const preview = await (await post({})).json();
    expect(preview.cost).toBe(0);
    expect(preview.included).toBe(true);
    expect(preview.includedVia).toBe("addon");
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ confirm: true })).json();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect((db.sb!.find("board_resolutions", "insert")[0].args[0] as { credits_charged: number }).credits_charged).toBe(0);
    expect(body.creditsCharged).toBe(0);
  });

  it("already generated → preview cost 0 with `existing`; confirm returns the row and charges nothing", async () => {
    const stored = { id: "br-1", project_id: "proj-1", user_id: "user-caller", kind: "share-issue", record_id: TX, content_hash: "blockid:v1:" + "0".repeat(64), payload: { title: "Circulating resolution of the directors — issue of shares" }, credits_charged: 1, issued_at: "2026-09-13T00:00:00Z" };
    seed({ board_resolutions: [stored] });
    const preview = await (await post({})).json();
    expect(preview.cost).toBe(0);
    expect(preview.existing).toMatchObject({ id: "br-1", kind: "share-issue", recordId: TX, pdfUrl: `/api/board-resolutions/share-issue/${TX}/pdf` });
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ confirm: true })).json();
    expect(body.existing).toBe(true);
    expect(body.creditsCharged).toBe(0);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("board_resolutions", "insert")).toHaveLength(0);
  });

  it("402 before the preview when the caller cannot afford it", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 1, reason: "insufficient_credits" });
    const res = await post({});
    expect(res.status).toBe(402);
    expect((await res.json()).creditsRequired).toBe(1);
  });

  it("insert failure after a spend → refund + 500", async () => {
    issue.fail = true;
    const res = await post({ confirm: true });
    expect(res.status).toBe(500);
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 1, "refund", expect.objectContaining({ feature: "board_resolution", reason: "resolution_insert_failed" }));
  });

  it("dividend kind: the s 254T statement from the dividend record", async () => {
    const body = await (await post({ confirm: true }, "dividend", DIV)).json();
    const payload = db.sb!.find("board_resolutions", "insert")[0].args[0] as { payload: { resolutions: string[]; facts: Array<{ label: string; value: string }> } };
    expect(payload.payload.resolutions[0]).toContain("s 254T");
    expect(payload.payload.resolutions[1]).toContain("A$50,000.00");
    expect(payload.payload.facts).toEqual(expect.arrayContaining([{ label: "Paying shareholders", value: "2" }]));
    expect(body.resolution.kind).toBe("dividend");
    expect(db.sb!.hasEq("dividend_records", "account_id", "user-caller")).toBe(true);
  });

  it("esop kind: pool + % from esop_pool, vesting only when an esop_pools config row exists", async () => {
    await post({ confirm: true }, "esop", POOL);
    let payload = db.sb!.find("board_resolutions", "insert")[0].args[0] as { payload: { resolutions: string[] } };
    expect(payload.payload.resolutions[1]).toContain("1,000,000 shares");
    expect(payload.payload.resolutions[1]).toContain("approximately 10%");
    expect(payload.payload.resolutions[2]).toContain("as set out in each offer letter");

    seed({ esop_pools: [{ account_id: "user-caller", vesting_cliff_months: 12, vesting_total_months: 48 }] });
    await post({ confirm: true }, "esop", POOL);
    payload = db.sb!.find("board_resolutions", "insert")[0].args[0] as { payload: { resolutions: string[] } };
    expect(payload.payload.resolutions[2]).toContain("48 months with a 12-month cliff");
  });
});

describe("GET", () => {
  it("viewer reads the generated resolution or null", async () => {
    scopeState.role = "viewer";
    expect((await (await get()).json()).resolution).toBeNull();
    seed({ board_resolutions: [{ id: "br-1", project_id: "proj-1", user_id: "user-caller", kind: "share-issue", record_id: TX, content_hash: "h", payload: { title: "T" }, credits_charged: "1.00", issued_at: "2026-09-13T00:00:00Z" }] });
    const body = await (await get()).json();
    expect(body.role).toBe("viewer");
    expect(body.resolution).toMatchObject({ id: "br-1", title: "T", creditsCharged: 1 });
    expect((await get("esop", TX)).status).toBe(200);
    expect((await get("nope", TX)).status).toBe(400);
  });
});
