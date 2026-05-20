import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { Logo } from "@/components/brand/logo";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  GitBranch,
  Globe,
  Hash,
  Layers,
  Shield,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BlockID Self-Assessment — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ─── Evidence sources for BlockID itself ─────────────────────────────────── */
const BLOCKID_EVIDENCE = [
  { source: "Git Repository", detail: "212 files", type: "Connected source", confidence: 75, icon: GitBranch },
  { source: "Production Deployment", detail: "50 API routes", type: "Connected source", confidence: 75, icon: Globe },
  { source: "Stripe Live", detail: "Payment system active", type: "Transaction data", confidence: 90, icon: CreditCard },
  { source: "Domain", detail: "blockid.au live", type: "Public URL", confidence: 35, icon: Globe },
  { source: "ABN", detail: "Auschain Pty Ltd", type: "Document", confidence: 50, icon: FileText },
  { source: "Documentation", detail: "7,000+ lines PRD", type: "Document", confidence: 50, icon: FileText },
];

/* ─── Next goals from PRD Section 23.4 ────────────────────────────────────── */
const NEXT_GOALS: Array<{ priority: "P0" | "P1" | "P2"; label: string; sviImpact: number }> = [
  { priority: "P0", label: "First 10 paying customers", sviImpact: 20 },
  { priority: "P0", label: "File trademark", sviImpact: 7 },
  { priority: "P0", label: "ESOP pool 10%", sviImpact: 5 },
  { priority: "P1", label: "Google Analytics evidence", sviImpact: 8 },
  { priority: "P1", label: "First case study", sviImpact: 5 },
  { priority: "P1", label: "SHA draft", sviImpact: 5 },
  { priority: "P2", label: "Advisory board", sviImpact: 8 },
  { priority: "P2", label: "R&D tax application", sviImpact: 3 },
];

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-100 text-red-700 border-red-200",
  P1: "bg-amber-100 text-amber-700 border-amber-200",
  P2: "bg-sky-100 text-sky-700 border-sky-200",
};

function confidenceColor(pct: number): string {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-brand-500";
  if (pct >= 35) return "bg-amber-500";
  return "bg-red-500";
}

function sviScoreColor(score: number): string {
  if (score >= 140) return "text-emerald-600";
  if (score >= 120) return "text-brand-600";
  if (score >= 100) return "text-amber-500";
  return "text-red-500";
}

function riskCardColor(points: number): string {
  if (points >= 10) return "border-red-300 bg-red-50";
  if (points >= 5) return "border-amber-300 bg-amber-50";
  return "border-sky-300 bg-sky-50";
}

