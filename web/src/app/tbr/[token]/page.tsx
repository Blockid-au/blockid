// Public share page for a Trusted Business Report.
//
// Wave 25A — the founder mints a token via POST /api/svi/report/share and
// forwards this URL to an investor. No auth, no chrome. Renders the same
// <BusinessReportClient> the /workspace/reports/business page uses, but
// hydrated from the DB row (not localStorage).
//
// `?pdf=1` collapses the interactive chrome (share button, TOC nav) so the
// server-side Playwright PDF export in /api/svi/report/pdf produces a clean
// print artifact.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/reports/business/business-report-client";
import { TbrViewBeacon } from "@/components/tbr/tbr-view-beacon";
import { TbrLeadModal } from "@/components/tbr/tbr-lead-modal";
import { readSnapshotReportV2 } from "@/lib/report-v2/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Business Report — BlockID Startup Value Index",
  description:
    "Trusted Business Report: 8 SVI dimensions, 13 investor criteria, valuation range, and improvement roadmap.",
  robots: { index: false, follow: false },
};

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

interface DimState {
  status: string;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  marketBenchmark: string | null;
}

interface CriterionState {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
}

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  criterionStates?: CriterionState[];
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
  stage?: string | null;
  snapshotId?: string | null;
  sviTotal?: number | null;
}

interface SnapshotRow {
  id: string;
  project_id: string | null;
  svi_total: number | null;
  created_at: string;
  criterion_results: unknown;
  dim_results: unknown;
  dimension_scores: unknown;
  analysis_json: unknown;
}

function toDimStates(raw: unknown): Record<string, DimState> {
  const out: Record<string, DimState> = {};
  for (const k of DIM_KEYS) {
    const v = (raw && typeof raw === "object" ? (raw as Record<string, unknown>)[k] : null) as
      | Partial<DimState>
      | null
      | undefined;
    out[k] = {
      status: typeof v?.status === "string" ? v.status : "complete",
      score: typeof v?.score === "number" ? v.score : null,
      markdown: typeof v?.markdown === "string" ? v.markdown : null,
      insights: Array.isArray(v?.insights) ? (v?.insights as string[]) : [],
      priority:
        v?.priority === "high" || v?.priority === "medium" || v?.priority === "low"
          ? v.priority
          : null,
      marketBenchmark:
        typeof v?.marketBenchmark === "string" ? v.marketBenchmark : null,
    };
  }
  return out;
}

function fallbackFromScores(raw: unknown): Record<string, DimState> {
  const out: Record<string, DimState> = {};
  // `dimension_scores` is `{ftv: 71, …}` (a bare number per dim) on every
  // stored row today; the `{score, priority}` object shape is accepted too.
  const map = raw && typeof raw === "object" ? (raw as Record<string, number | { score?: number; priority?: string } | null>) : {};
  for (const k of DIM_KEYS) {
    const rawV = map[k];
    const v = typeof rawV === "number" ? { score: rawV, priority: undefined } : rawV && typeof rawV === "object" ? rawV : null;
    out[k] = {
      status: v && typeof v.score === "number" ? "complete" : "idle",
      score: typeof v?.score === "number" ? v.score : null,
      markdown: null,
      insights: [],
      priority:
        v?.priority === "high" || v?.priority === "medium" || v?.priority === "low"
          ? v.priority
          : null,
      marketBenchmark: null,
    };
  }
  return out;
}

async function fetchByToken(token: string): Promise<{ row: SnapshotRow; persisted: PersistedState } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("svi_snapshots")
    .select(
      "id, project_id, svi_total, created_at, criterion_results, dim_results, dimension_scores, analysis_json",
    )
    .eq("report_share_token", token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as SnapshotRow;
  const dimStates = row.dim_results
    ? toDimStates(row.dim_results)
    : fallbackFromScores(row.dimension_scores);
  const criterionStates = Array.isArray(row.criterion_results)
    ? (row.criterion_results as CriterionState[])
    : [];
  const meta = (row.analysis_json && typeof row.analysis_json === "object"
    ? (row.analysis_json as Record<string, unknown>)
    : {}) as { industry?: string | null; stageLabel?: string | null; totalMs?: number | null };
  const persisted: PersistedState = {
    savedAt: new Date(row.created_at).getTime(),
    dimStates,
    criterionStates,
    completed: DIM_KEYS.filter((k) => dimStates[k].score !== null).length,
    total: 8,
    totalMs: typeof meta.totalMs === "number" ? meta.totalMs : null,
    done: true,
    industry: meta.industry ?? null,
    stage: meta.stageLabel ?? null,
    sviTotal: typeof row.svi_total === "number" && Number.isFinite(row.svi_total) ? row.svi_total : null,
    snapshotId: row.id,
  };
  return { row, persisted };
}

/** G13-W1-R1: stored ReportV2 for the row (null until migration 0395 + a pipeline write). */
async function fetchStoredReportV2(snapshotId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  return readSnapshotReportV2(supabase, snapshotId);
}

export default async function TbrSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { token } = await params;
  const { pdf } = await searchParams;
  const result = await fetchByToken(token);
  if (!result) notFound();
  const initialReportV2 = await fetchStoredReportV2(result.row.id);

  const pdfMode = pdf === "1";
  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      <BusinessReportClient
        projectId={result.row.project_id ?? "shared"}
        initialData={result.persisted}
        initialReportV2={initialReportV2}
        shareToken={token}
        pdfMode={pdfMode}
      />
      {/* Wave 26A — anonymous open-tracking beacon. Never runs in PDF export. */}
      {!pdfMode && <TbrViewBeacon token={token} />}
      {/* Wave 27A — investor lead-capture modal. Anon only, never in PDF. */}
      {!pdfMode && <TbrLeadModal token={token} />}
      {!pdfMode && (
        <footer className="text-center text-[10px] text-ink-400 dark:text-ink-500 pb-6 px-4 print:hidden">
          This report is being viewed. The founder can see aggregate view counts (no PII).
        </footer>
      )}
    </div>
  );
}
