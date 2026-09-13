// Annual tax statements — server half (S28-A): generation inserts one
// frozen row per shareholder of the FY with the column contract, hash and
// TS-<FY>-<n> numbering; idempotent per (project, FY, shareholder);
// regenerate supersedes the current row and inserts version n+1; scoping
// on reads; the charged marker; summaries.

import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { SAMPLE_COMPANY, SAMPLE_STATEMENT, SAMPLE_STATEMENT_WITHHELD } from "./fixtures";
import type { DividendStatementRow } from "./server";
import { TAX_STATEMENT_NO_RE } from "./fy-summary";
import {
  currentOnly,
  fyAlreadyCharged,
  generateTaxStatementsForFy,
  getTaxStatementForProject,
  listTaxStatementsForFy,
  listTaxStatementsForProject,
  summariseFyFromStatements,
  taxStatementContentHash,
  taxStatementSummary,
  type ShareholderTaxStatementRow,
} from "./tax-statements";

const NOW = new Date("2026-07-16T02:00:00.000Z");

function ds(id: string, no: string, payload: DividendStatementRow["payload"], voided: string | null = null): DividendStatementRow {
  return { id, project_id: "proj-1", user_id: "u", dividend_record_id: payload.dividend.recordId, shareholder_id: payload.shareholder.id, shareholder_key: payload.shareholder.id ? `id:${payload.shareholder.id}` : `name:${payload.shareholder.name.toLowerCase()}`, statement_no: no, content_hash: "h", payload, credits_charged: 0, issued_at: "2026-07-16T02:00:00Z", voided_at: voided, void_reason: voided ? "x" : null };
}

// Both fixtures are paid 15 Jul 2026 → FY 2026-27; re-date one of Jane's to FY 2025-26.
const JANE_MAR = ds("s1", "DS-AAAAA-AAAAA", { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "2026-03-31" } });
const JANE_JUN = ds("s2", "DS-BBBBB-BBBBB", { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "2026-06-30" } });
const SEED_DEC = ds("s3", "DS-CCCCC-CCCCC", { ...SAMPLE_STATEMENT_WITHHELD, dividend: { ...SAMPLE_STATEMENT_WITHHELD.dividend, paidAt: "2025-12-15" } });
const JANE_JUL = ds("s4", "DS-DDDDD-DDDDD", SAMPLE_STATEMENT); // next FY
const VOIDED = ds("s5", "DS-EEEEE-EEEEE", { ...SAMPLE_STATEMENT, dividend: { ...SAMPLE_STATEMENT.dividend, paidAt: "2026-01-31" } }, "2026-02-01T00:00:00Z");
const STATEMENTS = [JANE_MAR, JANE_JUN, SEED_DEC, JANE_JUL, VOIDED];

function stored(over: Partial<ShareholderTaxStatementRow> = {}): ShareholderTaxStatementRow {
  return {
    id: "ts-1",
    project_id: "proj-1",
    user_id: "u",
    fy: "2025-26",
    shareholder_id: "22222222-2222-4222-8222-222222222222",
    shareholder_key: "id:22222222-2222-4222-8222-222222222222",
    statement_no: "TS-2025-26-1",
    content_hash: "blockid:v1:" + "0".repeat(64),
    totals: { grossAud: 1, frankedAud: 1, unfrankedAud: 0, frankingCreditAud: 0, tfnWithheldAud: 0, netPaidAud: 1, grossedUpAud: 1, distributions: 1, dripShares: 0, dripReinvestedAud: 0 },
    payload: { shareholder: { name: "Jane Founder", role: "founder", tfnOnFile: true }, totals: { grossAud: 1, distributions: 1 } } as unknown as ShareholderTaxStatementRow["payload"],
    credits_charged: 2,
    version: 1,
    issued_at: "2026-07-10T00:00:00Z",
    superseded_at: null,
    superseded_by: null,
    ...over,
  };
}

