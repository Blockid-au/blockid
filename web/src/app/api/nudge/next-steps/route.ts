// GET /api/nudge/next-steps
//
// Returns the founder's current-phase nudge (see
// docs/plans/atlassian-standard-mapping-goal.md §3). Reads:
//   - projects (default project)
//   - startup_phase_progress
//   - svi_analyses (latest dimension scores)
//   - evidence_items
//   - dataroom_files (current status per template row)
//
// Auth: getCurrentUser() → 401 unauthenticated.
// Cache-Control: private, max-age=3600.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  computeNextSteps,
  type NudgePhaseProgressRow,
  type NudgeSviScoreRow,
  type NudgeDataroomRow,
  type NudgeEvidenceItem,
  type NudgeProject,
} from "@/lib/nudge/next-steps";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Degrade gracefully — return a "not-started" envelope so the tile
    // renders empty rather than exploding on a dev machine with no DB.
    return NextResponse.json(
      {
        ok: true,
        result: computeNextSteps({
          user: { id: user.id, email: user.email },
          project: null,
          phaseProgress: [],
          sviScores: [],
          dataroomRows: [],
          evidenceItems: [],
        }),
        meta: { source: "empty_no_db" },
      },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  }

  const project = await getActiveProject(user.id);
  const projectId = project?.id ?? null;

  // Phase progress — scoped to the active project (or account when the row
  // pre-dates multi-project support).
  let phaseProgress: NudgePhaseProgressRow[] = [];
  if (projectId) {
    const { data } = await supabase
      .from("startup_phase_progress")
      .select(
        "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
      )
      .eq("project_id", projectId)
      .order("phase_order", { ascending: true });
    phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
  }
  if (phaseProgress.length === 0) {
    // Fall back to account-level rows (created by legacy onboarding).
    const { data: accRow } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    if (accRow?.id) {
      const { data } = await supabase
        .from("startup_phase_progress")
        .select(
          "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
        )
        .eq("account_id", accRow.id)
        .order("phase_order", { ascending: true });
      phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
    }
  }

  // Latest SVI analysis — dimension scores live inside analysis_json.
  let sviScores: NudgeSviScoreRow[] = [];
  const { data: sviRow } = await supabase
    .from("svi_analyses")
    .select("analysis_json")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sviRow?.analysis_json) {
    sviScores = extractSviScores(sviRow.analysis_json);
  }

  // Data room rows — scoped by user_id (dataroom_files does not currently
  // have a project_id column).
  const { data: drRows } = await supabase
    .from("dataroom_files")
    .select("svi_dimension, file_name, status, mime_type")
    .eq("user_id", user.id);
  const dataroomRows: NudgeDataroomRow[] = (drRows ?? []) as NudgeDataroomRow[];

  // Evidence items — account-scoped.
  let evidenceItems: NudgeEvidenceItem[] = [];
  const { data: accForEv } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (accForEv?.id) {
    const { data: evRows } = await supabase
      .from("evidence_items")
      .select("dimension, evidence_type, confidence_level")
      .eq("account_id", accForEv.id);
    evidenceItems = (evRows ?? []) as NudgeEvidenceItem[];
  }

  const nudgeProject: NudgeProject | null = project
    ? {
        id: project.id,
        growth_phase_current: null,
      }
    : null;

  const result = computeNextSteps({
    user: { id: user.id, email: user.email },
    project: nudgeProject,
    phaseProgress,
    sviScores,
    dataroomRows,
    evidenceItems,
  });

  return NextResponse.json(
    {
      ok: true,
      result,
      meta: {
        project_id: projectId,
        computed_at: new Date().toISOString(),
        fresh_for_seconds: 3600,
        afsl_disclaimer:
          "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth).",
      },
    },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}

// Best-effort extractor for the SVI analysis JSON. `analysis_json` shape
// varies across svi_version — we look at a handful of well-known slots
// and coerce them into the pure NudgeSviScoreRow[] shape.
function extractSviScores(json: unknown): NudgeSviScoreRow[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Record<string, unknown>;
  const out: NudgeSviScoreRow[] = [];

  const criteria = j.criteria;
  if (criteria && typeof criteria === "object") {
    for (const [key, value] of Object.entries(criteria)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        const score = typeof v.score === "number" ? v.score : null;
        if (score !== null) {
          out.push({ criterion_key: key, score });
        }
      }
    }
  }

  const dimensions = j.dimensions;
  if (Array.isArray(dimensions)) {
    for (const d of dimensions) {
      if (d && typeof d === "object") {
        const v = d as Record<string, unknown>;
        const dim =
          (typeof v.key === "string" && v.key) ||
          (typeof v.dimension === "string" && v.dimension) ||
          null;
        const score = typeof v.score === "number" ? v.score : null;
        if (dim && score !== null) {
          out.push({ dimension: dim, score });
        }
      }
    }
  }

  return out;
}
