// /workspace/listings/new — auth-gated stub for the founder-side "create a
// public listing" flow. The full submission form lands in a later scaffold;
// this page explains what a public listing means, what data is required,
// and links to the placeholder form target.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "List your startup · BlockID",
  description:
    "Publish your startup on the AU Startup Index. Get a ticker, an SVI grade, and a shareable profile URL.",
  robots: { index: false, follow: false },
};

export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/listings/new");

  return (
    <WorkspaceLayout user={user}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-500">
            AU Startup Index
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            List your startup
          </h1>
        </header>

        <section className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            A public listing turns your BlockID.au workspace profile into a
            crawlable, shareable startup page at{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
              blockid.au/listings/&lt;TICKER&gt;
            </code>
            . Every listing publishes the fields you opt in — company name,
            sector, stage, HQ state, one-liner, latest raise, and your current
            SVI grade — and nothing more. Financial detail like cap-table
            splits, evidence attachments, and internal notes stay in your
            workspace.
          </p>
          <p>
            When you submit, we generate a 3-6 character ASX-style ticker from
            your startup name and reserve it for you. If a name collides with
            an existing listing, the ticker gets a numeric suffix. The listing
            is created private by default; you toggle it public from your
            workspace once you&apos;ve reviewed the preview. Toggling private
            takes it out of the index within minutes.
          </p>
          <p>
            SVI scores render automatically from your most recent SVI report
            and refresh on the daily public-listing cron. There is no manual
            scoring — the number you see on your listing is exactly what your
            workspace shows.
          </p>
          <p>
            The full submission form is on the way. Once it&apos;s wired up
            you&apos;ll capture the required fields on this page and the
            ticker will land in your workspace within seconds.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 dark:border-slate-700 dark:bg-slate-900/40">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Coming soon
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The submission form ships in the next scaffold. Meanwhile, keep
            your SVI report up to date so the moment you publish a listing,
            the page has a live grade ready to render.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/workspace/evaluation"
              className="inline-flex h-10 items-center rounded-full bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
            >
              Refresh my SVI
            </Link>
            <Link
              href="/index"
              className="inline-flex h-10 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Browse the index
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
