// G21-P1-B — Evidence Confidence: ONE number (0–100) every surface shows
// beside the SVI, so the Assessment Card on the report, the workspace, the
// evaluator page, the dossier, the PDF and the DOCX all agree.
//
//   share      = Σ_d weight_d × ladder(level_d) / Σ_d weight_d
//                (ladder = EVIDENCE_CONFIDENCE in svi-analysis.ts — the six
//                 rungs of lib/evidence/confidence-cap.ts; a dimension with no
//                 evidence, or unassessed, contributes 0)
//   result     = boundedVerificationConfidence(share, verificationLevel,
//                nextRungConfidence(strongest level))  × 100, rounded
//
// The verification multiplier (L0 0.85 … L5 1.10, lib/verification/
// confidence-multiplier.ts) only scales what the ladder earned and is bounded
// exactly as computeSVI() bounds it: never above the rung above the strongest
// evidence the record actually holds, never above 1.0. Each dimension's level
// may carry its origin; it is then capped by `capConfidence` (D4: the party
// making a claim never grades it).
//
// Pure — no I/O. Deterministic for a given input.

import { CONFIDENCE_LEVELS, capConfidence, confidenceRank, isConfidenceLevel, type ConfidenceLevel, type EvidenceOrigin } from "@/lib/evidence/confidence-cap";
import { DIM_WEIGHTS } from "@/lib/report-pipeline/dimension-owners";
import { EVIDENCE_CONFIDENCE, SVI_DIM_KEYS, nextRungConfidence, type SVIAnalysis, type SVIScoreSignal, type SviDimKey } from "@/lib/svi-analysis";
import { VERIFICATION_LEVEL_LABELS, boundedVerificationConfidence, normaliseVerificationLevel } from "@/lib/verification/confidence-multiplier";
import type { VerificationLevel } from "@/lib/verification/level-engine";

/** The L1–L6 badge for each ladder rung (L1 self-declared … L6 third-party verified). */
export type EvidenceLevelBadge = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export const EVIDENCE_LEVEL_BADGES: Readonly<Record<ConfidenceLevel, EvidenceLevelBadge>> = Object.freeze({
  self_declared: "L1",
  public_url: "L2",
  document_uploaded: "L3",
  connected_source: "L4",
  transaction_data: "L5",
  third_party_verified: "L6",
});

export const EVIDENCE_LEVEL_LABELS: Readonly<Record<ConfidenceLevel, string>> = Object.freeze({
  self_declared: "Self-declared",
  public_url: "Public URL",
  document_uploaded: "Document uploaded",
  connected_source: "Connected source",
  transaction_data: "Transaction data",
  third_party_verified: "Third-party verified",
});

/** Badge → ladder rung (undefined for an unknown badge). */
export function levelForBadge(badge: string | null | undefined): ConfidenceLevel | undefined {
  if (!badge) return undefined;
  return (Object.keys(EVIDENCE_LEVEL_BADGES) as ConfidenceLevel[]).find((l) => EVIDENCE_LEVEL_BADGES[l] === badge);
}

export function badgeForLevel(level: string | null | undefined): EvidenceLevelBadge | undefined {
  return isConfidenceLevel(level) ? EVIDENCE_LEVEL_BADGES[level] : undefined;
}

/** The ladder weight (0.20 … 1.00) for a rung — the same table computeSVI() uses. */
export function ladderWeight(level: ConfidenceLevel | null | undefined): number {
  return level ? (EVIDENCE_CONFIDENCE[level] ?? 0) : 0;
}

export interface DimensionEvidenceInput {
  dim: SviDimKey | string;
  /** The strongest evidence rung the dimension holds; null / undefined = nothing evidenced (contributes 0). */
  level: ConfidenceLevel | string | null | undefined;
  /** Dimension weight in the share (defaults to 1 — an equal share across the 8 dimensions). */
  weight?: number;
  /** When known, the origin caps the level (founder text never reaches document_uploaded, etc.). */
  origin?: EvidenceOrigin;
  /** False = the dimension is a pure baseline (pending) — contributes 0 whatever the level says. */
  assessed?: boolean;
}

export interface EvidenceConfidenceInput {
  dimensions: readonly DimensionEvidenceInput[];
  /** `projects.verification_level` 0–5; null / undefined = no multiplier. */
  verificationLevel?: number | null;
}

export interface EvidenceConfidenceResult {
  /** 0–100, rounded to an integer. */
  score: number;
  /** The ladder share before the verification multiplier (0–1, 3 dp). */
  share: number;
  /** The strongest rung across the dimensions (null when nothing is evidenced). */
  strongest: ConfidenceLevel | null;
  /** The verification multiplier actually applied (1 when no level was given). */
  verificationMultiplier: number;
  verificationLevel: VerificationLevel | null;
  /** Dimensions that contributed 0 (no evidence or unassessed). */
  unevidenced: string[];
}

function effectiveLevel(d: DimensionEvidenceInput): ConfidenceLevel | null {
  if (d.assessed === false) return null;
  if (!isConfidenceLevel(d.level)) return null;
  return d.origin ? capConfidence({ requested: d.level, origin: d.origin }).level : d.level;
}

