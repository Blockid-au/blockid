// GET /api/svi/report/[projectId]
//
// Wave 25A — Supabase-backed rehydration for the Trusted Business Report.
// Returns the latest svi_snapshots row for `projectId`, projected into the
// shape that `BusinessReportClient` expects (`PersistedState`), so the TBR
// page can render even when localStorage has expired (30-min TTL) or been
// cleared. Auth-required: the caller must own the snapshot's account.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DimState {
  status: string;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  marketBenchmark: string | null;
}

interface CriterionState {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
}

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  criterionStates?: CriterionState[];
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
  stage?: string | null;
}

interface SnapshotRow {
  id: string;
  account_id: string;
  project_id: string | null;
  svi_total: number;
  created_at: string;
  criterion_results: unknown;
  dim_results: unknown;
  dimension_scores: unknown;
  analysis_json: unknown;
}

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

function toDimStates(raw: unknown): Record<string, DimState> {
  const out: Record<string, DimState> = {};
  for (const k of DIM_KEYS) {
    const v = (raw && typeof raw === "object" ? (raw as Record<string, unknown>)[k] : null) as
      | Partial<DimState>
      | null
      | undefined;
    out[k] = {
      status: typeof v?.status === "string" ? v.status : "idle",
      score: typeof v?.score === "number" ? v.score : null,
      markdown: typeof v?.markdown === "string" ? v.markdown : null,
      insights: Array.isArray(v?.insights) ? (v?.insights as string[]) : [],
      priority:
        v?.priority === "high" || v?.priority === "medium" || v?.priority === "low"
          ? v.priority
          : null,
      marketBenchmark:
        typeof v?.marketBenchmark === "string" ? v.marketBenchmark : null,
    };
  }
  return out;
}

/** Fallback path: caller had no `dim_results` (older snapshot). Rebuild a
 * minimal PersistedState from `dimension_scores` (only score + priority) so
 * the report at least shows the score table + rings, even without markdown. */
function fallbackDimStatesFromScores(raw: unknown): Record<string, DimState> {
  const out: Record<string, DimState> = {};
  const map = raw && typeof raw === "object" ? (raw as Record<string, { score?: number; priority?: string }>) : {};
  for (const k of DIM_KEYS) {
    const v = map[k];
    out[k] = {
      status: v ? "complete" : "idle",
      score: typeof v?.score === "number" ? v.score : null,
      markdown: null,
      insights: [],
      priority:
        v?.priority === "high" || v?.priority === "medium" || v?.priority === "low"
          ? v.priority
          : null,
      marketBenchmark: null,
    };
  }
  return out;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "missing_project" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Ownership: must have an svi_accounts row for this user.
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accountId = (account?.id as string | undefined) ?? null;

  // Latest snapshot for this project — scoped to the user's account so a
  // wrong `projectId` from the URL can't leak another founder's report.
  let query = supabase
    .from("svi_snapshots")
    .select(
      "id, account_id, project_id, svi_total, created_at, criterion_results, dim_results, dimension_scores, analysis_json",
    )
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId !== "default") {
    query = query.eq("project_id", projectId);
  }
  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = data as SnapshotRow;
  const dimStates = row.dim_results
    ? toDimStates(row.dim_results)
    : fallbackDimStatesFromScores(row.dimension_scores);
  const criterionStates = Array.isArray(row.criterion_results)
    ? (row.criterion_results as CriterionState[])
    : [];
  const meta = (row.analysis_json && typeof row.analysis_json === "object"
    ? (row.analysis_json as Record<string, unknown>)
    : {}) as { industry?: string | null; stageLabel?: string | null; totalMs?: number | null };

  const persisted: PersistedState = {
    savedAt: new Date(row.created_at).getTime(),
    dimStates,
    criterionStates,
    completed: DIM_KEYS.filter((k) => dimStates[k].score !== null).length,
    total: 8,
    totalMs: typeof meta.totalMs === "number" ? meta.totalMs : null,
    done: true,
    industry: meta.industry ?? null,
    stage: meta.stageLabel ?? null,
  };

  return NextResponse.json({ ok: true, persisted, snapshotId: row.id });
}