export default async function SelfAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/self-analysis");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <p className="text-ink-600 text-sm mb-6">Admin access required.</p>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();

  /* ─── Load data from DB ───────────────────────────────────────────────────── */
  let analysis: SVIAnalysis | null = null;
  let creditBalance = 0;
  let platformStats = { users: 0, analyses: 0, leads: 0, payingUsers: 0, creditTotal: 0, sviAccounts: 0 };

  if (supabase) {
    const [
      analysisRes,
      creditRes,
      usersRes,
      analysesCountRes,
      leadsRes,
      payingRes,
      creditTotalRes,
      sviAccountsRes,
    ] = await Promise.all([
      // Latest SVI analysis for admin@blockid.au
      supabase
        .from("svi_analyses")
        .select("analysis_json, total_svi, created_at")
        .eq("email", "admin@blockid.au")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Credit balance
      supabase
        .from("credit_balances")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      // Platform stats
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("app_users").select("id", { count: "exact", head: true }).neq("plan", "free").not("plan", "is", null),
      supabase.from("credit_balances").select("balance"),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }),
    ]);

    if (analysisRes.data?.analysis_json) {
      analysis = analysisRes.data.analysis_json as SVIAnalysis;
    }

    creditBalance = creditRes.data?.balance ?? 0;

    const totalCredits = (creditTotalRes.data ?? []).reduce(
      (sum: number, row: { balance: number }) => sum + (row.balance ?? 0),
      0,
    );

    platformStats = {
      users: usersRes.count ?? 0,
      analyses: analysesCountRes.count ?? 0,
      leads: leadsRes.count ?? 0,
      payingUsers: payingRes.count ?? 0,
      creditTotal: totalCredits,
      sviAccounts: sviAccountsRes.count ?? 0,
    };
  }

  const totalSVI = analysis?.totalSVI ?? 0;
  const stage = analysis?.stage ?? 0;
  const stageLabel = analysis?.stageLabel ?? SVI_STAGE_LABELS[stage] ?? "Unknown";
  const confidenceMultiplier = analysis?.confidenceMultiplier ?? 0;
  const subs = analysis?.subs ?? [];
  const riskPenalties = analysis?.riskPenalties ?? [];
  const evidenceGaps = analysis?.evidenceGaps ?? [];
  const nextActions = analysis?.nextActions ?? [];

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      {/* Navigation bar */}
      <header className="sticky top-0 z-30 border-b border-surface-200/60 bg-white/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800 transition-colors">
              <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
              Admin
            </Link>
            <div className="h-5 w-px bg-surface-200" />
            <Logo variant="light" />
          </div>
          <span className="text-xs text-ink-500">{user.email}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ─── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-800">BlockID.au Self-Assessment</h1>
            <p className="text-sm text-ink-600 mt-1">We eat our own dog food</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500 bg-surface-100 border border-surface-200 rounded-lg px-3 py-1.5">
              Credits: <span className="font-mono font-semibold text-ink-700">{creditBalance}</span>
            </span>
          </div>
        </div>

        {/* ─── SVI Score Card ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start gap-8">
            {/* Score display */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left shrink-0">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Startup Value Index</p>
              <p className={`text-6xl font-extrabold font-mono leading-none ${sviScoreColor(totalSVI)}`}>
                {totalSVI}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 bg-surface-100 rounded-lg px-3 py-1.5 border border-surface-200">
                  <Layers strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
                  Stage {stage}: {stageLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 bg-surface-100 rounded-lg px-3 py-1.5 border border-surface-200">
                  <Activity strokeWidth={1.75} className="h-3.5 w-3.5 text-teal-500" />
                  {(confidenceMultiplier * 100).toFixed(0)}% confidence
                </span>
              </div>
              {analysis?.summary && (
                <p className="text-sm text-ink-600 mt-4 max-w-md leading-relaxed">{analysis.summary}</p>
              )}
            </div>

            {/* 8 Dimension Bars */}
            <div className="flex-1 space-y-3">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">8 Dimensions</p>
              {subs.length > 0 ? (
                subs.map((sub) => {
                  const pct = Math.round(sub.value);
                  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500";
                  const adjColor = sub.adjustment >= 0 ? "text-emerald-600" : "text-red-600";
                  return (
                    <div key={sub.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-700">{sub.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-semibold ${adjColor}`}>
                            {sub.adjustment >= 0 ? "+" : ""}{sub.adjustment}
                          </span>
                          <span className="font-mono text-ink-500">{pct}/100</span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-ink-500 italic">
                  No SVI analysis found for admin@blockid.au. Run an analysis first.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Evidence Index ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Database strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
            Evidence Index
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BLOCKID_EVIDENCE.map((ev) => {
              const Icon = ev.icon;
              return (
                <div key={ev.source} className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon strokeWidth={1.75} className="h-4 w-4 text-brand-500 shrink-0" />
                    <p className="text-sm font-medium text-ink-800">{ev.source}</p>
                  </div>
                  <p className="text-xs text-ink-600">{ev.detail}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-ink-500 font-medium">{ev.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-surface-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${confidenceColor(ev.confidence)}`}
                          style={{ width: `${ev.confidence}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-ink-500">{ev.confidence}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Risk Assessment ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
            Risk Assessment
          </h2>
          {riskPenalties.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {riskPenalties.map((risk, i) => (
                <div
                  key={i}
                  className={`rounded-xl border px-4 py-3 space-y-1 ${riskCardColor(risk.points)}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-800">{risk.label}</p>
                    <span className="text-xs font-mono font-semibold text-red-600">-{risk.points}</span>
                  </div>
                  <p className="text-xs text-ink-600">{risk.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500 italic">No risk penalties detected. Run an analysis to populate.</p>
          )}
        </div>

        {/* ─── Action Plan ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Target strokeWidth={1.75} className="h-4 w-4 text-brand-500" />
            Action Plan
          </h2>

          {/* Evidence Gaps */}
          {evidenceGaps.length > 0 && (
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-3">Evidence Gaps</p>
              <div className="space-y-2">
                {evidenceGaps.map((gap, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3"
                  >
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border shrink-0 mt-0.5 ${PRIORITY_COLORS[gap.priority]}`}>
                      {gap.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                      <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                    </div>
                    <span className="text-xs font-mono text-emerald-600 font-semibold shrink-0">+{gap.impact} SVI</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Actions */}
          {nextActions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-3">Next Actions</p>
              <div className="space-y-2">
                {nextActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3"
                  >
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border shrink-0 mt-0.5 ${PRIORITY_COLORS[action.priority]}`}>
                      {action.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-800">{action.title}</p>
                      <p className="text-xs text-ink-600 mt-0.5">{action.detail}</p>
                    </div>
                    <span className="text-xs font-mono text-ink-500 shrink-0">{action.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {evidenceGaps.length === 0 && nextActions.length === 0 && (
            <p className="text-sm text-ink-500 italic">No action items yet. Run an analysis to populate.</p>
          )}
        </div>

        {/* ─── Live Platform Metrics ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <BarChart3 strokeWidth={1.75} className="h-4 w-4 text-teal-500" />
            Live Platform Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "App Users", value: platformStats.users, icon: Users, color: "text-brand-600" },
              { label: "SVI Analyses", value: platformStats.analyses, icon: FileText, color: "text-teal-500" },
              { label: "Leads", value: platformStats.leads, icon: Zap, color: "text-amber-500" },
              { label: "Paying Users", value: platformStats.payingUsers, icon: CreditCard, color: "text-emerald-600" },
              { label: "Credit Balance", value: platformStats.creditTotal, icon: Hash, color: "text-purple-500" },
              { label: "SVI Accounts", value: platformStats.sviAccounts, icon: TrendingUp, color: "text-sky-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-center">
                <Icon strokeWidth={1.75} className={`h-4 w-4 mx-auto mb-1.5 ${color}`} />
                <p className="text-2xl font-bold font-mono text-ink-800">{value}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-ink-500 font-medium mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Next Goals (PRD Section 23.4) ────────────────────────────────── */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-500" />
            Next Goals
            <span className="text-[10px] text-ink-500 font-normal ml-1">(PRD Section 23.4)</span>
          </h2>
          <div className="space-y-2">
            {NEXT_GOALS.map((goal, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-4 py-3"
              >
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border shrink-0 ${PRIORITY_COLORS[goal.priority]}`}>
                  {goal.priority}
                </span>
                <p className="text-sm text-ink-700 flex-1">{goal.label}</p>
                <span className="text-xs font-mono text-emerald-600 font-semibold shrink-0">+{goal.sviImpact} SVI</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-surface-200 flex items-center justify-between">
            <p className="text-xs text-ink-500">Total potential gain from all goals</p>
            <span className="text-sm font-mono font-bold text-emerald-600">
              +{NEXT_GOALS.reduce((sum, g) => sum + g.sviImpact, 0)} SVI
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
