// program-journey-data — the server composition behind the BlockID Cohort
// journey, the Cohort Report and the demo-day pack (G21 P2-C).
//
// One batch (`?batch=` or the caller's newest) → cohort rows (batch.ts) ×
// evidence confidence (0419) × verification level × evidence rows
// (completion + mentor gaps) × score history × dossier / letter flags ×
// the P2-A / P2-B adapters (snapshots, overrides, shortlist). Everything
// downstream is pure (program-journey.ts, cohort-report.ts, the PDF twins).

import "server-only";
import type { AppUser } from "@/lib/auth";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { buildAssessmentCard, type AssessmentCardData, type AssessmentLedgerDimension } from "@/lib/svi/assessment-card";
import { CONFIDENCE_LEVELS } from "@/lib/evidence/confidence-cap";
import type { DimKey } from "@/lib/report-pipeline/dimension-owners";
import { listBatchItems, listBatches, loadCohortRows } from "./batch";
import { DIMENSION_KEYS, stageName, type CohortRow, type EvaluationBatch } from "./batch-shared";
import { DOSSIER_PATH } from "./dossier";
import {
  countOverridesForBatch,
  listCohortSnapshotsForBatch,
  loadDossierProducedByEvaluation,
  loadEvidenceConfidenceBySnapshot,
  loadEvidenceRowsByProject,
  loadFeedbackLetterSentByProject,
  loadScoreHistoryByProject,
  loadShortlistForBatch,
  loadVerificationByProject,
  resolveBatchAccess,
  type BatchRole,
} from "./cohort-adapters";
import { buildCohortReport, type CohortMarketBenchmark, type CohortReportData, type CohortReportInput, type CohortReportStartup, type CohortSnapshotLite } from "./cohort-report";
import { quarterLabelFor } from "./quarterly-report";
import { buildProgramJourney, summariseEvidence, type JourneyBatchRef, type JourneyIntake, type JourneySnapshot, type JourneyStartup, type ProgramJourneyView } from "./program-journey";

export interface CohortBundle {
  batch: EvaluationBatch;
  role: BatchRole;
  rows: CohortRow[];
  startups: JourneyStartup[];
  snapshots: CohortSnapshotLite[];
  overridesCount: number;
}

function refOf(b: EvaluationBatch): JourneyBatchRef {
  return { id: b.id, name: b.name, status: b.status, createdAt: b.createdAt };
}

/** Everything the journey / report / pack need for one batch the caller may read. Null when no role. */
export async function loadCohortBundle(userId: string, batchId: string): Promise<CohortBundle | null> {
  const access = await resolveBatchAccess(userId, batchId);
  if (!access) return null;
  const { batch, role } = access;
  const rows = await loadCohortRows(batch);
  const projectIds = rows.map((r) => r.projectId).filter(Boolean);
  const evaluationIds = rows.map((r) => r.evaluationId);
  // CohortRow carries no snapshot id — the items do; the item's own snapshot
  // wins, the project's newest snapshot is the fallback.
  const items = await listBatchItems(batch.id);
  const snapshotByItem = new Map<number, string>();
  for (const i of items) if (i.snapshotId) snapshotByItem.set(i.id, i.snapshotId);
  const [confidenceBySnapshot, verification, evidenceRows, history, dossiers, letters, snapshots, shortlist, overridesCount] = await Promise.all([
    loadEvidenceConfidenceBySnapshot(Array.from(snapshotByItem.values())),
    loadVerificationByProject(projectIds),
    loadEvidenceRowsByProject(projectIds),
    loadScoreHistoryByProject(projectIds),
    loadDossierProducedByEvaluation(evaluationIds),
    loadFeedbackLetterSentByProject(projectIds),
    listCohortSnapshotsForBatch(batch.id),
    loadShortlistForBatch(batch.id),
    countOverridesForBatch(rows.map((r) => r.itemId)),
  ]);
  const confidenceByProject = await loadLatestConfidenceByProject(projectIds);

  const startups: JourneyStartup[] = rows.map((r) => {
    const evidence = summariseEvidence(evidenceRows.get(r.projectId) ?? []);
    return {
      itemId: r.itemId,
      evaluationId: r.evaluationId,
      projectId: r.projectId,
      projectSlug: r.projectSlug,
      name: r.startup,
      status: r.status,
      svi: r.svi,
      confidence: (snapshotByItem.has(r.itemId) ? confidenceBySnapshot.get(snapshotByItem.get(r.itemId) as string) : undefined) ?? confidenceByProject.get(r.projectId) ?? null,
      verification: verification.get(r.projectId) ?? 0,
      stage: r.stage,
      delta: r.delta,
      topStrength: r.topStrength,
      topGap: r.topGap,
      dimensionScores: r.dimensionScores,
      decision: r.decision,
      assessmentStatus: r.assessmentStatus,
      shortlisted: shortlist.has(r.itemId),
      evidence,
      scoreHistory: history.get(r.projectId) ?? (r.svi != null ? [r.svi] : []),
      reportUrl: r.reportUrl,
      dossierUrl: DOSSIER_PATH(r.evaluationId),
      profileUrl: r.projectSlug ? `/s/${encodeURIComponent(r.projectSlug)}` : null,
      dossierProduced: dossiers.has(r.evaluationId),
      feedbackLetterSent: letters.has(r.projectId),
    };
  });

  return { batch, role, rows, startups, snapshots, overridesCount };
}

