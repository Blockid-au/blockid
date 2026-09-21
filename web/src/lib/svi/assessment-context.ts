// G21 P1 merge — the two cross-lane inputs the Assessment Card needs at
// render time, loaded once per surface and fail-soft:
//
//   • `unverifiedMaterialClaims` from the P1-A claim register
//     (`claims.assessment_status` in claimed / unverified / conflicting);
//     null when 0417 is not applied or the project has no claims yet, in
//     which case the card falls back to its ledger-derived count.
//   • `benchmark` = the stage median over the live `svi_analyses` rows,
//     published only under the P1-C n-rule (n < 10 → null, 10–29
//     "indicative", 30+ "benchmark", 100+ "segmented"). The card renders the
//     line only when this is non-null, always with `n`.
//
// Every surface (workspace score, TBR/ReportV2, dossier, PDF/DOCX twins)
// calls `loadAssessmentContext` so the same numbers appear everywhere.

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultClaimsDb } from "@/lib/evidence/claims-db";
import { unverifiedMaterialClaims } from "@/lib/evidence/records";
import { publishBenchmark, type BenchmarkBand } from "@/lib/benchmarks/publication-rules";
import type { AssessmentBenchmark, BenchmarkLabel } from "@/lib/svi/assessment-card";

export interface AssessmentContext {
  unverifiedMaterialClaims: number | null;
  benchmark: AssessmentBenchmark | null;
  /** The stored `svi_snapshots.evidence_confidence` (0419) — the ONE number every surface shows when present. */
  evidenceConfidence: number | null;
}

const BENCHMARK_ROW_LIMIT = 2000;
/** The stage benchmark changes with new analyses, not per view — one data-cache entry per stage, 1 h. */
const BENCHMARK_CACHE_SECONDS = 3600;
export const BENCHMARK_CACHE_TAG = "assessment-stage-benchmark";

function bandToLabel(band: BenchmarkBand): BenchmarkLabel | null {
  if (band === "indicative") return "indicative";
  if (band === "benchmark") return "benchmark";
  if (band === "segmented") return "segmented";
  return null;
}

/**
 * Pure: one score per company → the card's benchmark prop under the n-rule.
 * `n` counts COMPANIES (review P0, 2026-09-20): callers must pass one value
 * per project (the latest analysis), never one per analysis row.
 */
export function stageBenchmarkFromScores(scores: readonly number[], segment = "stage"): AssessmentBenchmark | null {
  const values = scores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;
  const published = publishBenchmark({ median: Math.round(median), n: values.length, segment });
  if (!published) return null;
  const label = bandToLabel(published.band);
  if (!label) return null;
  return { median: published.median, n: published.n, label };
}

/** Claims count for the card; null when the register is unavailable or empty. */
export async function loadUnverifiedMaterialClaims(projectId: string): Promise<number | null> {
  try {
    const db = await defaultClaimsDb();
    if (!db) return null;
    const claims = await db.listClaims(projectId);
    if (!claims || claims.length === 0) return null;
    return unverifiedMaterialClaims(claims);
  } catch {
    return null;
  }
}

/**
 * Pure: newest-first analysis rows → one score per project at the stage
 * (the latest analysis of each company; rows without a project id — guest
 * runs — are excluded so a repeat guest can never inflate n).
 */
export function latestScorePerProject(
  rows: ReadonlyArray<{ project_id: string | null; total_svi: number | string | null; stage: number | null }>,
  stage: number,
): number[] {
  const scores: number[] = [];
  for (const row of latestAnalysisPerProject(rows)) {
    // The newest analysis decides the company's stage; older rows at another
    // stage never count that company twice.
    if (row.stage !== stage) continue;
    const v = Number(row.total_svi);
    if (Number.isFinite(v)) scores.push(v);
  }
  return scores;
}

/**
 * Pure: newest-first analysis rows → the latest row per project (guest rows
 * without a project id are dropped). The ONE dedupe rule every benchmark
 * pool uses — the stage benchmark above and the nightly segment refresh
 * (lib/benchmarks/segments-db.ts, G21 P3-B) both go through it.
 */
export function latestAnalysisPerProject<T extends { project_id: string | null }>(rows: ReadonlyArray<T>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.project_id || seen.has(row.project_id)) continue;
    seen.add(row.project_id);
    out.push(row);
  }
  return out;
}

async function readStageBenchmark(stage: number): Promise<AssessmentBenchmark | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    // Only the stage is read from analysis_json (select the key, not the
    // 9 KB document): review P1 — this ran a 1.6 MB scan on every view.
    const { data, error } = await supabase
      .from("svi_analyses")
      .select("project_id, total_svi, stage:analysis_json->>stage")
      .not("total_svi", "is", null)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(BENCHMARK_ROW_LIMIT);
    if (error || !data) return null;
    const rows = (data as Array<{ project_id: string | null; total_svi: number | string | null; stage: string | number | null }>).map((r) => ({
      project_id: r.project_id,
      total_svi: r.total_svi,
      stage: r.stage == null || r.stage === "" ? null : Number(r.stage),
    }));
    return stageBenchmarkFromScores(latestScorePerProject(rows, stage), `stage ${stage}`);
  } catch {
    return null;
  }
}

