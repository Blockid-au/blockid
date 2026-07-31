import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject, getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { buildExitBenchmarkSection } from "@/lib/investor-pack/exit-benchmark-section";
import { ExitReadinessTile } from "@/components/dashboard/exit-readiness-tile";
import { AcquisitionWizardClient } from "@/components/dashboard/acquisition-wizard-client";
import { RedomicileWizardClient } from "@/components/dashboard/redomicile-wizard-client";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";

// P12b-tile — /dashboard/exit-readiness deep-link.
//
// Server-only. Pulls the founder's active project sector, calls the pack
// helper (pure, no I/O), and renders the ExitReadinessTile. Fallback to
// the full fixture is signalled by the tile so a founder in a niche sector
// isn't misled about how many comps we actually pulled.

export const metadata: Metadata = {
  title: "Exit readiness | BlockID",
  description:
    "AU comparable-exits benchmark for Chapter 12 (Exit / Beyond) — publicly-reported tech-exit anchors since 2010, sector-scoped where possible.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ExitReadinessDashboardPage() {
  await requireTierForPage({
    minTier: "growth",
    fromPath: "/dashboard/exit-readiness",
  });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/exit-readiness");

  const [isSandbox, project] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProject(user.id),
  ]);

  const projectSector = project?.industry ?? null;
  const section = buildExitBenchmarkSection({ sector: projectSector });

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-6 space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Chapter 12 · Exit / Beyond
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">
            Exit readiness benchmark
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Public AU tech-exit deals compiled from press releases, S-1s and
            ASX announcements. The CFO valuation report already runs this same
            fixture as a VC-Method cross-check; this page surfaces the full
            comparison table so you can walk investors through it.
          </p>
        </header>
        <ExitReadinessTile section={section} projectSector={projectSector} />
        <AcquisitionWizardClient />
        <RedomicileWizardClient />
      </div>
    </WorkspaceLayout>
  );
}
