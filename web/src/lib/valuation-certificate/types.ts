// Valuation certificate (S22-A) — the client-safe half: the data shape a
// certificate is issued from, the approved copy it carries, and the pure
// helpers the dashboard panel and the renderer share.
//
// A certificate is a SNAPSHOT: the payload below is frozen at issue time,
// hashed (./hash.ts) and stored on `valuation_certificates.payload`
// (migration 0341). The PDF, the verify page and the data-room copy are all
// rendered from that stored payload, never recomputed — so what an investor
// holds can be checked byte-for-byte against what BlockID issued.
//
// Approved sentences (memory / SOT — do not paraphrase):
//   - the doctoral sentence: "grounded in the founder's doctoral research
//     (DBA) on startup valuation" — never "PhD";
//   - the data principle sentence (feedback_data_principle);
//   - the legal / billing entity is Auschain PTY LTD (ACN 659 615 111,
//     ABN 79 659 615 111) — the marketing brand (PPL Food PTY LTD) never
//     appears on a certificate.

import type { ValuationMethod } from "@/lib/valuation-mrr-bridge";

export const CERTIFICATE_VERSION = "vc-1";

export const DIMENSION_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  ftv: 15,
  mpc: 18,
  ptd: 12,
  tre: 20,
  cgh: 12,
  iri: 10,
  lco: 8,
  svm: 5,
};

export interface CertificateDimension {
  key: DimensionKey;
  label: string;
  /** 0–100 sub-score. */
  score: number;
  /** Weight in the composite (percent). */
  weightPct: number;
}

export interface CertificateEvidenceSummary {
  total: number;
  /** Rows with `verified_at` set. */
  verified: number;
  /** Count per `svi_evidence.evidence_type` (document_uploaded, public_url, connected_source, …). */
  byCategory: Array<{ category: string; count: number }>;
  /** Count per dimension key the evidence was filed under. */
  byDimension: Array<{ dimension: DimensionKey; count: number }>;
  /** ISO timestamp of the newest `verified_at`, null when nothing is verified. */
  lastVerifiedAt: string | null;
}

export interface CertificateConnectedRevenue {
  provider: "stripe" | "xero";
  mrrAud: number;
  arrAud: number;
  capturedAt: string;
  /** Human line, e.g. "Includes connected revenue (A$8.2K MRR from Stripe)". */
  label: string;
}

export interface CertificateSectorMultiple {
  /** Sector key the multiples were looked up under ("default" when unknown). */
  sector: string;
  low: number;
  mid: number;
  high: number;
  /** Citation for the multiple range (SECTOR_MULTIPLES[sector].source). */
  source: string;
}

/**
 * Everything printed on the certificate. Frozen at issue; hashed as-is.
 * Keep every field JSON-serialisable (no Dates) so the canonical form is
 * stable across the issue route, the verify page and the tests.
 */
export interface ValuationCertificateData {
  version: typeof CERTIFICATE_VERSION;
  certificateNo: string;
  issuedAt: string;
  startupName: string;
  /** Formatted "12 345 678 901" when known, else null. */
  abn: string | null;
  stageLabel: string | null;
  sviScore: number;
  sviVersion: string | null;
  valuation: {
    lowAud: number;
    midAud: number;
    highAud: number;
    method: ValuationMethod;
    methodNote: string | null;
  };
  connectedRevenue: CertificateConnectedRevenue | null;
  sectorMultiple: CertificateSectorMultiple;
  dimensions: CertificateDimension[];
  evidence: CertificateEvidenceSummary;
  /** Public verify URL printed on the cover. */
  verifyUrl: string;
  /** Optional provenance — which score snapshot the figures were read from. */
  scoreHistoryId: string | null;
  /**
   * S27-A — optional ESS start-up concession annex (Div 83A ITAA 1997),
   * frozen with the rest of the payload when the founder asks for it at
   * issue. Absent / null on certificates issued without it.
   */
  ess?: CertificateEssAnnex | null;
}

/* ── ESS annex (S27-A) ────────────────────────────────────────────────── */

export const ESS_ANNEX_VERSION = "ess-1";

