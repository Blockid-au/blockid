import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects, getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AnalyzerForm } from "./analyzer-form";

export const metadata: Metadata = {
  title: "Code & Website Analyzer",
  description:
    "Analyze a GitHub repo and/or public website to surface a Product/Tech Depth (PTD) sub-score and a valuation adjuster.",
};

export const dynamic = "force-dynamic";

export default async function AnalyzerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/analyzer");

  const [projects, isSandbox] = await Promise.all([
    getUserProjects(user.id),
    getCurrentProjectIsSandbox(),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Code & Website Analyzer</h1>
          <p className="mt-1 text-sm text-ink-500">
            Feed a GitHub repository URL and/or a public website URL. We compute a
            Product/Tech Depth sub-score (contributes to your SVI PTD dimension) and
            return a valuation adjuster.
          </p>
        </div>
        <AnalyzerForm projects={projectOptions} />
      </div>
    </WorkspaceLayout>
  );
}
