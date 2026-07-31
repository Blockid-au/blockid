/**
 * GET/POST /api/cron/unicorn-nightly-progress — Master Upgrade Plan
 * §17.8 nightly CEO-agent cadence per business.
 *
 * Phase 6 Batch J · sub-J4. For each active business_stage_progress
 * row (partial UNIQUE on business_id where stage_exited_at IS NULL):
 *   1. Fetch the latest verification_level, trust_score, evidence-area
 *      coverage.
 *   2. Call computeStageProgress() from lib/unicorn/framework.
 *   3. If canAdvance, close the current row (stage_exited_at=now) and
 *      insert a fresh row for the next stage.
 *   4. Otherwise UPDATE the current row's on_track, open_blockers,
 *      last_evaluated_at.
 *   5. Best-effort append into stage_ai_runs (never blocks the tick).
 *
 * Backpressure: MAX_PER_INVOCATION = 50 so a large cohort takes
 * multiple nightly ticks rather than blowing the AI budget or the
 * event loop.
 *
 * Auth: Bearer CRON_SECRET OR x-cron-secret header (mirrors the
 * sibling report-order-drain route).
 *
 * Response:
 *   { ok: true, evaluated, advanced, remaining, results[] }
 *   { ok: false, error }
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeStageProgress,
  nextStage,
  type UnicornStageId,
} from "@/lib/unicorn/framework";

export const dynamic = "force-dynamic";

/** Backpressure cap — one nightly tick evaluates ≤50 businesses. */
const MAX_PER_INVOCATION = 50;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const xCron = request.headers.get("x-cron-secret");
  if (xCron === secret) return true;

  return false;
}

interface TickResult {
  businessId: string;
  action: "advanced" | "updated" | "unchanged" | "error";
  fromStage?: UnicornStageId;
  toStage?: UnicornStageId;
  onTrack?: boolean;
  openBlockers?: number;
  error?: string;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  // Fetch up to MAX_PER_INVOCATION active progressions, oldest
  // last_evaluated_at first (ensures every business is picked up over
  // a few ticks even at large cohort sizes).
  const { data: active, error: fetchErr } = await supabase
    .from("business_stage_progress")
    .select(
      "id, business_id, current_stage_id, stage_entered_at, last_evaluated_at",
    )
    .is("stage_exited_at", null)
    .order("last_evaluated_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_INVOCATION);

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );
  }

  const results: TickResult[] = [];
  let advancedCount = 0;

  for (const row of active ?? []) {
    const businessId = row.business_id as string;
    const currentStageId = row.current_stage_id as UnicornStageId;
    const enteredAt = new Date(row.stage_entered_at as string);
    const daysIn = Math.max(
      0,
      Math.floor((Date.now() - enteredAt.getTime()) / (1000 * 60 * 60 * 24)),
    );

    try {
      // Business profile: verification level + trust score + covered areas.
      const { data: profile } = await supabase
        .from("business_profile")
        .select("verification_level, trust_score, capability_scores")
        .eq("business_id", businessId)
        .maybeSingle();

      const verificationLevel =
        (profile?.verification_level as number | null) ?? 0;
      const trustScore = (profile?.trust_score as number | null) ?? 0;

      // Covered areas = capability_scores keys with value ≥ 40 (fresh +
      // above baseline). The 40 threshold matches the S1 exit bar so
      // "covered" tracks "would clear the next gate".
      const capabilityScores =
        (profile?.capability_scores as Record<string, number> | null) ?? {};
      const coveredAreas = Object.entries(capabilityScores)
        .filter(([, v]) => typeof v === "number" && v >= 40)
        .map(([k]) => k);

      // Open critical findings count. Best-effort — the assessment_findings
      // table may not exist in every environment yet.
      let blockerCount = 0;
      try {
        const { count } = await supabase
          .from("assessment_findings")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .in("severity", ["high", "critical"])
          .is("resolved_at", null);
        blockerCount = count ?? 0;
      } catch {
        // table missing → treat as no findings
      }

      const evalResult = computeStageProgress({
        currentStageId,
        verificationLevel,
        trustScore,
        coveredAreas,
        blockerCount,
        daysInStage: daysIn,
      });

      // Update current row's status fields (always, so last_evaluated_at
      // moves forward).
      await supabase
        .from("business_stage_progress")
        .update({
          on_track: evalResult.onTrack,
          open_blockers: evalResult.blockers.length,
          last_evaluated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);

      let action: TickResult["action"] = "updated";
      let toStage: UnicornStageId | undefined;

      if (evalResult.canAdvance) {
        const next = nextStage(currentStageId);
        if (next) {
          const now = new Date().toISOString();
          // Close current row.
          await supabase
            .from("business_stage_progress")
            .update({ stage_exited_at: now })
            .eq("id", row.id as string);
          // Insert new active row for the next stage.
          await supabase.from("business_stage_progress").insert({
            business_id: businessId,
            current_stage_id: next.id,
            stage_entered_at: now,
          });
          action = "advanced";
          toStage = next.id;
          advancedCount += 1;
        }
      }

      // Append-only stage_ai_runs snapshot. Best-effort — failure here
      // never blocks the tick.
      try {
        await supabase.from("stage_ai_runs").insert({
          business_id: businessId,
          stage_id: currentStageId,
          agent: "ceo-nightly",
          verification_level: verificationLevel,
          trust_score: trustScore,
          covered_areas: coveredAreas,
          blocker_count: blockerCount,
          on_track: evalResult.onTrack,
          can_advance: evalResult.canAdvance,
          critical_findings: evalResult.blockers,
          eval_snapshot: {
            daysInStage: daysIn,
            stageWindowMax: evalResult.currentStage.windowDaysMax,
          },
        });
      } catch {
        /* non-fatal */
      }

      results.push({
        businessId,
        action,
        fromStage: currentStageId,
        toStage,
        onTrack: evalResult.onTrack,
        openBlockers: evalResult.blockers.length,
      });
    } catch (err) {
      results.push({
        businessId,
        action: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Backlog probe for the ops dashboard.
  let remaining = 0;
  try {
    const { count } = await supabase
      .from("business_stage_progress")
      .select("id", { count: "exact", head: true })
      .is("stage_exited_at", null);
    remaining = Math.max(0, (count ?? 0) - (active?.length ?? 0));
  } catch {
    /* non-fatal */
  }

  const body: Record<string, unknown> = {
    ok: true,
    evaluated: results.length,
    advanced: advancedCount,
    remaining,
    results,
  };
  if (results.length === 0) body.noop = true;

  return NextResponse.json(body);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
