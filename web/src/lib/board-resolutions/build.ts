// Board resolutions (S26-B) — pure builders for AU circulating resolutions.
//
// A proprietary company's directors may pass a resolution without a meeting
// when all directors entitled to vote sign a document containing a statement
// that they are in favour of it (Corporations Act 2001 (Cth) s 248A —
// replaceable rule; a sole director records the decision under s 248B). The
// three resolutions the cap-table workflow needs:
//
//   share-issue   references a `share_transactions` issue row — class,
//                 number, price, allottee, consideration; reminds the
//                 company to lodge the ASIC change-to-share-structure notice
//                 within 28 days (s 254X, Form 484).
//   dividend      references a `dividend_records` row — amount, per share,
//                 franking %, payment date; carries the s 254T statement
//                 (assets exceed liabilities and the excess is sufficient;
//                 fair and reasonable to shareholders as a whole; does not
//                 materially prejudice the company's ability to pay its
//                 creditors).
//   esop          references the cap-table ESOP pool — pool size, pool %,
//                 vesting defaults when stored (never invented).
//
// Every builder freezes ONE payload (`BoardResolutionPayload`) the PDF
// renders from: entity block from the founder's company, "RESOLVED THAT"
// resolutions, key facts, reminders, and the director signature blocks
// (from the cap table's directors when stored, else blank lines). No I/O.

import { formatAudCents } from "@/lib/dividends/statement";

export const RESOLUTION_VERSION = "br-v1";

export type ResolutionKind = "share-issue" | "dividend" | "esop";
export const RESOLUTION_KINDS: readonly ResolutionKind[] = ["share-issue", "dividend", "esop"] as const;

export function isResolutionKind(v: unknown): v is ResolutionKind {
  return typeof v === "string" && (RESOLUTION_KINDS as readonly string[]).includes(v);
}

export interface ResolutionCompany {
  /** Legal name as entered on the project (never BlockID's own entity). */
  name: string;
  /** Formatted `NNN NNN NNN` or null. */
  acn: string | null;
  /** Formatted `NN NNN NNN NNN` or null. */
  abn: string | null;
  address: string | null;
}

export interface ResolutionDirector {
  name: string;
}

export interface ResolutionFact {
  label: string;
  value: string;
}

export interface BoardResolutionPayload {
  version: typeof RESOLUTION_VERSION;
  kind: ResolutionKind;
  /** The cap-table / dividend / ESOP record the resolution references. */
  recordId: string;
  company: ResolutionCompany;
  /** "Circulating resolution of the directors — issue of shares" */
  title: string;
  /** ISO timestamp the document was prepared. */
  preparedAt: string;
  /** Background lines ("The company proposes to issue …"). */
  recitals: string[];
  /** Each item is one "RESOLVED THAT …" paragraph. */
  resolutions: string[];
  /** Key facts table printed above the resolutions. */
  facts: ResolutionFact[];
  /** Reminders (s 254X notice, register update, …). */
  notes: string[];
  /** Signature blocks; empty → two blank lines. */
  directors: ResolutionDirector[];
  /** Exactly one director stored → s 248B wording. */
  soleDirector: boolean;
  /** Statutory basis line printed under the title. */
  basis: string;
}

/* ── Inputs ───────────────────────────────────────────────────────────── */

export interface ShareIssueRecord {
  id: string;
  /** Allottee (the shareholder the shares were issued to). */
  allotteeName: string;
  allotteeRole: string | null;
  shareClass: string;
  shares: number;
  /** Issue price per share in AUD; null when not recorded. */
  pricePerShareAud: number | null;
  /** Total consideration in AUD; null when not recorded. */
  totalValueAud: number | null;
  roundName: string | null;
  /** `YYYY-MM-DD` */
  effectiveDate: string | null;
  notes: string | null;
}

export interface DividendResolutionRecord {
  id: string;
  /** `YYYY-MM` */
  period: string;
  totalDividendAud: number;
  perShareDividendAud: number;
  frankingPct: number;
  companyTaxRate: number;
  /** `YYYY-MM-DD` or null → "on a date to be fixed by the directors". */
  paidAt: string | null;
  /** Count of paying shareholders on the record. */
  payoutCount: number;
}

