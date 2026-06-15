// /dashboard/admin/30day — 30-Day Validation MVP scoreboard.
//
// Admin-only. Single source of truth for the CEO's North Star metrics from
// .claude/goals/30day-validation-mvp.md. Every C-Level daily brief references
// this page; orchestrator picks up T0200 as "done" once it's live.
//
// Data sources (server-component, no separate API):
//   • web/content/reports/project-state.json     — tasks shipped + milestones
//   • svi_analyses                                — assessments + company profiles
//   • revenue_entries                             — revenue + paying customers (30d)
//   • founding50_waitlist                         — email subscribers
//   • users                                       — total registered + last 30d
//
// Each card: target vs actual vs % vs status (RED/YELLOW/GREEN).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as fs from "fs";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "30-Day Validation Scoreboard — BlockID Admin",
  description: "CEO North Star scoreboard: paying customers, MRR, profiles, assessments.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Metric {
  key: string;
  label: string;
  target: number;
  actual: number;
  unit?: string;
  source: string;
  ownerAgent: string;
}

const TARGETS = {
  payingCustomers: 10,
  revenueAud: 1000, // mid of $1k–$3k range
  mrrAud: 1000,
  companyProfiles: 100,
  completedAssessments: 50,
  founderInterviews: 30,
  emailSubscribers: 100,
  linkedinLeads: 100,
};

function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function statusOf(p: number): "RED" | "YELLOW" | "GREEN" {
  if (p >= 70) return "GREEN";
  if (p >= 30) return "YELLOW";
  return "RED";
}

const STATUS_COLOR: Record<string, string> = {
  GREEN: "bg-emerald-50 text-emerald-700 border-emerald-200",
  YELLOW: "bg-amber-50 text-amber-700 border-amber-200",
  RED: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_BAR: Record<string, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-500",
  RED: "bg-rose-500",
};

async function loadMetrics(): Promise<{
  metrics: Metric[];
  shippedTasks30d: number;
  milestones30d: number;
  daysElapsed: number;
  pace: { onTrack: number; behind: number };
}> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const planStart = new Date("2026-06-13T00:00:00Z"); // 30-day plan start
  const daysElapsed = Math.min(30, Math.max(1, Math.round((Date.now() - planStart.getTime()) / (24 * 60 * 60 * 1000))));

  // Defaults — every metric must render even if a query fails
  let assessments30d = 0;
  let companyProfiles = 0;
  let revenueAud = 0;
  let payingCustomers = 0;
  let emailSubs = 0;
  let usersTotal = 0;

  if (supabase) {
    const [
      assess,
      profilesDistinct,
      revenueRows,
      founding50,
      users,
    ] = await Promise.all([
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("svi_analyses").select("email").not("email", "is", null),
      supabase.from("revenue_entries").select("email,amount,month").gte("month", since.slice(0, 7)),
      supabase.from("founding50_waitlist").select("id", { count: "exact", head: true }),
      supabase.from("users").select("id", { count: "exact", head: true }),
    ]);

    assessments30d = assess.count ?? 0;
    const profiles = (profilesDistinct.data ?? []) as Array<{ email: string | null }>;
    companyProfiles = new Set(profiles.map(r => r.email).filter((e): e is string => Boolean(e))).size;
    const rev = (revenueRows.data ?? []) as Array<{ email: string | null; amount: number | string | null }>;
    revenueAud = rev.reduce((s: number, r) => s + (Number(r.amount) || 0), 0);
    payingCustomers = new Set(rev.map(r => r.email).filter((e): e is string => Boolean(e))).size;
    emailSubs = founding50.count ?? 0;
    usersTotal = users.count ?? 0;
  }

  // Project-state for shipped tasks / milestones in the last 30 days
  let shippedTasks30d = 0;
  let milestones30d = 0;
  try {
    const ps = JSON.parse(fs.readFileSync("/home/dovanlong/blockid.au/web/content/reports/project-state.json", "utf8"));
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    shippedTasks30d = (ps.plan?.tasks ?? []).filter(
      (t: { status: string; completedAt?: string }) =>
        t.status === "done" && t.completedAt && Date.parse(t.completedAt) >= cutoff,
    ).length;
    milestones30d = (ps.milestones ?? []).filter(
      (m: { completedAt: string }) => Date.parse(m.completedAt) >= cutoff,
    ).length;
  } catch { /* missing project-state — keep zeros */ }

  // emailSubs is a proxy for the email-subscribers KPI; users count is bonus context
  const metrics: Metric[] = [
    {
      key: "payingCustomers",
      label: "Paying customers",
      target: TARGETS.payingCustomers,
      actual: payingCustomers,
      source: "revenue_entries (last 30d, distinct emails)",
      ownerAgent: "CRO",
    },
    {
      key: "revenueAud",
      label: "Revenue (AUD, 30d)",
      target: TARGETS.revenueAud,
      actual: Math.round(revenueAud),
      unit: "$",
      source: "revenue_entries.amount sum",
      ownerAgent: "CFO",
    },
    {
      key: "mrrAud",
      label: "MRR (AUD)",
      target: TARGETS.mrrAud,
      actual: 0,
      unit: "$",
      source: "Stripe subscriptions (wire next)",
      ownerAgent: "CFO",
    },
    {
      key: "companyProfiles",
      label: "Company profiles",
      target: TARGETS.companyProfiles,
      actual: companyProfiles,
      source: "svi_analyses (distinct emails, all-time)",
      ownerAgent: "CDO",
    },
    {
      key: "completedAssessments",
      label: "Completed assessments (30d)",
      target: TARGETS.completedAssessments,
      actual: assessments30d,
      source: "svi_analyses count (last 30d)",
      ownerAgent: "CPO",
    },
    {
      key: "founderInterviews",
      label: "Founder interviews",
      target: TARGETS.founderInterviews,
      actual: 0,
      source: "Manual log — wire user_feedback.kind='interview'",
      ownerAgent: "CCSO",
    },
    {
      key: "emailSubscribers",
      label: "Email subscribers",
      target: TARGETS.emailSubscribers,
      actual: emailSubs,
      source: "founding50_waitlist count",
      ownerAgent: "CMO",
    },
    {
      key: "linkedinLeads",
      label: "LinkedIn / community leads",
      target: TARGETS.linkedinLeads,
      actual: 0,
      source: "user_actions utm_source=linkedin (wire next)",
      ownerAgent: "CMO",
    },
  ];

  const onTrack = metrics.filter(m => pct(m.actual, m.target) >= (daysElapsed / 30) * 100).length;
  const behind = metrics.length - onTrack;

  return {
    metrics,
    shippedTasks30d,
    milestones30d,
    daysElapsed,
    pace: { onTrack, behind },
  };
}

