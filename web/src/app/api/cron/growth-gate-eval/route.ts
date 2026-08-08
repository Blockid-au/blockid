/**
 * POST /api/cron/growth-gate-eval — G8-P2 nightly growth phase gate evaluator.
 *
 * For each startup_phase_progress row (up to MAX_PER_INVOCATION=50, ordered by
 * gate_evaluated_at ASC NULLS FIRST so stale rows are always picked first):
 *   1. Fetch evaluation_criteria rows for the account/project.
 *   2. Fetch the latest SVI dimension scores from svi_analyses.
 *   3. Call computePhaseGate() + topBlockers() from lib/growth/phase-gate.
 *   4. Write unlocked_features, gate_evaluated_at, blockers back.
 *
 * Auth: Bearer CRON_SECRET OR x-cron-secret header (mirrors unicorn-nightly-progress).
 * Response: { ok: true, evaluated: N, skipped: N }
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computePhaseGate,
  topBlockers,
  type PhaseGateInput,
  type SviDimension,
} from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Backpressure cap — one nightly tick evaluates at most 50 phase rows. */
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

/**
 * Extract SVI dimension scores from an analysis_json blob.
 * The subs array has elements { key: SviDimension, value: number }.
 */
function extractDimensions(
  analysisJson: unknown,
): Partial<Record<SviDimension, number>> {
  const VALID_DIMS = new Set<string>([
    "ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco",
  ]);
  try {
    const parsed = analysisJson as { subs?: Array<{ key: string; value: unknown }> };
    if (!parsed?.subs || !Array.isArray(parsed.subs)) return {};
    const out: Partial<Record<SviDimension, number>> = {};
    for (const sub of parsed.subs) {
      if (
        sub?.key &&
        VALID_DIMS.has(sub.key) &&
        typeof sub.value === "number"
      ) {
        out[sub.key as SviDimension] = sub.value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Derive the list of feature slugs unlocked at `phaseId` (and all earlier
 * phases).  The unlock model is additive: clearing a phase unlocks its own
 * slug, and founders keep everything from earlier phases.
 */
function unlockedFeaturesFor(phaseId: string): string[] {
  const idx = GROWTH_PHASE_IDS.indexOf(phaseId as (typeof GROWTH_PHASE_IDS)[number]);
  if (idx < 0) return [];
  // Each phase unlocks a feature slug named after the phase itself.
  // Callers consuming this array should treat it as a superset of what the
  // founder has access to — product gates check `unlocked_features.includes(slug)`.
  return GROWTH_PHASE_IDS.slice(0, idx + 1) as unknown as string[];
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

  // Fetch the stalest rows first so the whole cohort stays current across ticks.
  const { data: rows, error: fetchErr } = await supabase
    .from("startup_phase_progress")
    .select("id, account_id, project_id, phase_id, gate_evaluated_at")
    .order("gate_evaluated_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_INVOCATION);

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 500 },
    );
  }

  let evaluated = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const accountId = row.account_id as string;
    const projectId = row.project_id as string | null;
    const phaseId = row.phase_id as string;

    try {
      // 1. Fetch evaluation criteria for this account (+ project if present).
      let criteriaQuery = supabase
        .from("evaluation_criteria")
        .select("criterion_key, quality_level")
        .eq("account_id", accountId);
      if (projectId) {
        criteriaQuery = criteriaQuery.eq("project_id", projectId);
      }
      const { data: criteriaRows } = await criteriaQuery;

      // 2. Latest SVI analysis dimensions for this account's project.
      let dimensions: Partial<Record<SviDimension, number>> = {};
      if (projectId) {
        const { data: sviRow } = await supabase
          .from("svi_analyses")
          .select("analysis_json")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sviRow?.analysis_json) {
          dimensions = extractDimensions(sviRow.analysis_json);
        }
      }

      // 3. Evaluate the gate.
      const input: PhaseGateInput = {
        currentPhase: phaseId,
        criteria: (criteriaRows ?? []).map((c) => ({
          criterion_key: c.criterion_key as string,
          quality_level: c.quality_level as string | null,
        })),
        dimensions,
        // completedDeliverables omitted — deliverable tracking not yet wired.
      };

      const result = computePhaseGate(input);
      const blockerList = topBlockers(result, 5);

      // 4. Write back.
      await supabase
        .from("startup_phase_progress")
        .update({
          unlocked_features: unlockedFeaturesFor(result.currentPhase),
          gate_evaluated_at: new Date().toISOString(),
          blockers: blockerList,
        })
        .eq("id", row.id as string);

      evaluated += 1;
    } catch {
      skipped += 1;
    }
  }

  const body: Record<string, unknown> = { ok: true, evaluated, skipped };
  if (evaluated === 0 && skipped === 0) body.noop = true;

  return NextResponse.json(body);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
