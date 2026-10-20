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
 *     paidOrderId: uuid | null,          // the order that unlocks the FULL report (see below)
 *     paidOrderStatus: string | null,
 *     paidTier: "full" | "verified" | null,
 *     snapshotOrderId: uuid | null,      // G35: a Snapshot order (served on its own order page)
 *     quote: { credits, estimatedWords, model, depth, sections },   // server truth
 *     creditBalance: number,
 *     hasSubscription: boolean,
 *     price: { sku, amount_cents, label }, // legacy A$3 SKU (flag off)
 *     payg: { enabled: false } | PaygOfferEnabled   // G35 Pricing v5 offer
 *   }
 *
 * G35 Pricing v5 (P3): the paid-order rule is the SAME as the server-side
 * tier read (`lib/report-v2/tier-access.ts`): only an order whose SKU buys
 * Full or Verified (legacy A$3 / credits SKUs = Full) unlocks the project
 * page. A Snapshot order never does — its buyer would otherwise land on a
 * page of empty chapters — it is returned as `snapshotOrderId` and the
 * offer carries the Snapshot → Full upgrade. A REFUNDED order whose report
 * was delivered stays readable (gap G5).
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
import { readPaygConfig } from "@/lib/pricing/payg-flag";
import { buildPaygOffer, type PaygOffer } from "@/lib/pricing/payg-offer";
import { countOpenVerifiedOrders, listBuyerOrders, type BuyerOrderRow } from "@/lib/pricing/payg-orders";
import { tierForOrderSku } from "@/lib/report-v2/order-tier";

export const dynamic = "force-dynamic";

/** Orders that mean "this founder owns the report for this business" (= tier-access ENTITLING_ORDER_STATUSES). */
export const PAID_ORDER_STATUSES = ["PAID", "GENERATING", "IN_REVIEW", "READY", "SHARED"] as const;

/** Owning order, or a refund AFTER delivery (report stays readable). */
function owns(row: BuyerOrderRow): boolean {
  if ((PAID_ORDER_STATUSES as readonly string[]).includes(row.status)) return true;
  return row.status === "REFUNDED" && typeof row.report_id === "string" && row.report_id.length > 0;
}

export interface FounderOrderPick {
  paidOrderId: string | null;
  paidOrderStatus: string | null;
  paidTier: "full" | "verified" | null;
  snapshotOrderId: string | null;
}

/** Pure: which of the buyer's orders unlocks the page (Full / Verified) and which is a Snapshot. Newest first in → newest wins. */
export function pickFounderOrders(rows: readonly BuyerOrderRow[]): FounderOrderPick {
  let paid: BuyerOrderRow | null = null;
  let paidTier: "full" | "verified" | null = null;
  let snapshot: BuyerOrderRow | null = null;
  for (const row of rows) {
    if (!owns(row)) continue;
    const tier = tierForOrderSku(row.product_sku);
    if ((tier === "full" || tier === "verified") && !paid) {
      paid = row;
      paidTier = tier;
    } else if (tier === "snapshot" && !snapshot) {
      snapshot = row;
    }
  }
  return {
    paidOrderId: paid?.id ?? null,
    paidOrderStatus: paid?.status ?? null,
    paidTier,
    snapshotOrderId: snapshot?.id ?? null,
  };
}

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

  const supabase = getSupabaseAdmin();
  const orders: BuyerOrderRow[] = supabase && projectId ? ((await listBuyerOrders(supabase, user.id, projectId)) ?? []) : [];
  const pick = pickFounderOrders(orders);

  const creditBalance = await getBalance(user.id).catch(() => 0);

  // G35 Pricing v5 offer — `{ enabled: false }` while the flag is off, so the
  // page renders exactly today's A$3 paywall.
  const paygConfig = await readPaygConfig();
  let payg: PaygOffer = { enabled: false };
  if (paygConfig.payg_enabled) {
    const openVerified = supabase ? await countOpenVerifiedOrders(supabase) : null;
    // An unreadable count hides Verified (fails closed, like the checkout).
    payg = buildPaygOffer({ config: paygConfig, orders, openVerifiedCount: openVerified ?? Number.POSITIVE_INFINITY });
  }

  return NextResponse.json({
    ok: true,
    projectId,
    included,
    ...pick,
    quote: quoteTrustReport(),
    creditBalance,
    hasSubscription: plan !== "free",
    price: { sku: TRUST_REPORT_SKU_ID, amount_cents: TRUST_REPORT_AMOUNT_CENTS, label: trustReportPriceLabel() },
    payg,
  });
}