describe("summariseFyFromStatements", () => {
  it("maps the register rows and keeps only live in-year statements", () => {
    const s = summariseFyFromStatements("2025-26", STATEMENTS)!;
    expect(s.shareholders.map((x) => [x.name, x.totals.distributions])).toEqual([
      ["Jane Founder", 2],
      ["Seed Investor Pty Ltd", 1],
    ]);
    expect(s.excluded).toEqual({ voided: 1, outsideFy: 1, undated: 0 });
    expect(s.shareholders[0].distributions[0].statementId).toBe("s1");
  });
});

describe("generateTaxStatementsForFy", () => {
  it("inserts one row per shareholder with the column contract, hash, totals copy and sequential numbers", async () => {
    const sb = fakeSupabase({ shareholder_tax_statements: [] });
    const res = await generateTaxStatementsForFy({ db: sb as never, projectId: "proj-1", userId: "user-caller", company: SAMPLE_COMPANY, fy: "2025-26", statements: STATEMENTS, existingRows: [], regenerate: false, creditsCharged: 2, now: NOW });
    expect(res.failed).toEqual([]);
    expect(res.existing).toEqual([]);
    expect(res.shareholderCount).toBe(2);
    expect(res.generated).toHaveLength(2);
    const inserts = sb.find("shareholder_tax_statements", "insert");
    expect(inserts).toHaveLength(2);
    const first = inserts[0].args[0] as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(["content_hash", "credits_charged", "fy", "issued_at", "payload", "project_id", "shareholder_id", "shareholder_key", "statement_no", "totals", "user_id", "version"]);
    expect(first).toMatchObject({ project_id: "proj-1", user_id: "user-caller", fy: "2025-26", shareholder_id: "22222222-2222-4222-8222-222222222222", shareholder_key: "id:22222222-2222-4222-8222-222222222222", statement_no: "TS-2025-26-1", credits_charged: 2, version: 1, issued_at: "2026-07-16T02:00:00.000Z" });
    expect(first.statement_no).toMatch(TAX_STATEMENT_NO_RE);
    const payload = first.payload as ShareholderTaxStatementRow["payload"];
    expect(first.content_hash).toBe(taxStatementContentHash(payload));
    expect(first.totals).toEqual(payload.totals);
    expect(payload.totals).toMatchObject({ distributions: 2, grossAud: 60_000, frankingCreditAud: 20_000 });
    expect(payload.entity.name).toBe("Acme Robotics Pty Ltd");
    const second = inserts[1].args[0] as Record<string, unknown>;
    expect(second.statement_no).toBe("TS-2025-26-2");
    expect(second.shareholder_id).toBeNull();
    expect(second.shareholder_key).toBe("name:seed investor pty ltd");
    expect(sb.find("shareholder_tax_statements", "update")).toHaveLength(0);
  });

  it("idempotent: a shareholder with a current row is reported as existing; the other is inserted with the next number", async () => {
    const sb = fakeSupabase({ shareholder_tax_statements: [stored()] });
    const res = await generateTaxStatementsForFy({ db: sb as never, projectId: "proj-1", userId: "u", company: SAMPLE_COMPANY, fy: "2025-26", statements: STATEMENTS, existingRows: [stored()], regenerate: false, creditsCharged: 0, now: NOW });
    expect(res.existing.map((r) => r.id)).toEqual(["ts-1"]);
    expect(res.generated).toHaveLength(1);
    const inserts = sb.find("shareholder_tax_statements", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toMatchObject({ shareholder_key: "name:seed investor pty ltd", statement_no: "TS-2025-26-2", version: 1 });
  });

  it("regenerate: inserts version n+1 for everyone and supersedes the previous current row (never deletes)", async () => {
    const old = stored();
    const sb = fakeSupabase({ shareholder_tax_statements: [old] });
    const res = await generateTaxStatementsForFy({ db: sb as never, projectId: "proj-1", userId: "u", company: SAMPLE_COMPANY, fy: "2025-26", statements: STATEMENTS, existingRows: [old], regenerate: true, creditsCharged: 2, now: NOW });
    expect(res.existing).toEqual([]);
    expect(res.generated).toHaveLength(2);
    const inserts = sb.find("shareholder_tax_statements", "insert");
    expect(inserts[0].args[0]).toMatchObject({ shareholder_key: "id:22222222-2222-4222-8222-222222222222", statement_no: "TS-2025-26-2", version: 2 });
    expect(inserts[1].args[0]).toMatchObject({ shareholder_key: "name:seed investor pty ltd", statement_no: "TS-2025-26-3", version: 1 });
    const updates = sb.find("shareholder_tax_statements", "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toMatchObject({ superseded_at: "2026-07-16T02:00:00.000Z" });
    expect(sb.hasEq("shareholder_tax_statements", "id", "ts-1")).toBe(true);
    expect(sb.find("shareholder_tax_statements", "delete")).toHaveLength(0);
    expect(res.superseded.map((r) => r.id)).toEqual(["ts-1"]);
  });

  it("bad FY → nothing; no statements in the FY → nothing inserted", async () => {
    const sb = fakeSupabase({ shareholder_tax_statements: [] });
    expect((await generateTaxStatementsForFy({ db: sb as never, projectId: "proj-1", userId: "u", company: SAMPLE_COMPANY, fy: "nope", statements: STATEMENTS, existingRows: [], regenerate: false, creditsCharged: 0 })).shareholderCount).toBe(0);
    const res = await generateTaxStatementsForFy({ db: sb as never, projectId: "proj-1", userId: "u", company: SAMPLE_COMPANY, fy: "2023-24", statements: STATEMENTS, existingRows: [], regenerate: false, creditsCharged: 0 });
    expect(res.shareholderCount).toBe(0);
    expect(sb.find("shareholder_tax_statements", "insert")).toHaveLength(0);
  });
});

describe("reads, charge marker, summaries", () => {
  it("scopes by project / fy / id; currentOnly drops superseded rows", async () => {
    const other = stored({ id: "ts-9", project_id: "proj-2" });
    const sup = stored({ id: "ts-0", superseded_at: "2026-07-11T00:00:00Z", superseded_by: "ts-1" });
    const sb = fakeSupabase({ shareholder_tax_statements: [stored(), other, sup, stored({ id: "ts-2", fy: "2024-25" })] });
    expect((await listTaxStatementsForProject(sb as never, "proj-1")).map((r) => r.id)).toEqual(["ts-1", "ts-0", "ts-2"]);
    expect((await listTaxStatementsForFy(sb as never, "proj-1", "2025-26")).map((r) => r.id)).toEqual(["ts-1", "ts-0"]);
    expect(currentOnly([stored(), sup]).map((r) => r.id)).toEqual(["ts-1"]);
    expect(await getTaxStatementForProject(fakeSupabase({ shareholder_tax_statements: [stored()] }) as never, "ts-1", "proj-1")).not.toBeNull();
    expect(await getTaxStatementForProject(fakeSupabase({ shareholder_tax_statements: [stored()] }) as never, "ts-1", "proj-2")).toBeNull();
    expect(await getTaxStatementForProject(fakeSupabase({ shareholder_tax_statements: [stored()] }) as never, "ts-x", "proj-1")).toBeNull();
  });

  it("fyAlreadyCharged + summary projection", () => {
    expect(fyAlreadyCharged([stored({ credits_charged: 0 })])).toBe(false);
    expect(fyAlreadyCharged([stored({ credits_charged: 0 }), stored({ credits_charged: "2" })])).toBe(true);
    expect(fyAlreadyCharged([])).toBe(false);
    const s = taxStatementSummary(stored({ version: null }));
    expect(s).toMatchObject({ id: "ts-1", statementNo: "TS-2025-26-1", fy: "2025-26", version: 1, current: true, shareholderName: "Jane Founder", distributions: 1, grossAud: 1, creditsCharged: 2, pdfUrl: "/api/dividends/tax-statements/ts-1/pdf" });
  });
});
