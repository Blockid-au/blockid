import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/revenue — real-time P&L dashboard
// Works with Stripe data when available, falls back to manual metrics.
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  const stripe = getStripe();

  // ── 1. Find Stripe customer by email (if Stripe configured) ───────────
  let customer: { id: string } | null = null;
  if (stripe) {
    try {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
      customer = customers.data[0] ?? null;
    } catch {
      // Stripe not reachable — proceed without it
    }
  }

  // ── 2. Fetch charges (last 12 months) ─────────────────────────────────
  const twelveMonthsAgo = Math.floor(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).getTime() / 1000,
  );

  let totalRevenue = 0;
  let totalRefunds = 0;
  const monthlyMap = new Map<string, { revenue: number; refunds: number }>();

  if (stripe && customer) {
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

  // ── 2b. Merge manual revenue entries from revenue_entries table ────────
  const { data: manualEntries } = await supabase
    .from("revenue_entries")
    .select("month, amount, source")
    .eq("email", user.email)
    .order("month", { ascending: true });

  if (manualEntries && manualEntries.length > 0) {
    for (const entry of manualEntries) {
      const monthKey = entry.month as string;
      const amount = Number(entry.amount) || 0;
      const existing = monthlyMap.get(monthKey) ?? { revenue: 0, refunds: 0 };
      existing.revenue += amount;
      totalRevenue += amount;
      monthlyMap.set(monthKey, existing);
    }
  }

  // ── 3. Active subscriptions + MRR ─────────────────────────────────────
  let mrr = 0;
  let activeSubscriptions = 0;

  if (stripe && customer) {
    try {
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
    } catch {
      // Stripe error — proceed without subscription data
    }
  }

  // Fall back to startup_metrics if no Stripe MRR
  if (mrr === 0) {
    const { data: latestMrr } = await supabase
      .from("startup_metrics")
      .select("mrr_aud, arr_aud")
      .eq("email", user.email)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMrr) {
      mrr = latestMrr.mrr_aud ?? 0;
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

  // Compute monthly growth %
  let monthlyGrowthPct = 0;
  if (monthly.length >= 2) {
    const prev = monthly[monthly.length - 2].net;
    const curr = monthly[monthly.length - 1].net;
    if (prev > 0) {
      monthlyGrowthPct = Math.round(((curr - prev) / prev) * 10000) / 100;
    }
  }

  // ── 5. COGS: AI analysis costs ────────────────────────────────────────
  const AI_COST_PER_ANALYSIS = 0.05; // A$0.05 per analysis
  let analysisCount = 0;

  const { count } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email);

  analysisCount = count ?? 0;

  const aiCosts = Math.round(analysisCount * AI_COST_PER_ANALYSIS * 100) / 100;

  // Infra estimate: base $50/mo + $0.01 per analysis
  const infraCosts =
    Math.round((50 + analysisCount * 0.01) * 100) / 100;

  const totalCogs = Math.round((aiCosts + infraCosts) * 100) / 100;

  // ── 6. Operating expenses ─────────────────────────────────────────────
  let burnRate = 0;

  const { data: latestMetric } = await supabase
    .from("startup_metrics")
    .select("burn_rate_aud")
    .eq("email", user.email)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  burnRate = latestMetric?.burn_rate_aud ?? 0;

  // Monthly opex: use burn rate if available, otherwise estimate from COGS
  const monthlyOpex = burnRate > 0 ? burnRate : totalCogs * 1.5;
  // Annualize: use 12 months of opex for P&L
  const annualOpex = Math.round(monthlyOpex * 12 * 100) / 100;

  // Expense breakdown estimates
  const marketingEst = Math.round(monthlyOpex * 0.20 * 12 * 100) / 100;
  const hostingEst = Math.round(infraCosts * 12 * 100) / 100;

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
      monthlyGrowthPct,
      activeSubscriptions,
    },
    costs: {
      ai: aiCosts,
      infra: infraCosts,
      hosting: hostingEst,
      marketing: marketingEst,
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
    hasStripe: !!(stripe && customer),
    manualEntryCount: manualEntries?.length ?? 0,
  });
}

