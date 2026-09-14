// /workspace/listings/new — auth-gated stub for the founder-side "create a
// public listing" flow. The full submission form lands in a later scaffold;
// this page explains what a public listing means, what data is required,
// and links to the placeholder form target.

import type { Metadata } from "next";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

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

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
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
        </section>

        {/* S31-B: honest card — the form is not built; interest is recorded. */}
        <div className="mt-4 -mx-6">
          <NotAvailableYet
            feature="listing_submission_form"
            title="Submit a listing"
            userEmail={user.email}
            reason="The submission form is not built yet, so a ticker cannot be reserved from this page today. Your SVI grade is what the listing will show, so keeping it current is the useful preparation; Listing Readiness checks the rest."
            alternatives={[
              { href: "/workspace/listing-readiness", label: "Listing Readiness checklist" },
              { href: "/workspace/evaluation", label: "Refresh my SVI" },
              { href: "/startup-index", label: "Browse the AU Startup Index" },
            ]}
            backHref="/workspace"
          />
        </div>
      </div>
    </WorkspaceLayout>
  );
}
