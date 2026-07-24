// GET /api/mentor/[founderId]
//
// Full mentor console payload for a single mentee:
//   - engagement score + components
//   - recent check-ins (last 8 weeks)
//   - mentor notes (all — mentor sees their own private + shared)
//   - masked/unmasked profile according to consent tier
//   - SVI curve + last report timestamp
//
// Consent gating: revoked mentees 404; pseudonymous suppresses email + name.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal, maskEmail } from "@/lib/reseller/customer-reveal";
import { computeEngagement } from "@/lib/mentor/engagement-score";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/[founderId]";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ founderId: string }> },
) {
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

  const { founderId } = await params;
  const allowed = await scope.allowedCustomerIds();
  const decision = decideReveal(founderId, allowed);
  if (!decision.ok) {
    const status = decision.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: decision.reason }, { status });
  }
  const subjectId = decision.customerId;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const [userRes, attrRes, checkInsRes, notesRes, sviRes] = await Promise.all([
    supabase
      .from("app_users")
      .select("id, email, display_name, last_login_at, created_at")
      .eq("id", subjectId)
      .maybeSingle(),
    supabase
      .from("reseller_attributions")
      .select("consent_tier")
      .eq("reseller_id", scope.reseller_id)
      .eq("subject_user_id", subjectId)
      .maybeSingle(),
    supabase
      .from("mentor_check_ins")
      .select("id, iso_week, wins, blockers, next_focus, mood, created_at, updated_at")
      .eq("mentor_user_id", user.id)
      .eq("subject_user_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("mentor_notes")
      .select("id, body, visibility, created_at, updated_at")
      .eq("mentor_user_id", user.id)
      .eq("subject_user_id", subjectId)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("svi_analyses")
      .select("total_svi, created_at")
      .eq("user_id", subjectId)
      .order("created_at", { ascending: true }),
  ]);

  const profile = userRes.data as { id: string; email: string; display_name: string | null; last_login_at: string | null; created_at: string } | null;
  if (!profile) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const consentTier = (attrRes.data?.consent_tier as string | undefined) ?? "pseudonymous";
  if (consentTier === "revoked") {
    return NextResponse.json({ ok: false, reason: "consent_revoked" }, { status: 403 });
  }

  const checkIns = (checkInsRes.data ?? []) as Array<{ id: string; iso_week: string; wins: string; blockers: string; next_focus: string; mood: string | null; created_at: string; updated_at: string }>;
  const notes = (notesRes.data ?? []) as Array<{ id: string; body: string; visibility: string; created_at: string; updated_at: string }>;
  const svi = (sviRes.data ?? []) as Array<{ total_svi: number | null; created_at: string }>;

  const now = new Date();
  const nowMs = now.getTime();
  const THIRTY_D = 30 * 24 * 60 * 60 * 1000;
  const scored = svi.filter((r) => typeof r.total_svi === "number");
  const latest = scored.length > 0 ? scored[scored.length - 1] : null;
  const priorish = scored.find((r) => nowMs - new Date(r.created_at).getTime() >= THIRTY_D) ?? null;
  const sviDelta = latest && priorish ? (latest.total_svi as number) - (priorish.total_svi as number) : null;

  const engagement = computeEngagement({
    now,
    last_check_in_at: checkIns[0]?.created_at ?? null,
    last_login_at: profile.last_login_at,
    svi_delta_30d: sviDelta,
    last_report_at: latest?.created_at ?? null,
  });

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: subjectId,
      action: "view_mentor_console",
      fields: ["profile", "check_ins", "notes", "engagement"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { consent_tier: consentTier },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    profile: {
      subject_user_id: profile.id,
      display_name: consentTier === "identified" ? profile.display_name : (profile.display_name ? "Mentee" : null),
      email: consentTier === "identified" ? profile.email : maskEmail(profile.email),
      last_login_at: profile.last_login_at,
      created_at: profile.created_at,
      consent_tier: consentTier,
    },
    engagement,
    check_ins: checkIns,
    notes,
    svi_curve: scored.map((r) => ({ score: r.total_svi as number, at: r.created_at })),
  });
}
