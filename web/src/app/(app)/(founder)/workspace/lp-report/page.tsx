// /workspace/lp-report — founder-facing composer for accelerator LP-report
// contribution slots. Runs the pure `assessLpReportSlot()` policy library
// (P12c-lp-report-anon-policy) in-browser via `LpReportComposerClient`
// (P12c-lp-report-ui) so a founder can preview redactions + warnings before
// approving the slot for the reseller bundle. No API route, no persistence
// yet — the composer is a stateless preview tool while the sibling
// IR-portfolio-bundling agent finishes the durable slot-lock schema.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { LpReportComposerClient } from "./lp-report-composer-client";

export const metadata: Metadata = {
  title: "LP Quarterly Report | Workspace | BlockID",
  description:
    "Preview an anonymised founder-contribution slot for your accelerator's LP-report bundle before you commit to it.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/lp-report");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">
            LP Quarterly Report
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            You still control what fields surface — this preview shows what
            the reseller receives before your slot locks. Anonymisation
            enforces k-anonymity (default k=5) plus APP 6 + s766B Corps Act
            hedges. Withdraw the slot at any time before the bundle locks.
          </p>
        </header>
        <LpReportComposerClient />
      </div>
    </WorkspaceLayout>
  );
}
