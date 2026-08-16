// Investor Pack workspace surface (Goal 5B — T-1201 shell, T-1203 update).
//
// Server component: auth-gated redirect to /auth/login. Renders the
// summary card (startup name + SVI grade + last generated date) plus:
//   - One-click "Generate Investor Pack" CTA (T-1203, posts to /api/investor-pack/one-click)
//   - Last generated share link if investor_pack_shares has a row for this user
//   - Preview CTA (inline PDF viewer)
// The client form component (InvestorPackGenerateForm) handles the POST +
// progress state + success/error + share link display.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest, getCurrentProjectIsSandbox } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { InvestorPackGenerateForm } from "./generate/InvestorPackGenerateForm";

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
  lastShareId: string | null;
  lastDownloadUrl: string | null;
}> {
  const admin = getSupabaseAdmin();
  let startupName = "Untitled startup";
  let sviGrade = "—";
  let lastGeneratedAt: string | null = null;
  let lastShareId: string | null = null;
  let lastDownloadUrl: string | null = null;

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

  // Fetch SVI grade (latest report).
  if (admin) {
    try {
      const q = admin
        .from("svi_reports")
        .select("grade")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (projectId) q.eq("project_id", projectId);
      const { data: report } = await q.maybeSingle();
      if (report && typeof (report as any).grade === "string") {
        sviGrade = (report as any).grade;
      }
    } catch {
      /* ignore */
    }
  }

  // Fetch most recent share from investor_pack_shares (T-1203 table).
  if (admin) {
    try {
      const q = admin
        .from("investor_pack_shares")
        .select("share_id, created_at, expires_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data, error } = await q.maybeSingle();
      if (!error && data) {
        const row = data as any;
        // Only surface share links that haven't expired yet.
        if (
          typeof row.share_id === "string" &&
          new Date(row.expires_at).getTime() > Date.now()
        ) {
          lastShareId = row.share_id;
          lastDownloadUrl = `/api/investor-pack/download/${row.share_id}`;
          lastGeneratedAt =
            typeof row.created_at === "string" ? row.created_at : null;
        }
      }
    } catch {
      /* investor_pack_shares not yet migrated — degrade gracefully */
    }

    // Fallback: investor_pack_history (T-1205 deliverable, may not exist yet).
    if (!lastGeneratedAt) {
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
  }

  return { startupName, sviGrade, lastGeneratedAt, lastShareId, lastDownloadUrl };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default async function InvestorPackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor-pack");

  const isSandbox = await getCurrentProjectIsSandbox();

  const projectId = await getProjectIdFromRequest();
  const overview = await loadOverview(user.id, projectId);

  const previewHref = "/api/investor-pack/preview";

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Investor pack</h1>
          <p className="text-sm text-ink-600 mt-1">
            One-click PDF with your SVI grade, cap table, traction, and a
            shareable one-page teaser.
          </p>
        </div>

        {/* Summary card */}
        <section
          aria-labelledby="pack-summary"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 mb-4"
        >
          <h2 id="pack-summary" className="sr-only">
            Pack summary
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
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

          {/* One-click generate form (T-1203) */}
          <InvestorPackGenerateForm
            initialDownloadUrl={overview.lastDownloadUrl}
            previewHref={previewHref}
          />
        </section>

        {/* Last-generated share link (T-1203) */}
        {overview.lastDownloadUrl && (
          <section
            aria-labelledby="share-link-live"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 mb-4"
          >
            <h2
              id="share-link-live"
              className="text-sm font-semibold text-ink-800 dark:text-slate-100 mb-2"
            >
              Share link
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Share this link with investors. It expires 30 days after
              generation and allows direct PDF download — no login required.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs text-ink-700 dark:text-slate-200 break-all">
                {typeof window === "undefined"
                  ? overview.lastDownloadUrl
                  : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${overview.lastDownloadUrl}`}
              </code>
              <a
                href={overview.lastDownloadUrl}
                className="shrink-0 inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-ink-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                download
              >
                Download
              </a>
            </div>
          </section>
        )}

        <NotFinancialAdvice kind="not_financial_advice" compact />
      </div>
    </WorkspaceLayout>
  );
}