/** Company facts the project already stores (project_grant_profiles + cap table). Null = not recorded. */
export interface CertificateEssFacts {
  /** ISO date (YYYY-MM-DD) from project_grant_profiles.incorporated_at. */
  incorporatedAt: string | null;
  /** Whole years between incorporation and the issue date, or null. */
  yearsSinceIncorporation: number | null;
  /** project_grant_profiles.listed — null when no profile row exists. */
  listed: boolean | null;
  /** project_grant_profiles.turnover_aud (the founder-entered figure, not necessarily aggregated). */
  turnoverAud: number | null;
  /** project_grant_profiles.entity_type (pty_ltd, …). */
  entityType: string | null;
  /** project_grant_profiles.prior_raise_aud — amount only; the raise date is not recorded. */
  priorRaiseAud: number | null;
  /** Ordinary shares on issue per the cap table (sum of shareholders.shares_held), null when no cap table. */
  issuedShares: number | null;
  /** ESOP pool shares reserved (esop_pool.total_pool_shares), null when none. */
  esopPoolShares: number | null;
}

export type EssChecklistStatus = "met" | "not_met" | "not_confirmed";

export interface EssChecklistRow {
  key: "unlisted" | "age" | "turnover" | "resident" | "discount" | "holding" | "ownership";
  /** The condition, in plain words. */
  condition: string;
  /** Statutory reference (ITAA 1997). */
  reference: string;
  status: EssChecklistStatus;
  /** What the status rests on — the stored fact, or why it could not be confirmed. */
  basis: string;
}

export interface CertificateEssAnnex {
  version: typeof ESS_ANNEX_VERSION;
  facts: CertificateEssFacts;
  checklist: EssChecklistRow[];
  /** Indicative per-share comparison from the certificate's own range ÷ issued shares; null without a share count. */
  indicativePerShare: { lowAud: number; midAud: number; highAud: number; basisShares: number } | null;
}

/** Statutory thresholds for the start-up concession (s 83A-33 ITAA 1997). */
export const ESS_MAX_COMPANY_AGE_YEARS = 10;
export const ESS_MAX_AGGREGATED_TURNOVER_AUD = 50_000_000;
export const ESS_MAX_SHARE_DISCOUNT_PCT = 15;
export const ESS_MIN_HOLDING_YEARS = 3;
/** Net tangible assets safe-harbour conditions under the 2015 approval instrument. */
export const ESS_NTA_MAX_COMPANY_AGE_YEARS = 7;
export const ESS_NTA_MAX_RAISE_PRIOR_12M_AUD = 10_000_000;

export const ESS_ANNEX_TITLE = "Market value of an ordinary share for ESS purposes";

export const ESS_APPROVAL_INSTRUMENT = "Income Tax Assessment (Methods for Valuing Unlisted Shares) Approval 2015";

/** The one sentence that must never be softened: BlockID's figure is not a safe harbour. */
export const ESS_NOT_SAFE_HARBOUR_SENTENCE =
  "The BlockID.au indicative valuation on this certificate is not a market value determined under an ATO-approved method and is not an ATO safe-harbour valuation for ESS purposes; " +
  "before granting ESS interests under the start-up concession the company must obtain a signed net tangible assets calculation or a valuation from a qualified valuer, and take its own tax advice.";

export const ESS_ANNEX_INTRO =
  "Employee share scheme (ESS) interests granted under the start-up concession in Subdivision 83A-B of the Income Tax Assessment Act 1997 (Cth) (Div 83A) are measured against the market value of an ordinary share in the company at the time the interest is acquired. " +
  "This annex sets out the concession's conditions as they can be checked against the facts this startup has recorded with BlockID.au, and the valuation methods the Commissioner of Taxation has approved for unlisted start-up shares. It does not assess any particular grant.";

export const ESS_APPROVED_METHODS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Net tangible assets (NTA) method — the start-up safe harbour",
    body:
      `Under the ${ESS_APPROVAL_INSTRUMENT} (a legislative instrument made by the Commissioner of Taxation), an unlisted company incorporated less than ${ESS_NTA_MAX_COMPANY_AGE_YEARS} years before the valuation that has not raised more than A$10 million of capital in the 12 months before the valuation may value an ordinary share at the company's net tangible assets divided by the number of shares on issue, subject to the instrument's other conditions (including the financial statements the calculation rests on). ` +
      "The NTA calculation must be prepared in writing and signed off by a director or the chief financial officer of the company, and it must be made at or near the time of the grant. Check the instrument's current conditions before relying on it.",
  },
  {
    title: "Valuation by a qualified valuer within 12 months",
    body:
      "A written market valuation of the company's ordinary shares by a suitably qualified independent valuer, dated within the 12 months before the ESS interest is acquired, may be used while nothing material has changed since it was made. " +
      "Any generally accepted valuation method that produces the market value of the share is available to the valuer; the company remains responsible for the valuation it relies on.",
  },
  {
    title: "Recent arm's-length sale or issue",
    body:
      "The price paid in a recent arm's-length sale or issue of shares of the same class (for example a priced funding round) is ordinarily strong evidence of market value, adjusted for any change in circumstances since. " +
      "Whether it satisfies the approval instrument for a particular grant, and how far back it may be relied on, should be confirmed with the company's tax adviser.",
  },
];

