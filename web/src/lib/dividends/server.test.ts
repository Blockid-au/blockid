// Colocated suite for the dividend statements server half (S25-B).
//
// Pins: record scoping (owner account_id + project stamp, other project →
// null), company details come from the FOUNDER's project (grant profile ABN
// / ACN, SVI-form ABN fallback, never Auschain's), payout ↔ shareholder
// matching by normalised name with a name-keyed fallback, idempotent issue
// (a second call inserts nothing; a voided slot is re-issued), the insert
// column contract + content hash, void one-way, the register projection.

import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import type { DividendPayout } from "@/lib/dividends";
import { buildDividendStatement } from "./statement";
import {
  STATEMENT_NO_RE,
  getDividendRecordForScope,
  issueStatementsForRecord,
  listDividendRecordsForScope,
  loadCompanyForScope,
  loadShareholdersForScope,
  matchPayouts,
  recordAlreadyCharged,
  recordSummary,
  registerForRecord,
  statementContentHash,
  statementHashMatches,
  statementNumber,
  statementSummary,
  toStatementRecord,
  voidStatement,
  type DividendRecordRow,
  type DividendStatementRow,
} from "./server";

const SCOPE = { projectId: "proj-1", ownerUserId: "user-owner", projectName: "Acme Robotics Pty Ltd" };

const PAYOUTS: DividendPayout[] = [
  { name: "Jane Founder", role: "founder", shares: 600_000, ownershipPct: 60, grossDividend: 30_000, frankingCredit: 10_000, netDividend: 30_000 },
  { name: "Seed Investor Pty Ltd", role: "investor", shares: 400_000, ownershipPct: 40, grossDividend: 20_000, frankingCredit: 6_666.67, netDividend: 20_000 },
  { name: "ESOP Pool", role: "esop", shares: 0, ownershipPct: 0, grossDividend: 0, frankingCredit: 0, netDividend: 0 },
];

