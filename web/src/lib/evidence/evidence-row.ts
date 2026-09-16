// G14-S36 — the per-row verification state the founder evidence page
// renders ("Request verification" / pending / verified). Shared by
// GET /api/svi/evidence-completeness and its client. Pure.

export type ReviewStatus = "none" | "pending" | "approved" | "rejected";

export interface EvidenceRowOut {
  id: string;
  projectId: string;
  dimension: string;
  evidence_type: string;
  confidence_level: string;
  is_verified: boolean;
  verified_at: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
}

export function toEvidenceRowOut(r: Record<string, unknown>): EvidenceRowOut {
  const status = r.review_status;
  return {
    id: String(r.id ?? ""),
    projectId: String(r.project_id ?? ""),
    dimension: String(r.dimension ?? ""),
    evidence_type: String(r.evidence_type ?? ""),
    confidence_level: String(r.confidence_level ?? "self_declared"),
    is_verified: r.is_verified === true,
    verified_at: typeof r.verified_at === "string" ? r.verified_at : null,
    review_status: status === "pending" || status === "approved" || status === "rejected" ? status : "none",
    review_note: typeof r.review_note === "string" ? r.review_note : null,
  };
}

/** Can the founder press "Request verification" on this row? */
export function canRequestReview(row: Pick<EvidenceRowOut, "is_verified" | "review_status">): boolean {
  return !row.is_verified && row.review_status !== "pending";
}
