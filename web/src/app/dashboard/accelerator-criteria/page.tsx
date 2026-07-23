// /dashboard/accelerator-criteria — full searchable list of all 30+ criteria
// across the 8 AU/global accelerators we curate. Promised in goal doc
// .claude/goals/au-accelerator-knowledge-base.md as the standalone browse view.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Rocket, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CriteriaBrowser } from "./criteria-browser";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Accelerator Criteria · BlockID",
  description: "Every published criterion across Antler, Startmate, YC, Techstars, SkyDeck, MVi, Cicada, and Blackbird — searchable and stage-filtered.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface KnowledgeRow {
  id: string;
  source: string;
  source_name: string;
  topic: string;
  criterion: string;
  description: string | null;
  stage_min: number;
  stage_max: number;
  sector: string;
  evidence_required: string[];
  tactic: string[];
  valuation_lift_pct: number;
  citations: string[];
}

export default async function AcceleratorCriteriaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/accelerator-criteria");

  const isSandbox = await getCurrentProjectIsSandbox();

  const supabase = getSupabaseAdmin();
  let rows: KnowledgeRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("active", true)
      .order("source", { ascending: true })
      .order("valuation_lift_pct", { ascending: false });
    rows = (data as KnowledgeRow[] | null) ?? [];
  }

  // Source summary chips for the hero
  const bySource = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const prev = bySource.get(r.source) ?? { name: r.source_name, count: 0 };
    prev.count++;
    bySource.set(r.source, prev);
  }
  const sourceChips = Array.from(bySource.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Link href="/dashboard/svi" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back to SVI dashboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Rocket className="h-6 w-6 text-purple-600" />
            Accelerator Criteria Library
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Every criterion published by Antler, Startmate, Y Combinator, Techstars,
            SkyDeck, MVi (Melbourne Uni), Cicada Innovations, and Blackbird that
            we&apos;ve curated into BlockID&apos;s knowledge base. Each row cites the
            originating source so you can verify and dig deeper.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {sourceChips.map((s) => (
              <span key={s.key} className="text-[11px] bg-muted text-muted-foreground px-2 py-1 rounded-full">
                {s.name} · {s.count}
              </span>
            ))}
          </div>
        </div>

        {/* Use callout */}
        <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/15 p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
          <div className="text-xs text-foreground">
            <p className="font-semibold">How to use this</p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              Filter by stage (where you are today) + sector + source. Each criterion lists the
              evidence you&apos;d need to mark it &ldquo;met&rdquo;, a 3-step tactic to lift it, and the
              estimated A$ valuation impact. To see how you score against the full set
              right now, run a fresh{" "}
              <Link href="/dashboard/svi" className="text-blue-600 hover:underline">SVI analysis</Link> —
              the Accelerator Readiness card on the dashboard maps you against every row below.
            </p>
            <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
              Edit the seed at <code className="bg-muted px-1 rounded">content/knowledge-base/au-accelerators-2026.json</code> + re-run <code className="bg-muted px-1 rounded">scripts/seed-knowledge-base.mjs</code> · <ExternalLink className="h-2.5 w-2.5" /> see goal doc <code className="bg-muted px-1 rounded">.claude/goals/au-accelerator-knowledge-base.md</code>
            </p>
          </div>
        </div>

        {/* Interactive browser */}
        <CriteriaBrowser rows={rows} />
      </div>
    </WorkspaceLayout>
  );
}
