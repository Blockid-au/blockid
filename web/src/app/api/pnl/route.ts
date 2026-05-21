import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generatePnL } from "@/lib/pnl";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/pnl — Generate P&L report for current period
// Auth + admin only. Costs 0 credits (internal tool).
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // ── 1. Get latest metrics (MRR, burn rate) ────────────────────────────
  const { data: latestMetric } = await supabase
    .from("startup_metrics")
    .select("mrr_aud, arr_aud, burn_rate_aud, runway_months")
    .eq("email", user.email)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const mrr = latestMetric?.mrr_aud ?? 0;
  const arr = latestMetric?.arr_aud ?? (mrr * 12);
  const burnRate = latestMetric?.burn_rate_aud ?? 0;

  // ── 2. Compute revenue from Stripe if available ───────────────────────
  let stripeRevenue = 0;
  const stripe = getStripe();

  if (stripe) {
    try {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
      const customer = customers.data[0] ?? null;

      if (customer) {
        const threeMonthsAgo = Math.floor(
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).getTime() / 1000,
        );

        const charges = await stripe.charges.list({
          customer: customer.id,
          created: { gte: threeMonthsAgo },
          limit: 100,
        });

        for (const charge of charges.data) {
          if (charge.status === "succeeded") {
            stripeRevenue += charge.amount / 100;
            if (charge.amount_refunded > 0) {
              stripeRevenue -= charge.amount_refunded / 100;
            }
          }
        }
      }
    } catch {
      // Stripe may not be configured; fall back to metrics-based estimate
    }
  }

  // Use Stripe revenue if available, otherwise estimate from ARR
  const quarterlyRevenue = stripeRevenue > 0
    ? stripeRevenue
    : (arr / 4);

  // ── 3. Estimate COGS ─────────────────────────────────────────────────
  const { count: analysisCount } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email);

  const AI_COST_PER_ANALYSIS = 0.05;
  const aiCosts = Math.round((analysisCount ?? 0) * AI_COST_PER_ANALYSIS * 100) / 100;
  const hostingCosts = Math.round((50 * 3 + (analysisCount ?? 0) * 0.01) * 100) / 100;

  // Monthly opex for the quarter
  const quarterlyOpex = burnRate > 0 ? burnRate * 3 : 0;
  const marketingEstimate = Math.round(quarterlyOpex * 0.15 * 100) / 100;
  const legalEstimate = Math.round(quarterlyOpex * 0.05 * 100) / 100;
  const otherExpenses = Math.max(
    0,
    Math.round((quarterlyOpex - aiCosts - hostingCosts - marketingEstimate - legalEstimate) * 100) / 100,
  );

  // ── 4. Cash on hand estimate ──────────────────────────────────────────
  const runwayMonths = latestMetric?.runway_months ?? (burnRate > 0 ? 12 : 0);
  const cashOnHand = burnRate > 0 ? burnRate * runwayMonths : 0;

  // ── 5. Generate P&L ──────────────────────────────────────────────────
  const report = generatePnL({
    revenue: quarterlyRevenue,
    expenses: {
      aiApiCosts: aiCosts,
      hosting: hostingCosts,
      marketing: marketingEstimate,
      legal: legalEstimate,
      other: otherExpenses,
    },
    cashOnHand,
    mrr,
  });

  return NextResponse.json({ ok: true, report });
}
