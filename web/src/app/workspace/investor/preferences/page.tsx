import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Investor Preferences — Workspace — BlockID",
  description:
    "Set your investment mandate — stage, sector, geography, cheque size — so BlockID surfaces the right dealflow and digests for your fund.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorPreferencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/preferences");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/investor" className="hover:text-brand-600">
            Investor
          </Link>{" "}
          / <span className="text-ink-700">Preferences</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Investment preferences
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Your preferences tell BlockID what to surface. Set your stage focus,
            preferred sectors, geographic mandate, cheque size range and
            follow-on strategy — and the dealflow view, the weekly digest email
            and the AI shortlist will all rank against those filters instead of
            defaulting to the platform-wide feed. You can update these at any
            time and the next digest will pick up the change; there is no need
            to rebuild your saved searches.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">Fields covered</h2>
          <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>Stage: pre-seed, seed, Series A, growth.</li>
            <li>Sector allow-list and hard exclusions.</li>
            <li>Geography: Australia-only, ANZ, APAC or global.</li>
            <li>Cheque size band and typical ownership percentage target.</li>
            <li>Minimum SVI score threshold before a company shows up in dealflow.</li>
            <li>Digest cadence — daily, weekly, or off entirely.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Save your mandate</h2>
          <p className="mt-2 text-sm text-ink-600">
            The full preferences form ships in a follow-up release. Until then,
            you can adjust email cadence from the notifications page and pin
            companies to your watchlist to steer the AI shortlist.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace/notifications"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Notification settings
            </Link>
            <Link
              href="/workspace/investor/dealflow"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to dealflow
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
