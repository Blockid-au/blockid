// Colocated tests for /api/dividends/tax-statements (S28-A).
//
//   GET  — viewer+; default FY = last completed; ?fy validated (400); the
//          FY summary from live statements + generated rows + cost / gate.
//   POST — cost preview first (`confirm` absent → 200 preview, no spend, no
//          insert), confirm → spend 2 credits then insert one row per
//          shareholder of the FY; included → cost 0; idempotent per
//          (project, FY, shareholder); `regenerate` supersedes + charges
//          again; editor allowed, viewer 403, no project 404; bad FY 400;
//          nothing paid in the FY → 409; 402 before the preview; total
//          insert failure refunds.

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
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn(), grantCredits: vi.fn() }));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return { FEATURE_COSTS: real.FEATURE_COSTS, canAfford: (...a: unknown[]) => credits.canAfford(...a), spendCredits: (...a: unknown[]) => credits.spendCredits(...a), grantCredits: (...a: unknown[]) => credits.grantCredits(...a) };
});
const gate = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/dividends/gate", () => ({ statementsIncluded: async () => ({ included: gate.included, via: gate.included ? "addon" : null }) }));

const gen = vi.hoisted(() => ({ failAll: false }));
vi.mock("@/lib/dividends/tax-statements", async () => {
  const real = await vi.importActual<typeof import("@/lib/dividends/tax-statements")>("@/lib/dividends/tax-statements");
  return {
    ...real,
    generateTaxStatementsForFy: async (input: Parameters<typeof real.generateTaxStatementsForFy>[0]) =>
      gen.failAll ? { ok: true, fy: input.fy, generated: [], existing: [], superseded: [], failed: ["Jane Founder"], shareholderCount: 1 } : real.generateTaxStatementsForFy(input),
  };
});

import { GET, POST } from "./route";

const JANE_KEY = "id:22222222-2222-4222-8222-222222222222";

function statement(id: string, no: string, payload: typeof SAMPLE_STATEMENT, voided: string | null = null) {
  return { id, project_id: "proj-1", user_id: "u", dividend_record_id: payload.dividend.recordId, shareholder_id: payload.shareholder.id, shareholder_key: payload.shareholder.id ? `id:${payload.shareholder.id}` : `name:${payload.shareholder.name.toLowerCase()}`, statement_no: no, content_hash: "h", payload, credits_charged: 0, issued_at: "2026-07-16T02:00:00Z", voided_at: voided, void_reason: voided ? "x" : null };
}
const IN_FY = statement("s1", "DS-AAAAA-AAAAA", { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "2026-03-31" } });
const NEXT_FY = statement("s2", "DS-BBBBB-BBBBB", SAMPLE_STATEMENT); // paid 15 Jul 2026 → 2026-27
const SEED_IN_FY = statement("s3", "DS-CCCCC-CCCCC", { ...SAMPLE_STATEMENT_WITHHELD, dividend: { ...SAMPLE_STATEMENT_WITHHELD.dividend, paidAt: "2025-12-15" } });

function storedRow(over: Record<string, unknown> = {}) {
  return { id: "ts-1", project_id: "proj-1", user_id: "u", fy: "2025-26", shareholder_id: "22222222-2222-4222-8222-222222222222", shareholder_key: JANE_KEY, statement_no: "TS-2025-26-1", content_hash: "blockid:v1:" + "0".repeat(64), totals: { grossAud: 30_000, distributions: 1 }, payload: { shareholder: { name: "Jane Founder", role: "founder", tfnOnFile: true }, totals: { grossAud: 30_000, distributions: 1 } }, credits_charged: 2, version: 1, issued_at: "2026-07-10T00:00:00Z", superseded_at: null, superseded_by: null, ...over };
}

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({ dividend_statements: [IN_FY, NEXT_FY, SEED_IN_FY], shareholder_tax_statements: [], project_grant_profiles: [{ abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }], ...over });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  gate.included = false;
  gen.failAll = false;
}

