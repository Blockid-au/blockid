// /workspace/accelerator — accelerator/incubator cohort workspace.
//
// W5b: server component wrapped in FeatureGate("accelerator.cohort"). The
// LP Report CTA is gated on "lp_report". Data comes from
// lib/accelerator-portal and gracefully degrades to placeholders until
// migration 0080 lands the cohort tables.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import {
  getCohort,
  listApplicants,
  getCohortSviAvg,
  type ApplicantRow,
} from "@/lib/accelerator-portal";

export const metadata: Metadata = {
  title: "Accelerator Workspace — BlockID",
  description: "Cohort management, applicant pipeline and LP reporting.",
};

export const dynamic = "force-dynamic";

// Cast helper — the LP-report gate string is a valid Feature literal in the
// entitlements union; the cast keeps this file additive if the union is
// widened later.
const LP_REPORT_FEATURE = "lp_report" as Feature;
const COHORT_FEATURE = "accelerator.cohort" as Feature;

export default async function AcceleratorWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator");

  const cohort = await getCohort(user.id);
  const [applicants, sviAvg] = await Promise.all([
    listApplicants(cohort.id),
    getCohortSviAvg(cohort.id),
  ]);

  const funnel = countByStatus(applicants);
  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <WorkspaceLayout user={user}>
      <FeatureGate feature={COHORT_FEATURE} label="Accelerator cohort workspace">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <header>
            <h1 className="text-2xl font-bold text-ink-900">Accelerator Workspace</h1>
            <p className="text-sm text-ink-500 mt-1">
              Run your cohort, review applicants and share LP-ready reports.
            </p>
          </header>

          {/* Active Cohort */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Active cohort</p>
                <h2 className="mt-1 text-xl font-semibold text-ink-900">{cohort.name}</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {dateFmt(cohort.startsAt)} → {dateFmt(cohort.endsAt)}
                </p>
              </div>
              {cohort.isPlaceholder ? (
                <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-medium">
                  Preview data
                </span>
              ) : null}
            </div>

            <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Founders" value={String(cohort.founderCount)} />
              <Stat label="Batch SVI avg" value={sviAvg.avg.toFixed(1)} />
              <Stat
                label="WoW trend"
                value={`${sviAvg.trend >= 0 ? "+" : ""}${sviAvg.trend.toFixed(1)}`}
                tone={sviAvg.trend >= 0 ? "positive" : "negative"}
              />
              <Stat label="Sample size" value={String(sviAvg.sampleSize)} />
            </dl>
          </section>

          {/* Applicant Pipeline */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Applicant pipeline</h2>
                <p className="text-sm text-ink-500 mt-1">
                  Submitted {funnel.submitted} · Reviewing {funnel.reviewing} ·
                  Accepted {funnel.accepted} · Rejected {funnel.rejected}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-4">Startup</th>
                    <th className="py-2 pr-4">Founder</th>
                    <th className="py-2 pr-4">Submitted</th>
                    <th className="py-2 pr-4">SVI</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-500 italic">
                        No applicants yet — share your cohort intake link.
                      </td>
                    </tr>
                  ) : (
                    applicants.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <td className="py-2 pr-4 text-ink-900">{a.startupName}</td>
                        <td className="py-2 pr-4 text-ink-700">{a.founderName}</td>
                        <td className="py-2 pr-4 text-ink-500">
                          {new Date(a.submittedAt).toLocaleDateString("en-AU")}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {a.svi == null ? "—" : a.svi.toFixed(0)}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusPill status={a.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* LP Report CTA */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-ink-900">LP quarterly report</h2>
            <p className="text-sm text-ink-500 mt-1">
              Investor-ready PDF summarising cohort performance, graduation
              milestones and follow-on rounds.
            </p>
            <div className="mt-4">
              <FeatureGate feature={LP_REPORT_FEATURE} label="LP report">
                <Link
                  href="/dashboard/reports/lp-quarterly"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Generate Quarterly LP Report
                </Link>
              </FeatureGate>
            </div>
          </section>

          {/* Program KPIs */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard title="Graduated %" value="82%" hint="Placeholder — waiting on cohort_outcomes" />
            <KpiCard title="Avg funding raised" value="A$1.4M" hint="Placeholder — waiting on cohort_outcomes" />
            <KpiCard title="Follow-on rate" value="47%" hint="Placeholder — waiting on cohort_outcomes" />
          </section>
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}

function countByStatus(rows: ApplicantRow[]): Record<ApplicantRow["status"], number> {
  const c: Record<ApplicantRow["status"], number> = {
    submitted: 0,
    reviewing: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const r of rows) c[r.status] += 1;
  return c;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
      ? "text-rose-600"
      : "text-ink-900";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500 italic">{hint}</p>
    </div>
  );
}

function StatusPill({ status }: { status: ApplicantRow["status"] }) {
  const styles: Record<ApplicantRow["status"], string> = {
    submitted: "bg-slate-100 text-slate-700",
    reviewing: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
