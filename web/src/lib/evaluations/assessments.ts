// Evaluator Assessment — read side + viewer masking (G13-W2-D1, S-D1).
//
// One `evaluation_assessments` row (migration 0392) is one evaluator seat's
// structured verdict on one evaluation, versioned (latest = current). The
// write side (form, PUT / submit / share routes) is S-D2; this module owns
// the shapes (Appendix 2 of the BA spec, as Zod), the row mapper and the
// ONLY code path that decides what each viewer may see (§C.1):
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

// ─── Appendix 2 shapes ──────────────────────────────────────────────────────

export const ASSESSMENT_DIM_KEYS = ["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"] as const;
export type AssessmentDimKey = (typeof ASSESSMENT_DIM_KEYS)[number];

export const ASSESSMENT_DECISIONS = ["pass", "track", "proceed"] as const;
export type AssessmentDecision = (typeof ASSESSMENT_DECISIONS)[number];

export const ASSESSMENT_STATUSES = ["draft", "submitted"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const dimensionRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  stance: z.enum(["agree", "disagree", "unsure"]),
  note: z.string().max(500).optional(),
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
  return {
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
