import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  title: "C-Level Reports · BlockID",
  description: "Nightly CFO, CEO, CTO, CMO and CDO reports with 12-week trend tracking.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROLES: Array<{ role: Role; title: string; blurb: string; metricLabel: string }> = [
  { role: "cfo", title: "CFO — Valuation", blurb: "DCF valuation with sensitivity", metricLabel: "Base DCF (AUD)" },
  { role: "ceo", title: "CEO — Runway", blurb: "5-year roadmap and funding timeline", metricLabel: "Runway (months)" },
  { role: "cto", title: "CTO — Tech Posture", blurb: "Tech debt vs innovation ledger", metricLabel: "SVI score" },
  { role: "cmo", title: "CMO — CAC Payback", blurb: "GTM optimisation and channel mix", metricLabel: "Payback (months)" },
  { role: "cdo", title: "CDO — Data & Privacy", blurb: "APP + GDPR compliance and analytics", metricLabel: "SVI score" },
];

async function loadTrendForRole(projectId: string, role: Role): Promise<TrendSnapshot[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("clevel_trend_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .eq("role", role)
    .order("snapshot_date", { ascending: false })
    .limit(12);
  if (error || !data) return [];
  return data as TrendSnapshot[];
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-slate-500 text-xs">no data</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle" aria-label="12-week trend sparkline">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function TrendArrow({ direction }: { direction: string }) {
  if (direction === "up") return <span className="text-emerald-500" aria-label="trending up">▲</span>;
  if (direction === "down") return <span className="text-rose-500" aria-label="trending down">▼</span>;
  if (direction === "flat") return <span className="text-slate-500" aria-label="flat">—</span>;
  return <span className="text-slate-400" aria-label="insufficient data">·</span>;
}

function formatMetric(role: Role, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (role === "cfo") {
    if (Math.abs(value) >= 1_000_000) return `A$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `A$${(value / 1_000).toFixed(0)}k`;
    return `A$${Math.round(value)}`;
  }
  return String(Math.round(value * 10) / 10);
}

export default async function CLevelReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/c-level-reports");

  const isSandbox = await getCurrentProjectIsSandbox();
  const projectId = await getProjectIdFromRequest();

  const cards = await Promise.all(
    ROLES.map(async (cfg) => {
      const snapshots = projectId ? await loadTrendForRole(projectId, cfg.role) : [];
      const trend = compareTrendAcross12Weeks(snapshots, primaryMetricForRole(cfg.role));
      return { ...cfg, trend };
    }),
  );

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold text-white">C-Level Reports</h1>
          <p className="mt-2 text-slate-400">
            Nightly agent-generated reports with 12-week trend tracking.
            <span className="ml-2 text-xs text-slate-500">
              NFA — general information only. Not financial advice under Corporations Act 2001 (Cth).
            </span>
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.role}
              href={`/dashboard/c-level-reports/${c.role}`}
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 hover:border-emerald-700 hover:bg-slate-900 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{c.title}</h2>
                  <p className="text-sm text-slate-400 mt-1">{c.blurb}</p>
                </div>
                <TrendArrow direction={c.trend.direction} />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-500">{c.metricLabel}</span>
                  <span className="text-2xl font-mono text-white">{formatMetric(c.role, c.trend.endValue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-slate-500">
                    <Sparkline values={c.trend.sparkline} />
                  </div>
                  <span className="text-xs text-slate-400">
                    {c.trend.deltaPct !== null
                      ? `${c.trend.deltaPct >= 0 ? "+" : ""}${c.trend.deltaPct.toFixed(1)}% 12wk`
                      : "no history"}
                  </span>
                </div>
                {c.trend.alert && (
                  <div className="mt-2 rounded border border-rose-800 bg-rose-950/50 px-2 py-1 text-xs text-rose-300">
                    {c.trend.alert.message}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </WorkspaceLayout>
  );
}
