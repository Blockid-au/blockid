// Per-founder nudge loader — the data founder-weekly-digest and the G34-BT4
// monthly digest (EM19, lib/lifecycle/scan.ts) both hand to computeNextSteps().
// Lifted verbatim out of api/cron/founder-weekly-digest/route.ts so the two
// digests read "top-3 missing" the same way.

import "server-only";
import type { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeNextSteps,
  type NudgePhaseProgressRow,
  type NudgeSviScoreRow,
  type NudgeDataroomRow,
  type NudgeEvidenceItem,
  type NudgeProject,
  type NudgeComplianceStatus,
  type NudgeResult,
} from "@/lib/nudge/next-steps";
import { computeComplianceMissing } from "@/lib/nudge/compliance-status";

export interface FounderRow {
  id: string;
  email: string;
  display_name: string | null;
}

// ---------------------------------------------------------------------------

export interface NudgeBundle {
  projectId: string | null;
  result: NudgeResult;
}

export async function buildNudgeFor(
  // typed loosely to avoid the SupabaseClient generic drift here — the cron
  // is service-role only and this file is server-side.
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  founder: FounderRow,
): Promise<NudgeBundle> {
  // Active project (is_default).
  const { data: projectRow } = await supabase
    .from("projects")
    .select("id, growth_phase_current, growth_completion_pct")
    .eq("user_id", founder.id)
    .is("archived_at", null)
    .eq("is_default", true)
    .maybeSingle();
  const projectId: string | null = projectRow?.id ?? null;

  const nudgeProject: NudgeProject | null = projectRow
    ? {
        id: projectRow.id,
        growth_phase_current: projectRow.growth_phase_current ?? null,
        growth_completion_pct: projectRow.growth_completion_pct ?? null,
      }
    : null;

  // Phase progress — project-scoped first, then account-scoped fallback.
  let phaseProgress: NudgePhaseProgressRow[] = [];
  if (projectId) {
    const { data } = await supabase
      .from("startup_phase_progress")
      .select(
        "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
      )
      .eq("project_id", projectId)
      .order("phase_order", { ascending: true });
    phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
  }
  if (phaseProgress.length === 0) {
    const { data: accRow } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", founder.email)
      .maybeSingle();
    if (accRow?.id) {
      const { data } = await supabase
        .from("startup_phase_progress")
        .select(
          "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
        )
        .eq("account_id", accRow.id)
        .order("phase_order", { ascending: true });
      phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
    }
  }

  // Latest SVI analysis.
  let sviScores: NudgeSviScoreRow[] = [];
  const { data: sviRow } = await supabase
    .from("svi_analyses")
    .select("analysis_json")
    .eq("email", founder.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sviRow?.analysis_json) {
    sviScores = extractSviScores(sviRow.analysis_json);
  }

  // Data-room rows — user-scoped.
  const { data: drRows } = await supabase
    .from("dataroom_files")
    .select("svi_dimension, file_name, status, mime_type")
    .eq("user_id", founder.id);
  const dataroomRows: NudgeDataroomRow[] = (drRows ?? []) as NudgeDataroomRow[];

  // Evidence items — account-scoped.
  let evidenceItems: NudgeEvidenceItem[] = [];
  const { data: accForEv } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", founder.email)
    .maybeSingle();
  if (accForEv?.id) {
    const { data: evRows } = await supabase
      .from("evidence_items")
      .select("dimension, evidence_type, confidence_level")
      .eq("account_id", accForEv.id);
    evidenceItems = (evRows ?? []) as NudgeEvidenceItem[];
  }

  let complianceStatus: NudgeComplianceStatus | undefined;
  try {
    complianceStatus = await computeComplianceMissing(
      supabase,
      founder.id,
      projectId,
    );
  } catch (err) {
    console.warn(
      "[founder-weekly-digest] compliance snapshot failed",
      founder.email,
      err,
    );
  }

  const result = computeNextSteps({
    user: { id: founder.id, email: founder.email },
    project: nudgeProject,
    phaseProgress,
    sviScores,
    dataroomRows,
    evidenceItems,
    complianceStatus,
  });

  return { projectId, result };
}

// Same shape as /api/nudge/next-steps route.ts extractSviScores() — kept
// inline so this cron does not import from an API route file.
export function extractSviScores(json: unknown): NudgeSviScoreRow[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Record<string, unknown>;
  const out: NudgeSviScoreRow[] = [];

  const criteria = j.criteria;
  if (criteria && typeof criteria === "object") {
    for (const [key, value] of Object.entries(criteria)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        const score = typeof v.score === "number" ? v.score : null;
        if (score !== null) {
          out.push({ criterion_key: key, score });
        }
      }
    }
  }

  const dimensions = j.dimensions;
  if (Array.isArray(dimensions)) {
    for (const d of dimensions) {
      if (d && typeof d === "object") {
        const v = d as Record<string, unknown>;
        const dim =
          (typeof v.key === "string" && v.key) ||
          (typeof v.dimension === "string" && v.dimension) ||
          null;
        const score = typeof v.score === "number" ? v.score : null;
        if (dim && score !== null) {
          out.push({ dimension: dim, score });
        }
      }
    }
  }

  return out;
}
