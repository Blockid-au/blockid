// Test fixture — a fully-populated DossierView for the IC memo suites
// (lib/evaluations/ic-reports.test.ts, lib/pdf/ic-memo-pdf.test.tsx). Not a
// test file itself; carries a PRIVATE-NOTE-BODY sentinel the suites assert
// never reaches a record or a PDF.

import type { DossierView } from "./dossier";
import type { EvaluationAssessment } from "./assessments";

export function fakeView(over: { mine?: Partial<EvaluationAssessment> | null; consensus?: DossierView["consensus"] } = {}): DossierView {
  const mine: EvaluationAssessment | null =
    over.mine === null
      ? null
      : {
          id: "a-1", evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval", orgId: "org-1", snapshotId: "s-2", version: 2, status: "submitted", decision: "proceed", conviction: 4, thesisFitPct: 71,
          dimensionRatings: { TRE: { rating: 4, stance: "agree" }, LCO: { rating: 2, stance: "disagree", note: "licence gap" } }, criterionRatings: {}, valuationView: { low_aud: 4_000_000, high_aud: 6_000_000, method_note: "comps-led" },
          risks: [{ title: "Key-person risk", severity: "high", dimension: "FTV", source: "ai" }, { title: "Licence renewal", severity: "critical", dimension: "LCO", source: "evaluator", note: "expires Q4" }],
          questionsForFounder: [{ text: "When does the licence renew?", dimension: "LCO" }], privateNotes: "PRIVATE-NOTE-BODY", sharedNotes: "Strong team.", sharedFields: [], sharedWithFounderAt: null, submittedAt: "2026-09-16T00:00:00Z", createdAt: "x", updatedAt: "x",
          ...(over.mine ?? {}),
        };
  const dims = [
    { dim: "tre", code: "TRE", title: "Traction & Revenue Evidence", weight: 20, score: 61, band: "developing", delta30d: 3, p50: 52, percentile: 65, ownerAgent: "CRO" },
    { dim: "lco", code: "LCO", title: "Legal & Compliance", weight: 8, score: 40, band: "developing", delta30d: null, p50: 58, percentile: 22, ownerAgent: "CLO" },
  ] as DossierView["report"]["dims"];
  return {
    viewer: { role: "assessor", userId: "u-eval" },
    header: {
      evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", name: "Acme Robotics", website: "https://acme.io", state: "NSW", label: null,
      badges: [{ axis: "industry", label: "Advanced manufacturing", unclassified: false, source: "auto" }, { axis: "business_model", label: "Unclassified", unclassified: true, source: "none" }, { axis: "stage", label: "Seed", unclassified: false, source: "auto" }],
      svi: 62, sviBand: "developing", delta30d: 4, percentile: { value: 61, source: "real_cohort", cohortSize: 120 }, consentTier: "reports_shared", ownerKind: "founder_claimed", founderClaimed: true,
      lastSnapshotAt: "2026-09-12T00:00:00Z", snapshotId: "s-2", evidence: { items: 3, connected: 1, providers: ["stripe"] }, decision: mine ? { value: mine.decision, status: mine.status, version: mine.version } : null,
      mandateFit: { mandateId: "m-1", mandateLabel: "Seed deep-tech AU", score: 77, passesFloor: true, reasons: ["Industry match", "Stage match"], gaps: ["Cheque above range"], blockers: [], source: "persisted", computedAt: null },
      sinceLastView: null, consensus: null, viaOrgSeat: false,
    },
    report: { available: true, source: "adapter", radar: null, dims, criteria: [], evidenceCounts: { tre: 2, mpc: 1, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 }, links: { fullReport: null, pdf: null, analyze: "/x" } },
    valuation: {
      available: true, source: "adapter", pending: false, consensus: { lowAud: 4_000_000, midAud: 5_000_000, highAud: 6_000_000, confidence: 0.35 },
      methods: [{ method: "comparables", label: "AU comparables", lowAud: 3_500_000, midAud: 5_000_000, highAud: 6_500_000, weight: 0.4, applicable: true, rationale: "x" }, { method: "scorecard", label: "Scorecard (reference)", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: "n/a" }],
      ask: { preMoneyAud: 8_000_000, raiseAud: 2_000_000, verdict: "above_consensus", gapPct: 60 }, sectorMultiples: null, comparables: { n: 32, withMultiplesN: 32 }, scenarios: null, rangeBars: null,
      myView: mine?.valuationView ? { lowAud: 4_000_000, highAud: 6_000_000, note: "comps-led" } : null, audit: null,
    },
    evidence: { tier: "reports_shared", items: [], countsByDimension: { tre: 2, mpc: 1, ftv: 0, ptd: 0, cgh: 0, iri: 0, lco: 0, svm: 0 }, connectedProviders: ["stripe"], dataroomAvailable: false, requestUpgrade: "full_mentor" },
    assessment: { available: true, mine, history: [], sharedWithFounder: null },
    progress: { available: false, periodStart: null, periodEnd: null, item: null, deadlines: [], lastSendAt: null, sinceAssessment: null, sparkline: null },
    consensus:
      over.consensus === undefined
        ? {
            available: true, orgId: "org-1", orgName: "Blue Fund", seatCount: 2, submittedCount: 2,
            seats: [
              { userId: "u-eval", displayName: "Me", isMe: true, assessment: mine ? { ...mine, privateNotes: null } : null },
              { userId: "u-b", displayName: "Ben", isMe: false, assessment: mine ? { ...mine, id: "a-2", assessorUserId: "u-b", decision: "track", conviction: 3, privateNotes: null, risks: [{ title: "Churn", severity: "medium", source: "evaluator" }] } : null },
            ],
            medianRating: { FTV: null, MPC: null, PTD: null, TRE: 4, CGH: null, IRI: null, LCO: 2, SVM: null }, disagreement: [], tally: { pass: 0, track: 1, proceed: 1 }, aggregate: "split", meanConviction: 3.5, label: "Firm consensus (2/2)",
          }
        : over.consensus,
    auditTrail: [],
    generatedAt: "2026-09-16T00:00:00Z",
  };
}
