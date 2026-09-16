// G14-S36 — reviewer decision on a `svi_dimension_evidence` row.
//
// The ONLY code path that may write `confidence_level = 'third_party_verified'`
// (migration 0406 CHECK tpv_requires_review: third_party_verified ⇒
// is_verified). Pure decision builder + a thin persister so the admin route
// and its test share one arithmetic:
//
//   approve → is_verified = true, verified_at = now, verified_by_user_id =
//             reviewer, review_status = 'approved',
//             confidence_level = capConfidence(third_party_verified, reviewer)
//   reject  → is_verified = false, verified_* cleared, review_status =
//             'rejected', confidence_level capped back to founder_upload
//             (document_uploaded at most), note required.
//
// When the dimension row points at a Phase-3 `public.evidence` row (its
// value is that row's uuid) and that row sits in `validation_required`, the
// same decision drives the state machine (human_approve / human_reject);
// any other state is left alone — the transition table decides, not us.

import type { SupabaseClient } from "@supabase/supabase-js";
import { capConfidence, type ConfidenceLevel } from "./confidence-cap";
import { EvidenceStateSchema, nextEvidenceState, type EvidenceState } from "./state-machine";

export type ReviewDecision = "approve" | "reject";

export const REVIEW_DECISIONS: readonly ReviewDecision[] = ["approve", "reject"];
export const REVIEW_NOTE_MAX = 1000;

export function isReviewDecision(v: unknown): v is ReviewDecision {
  return v === "approve" || v === "reject";
}

export interface ReviewPatch {
  is_verified: boolean;
  verified_at: string | null;
  verified_by_user_id: string | null;
  review_status: "approved" | "rejected";
  review_note: string | null;
  confidence_level: ConfidenceLevel;
  updated_at: string;
}

/** Pure: the column patch for a decision. */
export function buildReviewPatch(input: {
  decision: ReviewDecision;
  reviewerUserId: string;
  note?: string | null;
  currentLevel: string | null | undefined;
  now?: Date;
}): ReviewPatch {
  const nowIso = (input.now ?? new Date()).toISOString();
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, REVIEW_NOTE_MAX) : null;
  if (input.decision === "approve") {
    return {
      is_verified: true,
      verified_at: nowIso,
      verified_by_user_id: input.reviewerUserId,
      review_status: "approved",
      review_note: note,
      confidence_level: capConfidence({ requested: "third_party_verified", origin: "reviewer" }).level,
      updated_at: nowIso,
    };
  }
  return {
    is_verified: false,
    verified_at: null,
    verified_by_user_id: null,
    review_status: "rejected",
    review_note: note,
    // A rejected row is back to what the founder could file on their own.
    confidence_level: capConfidence({ requested: input.currentLevel, origin: "founder_upload" }).level,
    updated_at: nowIso,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function linkedEvidenceId(valueOrUrl: string | null | undefined): string | null {
  return typeof valueOrUrl === "string" && UUID_RE.test(valueOrUrl.trim()) ? valueOrUrl.trim() : null;
}

/** Pure: the state-machine transition a decision implies, or null when illegal from `current`. */
export function reviewTransition(current: unknown, decision: ReviewDecision): EvidenceState | null {
  const parsed = EvidenceStateSchema.safeParse(current);
  if (!parsed.success) return null;
  return nextEvidenceState(parsed.data, decision === "approve" ? "human_approve" : "human_reject");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

export interface ApplyReviewResult {
  ok: true;
  row: { id: string; project_id: string; dimension: string; evidence_type: string; confidence_level: string; review_status: string };
  /** The Phase-3 evidence row transition applied, if any. */
  linked: { evidenceId: string; from: string; to: EvidenceState } | null;
}

export type ApplyReviewError = { ok: false; error: "not_found" | "db_error" | "not_pending" };

/**
 * Persist a decision. Only rows the founder queued (`review_status =
 * 'pending'`) can be decided — the queue page is the reviewer's whole
 * surface, so an approve on a never-requested row is refused.
 */
export async function applyEvidenceReview(
  db: Db,
  input: { evidenceId: string; decision: ReviewDecision; reviewerUserId: string; note?: string | null; now?: Date },
): Promise<ApplyReviewResult | ApplyReviewError> {
  const { data: row, error } = await db
    .from("svi_dimension_evidence")
    .select("id, project_id, dimension, evidence_type, confidence_level, review_status, evidence_value_or_url")
    .eq("id", input.evidenceId)
    .maybeSingle();
  if (error) return { ok: false, error: "db_error" };
  if (!row) return { ok: false, error: "not_found" };
  if ((row as { review_status?: string }).review_status !== "pending") return { ok: false, error: "not_pending" };

  const patch = buildReviewPatch({
    decision: input.decision,
    reviewerUserId: input.reviewerUserId,
    note: input.note,
    currentLevel: (row as { confidence_level?: string }).confidence_level,
    now: input.now,
  });
  const { error: upErr } = await db.from("svi_dimension_evidence").update(patch).eq("id", input.evidenceId);
  if (upErr) return { ok: false, error: "db_error" };

  let linked: ApplyReviewResult["linked"] = null;
  const evidenceId = linkedEvidenceId((row as { evidence_value_or_url?: string | null }).evidence_value_or_url);
  if (evidenceId) {
    try {
      const { data: ev } = await db
        .from("evidence")
        .select("id, verification_state")
        .eq("id", evidenceId)
        .eq("business_id", (row as { project_id: string }).project_id)
        .maybeSingle();
      const from = (ev as { verification_state?: string } | null)?.verification_state;
      const to = ev ? reviewTransition(from, input.decision) : null;
      if (ev && to) {
        const { error: evErr } = await db.from("evidence").update({ verification_state: to, updated_at: patch.updated_at }).eq("id", evidenceId);
        if (!evErr) linked = { evidenceId, from: String(from), to };
      }
    } catch {
      linked = null;
    }
  }

  return {
    ok: true,
    row: {
      id: String((row as { id: string }).id),
      project_id: String((row as { project_id: string }).project_id),
      dimension: String((row as { dimension: string }).dimension),
      evidence_type: String((row as { evidence_type: string }).evidence_type),
      confidence_level: patch.confidence_level,
      review_status: patch.review_status,
    },
    linked,
  };
}
