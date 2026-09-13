// Shareholder annual tax statements — pure financial-year aggregation (S28-A).
//
// From the issued (non-void) distribution statements of a project
// (`dividend_statements.payload`, S25-B) build, for one Australian financial
// year (1 July – 30 June), one summary per shareholder:
//
//   total unfranked / franked dividends, franking credits, TFN amounts
//   withheld, net cash, grossed-up (assessable) amount, the number of
//   distributions, the per-distribution table with payment dates, and the
//   DRIP shares allotted (S28-A) — the figures the shareholder carries into
//   their return and the company may report to the ATO.
//
// FY membership is decided by the DATE OF PAYMENT (`dividend.paidAt`), read
// as a calendar date in Australia/Sydney: a payment stamped 30 Jun 23:59
// AEST (13:59Z) belongs to the FY ending that day; 1 Jul 00:30 AEST (30 Jun
// 14:30Z) opens the next one. `YYYY-MM-DD` strings are taken as-is.
//
// No `server-only`, no I/O: the PDF renderer, the routes and the suites all
// call `summariseFinancialYear` / `buildShareholderTaxStatement` on plain
// data. Every A$ figure is rounded to cents; totals re-add the parts.

import { formatAudCents, roundCents, shareholderKey, type DividendStatementPayload, type StatementCompany } from "./statement";

export const TAX_STATEMENT_VERSION = "ts-v1";

/** `YYYY-YY` — 2025-26 is 1 Jul 2025 – 30 Jun 2026. */
export const FY_LABEL_RE = /^(\d{4})-(\d{2})$/;
export const TAX_STATEMENT_NO_RE = /^TS-\d{4}-\d{2}-\d{1,6}$/;

export interface FinancialYear {
  label: string;
  startYear: number;
  endYear: number;
  /** `YYYY-07-01` */
  start: string;
  /** `YYYY-06-30` */
  end: string;
}

export function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2025-26" → the FY; null for a malformed label or a non-consecutive pair. */
export function parseFy(label: string | null | undefined): FinancialYear | null {
  const m = FY_LABEL_RE.exec((label ?? "").trim());
  if (!m) return null;
  const startYear = Number(m[1]);
  if (startYear < 1990 || startYear > 2200) return null;
  if (Number(m[2]) !== (startYear + 1) % 100) return null;
  return { label: fyLabel(startYear), startYear, endYear: startYear + 1, start: `${startYear}-07-01`, end: `${startYear + 1}-06-30` };
}

