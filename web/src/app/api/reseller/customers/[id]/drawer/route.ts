// GET /api/reseller/customers/[id]/drawer
//
// Per docs/plans/reseller-module-plan.md § U.7 — three-tab drawer:
// Overview + Progression + Reports. Operational-only fields; no workspace
// content ever crosses the reseller boundary.
//
// Auth/scope model mirrors reveal-email/route.ts (P4.1):
//   1. scopedReseller(user) — chokepoint before any DB read
//   2. decideAccess() — id must be a uuid in the session's allowedCustomerIds
//   3. write a reseller_audit_log row (action='view_customer_drawer') BEFORE
//      returning the payload so the read is durable-logged even if the caller
//      drops the response
//   4. return the assembled Overview / Progression / Reports view-model

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal, maskEmail } from "@/lib/reseller/customer-reveal";
import {
  buildOverviewSummary,
  buildProgressionTimeline,
  buildReportsList,
  buildSviCurve,
  type AppUserBasics,
  type CreditTxRow,
  type RevenueEventRow,
  type SviAnalysisRow,
} from "@/lib/reseller/customer-drawer";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/customers/[id]/drawer";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function GET(
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

  const customerId = decision.customerId;

  const { data: userRow, error: userErr } = await supabase
    .from("app_users")
    .select("id, email, display_name, created_at, last_login_at, onboarding_completed, onboarding_completed_at")
    .eq("id", customerId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ ok: false, reason: "lookup_failed", error: userErr.message }, { status: 500 });
  }
  if (!userRow) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const appUser = userRow as AppUserBasics;

  const [sviRes, revenueRes, creditTxRes, creditBalRes] = await Promise.all([
    supabase
      .from("svi_analyses")
      .select("id, total_svi, created_at, file_name, input_type")
      .eq("email", appUser.email)
      .order("created_at", { ascending: true }),
    supabase
      .from("revenue_events")
      .select("ts, kind, plan_id, net_aud_cents")
      .eq("user_id", customerId)
      .order("ts", { ascending: true }),
    supabase
      .from("credit_transactions")
      .select("amount, reason, created_at")
      .eq("user_id", customerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("credit_balances")
      .select("balance")
      .eq("user_id", customerId)
      .maybeSingle(),
  ]);

  const svi = (sviRes.data ?? []) as SviAnalysisRow[];
  const revenue = (revenueRes.data ?? []) as RevenueEventRow[];
  const credits = (creditTxRes.data ?? []) as CreditTxRow[];
  const creditsBalance = (creditBalRes.data?.balance as number | undefined) ?? 0;

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: customerId,
      action: "view_customer_drawer",
      fields: ["overview", "progression", "reports"],
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

  const overview = buildOverviewSummary({
    user: appUser,
    masked_email: maskEmail(appUser.email),
    credits_balance: creditsBalance,
    revenue,
    now: new Date(),
  });
  const progression = buildProgressionTimeline({ user: appUser, svi, revenue, credits });
  const sviCurve = buildSviCurve(svi);
  const reports = buildReportsList(svi);

  return NextResponse.json({
    ok: true,
    overview,
    progression,
    svi_curve: sviCurve,
    reports,
  });
}
