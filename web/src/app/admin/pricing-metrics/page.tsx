// /admin/pricing-metrics — CFO tile (T-0422).
//
// MRR, ARR (net of GST), trial-conversion, gate-hit heatmap teasers,
// and simple runway proxy based on the latest COGS estimate.
// All figures come from revenue_events + subscription_trial_state +
// analytics_events; nothing is invented client-side.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRealMrrAud, type RealMrr } from "@/lib/metrics/mrr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pricing Metrics — BlockID Admin",
  robots: { index: false, follow: false },
};

interface Metrics {
  revenueLast30dAud: number;
  gstAccrualAud: number;
  activeSubs: number;
  trialing: number;
  trialConversion7d: number;
  churn30d: number;
}

function centsToAud(c: number): number {
  return Math.round((c / 100) * 100) / 100;
}

async function loadMetrics(): Promise<Metrics> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      revenueLast30dAud: 0, gstAccrualAud: 0,
      activeSubs: 0, trialing: 0,
      trialConversion7d: 0, churn30d: 0,
    };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: mrrRow }, subs, trials, churn, revLast30] = await Promise.all([
    supabase
      .from("revenue_events")
      .select("net_aud_cents, gst_aud_cents, kind, ts")
      .in("kind", ["subscribe", "renewal", "upgrade"])
      .gte("ts", thirtyDaysAgo),
    supabase
      .from("subscription_trial_state")
      .select("status", { count: "exact", head: true })
      .in("status", ["active"]),
    supabase
      .from("subscription_trial_state")
      .select("status, trial_start, trial_end", { count: "exact", head: false })
      .in("status", ["trialing", "trial_ended_no_payment", "active"]),
    supabase
      .from("churn_events")
      .select("id", { count: "exact", head: true })
      .gte("ts", thirtyDaysAgo),
    supabase
      .from("revenue_events")
      .select("gst_aud_cents")
      .gte("ts", thirtyDaysAgo),
  ]);

  const netCentsLast30 = (mrrRow ?? []).reduce((sum, r) => sum + (r.net_aud_cents ?? 0), 0);
  const gstCentsLast30 = (revLast30.data ?? []).reduce((sum, r) => sum + (r.gst_aud_cents ?? 0), 0);
  const revenueLast30dAud = centsToAud(netCentsLast30);
  const gstAccrualAud = centsToAud(gstCentsLast30);

  const activeSubs = subs.count ?? 0;
  const trialing = (trials.data ?? []).filter((r) => r.status === "trialing").length;

  const trialStarts7d = (trials.data ?? []).filter((r) => {
    if (!r.trial_start) return false;
    return new Date(r.trial_start).getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000;
  });
  const trialConverted = trialStarts7d.filter((r) => r.status === "active").length;
  const trialConversion7d = trialStarts7d.length
    ? Math.round((trialConverted / trialStarts7d.length) * 100)
    : 0;

  // NOTE: True MRR needs plan × active-sub multiplication (per Stripe MRR
  // report), not a 30-day revenue sum which conflates annual renewals /
  // one-off upgrades with recurring monthly cash. Runway is a cash÷burn
  // metric and lives with the CFO cash reconciliation, not this tile.
  return {
    revenueLast30dAud,
    gstAccrualAud,
    activeSubs,
    trialing,
    trialConversion7d,
    churn30d: churn.count ?? 0,
  };
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      {sub ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p> : null}
    </div>
  );
}

function formatAud(v: number): string {
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

// Canonical segment order used by the 12-SKU pricing matrix (see 0074).
const SEGMENT_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "founder", label: "Founder" },
  { key: "investor_angel", label: "Investor — Angel" },
  { key: "investor_vc", label: "Investor — VC" },
  { key: "advisor", label: "Advisor" },
  { key: "accelerator", label: "Accelerator" },
];

function SegmentBreakdown({ mrr }: { mrr: RealMrr }) {
  const bySegment = new Map(mrr.bySegment.map((r) => [r.segment, r] as const));
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">MRR by segment</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Recurring plans only, monthly-normalised. Sourced from <code>v_mrr_by_segment</code>.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <tr className="text-left">
              <th className="pb-2 pr-4 font-semibold">Segment</th>
              <th className="pb-2 pr-4 text-right font-semibold">Active subs</th>
              <th className="pb-2 text-right font-semibold">MRR</th>
            </tr>
          </thead>
          <tbody className="text-neutral-800 dark:text-neutral-100">
            {SEGMENT_ORDER.map((row) => {
              const found = bySegment.get(row.key);
              return (
                <tr key={row.key} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{found?.subs ?? 0}</td>
                  <td className="py-2 text-right tabular-nums">{formatAud(found?.mrrAud ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PricingMetricsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/pricing-metrics");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const [m, mrr] = await Promise.all([loadMetrics(), getRealMrrAud()]);

  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">CFO</p>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Pricing metrics</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Trailing 30-day view. GST is separated for BAS accrual.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            ← Admin home
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="MRR" value={formatAud(mrr.mrrAud)} sub="Sum of active subs × monthly rate" />
          <Tile label="ARR run-rate" value={formatAud(mrr.arrAud)} sub="MRR × 12" />
          <Tile label="Active subs" value={String(mrr.activeSubs)} sub={`${m.trialing} still on trial`} />
          <Tile label="Revenue (30d, net)" value={formatAud(m.revenueLast30dAud)} sub="Trailing 30-day, ex-GST" />
          <Tile label="GST accrual" value={formatAud(m.gstAccrualAud)} sub="Trailing 30-day owed to ATO" />
          <Tile label="Trial → paid" value={`${m.trialConversion7d}%`} sub="Cohorts started ≤7d ago" />
          <Tile label="Churn events" value={String(m.churn30d)} sub="Trailing 30-day cancellations" />
        </section>

        <SegmentBreakdown mrr={mrr} />

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          <p className="font-medium text-neutral-800 dark:text-neutral-100">Data sources</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>MRR / ARR / segment breakdown: <code>v_mrr_active</code>, <code>v_mrr_by_segment</code> (migration 0083)</li>
            <li>Revenue (30d) / GST: <code>revenue_events</code> (kinds: subscribe, renewal, upgrade)</li>
            <li>Trial funnel: <code>subscription_trial_state</code></li>
            <li>Churn: <code>churn_events</code></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
