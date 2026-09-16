// S-IA2 — ex /dashboard/analyzer ("Code & Website Analyzer"), now the
// "Code & web analyzer" section of /workspace/strategy/tech. Async server
// component: it loads the founder's project list for the form's project
// picker; the page owns auth, the shell and the member-aware tech panel.

import { getUserProjects } from "@/lib/projects";
import { AnalyzerForm } from "./analyzer-form";

export async function AnalyzerSection({ userId }: { userId: string }) {
  const projects = await getUserProjects(userId);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <section
      aria-labelledby="code-web-analyzer-heading"
      className="space-y-6 pt-6 border-t border-line-subtle"
    >
      <div>
        <h2 id="code-web-analyzer-heading" className="text-2xl font-bold text-ink-900">
          Code &amp; web analyzer
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Feed a GitHub repository URL and/or a public website URL. We compute a
          Product/Tech Depth sub-score (contributes to your SVI PTD dimension) and
          return a valuation adjuster.
        </p>
      </div>
      <AnalyzerForm projects={projectOptions} />
    </section>
  );
}
