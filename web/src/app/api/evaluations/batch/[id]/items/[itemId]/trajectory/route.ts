// GET /api/evaluations/batch/[id]/items/[itemId]/trajectory — the Day 0 /
// 60 / 180 trajectory of one cohort item for the Compare drawer (G22-A;
// docs/plans/g22-upgrade-hardening-2026-09-21.md § 2 A.5).
//
//   → 200 { ok, item_id, project_id, consent_tier, values_withheld, trajectory }
//
//   Any seat on the batch (assertBatchRole "viewer"). The data is
//   lib/svi/trajectory-load loadTrajectory (snapshots · evidence records ·
//   confirmed outcomes — every read fail-soft). Outcome VALUES are withheld
//   (kinds stay as markers) when the item's evaluation sits below the
//   `reports_shared` consent tier — the same rule the dossier's outcomes
//   block and the ledger list apply (review P1, 2026-09-21); a cohort seat
//   never sees wider than the evaluation's own tier.
//
//   401 anonymous · 404 non-member / unknown batch / item not in batch ·
//   503 no DB. Read-only: not wrapped by apiRoute (mutation methods only).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { findBatchItemIds } from "@/lib/evaluations/cohort-rows-loader";
import { MENTOR_ACCESS_TIERS, TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import { loadTrajectory } from "@/lib/svi/trajectory-load";
import { PRIVATE_JSON_HEADERS, isUuid } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

/** Pure: does this consent tier withhold outcome values from an evaluator-side viewer? */
export function withholdsOutcomeValues(tier: MentorAccessTier): boolean {
  return TIER_RANK[tier] < TIER_RANK.reports_shared;
}

function tierOf(v: unknown): MentorAccessTier {
  return typeof v === "string" && (MENTOR_ACCESS_TIERS as readonly string[]).includes(v) ? (v as MentorAccessTier) : "attributed_only";
}

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id, itemId: rawItem } = await params;
  const itemId = Number(rawItem);
  if (!isUuid(id) || !Number.isInteger(itemId) || itemId <= 0) return json({ ok: false, error: "not_found" }, 404);

  const access = await assertBatchRole(id, user.id, "viewer");
  if (!access.ok) {
    if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
    return json({ ok: false, error: "not_found" }, 404);
  }
  // G22 review P2: read-route throttle (the drawer fetches one per selected row).
  const limited = enforceRateLimit("batch-trajectory", user.id, request, 120, 60 * 1000);
  if (limited) return limited;
  const item = await findBatchItemIds(access.batch, itemId);
  if (!item) return json({ ok: false, error: "not_found" }, 404);

  const sb = getSupabaseAdmin();
  if (!sb) return json({ ok: false, error: "unavailable" }, 503);

  // The item's evaluation decides the tier; the project row the verification level (both fail-soft to the narrowest reading).
  const [evaluation, project] = await Promise.all([
    sb.from("evaluations").select("consent_tier").eq("id", item.evaluationId).maybeSingle(),
    sb.from("projects").select("verification_level").eq("id", item.projectId).maybeSingle(),
  ]);
  const tier = tierOf((evaluation.data as { consent_tier?: unknown } | null)?.consent_tier);
  const rawLevel = (project.data as { verification_level?: unknown } | null)?.verification_level;
  const level = Number(rawLevel);
  const verificationLevel = typeof rawLevel === "string" && /^L\d/i.test(rawLevel) ? rawLevel.toUpperCase() : Number.isInteger(level) && level >= 0 ? `L${level}` : null;
  const withholdOutcomeValues = withholdsOutcomeValues(tier);

  const trajectory = await loadTrajectory(sb, item.projectId, { verificationLevel, withholdOutcomeValues });
  return json({ ok: true, item_id: item.id, project_id: item.projectId, consent_tier: tier, values_withheld: withholdOutcomeValues, trajectory });
}
