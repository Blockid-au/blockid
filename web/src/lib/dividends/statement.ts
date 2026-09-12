// Shareholder distribution statement — pure maths + payload (S25-B).
//
// Builds, from one `dividend_records` row + one of its `payouts[]` + the
// matching cap-table shareholder + the founder's company details, the
// statement an Australian company gives a shareholder when it pays a
// dividend (ITAA 1997 Subdiv 202-E, s 202-80; Corporations Act 2001 (Cth)
// s 254W on class rights). Every required field of a distribution
// statement is on the payload:
//
//   entity name + ABN (ACN when entered)      → `entity`
//   date of payment                           → `dividend.paidAt`
//   amount of the dividend                    → `amounts.grossAud`
//   franked amount / unfranked amount         → `amounts.frankedAud` / `.unfrankedAud`
//   franking credit                           → `amounts.frankingCreditAud`
//   franking percentage                       → `amounts.frankingPct`
//   corporate tax rate for imputation         → `dividend.companyTaxRate` (25 % base rate entity / 30 %)
//   TFN amount withheld (if any)              → `amounts.tfnWithheldAud`
//   shareholder name + holding                → `shareholder`
//   statement date                            → `statementDate`
//
// Franking maths reconciles with `lib/dividends.ts` (`calculateDividends`):
//   frankingCredit = frankedAmount × taxRate / (1 − taxRate)
// so a fully-franked statement carries exactly the payout's franking credit.
// Every A$ figure is rounded to cents; `totals` re-adds the parts so a
// rounding drift is visible instead of silent.
//
// No `server-only`, no I/O: the PDF renderer, the routes and the suites all
// call `buildDividendStatement` / `buildDividendRegister` on plain data.

import type { DividendPayout } from "@/lib/dividends";

export const STATEMENT_VERSION = "ds-v1";

/**
 * TFN withholding rate on the UNFRANKED part of a dividend paid to a
 * shareholder who has not quoted a TFN (or ABN) to the company — ITAA 1936
 * Pt VA / TAA 1953 Sch 1 s 12-140: the top marginal rate (45 %) plus the
 * Medicare levy (2 %) = 47 %, unchanged for 2024-25 and 2025-26. Fully
 * franked dividends are not subject to TFN withholding, so the franked part
 * is never touched. Confirm against the ATO rate table when the marginal
 * rates change.
 */
export const TFN_WITHHOLDING_RATE = 0.47;

/** AU corporate tax rates for imputation purposes. */
export const AU_BASE_RATE_ENTITY_TAX = 0.25;
export const AU_FULL_CORPORATE_TAX_RATE = 0.3;

/* ── Inputs ───────────────────────────────────────────────────────────── */

export interface StatementCompany {
  /** Legal name as entered by the founder (never BlockID's own entity). */
  name: string;
  /** Formatted `NN NNN NNN NNN` or null when not supplied. */
  abn: string | null;
  /** Formatted `NNN NNN NNN` or null. */
  acn: string | null;
  /** Free-text registered office / address line, when known. */
  address?: string | null;
}

export interface StatementDividendRecord {
  id: string;
  /** `YYYY-MM` */
  period: string;
  /** ISO timestamp the record was created (the declaration). */
  createdAt: string;
  /** `YYYY-MM-DD` date paid; null → last day of `period`. */
  paidAt?: string | null;
  totalDividendAud: number;
  perShareDividendAud: number;
  /** 0.25 or 0.30 — `dividend_records.franking_rate`. */
  companyTaxRate: number;
  /** 0–100; default 100 (fully franked). */
  frankingPct?: number | null;
  /** 0 → statutory `TFN_WITHHOLDING_RATE`. */
  tfnWithholdingRate?: number | null;
}

export interface StatementShareholder {
  id: string | null;
  name: string;
  role: string;
  shareClass?: string | null;
  sharesHeld: number;
  /** Has the shareholder quoted a TFN / ABN to the company? */
  tfnOnFile: boolean;
}

export interface BuildStatementInput {
  company: StatementCompany;
  record: StatementDividendRecord;
  payout: Pick<DividendPayout, "name" | "role" | "shares" | "ownershipPct" | "grossDividend" | "frankingCredit">;
  shareholder: StatementShareholder;
  /** Statement date; defaults to now. */
  now?: Date;
}

/* ── Payload ──────────────────────────────────────────────────────────── */

