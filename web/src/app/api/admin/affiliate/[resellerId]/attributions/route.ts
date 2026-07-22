// GET /api/admin/affiliate/[resellerId]/attributions
//
// Admin-only cross-view feed. Returns every ACTIVE attribution for one
// reseller, grouped by source ('provisioned' | 'code' | 'admin_manual'),
// enriched with the target user's plan + last-31-day MRR + the promotion
// code string (if any). Aggregate counts pass through k>=5 anonymity
// (buildPortfolioSummary + applyComplementarySuppression per
// docs/plans/reseller-module-plan.md § U.15.3) so bucket totals below 5
// render as "<5" client-side. Row-level details are NOT k-suppressed —
// this is an admin-scoped endpoint gated by requireAdmin, so leaking
// per-user identity to the same admin who could open /admin/users
// anyway is intentional. The k rule guards aggregate summaries so
// admins do not accidentally screenshot a count-of-1 into a report.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { maskEmail } from "@/lib/reseller/customer-reveal";
import {
  applyComplementarySuppression,
  applyK,
  buildPortfolioSummary,
  K_ANONYMITY_THRESHOLD,
} from "@/lib/reseller/portfolio-aggregates";
import {
  buildImpersonationTrail,
  IMPERSONATION_ACTIONS,
  type AuditEventRow,
  type UserLookupRow,
} from "@/lib/admin/impersonation-trail";

export const dynamic = "force-dynamic";

type SourceKey = "provisioned" | "code" | "admin_manual";

