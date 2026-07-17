import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "LP Quarterly Report — Dashboard — BlockID",
  description:
    "Generate a quarterly LP-ready report covering cohort performance, graduation milestones and follow-on capital across your accelerator programme.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LpQuarterlyReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/reports/lp-quarterly");

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/accelerator" className="hover:text-brand-600">
            Accelerator
          </Link>{" "}
          / <span className="text-ink-700">LP quarterly report</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            LP quarterly report
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            The LP quarterly report is the investor-ready PDF you send to
            limited partners at the end of each cohort quarter. It rolls up
            graduation percentage, average funding raised per graduate,
            follow-on rate, and the individual founder highlights that came out
            of your programme. The generator pulls straight from your cohort
            outcomes table and formats everything in a clean, print-safe layout
            you can email or hand out at your annual meeting without any manual
            slide-building.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink-900">What the report covers</h2>
          <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>Programme-level KPIs: intake size, graduation rate, follow-on rate.</li>
            <li>Cohort roll-up: mean and median SVI score at start and at demo day.</li>
            <li>Capital deployed and raised, by cohort and by stage.</li>
            <li>Founder spotlights: three-to-five graduated companies with milestones.</li>
            <li>Programme roadmap and next-quarter operating priorities.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Generate the report</h2>
          <p className="mt-2 text-sm text-ink-600">
            You need at least one closed cohort and one completed outcome record
            for the generator to have data to render. If you are still onboarding
            your first cohort, seed a placeholder in the workspace and the report
            will render with the fields you have filled in so far.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace/accelerator"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Go to accelerator workspace
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              View accelerator pricing
            </Link>
          </div>
        </section>

        <p className="text-xs text-ink-500">
          Automated PDF export ships in a follow-up release. In the interim the
          workspace exports the same data as CSV from the Accelerator dashboard.
        </p>
      </div>
    </WorkspaceLayout>
  );
}
