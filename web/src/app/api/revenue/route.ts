import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/revenue — real-time P&L dashboard
// ---------------------------------------------------------------------------

interface MonthlyRevenue {
  month: string; // YYYY-MM
  revenue: number;
  refunds: number;
  net: number;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();

  // ── 1. Find Stripe customer by email ──────────────────────────────────
  const customers = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });
  const customer = customers.data[0] ?? null;

  // ── 2. Fetch charges (last 12 months) ─────────────────────────────────
  const twelveMonthsAgo = Math.floor(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).getTime() / 1000,
  );

  let totalRevenue = 0;
  let totalRefunds = 0;
  const monthlyMap = new Map<string, { revenue: number; refunds: number }>();

  if (customer) {
    // Paginate through all charges
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: {
        customer: string;
        created: { gte: number };
        limit: number;
        starting_after?: string;
      } = {
        customer: customer.id,
        created: { gte: twelveMonthsAgo },
        limit: 100,
      };
      if (startingAfter) params.starting_after = startingAfter;

      const charges = await stripe.charges.list(params);

      for (const charge of charges.data) {
        const date = new Date(charge.created * 1000);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthlyMap.get(monthKey) ?? { revenue: 0, refunds: 0 };

        if (charge.status === "succeeded") {
          const amountAud = charge.amount / 100; // Stripe amounts are in cents
          entry.revenue += amountAud;
          totalRevenue += amountAud;

          if (charge.refunded || charge.amount_refunded > 0) {
            const refundAud = charge.amount_refunded / 100;
            entry.refunds += refundAud;
            totalRefunds += refundAud;
          }
        }

        monthlyMap.set(monthKey, entry);
      }

      hasMore = charges.has_more;
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1]!.id;
      } else {
        hasMore = false;
      }
    }
  }

  // ── 3. Active subscriptions + MRR ─────────────────────────────────────
  let mrr = 0;
  let activeSubscriptions = 0;

  if (customer) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 100,
    });

    activeSubscriptions = subs.data.length;

    for (const sub of subs.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        if (price.recurring && price.unit_amount) {
          const amount = price.unit_amount / 100;
          if (price.recurring.interval === "month") {
            mrr += amount * (item.quantity ?? 1);
          } else if (price.recurring.interval === "year") {
            mrr += (amount / 12) * (item.quantity ?? 1);
          }
        }
      }
    }
  }

  const arr = mrr * 12;

  // ── 4. Build monthly breakdown (sorted) ───────────────────────────────
  const monthly: MonthlyRevenue[] = [];
  const sortedKeys = Array.from(monthlyMap.keys()).sort();
  for (const key of sortedKeys) {
    const entry = monthlyMap.get(key)!;
    monthly.push({
      month: key,
      revenue: Math.round(entry.revenue * 100) / 100,
      refunds: Math.round(entry.refunds * 100) / 100,
      net: Math.round((entry.revenue - entry.refunds) * 100) / 100,
    });
  }

  // ── 5. COGS: AI analysis costs ────────────────────────────────────────
  const AI_COST_PER_ANALYSIS = 0.05; // A$0.05 per analysis
  let analysisCount = 0;

  if (supabase) {
    const { count } = await supabase
      .from("svi_analyses")
      .select("id", { count: "exact", head: true })
      .eq("email", user.email);

    analysisCount = count ?? 0;
  }

  const aiCosts = Math.round(analysisCount * AI_COST_PER_ANALYSIS * 100) / 100;

  // Infra estimate: base $50/mo + $0.01 per analysis
  const infraCosts =
    Math.round((50 + analysisCount * 0.01) * 100) / 100;

  const totalCogs = Math.round((aiCosts + infraCosts) * 100) / 100;

  // ── 6. Operating expenses ─────────────────────────────────────────────
  let burnRate = 0;

  if (supabase) {
    const { data: latestMetric } = await supabase
      .from("startup_metrics")
      .select("burn_rate_aud")
      .eq("email", user.email)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    burnRate = latestMetric?.burn_rate_aud ?? 0;
  }

  // Monthly opex: use burn rate if available, otherwise estimate from COGS
  const monthlyOpex = burnRate > 0 ? burnRate : totalCogs * 1.5;
  // Annualize: use 12 months of opex for P&L
  const annualOpex = Math.round(monthlyOpex * 12 * 100) / 100;

  // ── 7. P&L calculation ────────────────────────────────────────────────
  const netRevenue = Math.round((totalRevenue - totalRefunds) * 100) / 100;
  const grossMargin = Math.round((netRevenue - totalCogs) * 100) / 100;
  const netIncome = Math.round((grossMargin - annualOpex) * 100) / 100;

  return NextResponse.json({
    ok: true,
    revenue: {
      monthly,
      total: Math.round(totalRevenue * 100) / 100,
      refunds: Math.round(totalRefunds * 100) / 100,
      netRevenue,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      activeSubscriptions,
    },
    costs: {
      ai: aiCosts,
      infra: infraCosts,
      totalCogs,
      analysisCount,
    },
    pnl: {
      revenue: netRevenue,
      cogs: totalCogs,
      grossMargin,
      opex: annualOpex,
      monthlyOpex: Math.round(monthlyOpex * 100) / 100,
      netIncome,
      grossMarginPct:
        netRevenue > 0
          ? Math.round((grossMargin / netRevenue) * 10000) / 100
          : 0,
    },
    metrics: {
      burnRate: Math.round(burnRate * 100) / 100,
    },
  });
}
