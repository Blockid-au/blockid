// /admin/revenue-spend — Admin revenue + credit-spend dashboard.
//
// Pulls 12 weeks of payment data from stripe_webhook_events and credit spend
// from credit_transactions. Server component, admin-only, force-dynamic.
//
// T_REVENUE_0001

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdminLayout } from "@/components/admin/admin-layout";

export const metadata: Metadata = {
  title: "Revenue & Spend — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface WeeklyRevenue {
  week: string;
  count: number;
  revenue: number; // AUD dollars
}

interface RecentTransaction {
  id: string;
  created_at: string;
  payload_amount: number; // cents
  payload_currency: string;
  stripe_customer_id: string | null;
}

interface SpendByFeature {
  feature: string;
  credits: number;
  count: number;
}

function aud(dollars: number): string {
  return `A$${dollars.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminRevenueSpendPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/revenue-spend");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/dashboard/svi");

  const supabase = getSupabaseAdmin();

  let weeklyRows: WeeklyRevenue[] = [];
  let recentTx: RecentTransaction[] = [];
  let spendRows: SpendByFeature[] = [];
  let totalRevenue7d = 0;
  let totalCount7d = 0;
  let totalRevenue30d = 0;
  let newUsers7d = 0;

  if (supabase) {
    // Weekly revenue from stripe_webhook_events (last 12 weeks)
    const { data: weekly } = await supabase.rpc("admin_weekly_revenue_12w").catch(() => ({ data: null }));

    // Fallback: manual query via .from() since RPC might not exist yet
    if (!weekly) {
      const { data: rawEvents } = await supabase
        .from("stripe_webhook_events")
        .select("id, created_at, payload, stripe_customer_id")
        .eq("type", "payment_intent.succeeded")
        .gte("created_at", new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      // Group into calendar weeks client-side
      const weekMap = new Map<string, { count: number; revenue: number }>();
      for (const ev of (rawEvents ?? []) as Array<{ id: string; created_at: string; payload: Record<string, unknown>; stripe_customer_id: string | null }>) {
        const d = new Date(ev.created_at);
        // ISO week start (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        const key = monday.toISOString().slice(0, 10);
        const amt = Number((ev.payload as { amount?: unknown })?.amount ?? 0) / 100;
        const existing = weekMap.get(key) ?? { count: 0, revenue: 0 };
        weekMap.set(key, { count: existing.count + 1, revenue: existing.revenue + amt });
      }
      weeklyRows = Array.from(weekMap.entries())
        .map(([week, v]) => ({ week, ...v }))
        .sort((a, b) => b.week.localeCompare(a.week));
    } else {
      weeklyRows = (weekly as Array<{ week: string; count: number; revenue: number }>).map((r) => ({
        week: r.week,
        count: Number(r.count),
        revenue: Number(r.revenue),
      }));
    }

    // Recent transactions (last 20)
    const { data: recentRaw } = await supabase
      .from("stripe_webhook_events")
      .select("id, created_at, payload, stripe_customer_id")
      .eq("type", "payment_intent.succeeded")
      .order("created_at", { ascending: false })
      .limit(20);

    recentTx = ((recentRaw ?? []) as Array<{
      id: string;
      created_at: string;
      payload: Record<string, unknown>;
      stripe_customer_id: string | null;
    }>).map((ev) => ({
      id: ev.id,
      created_at: ev.created_at,
      payload_amount: Number((ev.payload as { amount?: unknown })?.amount ?? 0),
      payload_currency: String((ev.payload as { currency?: unknown })?.currency ?? "aud").toUpperCase(),
      stripe_customer_id: ev.stripe_customer_id,
    }));

    // 7-day and 30-day totals
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tx7d } = await supabase
      .from("stripe_webhook_events")
      .select("payload")
      .eq("type", "payment_intent.succeeded")
      .gte("created_at", since7d);

    const { data: tx30d } = await supabase
      .from("stripe_webhook_events")
      .select("payload")
      .eq("type", "payment_intent.succeeded")
      .gte("created_at", since30d);

    totalRevenue7d = ((tx7d ?? []) as Array<{ payload: Record<string, unknown> }>)
      .reduce((s, r) => s + Number((r.payload as { amount?: unknown })?.amount ?? 0) / 100, 0);
    totalCount7d = (tx7d ?? []).length;

    totalRevenue30d = ((tx30d ?? []) as Array<{ payload: Record<string, unknown> }>)
      .reduce((s, r) => s + Number((r.payload as { amount?: unknown })?.amount ?? 0) / 100, 0);

    // Credit spend by feature (last 30 days)
    const { data: spendRaw } = await supabase
      .from("credit_transactions")
      .select("amount, reason")
      .lt("amount", 0)
      .gte("created_at", since30d);

    const spendMap = new Map<string, { credits: number; count: number }>();
    for (const row of (spendRaw ?? []) as Array<{ amount: number; reason: string }>) {
      const key = row.reason || "unknown";
      const acc = spendMap.get(key) ?? { credits: 0, count: 0 };
      acc.credits += Math.abs(Number(row.amount) || 0);
      acc.count += 1;
      spendMap.set(key, acc);
    }
    spendRows = Array.from(spendMap.entries())
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.credits - a.credits);

    // New users last 7 days
    const { count } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d);
    newUsers7d = count ?? 0;
  }

  // Estimated MRR: use last 30 days * (12/12) — simple approach
  const mrrEstimate = totalRevenue30d;

  return (
    <AdminLayout user={{ email: user.email, displayName: user.displayName }}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Revenue &amp; Spend</h1>
          <p className="text-sm text-ink-600 mt-1">
            Stripe payments, credit spend, and growth metrics. Refreshes on each page load.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Revenue (7d)",
              value: aud(totalRevenue7d),
              sub: `${totalCount7d} payments`,
              color: "text-emerald-600",
            },
            {
              label: "Revenue (30d)",
              value: aud(totalRevenue30d),
              sub: "last 30 days",
              color: "text-brand-600",
            },
            {
              label: "MRR estimate",
              value: aud(mrrEstimate),
              sub: "30-day rolling",
              color: "text-purple-600",
            },
            {
              label: "New users (7d)",
              value: newUsers7d.toString(),
              sub: "signups",
              color: "text-teal-600",
            },
          ].map(({ label, value, sub, color }) => (
            <div
              key={label}
              className="bg-white border border-surface-200 rounded-xl p-5 shadow-sm"
            >
              <p className="text-xs text-ink-500 font-medium uppercase tracking-wide mb-1">
                {label}
              </p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-ink-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Weekly Revenue Table */}
        <div className="bg-white border border-surface-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h2 className="text-base font-semibold text-ink-800">
              Weekly Revenue (last 12 weeks)
            </h2>
          </div>
          {weeklyRows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-ink-400 italic">
              No payment data found in stripe_webhook_events.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-xs text-ink-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-6 py-3">Week starting</th>
                    <th className="text-right px-6 py-3">Payments</th>
                    <th className="text-right px-6 py-3">Revenue (AUD)</th>
                    <th className="text-right px-6 py-3">Avg ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {weeklyRows.map((row) => (
                    <tr key={row.week} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-ink-700">
                        {fmtDate(row.week)}
                      </td>
                      <td className="px-6 py-3 text-right text-ink-600">{row.count}</td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-700">
                        {aud(row.revenue)}
                      </td>
                      <td className="px-6 py-3 text-right text-ink-400">
                        {row.count > 0 ? aud(row.revenue / row.count) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Credit Spend by Feature */}
        <div className="bg-white border border-surface-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h2 className="text-base font-semibold text-ink-800">
              Credit Spend by Feature
              <span className="ml-2 text-xs font-normal text-ink-400">(last 30 days)</span>
            </h2>
          </div>
          {spendRows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-ink-400 italic">
              No credit spend recorded in last 30 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-xs text-ink-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-6 py-3">Feature / reason</th>
                    <th className="text-right px-6 py-3">Credits used</th>
                    <th className="text-right px-6 py-3">Transactions</th>
                    <th className="text-right px-6 py-3">Avg per tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {spendRows.map((row) => (
                    <tr key={row.feature} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-ink-700 max-w-xs truncate">
                        {row.feature}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-amber-700">
                        {row.credits.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right text-ink-600">{row.count}</td>
                      <td className="px-6 py-3 text-right text-ink-400">
                        {(row.credits / row.count).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white border border-surface-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100">
            <h2 className="text-base font-semibold text-ink-800">
              Recent Transactions
              <span className="ml-2 text-xs font-normal text-ink-400">(last 20)</span>
            </h2>
          </div>
          {recentTx.length === 0 ? (
            <p className="px-6 py-8 text-sm text-ink-400 italic">
              No transactions found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-xs text-ink-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Event ID</th>
                    <th className="text-left px-6 py-3">Customer</th>
                    <th className="text-right px-6 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {recentTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 text-ink-600 whitespace-nowrap">
                        {fmtDate(tx.created_at)}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-400 max-w-xs truncate">
                        {tx.id}
                      </td>
                      <td className="px-6 py-3 text-ink-500 font-mono text-xs max-w-xs truncate">
                        {tx.stripe_customer_id ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {aud(tx.payload_amount / 100)}{" "}
                        <span className="text-xs font-normal text-ink-400">
                          {tx.payload_currency}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cron trigger hint */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl px-6 py-4 text-sm text-ink-500">
          <span className="font-medium text-ink-700">Weekly email digest:</span>{" "}
          <code className="text-xs bg-surface-200 rounded px-1.5 py-0.5 font-mono">
            GET /api/cron/weekly-revenue-digest
          </code>{" "}
          — Authorization: Bearer CRON_SECRET. Sends summary to admin@blockid.au every Monday.
        </div>
      </div>
    </AdminLayout>
  );
}