interface AttributionRow {
  id: string;
  reseller_id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
  source: string;
  status: string;
  attributed_at: string;
  promotion_code_id: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resellerId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  const { resellerId } = await params;
  if (!resellerId) {
    return NextResponse.json(
      { ok: false, error: "resellerId required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "DB not configured" },
      { status: 503 },
    );
  }

  // 1) Reseller row (self-check).
  const { data: reseller } = await supabase
    .from("resellers")
    .select("id, code, display_name")
    .eq("id", resellerId)
    .maybeSingle();
  if (!reseller) {
    return NextResponse.json(
      { ok: false, error: "reseller_not_found" },
      { status: 404 },
    );
  }

  // 2) Active attributions for this reseller.
  const { data: attrRows } = await supabase
    .from("reseller_attributions")
    .select(
      "id, reseller_id, subject_type, subject_user_id, subject_project_id, source, status, attributed_at, promotion_code_id",
    )
    .eq("reseller_id", resellerId)
    .eq("status", "active");
  const attrs = (attrRows ?? []) as AttributionRow[];

  // 3) Resolve project attributions → owning user_id so downstream lookups
  //    (plan / MRR / email) hit app_users by id in one shot.
  const projectIds = attrs
    .filter((a) => a.subject_type === "project" && a.subject_project_id)
    .map((a) => a.subject_project_id as string);
  const projectUserMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projRows } = await supabase
      .from("projects")
      .select("id, user_id")
      .in("id", projectIds);
    for (const p of (projRows ?? []) as { id: string; user_id: string }[]) {
      projectUserMap.set(p.id, p.user_id);
    }
  }

  const userIds = new Set<string>();
  for (const a of attrs) {
    if (a.subject_type === "user" && a.subject_user_id) {
      userIds.add(a.subject_user_id);
    } else if (a.subject_type === "project" && a.subject_project_id) {
      const uid = projectUserMap.get(a.subject_project_id);
      if (uid) userIds.add(uid);
    }
  }
  const userIdList = Array.from(userIds);

  // 4) Load app_users + promotion codes + revenue events in parallel.
  const promoIds = Array.from(
    new Set(attrs.map((a) => a.promotion_code_id).filter((v): v is string => !!v)),
  );

  const [usersRes, promoRes, revenueRes, auditRes] = await Promise.all([
    userIdList.length > 0
      ? supabase
          .from("app_users")
          .select("id, email, display_name, plan, created_at, last_login_at, onboarding_completed")
          .in("id", userIdList)
      : Promise.resolve({ data: [] }),
    promoIds.length > 0
      ? supabase
          .from("reseller_promotion_codes")
          .select("id, code, tier_pct")
          .in("id", promoIds)
      : Promise.resolve({ data: [] }),
    userIdList.length > 0
      ? supabase
          .from("revenue_events")
          .select("user_id, ts, kind, plan_id, net_aud_cents")
          .in("user_id", userIdList)
      : Promise.resolve({ data: [] }),
    userIdList.length > 0
      ? supabase
          .from("audit_events")
          .select("id, ts, actor, action, resource_id, detail, user_id")
          .eq("actor", "admin")
          .eq("resource_type", "app_users")
          .in("action", IMPERSONATION_ACTIONS as unknown as string[])
          .in("resource_id", userIdList)
          .order("ts", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  const usersById = new Map<
    string,
    {
      id: string;
      email: string;
      display_name: string | null;
      plan: string | null;
      created_at: string;
      last_login_at: string | null;
      onboarding_completed: boolean | null;
    }
  >();
  for (const u of ((usersRes.data ?? []) as {
    id: string;
    email: string;
    display_name: string | null;
    plan: string | null;
    created_at: string;
    last_login_at: string | null;
    onboarding_completed: boolean | null;
  }[])) {
    usersById.set(u.id, u);
  }

  const promoById = new Map<string, { code: string; tier_pct: number }>();
  for (const p of ((promoRes.data ?? []) as {
    id: string;
    code: string;
    tier_pct: number;
  }[])) {
    promoById.set(p.id, { code: p.code, tier_pct: p.tier_pct });
  }

  // 31-day MRR per user — sum of recurring events (subscribe|renewal).
  const now = Date.now();
  const windowStart = now - 31 * MS_PER_DAY;
  const mrrByUser = new Map<string, number>();
  for (const ev of ((revenueRes.data ?? []) as {
    user_id: string;
    ts: string;
    kind: string;
    plan_id: string | null;
    net_aud_cents: number | null;
  }[])) {
    const ts = new Date(ev.ts).getTime();
    if (!Number.isFinite(ts) || ts < windowStart) continue;
    if (ev.kind !== "subscribe" && ev.kind !== "renewal") continue;
    if (typeof ev.net_aud_cents !== "number") continue;
    mrrByUser.set(ev.user_id, (mrrByUser.get(ev.user_id) ?? 0) + ev.net_aud_cents);
  }

  // 5) Shape rows grouped by source.
  const rows: Record<SourceKey, Array<{
    attribution_id: string;
    user_id: string | null;
    project_id: string | null;
    masked_email: string;
    display_name: string | null;
    joined_at: string | null;
    plan: string | null;
    mrr_aud_cents: number;
    promotion_code: string | null;
    source: SourceKey;
    attributed_at: string;
    status: string;
  }>> = {
    provisioned: [],
    code: [],
    admin_manual: [],
  };

  const perSourceCounts = { provisioned: 0, code: 0, admin_manual: 0 };

  for (const a of attrs) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectUserMap.get(a.subject_project_id) ?? null;
    }
    const u = uid ? usersById.get(uid) ?? null : null;
    const promo = a.promotion_code_id ? promoById.get(a.promotion_code_id) ?? null : null;

    const source: SourceKey =
      a.source === "provisioned" || a.source === "code" || a.source === "admin_manual"
        ? (a.source as SourceKey)
        : "admin_manual";

    perSourceCounts[source] += 1;

    rows[source].push({
      attribution_id: a.id,
      user_id: uid,
      project_id: a.subject_project_id,
      masked_email: u ? maskEmail(u.email) : "—",
      display_name: u?.display_name ?? null,
      joined_at: u?.created_at ?? null,
      plan: u?.plan ?? null,
      mrr_aud_cents: uid ? (mrrByUser.get(uid) ?? 0) : 0,
      promotion_code: promo?.code ?? null,
      source,
      attributed_at: a.attributed_at,
      status: a.status,
    });
  }

  // 6) k>=5 anonymised aggregate summary (client uses these for tab badges).
  const rawBuckets = [
    applyK(perSourceCounts.provisioned, K_ANONYMITY_THRESHOLD),
    applyK(perSourceCounts.code, K_ANONYMITY_THRESHOLD),
    applyK(perSourceCounts.admin_manual, K_ANONYMITY_THRESHOLD),
  ];
  const suppressed = applyComplementarySuppression(rawBuckets);
  const totalRaw =
    perSourceCounts.provisioned +
    perSourceCounts.code +
    perSourceCounts.admin_manual;

  // Portfolio summary (attributed_total / active_last_week / onboarded) —
  // reused directly from the reseller module's k>=5 helper so this admin
  // cross-view applies the same suppression rules the reseller-facing
  // dashboard does.
  const portfolio = buildPortfolioSummary({
    customers: Array.from(usersById.values()).map((u) => ({
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      onboarding_completed: u.onboarding_completed,
    })),
    now: new Date(now),
  });

  // 7) Impersonation trail — admin.* audit events targeted at any user in
  //    this reseller's attribution set (P12.8). Not k-suppressed for the
  //    same reason row-level attribution details aren't: the admin can
  //    already open /admin/users/[id] and read the same audit history.
  const userLookup: Map<string, UserLookupRow> = new Map();
  for (const u of usersById.values()) {
    userLookup.set(u.id, {
      id: u.id,
      email: u.email,
      display_name: u.display_name,
    });
  }
  const impersonation = buildImpersonationTrail({
    events: (auditRes.data ?? []) as AuditEventRow[],
    allowedUserIds: new Set(userIdList),
    users: userLookup,
  });
  const impersonationEventCount = impersonation.reduce(
    (n, g) => n + g.events.length,
    0,
  );

  return NextResponse.json({
    ok: true,
    reseller: {
      id: reseller.id,
      code: reseller.code,
      display_name: reseller.display_name,
    },
    portfolio,
    totals: {
      provisioned: suppressed[0],
      code: suppressed[1],
      admin_manual: suppressed[2],
      total: applyK(totalRaw, K_ANONYMITY_THRESHOLD),
      impersonation: impersonationEventCount,
    },
    rows,
    impersonation,
  });
}
