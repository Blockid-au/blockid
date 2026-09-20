// GET /api/svi/report/[projectId]
//
// Wave 25A — Supabase-backed rehydration for the Trusted Business Report.
// Returns the latest svi_snapshots row for `projectId`, projected into the
// shape that `BusinessReportClient` expects (`PersistedState`), so the TBR
// page can render even when localStorage has expired (30-min TTL) or been
// cleared. Auth-required: the caller must own the snapshot's account.
//
// Release QA-4 (P1-1, 2026-09-12): the previous ownership lookup selected
// `svi_accounts.user_id`, a column no migration ever added, so the account
// resolved to null and the `account_id` filter was silently dropped — any
// signed-in user could read another tenant's snapshot by project id (or the
// newest row in the table via `default`). The route now resolves the project
// through the S17-A/S18-A role gate (`assertProjectScope` for an explicit id,
// cookie scope for `default`), resolves the svi_accounts row on the scope's
// data email, and ALWAYS filters on (account_id, project_id). No account →
// 404, never an unfiltered query.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  assertProjectScope,
  findSVIAccountWithFallback,
  getProjectScope,
  type ProjectScope,
} from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { readSnapshotReportV2 } from "@/lib/report-v2/storage";

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
  sviTotal?: number | null;
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

/**
 * "No analysis stored yet" for a project the caller may open — a 200 empty
 * state, not a 404 (G20-sweep: the business-report page fetched this on
 * every first paint and the console logged a failed request for every
 * founder who had not run an analysis). The client keys on `persisted`.
 */
const EMPTY_REPORT = { ok: true, persisted: null, snapshotId: null, reportV2: null, empty: "no_analysis" } as const;

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
  // `dimension_scores` is `{ftv: 71, …}` (a bare number per dim) on every
  // stored row today; the `{score, priority}` object shape is accepted too.
  const map = raw && typeof raw === "object" ? (raw as Record<string, number | { score?: number; priority?: string } | null>) : {};
  for (const k of DIM_KEYS) {
    const rawV = map[k];
    const v = typeof rawV === "number" ? { score: rawV, priority: undefined } : rawV && typeof rawV === "object" ? rawV : null;
    out[k] = {
      status: v && typeof v.score === "number" ? "complete" : "idle",
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

  // Project scope — `default` is the cookie-selected project (member-aware,
  // viewer+); an explicit id must be one the caller can open (404 for a
  // non-member so existence is not confirmed, 403 below viewer, 503 no DB).
  let scope: ProjectScope | null;
  try {
    scope =
      projectId === "default"
        ? await getProjectScope("viewer")
        : await assertProjectScope(user, projectId, "viewer");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }

  // Ownership: the svi_accounts row keyed on the scope's data email (the
  // owner's email for a shared project, the caller's own otherwise). A
  // caller with no project at all only ever reaches their OWN legacy
  // (project_id IS NULL) record; a member never reaches the owner's legacy
  // record (`callerEmail`, P2-1).
  const dataEmail = scope?.dataEmail ?? user.email;
  const scopedProjectId = scope?.projectId ?? null;
  const account = await findSVIAccountWithFallback(dataEmail, scopedProjectId, "id, project_id", {
    callerEmail: user.email,
  });
  const accountId = typeof account?.id === "string" ? account.id : null;
  if (!accountId) {
    // G20-sweep: the caller's own scope with no analysis yet is the report
    // page's normal first-paint state (it fetches this on mount), not an
    // error — 200 + `persisted: null`, still never an unfiltered query.
    // Foreign / non-member project ids stay 404 from the role gate above.
    return NextResponse.json(EMPTY_REPORT);
  }
  const accountProjectId =
    typeof account?.project_id === "string" ? (account.project_id as string) : null;

  // Latest snapshot for this project — ALWAYS scoped to the resolved account
  // AND project. The account filter is the tenancy boundary; the project
  // filter keeps a multi-project founder on the right startup. A legacy
  // (pre-project) account may hold rows stamped with the scoped project id
  // or none at all — both are the caller's own data.
  let query = supabase
    .from("svi_snapshots")
    .select(
      "id, account_id, project_id, svi_total, created_at, criterion_results, dim_results, dimension_scores, analysis_json",
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (accountProjectId) {
    query = query.eq("project_id", accountProjectId);
  } else if (scopedProjectId && isUuid(scopedProjectId)) {
    query = query.or(`project_id.eq.${scopedProjectId},project_id.is.null`);
  } else {
    query = query.is("project_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(EMPTY_REPORT);
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
    sviTotal: typeof row.svi_total === "number" && Number.isFinite(row.svi_total) ? row.svi_total : null,
  };

  // G13-W1-R1: hand the client a stored ReportV2 when migration 0395 has
  // landed and the pipeline wrote one; null otherwise (the client lifts
  // `persisted` through src/lib/report-v2/adapter.ts). Separate best-effort
  // read so a missing column never fails this route.
  const reportV2 = await readSnapshotReportV2(supabase, row.id);

  return NextResponse.json({ ok: true, persisted, snapshotId: row.id, reportV2 });
}
