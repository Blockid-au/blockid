// G14-S36 — the reviewer queue behind /admin/evidence-review.
//
// Only rows the founder queued (`review_status = 'pending'`) are actionable;
// the recent approved / rejected rows are listed for context. 42703
// (undefined column) means migration 0406 is not applied on this DB — the
// page renders that as a banner instead of a crash.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReviewQueueDb = Pick<SupabaseClient<any, any, any>, "from">;

export interface ReviewQueueRow {
  id: string;
  project_id: string;
  project_name: string | null;
  dimension: string;
  evidence_type: string;
  evidence_label: string;
  evidence_value_or_url: string | null;
  confidence_level: string;
  is_verified: boolean;
  review_status: string;
  review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReviewQueue {
  pending: ReviewQueueRow[];
  recent: ReviewQueueRow[];
  counts: { pending: number; approved: number; rejected: number };
  /** "migration_pending" when 0406 is not applied; otherwise a DB message. */
  error: string | null;
}

export const EMPTY_REVIEW_QUEUE: ReviewQueue = { pending: [], recent: [], counts: { pending: 0, approved: 0, rejected: 0 }, error: null };

const COLUMNS = "id, project_id, dimension, evidence_type, evidence_label, evidence_value_or_url, confidence_level, is_verified, review_status, review_note, created_at, updated_at";

function toRow(r: Record<string, unknown>, names: Map<string, string>): ReviewQueueRow {
  return {
    id: String(r.id ?? ""),
    project_id: String(r.project_id ?? ""),
    project_name: names.get(String(r.project_id ?? "")) ?? null,
    dimension: String(r.dimension ?? ""),
    evidence_type: String(r.evidence_type ?? ""),
    evidence_label: String(r.evidence_label ?? r.evidence_type ?? ""),
    evidence_value_or_url: typeof r.evidence_value_or_url === "string" ? r.evidence_value_or_url : null,
    confidence_level: String(r.confidence_level ?? "self_declared"),
    is_verified: r.is_verified === true,
    review_status: String(r.review_status ?? "none"),
    review_note: typeof r.review_note === "string" ? r.review_note : null,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

export async function loadEvidenceReviewQueue(db: ReviewQueueDb, opts: { recentLimit?: number } = {}): Promise<ReviewQueue> {
  const recentLimit = opts.recentLimit ?? 30;
  try {
    const [pendingRes, recentRes] = await Promise.all([
      db.from("svi_dimension_evidence").select(COLUMNS).eq("review_status", "pending").order("created_at", { ascending: true }).limit(500),
      db.from("svi_dimension_evidence").select(COLUMNS).in("review_status", ["approved", "rejected"]).order("updated_at", { ascending: false }).limit(recentLimit),
    ]);
    const err = pendingRes.error ?? recentRes.error;
    if (err) {
      const code = (err as { code?: string }).code;
      return { ...EMPTY_REVIEW_QUEUE, error: code === "42703" ? "migration_pending" : String((err as { message?: string }).message ?? "query_failed") };
    }
    const pendingRaw = (pendingRes.data ?? []) as Record<string, unknown>[];
    const recentRaw = (recentRes.data ?? []) as Record<string, unknown>[];

    const ids = Array.from(new Set([...pendingRaw, ...recentRaw].map((r) => String(r.project_id ?? "")).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      try {
        const { data } = await db.from("projects").select("id, name").in("id", ids);
        for (const p of (data ?? []) as Array<{ id: string; name: string | null }>) if (p.name) names.set(p.id, p.name);
      } catch {
        // names are decoration
      }
    }

    const pending = pendingRaw.map((r) => toRow(r, names));
    const recent = recentRaw.map((r) => toRow(r, names));
    return {
      pending,
      recent,
      counts: {
        pending: pending.length,
        approved: recent.filter((r) => r.review_status === "approved").length,
        rejected: recent.filter((r) => r.review_status === "rejected").length,
      },
      error: null,
    };
  } catch (e) {
    return { ...EMPTY_REVIEW_QUEUE, error: e instanceof Error ? e.message : "query_failed" };
  }
}
