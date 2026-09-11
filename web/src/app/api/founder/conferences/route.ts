/**
 * GET /api/founder/conferences
 *
 * Returns a curated shortlist of upcoming conferences for the authenticated
 * founder's active startup. Reads `projects.industry` (as `sector`) and
 * `projects.growth_phase_current` (mapped to a stage index) so the founder
 * doesn't have to hand-tune filters. Sources: `content/conferences.json`
 * merged with `au_programs` rows of `program_type=event` (T0246).
 *
 * Query params (all optional, override the DB-derived defaults):
 *   ?sector=saas
 *   ?stage=2                 (0..4)
 *   ?region=AU|APAC|GLOBAL   (defaults to AU)
 *   ?budget=free|paid|invite
 *   ?limit=5
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { type ConferenceCost } from "@/lib/conferences";
import { recommendConferencesWithProgramEvents } from "@/lib/funding/events";

export const dynamic = "force-dynamic";

// Ordering matches the platform's growth-phase progression (mig 0049 default
// = "vision"). Any unknown phase falls through to `null` and the recommender
// treats it as "no stage filter".
const PHASE_TO_STAGE: Record<string, number> = {
  vision: 0,
  customer_dev: 1,
  revenue_model: 1,
  pitch: 2,
  mentor_review: 2,
  legal_equity: 2,
  go_to_market: 2,
  product_dev: 3,
  investor_review: 3,
  team: 3,
  growth: 3,
  funding: 4,
  scale: 4,
};

function phaseToStage(phase: string | null | undefined): number | null {
  if (!phase) return null;
  const key = phase.toLowerCase();
  return key in PHASE_TO_STAGE ? PHASE_TO_STAGE[key] : null;
}

function parseBudget(raw: string | null): ConferenceCost | null {
  if (!raw) return null;
  return raw === "free" || raw === "paid" || raw === "invite" ? raw : null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const overrideSector = url.searchParams.get("sector");
  const overrideStageRaw = url.searchParams.get("stage");
  const overrideRegion = url.searchParams.get("region");
  const overrideBudget = parseBudget(url.searchParams.get("budget"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 25) : 5;

  let sector = overrideSector;
  let stage: number | null =
    overrideStageRaw !== null && overrideStageRaw !== ""
      ? Number.parseInt(overrideStageRaw, 10)
      : null;

  const sb = getSupabaseAdmin();
  // S18-A — read-only recommender seeded from the project row: viewer+.
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;

  if (sb && projectId && (!sector || stage === null || Number.isNaN(stage))) {
    const { data } = await sb
      .from("projects")
      .select("industry, growth_phase_current")
      .eq("id", projectId)
      .maybeSingle();
    const row = (data ?? null) as { industry: string | null; growth_phase_current: string | null } | null;
    if (row) {
      if (!sector && row.industry) sector = row.industry;
      if (stage === null || Number.isNaN(stage)) stage = phaseToStage(row.growth_phase_current);
    }
  }

  const region = overrideRegion ?? "AU";

  try {
    // T0246: seed list + live `au_programs` event rows (Spark, West Tech
    // Fest, …) through the same recommender.
    const conferences = await recommendConferencesWithProgramEvents({
      sector,
      stage: stage === null || Number.isNaN(stage) ? null : stage,
      region,
      budget: overrideBudget,
      limit,
    });
    return NextResponse.json({
      ok: true,
      filters: { sector, stage, region, budget: overrideBudget, limit },
      conferences,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "recommend_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
