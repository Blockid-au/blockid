// G14-S36 / decision F-6 — business-verification multiplier.
//
// `projects.verification_level` (0–5, written by /api/verification/abr via
// level-engine.ts) was never consumed by the score. It now scales the SVI
// evidence confidence:
//
//   L0 0.85 · L1 0.90 · L2 1.00 · L3 1.05 · L4 1.08 · L5 1.10
//
// Two bounds keep it honest:
//   1. The multiplier only scales the confidence the evidence ladder already
//      earned — it never touches the raw dimension scores.
//   2. `boundedVerificationConfidence` caps the result so a self_declared
//      analysis can never be lifted above the document_uploaded rung — an
//      Active ABN says the company exists, not that its claims are proven.
//
// Pure: no I/O.

import type { VerificationLevel } from "./level-engine";

export const VERIFICATION_MULTIPLIER: Readonly<Record<VerificationLevel, number>> = Object.freeze({
  0: 0.85,
  1: 0.9,
  2: 1.0,
  3: 1.05,
  4: 1.08,
  5: 1.1,
});

export const VERIFICATION_MULTIPLIER_MIN = 0.85;
export const VERIFICATION_MULTIPLIER_MAX = 1.1;

/** Plain labels for the L0–L5 ladder (level-engine.ts predicates), reused by /methodology and the report cover. */
export const VERIFICATION_LEVEL_LABELS: Readonly<Record<VerificationLevel, { label: string; short: string; requires: string }>> = Object.freeze({
  0: { label: "Unverified", short: "L0", requires: "No business identifier on file." },
  1: { label: "Self-declared", short: "L1", requires: "Business ID entered and the founder's email verified." },
  2: { label: "Evidence-checked", short: "L2", requires: "ABN confirmed Active on the ABR lookup and the company domain verified." },
  3: { label: "Trust", short: "L3", requires: "L2 plus financials attested through a connected source of record." },
  4: { label: "Trust with attestations", short: "L4", requires: "L3 plus an independent audit or accountant attestation on file." },
  5: { label: "Continuous monitoring", short: "L5", requires: "L4 plus connectors resyncing on a schedule with no lapse." },
});

/** Clamp any input to a legal ladder rung; non-numbers and NaN read as L0. */
export function normaliseVerificationLevel(level: unknown): VerificationLevel {
  const n = typeof level === "number" ? level : typeof level === "string" ? Number(level) : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n))) as VerificationLevel;
}

export function verificationMultiplier(level: unknown): number {
  return VERIFICATION_MULTIPLIER[normaliseVerificationLevel(level)];
}

export interface VerificationMeta {
  level: VerificationLevel;
  multiplier: number;
  /** ABN confirmed Active on the ABR (L2+). */
  abnVerified: boolean;
  label: string;
}

export function verificationMeta(level: unknown): VerificationMeta {
  const l = normaliseVerificationLevel(level);
  return { level: l, multiplier: VERIFICATION_MULTIPLIER[l], abnVerified: l >= 2, label: VERIFICATION_LEVEL_LABELS[l].label };
}

/** The short badge text the TBR cover / dossier / index card show. */
export function verificationBadgeLabel(level: unknown): "Verified ABN" | "ABN not verified" {
  return normaliseVerificationLevel(level) >= 2 ? "Verified ABN" : "ABN not verified";
}

/**
 * Apply the multiplier to a ladder confidence (EVIDENCE_CONFIDENCE value)
 * and bound the result: never above the next rung's ceiling
 * (`nextRungConfidence`) and never above 1.0. A multiplier below 1 always
 * applies in full (L0 lowers a self_declared 0.20 to 0.17).
 *
 * `nextRungConfidence` is the confidence one rung above the evidence level
 * the analysis actually earned (document_uploaded = 0.50 for a
 * self_declared analysis). Passing the same value as `confidence` (top of
 * the ladder) means the multiplier can only lower it.
 */
export function boundedVerificationConfidence(confidence: number, level: unknown, nextRungConfidence: number): number {
  const raw = confidence * verificationMultiplier(level);
  const ceiling = Math.min(1, Math.max(confidence, nextRungConfidence));
  return Math.round(Math.min(ceiling, raw) * 1000) / 1000;
}
