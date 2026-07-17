import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Add Founder to Cohort — Workspace — BlockID",
  description:
    "Add a founder to the current accelerator cohort so their score, milestones and follow-on capital roll up into your LP reporting.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AddCohortFounderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/cohort/add");

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/accelerator/cohort" className="hover:text-brand-600">
            Cohort
          </Link>{" "}
          / <span className="text-ink-700">Add founder</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Add a founder to this cohort
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Adding a founder to a cohort links their startup score, evidence
            trail and milestone timeline to your programme. Once they accept the
            invite you can see their SVI progression alongside the rest of the
            batch, run comparison charts against past cohorts, and roll their
            outcome data into your LP quarterly report. Founders keep full
            ownership of their workspace, they just share a read-only view with
            you for the duration of the programme.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">You will need</h2>
          <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>Founder full name and business email.</li>
            <li>Startup name and industry vertical.</li>
            <li>Cohort batch tag (defaults to the current active batch).</li>
            <li>Optional: track or curriculum stream inside your programme.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Next step</h2>
          <p className="mt-2 text-sm text-ink-600">
            The invite form ships in a follow-up release. Until then, add
            founders directly from the cohort roster page — the modal there
            covers the same fields and produces the same invite email.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace/accelerator/cohort"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Back to cohort roster
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Compare accelerator plans
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
