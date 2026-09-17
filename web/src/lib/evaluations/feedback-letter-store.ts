// Founder feedback letter — Supabase reads / writes (G14-S34, migration
// 0406). Every function goes through the service-role client and is
// 42P01 / 42703-guarded (the 0314 / 0392 pattern): while 0406 is not
// applied `available` is false, the cron answers `table_missing`, the
// landing block is simply absent and the assessment form hides the opt-out
// checkbox. Nothing here throws on a missing relation.
//
// The pure aggregation / rendering lives in feedback-letter.ts; this module
// only moves rows.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ASSESSMENT_COLUMNS, mapAssessmentRow, type EvaluationAssessment } from "@/lib/evaluations/assessments";
import { DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { FeedbackAggregate, FeedbackNextAction, LatestSviForFeedback } from "@/lib/evaluations/feedback-letter";

type Row = Record<string, unknown>;

export type FeedbackLetterStatus = "draft" | "sent" | "opened";

export interface FeedbackLetterRow {
  id: string;
  projectId: string;
  founderUserId: string;
  evaluationIds: string[];
  k: number;
  orgCount: number;
  windowStart: string | null;
  windowEnd: string;
  aggregate: FeedbackAggregate;
  letterMd: string;
  letterMdVi: string | null;
  nextActions: FeedbackNextAction[];
  status: FeedbackLetterStatus;
  sentAt: string | null;
  openedAt: string | null;
  emailMessageId: string | null;
  createdAt: string;
}

export const FEEDBACK_LETTER_COLUMNS =
  "id, project_id, founder_user_id, evaluation_ids, k, org_count, window_start, window_end, aggregate, letter_md, letter_md_vi, next_actions, status, sent_at, opened_at, email_message_id, created_at";

/** The assessment columns plus the two 0406 columns the letter needs. */
const LETTER_ASSESSMENT_COLUMNS = `${ASSESSMENT_COLUMNS}, feedback_letter_id, feedback_opt_out`;

/** 42P01 (relation) / 42703 (column) / PostgREST schema-cache wording. */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST204") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find the");
}

/**
 * Bare per-dimension numbers from a snapshot row — the same shape
 * `snapshotDimScores` in dossier.ts reads (dim_results[k].score, else
 * dimension_scores[k] as a number or {score}). Re-implemented here so the
 * founder landing does not pull the whole dossier / report-pipeline graph
 * (a 3 s transform in the page test) for one lookup.
 */
export function snapshotDimScoresLite(row: { dim_results?: unknown; dimension_scores?: unknown }): Partial<Record<DimKey, number>> {
  const out: Partial<Record<DimKey, number>> = {};
  const dr = row.dim_results && typeof row.dim_results === "object" ? (row.dim_results as Record<string, Row>) : null;
  const ds = row.dimension_scores && typeof row.dimension_scores === "object" ? (row.dimension_scores as Record<string, unknown>) : {};
  for (const k of DIM_ORDER) {
    const v = dr?.[k];
    const raw = v && typeof v === "object" ? (v as Row).score : ds[k];
    const score = typeof raw === "number" ? raw : raw && typeof raw === "object" ? (raw as Row).score : raw;
    if (typeof score === "number" && Number.isFinite(score)) out[k] = score;
  }
  return out;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

export function mapLetterRow(row: Row): FeedbackLetterRow {
  const status = String(row.status ?? "draft");
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    founderUserId: String(row.founder_user_id),
    evaluationIds: Array.isArray(row.evaluation_ids) ? row.evaluation_ids.map(String) : [],
    k: num(row.k),
    orgCount: num(row.org_count),
    windowStart: str(row.window_start),
    windowEnd: String(row.window_end ?? ""),
    aggregate: (row.aggregate && typeof row.aggregate === "object" ? row.aggregate : {}) as FeedbackAggregate,
    letterMd: String(row.letter_md ?? ""),
    letterMdVi: str(row.letter_md_vi),
    nextActions: Array.isArray(row.next_actions) ? (row.next_actions as FeedbackNextAction[]) : [],
    status: status === "sent" || status === "opened" ? status : "draft",
    sentAt: str(row.sent_at),
    openedAt: str(row.opened_at),
    emailMessageId: str(row.email_message_id),
    createdAt: String(row.created_at ?? ""),
  };
}

// ─── Cron reads ─────────────────────────────────────────────────────────────