export interface EsopPlanRecord {
  id: string;
  totalPoolShares: number;
  allocatedShares: number;
  poolPct: number | null;
  /** Stored vesting defaults; null → "as set out in each offer". */
  vestingMonths: number | null;
  cliffMonths: number | null;
  /** Fully diluted share count when known (for the pool % check). */
  fullyDilutedShares: number | null;
}

export interface BuildArgs<R> {
  company: ResolutionCompany;
  record: R;
  directors: ResolutionDirector[];
  now?: Date;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });

export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : new Date(iso);
  return AU_DATE.format(Number.isNaN(d.getTime()) ? new Date() : d);
}

export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)));
}

function n(v: number): string {
  return Math.round(v).toLocaleString("en-AU");
}

function pct(v: number): string {
  return `${Number.isInteger(v) ? v : Number(v.toFixed(2))}%`;
}

function cleanDirectors(directors: ResolutionDirector[]): ResolutionDirector[] {
  const seen = new Set<string>();
  const out: ResolutionDirector[] = [];
  for (const d of directors) {
    const name = (d?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out;
}

function basisFor(soleDirector: boolean): string {
  return soleDirector
    ? "Sole director's resolution — Corporations Act 2001 (Cth) s 248B. Recorded by the sole director signing this document."
    : "Circulating resolution — Corporations Act 2001 (Cth) s 248A. Passed when signed by all directors entitled to vote on the resolution.";
}

function base<K extends ResolutionKind>(kind: K, title: string, company: ResolutionCompany, recordId: string, directors: ResolutionDirector[], now: Date) {
  const dirs = cleanDirectors(directors);
  const sole = dirs.length === 1;
  return {
    version: RESOLUTION_VERSION,
    kind,
    recordId,
    company: { name: company.name, acn: company.acn ?? null, abn: company.abn ?? null, address: company.address ?? null },
    title,
    preparedAt: now.toISOString(),
    directors: dirs,
    soleDirector: sole,
    basis: basisFor(sole),
  } as const;
}

/* ── (a) Share issue ──────────────────────────────────────────────────── */

export function buildShareIssueResolution({ company, record, directors, now = new Date() }: BuildArgs<ShareIssueRecord>): BoardResolutionPayload {
  const priceKnown = typeof record.pricePerShareAud === "number" && Number.isFinite(record.pricePerShareAud) && record.pricePerShareAud > 0;
  const total = typeof record.totalValueAud === "number" && Number.isFinite(record.totalValueAud) && record.totalValueAud > 0
    ? record.totalValueAud
    : priceKnown
      ? record.pricePerShareAud! * record.shares
      : null;
  const consideration = total != null ? `${formatAudCents(total)} in cash` : "as recorded in the share register (price per share not recorded on the issue)";
  const price = priceKnown ? `A$${record.pricePerShareAud!.toFixed(4)} per share` : "not recorded";
  const when = record.effectiveDate ? longDate(record.effectiveDate) : "the date of this resolution";
  const cls = record.shareClass || "Ordinary";

  const facts: ResolutionFact[] = [
    { label: "Allottee", value: record.allotteeRole ? `${record.allotteeName} (${record.allotteeRole})` : record.allotteeName },
    { label: "Share class", value: cls },
    { label: "Number of shares", value: n(record.shares) },
    { label: "Issue price", value: price },
    { label: "Consideration", value: total != null ? formatAudCents(total) : "not recorded" },
    { label: "Effective date", value: when },
  ];
  if (record.roundName) facts.push({ label: "Round", value: record.roundName });

  const recitals = [
    `${company.name} (the Company) proposes to issue ${n(record.shares)} ${cls} shares to ${record.allotteeName}${record.roundName ? ` as part of the ${record.roundName} round` : ""}.`,
    "The directors have considered the Company's constitution, any shareholders' agreement and the pre-emptive rights (if any) attaching to the existing shares, and are satisfied that the issue may proceed.",
  ];
  if (record.notes) recitals.push(`Notes on the register entry: ${record.notes}`);

  const resolutions = [
    `RESOLVED THAT the Company issue and allot ${n(record.shares)} fully paid ${cls} shares in the capital of the Company to ${record.allotteeName} at ${price}, for a consideration of ${consideration}, with effect from ${when}.`,
    `RESOLVED THAT the shares so issued rank equally in all respects with the existing ${cls} shares of the Company.`,
    `RESOLVED THAT the Company enter the name of ${record.allotteeName} in the register of members in respect of those shares and issue a share certificate or holding statement accordingly.`,
    "RESOLVED THAT any director or the company secretary is authorised to lodge the notice of change to the Company's share structure with ASIC and to do all things necessary to give effect to these resolutions.",
  ];

  const notes = [
    "Lodge ASIC Form 484 (change to company details — share structure and members) within 28 days of the issue (Corporations Act s 254X). Late lodgement attracts ASIC late fees.",
    "Update the register of members (s 168–169) on the date of issue; issue the share certificate or holding statement within 2 months (s 1071H).",
    "Where the allottee is a new investor, confirm the offer relied on a Chapter 6D exemption (for example s 708 small-scale or sophisticated-investor offers).",
  ];

  return { ...base("share-issue", "Circulating resolution of the directors — issue of shares", company, record.id, directors, now), recitals, resolutions, facts, notes };
}

/* ── (b) Dividend ─────────────────────────────────────────────────────── */

export function buildDividendResolution({ company, record, directors, now = new Date() }: BuildArgs<DividendResolutionRecord>): BoardResolutionPayload {
  const franking = Math.max(0, Math.min(100, Number.isFinite(record.frankingPct) ? record.frankingPct : 100));
  const frankingLabel = franking === 100 ? "fully franked" : franking === 0 ? "unfranked" : `franked to ${pct(franking)}`;
  const payDate = record.paidAt ? longDate(record.paidAt) : "a date to be fixed by the directors";
  const taxRate = `${Math.round(record.companyTaxRate * 100)}%`;

  const facts: ResolutionFact[] = [
    { label: "Dividend period", value: periodLabel(record.period) },
    { label: "Total dividend", value: formatAudCents(record.totalDividendAud) },
    { label: "Per share", value: `A$${record.perShareDividendAud.toFixed(6)}` },
    { label: "Franking", value: `${pct(franking)} (${frankingLabel})` },
    { label: "Corporate tax rate for imputation", value: taxRate },
    { label: "Payment date", value: payDate },
    { label: "Paying shareholders", value: n(record.payoutCount) },
  ];

  const recitals = [
    `The directors of ${company.name} (the Company) have considered the Company's financial position for ${periodLabel(record.period)} and the proposal to pay a dividend of ${formatAudCents(record.totalDividendAud)} (${frankingLabel}).`,
    "The directors have reviewed the Company's most recent accounts, its cash flow forecast and its known and contingent liabilities.",
  ];

  const resolutions = [
    "RESOLVED THAT, having reviewed the Company's financial position, the directors are satisfied that immediately before the dividend is declared the Company's assets exceed its liabilities and the excess is sufficient for the payment of the dividend; the payment of the dividend is fair and reasonable to the Company's shareholders as a whole; and the payment of the dividend does not materially prejudice the Company's ability to pay its creditors (Corporations Act 2001 (Cth) s 254T).",
    `RESOLVED THAT a ${frankingLabel} dividend of A$${record.perShareDividendAud.toFixed(6)} per share, totalling ${formatAudCents(record.totalDividendAud)}, be declared in respect of ${periodLabel(record.period)} and paid on ${payDate} to the members registered on that date.`,
    `RESOLVED THAT the dividend be franked at ${pct(franking)} at the corporate tax rate for imputation of ${taxRate}, and that the Company issue a distribution statement to each shareholder in accordance with s 202-80 of the Income Tax Assessment Act 1997 (Cth).`,
    "RESOLVED THAT any director or the company secretary is authorised to make the payment, record the franking debit in the Company's franking account and do all things necessary to give effect to these resolutions.",
  ];

  const notes = [
    "s 254T is tested immediately before the dividend is declared — do not declare before the accounts supporting this resolution are to hand.",
    "Record the franking debit on the payment date; a dividend franked above the benchmark franking percentage for the franking period can breach the benchmark rule (ITAA 1997 Div 203).",
    "Give each shareholder a distribution statement on or before the day the dividend is paid (BlockID's dividend statements produce these).",
  ];

  return { ...base("dividend", "Circulating resolution of the directors — declaration of dividend", company, record.id, directors, now), recitals, resolutions, facts, notes };
}

/* ── (c) ESOP plan adoption ───────────────────────────────────────────── */

export function buildEsopResolution({ company, record, directors, now = new Date() }: BuildArgs<EsopPlanRecord>): BoardResolutionPayload {
  const pool = Math.max(0, Math.round(record.totalPoolShares));
  const poolPct = typeof record.poolPct === "number" && Number.isFinite(record.poolPct) && record.poolPct > 0
    ? record.poolPct
    : record.fullyDilutedShares && record.fullyDilutedShares > 0
      ? Number(((pool / record.fullyDilutedShares) * 100).toFixed(2))
      : null;
  const vestingKnown = typeof record.vestingMonths === "number" && record.vestingMonths > 0;
  const cliffKnown = typeof record.cliffMonths === "number" && record.cliffMonths >= 0;
  const vesting = vestingKnown
    ? `${record.vestingMonths} months${cliffKnown ? ` with a ${record.cliffMonths}-month cliff` : ""}, vesting monthly thereafter unless an offer letter provides otherwise`
    : "as set out in each offer letter made under the Plan";

  const facts: ResolutionFact[] = [
    { label: "Plan", value: `${company.name} Employee Share Option Plan` },
    { label: "Pool size", value: `${n(pool)} shares${poolPct != null ? ` (${pct(poolPct)} of the fully diluted capital)` : ""}` },
    { label: "Already allocated", value: n(Math.max(0, record.allocatedShares)) },
    { label: "Default vesting", value: vesting },
    { label: "Scheme type", value: "Employee share scheme (ITAA 1997 Div 83A; start-up concession where eligible)" },
  ];

  const recitals = [
    `The directors of ${company.name} (the Company) consider it in the Company's interests to adopt an employee share option plan to attract, retain and motivate employees, contractors and directors.`,
    `The Company proposes to reserve ${n(pool)} shares${poolPct != null ? ` (${pct(poolPct)} of the fully diluted capital)` : ""} for issue under the Plan.`,
  ];

  const resolutions = [
    `RESOLVED THAT the Company adopt the ${company.name} Employee Share Option Plan (the Plan) on the terms of the Plan rules tabled with this resolution.`,
    `RESOLVED THAT ${n(pool)} shares in the capital of the Company be reserved for issue on the exercise of options granted under the Plan${poolPct != null ? `, being approximately ${pct(poolPct)} of the fully diluted share capital` : ""}.`,
    `RESOLVED THAT, unless an offer letter provides otherwise, options granted under the Plan vest over ${vesting}.`,
    "RESOLVED THAT the board (or a remuneration committee appointed by it) is authorised to make offers under the Plan, and any director or the company secretary is authorised to do all things necessary to give effect to these resolutions, including issuing offer letters and maintaining the option register.",
  ];

  const notes = [
    "Options issued under an employee share scheme may rely on the ASIC Corporations (Employee Share Schemes) Instrument / Division 1A of Part 7.12 — check the offer cap and disclosure conditions before making offers.",
    "For the Div 83A start-up concession the Company must be unlisted, incorporated for under 10 years, have turnover under A$50M and offer options at or above market value — confirm eligibility with a registered tax agent before granting.",
    "Keep the option register and lodge ASIC notices when options are exercised into shares (s 254X, within 28 days of each issue).",
  ];

  return { ...base("esop", "Circulating resolution of the directors — adoption of employee share option plan", company, record.id, directors, now), recitals, resolutions, facts, notes };
}

/** Public projection for the panel / API. */
export function resolutionSummary(kind: ResolutionKind, recordId: string, extra: { id: string; contentHash: string; issuedAt: string; creditsCharged: number }) {
  return {
    id: extra.id,
    kind,
    recordId,
    contentHash: extra.contentHash,
    issuedAt: extra.issuedAt,
    creditsCharged: extra.creditsCharged,
    pdfUrl: `/api/board-resolutions/${kind}/${recordId}/pdf`,
  };
}

/** "1 credit" / "included in your plan" — the button copy before anything is charged. */
export function resolutionCostLabel(cost: number, included: boolean): string {
  if (included || cost <= 0) return "included in your plan";
  return `${cost} credit${cost === 1 ? "" : "s"}`;
}