function record(over: Partial<DividendRecordRow> = {}): DividendRecordRow {
  return {
    id: "rec-1",
    account_id: "user-owner",
    project_id: "proj-1",
    period: "2026-06",
    net_income: "100000.00",
    distribution_pct: "50.00",
    total_dividend: "50000.00",
    per_share_dividend: "0.050000",
    retained_earnings: "50000.00",
    franking_rate: "0.2500",
    franking_pct: "100.00",
    tfn_withholding_rate: "0.0000",
    paid_at: "2026-07-15",
    payouts: PAYOUTS,
    created_at: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

const NOW = new Date("2026-07-16T02:00:00.000Z");

describe("statementNumber / hash", () => {
  it("DS-XXXXX-XXXXX, no I/L/O, differs per entropy; hash round-trips", () => {
    const a = statementNumber("seed", Buffer.alloc(16, 1));
    const b = statementNumber("seed", Buffer.alloc(16, 2));
    expect(a).toMatch(STATEMENT_NO_RE);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[ILO]/);
    const row = issueSync();
    expect(statementHashMatches(row.payload, row.content_hash)).toBe(true);
    expect(statementHashMatches({ ...row.payload, amounts: { ...row.payload.amounts, grossAud: 1 } }, row.content_hash)).toBe(false);
  });
});

function issueSync(over: Partial<DividendStatementRow> = {}): DividendStatementRow {
  const rec = toStatementRecord(record());
  const payload = buildDividendStatement(
    {
      company: { name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789" },
      record: rec,
      payout: PAYOUTS[0],
      shareholder: { id: null, name: "Jane Founder", role: "founder", sharesHeld: 600_000, tfnOnFile: false },
      now: NOW,
    },
    "DS-AAAAA-BBBBB",
  );
  return {
    id: "st-1",
    project_id: "proj-1",
    user_id: "user-owner",
    dividend_record_id: "rec-1",
    shareholder_id: null,
    shareholder_key: "name:jane founder",
    statement_no: "DS-AAAAA-BBBBB",
    content_hash: statementContentHash(payload),
    payload,
    credits_charged: 0,
    issued_at: NOW.toISOString(),
    voided_at: null,
    void_reason: null,
    ...over,
  };
}

describe("toStatementRecord", () => {
  it("coerces numeric strings, defaults franking_pct → 100 and a bad rate → 0.25", () => {
    const r = toStatementRecord(record({ franking_pct: null, franking_rate: "9" }));
    expect(r.totalDividendAud).toBe(50_000);
    expect(r.perShareDividendAud).toBe(0.05);
    expect(r.frankingPct).toBe(100);
    expect(r.companyTaxRate).toBe(0.25);
    expect(r.tfnWithholdingRate).toBe(0);
    expect(toStatementRecord(record({ franking_rate: 0.3 })).companyTaxRate).toBe(0.3);
  });
});

describe("record scoping", () => {
  it("returns the owner's record; another project's stamp or another owner → null", async () => {
    const sb = fakeSupabase({ dividend_records: [record()] });
    expect((await getDividendRecordForScope(sb as never, "rec-1", SCOPE))?.id).toBe("rec-1");
    expect(sb.hasEq("dividend_records", "account_id", "user-owner")).toBe(true);
    expect(await getDividendRecordForScope(sb as never, "rec-2", SCOPE)).toBeNull();
    expect(await getDividendRecordForScope(sb as never, "rec-1", { ...SCOPE, projectId: "proj-9" })).toBeNull();
    expect(await getDividendRecordForScope(sb as never, "rec-1", { ...SCOPE, ownerUserId: "someone" })).toBeNull();
  });

  it("legacy unstamped records (project_id null) belong to the owner's active project", async () => {
    const sb = fakeSupabase({ dividend_records: [record({ project_id: null })] });
    expect((await getDividendRecordForScope(sb as never, "rec-1", SCOPE))?.id).toBe("rec-1");
    const list = await listDividendRecordsForScope(sb as never, SCOPE);
    expect(list.map((r) => r.id)).toEqual(["rec-1"]);
  });

  it("list filters out other projects' stamped rows", async () => {
    const sb = fakeSupabase({ dividend_records: [record(), record({ id: "rec-2", project_id: "proj-2" })] });
    expect((await listDividendRecordsForScope(sb as never, SCOPE)).map((r) => r.id)).toEqual(["rec-1"]);
  });
});

describe("loadCompanyForScope — the founder's entity", () => {
  it("uses the grant profile ABN/ACN + city/state", async () => {
    const sb = fakeSupabase({ project_grant_profiles: [{ abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }] });
    const c = await loadCompanyForScope(sb as never, SCOPE);
    expect(c).toEqual({ name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" });
    expect(sb.hasEq("project_grant_profiles", "project_id", "proj-1")).toBe(true);
  });

  it("falls back to the SVI-form ABN only when the score-history row names THIS startup", async () => {
    const sb = fakeSupabase({
      project_grant_profiles: [],
      startup_score_history: [{ startup_name: "acme robotics pty ltd", inputs: { abn: "98 765 432 109" } }],
    });
    expect((await loadCompanyForScope(sb as never, SCOPE)).abn).toBe("98 765 432 109");
    const other = fakeSupabase({ project_grant_profiles: [], startup_score_history: [{ startup_name: "Other Co", inputs: { abn: "98765432109" } }] });
    const c = await loadCompanyForScope(other as never, SCOPE);
    expect(c.abn).toBeNull();
    expect(c.acn).toBeNull();
    expect(c.name).toBe("Acme Robotics Pty Ltd");
  });

  it("never substitutes BlockID's own entity", async () => {
    const sb = fakeSupabase({});
    const c = await loadCompanyForScope(sb as never, SCOPE);
    expect(JSON.stringify(c)).not.toMatch(/Auschain|659 615 111|79659615111/);
  });
});

describe("loadShareholdersForScope + matchPayouts", () => {
  it("maps rows, resolves the share class, filters other projects, and matches payouts by normalised name", async () => {
    const sb = fakeSupabase({
      shareholders: [
        { id: "sh-1", account_id: "user-owner", project_id: "proj-1", name: "Jane  Founder", role: "founder", shares_held: "600000", tfn_on_file: true, share_class_id: "cls-1" },
        { id: "sh-2", account_id: "user-owner", project_id: null, name: "Seed Investor Pty Ltd", role: "investor", shares_held: 400_000, tfn_on_file: false, share_class_id: null },
        { id: "sh-9", account_id: "user-owner", project_id: "proj-2", name: "Elsewhere", role: "investor", shares_held: 1 },
      ],
      share_classes: [{ id: "cls-1", name: "Ordinary" }],
    });
    const holders = await loadShareholdersForScope(sb as never, SCOPE);
    expect(holders.map((h) => h.id)).toEqual(["sh-1", "sh-2"]);
    expect(holders[0]).toEqual({ id: "sh-1", name: "Jane  Founder", role: "founder", shareClass: "Ordinary", shareClassId: "cls-1", sharesHeld: 600_000, tfnOnFile: true });
    expect(holders[1].tfnOnFile).toBe(false);

    const matched = matchPayouts(PAYOUTS, holders);
    expect(matched.map((m) => m.key)).toEqual(["id:sh-1", "id:sh-2"]); // zero-gross ESOP pool skipped
    expect(matched[0].shareholder.id).toBe("sh-1");
  });

  it("an unmatched payout gets a name-keyed shareholder with no TFN on file; duplicate names collapse", () => {
    const matched = matchPayouts([PAYOUTS[0], { ...PAYOUTS[0] }, PAYOUTS[1]], []);
    expect(matched).toHaveLength(2);
    expect(matched[0].key).toBe("name:jane founder");
    expect(matched[0].shareholder).toEqual({ id: null, name: "Jane Founder", role: "founder", shareClass: null, sharesHeld: 600_000, tfnOnFile: false });
  });
});

describe("issueStatementsForRecord — idempotent", () => {
  const company = { name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: null };
  const holders = [
    { id: "sh-1", name: "Jane Founder", role: "founder", shareClass: "Ordinary", sharesHeld: 600_000, tfnOnFile: true },
    { id: "sh-2", name: "Seed Investor Pty Ltd", role: "investor", shareClass: null, sharesHeld: 400_000, tfnOnFile: false },
  ];

  it("inserts one row per paying shareholder with the column contract, hash and frozen payload", async () => {
    const sb = fakeSupabase({ dividend_statements: [] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "user-caller", company, record: record(), shareholders: holders, creditsCharged: 2, now: NOW });
    expect(res.failed).toEqual([]);
    expect(res.existing).toEqual([]);
    expect(res.issued).toHaveLength(2);
    const inserts = sb.find("dividend_statements", "insert");
    expect(inserts).toHaveLength(2);
    const first = inserts[0].args[0] as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(["content_hash", "credits_charged", "dividend_record_id", "issued_at", "payload", "project_id", "shareholder_id", "shareholder_key", "statement_no", "user_id"]);
    expect(first.project_id).toBe("proj-1");
    expect(first.user_id).toBe("user-caller");
    expect(first.dividend_record_id).toBe("rec-1");
    expect(first.shareholder_id).toBe("sh-1");
    expect(first.shareholder_key).toBe("id:sh-1");
    expect(first.credits_charged).toBe(2);
    expect(first.statement_no).toMatch(STATEMENT_NO_RE);
    const payload = first.payload as DividendStatementRow["payload"];
    expect(payload.statementNo).toBe(first.statement_no);
    expect(first.content_hash).toBe(statementContentHash(payload));
    expect(payload.entity.name).toBe("Acme Robotics Pty Ltd");
    expect(payload.amounts.frankingCreditAud).toBe(10_000);
    expect(payload.shareholder.tfnOnFile).toBe(true);
    const second = inserts[1].args[0] as Record<string, unknown>;
    expect((second.payload as DividendStatementRow["payload"]).shareholder.tfnOnFile).toBe(false);
  });

  it("second call: every live statement is reported as existing and nothing is inserted", async () => {
    const live = (k: string, id: string): DividendStatementRow => ({ ...issueSync(), id, shareholder_key: k, shareholder_id: k.slice(3), dividend_record_id: "rec-1", project_id: "proj-1" });
    const sb = fakeSupabase({ dividend_statements: [live("id:sh-1", "st-1"), live("id:sh-2", "st-2")] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW });
    expect(res.issued).toEqual([]);
    expect(res.existing.map((s) => s.id)).toEqual(["st-1", "st-2"]);
    expect(sb.find("dividend_statements", "insert")).toHaveLength(0);
  });

  it("a voided statement frees the slot → re-issued with a new number", async () => {
    const voided: DividendStatementRow = { ...issueSync(), id: "st-old", shareholder_key: "id:sh-1", voided_at: "2026-07-20T00:00:00Z", void_reason: "wrong holding" };
    const sb = fakeSupabase({ dividend_statements: [voided] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW });
    expect(res.issued).toHaveLength(2);
    expect(sb.find("dividend_statements", "insert").map((c) => (c.args[0] as { shareholder_key: string }).shareholder_key)).toEqual(["id:sh-1", "id:sh-2"]);
    expect(res.drip).toEqual([]);
  });
});

describe("issueStatementsForRecord — DRIP hook (S28-A)", () => {
  const company = { name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: null };
  const holders = [
    { id: "sh-1", name: "Jane Founder", role: "founder", shareClass: "Ordinary", shareClassId: "cls-1", sharesHeld: 600_000, tfnOnFile: true },
    { id: "sh-2", name: "Seed Investor Pty Ltd", role: "investor", shareClass: null, sharesHeld: 400_000, tfnOnFile: false },
  ];
  const election = { id: "el-1", shareholderId: "sh-1", participationPct: 50, priceBasis: "share_price_mid" as const, manualPriceAud: null, electedAt: "2026-07-01T00:00:00Z", revokedAt: null };
  const ctx = (over: Partial<Parameters<typeof issueStatementsForRecord>[0]["drip"] & object> = {}) => ({ elections: [election], marketPriceAud: 1.37, ownerUserId: "user-owner", defaultShareClassId: "cls-ord", ...over });

  it("an electing shareholder: frozen drip block on the statement, drip_allocations row, cap-table issue on the same path as issue_shares", async () => {
    const sb = fakeSupabase({ dividend_statements: [], drip_allocations: [] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW, drip: ctx() });
    expect(res.issued).toHaveLength(2);
    expect(res.drip).toHaveLength(1);
    // Jane: net 30,000 × 50 % = 15,000 at A$1.37 → 10,948 shares, A$14,998.76 reinvested, A$1.24 residual.
    expect(res.drip[0]).toMatchObject({ shareholderName: "Jane Founder", status: "recorded", shares: 10_948, priceAud: 1.37, reinvestedAud: 14_998.76, residualAud: 1.24, cashPaidAud: 15_001.24, skipReason: null });

    const stmt = sb.find("dividend_statements", "insert")[0].args[0] as { payload: DividendStatementRow["payload"]; content_hash: string };
    expect(stmt.payload.drip).toMatchObject({ electionId: "el-1", participationPct: 50, priceBasis: "share_price_mid", priceAud: 1.37, shares: 10_948, reinvestedAud: 14_998.76, cashPaidAud: 15_001.24, skipped: null });
    expect(stmt.content_hash).toBe(statementContentHash(stmt.payload)); // the drip block is inside the hash
    expect(stmt.payload.notes.some((n) => n.includes("10,948 shares at A$1.37"))).toBe(true);
    // Seed Investor has no election → no drip block.
    const second = sb.find("dividend_statements", "insert")[1].args[0] as { payload: DividendStatementRow["payload"] };
    expect(second.payload.drip).toBeUndefined();

    // Cap-table issue: same columns as api/cap-table `issue_shares`, keyed on the OWNER, round "DRIP <period>".
    const tx = sb.find("share_transactions", "insert");
    expect(tx).toHaveLength(1);
    expect(tx[0].args[0]).toMatchObject({ account_id: "user-owner", project_id: "proj-1", transaction_type: "issue", to_shareholder_id: "sh-1", share_class_id: "cls-1", shares: 10_948, price_per_share: 1.37, total_value: 14_998.76, round_name: "DRIP 2026-06", effective_date: "2026-07-15" });
    const up = sb.find("shareholders", "update");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toEqual({ shares_held: 610_948 });
    expect(sb.hasEq("shareholders", "id", "sh-1")).toBe(true);
    expect(sb.hasEq("shareholders", "account_id", "user-owner")).toBe(true);

    const alloc = sb.find("drip_allocations", "insert");
    expect(alloc).toHaveLength(1);
    expect(alloc[0].args[0]).toMatchObject({ project_id: "proj-1", dividend_record_id: "rec-1", election_id: "el-1", shareholder_id: "sh-1", shareholder_key: "id:sh-1", status: "recorded", participation_pct: 50, price_basis: "share_price_mid", net_cash_aud: 30_000, price_aud: 1.37, shares: 10_948, reinvested_aud: 14_998.76, residual_aud: 1.24 });
  });

  it("manual price basis uses the plan price; no usable market price → skipped, cash paid, no cap-table write", async () => {
    const sb = fakeSupabase({ dividend_statements: [], drip_allocations: [] });
    const manual = { ...election, priceBasis: "manual" as const, manualPriceAud: 2.5 };
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW, drip: ctx({ elections: [manual], marketPriceAud: null }) });
    expect(res.drip[0]).toMatchObject({ status: "recorded", shares: 6_000, priceAud: 2.5, reinvestedAud: 15_000, residualAud: 0, cashPaidAud: 15_000 });

    const sb2 = fakeSupabase({ dividend_statements: [], drip_allocations: [] });
    const res2 = await issueStatementsForRecord({ db: sb2 as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW, drip: ctx({ marketPriceAud: 0 }) });
    expect(res2.drip[0]).toMatchObject({ status: "skipped", shares: 0, reinvestedAud: 0, cashPaidAud: 30_000, skipReason: "no_price" });
    expect(sb2.find("share_transactions", "insert")).toHaveLength(0);
    expect(sb2.find("shareholders", "update")).toHaveLength(0);
    expect(sb2.find("drip_allocations", "insert")[0].args[0]).toMatchObject({ status: "skipped", skip_reason: "no_price", shares: 0 });
    const stmt = sb2.find("dividend_statements", "insert")[0].args[0] as { payload: DividendStatementRow["payload"] };
    expect(stmt.payload.drip).toMatchObject({ shares: 0, skipped: "no_price", cashPaidAud: 30_000 });
  });

  it("re-issue after a void REUSES the prior allocation — shares are never allotted twice", async () => {
    const voided: DividendStatementRow = { ...issueSync(), id: "st-old", shareholder_key: "id:sh-1", voided_at: "2026-07-20T00:00:00Z", void_reason: "wrong holding" };
    const prior = { id: "al-1", project_id: "proj-1", dividend_record_id: "rec-1", dividend_statement_id: "st-old", election_id: "el-1", shareholder_id: "sh-1", shareholder_key: "id:sh-1", share_transaction_id: "tx-1", status: "recorded", skip_reason: null, participation_pct: 50, price_basis: "share_price_mid", net_cash_aud: 30_000, price_aud: 1.37, shares: 10_948, reinvested_aud: 14_998.76, residual_aud: 1.24, created_at: "2026-07-16T00:00:00Z" };
    const sb = fakeSupabase({ dividend_statements: [voided], drip_allocations: [prior] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW, drip: ctx({ marketPriceAud: 9.99 }) });
    expect(res.drip).toHaveLength(1);
    expect(res.drip[0]).toMatchObject({ status: "reused", shares: 10_948, priceAud: 1.37, shareTransactionId: "tx-1" });
    expect(sb.find("share_transactions", "insert")).toHaveLength(0);
    expect(sb.find("drip_allocations", "insert")).toHaveLength(0);
    const stmt = sb.find("dividend_statements", "insert")[0].args[0] as { payload: DividendStatementRow["payload"] };
    expect(stmt.payload.drip).toMatchObject({ shares: 10_948, priceAud: 1.37, cashPaidAud: 15_001.24 });
  });

  // S28-review P2: the statement row lands (frozen + hashed) with the PLANNED
  // block before the cap-table write. A failed share_transactions insert
  // must re-freeze the statement as skipped — the PDF never shows shares the
  // register does not hold.
  it("cap-table write failure → the frozen statement is re-written with the skipped block and a matching hash", async () => {
    const sb = fakeSupabase({ dividend_statements: [], drip_allocations: [] });
    const failing = {
      from: (table: string) => {
        if (table !== "share_transactions") return sb.from(table);
        const chain: Record<string, unknown> = {};
        chain.insert = () => chain;
        chain.select = () => chain;
        chain.single = async () => ({ data: null, error: { code: "23503", message: "share_class_id fk" } });
        return chain;
      },
    };
    const res = await issueStatementsForRecord({ db: failing as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW, drip: ctx() });
    expect(res.drip[0]).toMatchObject({ status: "skipped", shares: 0, reinvestedAud: 0, cashPaidAud: 30_000, skipReason: "cap_table_write_failed", shareTransactionId: null });
    expect(sb.find("drip_allocations", "insert")[0].args[0]).toMatchObject({ status: "skipped", skip_reason: "cap_table_write_failed", shares: 0 });

    // The first insert carried the planned block; the follow-up update re-freezes it.
    const inserted = sb.find("dividend_statements", "insert")[0].args[0] as DividendStatementRow;
    expect(inserted.payload.drip).toMatchObject({ shares: 10_948, skipped: null });
    const updates = sb.find("dividend_statements", "update");
    expect(updates).toHaveLength(1);
    const patch = updates[0].args[0] as { payload: DividendStatementRow["payload"]; content_hash: string };
    expect(patch.payload.drip).toMatchObject({ shares: 0, reinvestedAud: 0, residualAud: 0, cashPaidAud: 30_000, skipped: "cap_table_write_failed", priceAud: 1.37 });
    expect(patch.payload.statementNo).toBe(inserted.statement_no);
    expect(patch.content_hash).toBe(statementContentHash(patch.payload));
    expect(patch.content_hash).not.toBe(inserted.content_hash);
    expect(sb.hasEq("dividend_statements", "project_id", "proj-1")).toBe(true);
    // The returned row is the re-frozen one.
    expect(res.issued[0].payload.drip?.skipped).toBe("cap_table_write_failed");
    expect(res.issued[0].content_hash).toBe(patch.content_hash);
  });

  it("no DRIP context → S25-B behaviour: no allocation reads, no drip block", async () => {
    const sb = fakeSupabase({ dividend_statements: [] });
    const res = await issueStatementsForRecord({ db: sb as never, projectId: "proj-1", userId: "u", company, record: record(), shareholders: holders, creditsCharged: 0, now: NOW });
    expect(res.drip).toEqual([]);
    expect(sb.find("drip_allocations", "select")).toHaveLength(0);
    const stmt = sb.find("dividend_statements", "insert")[0].args[0] as { payload: DividendStatementRow["payload"] };
    expect(stmt.payload.drip).toBeUndefined();
  });
});

describe("recordAlreadyCharged — once-per-record charge marker (S25-review-2 P2)", () => {
  it("true when ANY row (live or voided) carries credits_charged > 0; false for included (0) rows, empty or malformed", () => {
    expect(recordAlreadyCharged([])).toBe(false);
    expect(recordAlreadyCharged([issueSync({ credits_charged: 0 })])).toBe(false);
    expect(recordAlreadyCharged([issueSync({ credits_charged: 2 })])).toBe(true);
    expect(recordAlreadyCharged([issueSync({ credits_charged: 0 }), issueSync({ id: "st-2", credits_charged: 2, voided_at: "2026-07-20T00:00:00Z" })])).toBe(true);
    expect(recordAlreadyCharged([issueSync({ credits_charged: "2" as unknown as number })])).toBe(true);
    expect(recordAlreadyCharged([issueSync({ credits_charged: null as unknown as number })])).toBe(false);
  });
});

describe("voidStatement", () => {
  it("not_found for another project's id, one-way, update contract", async () => {
    const row = { ...issueSync(), id: "st-1", project_id: "proj-1" };
    const sb = fakeSupabase({ dividend_statements: [row] });
    expect(await voidStatement(sb as never, "st-1", "proj-2", "x")).toEqual({ ok: false, error: "not_found" });
    const res = await voidStatement(sb as never, "st-1", "proj-1", "Wrong holding", NOW);
    expect(res.ok).toBe(true);
    const upd = sb.find("dividend_statements", "update")[0].args[0] as Record<string, unknown>;
    expect(upd).toEqual({ voided_at: NOW.toISOString(), void_reason: "Wrong holding" });
    expect(sb.calls.some((c) => c.table === "dividend_statements" && c.op === "is" && c.args[0] === "voided_at")).toBe(true);

    const already = fakeSupabase({ dividend_statements: [{ ...row, voided_at: "2026-07-20T00:00:00Z", void_reason: "r" }] });
    expect(await voidStatement(already as never, "st-1", "proj-1", "again")).toEqual({ ok: false, error: "already_voided" });
  });
});

describe("register + summaries", () => {
  it("registerForRecord totals live statements; summaries expose the download URLs", () => {
    const s1 = { ...issueSync(), id: "st-1" };
    const s2: DividendStatementRow = { ...issueSync(), id: "st-2", statement_no: "DS-CCCCC-DDDDD", voided_at: "2026-07-20T00:00:00Z", void_reason: "dup" };
    const reg = registerForRecord({ name: "Acme", abn: null, acn: null }, record(), [s1, s2], NOW);
    expect(reg.rows).toHaveLength(2);
    expect(reg.totals.statementsIssued).toBe(1);
    expect(reg.totals.statementsVoided).toBe(1);
    expect(reg.totals.grossAud).toBe(30_000);
    expect(reg.reconciled).toBe(false);

    const sum = statementSummary(s1);
    expect(sum.pdfUrl).toBe("/api/dividends/statements/st-1/pdf");
    expect(sum.shareholderName).toBe("Jane Founder");
    expect(sum.grossAud).toBe(30_000);
    expect(sum.voidedAt).toBeNull();

    const rs = recordSummary(record());
    expect(rs.registerUrl).toBe("/api/dividends/rec-1/register.pdf");
    expect(rs.payoutCount).toBe(2);
    expect(rs.totalDividendAud).toBe(50_000);
    expect(rs.companyTaxRate).toBe(0.25);
  });
});
