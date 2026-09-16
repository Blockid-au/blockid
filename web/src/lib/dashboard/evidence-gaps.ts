// Founder landing block 4 "Evidence to add" — pure derivation (G13-W3-IA3,
// spec §B.1 row 4). Merges the two engines the spec names:
//
//   • the svi-evidence completeness model (`lib/svi-completeness.ts`) —
//     which catalogue items are still missing per dimension and what each is
//     estimated to be worth in SVI points;
//   • the NextUnlockCard blocker logic (`lib/growth/phase-gate.ts`) — which
//     dimensions / criteria block the founder's current phase exit.
//
// Rows are ordered by benefit: a gap on a phase-blocked dimension outranks
// everything else, then estimated SVI impact, then bang-for-buck. One row
// per dimension so three rows cover three different dimensions.
//
// Zero I/O — the page passes the `svi_dimension_evidence` rows and the
// phase-gate inputs it already loads. Colocated test: evidence-gaps.test.ts.

import { computePhaseGate, topBlockers, type PhaseBlocker, type PhaseGateResult, type SviDimension } from "@/lib/growth/phase-gate";
import { isGrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { SVI_DIMENSION_LABELS, type SviDimensionKey } from "@/lib/publish/eligibility";
import { EVIDENCE_CATALOG, calculateDimensionCompleteness, generateFixRoadmap } from "@/lib/svi-completeness";

export interface EvidenceGap {
  /** Catalogue code (`founder_linkedin`, `revenue_proof`, …). */
  code: string;
  /** Founder-facing label from the catalogue. */
  label: string;
  dimension: string;
  dimensionLabel: string;
  /** Estimated SVI points ("+N pts"). */
  pts: number;
  /** True when this dimension blocks the current phase exit. */
  blocked: boolean;
}

export interface EvidenceGapInput {
  /** `svi_dimension_evidence` rows for the project (catalogue codes). */
  evidenceRows: ReadonlyArray<{ dimension: string | null; evidence_type: string | null }>;
  /** `projects.growth_phase_current` (any string; validated here). */
  growthPhaseId: string | null | undefined;
  /** `evaluation_criteria` rows for the phase gate. */
  criteria: ReadonlyArray<{ criterion_key: string; quality_level: string | null }>;
  /** Latest analysis `subs` (key/value) → dimension floors. */
  subs: ReadonlyArray<{ key: string; value: number }> | null | undefined;
  limit?: number;
}

export interface EvidenceGapResult {
  gaps: EvidenceGap[];
  phaseGate: PhaseGateResult | null;
  blockers: readonly PhaseBlocker[];
  /** Total catalogue items already present (the "you have N pieces" line). */
  presentCount: number;
}

const VALID_SVI_DIMS = new Set<string>(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco"]);

/** Latest analysis `subs` → the dimension map `computePhaseGate` wants. */
export function sviDimensionsFromSubs(subs: EvidenceGapInput["subs"]): Partial<Record<SviDimension, number>> {
  const out: Partial<Record<SviDimension, number>> = {};
  for (const sub of subs ?? []) {
    if (sub?.key && VALID_SVI_DIMS.has(sub.key) && typeof sub.value === "number" && Number.isFinite(sub.value)) {
      out[sub.key as SviDimension] = sub.value;
    }
  }
  return out;
}

export function dimensionLabel(dim: string): string {
  return SVI_DIMENSION_LABELS[dim as SviDimensionKey] ?? dim.toUpperCase();
}

export function deriveEvidenceGaps(input: EvidenceGapInput): EvidenceGapResult {
  const limit = Math.max(1, Math.floor(input.limit ?? 3));

  // Present catalogue codes per dimension.
  const present: Record<string, Set<string>> = {};
  let presentCount = 0;
  for (const row of input.evidenceRows) {
    const dim = (row.dimension ?? "").toLowerCase();
    const code = row.evidence_type ?? "";
    if (!dim || !code) continue;
    (present[dim] ??= new Set()).add(code);
    presentCount += 1;
  }
  const results = Object.keys(EVIDENCE_CATALOG).map((dim) => calculateDimensionCompleteness(dim, present[dim] ?? new Set()));

  // Phase gate (NextUnlockCard logic) — only when the project declares a phase.
  const phaseGate = isGrowthPhaseId(input.growthPhaseId)
    ? computePhaseGate({
        currentPhase: input.growthPhaseId,
        criteria: [...input.criteria],
        dimensions: sviDimensionsFromSubs(input.subs),
      })
    : null;
  const blockers = phaseGate ? topBlockers(phaseGate, 3) : [];
  const blockedDims = new Set(
    phaseGate?.blockers.filter((b) => b.code === "dimension_below_floor").map((b) => b.subject.toLowerCase()) ?? [],
  );

  const roadmap = generateFixRoadmap(results).sort((a, b) => {
    const blocked = Number(blockedDims.has(b.dimension)) - Number(blockedDims.has(a.dimension));
    if (blocked !== 0) return blocked;
    if (b.estimatedSviImpact !== a.estimatedSviImpact) return b.estimatedSviImpact - a.estimatedSviImpact;
    return b.bangForBuck - a.bangForBuck;
  });

  const gaps: EvidenceGap[] = [];
  const seenDims = new Set<string>();
  for (const item of roadmap) {
    if (gaps.length >= limit) break;
    if (seenDims.has(item.dimension)) continue;
    seenDims.add(item.dimension);
    gaps.push({
      code: item.evidenceType,
      label: item.evidenceLabel,
      dimension: item.dimension,
      dimensionLabel: dimensionLabel(item.dimension),
      pts: item.estimatedSviImpact,
      blocked: blockedDims.has(item.dimension),
    });
  }

  return { gaps, phaseGate, blockers, presentCount };
}
