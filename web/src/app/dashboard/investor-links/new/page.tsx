import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "New Investor Link — Dashboard — BlockID",
  description:
    "Create a new attributed share link so you can track exactly which investor viewed your investor-ready score and pack.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewInvestorLinkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/investor-links/new");

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/dashboard/investor-links" className="hover:text-brand-600">
            Investor Links
          </Link>{" "}
          / <span className="text-ink-700">New</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Create a new investor link
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Attributed investor links let you send one link per fund or angel and
            see exactly who viewed your score, how long they spent on each
            section, and whether they opened your investor pack. You can revoke a
            link at any time or set an expiry date so access closes on its own
            after your raise finishes. This is safer than emailing a public share
            URL to every investor on your list and it lets you follow up with the
            people who actually engaged.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">
            Before you create the link
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            You need an active score in your workspace first. Once you have a
            score, come back here to attach a name, email, fund and optional
            expiry date to a private share URL.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/svi"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Start a score
            </Link>
            <Link
              href="/dashboard/investor-links"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Back to links
            </Link>
          </div>
        </section>

        <p className="text-xs text-ink-500">
          The full builder form ships in a follow-up release. Until then you can
          share the public score URL from the score detail page and switch to an
          attributed link once this ships.
        </p>
      </div>
    </WorkspaceLayout>
  );
}
