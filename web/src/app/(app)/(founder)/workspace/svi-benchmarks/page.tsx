import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DimensionBenchmarkWidget } from "@/components/svi/dimension-benchmark-widget";

export const metadata: Metadata = {
  title: "SVI Benchmarks | BlockID",
  description: "Compare your SVI dimension scores against AU-stage peer cohort benchmarks.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SviBenchmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/svi-benchmarks");
  const isSandbox = await getCurrentProjectIsSandbox();
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink-800 dark:text-ink-100">
            Dimension Benchmarks
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            Per-dimension peer comparison against AU startups at the same stage.
          </p>
        </div>
        <DimensionBenchmarkWidget projectId="" />
      </div>
    </WorkspaceLayout>
  );
}