// ---------------------------------------------------------------------------
// POST /api/revenue — Add manual revenue entry + auto-trigger SVI rescore
// Body: { month: "YYYY-MM", amount: number, source?: string }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
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

  let body: { month?: string; amount?: number; source?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Validate month
  const month = body.month ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: "month must be in YYYY-MM format" },
      { status: 400 },
    );
  }

  // Validate amount
  const amount = body.amount;
  if (typeof amount !== "number" || !isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { ok: false, error: "amount must be a non-negative number" },
      { status: 400 },
    );
  }

  const source = body.source ?? "manual";

  // ── 1. Upsert revenue entry ──────────────────────────────────────────
  const { data: entry, error: insertErr } = await supabase
    .from("revenue_entries")
    .upsert(
      {
        email: user.email,
        month,
        amount,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email,month" },
    )
    .select()
    .single();

  if (insertErr) {
    console.error("[revenue] insert error", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to save revenue entry" },
      { status: 500 },
    );
  }

  // ── 2. Also update startup_metrics MRR/ARR for this user ─────────────
  const metricDate = `${month}-01`;
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (account) {
    await supabase
      .from("startup_metrics")
      .upsert(
        {
          account_id: account.id,
          email: user.email,
          metric_date: metricDate,
          mrr_aud: amount,
          arr_aud: amount * 12,
          source: "manual",
        },
        { onConflict: "account_id,metric_date" },
      );
  }

  // ── 3. Auto-trigger SVI rescore (TRE dimension boost) ────────────────
  let sviDelta = 0;
  if (account) {
    try {
      // Add a revenue evidence item to boost the TRE dimension
      await supabase
        .from("svi_evidence")
        .upsert(
          {
            account_id: account.id,
            evidence_type: "stripe",
            confidence_level: "connected_source",
            dimension: "tre",
            label: `Revenue entry: ${month} — $${amount.toLocaleString()} AUD`,
            source_url: null,
            verified: true,
            created_at: new Date().toISOString(),
          },
          { onConflict: "account_id,evidence_type,dimension" },
        );

      // Re-run SVI pipeline with updated evidence
      const { extractSignals, computeSVI } = await import("@/lib/svi-analysis");

      const { data: latestAnalysis } = await supabase
        .from("svi_analyses")
        .select("raw_input")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const rawInput = (latestAnalysis?.raw_input as string) ?? "";

      const { data: evidence } = await supabase
        .from("svi_evidence")
        .select("*")
        .eq("account_id", account.id);

      const signals = extractSignals({ rawText: rawInput }, undefined, evidence ?? []);
      const newAnalysis = computeSVI(signals);

      const { data: currentAccount } = await supabase
        .from("svi_accounts")
        .select("current_svi")
        .eq("id", account.id)
        .maybeSingle();

      const previousSVI = (currentAccount?.current_svi as number) ?? 100;
      const newSVI = Math.min(300, Math.max(30, newAnalysis.totalSVI));
      sviDelta = newSVI - previousSVI;

      if (Math.abs(sviDelta) >= 1) {
        await supabase
          .from("svi_accounts")
          .update({
            current_svi: newSVI,
            last_active_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        if (Math.abs(sviDelta) >= 2) {
          await supabase.from("svi_snapshots").insert({
            account_id: account.id,
            svi_total: newSVI,
            stage: newAnalysis.stage,
            delta: sviDelta,
            snapshot_date: new Date().toISOString().split("T")[0],
          });
        }
      }
    } catch (err) {
      console.error("[revenue] SVI rescore failed (non-fatal)", err);
    }
  }

  return NextResponse.json({
    ok: true,
    entry,
    sviDelta,
    message: sviDelta !== 0
      ? `Revenue saved. SVI updated by ${sviDelta > 0 ? "+" : ""}${sviDelta} points.`
      : "Revenue saved successfully.",
  });
}