/**
 * The one Evidence Confidence number. `[]` dimensions → 0. Order-independent,
 * deterministic; the multiplier is bounded like computeSVI() (never lifts a
 * record above the rung above its strongest evidence, never above 1.0).
 */
export function evidenceConfidence(input: EvidenceConfidenceInput): EvidenceConfidenceResult {
  const dims = input.dimensions;
  let weightSum = 0;
  let acc = 0;
  let strongest: ConfidenceLevel | null = null;
  const unevidenced: string[] = [];
  for (const d of dims) {
    const w = typeof d.weight === "number" && Number.isFinite(d.weight) && d.weight > 0 ? d.weight : 1;
    weightSum += w;
    const level = effectiveLevel(d);
    if (!level) {
      unevidenced.push(String(d.dim));
      continue;
    }
    acc += w * ladderWeight(level);
    if (!strongest || confidenceRank(level) > confidenceRank(strongest)) strongest = level;
  }
  const share = weightSum > 0 ? Math.round((acc / weightSum) * 1000) / 1000 : 0;
  const hasVerification = input.verificationLevel !== null && input.verificationLevel !== undefined;
  const vLevel = hasVerification ? normaliseVerificationLevel(input.verificationLevel) : null;
  const bounded = vLevel === null || share === 0 ? share : boundedVerificationConfidence(share, vLevel, nextRungConfidence(strongest ?? "self_declared"));
  const multiplier = share > 0 ? Math.round((bounded / share) * 1000) / 1000 : 1;
  return {
    score: Math.max(0, Math.min(100, Math.round(bounded * 100))),
    share,
    strongest,
    verificationMultiplier: multiplier,
    verificationLevel: vLevel,
    unevidenced,
  };
}

/** Convenience: the 0–100 number only. */
export function evidenceConfidenceScore(input: EvidenceConfidenceInput): number {
  return evidenceConfidence(input).score;
}

const LADDER_SOURCES = new Set<string>(CONFIDENCE_LEVELS);

/** The strongest ladder rung among a dimension's ledger signals (null when none is a ladder rung). */
export function strongestSignalLevel(signals: readonly SVIScoreSignal[] | null | undefined): ConfidenceLevel | null {
  let best: ConfidenceLevel | null = null;
  for (const s of signals ?? []) {
    if (!LADDER_SOURCES.has(s.source)) continue;
    const l = s.source as ConfidenceLevel;
    if (!best || confidenceRank(l) > confidenceRank(best)) best = l;
  }
  return best;
}

/** The slice of a stored `SVIAnalysis` (analysis_json) the builder reads — loose so pre-S41 rows still parse. */
export interface AnalysisLike {
  subs?: ReadonlyArray<{ key: string; breakdown?: SVIScoreSignal[]; assessed?: boolean }> | null;
  signals?: { evidenceLevel?: string | null } | null;
  meta?: SVIAnalysis["meta"];
}

/**
 * Build the input from a stored analysis: each sub-score's strongest ledger
 * rung (S41 breakdown), falling back to the analysis-wide evidence level for
 * pre-S41 rows, `assessed:false` → pending. Weights are the dimension weights.
 */
export function evidenceConfidenceInputFromAnalysis(
  analysis: AnalysisLike,
  verificationLevel?: number | null,
): EvidenceConfidenceInput {
  const fallback = isConfidenceLevel(analysis.signals?.evidenceLevel) ? analysis.signals.evidenceLevel : null;
  const dimensions: DimensionEvidenceInput[] = SVI_DIM_KEYS.map((dim) => {
    const sub = analysis.subs?.find((s) => s.key === dim);
    const fromLedger = strongestSignalLevel(sub?.breakdown);
    return { dim, level: fromLedger ?? (sub?.assessed === false ? null : fallback), assessed: sub?.assessed !== false, weight: DIM_WEIGHTS[dim] };
  });
  const vl = verificationLevel ?? analysis.meta?.verification?.level ?? null;
  return { dimensions, verificationLevel: vl };
}

/** The Evidence Confidence a snapshot writer stores beside the analysis (0–100). */
export function evidenceConfidenceFromAnalysis(analysis: AnalysisLike, verificationLevel?: number | null): number {
  return evidenceConfidence(evidenceConfidenceInputFromAnalysis(analysis, verificationLevel)).score;
}

// ── BlockID Verified label ─────────────────────────────────────────────────

export interface VerificationLabel {
  level: VerificationLevel;
  /** "L3" */
  short: string;
  /** "BlockID Verified L3" (L0 → "Not yet BlockID Verified"). */
  label: string;
  /** The ladder tier name ("Trust", "Evidence-checked", …). */
  tier: string;
  verified: boolean;
}

/** The naming architecture calls the state **BlockID Verified**; L0 is honest about not being there yet. */
export function verificationLabel(level: unknown): VerificationLabel {
  const l = normaliseVerificationLevel(level);
  const meta = VERIFICATION_LEVEL_LABELS[l];
  return {
    level: l,
    short: meta.short,
    label: l === 0 ? "Not yet BlockID Verified" : `BlockID Verified ${meta.short}`,
    tier: meta.label,
    verified: l >= 2,
  };
}