const SYDNEY_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar date (`YYYY-MM-DD`) of an ISO timestamp in Australia/Sydney; a date-only string passes through. */
export function sydneyDate(iso: string): string | null {
  const s = (iso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return SYDNEY_YMD.format(d); // en-CA → YYYY-MM-DD
}

/** The FY label a payment date falls in (Sydney calendar date); null when unparseable. */
export function fyOfDate(iso: string): string | null {
  const ymd = sydneyDate(iso);
  if (!ymd) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  return fyLabel(month >= 7 ? year : year - 1);
}

/** The FY in progress on `now` (Sydney). */
export function currentFy(now: Date = new Date()): string {
  return fyOfDate(now.toISOString()) ?? fyLabel(now.getUTCFullYear());
}

/** The last COMPLETED FY on `now` — the default the picker opens on. */
export function lastCompletedFy(now: Date = new Date()): string {
  const cur = parseFy(currentFy(now));
  return fyLabel((cur?.startYear ?? now.getUTCFullYear()) - 1);
}

/* ── Inputs ───────────────────────────────────────────────────────────── */

export interface FyStatementRef {
  id?: string | null;
  statementNo: string;
  payload: DividendStatementPayload;
  voidedAt: string | null;
}

/* ── Output ───────────────────────────────────────────────────────────── */

export interface FyDistributionRow {
  statementId: string | null;
  statementNo: string;
  recordId: string;
  period: string;
  /** `YYYY-MM-DD` date of payment. */
  paidAt: string;
  frankingPct: number;
  companyTaxRate: number;
  grossAud: number;
  frankedAud: number;
  unfrankedAud: number;
  frankingCreditAud: number;
  tfnWithheldAud: number;
  netPaidAud: number;
  /** DRIP shares allotted from this distribution (0 when none). */
  dripShares: number;
  dripReinvestedAud: number;
}

export interface FyTotals {
  grossAud: number;
  frankedAud: number;
  unfrankedAud: number;
  frankingCreditAud: number;
  tfnWithheldAud: number;
  netPaidAud: number;
  /** gross + franking credits — the assessable figure. */
  grossedUpAud: number;
  distributions: number;
  dripShares: number;
  dripReinvestedAud: number;
}

export interface FyShareholderSummary {
  shareholderKey: string;
  shareholderId: string | null;
  name: string;
  role: string;
  shareClass: string | null;
  /** Holding on the latest distribution of the year. */
  sharesHeld: number;
  /** TFN / ABN quoted on the latest distribution. */
  tfnOnFile: boolean;
  distributions: FyDistributionRow[];
  totals: FyTotals;
}

export interface FySummary {
  fy: FinancialYear;
  shareholders: FyShareholderSummary[];
  /** Statements left out and why — for the panel's "n voided / n outside the year" line. */
  excluded: { voided: number; outsideFy: number; undated: number };
}

const ZERO_TOTALS: FyTotals = { grossAud: 0, frankedAud: 0, unfrankedAud: 0, frankingCreditAud: 0, tfnWithheldAud: 0, netPaidAud: 0, grossedUpAud: 0, distributions: 0, dripShares: 0, dripReinvestedAud: 0 };

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function sumFyTotals(rows: FyDistributionRow[]): FyTotals {
  const t = { ...ZERO_TOTALS };
  for (const r of rows) {
    t.grossAud += r.grossAud;
    t.frankedAud += r.frankedAud;
    t.unfrankedAud += r.unfrankedAud;
    t.frankingCreditAud += r.frankingCreditAud;
    t.tfnWithheldAud += r.tfnWithheldAud;
    t.netPaidAud += r.netPaidAud;
    t.dripShares += r.dripShares;
    t.dripReinvestedAud += r.dripReinvestedAud;
  }
  t.grossAud = roundCents(t.grossAud);
  t.frankedAud = roundCents(t.frankedAud);
  t.unfrankedAud = roundCents(t.unfrankedAud);
  t.frankingCreditAud = roundCents(t.frankingCreditAud);
  t.tfnWithheldAud = roundCents(t.tfnWithheldAud);
  t.netPaidAud = roundCents(t.netPaidAud);
  t.dripReinvestedAud = roundCents(t.dripReinvestedAud);
  t.grossedUpAud = roundCents(t.grossAud + t.frankingCreditAud);
  t.distributions = rows.length;
  return t;
}

/**
 * Group the LIVE statements paid inside `fy` by shareholder. Statements are
 * ordered by payment date (then statement number) inside each summary;
 * summaries are ordered by name.
 */
export function summariseFinancialYear(input: { fy: string; statements: FyStatementRef[] }): FySummary | null {
  const fy = parseFy(input.fy);
  if (!fy) return null;
  const excluded = { voided: 0, outsideFy: 0, undated: 0 };
  const byKey = new Map<string, FyShareholderSummary>();

  for (const s of input.statements) {
    if (!s || !s.payload) continue;
    if (s.voidedAt) {
      excluded.voided++;
      continue;
    }
    const paidAt = sydneyDate(s.payload.dividend?.paidAt ?? "");
    if (!paidAt) {
      excluded.undated++;
      continue;
    }
    if (fyOfDate(paidAt) !== fy.label) {
      excluded.outsideFy++;
      continue;
    }
    const sh = s.payload.shareholder;
    const key = shareholderKey({ id: sh.id, name: sh.name });
    const a = s.payload.amounts;
    const drip = s.payload.drip ?? null;
    const row: FyDistributionRow = {
      statementId: s.id ?? null,
      statementNo: s.statementNo,
      recordId: s.payload.dividend.recordId,
      period: s.payload.dividend.period,
      paidAt,
      frankingPct: num(a.frankingPct),
      companyTaxRate: num(s.payload.dividend.companyTaxRate),
      grossAud: roundCents(num(a.grossAud)),
      frankedAud: roundCents(num(a.frankedAud)),
      unfrankedAud: roundCents(num(a.unfrankedAud)),
      frankingCreditAud: roundCents(num(a.frankingCreditAud)),
      tfnWithheldAud: roundCents(num(a.tfnWithheldAud)),
      netPaidAud: roundCents(num(a.netPaidAud)),
      dripShares: drip && drip.shares > 0 ? Math.floor(num(drip.shares)) : 0,
      dripReinvestedAud: drip && drip.shares > 0 ? roundCents(num(drip.reinvestedAud)) : 0,
    };
    const have = byKey.get(key);
    if (have) {
      have.distributions.push(row);
    } else {
      byKey.set(key, {
        shareholderKey: key,
        shareholderId: sh.id ?? null,
        name: sh.name,
        role: sh.role,
        shareClass: sh.shareClass ?? null,
        sharesHeld: num(sh.sharesHeld),
        tfnOnFile: Boolean(sh.tfnOnFile),
        distributions: [row],
        totals: { ...ZERO_TOTALS },
      });
    }
  }

  const shareholders = [...byKey.values()].map((sh) => {
    sh.distributions.sort((x, y) => x.paidAt.localeCompare(y.paidAt) || x.statementNo.localeCompare(y.statementNo));
    // Holding / TFN flag as at the LATEST distribution of the year.
    const latest = input.statements.find((s) => s.statementNo === sh.distributions[sh.distributions.length - 1].statementNo);
    if (latest) {
      sh.sharesHeld = num(latest.payload.shareholder.sharesHeld);
      sh.tfnOnFile = Boolean(latest.payload.shareholder.tfnOnFile);
      sh.shareClass = latest.payload.shareholder.shareClass ?? sh.shareClass;
    }
    sh.totals = sumFyTotals(sh.distributions);
    return sh;
  });
  shareholders.sort((x, y) => x.name.localeCompare(y.name, "en-AU"));
  return { fy, shareholders, excluded };
}

/* ── Statement payload ────────────────────────────────────────────────── */

export interface ShareholderTaxStatementPayload {
  version: typeof TAX_STATEMENT_VERSION;
  /** `TS-<FY>-<n>` */
  statementNo: string;
  /** ISO timestamp the statement was generated. */
  statementDate: string;
  fy: FinancialYear;
  entity: StatementCompany;
  shareholder: {
    id: string | null;
    key: string;
    name: string;
    role: string;
    shareClass: string | null;
    sharesHeld: number;
    tfnOnFile: boolean;
  };
  distributions: FyDistributionRow[];
  totals: FyTotals;
  /** Σ per-row parts re-add to the totals (to the cent). */
  reconciled: boolean;
  notes: string[];
}

/**
 * The standard wording — general information, not tax advice. The company
 * (not BlockID) is the reporting entity; nothing here asserts that a
 * report HAS been lodged.
 */
export const TAX_STATEMENT_ATO_NOTE =
  "The amounts on this statement may be reported to the Australian Taxation Office (ATO) by the company. Include the franked and unfranked dividends and the franking credits as assessable income in your income tax return for the year, and claim the franking credits as a tax offset where you are eligible (holding-period and other integrity rules apply).";

export const TAX_STATEMENT_GENERAL_NOTE =
  "This annual statement is general information only, prepared from the distribution statements the company issued during the financial year — it is not tax advice. Confirm your position with a registered tax agent before lodging.";

export function taxStatementNotes(sh: Pick<FyShareholderSummary, "tfnOnFile" | "totals">): string[] {
  const notes: string[] = [TAX_STATEMENT_ATO_NOTE];
  if (sh.totals.tfnWithheldAud > 0) {
    notes.push(
      `No TFN or ABN was quoted for one or more distributions, so ${formatAudCents(sh.totals.tfnWithheldAud)} was withheld from the unfranked amounts and remitted to the ATO; claim it as a credit in your tax return.`,
    );
  } else if (!sh.tfnOnFile) {
    notes.push("No TFN withholding applied because the distributions carried no unfranked amount.");
  }
  if (sh.totals.dripShares > 0) {
    notes.push(
      `${sh.totals.dripShares.toLocaleString("en-AU")} shares were allotted under the dividend reinvestment plan for ${formatAudCents(sh.totals.dripReinvestedAud)} of the net dividends. A reinvested dividend is still a dividend for tax purposes; the amount applied generally forms the cost base of the new shares.`,
    );
  }
  notes.push(TAX_STATEMENT_GENERAL_NOTE);
  return notes;
}

export function buildShareholderTaxStatement(
  input: { company: StatementCompany; summary: FyShareholderSummary; fy: FinancialYear; now?: Date },
  statementNo = "TS-0000-00-0",
): ShareholderTaxStatementPayload {
  const now = input.now ?? new Date();
  const sh = input.summary;
  const totals = sumFyTotals(sh.distributions);
  const reconciled =
    roundCents(totals.frankedAud + totals.unfrankedAud) === totals.grossAud &&
    roundCents(totals.grossAud - totals.tfnWithheldAud) === totals.netPaidAud &&
    roundCents(totals.grossAud + totals.frankingCreditAud) === totals.grossedUpAud;
  return {
    version: TAX_STATEMENT_VERSION,
    statementNo,
    statementDate: now.toISOString(),
    fy: input.fy,
    entity: { name: input.company.name.trim(), abn: input.company.abn, acn: input.company.acn, address: input.company.address ?? null },
    shareholder: { id: sh.shareholderId, key: sh.shareholderKey, name: sh.name, role: sh.role, shareClass: sh.shareClass, sharesHeld: sh.sharesHeld, tfnOnFile: sh.tfnOnFile },
    distributions: sh.distributions,
    totals,
    reconciled,
    notes: taxStatementNotes({ tfnOnFile: sh.tfnOnFile, totals }),
  };
}

/** `TS-2025-26-3` — per-project sequence inside the FY. */
export function taxStatementNumber(fy: string, n: number): string {
  return `TS-${fy}-${Math.max(1, Math.floor(n))}`;
}

/** Cost line for the generate button — "2 credits" or "included". */
export function taxStatementCostLabel(cost: number, included: boolean): string {
  if (included || cost <= 0) return "included in your plan";
  return `${cost} credit${cost === 1 ? "" : "s"} per financial year`;
}

/** FY picker options: every FY with a statement, plus the current and last completed year, newest first. */
export function fyOptions(statements: Array<{ payload: DividendStatementPayload }>, now: Date = new Date()): string[] {
  const set = new Set<string>([currentFy(now), lastCompletedFy(now)]);
  for (const s of statements) {
    const fy = fyOfDate(s.payload?.dividend?.paidAt ?? "");
    if (fy) set.add(fy);
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}