/** Latest svi_snapshots.evidence_confidence per project (the batch item's own snapshot when it is the newest). */
async function loadLatestConfidenceByProject(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const sb = getSupabaseAdmin();
    if (!sb) return out;
    const { data, error } = await sb.from("svi_snapshots").select("project_id, evidence_confidence, created_at").in("project_id", ids).order("created_at", { ascending: false }).limit(ids.length * 4);
    if (error || !data) return out;
    for (const r of data as Array<Record<string, unknown>>) {
      const pid = String(r.project_id ?? "");
      if (!pid || out.has(pid)) continue;
      const v = Number(r.evidence_confidence);
      if (Number.isFinite(v)) out.set(pid, Math.round(v));
    }
    return out;
  } catch {
    return out;
  }
}

export interface ProgramJourneyLoad {
  view: ProgramJourneyView;
  bundle: CohortBundle | null;
}

/** The journey for the caller's chosen (or newest) batch, plus the intake counters. */
export async function loadProgramJourney(user: Pick<AppUser, "id">, opts: { batchId?: string | null; intake?: JourneyIntake | null } = {}): Promise<ProgramJourneyLoad> {
  const batches = await listBatches(user.id, 25);
  const wanted = opts.batchId && /^[0-9a-f-]{36}$/i.test(opts.batchId) ? opts.batchId : batches[0]?.id ?? null;
  const bundle = wanted ? await loadCohortBundle(user.id, wanted) : null;
  const snapshots: JourneySnapshot[] = (bundle?.snapshots ?? []).map((s) => {
    const svis = s.rows.map((r) => r.svi).filter((v): v is number => v != null);
    const sorted = [...svis].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianSvi = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    return { id: s.id, takenAt: s.takenAt, n: svis.length, medianSvi };
  });
  const view = buildProgramJourney({
    batch: bundle ? refOf(bundle.batch) : null,
    batches: batches.map(refOf),
    startups: bundle?.startups ?? [],
    intake: opts.intake ?? null,
    snapshots,
    overridesCount: bundle?.overridesCount ?? 0,
  });
  return { view, bundle };
}

/** The intake counters for the Intake tab — tolerant of a missing 0405 table. */
export async function loadIntakeSummary(userId: string): Promise<JourneyIntake> {
  try {
    const { listMyIntakes } = await import("@/lib/intake/program-intakes");
    const intakes = await listMyIntakes(userId);
    const open = intakes.filter((i) => i.status === "open");
    return {
      links: intakes.length,
      submissions: intakes.reduce((n, i) => n + (i.submissionCount ?? 0), 0),
      publicUrl: open[0]?.publicUrl ?? intakes[0]?.publicUrl ?? null,
      openLinks: open.length,
    };
  } catch {
    return { links: 0, submissions: 0, publicUrl: null, openLinks: 0 };
  }
}

// ---------------------------------------------------------------------------
// Cohort Report
// ---------------------------------------------------------------------------

export function journeyStartupToReportStartup(s: JourneyStartup): CohortReportStartup {
  return {
    itemId: s.itemId,
    projectId: s.projectId,
    name: s.name,
    status: s.status,
    svi: s.svi,
    confidence: s.confidence,
    verification: s.verification,
    stage: s.stage,
    delta: s.delta,
    topStrength: s.topStrength,
    topGap: s.topGap,
    dimensionScores: s.dimensionScores,
    decision: s.decision,
    assessmentStatus: s.assessmentStatus,
    shortlisted: s.shortlisted,
    evidenceLevels: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, s.evidence.levelByDim[k]])),
    evidenceCompletionPct: s.evidence.completionPct,
    dossierProduced: s.dossierProduced,
    feedbackLetterSent: s.feedbackLetterSent,
    reportUrl: s.reportUrl,
  };
}

