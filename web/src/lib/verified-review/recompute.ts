// G35 Pricing v5 P4 — what a completed Verified review changes in the scores
// (plan §6.6: "tính lại verification level + evidence-confidence từ evidence
// được chấp nhận"). Pure — the I/O lives in mark-reviewed.ts.
//
// Verification level (lib/verification/level-engine.ts, the only ladder):
//   The persisted `projects.verification_level` is the floor of what is
//   already proven — the ladder is monotonic, so level ≥ n implies every
//   predicate of rungs ≤ n held when it was stamped. The review adds ONE
//   signal: `financialsAttested` is true when the reviewer accepted
//   financial evidence (a TRE-dimension row at connected_source or above,
//   or a Stripe / Xero source). The review never grants L4 (independent
//   audit) or L5 (continuous monitoring) — a BlockID evidence review is not
//   an audit — and it cannot skip a lower rung (L3 still needs L2's ABN +
//   domain proof). So the review can lift L2 → L3 and nothing else.
//
// Evidence confidence (lib/svi/evidence-confidence.ts, the only formula):
//   Start from the latest analysis (each dimension's strongest ledger rung);
//   for every dimension the reviewer DECIDED something on, the reviewer's
//   outcome replaces it: the strongest ACCEPTED rung (an accepted Evidence
//   Hub row is third_party_verified after lib/evidence/review.ts approval),
//   or no evidence at all when every reviewed item there was rejected.
//   Dimensions nobody reviewed keep the analysis rung. The verification
//   multiplier uses the recomputed level.

import { confidenceRank, isConfidenceLevel, type ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import { DIM_WEIGHTS } from "@/lib/report-pipeline/dimension-owners";
import { SVI_DIM_KEYS } from "@/lib/svi-analysis";
import {
  evidenceConfidence,
  evidenceConfidenceInputFromAnalysis,
  type AnalysisLike,
  type DimensionEvidenceInput,
  type EvidenceConfidenceResult,
} from "@/lib/svi/evidence-confidence";
import { normaliseVerificationLevel } from "@/lib/verification/confidence-multiplier";
import { computeVerificationLevel, type VerificationInputs, type VerificationLevel } from "@/lib/verification/level-engine";

/** One reviewed item, as the decision table + the evidence it points at describe it. */
export interface ReviewedEvidence {
  decision: "accept" | "reject";
  /** SVI dimensions the evidence speaks to (lower-case dim keys). */
  dims: readonly string[];
  /** Ladder rung AFTER the review (accepted hub rows: third_party_verified). */
  level: ConfidenceLevel | string | null | undefined;
  /** Source label: "stripe", "xero", "upload", "evidence_hub", … */
  source?: string | null;
}

const FINANCIAL_SOURCES = new Set(["stripe", "xero", "myob", "quickbooks", "basiq"]);

/** Accepted financial evidence → the L3 `financialsAttested` signal. */
export function hasAcceptedFinancials(items: readonly ReviewedEvidence[]): boolean {
  return items.some((i) => {
    if (i.decision !== "accept") return false;
    if (i.source && FINANCIAL_SOURCES.has(i.source.toLowerCase())) return true;
    if (!i.dims.includes("tre")) return false;
    return isConfidenceLevel(i.level) && confidenceRank(i.level) >= confidenceRank("connected_source");
  });
}

/** The engine inputs implied by the persisted level plus the review's accepted evidence. */
export function verificationInputsAfterReview(args: {
  currentLevel: number | null | undefined;
  /** `projects.abn` present (an ABN on file is the business id). */
  hasAbn?: boolean;
  items: readonly ReviewedEvidence[];
}): VerificationInputs {
  const lvl = normaliseVerificationLevel(args.currentLevel ?? 0);
  return {
    hasBusinessId: lvl >= 1 || Boolean(args.hasAbn),
    // A reviewed Verified order belongs to a signed-in buyer; the owner's
    // e-mail was verified at sign-in (same assumption as /api/verification/abr).
    emailVerified: lvl >= 1 || Boolean(args.hasAbn),
    abrConfirmed: lvl >= 2,
    abrStatus: lvl >= 2 ? "Active" : null,
    domainVerified: lvl >= 2,
    financialsAttested: lvl >= 3 || hasAcceptedFinancials(args.items),
    independentlyAudited: lvl >= 4,
    continuouslyMonitored: lvl >= 5,
  };
}

/** Per-dimension reviewer outcome: strongest accepted rung, or null when only rejections. */
export function reviewedDimensionLevels(items: readonly ReviewedEvidence[]): Map<string, ConfidenceLevel | null> {
  const out = new Map<string, ConfidenceLevel | null>();
  for (const item of items) {
    for (const dim of item.dims) {
      const d = dim.toLowerCase();
      if (!out.has(d)) out.set(d, null);
      if (item.decision !== "accept" || !isConfidenceLevel(item.level)) continue;
      const prev = out.get(d) ?? null;
      if (!prev || confidenceRank(item.level) > confidenceRank(prev)) out.set(d, item.level);
    }
  }
  return out;
}

export interface RecomputeResult {
  previousLevel: VerificationLevel;
  verificationLevel: VerificationLevel;
  levelChanged: boolean;
  inputs: VerificationInputs;
  evidenceConfidence: EvidenceConfidenceResult;
  /** Dimensions whose evidence rung the review decided. */
  reviewedDims: string[];
  accepted: number;
  rejected: number;
}

export function recomputeAfterReview(args: {
  currentLevel: number | null | undefined;
  hasAbn?: boolean;
  items: readonly ReviewedEvidence[];
  /** Latest analysis for the project (analysis_json); null → reviewer outcome only. */
  analysis?: AnalysisLike | null;
}): RecomputeResult {
  const previousLevel = normaliseVerificationLevel(args.currentLevel ?? 0);
  const inputs = verificationInputsAfterReview(args);
  const computed = computeVerificationLevel(inputs);
  // Never demote here: a review adds evidence; demotions (cancelled ABN,
  // expired audit) belong to the signal owners, not to this flow.
  const verificationLevel = (computed >= previousLevel ? computed : previousLevel) as VerificationLevel;

  const reviewed = reviewedDimensionLevels(args.items);
  const base = args.analysis
    ? evidenceConfidenceInputFromAnalysis(args.analysis, verificationLevel).dimensions
    : SVI_DIM_KEYS.map((dim): DimensionEvidenceInput => ({ dim, level: null, assessed: true, weight: DIM_WEIGHTS[dim] }));
  const dimensions = base.map((d) => {
    const key = String(d.dim).toLowerCase();
    if (!reviewed.has(key)) return d;
    return { ...d, level: reviewed.get(key) ?? null, assessed: true };
  });
  const ec = evidenceConfidence({ dimensions, verificationLevel });

  return {
    previousLevel,
    verificationLevel,
    levelChanged: verificationLevel !== previousLevel,
    inputs,
    evidenceConfidence: ec,
    reviewedDims: [...reviewed.keys()].sort(),
    accepted: args.items.filter((i) => i.decision === "accept").length,
    rejected: args.items.filter((i) => i.decision === "reject").length,
  };
}
