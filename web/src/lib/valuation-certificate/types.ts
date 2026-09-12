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
