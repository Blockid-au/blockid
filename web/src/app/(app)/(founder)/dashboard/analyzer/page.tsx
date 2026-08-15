import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects } from "@/lib/projects";
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

  const projects = await getUserProjects(user.id);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Code &amp; Website Analyzer
      </h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Feed a GitHub repository URL and/or a public website URL. We compute a
        Product/Tech Depth sub-score (contributes to your SVI PTD dimension) and
        return a valuation adjuster.
      </p>
      <div className="mt-6">
        <AnalyzerForm projects={projectOptions} />
      </div>
    </div>
  );
}