export interface CandidateProjectsResult {
  available: boolean;
  projectIds: string[];
}

/**
 * Projects with ≥ 1 submitted, not-opted-out assessment that no letter has
 * consumed yet (the partial index in 0406). The k-floor is decided later
 * on the full project read.
 */
export async function listLetterCandidateProjects(limit = 5000): Promise<CandidateProjectsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { available: false, projectIds: [] };
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select("project_id")
    .eq("status", "submitted")
    .eq("feedback_opt_out", false)
    .is("feedback_letter_id", null)
    .limit(limit);
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] candidate read failed", error);
    return { available: false, projectIds: [] };
  }
  const ids = new Set<string>();
  for (const r of (data ?? []) as Row[]) if (r.project_id) ids.add(String(r.project_id));
  return { available: true, projectIds: [...ids] };
}

/** Every assessment row (all seats, all versions) on the project, with the 0406 columns. */
export async function readProjectAssessments(projectId: string): Promise<{ available: boolean; rows: EvaluationAssessment[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { available: false, rows: [] };
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select(LETTER_ASSESSMENT_COLUMNS)
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(500);
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] project assessments read failed", error);
    return { available: false, rows: [] };
  }
  return { available: true, rows: ((data ?? []) as Row[]).map(mapAssessmentRow) };
}

export interface LetterFounder {
  userId: string;
  email: string | null;
  displayName: string | null;
  projectName: string | null;
  growthPhaseId: string | null;
}

/**
 * The founder who claimed an evaluation on this project (owner_kind
 * founder_claimed, newest claim wins) + their address and the project name.
 * Null when no founder has claimed — a letter needs an addressee.
 */
export async function resolveLetterFounder(projectId: string): Promise<LetterFounder | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data: evals, error } = await supabase
      .from("evaluations")
      .select("founder_user_id, claimed_at, projects:project_id (name, growth_phase_current)")
      .eq("project_id", projectId)
      .eq("owner_kind", "founder_claimed")
      .not("founder_user_id", "is", null)
      .order("claimed_at", { ascending: false })
      .limit(1);
    if (error || !evals?.length) return null;
    const row = evals[0] as Row & { projects?: Row | Row[] | null };
    const userId = str(row.founder_user_id);
    if (!userId) return null;
    const p = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {};
    const { data: user } = await supabase.from("app_users").select("id, email, display_name, erased_at").eq("id", userId).maybeSingle();
    const u = (user ?? null) as Row | null;
    if (!u || u.erased_at) return null;
    return {
      userId,
      email: str(u.email),
      displayName: str(u.display_name),
      projectName: str(p.name),
      growthPhaseId: str(p.growth_phase_current),
    };
  } catch (err) {
    console.warn("[blockid:feedback-letter] founder resolve failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Latest snapshot for the project → the recommender / CTO input (null when unscored). */
export async function readLatestSviForProject(projectId: string, growthPhaseId: string | null): Promise<LatestSviForFeedback | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("svi_total, stage, dim_results, dimension_scores")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Row;
    const total = row.svi_total;
    if (typeof total !== "number") return null;
    return {
      totalSVI: total,
      stage: num(row.stage, 0),
      subs: snapshotDimScoresLite({ dim_results: row.dim_results, dimension_scores: row.dimension_scores }),
      growthPhaseId,
    };
  } catch {
    return null;
  }
}

export async function latestLetterForProject(projectId: string): Promise<FeedbackLetterRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("founder_feedback_letters")
    .select(FEEDBACK_LETTER_COLUMNS)
    .eq("project_id", projectId)
    .order("window_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] latest-for-project read failed", error);
    return null;
  }
  return data ? mapLetterRow(data as Row) : null;
}

// ─── Cron writes ────────────────────────────────────────────────────────────

export interface InsertLetterInput {
  projectId: string;
  founderUserId: string;
  evaluationIds: string[];
  k: number;
  orgCount: number;
  windowStart: string | null;
  windowEnd: string;
  aggregate: FeedbackAggregate;
  letterMd: string;
  letterMdVi: string | null;
  nextActions: FeedbackNextAction[];
}

export type InsertLetterResult = { ok: true; letter: FeedbackLetterRow } | { ok: false; error: "dupe" | "unavailable" | "db_error"; message: string };

