// POST /api/reseller/customers/[id]/reveal-email
//
// Per docs/plans/reseller-module-plan.md § C.1.2 + § H.10 resolution:
// list view masks contact email; a "Show" click reveals the full email and
// writes a reseller_audit_log row (subject_user_id, action='reveal_email',
// fields=['email']). D3-CISO-01 chokepoint: scopedReseller(user) first,
// then decideReveal against allowedCustomerIds — never queries app_users
// with a raw admin client outside the scope.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/customers/[id]/reveal-email";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const allowed = await scope.allowedCustomerIds();
  const decision = decideReveal(id, allowed);
  if (!decision.ok) {
    const status = decision.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: decision.reason }, { status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: userRow, error } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", decision.customerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "lookup_failed", error: error.message },
      { status: 500 },
    );
  }
  if (!userRow) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: decision.customerId,
      action: "reveal_email",
      fields: ["email"],
      route: ROUTE,
      ip,
      user_agent: ua,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, email: userRow.email });
}
