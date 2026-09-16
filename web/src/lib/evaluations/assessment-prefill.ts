// Assessment prefill (G13-W4-D2, S-D2) — BA spec §A.3 block 4 "Prefill rules".
//
// Seeds the empty "My view" form from what BlockID already knows so the
// evaluator starts from the AI verdict instead of a blank sheet:
//
//   thesis_fit_pct    ← the seat's default mandate's `mandate_fit_scores.score`
//                       for this project (S-T2) — null when no mandate / no fit row.
//   dimension_ratings ← the latest snapshot's 8 dimension scores mapped to a
//                       1–5 rating (band edges below), stance "unsure": the
//                       evaluator confirms or overrides each one.
//   risks             ← the mandate fit `blockers` (high) + `gaps` (medium) and
//                       the gaps of the three lowest-scoring criteria in
//                       `criterion_results` (severity from the criterion
//                       score) — every item `source: "ai"` ("suggested by AI").
//   questions         ← the same three criteria's `next_action` sentences,
//                       rewritten as questions by a deterministic template
//                       (the haiku rewrite the spec mentions is a follow-up;
//                       the template costs nothing and never blocks render).
//
// `buildAssessmentPrefill()` is pure (unit-pinned); `prefillFromFit()` gathers
// the inputs through the service role and never throws — a missing 0393
// table or snapshot simply yields fewer seeds.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listMandates } from "@/lib/investors/mandates";
import { DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { snapshotDimScores } from "@/lib/evaluations/dossier";
import type { SnapshotCriterionState } from "@/lib/report-v2/adapter";
import {
  ASSESSMENT_DIM_KEYS,
  type AssessmentDimKey,
  type DimensionRating,
  type DimensionRatings,
  type FounderQuestion,
  type RiskItem,
} from "@/lib/evaluations/assessments";

export interface AssessmentPrefill {
  snapshotId: string | null;
  thesisFitPct: number | null;
  /** Which mandate the fit came from (for the "prefilled from <mandate>" hint). */
  mandateName: string | null;
  dimensionRatings: DimensionRatings;
  risks: RiskItem[];
  questionsForFounder: FounderQuestion[];
  /** true when at least one seed exists (the UI shows the "Prefilled from…" hint). */
  seeded: boolean;
}

export interface PrefillFitInput {
  score: number | null;
  gaps: string[];
  blockers: string[];
  mandateName: string | null;
}

export interface PrefillInputs {
  snapshotId: string | null;
  dimScores: Partial<Record<DimKey, number>>;
  criteria: Pick<SnapshotCriterionState, "key" | "title" | "primary_dimension" | "score" | "gaps" | "next_action">[];
  fit: PrefillFitInput | null;
}

const DIM_UPPER: Record<DimKey, AssessmentDimKey> = { tre: "TRE", mpc: "MPC", ftv: "FTV", ptd: "PTD", cgh: "CGH", iri: "IRI", lco: "LCO", svm: "SVM" };
const MAX_SEED_RISKS = 8;
const MAX_SEED_QUESTIONS = 5;
const LOWEST_CRITERIA = 3;

/** 0–100 dimension score → 1–5 rating (same edges as the report band ladder). */
export function scoreToRating(score: number): DimensionRating["rating"] {
  if (score >= 80) return 5;
  if (score >= 65) return 4;
  if (score >= 50) return 3;
  if (score >= 35) return 2;
  return 1;
}

function severityForScore(score: number): RiskItem["severity"] {
  if (score < 25) return "critical";
  if (score < 40) return "high";
  if (score < 60) return "medium";
  return "low";
}

function toDimKey(raw: string | null | undefined): AssessmentDimKey | undefined {
  if (!raw) return undefined;
  const up = raw.toUpperCase();
  return (ASSESSMENT_DIM_KEYS as readonly string[]).includes(up) ? (up as AssessmentDimKey) : undefined;
}

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** "Hire a second engineer by Q2" → "What is your plan to hire a second engineer by Q2?" */
export function nextActionToQuestion(nextAction: string): string | null {
  const t = nextAction.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (!t) return null;
  if (t.endsWith("?")) return clip(t, 300);
  const lower = t.charAt(0).toLowerCase() + t.slice(1);
  return clip(`What is your plan to ${lower}?`, 300);
}

/** Pure: seeds from the gathered inputs. */
export function buildAssessmentPrefill(input: PrefillInputs): AssessmentPrefill {
  const dimensionRatings: DimensionRatings = {};
  for (const k of DIM_ORDER) {
    const s = input.dimScores[k];
    if (typeof s === "number" && Number.isFinite(s)) dimensionRatings[DIM_UPPER[k]] = { rating: scoreToRating(s), stance: "unsure" };
  }

  const risks: RiskItem[] = [];
  const seen = new Set<string>();
  const pushRisk = (r: RiskItem) => {
    const key = r.title.toLowerCase();
    if (seen.has(key) || risks.length >= MAX_SEED_RISKS) return;
    seen.add(key);
    risks.push(r);
  };
  for (const b of input.fit?.blockers ?? []) if (b.trim()) pushRisk({ title: clip(b.trim(), 120), severity: "high", source: "ai", note: "Mandate blocker" });
  for (const g of input.fit?.gaps ?? []) if (g.trim()) pushRisk({ title: clip(g.trim(), 120), severity: "medium", source: "ai", note: "Mandate gap" });

  const lowest = [...input.criteria]
    .filter((c) => typeof c.score === "number" && Number.isFinite(c.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, LOWEST_CRITERIA);
  for (const c of lowest) {
    const dimension = toDimKey(c.primary_dimension);
    const gaps = Array.isArray(c.gaps) ? c.gaps.filter((g) => typeof g === "string" && g.trim()) : [];
    const first = gaps[0];
    if (first) pushRisk({ title: clip(first.trim(), 120), severity: severityForScore(c.score), dimension, source: "ai", note: clip(`${c.title} scored ${Math.round(c.score)}/100`, 500) });
  }

  const questionsForFounder: FounderQuestion[] = [];
  for (const c of lowest) {
    if (questionsForFounder.length >= MAX_SEED_QUESTIONS) break;
    const q = typeof c.next_action === "string" ? nextActionToQuestion(c.next_action) : null;
    if (q) questionsForFounder.push({ text: q, dimension: toDimKey(c.primary_dimension), sent_at: null });
  }

  const thesisFitPct = input.fit && typeof input.fit.score === "number" && Number.isFinite(input.fit.score) ? Math.max(0, Math.min(100, Math.round(input.fit.score))) : null;
  return {
    snapshotId: input.snapshotId,
    thesisFitPct,
    mandateName: input.fit?.mandateName ?? null,
    dimensionRatings,
    risks,
    questionsForFounder,
    seeded: thesisFitPct != null || Object.keys(dimensionRatings).length > 0 || risks.length > 0 || questionsForFounder.length > 0,
  };
}

type Row = Record<string, unknown>;
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function readFit(userId: string, projectId: string): Promise<PrefillFitInput | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const list = await listMandates(userId);
    const mandate = list.primary;
    if (!mandate) return null;
    const { data, error } = await supabase
      .from("mandate_fit_scores")
      .select("score, gaps, blockers")
      .eq("mandate_id", mandate.id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as Row;
    const score = typeof r.score === "number" ? r.score : typeof r.score === "string" ? Number(r.score) : NaN;
    return { score: Number.isFinite(score) ? score : null, gaps: strList(r.gaps), blockers: strList(r.blockers), mandateName: mandate.label || null };
  } catch {
    return null;
  }
}

async function readSnapshot(projectId: string): Promise<{ id: string | null; dimScores: Partial<Record<DimKey, number>>; criteria: PrefillInputs["criteria"] }> {
  const supabase = getSupabaseAdmin();
  const empty = { id: null, dimScores: {}, criteria: [] };
  if (!supabase) return empty;
  try {
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("id, criterion_results, dim_results, dimension_scores")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return empty;
    const row = data as Row;
    const criteria = Array.isArray(row.criterion_results)
      ? (row.criterion_results as Row[]).map((c) => ({
          key: String(c.key ?? ""),
          title: String(c.title ?? c.key ?? ""),
          primary_dimension: String(c.primary_dimension ?? ""),
          score: typeof c.score === "number" ? c.score : Number(c.score),
          gaps: strList(c.gaps),
          next_action: typeof c.next_action === "string" ? c.next_action : "",
        }))
      : [];
    return { id: typeof row.id === "string" ? row.id : null, dimScores: snapshotDimScores({ dim_results: row.dim_results, dimension_scores: row.dimension_scores }), criteria };
  } catch {
    return empty;
  }
}

/** Gather fit + snapshot for (seat, project) and build the seeds. Never throws. */
export async function prefillFromFit(input: { userId: string; projectId: string }): Promise<AssessmentPrefill> {
  const [fit, snap] = await Promise.all([readFit(input.userId, input.projectId), readSnapshot(input.projectId)]);
  return buildAssessmentPrefill({ snapshotId: snap.id, dimScores: snap.dimScores, criteria: snap.criteria, fit });
}
