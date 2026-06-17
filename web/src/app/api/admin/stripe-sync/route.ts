// /api/admin/stripe-sync — Pricing reconciliation between platform-config and Stripe.
//
//   GET  → audit only (no side effects)
//   POST → create a fresh Stripe Price for a drifted plan and return the new ID
//
// Admin-only. Used by /dashboard/admin/stripe-sync UI and can be called from
// CI to gate deploys when drift is detected.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createFreshStripePrice, runStripePricingAudit } from "@/lib/stripe-pricing-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const result = await runStripePricingAudit();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  let body: { planId?: string; productName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.planId) {
    return NextResponse.json({ ok: false, error: "planId required" }, { status: 400 });
  }

  const result = await createFreshStripePrice(body.planId, { productName: body.productName });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    newPriceId: result.newPriceId,
    envVarName: result.envVarName,
    instruction: `Set env var ${result.envVarName}=${result.newPriceId} in your .env and redeploy. After that, archive the old Stripe Price.`,
  });
}
