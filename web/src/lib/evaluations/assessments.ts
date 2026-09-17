// Evaluator Assessment — shapes, masking, reads AND writes (G13-W2-D1 S-D1
// read side · G13-W4-D2 S-D2 write side).
//
// One `evaluation_assessments` row (migration 0392) is one evaluator seat's
// structured verdict on one evaluation, versioned (latest = current). This
// module owns the shapes (Appendix 2 of the BA spec, as Zod), the row
// mapper, the write side (`upsertAssessment` · `shareAssessment` ·
// `revokeAssessmentShare`, each writing its §C.2 audit row) and the ONLY
// code path that decides what each viewer may see (§C.1):
//
//   assessor    the seat who wrote it → every field.
//   org_member  another seat of the same Firm/Program org → every field
//               EXCEPT private_notes (never returned to other seats).
//   founder     the founder who claimed the evaluation → nothing until
//               shared_with_founder_at is set, then ONLY the ticked subset of
//               FOUNDER_SHARE_ALLOW_LIST. decision / conviction /
//               private_notes / valuation_view / thesis_fit_pct / status are
//               never emitted to a founder, whatever was ticked.
//
// `maskAssessment()` is pure so the allow-list is unit-pinned
// (assessments.test.ts) independently of Supabase. Reads go through the
// service-role client and are 42P01-guarded: while 0392 is not applied the
// result says `available: false` and the dossier renders "not available
// yet" instead of failing (risk 2 in the goal doc).

import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { emitEventSafe } from "@/lib/analytics/server";

// ─── Appendix 2 shapes ──────────────────────────────────────────────────────

export const ASSESSMENT_DIM_KEYS = ["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"] as const;
export type AssessmentDimKey = (typeof ASSESSMENT_DIM_KEYS)[number];

export const ASSESSMENT_DECISIONS = ["pass", "track", "proceed"] as const;
export type AssessmentDecision = (typeof ASSESSMENT_DECISIONS)[number];

export const ASSESSMENT_STATUSES = ["draft", "submitted"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/**
 * G14-S37: the evaluator FTV flags (jsonb, inside dimension_ratings.FTV —
 * no migration). `references_checked` lifts the founder execution rubric
 * cap (lib/founder/execution.ts); the other three are recorded for the
 * feedback letter and the dossier. Append-only: every key optional.
 */
export const DIMENSION_FLAG_KEYS = ["key_person_risk", "full_time", "complementary_skills", "references_checked"] as const;
export type DimensionFlagKey = (typeof DIMENSION_FLAG_KEYS)[number];

export const dimensionFlagsSchema = z
  .object({
    key_person_risk: z.boolean().optional(),
    full_time: z.boolean().optional(),
    complementary_skills: z.boolean().optional(),
    references_checked: z.boolean().optional(),
  })
  .strict();
export type DimensionFlags = z.infer<typeof dimensionFlagsSchema>;

export const dimensionRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  stance: z.enum(["agree", "disagree", "unsure"]),
  note: z.string().max(500).optional(),
  /** G14-S37 — FTV only in the UI; tolerated on any dimension. */
  flags: dimensionFlagsSchema.optional(),
});
export type DimensionRating = z.infer<typeof dimensionRatingSchema>;

export const dimensionRatingsSchema = z
  .object(Object.fromEntries(ASSESSMENT_DIM_KEYS.map((k) => [k, dimensionRatingSchema.optional()])) as Record<AssessmentDimKey, z.ZodOptional<typeof dimensionRatingSchema>>)
  .partial();
export type DimensionRatings = z.infer<typeof dimensionRatingsSchema>;

