// Aggregate every AI evaluation a startup has ever produced into a single
// snapshot: score trajectory, latest valuation, agents that ran, deep-dive
// count, top recommendations distilled from all deep-dives.
//
// Reads from three tables (no schema change — data has been logging for weeks):
//   startup_score_history  — one row per SVI scoring run (main + user input)
//   startup_ai_analyses    — per-agent AI outputs attached to a score run
//   evidence_analyses      — per-dimension AI deep dives (user-clicked)
//
// Used by:
//   /admin/analyses               — per-user drill-in (planned)
//   /dashboard (founder home)      — "AI evaluation summary" card
//   /api/cron/founder-digest-*     — weekly email digest section

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface StartupAISummary {
  startupId: string;
  startupName: string | null;
  firstAnalysisAt: string | null;
  latestAnalysisAt: string | null;
  totalScoreRuns: number;
  totalDeepDives: number;
  totalAiCallsLogged: number;

  latestTotalScore: number | null;
  latestSubScores: Record<string, number> | null;
  scoreDelta7d: number | null;   // change vs 7 days ago
  scoreDelta30d: number | null;  // change vs 30 days ago

  latestValuationLowAud: number | null;
  latestValuationHighAud: number | null;

  latestConfidence: number | null;
  latestSource: string | null;

  agentsRun: string[];              // distinct agent_type values
  deepDiveDimensions: string[];     // distinct dimensions user deep-dived
  topRecommendations: string[];     // dedup + capped at 5, latest first
}

interface HistoryRow {
  id: string;
  startup_id: string;
  startup_name: string;
  total_score: number;
  sub_scores: Record<string, number> | null;
  valuation_low_aud: number | null;
  valuation_high_aud: number | null;
  confidence_score: number | null;
  source: string | null;
  created_at: string;
}
interface AiRow { agent_type: string; }
interface DeepDiveRow {
  dimension: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis_json: Record<string, any> | null;
  created_at: string;
}

function findScoreDelta(rows: HistoryRow[], daysAgo: number): number | null {
  if (rows.length === 0) return null;
  const latest = rows[0].total_score;
  const cutoff = Date.now() - daysAgo * 86_400_000;
  const priorRow = rows.find((r) => new Date(r.created_at).getTime() < cutoff);
  if (!priorRow) return null;
  return latest - priorRow.total_score;
}

/** Fetch the aggregated AI evaluation summary for one startup owned by one user. */
export async function getStartupAISummary(
  userId: string,
  startupId: string,
): Promise<StartupAISummary | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: rowsRaw } = await supabase
    .from("startup_score_history")
    .select("id, startup_id, startup_name, total_score, sub_scores, valuation_low_aud, valuation_high_aud, confidence_score, source, created_at")
    .eq("user_id", userId)
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (rowsRaw ?? []) as HistoryRow[];
  if (rows.length === 0) return null;

  const historyIds = rows.map((r) => r.id);
  const [{ data: aisRaw }, { data: deepsRaw }] = await Promise.all([
    supabase
      .from("startup_ai_analyses")
      .select("agent_type")
      .in("history_id", historyIds),
    // evidence_analyses joins by account_id; look up account via svi_accounts
    supabase
      .from("evidence_analyses")
      .select("dimension, analysis_json, created_at, svi_accounts!inner(user_id)")
      .eq("svi_accounts.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const ais = (aisRaw ?? []) as AiRow[];
  const deeps = (deepsRaw ?? []) as DeepDiveRow[];

  const latest = rows[0];
  const oldest = rows[rows.length - 1];

  const agentsRun = [...new Set(ais.map((a) => a.agent_type))];
  const deepDiveDimensions = [...new Set(
    deeps.map((d) => d.dimension).filter((v): v is string => Boolean(v)),
  )];

  // Distill top recommendations from most recent deep-dives (5 max, dedup case-insensitive)
  const seenReco = new Set<string>();
  const topRecommendations: string[] = [];
  for (const d of deeps) {
    const recs = d.analysis_json?.recommendations;
    if (!Array.isArray(recs)) continue;
    for (const r of recs) {
      const action = typeof r === "string" ? r : (r as { action?: unknown })?.action;
      if (typeof action !== "string") continue;
      const key = action.trim().toLowerCase();
      if (seenReco.has(key) || key.length < 5) continue;
      seenReco.add(key);
      topRecommendations.push(action.trim());
      if (topRecommendations.length >= 5) break;
    }
    if (topRecommendations.length >= 5) break;
  }

  return {
    startupId: latest.startup_id,
    startupName: latest.startup_name ?? null,
    firstAnalysisAt: oldest.created_at,
    latestAnalysisAt: latest.created_at,
    totalScoreRuns: rows.length,
    totalDeepDives: deeps.length,
    totalAiCallsLogged: ais.length + deeps.length,
    latestTotalScore: latest.total_score,
    latestSubScores: latest.sub_scores,
    scoreDelta7d: findScoreDelta(rows, 7),
    scoreDelta30d: findScoreDelta(rows, 30),
    latestValuationLowAud: latest.valuation_low_aud,
    latestValuationHighAud: latest.valuation_high_aud,
    latestConfidence: latest.confidence_score,
    latestSource: latest.source,
    agentsRun,
    deepDiveDimensions,
    topRecommendations,
  };
}

/** Fetch summaries for ALL of a user's startups. Latest activity first. */
export async function getAllStartupSummaries(
  userId: string,
): Promise<StartupAISummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data } = await supabase
    .from("startup_score_history")
    .select("startup_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const distinct = [...new Set((data ?? []).map((r: { startup_id: string }) => r.startup_id))];

  const summaries = await Promise.all(distinct.map((sid) => getStartupAISummary(userId, sid)));
  return summaries.filter((s): s is StartupAISummary => s !== null);
}
