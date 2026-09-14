// dashboard-bridge — lets /dashboard see an `analyses` run.
//
// S31-B (2026-09-13). The dashboard's first-run panel says "Run your first
// SVI score" and its primary CTA is /analyze. /analyze → POST /api/intake →
// the `analyses` table (lib/analyses/store). The dashboard, its onboarding
// redirect and its history chart read ONLY `svi_analyses` (written by
// POST /api/svi, the older /svi entrance). So a trial founder who did
// exactly what the dashboard asked came back to the same "run your first
// score" panel — the single worst dead end in the first ten minutes.
//
// This is the read-side bridge: the latest claimed `analyses` row for the
// user, rebuilt into the SVIAnalysis shape the dashboard already renders,
// via the same pure `computeSVI(signals)` the /analyze screen used — so the
// dashboard can never disagree with what the founder was shown. No writes,
// no new tables, nothing for the audit / scope guards to learn.

import { computeSVI, type SVIAnalysis } from "@/lib/svi-analysis";

/**
 * The narrow slice of a Supabase client this module touches. Kept
 * structurally loose (`from` only) so passing the real, schema-generic
 * client does not send tsc into a "type instantiation is excessively deep"
 * comparison; the chain is typed privately below.
 */
export interface BridgeClient {
  from(table: string): unknown;
}

type Reply = { data: unknown; error: unknown; count?: number | null };
interface Chain {
  select(columns: string, opts?: { count?: "exact"; head?: boolean }): Chain;
  eq(col: string, val: unknown): Chain;
  order(col: string, opts: { ascending: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): PromiseLike<Reply>;
  then: PromiseLike<Reply>["then"];
}

export interface BridgedAnalysis {
  /** `analyses.id` — a different id space from svi_analyses; never mix them. */
  analysisId: string;
  analysis: SVIAnalysis;
  totalSVI: number;
  createdAt: string;
  rawInput: string | undefined;
}

interface AnalysisRow {
  id?: string;
  intake?: { signals?: unknown } | null;
  svi_total?: number | null;
  input_text?: string | null;
  created_at?: string;
}

/**
 * Rebuild the SVIAnalysis for an `analyses` row. Pure; exported for the
 * test. Returns null when the row carries no signals (an older or
 * truncated row) — the caller then falls through to the empty state, which
 * is honest: we cannot show a score we cannot recompute.
 */
export function rebuildFromRow(row: AnalysisRow | null | undefined): BridgedAnalysis | null {
  if (!row || !row.id || !row.intake || !row.intake.signals) return null;
  try {
    const analysis = computeSVI(row.intake.signals as Parameters<typeof computeSVI>[0]);
    const total = typeof row.svi_total === "number" ? row.svi_total : analysis.totalSVI;
    return {
      analysisId: row.id,
      analysis: { ...analysis, totalSVI: total },
      totalSVI: total,
      createdAt: row.created_at ?? new Date(0).toISOString(),
      rawInput: row.input_text ?? undefined,
    };
  } catch (err) {
    console.error("[analyses:bridge] rebuild failed —", err);
    return null;
  }
}

/** Latest claimed `analyses` run for this user, or null. Never throws. */
export async function latestIntakeAnalysisForUser(
  supabase: BridgeClient | null | undefined,
  userId: string | null | undefined,
): Promise<BridgedAnalysis | null> {
  if (!supabase || !userId) return null;
  try {
    const { data } = await (supabase.from("analyses") as Chain)
      .select("id, intake, svi_total, input_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return rebuildFromRow(data as AnalysisRow | null);
  } catch (err) {
    console.error("[analyses:bridge] read failed —", err);
    return null;
  }
}

/** How many claimed `analyses` runs this user has. 0 on any failure. */
export async function countIntakeAnalysesForUser(
  supabase: BridgeClient | null | undefined,
  userId: string | null | undefined,
): Promise<number> {
  if (!supabase || !userId) return 0;
  try {
    const { count } = await (supabase.from("analyses") as Chain)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}