export const riskItemSchema = z.object({
  title: z.string().min(1).max(120),
  severity: z.enum(["low", "medium", "high", "critical"]),
  dimension: z.enum(ASSESSMENT_DIM_KEYS).optional(),
  note: z.string().max(500).optional(),
  source: z.enum(["ai", "evaluator"]),
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const founderQuestionSchema = z.object({
  text: z.string().min(1).max(300),
  dimension: z.enum(ASSESSMENT_DIM_KEYS).optional(),
  sent_at: z.string().nullable().optional(),
});
export type FounderQuestion = z.infer<typeof founderQuestionSchema>;

export const valuationViewSchema = z.object({
  low_aud: z.number().nonnegative().optional(),
  high_aud: z.number().nonnegative().optional(),
  method_note: z.string().max(300).optional(),
});
export type ValuationView = z.infer<typeof valuationViewSchema>;

export const criterionRatingSchema = z.object({
  stance: z.enum(["agree", "disagree", "unsure"]),
  note: z.string().max(500).optional(),
});
export type CriterionRatings = Record<string, z.infer<typeof criterionRatingSchema>>;

// ─── Row shape ──────────────────────────────────────────────────────────────

/** The full row — only ever handed to the assessor (see maskAssessment). */
export interface EvaluationAssessment {
  id: string;
  evaluationId: string;
  projectId: string;
  assessorUserId: string;
  orgId: string | null;
  snapshotId: string | null;
  version: number;
  status: AssessmentStatus;
  decision: AssessmentDecision | null;
  conviction: number | null;
  thesisFitPct: number | null;
  dimensionRatings: DimensionRatings;
  criterionRatings: CriterionRatings;
  valuationView: ValuationView | null;
  risks: RiskItem[];
  questionsForFounder: FounderQuestion[];
  privateNotes: string | null;
  sharedNotes: string | null;
  sharedFields: FounderShareField[];
  sharedWithFounderAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * G14-S34 (0406) — only present when the caller selected the column
   * (feedback-letter-store.ts); the dossier read never does, so the
   * dossier keeps working before 0406 is applied.
   */
  feedbackOptOut?: boolean;
  /** G14-S34 (0406) — the letter that consumed this row, when selected. */
  feedbackLetterId?: string | null;
}

/** What another seat of the same org receives: everything but private_notes. */
export type SeatVisibleAssessment = Omit<EvaluationAssessment, "privateNotes"> & { privateNotes: null };

/** §C.1 — the ONLY sections a founder can ever be shown. */
export const FOUNDER_SHARE_ALLOW_LIST = ["dimension_ratings", "risks", "questions_for_founder", "shared_notes"] as const;
export type FounderShareField = (typeof FOUNDER_SHARE_ALLOW_LIST)[number];

/** Fields that must never reach a founder payload — pinned by the test. */
export const FOUNDER_FORBIDDEN_FIELDS = [
  "decision",
  "conviction",
  "privateNotes",
  "valuationView",
  "thesisFitPct",
  "status",
  "criterionRatings",
  "assessorUserId",
  "orgId",
  "submittedAt",
] as const;

export interface FounderVisibleAssessment {
  id: string;
  evaluationId: string;
  version: number;
  sharedWithFounderAt: string;
  sharedFields: FounderShareField[];
  dimensionRatings?: DimensionRatings;
  risks?: RiskItem[];
  questionsForFounder?: FounderQuestion[];
  sharedNotes?: string | null;
}

export type AssessmentViewerRole = "assessor" | "org_member" | "founder";

export interface AssessmentViewer {
  userId: string;
  role: AssessmentViewerRole;
}

/** One line of the version timeline (never carries notes). */
export interface AssessmentHistoryEntry {
  id: string;
  version: number;
  status: AssessmentStatus;
  decision: AssessmentDecision | null;
  conviction: number | null;
  snapshotId: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface AssessmentReadResult {
  /** false while migration 0392 is not applied (42P01) or the admin client is missing. */
  available: boolean;
  /** The viewer's own current (highest-version) row — assessor only. */
  mine: EvaluationAssessment | null;
  /** Version timeline for the viewer's seat — assessor only. */
  history: AssessmentHistoryEntry[];
  /** Founder viewer: the shared projection, or null when nothing is shared. */
  sharedWithFounder: FounderVisibleAssessment | null;
}

// ─── Mapping ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export const ASSESSMENT_COLUMNS =
  "id, evaluation_id, project_id, assessor_user_id, org_id, snapshot_id, version, status, decision, conviction, thesis_fit_pct, dimension_ratings, criterion_ratings, valuation_view, risks, questions_for_founder, private_notes, shared_notes, shared_fields, shared_with_founder_at, submitted_at, created_at, updated_at";

const str = (v: unknown): string | null => (v == null ? null : String(v));
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function safeParseArray<T>(schema: z.ZodType<T>, v: unknown): T[] {
  const out: T[] = [];
  for (const x of arr(v)) {
    const r = schema.safeParse(x);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function mapAssessmentRow(row: Row): EvaluationAssessment {
  const status = String(row.status ?? "draft");
  const decision = str(row.decision);
  const ratings = dimensionRatingsSchema.safeParse(obj(row.dimension_ratings));
  const valuation = row.valuation_view == null ? null : valuationViewSchema.safeParse(obj(row.valuation_view));
  const criterionRatings: CriterionRatings = {};
  for (const [k, v] of Object.entries(obj(row.criterion_ratings))) {
    const parsed = criterionRatingSchema.safeParse(v);
    if (parsed.success) criterionRatings[k] = parsed.data;
  }
  const sharedFields = arr(row.shared_fields)
    .map(String)
    .filter((f): f is FounderShareField => (FOUNDER_SHARE_ALLOW_LIST as readonly string[]).includes(f));
  const feedback: Pick<EvaluationAssessment, "feedbackOptOut" | "feedbackLetterId"> = {};
  if ("feedback_opt_out" in row) feedback.feedbackOptOut = row.feedback_opt_out === true;
  if ("feedback_letter_id" in row) feedback.feedbackLetterId = str(row.feedback_letter_id);
  return {
    ...feedback,
    id: String(row.id),
    evaluationId: String(row.evaluation_id),
    projectId: String(row.project_id),
    assessorUserId: String(row.assessor_user_id),
    orgId: str(row.org_id),
    snapshotId: str(row.snapshot_id),
    version: int(row.version) ?? 1,
    status: (ASSESSMENT_STATUSES as readonly string[]).includes(status) ? (status as AssessmentStatus) : "draft",
    decision: decision && (ASSESSMENT_DECISIONS as readonly string[]).includes(decision) ? (decision as AssessmentDecision) : null,
    conviction: int(row.conviction),
    thesisFitPct: int(row.thesis_fit_pct),
    dimensionRatings: ratings.success ? ratings.data : {},
    criterionRatings,
    valuationView: valuation && valuation.success ? valuation.data : null,
    risks: safeParseArray(riskItemSchema, row.risks),
    questionsForFounder: safeParseArray(founderQuestionSchema, row.questions_for_founder),
    privateNotes: str(row.private_notes),
    sharedNotes: str(row.shared_notes),
    sharedFields,
    sharedWithFounderAt: str(row.shared_with_founder_at),
    submittedAt: str(row.submitted_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function toHistoryEntry(a: EvaluationAssessment): AssessmentHistoryEntry {
  return {
    id: a.id,
    version: a.version,
    status: a.status,
    decision: a.decision,
    conviction: a.conviction,
    snapshotId: a.snapshotId,
    submittedAt: a.submittedAt,
    updatedAt: a.updatedAt,
  };
}

// ─── Masking (pure) ─────────────────────────────────────────────────────────

/**
 * Founder projection: null until shared; then only the ticked allow-listed
 * sections. Mirrors `v_assessment_founder_view` in 0392 column for column.
 */
export function toFounderVisible(a: EvaluationAssessment): FounderVisibleAssessment | null {
  if (!a.sharedWithFounderAt) return null;
  const out: FounderVisibleAssessment = {
    id: a.id,
    evaluationId: a.evaluationId,
    version: a.version,
    sharedWithFounderAt: a.sharedWithFounderAt,
    sharedFields: [...a.sharedFields],
  };
  if (a.sharedFields.includes("dimension_ratings")) out.dimensionRatings = a.dimensionRatings;
  if (a.sharedFields.includes("risks")) out.risks = a.risks;
  if (a.sharedFields.includes("questions_for_founder")) out.questionsForFounder = a.questionsForFounder;
  if (a.sharedFields.includes("shared_notes")) out.sharedNotes = a.sharedNotes;
  return out;
}

export function toSeatVisible(a: EvaluationAssessment): SeatVisibleAssessment {
  return { ...a, privateNotes: null };
}

export type MaskedAssessment =
  | { role: "assessor"; assessment: EvaluationAssessment }
  | { role: "org_member"; assessment: SeatVisibleAssessment }
  | { role: "founder"; assessment: FounderVisibleAssessment | null };

/** The single place that decides what a viewer role receives. */
export function maskAssessment(a: EvaluationAssessment, role: AssessmentViewerRole): MaskedAssessment {
  switch (role) {
    case "assessor":
      return { role, assessment: a };
    case "org_member":
      return { role, assessment: toSeatVisible(a) };
    case "founder":
    default:
      return { role: "founder", assessment: toFounderVisible(a) };
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find the table");
}

const EMPTY = (available: boolean): AssessmentReadResult => ({ available, mine: null, history: [], sharedWithFounder: null });

/**
 * Every assessment row on one evaluation, newest version first, already
 * masked for `viewer`. The caller (dossier loader) has ALREADY proven the
 * viewer may see the evaluation; this function never re-checks ownership of
 * the evaluation, only of the assessment rows it returns:
 *
 *   assessor  → own rows only (mine = highest version, history = all versions)
 *   founder   → the newest shared row, allow-listed; never `mine`
 *   org_member → reserved for S-D3 (org tables are in the deferred
 *                portal-core migration) — today treated like assessor for
 *                own rows and returns no other seats.
 */
export async function getAssessment(evaluationId: string, viewer: AssessmentViewer): Promise<AssessmentReadResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return EMPTY(false);
  let query = supabase
    .from("evaluation_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("evaluation_id", evaluationId)
    .order("version", { ascending: false });
  // An assessor only ever needs their own seat's versions — filtering here
  // keeps a busy Firm evaluation (many seats × versions) from pushing the
  // caller's rows past the page (W2 review).
  if (viewer.role === "assessor") query = query.eq("assessor_user_id", viewer.userId);
  const { data, error } = await query.limit(50);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:assessments] read failed", error);
    return EMPTY(false);
  }
  const rows = ((data ?? []) as Row[]).map(mapAssessmentRow);

  if (viewer.role === "founder") {
    const shared = rows
      .filter((r) => r.sharedWithFounderAt)
      .sort((a, b) => (b.sharedWithFounderAt ?? "").localeCompare(a.sharedWithFounderAt ?? ""))[0];
    return { available: true, mine: null, history: [], sharedWithFounder: shared ? toFounderVisible(shared) : null };
  }

  const own = rows.filter((r) => r.assessorUserId === viewer.userId);
  return {
    available: true,
    mine: own[0] ?? null,
    history: own.map(toHistoryEntry),
    sharedWithFounder: null,
  };
}

/** Version timeline only (no notes) — assessor's own seat. */
export async function listAssessmentHistory(evaluationId: string, viewer: AssessmentViewer): Promise<AssessmentHistoryEntry[]> {
  if (viewer.role === "founder") return [];
  const r = await getAssessment(evaluationId, viewer);
  return r.history;
}

// ─── Writes (S-D2) ──────────────────────────────────────────────────────────
//
// Versioning (Appendix 1, S3/S5):
//   * no row yet                → insert v1
//   * current row is a draft    → update that row in place (autosave)
//   * current row is submitted  → insert v(n+1) pre-filled from v(n) merged
//                                 with the patch ("Update my assessment")
//   * submit                    → same rules, plus decision + conviction are
//                                 required and submitted_at is stamped
// A new version never inherits the previous version's share: what the
// founder was shown stays attached to the row it was shared from, and
// `revokeAssessmentShare` clears EVERY row of the seat so a revoke is total.

/** ≤ 20 kB per note (0392 CHECK, §C.6). */
export const NOTE_MAX_CHARS = 20_000;
export const MAX_RISKS = 30;
export const MAX_QUESTIONS = 30;

const criterionRatingsSchema = z.record(z.string().min(1).max(40), criterionRatingSchema);

/** PUT body — everything optional (Appendix 1 `AssessmentDraft`); `status` picks draft vs submit. */
export const assessmentDraftSchema = z
  .object({
    status: z.enum(ASSESSMENT_STATUSES).optional(),
    snapshot_id: z.string().uuid().nullable().optional(),
    decision: z.enum(ASSESSMENT_DECISIONS).nullable().optional(),
    conviction: z.number().int().min(1).max(5).nullable().optional(),
    thesis_fit_pct: z.number().int().min(0).max(100).nullable().optional(),
    dimension_ratings: dimensionRatingsSchema.optional(),
    criterion_ratings: criterionRatingsSchema.optional(),
    valuation_view: valuationViewSchema.nullable().optional(),
    risks: z.array(riskItemSchema).max(MAX_RISKS).optional(),
    questions_for_founder: z.array(founderQuestionSchema).max(MAX_QUESTIONS).optional(),
    private_notes: z.string().max(NOTE_MAX_CHARS).nullable().optional(),
    shared_notes: z.string().max(NOTE_MAX_CHARS).nullable().optional(),
  })
  .strict();
export type AssessmentDraftInput = z.infer<typeof assessmentDraftSchema>;

/** POST …/share body. */
export const assessmentShareSchema = z
  .object({
    fields: z.array(z.enum(FOUNDER_SHARE_ALLOW_LIST)).min(1).max(FOUNDER_SHARE_ALLOW_LIST.length),
  })
  .strict();

export interface AssessmentWriteContext {
  evaluationId: string;
  projectId: string;
  assessorUserId: string;
  orgId?: string | null;
  /** G14-S38: shown in the `assessment.submitted` webhook (Slack / Affinity / Airtable). */
  startupName?: string | null;
}

export type AssessmentWriteError = "unavailable" | "missing_decision" | "missing_conviction" | "db_error" | "not_found";

export type UpsertAssessmentResult =
  | { ok: true; assessment: EvaluationAssessment; created: boolean; version: number; history: AssessmentHistoryEntry[] }
  | { ok: false; error: AssessmentWriteError; message: string };

/** Column patch built from a validated draft — only keys present in the input. */
export function draftToColumns(input: AssessmentDraftInput): Row {
  const out: Row = {};
  if (input.snapshot_id !== undefined) out.snapshot_id = input.snapshot_id;
  if (input.decision !== undefined) out.decision = input.decision;
  if (input.conviction !== undefined) out.conviction = input.conviction;
  if (input.thesis_fit_pct !== undefined) out.thesis_fit_pct = input.thesis_fit_pct;
  if (input.dimension_ratings !== undefined) out.dimension_ratings = input.dimension_ratings;
  if (input.criterion_ratings !== undefined) out.criterion_ratings = input.criterion_ratings;
  if (input.valuation_view !== undefined) out.valuation_view = input.valuation_view;
  if (input.risks !== undefined) out.risks = input.risks;
  if (input.questions_for_founder !== undefined) out.questions_for_founder = input.questions_for_founder;
  if (input.private_notes !== undefined) out.private_notes = input.private_notes;
  if (input.shared_notes !== undefined) out.shared_notes = input.shared_notes;
  return out;
}

/** The previous version's content as an insert base (never its share state, id or timestamps). */
export function carryForwardColumns(prev: EvaluationAssessment): Row {
  return {
    snapshot_id: prev.snapshotId,
    decision: prev.decision,
    conviction: prev.conviction,
    thesis_fit_pct: prev.thesisFitPct,
    dimension_ratings: prev.dimensionRatings,
    criterion_ratings: prev.criterionRatings,
    valuation_view: prev.valuationView,
    risks: prev.risks,
    questions_for_founder: prev.questionsForFounder,
    private_notes: prev.privateNotes,
    shared_notes: prev.sharedNotes,
  };
}

/** Field-level delta for the audit `detail` — names and counts only, never note bodies (§C.2). */
export function assessmentDelta(prev: EvaluationAssessment | null, next: EvaluationAssessment): Record<string, unknown> {
  const changed: string[] = [];
  const cmp = (key: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changed.push(key);
  };
  cmp("decision", prev?.decision, next.decision);
  cmp("conviction", prev?.conviction, next.conviction);
  cmp("thesis_fit_pct", prev?.thesisFitPct, next.thesisFitPct);
  cmp("dimension_ratings", prev?.dimensionRatings, next.dimensionRatings);
  cmp("criterion_ratings", prev?.criterionRatings, next.criterionRatings);
  cmp("valuation_view", prev?.valuationView, next.valuationView);
  cmp("risks", prev?.risks?.length ?? 0, next.risks.length);
  cmp("questions_for_founder", prev?.questionsForFounder?.length ?? 0, next.questionsForFounder.length);
  cmp("private_notes", (prev?.privateNotes ?? "").length, (next.privateNotes ?? "").length);
  cmp("shared_notes", (prev?.sharedNotes ?? "").length, (next.sharedNotes ?? "").length);
  return {
    changed,
    decision: next.decision,
    conviction: next.conviction,
    risks: next.risks.length,
    questions: next.questionsForFounder.length,
    dimensions_rated: Object.keys(next.dimensionRatings).length,
  };
}

function audit(input: {
  userId: string;
  action: string;
  assessment: Pick<EvaluationAssessment, "id" | "evaluationId" | "projectId" | "version">;
  detail: Record<string, unknown>;
}): void {
  void appendAudit({
    user_id: input.userId,
    actor: "user",
    action: input.action,
    resource_type: "evaluation_assessment",
    resource_id: input.assessment.id,
    detail: { evaluation_id: input.assessment.evaluationId, project_id: input.assessment.projectId, version: input.assessment.version, ...input.detail },
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== "test") console.warn("[blockid:assessments] audit write skipped:", err instanceof Error ? err.message : err);
  });
}

async function readSeatRows(evaluationId: string, assessorUserId: string): Promise<{ rows: EvaluationAssessment[]; available: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], available: false };
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("evaluation_id", evaluationId)
    .eq("assessor_user_id", assessorUserId)
    .order("version", { ascending: false })
    .limit(50);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:assessments] seat read failed", error);
    return { rows: [], available: false };
  }
  return { rows: ((data ?? []) as Row[]).map(mapAssessmentRow), available: true };
}

/**
 * Save a draft or submit. `input.status === "submitted"` is the submit
 * path (S3): decision + conviction required, `submitted_at` stamped, audit
 * `assessment.submitted`; anything else is a draft save (`assessment.saved`).
 */
export async function upsertAssessment(ctx: AssessmentWriteContext, input: AssessmentDraftInput, attempt = 0): Promise<UpsertAssessmentResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const { rows, available } = await readSeatRows(ctx.evaluationId, ctx.assessorUserId);
  if (!available) return { ok: false, error: "unavailable", message: "Assessments are not available on this environment yet" };
  const current = rows[0] ?? null;
  const submitting = input.status === "submitted";
  const patch = draftToColumns(input);

  // Effective values after the merge decide whether a submit is complete.
  const effDecision = patch.decision !== undefined ? patch.decision : (current?.decision ?? null);
  const effConviction = patch.conviction !== undefined ? patch.conviction : (current?.conviction ?? null);
  if (submitting && !effDecision) return { ok: false, error: "missing_decision", message: "Choose pass / track / proceed" };
  if (submitting && !effConviction) return { ok: false, error: "missing_conviction", message: "Rate your conviction 1–5" };

  const now = new Date().toISOString();
  const lifecycle: Row = submitting ? { status: "submitted", submitted_at: now } : {};

  let saved: Row | null = null;
  let created = false;
  if (current && current.status === "draft") {
    const { data, error } = await supabase
      .from("evaluation_assessments")
      .update({ ...patch, ...lifecycle })
      .eq("id", current.id)
      .eq("assessor_user_id", ctx.assessorUserId)
      // A late autosave racing a Submit must never rewrite the row that just
      // became a version (W4 review): only a row still in draft is updated.
      .eq("status", "draft")
      .select(ASSESSMENT_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error("[blockid:assessments] update failed", error);
      return { ok: false, error: "db_error", message: error.message ?? "Save failed" };
    }
    if (!data) {
      // The draft was submitted under us — re-read and take the new-version
      // branch instead of touching the submitted row (one retry).
      if (attempt === 0) return upsertAssessment(ctx, input, 1);
      return { ok: false, error: "db_error", message: "Save failed — please retry" };
    }
    saved = data as Row;
  } else {
    const base = current ? carryForwardColumns(current) : {};
    const insert: Row = {
      evaluation_id: ctx.evaluationId,
      project_id: ctx.projectId,
      assessor_user_id: ctx.assessorUserId,
      org_id: ctx.orgId ?? null,
      version: current ? current.version + 1 : 1,
      status: "draft",
      ...base,
      ...patch,
      ...lifecycle,
    };
    const { data, error } = await supabase.from("evaluation_assessments").insert(insert).select(ASSESSMENT_COLUMNS).maybeSingle();
    if (error && (error as { code?: string }).code === "23505" && attempt === 0) {
      // Two v(n+1) inserts raced on (evaluation_id, assessor_user_id, version) — re-read and retry once.
      return upsertAssessment(ctx, input, 1);
    }
    if (error || !data) {
      console.error("[blockid:assessments] insert failed", error);
      return { ok: false, error: "db_error", message: error?.message ?? "Save failed" };
    }
    saved = data as Row;
    created = true;
  }

  const assessment = mapAssessmentRow(saved);
  audit({
    userId: ctx.assessorUserId,
    action: submitting ? "assessment.submitted" : "assessment.saved",
    assessment,
    detail: { ...assessmentDelta(current, assessment), created, status: assessment.status, snapshot_id: assessment.snapshotId },
  });
  if (submitting) {
    notifyAssessmentSubmitted(ctx, assessment);
    // G14-S33/S-D2 leftover: emit the GA4 money/engagement event server-side
    // (same fire-and-forget contract as dossier-audit.ts's dossier_view) so
    // the weekly GA4 audit stops reporting assessment_submitted as missing.
    emitEventSafe({
      name: "assessment_submitted",
      params: {
        evaluation_id: assessment.evaluationId,
        decision: assessment.decision ?? "none",
        version: assessment.version,
        user_id: ctx.assessorUserId,
      },
      userId: ctx.assessorUserId,
      source: "server",
      consentGranted: true,
    });
  }
  const history = [toHistoryEntry(assessment), ...rows.filter((r) => r.id !== assessment.id).map(toHistoryEntry)];
  return { ok: true, assessment, created, version: assessment.version, history };
}

/**
 * G14-S38 — `assessment.submitted` outbound webhook. Recipient = the
 * assessor's OWN user-level endpoints only (`projectEndpoints: false`): a
 * decision is evaluator-private and must never reach the founder team's
 * integrations. Fire-and-forget; never throws into the write path.
 */
function notifyAssessmentSubmitted(ctx: AssessmentWriteContext, assessment: EvaluationAssessment): void {
  void (async () => {
    try {
      const { enqueueWebhook } = await import("@/lib/webhooks/registry");
      const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
      await enqueueWebhook(
        "assessment.submitted",
        ctx.projectId,
        {
          assessment_id: assessment.id,
          evaluation_id: assessment.evaluationId,
          project_id: assessment.projectId,
          startup_name: ctx.startupName ?? null,
          version: assessment.version,
          decision: assessment.decision,
          conviction: assessment.conviction,
          submitted_at: assessment.submittedAt,
          dossier_url: `${base}/workspace/evaluations/${encodeURIComponent(assessment.evaluationId)}`,
        },
        { userIds: [ctx.assessorUserId], projectEndpoints: false },
      );
    } catch (err) {
      console.error("[blockid:assessments] assessment.submitted webhook failed", err instanceof Error ? err.message : err);
    }
  })();
}

export type ShareAssessmentResult =
  | { ok: true; assessment: EvaluationAssessment; founderPreview: FounderVisibleAssessment }
  | { ok: false; error: AssessmentWriteError; message: string };

/**
 * Share the seat's CURRENT (highest-version) row with the claimed founder:
 * only the ticked allow-listed sections (§C.1). Re-sharing replaces the
 * ticked set. The founder projection returned is exactly what the founder
 * will read next time (`toFounderVisible`).
 */
export async function shareAssessment(ctx: AssessmentWriteContext, fields: readonly FounderShareField[]): Promise<ShareAssessmentResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const ticked = [...new Set(fields)].filter((f) => (FOUNDER_SHARE_ALLOW_LIST as readonly string[]).includes(f));
  if (!ticked.length) return { ok: false, error: "not_found", message: "Tick at least one section" };
  const { rows, available } = await readSeatRows(ctx.evaluationId, ctx.assessorUserId);
  if (!available) return { ok: false, error: "unavailable", message: "Assessments are not available on this environment yet" };
  const current = rows[0];
  if (!current) return { ok: false, error: "not_found", message: "Save an assessment before sharing it" };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .update({ shared_fields: ticked, shared_with_founder_at: now })
    .eq("id", current.id)
    .eq("assessor_user_id", ctx.assessorUserId)
    .select(ASSESSMENT_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    console.error("[blockid:assessments] share failed", error);
    return { ok: false, error: "db_error", message: error?.message ?? "Share failed" };
  }
  const assessment = mapAssessmentRow(data as Row);
  const founderPreview = toFounderVisible(assessment);
  if (!founderPreview) return { ok: false, error: "db_error", message: "Share was not recorded" };
  audit({
    userId: ctx.assessorUserId,
    action: "assessment.shared",
    assessment,
    detail: { fields: ticked, fields_count: ticked.length, reshared: Boolean(current.sharedWithFounderAt) },
  });
  return { ok: true, assessment, founderPreview };
}