const get = (qs = "") => GET(new Request(`http://localhost/api/dividends/tax-statements${qs}`));
const post = (body: unknown = {}) => POST(new Request("http://localhost/api/dividends/tax-statements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(reset);

describe("GET /api/dividends/tax-statements", () => {
  it("401; bad fy → 400; no project → empty; viewer gets the FY summary, options and existing rows", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    reset();
    expect((await get("?fy=2025-27")).status).toBe(400);
    scopeState.projectId = null;
    const empty = await (await get()).json();
    expect(empty).toMatchObject({ ok: true, shareholders: [], statements: [], role: null, cost: 2 });
    reset();
    scopeState.role = "viewer";
    seed({ shareholder_tax_statements: [storedRow(), storedRow({ id: "ts-0", statement_no: "TS-2025-26-0", superseded_at: "2026-07-11T00:00:00Z" })] });
    const res = await get("?fy=2025-26");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fy).toBe("2025-26");
    expect(body.role).toBe("viewer");
    expect(body.cost).toBe(2);
    expect(body.included).toBe(false);
    expect(body.options).toContain("2025-26");
    expect(body.options).toContain("2026-27");
    expect(body.shareholders.map((s: { name: string }) => s.name)).toEqual(["Jane Founder", "Seed Investor Pty Ltd"]);
    expect(body.shareholders[0].totals).toMatchObject({ distributions: 1, grossAud: 30_000, frankingCreditAud: 10_000 });
    expect(body.excluded).toEqual({ voided: 0, outsideFy: 1, undated: 0 });
    expect(body.statements.map((s: { id: string; current: boolean }) => [s.id, s.current])).toEqual([
      ["ts-1", true],
      ["ts-0", false],
    ]);
    expect(body.statements[0].pdfUrl).toBe("/api/dividends/tax-statements/ts-1/pdf");
  });

  it("defaults to the last completed FY when ?fy is absent", async () => {
    const body = await (await get()).json();
    expect(body.fy).toMatch(/^\d{4}-\d{2}$/);
    expect(body.fy).toBe(body.options[1]); // options = [current, last completed, ...]
  });
});