const cachedStageBenchmark = unstable_cache((stage: number) => readStageBenchmark(stage), ["assessment-stage-benchmark"], {
  tags: [BENCHMARK_CACHE_TAG],
  revalidate: BENCHMARK_CACHE_SECONDS,
});

/** Live stage benchmark over the analyses (one score per company), published only under the n-rule; data-cached 1 h per stage. */
async function loadLiveStageBenchmark(stage: number): Promise<AssessmentBenchmark | null> {
  try {
    return await cachedStageBenchmark(stage);
  } catch (err) {
    // Outside the Next runtime (scripts, vitest) the data cache is absent.
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return readStageBenchmark(stage);
    return null;
  }
}

/**
 * The benchmark the Assessment Card prints for (stage, sector) — G21 P3-B:
 *   1. the nightly `benchmark_segments` table (lib/benchmarks/segments-db):
 *      the published stage × sector segment when it exists, else the
 *      published stage segment (its `segment` text says the sector segment
 *      is not published yet);
 *   2. before migration 0428 / the first cron run (no rows at all) the live
 *      stage benchmark over `svi_analyses` — the pre-P3 behaviour.
 * Always `{ median, n, label }` under the n-rule, or null.
 */
export async function loadBenchmarkFor(stage: number | null | undefined, sector?: string | null): Promise<AssessmentBenchmark | null> {
  if (stage == null || !Number.isFinite(stage)) return null;
  try {
    const { readPublishedSegment, segmentsAvailable } = await import("@/lib/benchmarks/segments-db");
    if (await segmentsAvailable()) {
      const seg = await readPublishedSegment(stage, sector);
      if (!seg) return null;
      const label = bandToLabel(seg.band);
      if (!label) return null;
      return { median: Math.round(seg.median), n: seg.n, label, segment: seg.segment, fellBackToStage: seg.fellBackToStage };
    }
  } catch {
    /* segments unavailable → live stage benchmark */
  }
  return loadLiveStageBenchmark(stage);
}

/** Pre-P3 name: the stage benchmark without a sector (alias of `loadBenchmarkFor(stage)`). */
export const loadStageBenchmark = (stage: number | null | undefined): Promise<AssessmentBenchmark | null> => loadBenchmarkFor(stage, null);

/** The stage + sector of the project's latest analysis (for surfaces that render before the report is resolved). */
export async function resolveProjectStageAndSector(projectId: string): Promise<{ stage: number | null; sector: string | null }> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { stage: null, sector: null };
    const { data, error } = await supabase
      .from("svi_analyses")
      .select("stage:analysis_json->>stage, sector:analysis_json->>sector")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { stage: null, sector: null };
    const row = data as { stage: string | number | null; sector: string | null };
    const v = row.stage == null || row.stage === "" ? NaN : Number(row.stage);
    return { stage: Number.isFinite(v) ? v : null, sector: typeof row.sector === "string" && row.sector ? row.sector : null };
  } catch {
    return { stage: null, sector: null };
  }
}

/** The stage of the project's latest analysis. */
export async function resolveProjectStage(projectId: string): Promise<number | null> {
  return (await resolveProjectStageAndSector(projectId)).stage;
}

/** The stored evidence confidence of the latest snapshot (0419); null before the first post-P1 snapshot. */
export async function loadStoredEvidenceConfidence(projectId: string): Promise<number | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("evidence_confidence")
      .eq("project_id", projectId)
      .not("evidence_confidence", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const v = Number((data as { evidence_confidence: number | string | null }).evidence_confidence);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  } catch {
    return null;
  }
}

/**
 * `sector` (G21 P3-B) selects the stage × sector segment when it is
 * published; callers that cannot name a sector pass nothing and get the
 * stage benchmark.
 */
export async function loadAssessmentContext(projectId: string | null | undefined, stage: number | null | undefined, sector?: string | null): Promise<AssessmentContext> {
  const [claims, benchmark, evidenceConfidence] = await Promise.all([
    projectId ? loadUnverifiedMaterialClaims(projectId) : Promise.resolve(null),
    loadBenchmarkFor(stage, sector),
    projectId ? loadStoredEvidenceConfidence(projectId) : Promise.resolve(null),
  ]);
  return { unverifiedMaterialClaims: claims, benchmark, evidenceConfidence };
}

/** The card options every surface passes — one place, so no surface can drop a field (review P1). */
export function assessmentCardOptionsFromContext(ctx: AssessmentContext): { unverifiedMaterialClaims: number | null; benchmark: AssessmentBenchmark | null; evidenceConfidence: number | null } {
  return { unverifiedMaterialClaims: ctx.unverifiedMaterialClaims, benchmark: ctx.benchmark, evidenceConfidence: ctx.evidenceConfidence };
}
