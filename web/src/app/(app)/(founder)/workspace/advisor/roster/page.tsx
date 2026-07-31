// /workspace/advisor/roster — advisor client roster subpage.
//
// Server component. Queries advisor_client_roster filtered by advisor_id =
// user.id. If the table doesn't exist, degrades to an empty state with a
// CTA to set up the first cohort.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Client Roster — Advisor Workspace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ADVISOR_COHORT_FEATURE = "advisor.cohort" as Feature;

interface RosterRow {
  id: string;
  clientName: string;
  startupTicker: string | null;
  latestSvi: number | null;
  lastEngagement: string | null;
  nextCheckIn: string | null;
}

async function loadRoster(advisorId: string): Promise<RosterRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("advisor_client_roster")
      .select(
        "id,client_name,startup_ticker,latest_svi,last_engagement,next_check_in",
      )
      .eq("advisor_id", advisorId)
      .order("last_engagement", { ascending: false, nullsFirst: false });
    if (error) return [];
    return (data ?? []).map((row) => ({
      id: String(row.id),
      clientName: String(row.client_name ?? "Unnamed client"),
      startupTicker: row.startup_ticker == null ? null : String(row.startup_ticker),
      latestSvi: row.latest_svi == null ? null : Number(row.latest_svi),
      lastEngagement: row.last_engagement == null ? null : String(row.last_engagement),
      nextCheckIn: row.next_check_in == null ? null : String(row.next_check_in),
    }));
  } catch {
    return [];
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdvisorRosterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/advisor/roster");

  const isSandbox = await getCurrentProjectIsSandbox();

  const roster = await loadRoster(user.id);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <FeatureGate feature={ADVISOR_COHORT_FEATURE} label="Advisor client roster">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink-900">Client Roster</h1>
              <p className="text-sm text-ink-500 mt-1">
                Every founder you advise, ranked by latest SVI activity and
                upcoming check-ins.
              </p>
            </div>
            <Link
              href="/workspace/advisor/roster/invite"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Invite client
            </Link>
          </header>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            {roster.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-ink-700 font-semibold">
                  Set up your first cohort
                </p>
                <p className="mt-2 text-sm text-ink-500">
                  No clients on your roster yet. Invite a founder or connect
                  your intake in settings to populate this view.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <Link
                    href="/workspace/advisor/roster/invite"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    Invite first client
                  </Link>
                  <Link
                    href="/workspace/notifications"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-4">Client name</th>
                      <th className="py-2 pr-4">Startup ticker</th>
                      <th className="py-2 pr-4">Latest SVI</th>
                      <th className="py-2 pr-4">Last engagement</th>
                      <th className="py-2 pr-4">Next check-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2 pr-4 text-ink-900">
                          <Link
                            href={`/workspace/advisor/notes?client=${encodeURIComponent(row.id)}`}
                            className="text-brand-600 hover:underline"
                          >
                            {row.clientName}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {row.startupTicker ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {row.latestSvi == null ? "—" : row.latestSvi.toFixed(0)}
                        </td>
                        <td className="py-2 pr-4 text-ink-500">
                          {fmtDate(row.lastEngagement)}
                        </td>
                        <td className="py-2 pr-4 text-ink-500">
                          {fmtDate(row.nextCheckIn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}