describe("POST /api/dividends/tax-statements", () => {
  it("401; viewer 403; no project 404; bad fy 400; nothing paid in the FY → 409", async () => {
    auth.user = null;
    expect((await post({ fy: "2025-26" })).status).toBe(401);
    reset();
    scopeState.role = "viewer";
    expect((await post({ fy: "2025-26" })).status).toBe(403);
    reset();
    scopeState.projectId = null;
    expect((await post({ fy: "2025-26" })).status).toBe(404);
    reset();
    expect((await post({ fy: "2025" })).status).toBe(400);
    const res = await post({ fy: "2023-24" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_statements");
    expect(credits.canAfford).not.toHaveBeenCalled();
  });

  it("previews the 2-credit cost per FY run, lists who gets a statement, spends and inserts nothing", async () => {
    const res = await post({ fy: "2025-26" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, preview: true, fy: "2025-26", cost: 2, listedCost: 2, included: false, alreadyCharged: false, balance: 10, toGenerate: ["Jane Founder", "Seed Investor Pty Ltd"], alreadyGenerated: 0, regenerate: false });
    expect(body.company.name).toBe("P");
    expect(credits.canAfford).toHaveBeenCalledWith("user-caller", "shareholder_tax_statements");
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("shareholder_tax_statements", "insert")).toHaveLength(0);
  });

  it("402 before the preview when the caller cannot afford it", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 1, cost: 2, reason: "insufficient_credits" });
    const res = await post({ fy: "2025-26" });
    expect(res.status).toBe(402);
    expect((await res.json()).creditsRequired).toBe(2);
  });

  it("confirm → spends FIRST, then inserts one row per shareholder stamped with the charge; editor member allowed", async () => {
    scopeState.role = "editor";
    const res = await post({ fy: "2025-26", confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, partial: false, fy: "2025-26", generatedCount: 2, failedCount: 0, cost: 2, creditsCharged: 2, retryCost: 0, balance: 8 });
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "shareholder_tax_statements", { project_id: "proj-1", fy: "2025-26", regenerate: false });
    const inserts = db.sb!.find("shareholder_tax_statements", "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].args[0]).toMatchObject({ project_id: "proj-1", user_id: "user-caller", fy: "2025-26", shareholder_key: JANE_KEY, statement_no: "TS-2025-26-1", credits_charged: 2, version: 1 });
    expect(inserts[1].args[0]).toMatchObject({ shareholder_key: "name:seed investor pty ltd", statement_no: "TS-2025-26-2" });
    expect(body.generated[0].statementNo).toBe("TS-2025-26-1");
  });

  it("included (equity add-on) → cost 0, no canAfford / spend, rows stamped 0", async () => {
    gate.included = true;
    const preview = await (await post({ fy: "2025-26" })).json();
    expect(preview).toMatchObject({ cost: 0, included: true });
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ fy: "2025-26", confirm: true })).json();
    expect(body.creditsCharged).toBe(0);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect((db.sb!.find("shareholder_tax_statements", "insert")[0].args[0] as { credits_charged: number }).credits_charged).toBe(0);
  });

  it("idempotent: a shareholder with a current row is not re-inserted; a charged current row marks the FY paid (cost 0)", async () => {
    seed({ shareholder_tax_statements: [storedRow()] });
    const preview = await (await post({ fy: "2025-26" })).json();
    expect(preview).toMatchObject({ cost: 0, alreadyCharged: true, toGenerate: ["Seed Investor Pty Ltd"], alreadyGenerated: 1 });
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ fy: "2025-26", confirm: true })).json();
    expect(body.existing.map((s: { id: string }) => s.id)).toEqual(["ts-1"]);
    expect(body.generatedCount).toBe(1);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("shareholder_tax_statements", "insert")).toHaveLength(1);
    expect(db.sb!.find("shareholder_tax_statements", "update")).toHaveLength(0);
  });

  it("regenerate: a new run — charged again, every shareholder gets version n+1, the old current row is superseded", async () => {
    seed({ shareholder_tax_statements: [storedRow()] });
    const preview = await (await post({ fy: "2025-26", regenerate: true })).json();
    expect(preview).toMatchObject({ cost: 2, alreadyCharged: false, regenerate: true, toGenerate: ["Jane Founder", "Seed Investor Pty Ltd"], alreadyGenerated: 1 });
    const body = await (await post({ fy: "2025-26", regenerate: true, confirm: true })).json();
    expect(body.generatedCount).toBe(2);
    expect(body.superseded.map((s: { id: string }) => s.id)).toEqual(["ts-1"]);
    expect(credits.spendCredits).toHaveBeenCalledTimes(1);
    const inserts = db.sb!.find("shareholder_tax_statements", "insert");
    expect(inserts[0].args[0]).toMatchObject({ shareholder_key: JANE_KEY, version: 2, statement_no: "TS-2025-26-2" });
    expect(db.sb!.find("shareholder_tax_statements", "update")).toHaveLength(1);
    expect(db.sb!.find("shareholder_tax_statements", "delete")).toHaveLength(0);
  });

  it("TOTAL insert failure after a spend → refund + 500", async () => {
    gen.failAll = true;
    const res = await post({ fy: "2025-26", confirm: true });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("tax_statement_insert_failed");
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 2, "refund", expect.objectContaining({ feature: "shareholder_tax_statements", fy: "2025-26" }));
  });

  it("credit spend failure → 402, nothing inserted; text/plain body → 400", async () => {
    credits.spendCredits.mockResolvedValue({ ok: false, balance: 0 });
    expect((await post({ fy: "2025-26", confirm: true })).status).toBe(402);
    expect(db.sb!.find("shareholder_tax_statements", "insert")).toHaveLength(0);
    expect((await POST(new Request("http://localhost/api/dividends/tax-statements", { method: "POST", body: "nope" }))).status).toBe(400);
  });
});
