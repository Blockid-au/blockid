/**
 * GET /api/reports/access?project=<uuid|default>
 *
 * G16-B — what the founder TBR page needs to decide the free-tier cut and
 * to open the confirm-before-charge modal WITHOUT spending anything:
 *
 *   {
 *     ok: true,
 *     projectId: uuid | null,            // resolved scope (business_id for checkout)
 *     included: boolean,                 // plan carries the full report (report.premium)
 *     paidOrderId: uuid | null,          // PAID / GENERATING / READY report_orders row
 *     paidOrderStatus: string | null,
 *     quote: { credits, estimatedWords, model, depth, sections },   // server truth
 *     creditBalance: number,
 *     hasSubscription: boolean,
 *     price: { sku, amount_cents, label } // from the pricing source of truth
 *   }
 *
 * Read-only: no Stripe session, no credit debit, no order row. The client
 * only DISPLAYS these numbers; /api/reports/checkout and /api/reports/redeem
 * re-validate every one of them at submit.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertProjectScope, getProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { getEntitlements } from "@/lib/entitlements";
import { getBalance } from "@/lib/credits";
import { quoteTrustReport } from "@/lib/pricing/report-credit-cost";
import { TRUST_REPORT_AMOUNT_CENTS, TRUST_REPORT_SKU_ID, trustReportPriceLabel } from "@/lib/pricing/trust-report-price";

export const dynamic = "force-dynamic";

/** Orders that mean "this founder already owns the full report for this business". */
export const PAID_ORDER_STATUSES = ["PAID", "GENERATING", "READY"] as const;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("project") ?? "default").trim();
  if (raw !== "default" && !isUuid(raw)) {
    return NextResponse.json({ ok: false, error: "project must be a uuid or 'default'" }, { status: 400 });
  }

  let projectId: string | null = null;
  try {
    const scope = raw === "default" ? await getProjectScope("viewer") : await assertProjectScope(user, raw, "viewer");
    projectId = scope?.projectId && isUuid(scope.projectId) ? scope.projectId : null;
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }

  const plan = user.plan ?? "free";
  const flags = await getEntitlements(plan, user.id).catch(() => [] as string[]);
  const included = flags.includes("report.premium");

  let paidOrderId: string | null = null;
  let paidOrderStatus: string | null = null;
  const supabase = getSupabaseAdmin();
  if (supabase && projectId) {
    const { data } = await supabase
      .from("report_orders")
      .select("id, status")
      .eq("business_id", projectId)
      .eq("user_id", user.id)
      .in("status", [...PAID_ORDER_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && typeof data.id === "string") {
      paidOrderId = data.id;
      paidOrderStatus = typeof data.status === "string" ? data.status : null;
    }
  }

  const creditBalance = await getBalance(user.id).catch(() => 0);

  return NextResponse.json({
    ok: true,
    projectId,
    included,
    paidOrderId,
    paidOrderStatus,
    quote: quoteTrustReport(),
    creditBalance,
    hasSubscription: plan !== "free",
    price: { sku: TRUST_REPORT_SKU_ID, amount_cents: TRUST_REPORT_AMOUNT_CENTS, label: trustReportPriceLabel() },
  });
}
