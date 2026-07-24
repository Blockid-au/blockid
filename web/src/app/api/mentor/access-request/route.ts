// POST /api/mentor/access-request
//
// Mentor requests founder consent to reveal identified profile fields. Writes a
// mentor_access_grants row with status='pending'; the founder later approves
// via POST /api/mentor/access-grant/[grantId]. Body:
//   { subject_user_id, requested_tier: 'identified' | 'pseudonymous', reason? }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/access-request";
const VALID_TIERS = new Set(["identified", "pseudonymous"]);

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const body = (await request.json().catch(() => null)) as
    | { subject_user_id?: unknown; requested_tier?: unknown; reason?: unknown }
    | null;
  if (!body) return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });

  const allowed = await scope.allowedCustomerIds();
  const target = decideReveal(body.subject_user_id, allowed);
  if (!target.ok) {
    const status = target.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: target.reason }, { status });
  }

  const tier = typeof body.requested_tier === "string" ? body.requested_tier : "identified";
  if (!VALID_TIERS.has(tier)) {
    return NextResponse.json({ ok: false, reason: "invalid_tier" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const now = new Date().toISOString();

  const { data: inserted, error } = await supabase
    .from("mentor_access_grants")
    .insert({
      mentor_user_id: user.id,
      subject_user_id: target.customerId,
      reseller_id: scope.reseller_id,
      requested_tier: tier,
      status: "pending",
      reason,
      requested_at: now,
    })
    .select("id, status, requested_tier, requested_at")
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { ok: false, reason: "insert_failed", error: error?.message ?? "no_row" },
      { status: 500 },
    );
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: target.customerId,
      action: "mentor_access_request",
      fields: ["requested_tier"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { grant_id: inserted.id, requested_tier: tier },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, grant: inserted });
}