export interface StatementAmounts {
  grossAud: number;
  frankedAud: number;
  unfrankedAud: number;
  frankingPct: number;
  frankingCreditAud: number;
  /** Rate actually applied (0 when the shareholder has a TFN or nothing is unfranked). */
  tfnWithholdingRate: number;
  tfnWithheldAud: number;
  /** Cash paid = gross − TFN withheld. */
  netPaidAud: number;
  /** Assessable = gross + franking credit (the shareholder's tax-return figure). */
  grossedUpAud: number;
}

export interface StatementTotalsCheck {
  /** franked + unfranked === gross (to the cent). */
  partsSumToGross: boolean;
  /** gross − withheld === netPaid. */
  netReconciles: boolean;
  /** franking credit === franked × r/(1−r) rounded. */
  creditReconciles: boolean;
  ok: boolean;
}

export interface DividendStatementPayload {
  version: typeof STATEMENT_VERSION;
  statementNo: string;
  /** ISO timestamp the statement was made. */
  statementDate: string;
  entity: StatementCompany & { isBaseRateEntity: boolean };
  dividend: {
    recordId: string;
    period: string;
    declaredAt: string;
    /** `YYYY-MM-DD` */
    paidAt: string;
    perShareAud: number;
    totalDividendAud: number;
    companyTaxRate: number;
    /** taxRate / (1 − taxRate), 6 dp — the credit per $1 franked. */
    frankingCreditRate: number;
    frankingPct: number;
  };
  shareholder: {
    id: string | null;
    name: string;
    role: string;
    shareClass: string | null;
    sharesHeld: number;
    ownershipPct: number;
    tfnOnFile: boolean;
  };
  amounts: StatementAmounts;
  totals: StatementTotalsCheck;
  notes: string[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clampPct(v: number | null | undefined, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

/** Exact credit multiplier r / (1 − r) — used for the maths (never the 6-dp display value). */
function creditMultiplier(taxRate: number): number {
  if (!(taxRate > 0 && taxRate < 1)) return 0;
  return taxRate / (1 - taxRate);
}

/** Credit per $1 of franked dividend at `taxRate`: r / (1 − r), 6 dp (display / payload only). */
export function frankingCreditRate(taxRate: number): number {
  return round6(creditMultiplier(taxRate));
}

/** `YYYY-MM` → last calendar day of that month as `YYYY-MM-DD`. */
export function periodEndDate(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? "");
  if (!m) return new Date().toISOString().slice(0, 10);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
}

export function isBaseRateEntity(taxRate: number): boolean {
  return Math.abs(taxRate - AU_BASE_RATE_ENTITY_TAX) < 1e-6;
}

export function formatAbn(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

export function formatAcn(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `A$1,234.56` — the statement's money format. */
export function formatAudCents(v: number): string {
  const cents = roundCents(v);
  const body = AUD.format(Math.abs(cents)).replace(/^A?\$/, "");
  return `${cents < 0 ? "-" : ""}A$${body}`;
}

/** Idempotency key for a (record, shareholder) pair. */
export function shareholderKey(sh: { id: string | null; name: string }): string {
  if (sh.id) return `id:${sh.id}`;
  return `name:${sh.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/* ── Maths ────────────────────────────────────────────────────────────── */

export interface ComputeAmountsInput {
  grossAud: number;
  companyTaxRate: number;
  /** 0–100 */
  frankingPct: number;
  tfnOnFile: boolean;
  /** 0 → statutory rate. */
  tfnWithholdingRate?: number | null;
}

/**
 * Franked / unfranked split, franking credit, TFN withholding, net cash and
 * grossed-up amount — all to cents.
 */
export function computeStatementAmounts(input: ComputeAmountsInput): StatementAmounts {
  const gross = roundCents(Math.max(0, input.grossAud));
  const pct = clampPct(input.frankingPct, 100);
  const franked = roundCents(gross * (pct / 100));
  const unfranked = roundCents(gross - franked);
  const frankingCredit = roundCents(franked * creditMultiplier(input.companyTaxRate));

  const configured = input.tfnWithholdingRate;
  const statutory = typeof configured === "number" && configured > 0 ? Math.min(1, configured) : TFN_WITHHOLDING_RATE;
  const withholdingApplies = !input.tfnOnFile && unfranked > 0;
  const tfnRate = withholdingApplies ? statutory : 0;
  const withheld = withholdingApplies ? roundCents(unfranked * tfnRate) : 0;

  return {
    grossAud: gross,
    frankedAud: franked,
    unfrankedAud: unfranked,
    frankingPct: pct,
    frankingCreditAud: frankingCredit,
    tfnWithholdingRate: tfnRate,
    tfnWithheldAud: withheld,
    netPaidAud: roundCents(gross - withheld),
    grossedUpAud: roundCents(gross + frankingCredit),
  };
}

export function checkStatementTotals(a: StatementAmounts, companyTaxRate: number): StatementTotalsCheck {
  const partsSumToGross = roundCents(a.frankedAud + a.unfrankedAud) === a.grossAud;
  const netReconciles = roundCents(a.grossAud - a.tfnWithheldAud) === a.netPaidAud;
  const creditReconciles = roundCents(a.frankedAud * creditMultiplier(companyTaxRate)) === a.frankingCreditAud;
  return { partsSumToGross, netReconciles, creditReconciles, ok: partsSumToGross && netReconciles && creditReconciles };
}

/* ── Statement ────────────────────────────────────────────────────────── */

export function statementNotes(p: { isBaseRateEntity: boolean; amounts: StatementAmounts; shareholder: { tfnOnFile: boolean } }): string[] {
  const notes: string[] = [];
  const rate = p.isBaseRateEntity ? "25% (base rate entity)" : "30%";
  notes.push(`Franking credit calculated at the corporate tax rate for imputation purposes of ${rate}.`);
  if (p.amounts.frankingPct >= 100) notes.push("This dividend is fully franked.");
  else if (p.amounts.frankingPct <= 0) notes.push("This dividend is unfranked.");
  else notes.push(`This dividend is ${p.amounts.frankingPct}% franked.`);
  if (p.amounts.tfnWithheldAud > 0) {
    notes.push(
      `No TFN or ABN was quoted, so ${Math.round(p.amounts.tfnWithholdingRate * 100)}% was withheld from the unfranked amount and will be remitted to the ATO; claim it in your tax return.`,
    );
  } else if (!p.shareholder.tfnOnFile) {
    notes.push("No TFN withholding applies because the dividend has no unfranked amount.");
  }
  notes.push("Keep this statement for your tax return; the franking credit is claimed as a tax offset.");
  return notes;
}

/**
 * Build the frozen statement payload for one payout. `statementNo` is
 * assigned by the server (`lib/dividends/server.ts`) — the builder stamps
 * the placeholder so the pure suites and the PDF can run without a DB.
 */
export function buildDividendStatement(input: BuildStatementInput, statementNo = "DS-00000-00000"): DividendStatementPayload {
  const now = input.now ?? new Date();
  const taxRate = input.record.companyTaxRate;
  const frankingPct = clampPct(input.record.frankingPct, 100);
  const amounts = computeStatementAmounts({
    grossAud: input.payout.grossDividend,
    companyTaxRate: taxRate,
    frankingPct,
    tfnOnFile: input.shareholder.tfnOnFile,
    tfnWithholdingRate: input.record.tfnWithholdingRate,
  });
  const base = isBaseRateEntity(taxRate);
  const totals = checkStatementTotals(amounts, taxRate);
  const shareholder = {
    id: input.shareholder.id,
    name: input.shareholder.name.trim() || input.payout.name,
    role: input.shareholder.role || input.payout.role,
    shareClass: input.shareholder.shareClass ?? null,
    sharesHeld: Number.isFinite(input.shareholder.sharesHeld) && input.shareholder.sharesHeld > 0 ? input.shareholder.sharesHeld : input.payout.shares,
    ownershipPct: roundCents(input.payout.ownershipPct),
    tfnOnFile: input.shareholder.tfnOnFile,
  };
  return {
    version: STATEMENT_VERSION,
    statementNo,
    statementDate: now.toISOString(),
    entity: {
      name: input.company.name.trim(),
      abn: input.company.abn,
      acn: input.company.acn,
      address: input.company.address ?? null,
      isBaseRateEntity: base,
    },
    dividend: {
      recordId: input.record.id,
      period: input.record.period,
      declaredAt: input.record.createdAt,
      paidAt: input.record.paidAt || periodEndDate(input.record.period),
      perShareAud: round6(input.record.perShareDividendAud),
      totalDividendAud: roundCents(input.record.totalDividendAud),
      companyTaxRate: taxRate,
      frankingCreditRate: frankingCreditRate(taxRate),
      frankingPct,
    },
    shareholder,
    amounts,
    totals,
    notes: statementNotes({ isBaseRateEntity: base, amounts, shareholder }),
  };
}

/* ── Register ─────────────────────────────────────────────────────────── */

export interface RegisterRow {
  statementNo: string | null;
  status: "issued" | "voided" | "not_issued";
  shareholder: string;
  role: string;
  sharesHeld: number;
  ownershipPct: number;
  grossAud: number;
  frankedAud: number;
  unfrankedAud: number;
  frankingCreditAud: number;
  tfnWithheldAud: number;
  netPaidAud: number;
  tfnOnFile: boolean;
}

export interface DividendRegisterPayload {
  version: typeof STATEMENT_VERSION;
  generatedAt: string;
  entity: StatementCompany & { isBaseRateEntity: boolean };
  dividend: DividendStatementPayload["dividend"];
  rows: RegisterRow[];
  totals: {
    grossAud: number;
    frankedAud: number;
    unfrankedAud: number;
    frankingCreditAud: number;
    tfnWithheldAud: number;
    netPaidAud: number;
    sharesHeld: number;
    statementsIssued: number;
    statementsVoided: number;
  };
  /** |Σ gross − record total| ≤ 1 cent per row. */
  reconciled: boolean;
  varianceAud: number;
}

export interface RegisterStatementRef {
  payload: DividendStatementPayload;
  statementNo: string;
  voidedAt: string | null;
}

/**
 * Build the register from the statements issued for a dividend. Every
 * statement (issued or voided) is a row; totals count LIVE statements only so
 * a re-issued shareholder is not double-counted.
 */
export function buildDividendRegister(input: {
  company: StatementCompany;
  record: StatementDividendRecord;
  statements: RegisterStatementRef[];
  now?: Date;
}): DividendRegisterPayload {
  const now = input.now ?? new Date();
  const taxRate = input.record.companyTaxRate;
  const rows: RegisterRow[] = input.statements.map((s) => ({
    statementNo: s.statementNo,
    status: s.voidedAt ? "voided" : "issued",
    shareholder: s.payload.shareholder.name,
    role: s.payload.shareholder.role,
    sharesHeld: s.payload.shareholder.sharesHeld,
    ownershipPct: s.payload.shareholder.ownershipPct,
    grossAud: s.payload.amounts.grossAud,
    frankedAud: s.payload.amounts.frankedAud,
    unfrankedAud: s.payload.amounts.unfrankedAud,
    frankingCreditAud: s.payload.amounts.frankingCreditAud,
    tfnWithheldAud: s.payload.amounts.tfnWithheldAud,
    netPaidAud: s.payload.amounts.netPaidAud,
    tfnOnFile: s.payload.shareholder.tfnOnFile,
  }));
  const live = rows.filter((r) => r.status === "issued");
  const sum = (k: keyof Pick<RegisterRow, "grossAud" | "frankedAud" | "unfrankedAud" | "frankingCreditAud" | "tfnWithheldAud" | "netPaidAud" | "sharesHeld">) =>
    roundCents(live.reduce((acc, r) => acc + (r[k] as number), 0));
  const totals = {
    grossAud: sum("grossAud"),
    frankedAud: sum("frankedAud"),
    unfrankedAud: sum("unfrankedAud"),
    frankingCreditAud: sum("frankingCreditAud"),
    tfnWithheldAud: sum("tfnWithheldAud"),
    netPaidAud: sum("netPaidAud"),
    sharesHeld: live.reduce((acc, r) => acc + r.sharesHeld, 0),
    statementsIssued: live.length,
    statementsVoided: rows.length - live.length,
  };
  const recordTotal = roundCents(input.record.totalDividendAud);
  const variance = roundCents(totals.grossAud - recordTotal);
  const tolerance = Math.max(0.01, 0.01 * Math.max(1, live.length));
  return {
    version: STATEMENT_VERSION,
    generatedAt: now.toISOString(),
    entity: { ...input.company, address: input.company.address ?? null, isBaseRateEntity: isBaseRateEntity(taxRate) },
    dividend: {
      recordId: input.record.id,
      period: input.record.period,
      declaredAt: input.record.createdAt,
      paidAt: input.record.paidAt || periodEndDate(input.record.period),
      perShareAud: round6(input.record.perShareDividendAud),
      totalDividendAud: recordTotal,
      companyTaxRate: taxRate,
      frankingCreditRate: frankingCreditRate(taxRate),
      frankingPct: clampPct(input.record.frankingPct, 100),
    },
    rows,
    totals,
    reconciled: live.length === 0 ? true : Math.abs(variance) <= tolerance,
    varianceAud: variance,
  };
}

/** Cost line for the issue button — "2 credits" or "included". */
export function statementCostLabel(cost: number, included: boolean): string {
  if (included || cost <= 0) return "included in your plan";
  return `${cost} credit${cost === 1 ? "" : "s"}`;
}