/** Insert one letter; `(project_id, window_end)` is UNIQUE so a re-run of the same window is a `dupe`. */
export async function insertLetter(input: InsertLetterInput): Promise<InsertLetterResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const { data, error } = await supabase
    .from("founder_feedback_letters")
    .insert({
      project_id: input.projectId,
      founder_user_id: input.founderUserId,
      evaluation_ids: input.evaluationIds,
      k: input.k,
      org_count: input.orgCount,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      aggregate: input.aggregate,
      letter_md: input.letterMd,
      letter_md_vi: input.letterMdVi,
      next_actions: input.nextActions,
      status: "draft",
    })
    .select(FEEDBACK_LETTER_COLUMNS)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "dupe", message: "A letter for this window already exists" };
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "founder_feedback_letters (0406) is not applied" };
    console.error("[blockid:feedback-letter] insert failed", error);
    return { ok: false, error: "db_error", message: error.message ?? "Insert failed" };
  }
  if (!data) return { ok: false, error: "db_error", message: "Insert returned no row" };
  return { ok: true, letter: mapLetterRow(data as Row) };
}

/** Stamp the consumed assessment rows with the letter id (idempotent). */
export async function stampAssessmentsWithLetter(letterId: string, assessmentIds: readonly string[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !assessmentIds.length) return false;
  const { error } = await supabase.from("evaluation_assessments").update({ feedback_letter_id: letterId }).in("id", [...assessmentIds]);
  if (error) {
    console.error("[blockid:feedback-letter] stamp failed", error);
    return false;
  }
  return true;
}

export async function markLetterSent(letterId: string, emailMessageId: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("founder_feedback_letters")
    .update({ status: "sent", sent_at: new Date().toISOString(), email_message_id: emailMessageId })
    .eq("id", letterId)
    .eq("status", "draft");
  return !error;
}

// ─── Founder reads ──────────────────────────────────────────────────────────

/** The founder's newest letter (any status), or null — also null while 0406 is missing. */
export async function latestLetterForFounder(founderUserId: string): Promise<FeedbackLetterRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !founderUserId) return null;
  const { data, error } = await supabase
    .from("founder_feedback_letters")
    .select(FEEDBACK_LETTER_COLUMNS)
    .eq("founder_user_id", founderUserId)
    .order("window_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] latest-for-founder read failed", error);
    return null;
  }
  return data ? mapLetterRow(data as Row) : null;
}

/**
 * First open: `status` → opened, `opened_at` stamped. Returns true only
 * when THIS call flipped the row (the caller emits the analytics event
 * once), false on a repeat open or a failure.
 */
export async function markLetterOpened(letterId: string, founderUserId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("founder_feedback_letters")
    .update({ status: "opened", opened_at: new Date().toISOString() })
    .eq("id", letterId)
    .eq("founder_user_id", founderUserId)
    .is("opened_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] mark opened failed", error);
    return false;
  }
  return Boolean(data);
}

// ─── Evaluator opt-out ──────────────────────────────────────────────────────

/** The seat's current opt-out flag on this evaluation; null while 0406 is missing or no row exists. */
export async function readFeedbackOptOut(evaluationId: string, assessorUserId: string): Promise<boolean | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select("feedback_opt_out")
    .eq("evaluation_id", evaluationId)
    .eq("assessor_user_id", assessorUserId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:feedback-letter] opt-out read failed", error);
    return null;
  }
  if (!data) return null;
  return (data as Row).feedback_opt_out === true;
}

export type SetOptOutResult = { ok: true; optOut: boolean; updated: number } | { ok: false; error: "unavailable" | "not_found" | "db_error"; message: string };

/** Toggle the seat's opt-out on EVERY version of its assessment on the evaluation (a revoke-style total flag). */
export async function setFeedbackOptOut(evaluationId: string, assessorUserId: string, optOut: boolean): Promise<SetOptOutResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .update({ feedback_opt_out: optOut })
    .eq("evaluation_id", evaluationId)
    .eq("assessor_user_id", assessorUserId)
    .select("id");
  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Feedback letters are not available on this environment yet" };
    console.error("[blockid:feedback-letter] opt-out write failed", error);
    return { ok: false, error: "db_error", message: error.message ?? "Update failed" };
  }
  const updated = Array.isArray(data) ? data.length : 0;
  if (!updated) return { ok: false, error: "not_found", message: "Save an assessment before changing its feedback setting" };
  return { ok: true, optOut, updated };
}
