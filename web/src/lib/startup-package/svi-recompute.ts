// Startup Package — Real-time SVI recompute on interview activity.
//
// Called from:
//   - /api/startup-package/save-answer  (after every answer upsert)
//   - /api/startup-package/analyze      (after each agent dispatch)
//
// Contract: read every interview answer for the project, concat into a raw
// text blob, extract signals, run computeSVI, then insert a new
// svi_snapshots row with source:'package_step' so the live-meter component
// picks up the delta on its next poll.
//
// Server-only — imports Supabase admin. Never bundle into the wizard client.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeSVI,
  extractSignals,
  type SVIAnalysis,
} from "@/lib/svi-analysis";

export interface RecomputeResult {
  ok: boolean;
  svi: number;
  delta: number | null;
  stage: number;
  reason?: string;
}

/**
 * Recompute the SVI for a project from every stored interview answer
 * and persist a new svi_snapshots row. Returns the new total + delta.
 *
 * Fail-soft: if the DB is unavailable or the tables don't yet exist the
 * result carries `ok:false` so the caller can degrade the UX (skip the
 * meter update) without a 500.
 */
export async function recomputeAndSnapshot(
  projectId: string,
): Promise<RecomputeResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, svi: 100, delta: null, stage: 0, reason: "no_db" };
  }

  // ── 1. Resolve the svi_accounts row for this project ──
  //    The Startup Package always operates on the founder's project — so we
  //    scope to project_id first, then fall back to the project owner's
  //    email if the account was created before multi-project support.
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { ok: false, svi: 100, delta: null, stage: 0, reason: "no_project" };
  }

  // Read owner's email — svi_accounts is keyed by (email, project_id).
  const { data: owner } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", project.user_id as string)
    .maybeSingle();

  const email = (owner?.email as string | undefined) ?? "";
  if (!email) {
    return { ok: false, svi: 100, delta: null, stage: 0, reason: "no_email" };
  }

  // Locate (or lazily create) the svi_accounts row scoped to this project.
  let accountId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", email)
      .eq("project_id", projectId)
      .maybeSingle();

    if (existing) {
      accountId = existing.id as string;
    } else {
      const { data: created } = await supabase
        .from("svi_accounts")
        .insert({
          email,
          project_id: projectId,
          startup_name: (project.name as string) ?? null,
          last_active_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      accountId = (created?.id as string | undefined) ?? null;
    }
  }

  if (!accountId) {
    return { ok: false, svi: 100, delta: null, stage: 0, reason: "no_account" };
  }

  // ── 2. Concatenate every interview answer for the project ──
  const { data: answers } = await supabase
    .from("startup_package_interview")
    .select("step_key, answer_text")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const rawText =
    (answers ?? [])
      .map(
        (a: { step_key: string; answer_text: string }) =>
          `## ${a.step_key}\n${a.answer_text}`,
      )
      .join("\n\n") || (project.name as string) || "";

  // ── 3. Extract signals + compute SVI ──
  const signals = extractSignals({ rawText });

  // Look up prior snapshot for delta.
  const { data: prior } = await supabase
    .from("svi_snapshots")
    .select("svi_total")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysis: SVIAnalysis = computeSVI(signals);
  const priorSVI = (prior?.svi_total as number | undefined) ?? null;
  const delta = priorSVI !== null ? analysis.totalSVI - priorSVI : null;

  // ── 4. Persist snapshot ──
  const { error: insertErr } = await supabase.from("svi_snapshots").insert({
    account_id: accountId,
    project_id: projectId,
    svi_total: analysis.totalSVI,
    stage: analysis.stage,
    analysis_json: analysis as unknown as Record<string, unknown>,
    delta,
    dimension_scores: analysis.dimensionScores ?? null,
    // Non-standard column captured in analysis_json.source for downstream
    // filters — the schema doesn't have a dedicated `source` column, so we
    // annotate the payload instead of adding a migration column here.
  });

  if (insertErr) {
    // 42P01 = undefined_table (migration 0116 not applied yet). Fail soft
    // so the interview + analyze flows still work while subgoal 1 lands.
    return {
      ok: false,
      svi: analysis.totalSVI,
      delta,
      stage: analysis.stage,
      reason: "snapshot_insert_failed",
    };
  }

  // Bump svi_accounts.current_svi so read paths stay coherent.
  await supabase
    .from("svi_accounts")
    .update({
      current_svi: analysis.totalSVI,
      current_stage: analysis.stage,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  return {
    ok: true,
    svi: analysis.totalSVI,
    delta,
    stage: analysis.stage,
  };
}

/**
 * Read the latest svi_snapshot for a project — used by the live-meter
 * GET route. Returns null when no snapshot exists yet.
 */
export async function readLatestSnapshot(
  projectId: string,
): Promise<{ svi: number; delta: number | null; stage: number } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("svi_snapshots")
    .select("svi_total, delta, stage")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    svi: (data.svi_total as number) ?? 100,
    delta: (data.delta as number | null) ?? null,
    stage: (data.stage as number) ?? 0,
  };
}
