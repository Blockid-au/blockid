// Wave 31D — Spanish public share page for a Trusted Business Report.
// Same auth-less fetch-by-token as /tbr/[token], but the shell UI renders
// in Spanish via locale="es".

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/business-report/business-report-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Informe de Negocio — BlockID Startup Value Index",
  description:
    "Informe de Negocio de Confianza: 8 dimensiones SVI, 13 criterios de inversor, rango de valoración y hoja de ruta de mejora.",
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
}

interface SnapshotRow {
  id: string;
  project_id: string | null;
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
  const map = raw && typeof raw === "object" ? (raw as Record<string, { score?: number; priority?: string }>) : {};
  for (const k of DIM_KEYS) {
    const v = map[k];
    out[k] = {
      status: v ? "complete" : "idle",
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
      "id, project_id, created_at, criterion_results, dim_results, dimension_scores, analysis_json",
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
  };
  return { row, persisted };
}

export default async function EsTbrSharePage({
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

  const pdfMode = pdf === "1";
  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      <BusinessReportClient
        projectId={result.row.project_id ?? "shared"}
        initialData={result.persisted}
        shareToken={token}
        pdfMode={pdfMode}
        locale="es"
      />
    </div>
  );
}