export default async function ThirtyDayScoreboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/30day");
  if (user.role !== "admin") redirect("/dashboard");

  const { metrics, shippedTasks30d, milestones30d, daysElapsed, pace } = await loadMetrics();

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">CEO North Star</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">
            30-Day Validation Scoreboard
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Source: <code className="text-xs">.claude/goals/30day-validation-mvp.md</code>. Updated live from Supabase + project-state.json on every page load.
          </p>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Day</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{daysElapsed} <span className="text-base font-normal text-ink-400">/ 30</span></p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-ink-100">
              <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${(daysElapsed / 30) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">On track</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{pace.onTrack}<span className="text-base font-normal text-ink-400"> / {metrics.length}</span></p>
            <p className="mt-2 text-xs text-ink-500">Meeting expected pace for elapsed time.</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Behind</p>
            <p className="mt-1 text-2xl font-semibold text-rose-700">{pace.behind}<span className="text-base font-normal text-ink-400"> / {metrics.length}</span></p>
            <p className="mt-2 text-xs text-ink-500">Need C-Level attention this cycle.</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Shipped (30d)</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{shippedTasks30d}<span className="text-base font-normal text-ink-400"> tasks</span></p>
            <p className="mt-2 text-xs text-ink-500">{milestones30d} milestone{milestones30d === 1 ? "" : "s"} cut.</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">North Star metrics</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {metrics.map(m => {
              const p = pct(m.actual, m.target);
              const s = statusOf(p);
              const expected = Math.round((daysElapsed / 30) * 100);
              const paceLabel = p >= expected ? "on pace" : `${expected - p}pp behind pace`;
              return (
                <div key={m.key} className="rounded-2xl border border-ink-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-500">{m.ownerAgent} · {m.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-ink-800">
                        {m.unit ?? ""}{m.actual.toLocaleString()} <span className="text-base font-normal text-ink-400">/ {m.unit ?? ""}{m.target.toLocaleString()}</span>
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[s]}`}>{s}</span>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-ink-100">
                    <div className={`h-2 rounded-full ${STATUS_BAR[s]}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
                    <span>{p}% of target · {paceLabel}</span>
                  </div>
                  <p className="mt-3 text-xs text-ink-400">Source: {m.source}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-ink-50 p-5">
          <h3 className="text-sm font-semibold text-ink-800">CEO filter — every action must support at least one</h3>
          <ul className="mt-3 grid gap-2 md:grid-cols-2 text-xs text-ink-600">
            <li>· Getting paying customers</li>
            <li>· Learning willingness to pay</li>
            <li>· Collecting company valuation data</li>
            <li>· Improving free → paid conversion</li>
            <li>· Delivering customer value</li>
            <li>· Reducing operational friction</li>
          </ul>
          <p className="mt-4 text-xs text-ink-500">
            Stop conditions: ≥10 paying customers + ≥$1k MRR + ≥100 profiles + ≥1 testimonial + ≥1 referral converted in the same week → graduate to Spiral 1 (Unicorn masterplan).
          </p>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
