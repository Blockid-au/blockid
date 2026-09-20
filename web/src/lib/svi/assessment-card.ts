// G21-P1-B — the BlockID Assessment Card (FI §51): the one summary block
// every score surface shows first. Pure builder + two adapters (ReportV2 and
// SVIAnalysis) so the web card, the PDF twin and the DOCX twin render the same
// `AssessmentCardData` without re-deriving anything.
//
//   Startup · SVI n / 100 · Evidence Confidence n % · BlockID Verified Lx ·
//   Stage · Sector · Benchmark (median, n =, label) · Top strength · Top gap ·
//   Unverified material claims · Last updated
//
// Benchmark: rendered only from the `benchmark` the caller passes (P1-C owns
// the n rules and `benchmarkLabel(n)`); this module never labels a benchmark.
// Pure — no I/O, no React.

import type { ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import { isConfidenceLevel } from "@/lib/evidence/confidence-cap";
import type { DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { Band } from "@/lib/report-visuals/types";
import { bandFor } from "@/lib/report-visuals/palette";
import type { ReportV2 } from "@/lib/report-v2/schema";
import type { SVIAnalysis, SVIScoreSignal } from "@/lib/svi-analysis";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { evidenceConfidence, strongestSignalLevel, verificationLabel, type DimensionEvidenceInput, type VerificationLabel } from "@/lib/svi/evidence-confidence";

/** P1-C's publication label — rendered verbatim, never computed here. */
export type BenchmarkLabel = "indicative" | "benchmark" | "segmented";

export interface AssessmentBenchmark {
  median: number;
  n: number;
  label: BenchmarkLabel;
}

export interface AssessmentDimensionRef {
  dim: DimKey;
  title: string;
  score: number;
  weight: number;
}

export interface AssessmentCardData {
  startupName: string;
  /** Null = every dimension is pending (no confident number). */
  svi: number | null;
  sviBand: Band;
  /** 0–100. */
  evidenceConfidence: number;
  verification: VerificationLabel;
  stageLabel: string;
  sector: string;
  benchmark?: AssessmentBenchmark;
  topStrength: AssessmentDimensionRef | null;
  topGap: AssessmentDimensionRef | null;
  unverifiedMaterialClaims: number;
  /** ISO timestamp of the snapshot / report the card describes. */
  lastUpdated: string;
  methodologyVersion: string;
  /** Dimensions still pending (0–8). */
  pendingDims: number;
}

export interface AssessmentProjectInput {
  name: string;
  sector?: string | null;
  stageLabel?: string | null;
  /** projects.verification_level 0–5 (null = unknown → L0). */
  verificationLevel?: number | null;
}

export interface AssessmentLedgerDimension {
  dim: DimKey;
  score: number;
  weight: number;
  /** False = pure baseline; the dimension is pending and never a strength / gap. */
  assessed: boolean;
  /** The strongest evidence rung the dimension holds (null = nothing evidenced). */
  level?: ConfidenceLevel | null;
  /** Ledger signals (S41) — used for the unverified-claims fallback when no evidence items are supplied. */
  signals?: readonly SVIScoreSignal[] | null;
}

export interface AssessmentLedgerInput {
  total: number | null;
  dimensions: readonly AssessmentLedgerDimension[];
}

export interface AssessmentSnapshotInput {
  generatedAt: string;
  /** The stored `svi_snapshots.evidence_confidence` when present — wins over the recomputed value. */
  evidenceConfidence?: number | null;
  methodologyVersion?: string | null;
  benchmark?: AssessmentBenchmark | null;
  /** P1-A: the unverified material claim count, when the claims table has it. */
  unverifiedMaterialClaims?: number | null;
}

export type AssessmentEvidenceInput = Readonly<Partial<Record<DimKey | string, readonly DimensionEvidenceItem[]>>>;

const LOW_RUNGS = new Set<string>(["self_declared", "public_url"]);

/**
 * Unverified material claims — today: evidence items that are neither verified
 * nor backed by a document / connector (L1–L2), plus, when no items exist for
 * a dimension, its positive self-declared / public-URL ledger signals.
 * TODO(P1-A): read `unverifiedMaterialClaims(projectId)` from lib/evidence/claims.ts after merge.
 */
export function countUnverifiedMaterialClaims(ledger: AssessmentLedgerInput, evidence: AssessmentEvidenceInput): number {
  let n = 0;
  for (const d of ledger.dimensions) {
    const items = evidence[d.dim] ?? [];
    if (items.length > 0) {
      n += items.filter((i) => !i.verified && (i.level === "L1" || i.level === "L2")).length;
      continue;
    }
    if (!d.assessed) continue;
    n += (d.signals ?? []).filter((s) => s.points > 0 && !s.scale && LOW_RUNGS.has(s.source)).length;
  }
  return n;
}

function ref(d: AssessmentLedgerDimension): AssessmentDimensionRef {
  return { dim: d.dim, title: DIMENSION_OWNERS[d.dim]?.title ?? d.dim.toUpperCase(), score: d.score, weight: d.weight };
}

/** Highest assessed dimension (ties → heavier weight, then DIM_ORDER). */
export function topStrengthOf(dims: readonly AssessmentLedgerDimension[]): AssessmentDimensionRef | null {
  const assessed = dims.filter((d) => d.assessed);
  if (!assessed.length) return null;
  const best = [...assessed].sort((a, b) => b.score - a.score || b.weight - a.weight || DIM_ORDER.indexOf(a.dim) - DIM_ORDER.indexOf(b.dim))[0];
  return ref(best);
}

/** Lowest assessed dimension (ties → heavier weight — the bigger lever — then DIM_ORDER). */
export function topGapOf(dims: readonly AssessmentLedgerDimension[]): AssessmentDimensionRef | null {
  const assessed = dims.filter((d) => d.assessed);
  if (assessed.length < 2) return null;
  const worst = [...assessed].sort((a, b) => a.score - b.score || b.weight - a.weight || DIM_ORDER.indexOf(a.dim) - DIM_ORDER.indexOf(b.dim))[0];
  return ref(worst);
}

/** Dimension inputs for `evidenceConfidence()`: the strongest evidence item wins over the ledger rung. */
export function evidenceConfidenceDimensions(ledger: AssessmentLedgerInput, evidence: AssessmentEvidenceInput): DimensionEvidenceInput[] {
  return ledger.dimensions.map((d) => {
    const items = evidence[d.dim] ?? [];
    const fromItems = items.length ? Math.max(...items.map((i) => Number(i.level.slice(1)))) : 0;
    const fromLedger = d.level && isConfidenceLevel(d.level) ? d.level : null;
    const itemLevel = fromItems > 0 ? (BADGE_LEVELS[fromItems - 1] ?? null) : null;
    const level = pickStronger(itemLevel, fromLedger);
    return { dim: d.dim, level, weight: d.weight, assessed: d.assessed || items.length > 0 };
  });
}

const BADGE_LEVELS: readonly ConfidenceLevel[] = ["self_declared", "public_url", "document_uploaded", "connected_source", "transaction_data", "third_party_verified"];

function pickStronger(a: ConfidenceLevel | null, b: ConfidenceLevel | null): ConfidenceLevel | null {
  if (!a) return b;
  if (!b) return a;
  return BADGE_LEVELS.indexOf(a) >= BADGE_LEVELS.indexOf(b) ? a : b;
}

/** The pure builder every surface calls. */
export function buildAssessmentCard(project: AssessmentProjectInput, ledger: AssessmentLedgerInput, evidence: AssessmentEvidenceInput, snapshot: AssessmentSnapshotInput): AssessmentCardData {
  const pendingDims = ledger.dimensions.filter((d) => !d.assessed).length;
  const allPending = ledger.dimensions.length > 0 && pendingDims === ledger.dimensions.length;
  const svi = allPending || ledger.total == null || !Number.isFinite(ledger.total) ? null : Math.round(ledger.total);
  const stored = snapshot.evidenceConfidence;
  const ec =
    typeof stored === "number" && Number.isFinite(stored)
      ? Math.max(0, Math.min(100, Math.round(stored)))
      : evidenceConfidence({ dimensions: evidenceConfidenceDimensions(ledger, evidence), verificationLevel: project.verificationLevel ?? null }).score;
  const claims = typeof snapshot.unverifiedMaterialClaims === "number" && snapshot.unverifiedMaterialClaims >= 0 ? Math.round(snapshot.unverifiedMaterialClaims) : countUnverifiedMaterialClaims(ledger, evidence);
  return {
    startupName: project.name.trim() || "Startup",
    svi,
    sviBand: svi === null ? "pending" : bandFor(Math.min(100, svi)),
    evidenceConfidence: ec,
    verification: verificationLabel(project.verificationLevel ?? 0),
    stageLabel: (project.stageLabel ?? "").trim() || "Stage not set",
    sector: (project.sector ?? "").trim() || "Sector not set",
    ...(snapshot.benchmark ? { benchmark: snapshot.benchmark } : {}),
    topStrength: topStrengthOf(ledger.dimensions),
    topGap: topGapOf(ledger.dimensions),
    unverifiedMaterialClaims: claims,
    lastUpdated: snapshot.generatedAt,
    methodologyVersion: (snapshot.methodologyVersion ?? "").trim() || SVI_VERSION,
    pendingDims,
  };
}

// ── Adapters ────────────────────────────────────────────────────────────────

export interface AssessmentCardOptions {
  benchmark?: AssessmentBenchmark | null;
  /** The stored snapshot value (svi_snapshots.evidence_confidence) when the caller has it. */
  evidenceConfidence?: number | null;
  unverifiedMaterialClaims?: number | null;
  evidence?: AssessmentEvidenceInput;
}

/** ReportV2 → card (cover + chapters carry everything; hub items are optional extras). */
export function assessmentCardFromReport(report: ReportV2, opts: AssessmentCardOptions = {}): AssessmentCardData {
  const dimensions: AssessmentLedgerDimension[] = report.dimensions.map((ch) => ({
    dim: ch.dim,
    score: ch.score,
    weight: ch.weight,
    assessed: ch.scoreBreakdown ? ch.scoreBreakdown.assessed : ch.band !== "pending",
    level: strongestSignalLevel(ch.scoreBreakdown?.signals) ?? strongestRowLevel(ch.evidence) ?? (report.cover.evidenceLevel?.level ?? null),
    signals: ch.scoreBreakdown?.signals ?? null,
  }));
  return buildAssessmentCard(
    { name: report.cover.startupName, sector: report.cover.sector, stageLabel: report.cover.stageLabel, verificationLevel: report.cover.verification?.level ?? null },
    { total: report.cover.svi.band === "pending" ? null : report.cover.svi.total, dimensions },
    opts.evidence ?? {},
    { generatedAt: report.generatedAt, evidenceConfidence: opts.evidenceConfidence, methodologyVersion: report.pipelineVersion, benchmark: opts.benchmark, unverifiedMaterialClaims: opts.unverifiedMaterialClaims },
  );
}

function strongestRowLevel(rows: ReportV2["dimensions"][number]["evidence"]): ConfidenceLevel | null {
  let best: ConfidenceLevel | null = null;
  for (const r of rows) {
    if (r.status === "missing" || !isConfidenceLevel(r.confidence)) continue;
    best = pickStronger(best, r.confidence);
  }
  return best;
}

export interface AnalysisProjectInput extends AssessmentProjectInput {
  generatedAt?: string | null;
}

/** SVIAnalysis (workspace / snapshot analysis_json) → card. */
export function assessmentCardFromAnalysis(analysis: SVIAnalysis, project: AnalysisProjectInput, opts: AssessmentCardOptions = {}): AssessmentCardData {
  const fallbackLevel = isConfidenceLevel(analysis.signals?.evidenceLevel) ? analysis.signals.evidenceLevel : null;
  const dimensions: AssessmentLedgerDimension[] = DIM_ORDER.map((dim) => {
    const sub = analysis.subs.find((s) => s.key === dim);
    const assessed = sub ? sub.assessed !== false : false;
    return {
      dim,
      score: sub?.value ?? 0,
      weight: DIMENSION_OWNERS[dim].weight,
      assessed,
      level: strongestSignalLevel(sub?.breakdown) ?? (assessed ? fallbackLevel : null),
      signals: sub?.breakdown ?? null,
    };
  });
  return buildAssessmentCard(
    {
      name: project.name,
      sector: project.sector ?? analysis.sectorLabel ?? analysis.sector ?? null,
      stageLabel: project.stageLabel ?? analysis.stageLabel ?? null,
      verificationLevel: project.verificationLevel ?? analysis.meta?.verification?.level ?? null,
    },
    { total: analysis.totalSVI, dimensions },
    opts.evidence ?? {},
    { generatedAt: project.generatedAt ?? new Date(0).toISOString(), evidenceConfidence: opts.evidenceConfidence, methodologyVersion: analysis.version, benchmark: opts.benchmark, unverifiedMaterialClaims: opts.unverifiedMaterialClaims },
  );
}
