// GET /api/mentor/roster
//
// Mentor's mentee list with roster columns:
//   - display_name, email (masked unless consent_tier='identified')
//   - engagement score + tier + formula
//   - last check-in ISO week, latest blocker preview
//
// Auth model mirrors /api/reseller/customers/[id]/drawer:
//   1. getCurrentUser
//   2. scopedReseller(user) — requires reseller_admin role
//   3. resellerSupabase(scope) drives every downstream read
//   4. auditLog('view_mentor_roster') before returning

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { maskEmail } from "@/lib/reseller/customer-reveal";
import { computeEngagement } from "@/lib/mentor/engagement-score";
import { summarize } from "@/lib/mentor/notes";
import { currentIsoWeek } from "@/lib/mentor/check-ins";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/roster";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const allowedIds = await scope.allowedCustomerIds();
  const now = new Date();

  if (allowedIds.length === 0) {
    return NextResponse.json({
      ok: true,
      iso_week: currentIsoWeek(now),
      mentees: [],
    });
  }

  // Load mentee profile rows, latest check-in per mentee, latest SVI + latest
  // report timestamp, and consent tier. Any missing table degrades gracefully
  // (empty map) — the roster still renders with zeros rather than a hard 500.
  const [usersRes, checkInsRes, sviRes, attrRes] = await Promise.all([
    supabase
      .from("app_users")
      .select("id, email, display_name, last_login_at")
      .in("id", allowedIds),
    supabase
      .from("mentor_check_ins")
      .select("subject_user_id, iso_week, blockers, created_at")
      .eq("mentor_user_id", user.id)
      .in("subject_user_id", allowedIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("svi_analyses")
      .select("user_id, total_svi, created_at")
      .in("user_id", allowedIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("reseller_attributions")
      .select("subject_user_id, consent_tier")
      .eq("reseller_id", scope.reseller_id)
      .in("subject_user_id", allowedIds),
  ]);

  const users = new Map<string, { id: string; email: string; display_name: string | null; last_login_at: string | null }>();
  for (const u of usersRes.data ?? []) users.set(u.id as string, u as never);

  const latestCheckIn = new Map<string, { iso_week: string; blockers: string; created_at: string }>();
  for (const row of checkInsRes.data ?? []) {
    const key = row.subject_user_id as string;
    if (!latestCheckIn.has(key)) {
      latestCheckIn.set(key, {
        iso_week: row.iso_week as string,
        blockers: (row.blockers as string | null) ?? "",
        created_at: row.created_at as string,
      });
    }
  }

  // 30-day SVI delta per mentee.
  const sviHistory = new Map<string, { ts: number; score: number }[]>();
  for (const row of sviRes.data ?? []) {
    const uid = row.user_id as string;
    const score = row.total_svi as number | null;
    if (typeof score !== "number") continue;
    const ts = new Date(row.created_at as string).getTime();
    const arr = sviHistory.get(uid) ?? [];
    arr.push({ ts, score });
    sviHistory.set(uid, arr);
  }

  const consentTier = new Map<string, string>();
  for (const row of attrRes.data ?? []) {
    if (row.subject_user_id) consentTier.set(row.subject_user_id as string, (row.consent_tier as string) ?? "pseudonymous");
  }

  const nowMs = now.getTime();
  const THIRTY_D = 30 * 24 * 60 * 60 * 1000;

  const mentees = allowedIds
    .filter((id) => consentTier.get(id) !== "revoked")
    .map((id) => {
      const u = users.get(id);
      const ci = latestCheckIn.get(id) ?? null;
      const history = sviHistory.get(id) ?? [];
      const latest = history.length > 0 ? history[history.length - 1] : null;
      const priorish = history.find((p) => nowMs - p.ts >= THIRTY_D);
      const sviDelta = latest && priorish ? latest.score - priorish.score : null;
      const engagement = computeEngagement({
        now,
        last_check_in_at: ci?.created_at ?? null,
        last_login_at: u?.last_login_at ?? null,
        svi_delta_30d: sviDelta,
        last_report_at: latest ? new Date(latest.ts).toISOString() : null,
      });
      const tier = consentTier.get(id) ?? "pseudonymous";
      return {
        subject_user_id: id,
        display_name: u?.display_name ?? "Unknown mentee",
        email: tier === "identified" && u ? u.email : u ? maskEmail(u.email) : null,
        consent_tier: tier,
        engagement,
        latest_check_in_week: ci?.iso_week ?? null,
        latest_blocker_preview: ci ? summarize(ci.blockers, 80) : "",
      };
    });

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      action: "view_mentor_roster",
      fields: ["engagement", "check_in"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { mentee_count: mentees.length },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    iso_week: currentIsoWeek(now),
    mentees,
  });
}