export const ESS_ANNEX_CLOSING_NOTES: readonly string[] = [
  "Every row marked \"not confirmed\" is a condition BlockID.au cannot verify from the data on file; it is not a finding that the condition fails.",
  "The conditions in s 83A-33 are tested when each ESS interest is acquired, not at the issue date of this certificate — a company that qualifies today may not qualify at a later grant.",
  "Options and rights must have an exercise price at least equal to the market value of an ordinary share when they are acquired; shares must be acquired at a discount of no more than 15 % of market value (s 83A-33(5)).",
  "This annex is general information only and is not tax, legal or financial advice. Confirm the concession and the valuation method with a registered tax agent before any grant.",
];

const NOT_RECORDED = "not recorded in BlockID.au";

function wholeYearsBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() < from.getTime()) return null;
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeAnniversary = to.getUTCMonth() < from.getUTCMonth() || (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/** Whole years since incorporation at `issuedAt`, or null when either date is unusable. */
export function essYearsSinceIncorporation(incorporatedAt: string | null, issuedAt: string): number | null {
  if (!incorporatedAt) return null;
  return wholeYearsBetween(incorporatedAt, issuedAt);
}

/**
 * The s 83A-33 / s 83A-45 checklist from the facts on file. Pure. A fact
 * that is not stored is "not confirmed" — never assumed either way. Rows
 * that depend on a specific grant (discount, holding period, ownership)
 * are always "not confirmed" on a certificate.
 */
export function buildEssChecklist(facts: CertificateEssFacts, issuedAt: string): EssChecklistRow[] {
  const years = facts.yearsSinceIncorporation ?? essYearsSinceIncorporation(facts.incorporatedAt, issuedAt);

  const unlisted: EssChecklistRow = {
    key: "unlisted",
    condition: "No equity interests of the company (or of a subsidiary or holding company) are listed on an approved stock exchange",
    reference: "s 83A-33(2)",
    status: facts.listed === null ? "not_confirmed" : facts.listed ? "not_met" : "met",
    basis:
      facts.listed === null
        ? `Listed status ${NOT_RECORDED} — no company profile on file`
        : facts.listed
          ? "The project profile records the company as listed"
          : "The project profile records the company as not listed; confirm the same for any subsidiary or holding company",
  };

  const age: EssChecklistRow = {
    key: "age",
    condition: `The company (and any subsidiary or holding company) was incorporated less than ${ESS_MAX_COMPANY_AGE_YEARS} years before the end of the most recent income year before the ESS interest is acquired`,
    reference: "s 83A-33(3)",
    status: years === null ? "not_confirmed" : years < ESS_MAX_COMPANY_AGE_YEARS ? "met" : "not_confirmed",
    basis:
      years === null
        ? `Incorporation date ${NOT_RECORDED}`
        : years < ESS_MAX_COMPANY_AGE_YEARS
          ? `Incorporated ${facts.incorporatedAt} — ${years} year${years === 1 ? "" : "s"} at the issue date, so fewer than ${ESS_MAX_COMPANY_AGE_YEARS} at the end of the prior income year; confirm for related companies`
          : `Incorporated ${facts.incorporatedAt} — ${years} years at the issue date; test against the end of the most recent income year before the grant`,
  };

  const turnover: EssChecklistRow = {
    key: "turnover",
    condition: `Aggregated turnover for the most recent income year before the ESS interest is acquired does not exceed A$50 million`,
    reference: "s 83A-33(4)",
    status: facts.turnoverAud === null ? "not_confirmed" : facts.turnoverAud <= ESS_MAX_AGGREGATED_TURNOVER_AUD ? "met" : "not_met",
    basis:
      facts.turnoverAud === null
        ? `Turnover ${NOT_RECORDED}`
        : facts.turnoverAud <= ESS_MAX_AGGREGATED_TURNOVER_AUD
          ? `Recorded turnover ${formatAudFull(facts.turnoverAud)} is within the cap; aggregated turnover also counts connected entities and affiliates — confirm`
          : `Recorded turnover ${formatAudFull(facts.turnoverAud)} exceeds the cap`,
  };

  const resident: EssChecklistRow = {
    key: "resident",
    condition: "The employer is an Australian resident taxpayer",
    reference: "s 83A-33(6)",
    status: "not_confirmed",
    basis:
      facts.entityType === "pty_ltd"
        ? "The project profile records a proprietary company; tax residency is not recorded — confirm with the company's tax agent"
        : `Tax residency ${NOT_RECORDED} — confirm with the company's tax agent`,
  };

  const discount: EssChecklistRow = {
    key: "discount",
    condition: `Shares are acquired at a discount of no more than ${ESS_MAX_SHARE_DISCOUNT_PCT} % of market value; options or rights have an exercise price at least equal to the market value of an ordinary share when acquired`,
    reference: "s 83A-33(5)",
    status: "not_confirmed",
    basis: "Assessed per grant against a market value determined under an approved method — not a certificate-level fact",
  };

  const holding: EssChecklistRow = {
    key: "holding",
    condition: `The ESS interest (or the share acquired on exercise) is held for at least ${ESS_MIN_HOLDING_YEARS} years, or until the employee ceases employment`,
    reference: "s 83A-45(4)–(5)",
    status: "not_confirmed",
    basis: "A condition of each grant and of the plan rules — not a certificate-level fact",
  };

  const ownership: EssChecklistRow = {
    key: "ownership",
    condition: "Immediately after acquiring the ESS interest the employee holds no more than 10 % of the shares in, or voting power of, the company",
    reference: "s 83A-45(6)",
    status: "not_confirmed",
    basis: "Assessed per employee at each grant — not a certificate-level fact",
  };

  return [unlisted, age, turnover, resident, discount, holding, ownership];
}

/** The certificate's own range ÷ ordinary shares on issue — an indicative comparison only. */
export function essIndicativePerShare(valuation: ValuationCertificateData["valuation"], issuedShares: number | null): CertificateEssAnnex["indicativePerShare"] {
  if (issuedShares === null || !Number.isFinite(issuedShares) || issuedShares <= 0) return null;
  const per = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round((v / issuedShares) * 10_000) / 10_000 : 0);
  return { lowAud: per(valuation.lowAud), midAud: per(valuation.midAud), highAud: per(valuation.highAud), basisShares: Math.round(issuedShares) };
}

