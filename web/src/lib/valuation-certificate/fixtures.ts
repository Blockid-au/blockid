// Test fixture for the valuation certificate (S22-A) — a fully populated
// payload shared by the renderer, route, verify-page and panel suites.
// Not a test file: importing a `.test.tsx` module would re-register its
// suites inside the importer.

import { buildEssAnnex, type CertificateEssFacts, type ValuationCertificateData } from "./types";

export const SAMPLE_CERTIFICATE: ValuationCertificateData = {
  version: "vc-1",
  certificateNo: "VC-7K3MP-Q9X2A",
  issuedAt: "2026-09-12T03:00:00.000Z",
  startupName: "Acme Robotics Pty Ltd",
  abn: "79 659 615 111",
  stageLabel: "Seed",
  sviScore: 138,
  sviVersion: "v3.6.8",
  valuation: {
    lowAud: 1_250_000,
    midAud: 2_400_000,
    highAud: 3_900_000,
    method: "svi+arr_multiple",
    methodNote: null,
  },
  connectedRevenue: {
    provider: "stripe",
    mrrAud: 8_200,
    arrAud: 98_400,
    capturedAt: "2026-09-01T00:00:00.000Z",
    label: "Includes connected revenue (A$8.2K MRR from Stripe)",
  },
  sectorMultiple: { sector: "saas", low: 6, mid: 6.75, high: 7.5, source: "Bessemer Venture Partners" },
  dimensions: [
    { key: "ftv", label: "Founder & Team Value", score: 72, weightPct: 15 },
    { key: "mpc", label: "Market & Problem Clarity", score: 64, weightPct: 18 },
    { key: "ptd", label: "Product & Technical Depth", score: 58, weightPct: 12 },
    { key: "tre", label: "Traction & Revenue", score: 41, weightPct: 20 },
    { key: "cgh", label: "Cap Table & Governance", score: 66, weightPct: 12 },
    { key: "iri", label: "Investor Readiness", score: 50, weightPct: 10 },
    { key: "lco", label: "Legal & Compliance", score: 70, weightPct: 8 },
    { key: "svm", label: "Strategic Vision & Moat", score: 55, weightPct: 5 },
  ],
  evidence: {
    total: 14,
    verified: 9,
    byCategory: [
      { category: "document_uploaded", count: 8 },
      { category: "public_url", count: 4 },
      { category: "connected_source", count: 2 },
    ],
    byDimension: [
      { dimension: "tre", count: 6 },
      { dimension: "cgh", count: 4 },
      { dimension: "lco", count: 4 },
    ],
    lastVerifiedAt: "2026-09-10T00:00:00.000Z",
  },
  verifyUrl: "https://blockid.au/verify/valuation/VC-7K3MP-Q9X2A",
  scoreHistoryId: null,
};

/** S27-A — the same certificate issued WITH Annex A: facts on file for age / listed / turnover; residency, discount, holding and ownership stay "not confirmed". */
export const SAMPLE_ESS_FACTS: CertificateEssFacts = {
  incorporatedAt: "2022-03-15",
  yearsSinceIncorporation: null,
  listed: false,
  turnoverAud: 420_000,
  entityType: "pty_ltd",
  priorRaiseAud: 750_000,
  issuedShares: 10_000_000,
  esopPoolShares: 1_000_000,
};

export const SAMPLE_CERTIFICATE_ESS: ValuationCertificateData = {
  ...SAMPLE_CERTIFICATE,
  ess: buildEssAnnex(SAMPLE_ESS_FACTS, SAMPLE_CERTIFICATE.valuation, SAMPLE_CERTIFICATE.issuedAt),
};
