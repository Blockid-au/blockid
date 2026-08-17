import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox, getProjectIdFromRequest } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  compareTrendAcross12Weeks,
  primaryMetricForRole,
  type Role,
  type TrendSnapshot,
} from "@/lib/c-level/compare-trend";

export const metadata: Metadata = {
  title: "C-Level Report Detail · BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_ROLES: Role[] = ["cfo", "ceo", "cto", "cmo", "cdo"];

interface PageProps {
  params: Promise<{ role: string }>;
}

async function loadLatestReport(projectId: string, role: Role) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("clevel_reports_v2")
    .select("*")
    .eq("project_id", projectId)
    .eq("role", role)
    .eq("scenario", "base")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function loadTrend(projectId: string, role: Role): Promise<TrendSnapshot[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("clevel_trend_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .eq("role", role)
    .order("snapshot_date", { ascending: false })
    .limit(12);
  return (data ?? []) as TrendSnapshot[];
}

function TrendChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <p className="text-sm text-slate-500">Not enough weekly snapshots yet — reports need 2+ weeks to trend.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 640;
  const h = 120;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="text-emerald-400" aria-label="12-week trend chart">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export default async function CLevelReportDetailPage({ params }: PageProps) {
  const { role } = await params;
  if (!VALID_ROLES.includes(role as Role)) notFound();
  const typedRole = role as Role;

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/dashboard/c-level-reports/${role}`);

  const isSandbox = await getCurrentProjectIsSandbox();
  const projectId = await getProjectIdFromRequest();

  const report = projectId ? await loadLatestReport(projectId, typedRole) : null;
  const snapshots = projectId ? await loadTrend(projectId, typedRole) : [];
  const trend = compareTrendAcross12Weeks(snapshots, primaryMetricForRole(typedRole));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <nav className="mb-4 text-sm">
          <Link href="/dashboard/c-level-reports" className="text-emerald-400 hover:underline">
            ← C-Level Reports
          </Link>
        </nav>

        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white uppercase">{typedRole} Report</h1>
            {report && (
              <p className="text-sm text-slate-400 mt-1">
                Generated {new Date(report.generated_at as string).toLocaleString("en-AU")} · scenario {report.scenario}
              </p>
            )}
          </div>
          <form action={`/api/investor-pack/append?role=${typedRole}`} method="post">
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Export to investor pack
            </button>
          </form>
        </header>

        {!report && (
          <div className="rounded border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
            No {typedRole.toUpperCase()} report yet. The nightly cron will generate one within 24 hours.
          </div>
        )}

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-3">12-week trend</h2>
          <TrendChart values={trend.sparkline} />
          <div className="mt-2 flex items-center gap-4 text-sm text-slate-400">
            <span>Direction: <span className="text-white">{trend.direction}</span></span>
            {trend.deltaPct !== null && (
              <span>Δ: <span className="text-white">{trend.deltaPct >= 0 ? "+" : ""}{trend.deltaPct.toFixed(1)}%</span></span>
            )}
            {trend.weekOverWeekPct !== null && (
              <span>WoW: <span className="text-white">{trend.weekOverWeekPct >= 0 ? "+" : ""}{trend.weekOverWeekPct.toFixed(1)}%</span></span>
            )}
          </div>
          {trend.alert && (
            <div className="mt-3 rounded border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">
              <strong className="uppercase">{trend.alert.severity}:</strong> {trend.alert.message}
            </div>
          )}
        </section>

        {report && (
          <section className="prose prose-invert max-w-none">
            <h2 className="text-xl font-semibold text-white">{report.title as string}</h2>
            {report.summary && (
              <p className="text-slate-300 italic">{report.summary as string}</p>
            )}
            {report.body_markdown && (
              <pre className="whitespace-pre-wrap font-mono text-sm text-slate-200">
                {report.body_markdown as string}
              </pre>
            )}
          </section>
        )}

        {report?.dcf_valuation_base && typedRole === "cfo" && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-white mb-3">DCF Valuation Summary</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-2">Scenario</th>
                  <th className="py-2">Enterprise Value (AUD)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-slate-800">
                  <td className="py-2">Bear</td>
                  <td className="py-2">A${Number(report.dcf_valuation_low ?? 0).toLocaleString("en-AU")}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-2">Base</td>
                  <td className="py-2">A${Number(report.dcf_valuation_base ?? 0).toLocaleString("en-AU")}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-2">Bull</td>
                  <td className="py-2">A${Number(report.dcf_valuation_high ?? 0).toLocaleString("en-AU")}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-12 text-xs text-slate-500 border-t border-slate-800 pt-4">
          NFA — general information only. Not financial advice under Corporations Act 2001 (Cth).
          Consult a licensed adviser before acting on any figure.
        </footer>
      </main>
    </WorkspaceLayout>
  );
}