/** Assemble the frozen annex from the facts on file. Pure — the server loads the facts. */
export function buildEssAnnex(facts: CertificateEssFacts, valuation: ValuationCertificateData["valuation"], issuedAt: string): CertificateEssAnnex {
  // Years are derived from the date at THIS issue instant — a stale stored figure never survives a re-stamp.
  const withYears: CertificateEssFacts = { ...facts, yearsSinceIncorporation: facts.incorporatedAt ? essYearsSinceIncorporation(facts.incorporatedAt, issuedAt) : facts.yearsSinceIncorporation };
  return {
    version: ESS_ANNEX_VERSION,
    facts: withYears,
    checklist: buildEssChecklist(withYears, issuedAt),
    indicativePerShare: essIndicativePerShare(valuation, withYears.issuedShares),
  };
}

/** Facts block with nothing on file — every row not confirmed. */
export function emptyEssFacts(): CertificateEssFacts {
  return { incorporatedAt: null, yearsSinceIncorporation: null, listed: null, turnoverAud: null, entityType: null, priorRaiseAud: null, issuedShares: null, esopPoolShares: null };
}

/** "3 of 7 conditions confirmed from your project profile" — the panel line. */
export function essChecklistSummary(rows: EssChecklistRow[]): { met: number; notMet: number; notConfirmed: number; total: number } {
  let met = 0;
  let notMet = 0;
  let notConfirmed = 0;
  for (const r of rows) {
    if (r.status === "met") met++;
    else if (r.status === "not_met") notMet++;
    else notConfirmed++;
  }
  return { met, notMet, notConfirmed, total: rows.length };
}