export function cohortReportInputFromBundle(bundle: CohortBundle, user: Pick<AppUser, "displayName" | "email">, now = new Date(), marketBenchmark: CohortMarketBenchmark | null = null): CohortReportInput {
  return {
    programName: bundle.batch.programName ?? user.displayName ?? null,
    cohortName: bundle.batch.name,
    periodLabel: quarterLabelFor(now),
    generatedAt: now.toISOString(),
    methodologyVersion: SVI_VERSION,
    weights: bundle.batch.rubricWeights,
    startups: bundle.startups.map(journeyStartupToReportStartup),
    snapshots: bundle.snapshots,
    overridesCount: bundle.overridesCount,
    reviewer: { name: user.displayName ?? user.email ?? "", role: bundle.role === "owner" ? "Program owner" : bundle.role === "reviewer" ? "Program reviewer" : "Program viewer" },
    marketBenchmark,
  };
}

/** Pure: the stage most of the scored startups sit at (ties → the lower stage); null when none is scored. */
export function dominantStage(startups: ReadonlyArray<{ stage: number | null; svi: number | null }>): number | null {
  const counts = new Map<number, number>();
  for (const s of startups) if (s.svi != null && s.stage != null && Number.isFinite(s.stage)) counts.set(s.stage, (counts.get(s.stage) ?? 0) + 1);
  let best: number | null = null;
  for (const [stage, n] of counts) if (best == null || n > counts.get(best)! || (n === counts.get(best) && stage < best)) best = stage;
  return best;
}

/**
 * G21 P3-B: the external comparison set for the Cohort Report — the
 * published segment at the cohort's dominant stage (the batch rows carry no
 * sector, so the stage segment is the one asked for). Null published +
 * the sample size when nothing is published yet.
 */
export async function loadCohortMarketBenchmark(bundle: Pick<CohortBundle, "startups">): Promise<CohortMarketBenchmark | null> {
  const stage = dominantStage(bundle.startups);
  if (stage == null) return null;
  try {
    const { readPublishedSegment, readSegmentSampleSize } = await import("@/lib/benchmarks/segments-db");
    const seg = await readPublishedSegment(stage, null);
    if (seg) return { stage, sector: null, published: seg, fellBackToStage: seg.fellBackToStage, sampleSize: seg.n };
    return { stage, sector: null, published: null, fellBackToStage: false, sampleSize: await readSegmentSampleSize(stage, null) };
  } catch {
    return { stage, sector: null, published: null, fellBackToStage: false, sampleSize: 0 };
  }
}

export function cohortReportFromBundle(bundle: CohortBundle, user: Pick<AppUser, "displayName" | "email">, now = new Date(), marketBenchmark: CohortMarketBenchmark | null = null): CohortReportData {
  return buildCohortReport(cohortReportInputFromBundle(bundle, user, now, marketBenchmark));
}

// ---------------------------------------------------------------------------
// Demo-day pack — one Assessment Card per selected startup
// ---------------------------------------------------------------------------

export interface DemoDayPackStartup {
  card: AssessmentCardData;
  strengths: string[];
  gaps: string[];
  dossierUrl: string;
  profileUrl: string | null;
}

/** Ledger from the batch item's dimension scores + the highest evidence rung on file per dimension. */
export function assessmentCardFromJourneyStartup(s: JourneyStartup): AssessmentCardData {
  const dims: AssessmentLedgerDimension[] = DIMENSION_KEYS.map((k) => {
    const score = s.dimensionScores?.[k];
    const lvl = s.evidence.levelByDim[k];
    return {
      dim: k as DimKey,
      score: typeof score === "number" ? score : 0,
      weight: 12.5,
      assessed: typeof score === "number" && Number.isFinite(score),
      level: lvl > 0 ? CONFIDENCE_LEVELS[lvl - 1] : null,
    };
  });
  return buildAssessmentCard(
    { name: s.name, stageLabel: s.stage == null ? null : stageName(s.stage), verificationLevel: s.verification },
    { total: s.svi, dimensions: dims },
    {},
    { generatedAt: new Date().toISOString(), evidenceConfidence: s.confidence, methodologyVersion: SVI_VERSION },
  );
}

export function demoDayPackFromStartups(startups: JourneyStartup[]): DemoDayPackStartup[] {
  return startups.map((s) => {
    const card = assessmentCardFromJourneyStartup(s);
    const strengths = [s.topStrength ? `Strongest on ${s.topStrength}` : null, s.verification >= 2 ? `BlockID Verified L${s.verification}` : null, s.evidence.completionPct >= 50 ? `${s.evidence.completionPct} % of the evidence catalogue on file` : null].filter((x): x is string => Boolean(x));
    const gaps = [s.topGap ? `Biggest gap ${s.topGap}` : null, s.verification < 2 ? "Business identity not yet BlockID Verified" : null, s.evidence.completionPct < 50 ? `Evidence catalogue ${s.evidence.completionPct} % complete` : null].filter((x): x is string => Boolean(x));
    return { card, strengths, gaps, dossierUrl: s.dossierUrl, profileUrl: s.profileUrl };
  });
}
