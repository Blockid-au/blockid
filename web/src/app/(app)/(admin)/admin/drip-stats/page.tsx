// /admin/drip-stats — Wave 33a
//
// Lightweight monitoring surface for the investor lead drip sequence.
// Reports total drips by step, 7-day activity, unsubscribe counts and
// a table of the 20 most recent drip events. Reads `tbr_lead_drips`
// and `investor_unsubscribes` via the service-role Supabase client.
// Gracefully renders "No data yet" when tables/columns are missing.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, MailX, Send, Shield } from "lucide-react";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Drip Stats — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface DripRow {
  id: number;
  lead_id: number;
  step: number;
  sent_at: string;
}

interface Stats {
  totalByStep: Record<1 | 2 | 3, number>;
  totalAll: number;
  last7Days: number;
  totalUnsubs: number;
  unsubs7Days: number;
  recent: DripRow[];
  error: string | null;
}

async function loadStats(): Promise<Stats> {
  const empty: Stats = {
    totalByStep: { 1: 0, 2: 0, 3: 0 },
    totalAll: 0,
    last7Days: 0,
    totalUnsubs: 0,
    unsubs7Days: 0,
    recent: [],
    error: null,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...empty, error: "Supabase admin client unavailable" };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [step1, step2, step3, recent7, totalUnsubs, unsub7, recent] = await Promise.all([
      supabase.from("tbr_lead_drips").select("id", { count: "exact", head: true }).eq("step", 1),
      supabase.from("tbr_lead_drips").select("id", { count: "exact", head: true }).eq("step", 2),
      supabase.from("tbr_lead_drips").select("id", { count: "exact", head: true }).eq("step", 3),
      supabase.from("tbr_lead_drips").select("id", { count: "exact", head: true }).gte("sent_at", sevenDaysAgo),
      supabase.from("investor_unsubscribes").select("email", { count: "exact", head: true }),
      supabase.from("investor_unsubscribes").select("email", { count: "exact", head: true }).gte("unsubscribed_at", sevenDaysAgo),
      supabase.from("tbr_lead_drips").select("id, lead_id, step, sent_at").order("sent_at", { ascending: false }).limit(20),
    ]);

    const byStep = {
      1: step1.count ?? 0,
      2: step2.count ?? 0,
      3: step3.count ?? 0,
    } as Record<1 | 2 | 3, number>;

    return {
      totalByStep: byStep,
      totalAll: byStep[1] + byStep[2] + byStep[3],
      last7Days: recent7.count ?? 0,
      totalUnsubs: totalUnsubs.count ?? 0,
      unsubs7Days: unsub7.count ?? 0,
      recent: (recent.data ?? []) as DripRow[],
      error: null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "Query failed" };
  }
}

export default async function DripStatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/drip-stats");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  const stats = await loadStats();
  const hasAny = stats.totalAll > 0 || stats.totalUnsubs > 0;

  const cards = [
    { label: "Total drips sent", value: stats.totalAll, icon: Send, color: "text-brand-600" },
    { label: "Sent in last 7 days", value: stats.last7Days, icon: Mail, color: "text-teal-500" },
    { label: "Total unsubscribes", value: stats.totalUnsubs, icon: MailX, color: "text-amber-500" },
    { label: "Unsubscribes (7d)", value: stats.unsubs7Days, icon: MailX, color: "text-red-500" },
  ];

  const stepCards: Array<{ step: 1 | 2 | 3; label: string }> = [
    { step: 1, label: "Step 1 — Acknowledgement (T+0)" },
    { step: 2, label: "Step 2 — SVI delta (T+2d)" },
    { step: 3, label: "Step 3 — Soft nudge (T+7d)" },
  ];

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 max-w-6xl mx-auto flex items-center gap-3">
        <Link href="/admin" className="text-ink-600 hover:text-ink-800">
          <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Investor Drip Stats</h1>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {stats.error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Could not read stats: {stats.error}. Showing zeros.
          </div>
        )}

        {!hasAny && !stats.error && (
          <div className="rounded-xl border border-surface-200 bg-white px-4 py-6 text-sm text-ink-600 text-center">
            No data yet — the investor drip sequence hasn't sent any emails.
          </div>
        )}

        {/* Top-level stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-[0.15em] text-ink-700 font-medium">
                  {label}
                </p>
                <Icon strokeWidth={1.75} className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-3xl font-bold font-mono text-ink-800">{value}</p>
            </div>
          ))}
        </div>

        {/* By-step breakdown */}
        <section className="bg-white border border-surface-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4">Drips by step</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stepCards.map(({ step, label }) => (
              <div
                key={step}
                className="rounded-xl border border-surface-200 bg-surface-50 p-4"
              >
                <p className="text-xs text-ink-600">{label}</p>
                <p className="text-2xl font-bold font-mono text-ink-800 mt-1">
                  {stats.totalByStep[step]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent drip events */}
        <section className="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Recent drip events</h2>
            <span className="text-xs text-ink-600">{stats.recent.length} shown</span>
          </div>
          {stats.recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-600 text-center">No drip events recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs text-ink-600 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2 font-medium">Sent at</th>
                  <th className="px-4 py-2 font-medium">Lead ID</th>
                  <th className="px-4 py-2 font-medium">Step</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((row) => (
                  <tr key={row.id} className="border-t border-surface-200/60">
                    <td className="px-5 py-2 text-ink-700 text-xs font-mono">
                      {new Date(row.sent_at).toLocaleString("en-AU")}
                    </td>
                    <td className="px-4 py-2 text-ink-700 font-mono text-xs">{row.lead_id}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-[10px] font-semibold px-2 py-0.5">
                        Step {row.step}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
