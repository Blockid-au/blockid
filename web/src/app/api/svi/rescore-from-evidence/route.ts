import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { rescoreAccountFromEvidence } from "@/lib/svi/rescore-from-evidence";

// POST /api/svi/rescore-from-evidence
// Re-computes SVI using the original analysis text + all evidence items.
// Each evidence item adds bonus points to its dimension based on
// confidence_level; connected revenue (Stripe / Xero) is priced by
// magnitude, growth, churn and freshness instead of a flat bonus (S25-A —
// lib/svi/connected-revenue-score.ts). The arithmetic lives in
// lib/svi/rescore-from-evidence.ts so the weekly connector resync cron
// rescored an account exactly the way this button does.
// Scoped by active project_id to prevent cross-startup data leaks.

async function POST_handler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;

  // S17-A — editor+ on the active project; the startup record is keyed
  // under the OWNER's email so a co-founder rescores the same account.
  let scope;
  try {
    scope = await getProjectScope("editor");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;
  const ownerUserId = scope?.ownerUserId ?? user.id;

  // 1. Get SVI account — scoped by project_id
  const accountQuery = supabase
    .from("svi_accounts")
    .select("id, current_svi")
    .eq("email", dataEmail);

  if (projectId) {
    accountQuery.eq("project_id", projectId);
  } else {
    accountQuery.is("project_id", null);
  }

  const { data: account } = await accountQuery.maybeSingle();

  if (!account) {
    return NextResponse.json({ ok: false, reason: "No SVI account for this project" }, { status: 404 });
  }

  const result = await rescoreAccountFromEvidence(supabase, {
    accountId: account.id as string,
    currentSvi: typeof account.current_svi === "number" ? account.current_svi : null,
    dataEmail,
    projectId,
    ownerUserId,
  });

  return NextResponse.json({
    ok: true,
    previousSVI: result.previousSVI,
    newSVI: result.newSVI,
    delta: result.delta,
    evidenceCount: result.evidenceCount,
    evidenceBonusApplied: result.evidenceBonusApplied,
    connectedRevenue: result.connectedRevenue,
    newBadges: result.newBadges,
  });
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/svi/rescore-from-evidence/route.ts", method: "POST" }, POST_handler);
