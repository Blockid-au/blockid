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

import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultClaimsDb } from "@/lib/evidence/claims-db";
import { unverifiedMaterialClaims } from "@/lib/evidence/records";
import { publishBenchmark, type BenchmarkBand } from "@/lib/benchmarks/publication-rules";
import type { AssessmentBenchmark, BenchmarkLabel } from "@/lib/svi/assessment-card";

export interface AssessmentContext {
  unverifiedMaterialClaims: number | null;
  benchmark: AssessmentBenchmark | null;
}

const BENCHMARK_ROW_LIMIT = 500;

function bandToLabel(band: BenchmarkBand): BenchmarkLabel | null {
  if (band === "indicative") return "indicative";
  if (band === "benchmark") return "benchmark";
  if (band === "segmented") return "segmented";
  return null;
}

/** Pure: stage median + n → the card's benchmark prop under the n-rule. */
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

/** Stage benchmark over the live analyses, published only under the n-rule. */
export async function loadStageBenchmark(stage: number | null | undefined): Promise<AssessmentBenchmark | null> {
  if (stage == null || !Number.isFinite(stage)) return null;
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("svi_analyses")
      .select("total_svi, analysis_json")
      .not("total_svi", "is", null)
      .order("created_at", { ascending: false })
      .limit(BENCHMARK_ROW_LIMIT);
    if (error || !data) return null;
    const scores: number[] = [];
    for (const row of data as Array<{ total_svi: number | string | null; analysis_json: unknown }>) {
      const aj = row.analysis_json as { stage?: number } | null;
      if (aj?.stage !== stage) continue;
      const v = Number(row.total_svi);
      if (Number.isFinite(v)) scores.push(v);
    }
    return stageBenchmarkFromScores(scores, `stage ${stage}`);
  } catch {
    return null;
  }
}

export async function loadAssessmentContext(projectId: string | null | undefined, stage: number | null | undefined): Promise<AssessmentContext> {
  const [claims, benchmark] = await Promise.all([
    projectId ? loadUnverifiedMaterialClaims(projectId) : Promise.resolve(null),
    loadStageBenchmark(stage),
  ]);
  return { unverifiedMaterialClaims: claims, benchmark };
}
