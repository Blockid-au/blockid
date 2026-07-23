import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Invite Client — Advisor — BlockID",
  description:
    "Invite a founder client to your advisor roster so their score, milestones and evidence trail flow into your practice.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InviteClientPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/advisor/roster/invite");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/advisor/roster" className="hover:text-brand-600">
            Roster
          </Link>{" "}
          / <span className="text-ink-700">Invite client</span>
        </nav>

        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            Invite a client to your advisor roster
          </h1>
          <p className="mt-2 text-sm text-ink-600 leading-relaxed">
            Inviting a founder client links their BlockID workspace to your
            advisor dashboard. Once they accept, you can leave private notes
            against their score, see which milestones are slipping, receive a
            weekly digest of movement across your book, and share benchmark
            snapshots without having to log into their workspace. Clients keep
            full ownership of their data — they are simply granting a scoped,
            revocable view to you as their advisor.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">You will need</h2>
          <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>Client full name and business email.</li>
            <li>Optional: engagement type (retainer, project, mentor).</li>
            <li>Optional: private note only you can see against the client record.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Next step</h2>
          <p className="mt-2 text-sm text-ink-600">
            The full invite composer ships in a follow-up release. In the
            meantime, from the roster page you can add a client by email and the
            system will send the same acceptance flow.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace/advisor/roster"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Back to roster
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Compare advisor plans
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
