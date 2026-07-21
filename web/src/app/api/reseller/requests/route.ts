// POST /api/reseller/requests — reseller files an admin-approval request
// GET  /api/reseller/requests — reseller lists their own requests
//
// Track A P9.3 admin-approval queue. Backs three flows:
//   1. code_request         (mint a new tier code)
//   2. over_budget_approval (grant credits past monthly_credit_budget)
//   3. collateral_approval  (marketing collateral URL)
//
// scopedReseller() chokepoint + resellerSupabase() typed wrapper. Every
// insert is followed by reseller_audit_log(action='file_request', ...).
//
// See docs/plans/reseller-module-plan.md § C.5 admin approval flows.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateResellerRequestBody } from "@/lib/reseller/requests";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/requests";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

const VALIDATION_STATUS: Record<string, number> = {
  invalid_request_type: 400,
  invalid_payload: 400,
  invalid_tier_pct: 400,
  tier_not_allowed: 403,
  suffix_bad_format: 400,
  target_user_id_required: 400,
  invalid_amount: 400,
  capability_disabled: 403,
  collateral_url_required: 400,
  purpose_required: 400,
  reason_too_long: 400,
};

export async function POST(request: Request) {
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

  const db = resellerSupabase(scope);
  const self = await db.selfReseller();
  if (!self) {
    return NextResponse.json({ ok: false, reason: "reseller_missing" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const validation = validateResellerRequestBody(body, {
    allowed_tiers: (self.allowed_tiers as number[]) ?? [0, 10, 20, 30, 40],
    can_grant_credits: Boolean(self.can_grant_credits),
  });
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, reason: validation.reason },
      { status: VALIDATION_STATUS[validation.reason] ?? 400 },
    );
  }

  const { request_type, payload } = validation.value;

  const { data: inserted, error: insertErr } = await supabase
    .from("reseller_requests")
    .insert({
      reseller_id: scope.reseller_id,
      requested_by: user.id,
      request_type,
      payload,
      status: "pending",
    })
    .select("id, created_at")
    .single();

  if (insertErr || !inserted) {
    if (insertErr?.message?.includes("reseller_requests_pending_code_uniq")) {
      return NextResponse.json(
        { ok: false, reason: "duplicate_pending_code_request" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "insert_failed", error: insertErr?.message ?? "no_row" },
      { status: 500 },
    );
  }

  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id:
        request_type === "over_budget_approval"
          ? ((payload as { target_user_id?: string }).target_user_id ?? null)
          : null,
      action: "file_request",
      fields: [request_type],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { request_id: inserted.id, request_type },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      request: {
        id: inserted.id,
        created_at: inserted.created_at,
        request_type,
        status: "pending",
      },
    },
    { status: 201 },
  );
}

export async function GET() {
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

  const { data, error } = await supabase
    .from("reseller_requests")
    .select(
      "id, request_type, status, payload, decision_at, decision_reason, created_at",
    )
    .eq("reseller_id", scope.reseller_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, requests: data ?? [] });
}