export type RevokeShareResult = { ok: true; revoked: number } | { ok: false; error: AssessmentWriteError; message: string };

/** Revoke: EVERY version of the seat stops being visible to the founder (a revoke is total). */
export async function revokeAssessmentShare(ctx: AssessmentWriteContext): Promise<RevokeShareResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const { rows, available } = await readSeatRows(ctx.evaluationId, ctx.assessorUserId);
  if (!available) return { ok: false, error: "unavailable", message: "Assessments are not available on this environment yet" };
  const shared = rows.filter((r) => r.sharedWithFounderAt);
  if (!shared.length) return { ok: true, revoked: 0 };
  const { error } = await supabase
    .from("evaluation_assessments")
    .update({ shared_fields: [], shared_with_founder_at: null })
    .eq("evaluation_id", ctx.evaluationId)
    .eq("assessor_user_id", ctx.assessorUserId)
    .not("shared_with_founder_at", "is", null);
  if (error) {
    console.error("[blockid:assessments] revoke failed", error);
    return { ok: false, error: "db_error", message: error.message ?? "Revoke failed" };
  }
  audit({
    userId: ctx.assessorUserId,
    action: "assessment.share_revoked",
    assessment: shared[0],
    detail: { versions: shared.map((r) => r.version), previously_shared_fields: shared[0].sharedFields },
  });
  return { ok: true, revoked: shared.length };
}
