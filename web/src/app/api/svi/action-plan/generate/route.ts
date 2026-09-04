// POST /api/svi/action-plan/generate
//
// Wave 28C — Personalised 30-Day Action Plan.
//
// Body:  { sviRunId: string }
// Reply: { ok: true, plan, tasks, cached }
//        { ok: false, error }
//
// Loads the target `svi_snapshots` row (ownership-checked), then either
// returns the cached `svi_action_plans` row for the run or asks the free-tier
// AI chain (see `generateActionPlan()` in lib/action-plan/generate.ts) to
// produce five tasks and persist them.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateActionPlan, type DimResultLike, type CriterionResultLike } from "@/lib/action-plan/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SnapshotRow {
  id: string;
  account_id: string | null;
  project_id: string | null;
  dim_results: unknown;
  criterion_results: unknown;
  analysis_json: unknown;
}

interface AccountRow {
  id: string;
  user_id: string | null;
  email: string | null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { sviRunId?: unknown };
  try {
    body = (await request.json()) as { sviRunId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sviRunId = typeof body.sviRunId === "string" ? body.sviRunId.trim() : "";
  if (!sviRunId) {
    return NextResponse.json({ ok: false, error: "missing_svi_run_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const { data: snapRaw, error: snapErr } = await supabase
    .from("svi_snapshots")
    .select("id, account_id, project_id, dim_results, criterion_results, analysis_json")
    .eq("id", sviRunId)
    .maybeSingle();

  if (snapErr) {
    return NextResponse.json(
      { ok: false, error: "snapshot_fetch_failed", detail: snapErr.message },
      { status: 500 },
    );
  }
  if (!snapRaw) {
    return NextResponse.json({ ok: false, error: "snapshot_not_found" }, { status: 404 });
  }
  const snap = snapRaw as SnapshotRow;

  // Ownership check — the caller must own the svi_accounts row that owns
  // this snapshot. Falls back to email match for older accounts that pre-
  // date the user_id column.
  if (snap.account_id) {
    const { data: acctRaw } = await supabase
      .from("svi_accounts")
      .select("id, user_id, email")
      .eq("id", snap.account_id)
      .maybeSingle();
    const acct = acctRaw as AccountRow | null;
    const owned =
      acct != null &&
      ((acct.user_id && acct.user_id === user.id) ||
        (acct.email && user.email && acct.email.toLowerCase() === user.email.toLowerCase()));
    if (!owned) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const dimResults = (snap.dim_results ?? null) as Record<string, DimResultLike> | null;
  const criterionResults = Array.isArray(snap.criterion_results)
    ? (snap.criterion_results as CriterionResultLike[])
    : null;
  const meta = (snap.analysis_json && typeof snap.analysis_json === "object"
    ? (snap.analysis_json as Record<string, unknown>)
    : {}) as { industry?: string | null };

  try {
    const result = await generateActionPlan({
      userId: user.id,
      startupId: snap.project_id ?? null,
      sviRunId: snap.id,
      dimResults,
      criterionResults,
      sector: meta.industry ?? null,
    });
    return NextResponse.json({
      ok: true,
      cached: result.cached,
      plan: {
        id: result.id,
        svi_run_id: result.svi_run_id,
        startup_id: result.startup_id,
        created_at: result.created_at,
        meta: result.plan,
      },
      tasks: result.tasks,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[svi/action-plan/generate] failed", detail);
    return NextResponse.json({ ok: false, error: "generation_failed", detail }, { status: 500 });
  }
}
