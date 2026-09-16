// POST /api/pitchdeck/save-snapshot
//
// Wave 13 — persist a completed pitchdeck analysis as an SVI snapshot so
// /api/svi/history returns it on the next visit (which powers the
// score-delta banner + comparison over time on the streaming analyzer).
//
// Body: {
//   pitchdeckId: string,
//   totalSVI:    number,
//   dimResults:  Record<DimKey, {score, priority?}>,
// }
//
// Idempotent: if the pitchdeck row is already `done`, we do NOT insert a
// second snapshot — return the existing final_svi. This lets the client
// retry safely without polluting history.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { fromSnapshot, type SnapshotCriterionState, type SnapshotDimState } from "@/lib/report-v2/adapter";
import { writeSnapshotReportV2 } from "@/lib/report-v2/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];

interface DimResult {
  score: number;
  priority?: "high" | "medium" | "low";
}

interface PitchdeckRow {
  id: string;
  user_id: string;
  project_id: string | null;
  filename: string;
  final_svi: number | null;
  status: string;
  extracted_text: string;
}

async function POST_handler(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    pitchdeckId?: string;
    totalSVI?: number;
    dimResults?: Record<string, DimResult>;
    // Wave 25A — full serialised state so the TBR (business report) can be
    // rehydrated from Supabase after localStorage expires.
    criterionResults?: unknown[];
    dimResultsFull?: Record<string, unknown>;
    industry?: string | null;
    stage?: string | null;
    totalMs?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const pitchdeckId = body.pitchdeckId?.trim() ?? "";
  const totalSVI = typeof body.totalSVI === "number" ? Math.round(body.totalSVI) : NaN;
  if (!pitchdeckId || !Number.isFinite(totalSVI) || totalSVI < 0 || totalSVI > 100) {
    return NextResponse.json(
      { ok: false, error: "missing_pitchdeckId_or_invalid_svi" },
      { status: 400 },
    );
  }
  const dimResults: Record<string, DimResult> = {};
  const rawDims = body.dimResults ?? {};
  for (const key of DIM_KEYS) {
    const entry = rawDims[key];
    if (entry && typeof entry.score === "number") {
      dimResults[key] = {
        score: Math.round(entry.score),
        priority:
          entry.priority === "high" || entry.priority === "medium" || entry.priority === "low"
            ? entry.priority
            : undefined,
      };
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 500 });
  }

  const { data: fetched, error: fetchErr } = await supabase
    .from("pitchdeck_analyses")
    .select("id, user_id, project_id, filename, final_svi, status, extracted_text")
    .eq("id", pitchdeckId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: fetchErr.message },
      { status: 500 },
    );
  }
  if (!fetched) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const deck = fetched as PitchdeckRow;

  // Idempotency: if the row is already done, don't re-snapshot. Return the
  // previously stored value so the client sees a stable response on retry.
  if (deck.status === "done" && deck.final_svi !== null) {
    return NextResponse.json({
      ok: true,
      pitchdeckId,
      totalSVI: deck.final_svi,
      alreadySaved: true,
    });
  }

  // Resolve svi_accounts row for account_id (required by svi_snapshots FK).
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, project_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accountId = (account?.id as string | undefined) ?? null;
  const resolvedProjectId =
    deck.project_id ?? (account?.project_id as string | undefined) ?? null;

  // Prior snapshot for delta computation.
  let priorSVI: number | null = null;
  if (accountId) {
    const { data: prior } = await supabase
      .from("svi_snapshots")
      .select("svi_total")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.svi_total !== undefined && prior?.svi_total !== null) {
      priorSVI = Number(prior.svi_total);
    }
  }
  const delta = priorSVI !== null ? totalSVI - priorSVI : null;

  // Best-effort snapshot insert. If the FK to svi_accounts fails (no
  // account yet — new signup) we still mark the pitchdeck row `done`.
  let snapshotInserted = false;
  if (accountId) {
    const criterionResults = Array.isArray(body.criterionResults)
      ? body.criterionResults
      : null;
    const dimResultsFull =
      body.dimResultsFull && typeof body.dimResultsFull === "object"
        ? body.dimResultsFull
        : null;

    const { data: insertedSnap, error: insertErr } = await supabase.from("svi_snapshots").insert({
      account_id: accountId,
      project_id: resolvedProjectId,
      svi_total: totalSVI,
      stage: null,
      analysis_json: {
        source: "pitchdeck",
        pitchdeck_id: pitchdeckId,
        filename: deck.filename,
        dimResults,
        industry: body.industry ?? null,
        stageLabel: body.stage ?? null,
        totalMs: typeof body.totalMs === "number" ? body.totalMs : null,
      },
      delta,
      dimension_scores: dimResults,
      // Wave 25A columns (nullable) — powers /workspace/business-report
      // rehydration + /tbr/<token> public share links + PDF export.
      criterion_results: criterionResults,
      dim_results: dimResultsFull,
    }).select("id").maybeSingle();
    if (!insertErr) {
      snapshotInserted = true;
      // G13-W1-R1: ReportV2 document for /tbr + /workspace/business-report
      // (svi_snapshots.report_v2, migration 0395). Written AFTER the insert so
      // a missing column can never break snapshot creation; readers fall back
      // to the same adapter on null.
      const snapshotId = (insertedSnap as { id?: string } | null)?.id;
      if (snapshotId) {
        const dimStates: Record<string, SnapshotDimState> = {};
        const full = (dimResultsFull ?? {}) as Record<string, Partial<SnapshotDimState>>;
        for (const k of DIM_KEYS) {
          const f = full[k];
          dimStates[k] = {
            status: "complete",
            score: typeof f?.score === "number" ? f.score : dimResults[k]?.score ?? null,
            markdown: typeof f?.markdown === "string" ? f.markdown : null,
            insights: Array.isArray(f?.insights) ? f.insights : [],
            priority: f?.priority ?? dimResults[k]?.priority ?? null,
            marketBenchmark: typeof f?.marketBenchmark === "string" ? f.marketBenchmark : null,
          };
        }
        await writeSnapshotReportV2(
          supabase,
          snapshotId,
          fromSnapshot({
            snapshotId,
            projectId: resolvedProjectId,
            accountId,
            industry: body.industry ?? null,
            stageLabel: body.stage ?? null,
            sviTotal: totalSVI,
            deltaVsLast: delta,
            dimStates,
            criterionStates: (criterionResults as SnapshotCriterionState[] | null) ?? null,
            tier: "standard",
          }),
        );
      }
    } else {
      console.warn("[blockid:pitchdeck] snapshot insert failed", insertErr.message);
    }
  }

  await supabase
    .from("pitchdeck_analyses")
    .update({
      final_svi: totalSVI,
      status: "done",
    })
    .eq("id", pitchdeckId);

  return NextResponse.json({
    ok: true,
    pitchdeckId,
    totalSVI,
    snapshotInserted,
    delta,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/pitchdeck/save-snapshot/route.ts", method: "POST" }, POST_handler);
