import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { SavedReportClient } from "./saved-report-client";

export const metadata: Metadata = {
  title: "Saved Report",
  description: "Review your saved SVI analysis report.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SavedReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/login?next=/workspace/reports/${id}`);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <WorkspaceLayout user={user}>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-ink-600">Database unavailable. Please try again later.</p>
        </div>
      </WorkspaceLayout>
    );
  }

  // Load analysis
  const { data: analysis } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, raw_input, analysis_json, created_at, input_type")
    .eq("id", id)
    .single();

  // Verify ownership
  if (!analysis || analysis.email !== user.email) {
    return (
      <WorkspaceLayout user={user}>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 px-8 py-12">
            <h1 className="text-xl font-bold text-ink-800 mb-2">Report Not Found</h1>
            <p className="text-sm text-ink-600 mb-6">
              This report doesn't exist or you don't have access to it.
            </p>
            <Link
              href="/workspace/reports"
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Back to Reports
            </Link>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  // Load saved report sections
  const { data: savedSections } = await supabase
    .from("report_sections")
    .select("section_id, depth, content, word_count, credits_cost, created_at")
    .eq("analysis_id", id)
    .order("created_at", { ascending: true });

  return (
    <WorkspaceLayout user={user}>
      <SavedReportClient
        analysis={{
          id: analysis.id as string,
          totalSvi: analysis.total_svi as number,
          createdAt: analysis.created_at as string,
          inputType: (analysis.input_type as string) ?? "startup",
          analysisJson: analysis.analysis_json as Record<string, unknown> | null,
        }}
        savedSections={
          (savedSections ?? []).map((s) => ({
            sectionId: s.section_id as string,
            depth: s.depth as string,
            content: s.content as string,
            wordCount: s.word_count as number | null,
            creditsCost: s.credits_cost as number | null,
            createdAt: s.created_at as string,
          }))
        }
        analysisId={id}
      />
    </WorkspaceLayout>
  );
}