/** "A$0.0125" per-share figure (4 dp, trailing zeros trimmed to 2). */
export function formatAudPerShare(v: number): string {
  if (!Number.isFinite(v)) return "A$0.00";
  const fixed = v.toFixed(4).replace(/(\.\d\d[1-9]?)0+$/, "$1");
  return `A$${fixed}`;
}

/* ── Approved copy ────────────────────────────────────────────────────── */

export const DOCTORAL_SENTENCE =
  "The Startup Value Index scores every startup on 8 dimensions × 13 criteria across 12 growth phases, reviewed by 11 C-Level agents with an auditor behind them, and is grounded in the founder's doctoral research (DBA) on startup valuation.";

export const DATA_PRINCIPLE_SENTENCE =
  "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.";

export const LEGAL_ENTITY_NAME = "Auschain PTY LTD";
export const LEGAL_ENTITY_ACN = "ACN 659 615 111";
export const LEGAL_ENTITY_ABN = "ABN 79 659 615 111";
export const LEGAL_ENTITY_LINE = `${LEGAL_ENTITY_NAME} (${LEGAL_ENTITY_ACN}, ${LEGAL_ENTITY_ABN})`;

/**
 * Not-a-valuation-report + general-advice disclaimer (au-compliance).
 * Says, in order: what this is (indicative), what it is not (APES 225
 * valuation engagement, financial product advice, AFSL), and what to do
 * (independent advice) — the three things a DD reader looks for.
 */
export const CERTIFICATE_DISCLAIMER =
  "This certificate is an indicative Startup Value Index (SVI) assessment produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111). " +
  "It is not an independent valuation report, not a valuation engagement under APES 225 (Valuation Services), and not an audit or assurance opinion. " +
  "It is general information only and does not constitute financial product advice under the Corporations Act 2001 (Cth); it has been prepared without regard to any reader's objectives, financial situation or needs. " +
  "BlockID.au does not hold an Australian Financial Services Licence (AFSL). " +
  "The range shown is a model estimate built from the founder's own evidence, public comparables and stated assumptions — actual transaction values may differ materially. " +
  "Investors should obtain independent professional advice from a licensed adviser, accountant or lawyer and conduct their own due diligence before relying on it. All figures in AUD.";

export const CERTIFICATE_ASSUMPTIONS: readonly string[] = [
  "The SVI score and dimension sub-scores are computed from evidence the startup supplied to BlockID.au plus publicly available signals at the issue date; nothing has been independently audited.",
  "The valuation range is derived from the SVI composite and Australian pre-seed / seed comparables (AVCAL, Cut Through Venture) and, where connected revenue is present, cross-checked against ARR × the sector multiple range cited on this certificate.",
  "Sector multiples are published US/global medians (Bessemer, Carta, PitchBook) applied with an Australian discount; they move with the market and are not refreshed after issue.",
  "Connected revenue (Stripe / Xero) is taken as reported by the connector on its capture date and is ignored when older than 90 days.",
  "The certificate describes the startup at the issue date only. It carries no forward-looking projection and is not updated; a later score run does not change an issued certificate.",
  "A revoked certificate remains verifiable but is marked revoked on the verify page; anyone relying on a certificate should check its status there.",
];

/* ── Pure helpers ─────────────────────────────────────────────────────── */

/** "A$1.2M" style — same shape as the dashboard hero. */
export function formatAudCompact(v: number): string {
  if (!Number.isFinite(v)) return "A$0";
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

/** Full en-AU figure with thousands separators: "A$1,250,000". */
export function formatAudFull(v: number): string {
  if (!Number.isFinite(v)) return "A$0";
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

/** "12 345 678 901" when the input carries 11 digits, else null. */
export function formatAbn(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

export const METHOD_LABELS: Record<ValuationMethod, string> = {
  svi: "SVI composite",
  "svi+arr_multiple": "SVI composite cross-checked with ARR × sector multiple",
};

/** Cost line for the issue button — "5 credits" or "included". */
export function certificateCostLabel(cost: number, included: boolean): string {
  if (included) return "included in your plan";
  return `${cost} credit${cost === 1 ? "" : "s"}`;
}

/** Public verify path for a certificate number. */
export function verifyPathFor(certificateNo: string): string {
  return `/verify/valuation/${encodeURIComponent(certificateNo)}`;
}
