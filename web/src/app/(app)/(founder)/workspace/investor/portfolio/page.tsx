import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Portfolio — Investor Workspace — BlockID",
  description:
    "Track your active positions, follow-on rounds and portfolio-level score movement across the BlockID investor workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorPortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/portfolio");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/investor" className="hover:text-brand-600">
            Investor
          </Link>{" "}
          / <span className="text-ink-700">Portfolio</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Portfolio
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Your portfolio view rolls up every active position you have added to
            the investor workspace. You get one place to see current SVI score
            per company, whether it is rising or falling since your last check,
            follow-on round activity, and a quick link into each founder&apos;s
            evidence trail so you can dig deeper before the next partner
            meeting. Positions can be added manually or auto-populated from your
            dealflow shortlist once a term sheet is signed.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">What you can do here</h2>
          <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>See SVI score movement per portfolio company since last visit.</li>
            <li>Filter by stage, cheque size, sector or ownership percentage.</li>
            <li>Flag companies for LP quarterly reporting and mark-ups.</li>
            <li>Export the whole book to CSV for your own fund admin system.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Start tracking</h2>
          <p className="mt-2 text-sm text-ink-600">
            The full portfolio grid ships in a follow-up release. Until then you
            can pin companies from your dealflow view and use the watchlist as a
            lightweight portfolio tracker.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace/investor/watchlist"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Open watchlist
            </Link>
            <Link
              href="/workspace/investor/dealflow"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Open dealflow
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
