// Investor Pack workspace surface (Goal 5B — T-1201 shell).
//
// Server component: auth-gated redirect to /auth/login. Renders the
// summary card (startup name + SVI grade + last generated date) plus the
// Preview and Generate PDF CTAs that hit the T-1201 preview route.
// Share-link creation is a T-1207 deliverable — represented here as a
// placeholder card only.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

export const metadata: Metadata = {
  title: "Investor Pack | BlockID",
  description:
    "One-click investor pack: SVI grade, cap table, traction, and a shareable teaser.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadOverview(userId: string, projectId: string | null): Promise<{
  startupName: string;
  sviGrade: string;
  lastGeneratedAt: string | null;
}> {
  const admin = getSupabaseAdmin();
  let startupName = "Untitled startup";
  let sviGrade = "—";
  let lastGeneratedAt: string | null = null;

  if (admin && projectId) {
    try {
      const { data: proj } = await admin
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .maybeSingle();
      if (proj && typeof (proj as any).name === "string" && (proj as any).name.trim()) {
        startupName = (proj as any).name;
      }
    } catch {
      /* ignore */
    }
  }

  // investor_pack_history table is a T-1205 migration deliverable. Query it
  // defensively so we degrade gracefully today when it does not exist.
  if (admin) {
    try {
      const q = admin
        .from("investor_pack_history")
        .select("generated_at")
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(1);
      const { data, error } = await q.maybeSingle();
      if (!error && data && typeof (data as any).generated_at === "string") {
        lastGeneratedAt = (data as any).generated_at;
      }
    } catch {
      /* table not yet migrated — stub silently */
    }
  }

  return { startupName, sviGrade, lastGeneratedAt };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default async function InvestorPackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor-pack");

  const projectId = await getProjectIdFromRequest();
  const overview = await loadOverview(user.id, projectId);

  const previewHref = "/api/investor-pack/preview";
  const downloadHref = "/api/investor-pack/preview?download=1";

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Investor pack</h1>
          <p className="text-sm text-ink-600 mt-1">
            One-click PDF with your SVI grade, cap table, traction, and a
            shareable one-page teaser.
          </p>
        </div>

        <section
          aria-labelledby="pack-summary"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 mb-4"
        >
          <h2 id="pack-summary" className="sr-only">
            Pack summary
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Startup
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink-800 dark:text-slate-100">
                {overview.startupName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                SVI grade
              </dt>
              <dd className="mt-1 text-lg font-semibold text-brand-700 dark:text-brand-300">
                {overview.sviGrade}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Last generated
              </dt>
              <dd className="mt-1 text-sm text-ink-700 dark:text-slate-200">
                {overview.lastGeneratedAt
                  ? new Date(overview.lastGeneratedAt).toLocaleString("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Not yet generated"}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={downloadHref}
              className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 px-4 py-2 text-sm font-medium text-white"
              download
            >
              Generate PDF
            </a>
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-ink-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Preview
            </a>
          </div>
        </section>

        <section
          aria-labelledby="share-link-future"
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-5 mb-4"
        >
          <h2
            id="share-link-future"
            className="text-sm font-semibold text-ink-800 dark:text-slate-100"
          >
            Share link
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Coming in T-1207: opaque share URL, view tracking, and investor
            reply capture from a hosted viewer at
            {" "}
            <code className="rounded bg-slate-200 dark:bg-slate-800 px-1 py-0.5 text-xs">
              /pack/&lt;shareId&gt;
            </code>
            .
          </p>
        </section>

        <NotFinancialAdvice kind="not_financial_advice" compact />
      </div>
    </WorkspaceLayout>
  );
}
