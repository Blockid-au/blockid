// Approve / reject a sector_multiples_overrides row (S27-C) — the one
// function behind POST /api/admin/sector-multiples/[id]/{approve,reject}.
//
//   approve  proposed → approved: approved_by = caller, approved_at = now.
//            Only a `proposed` row can be approved (an already-approved row
//            is a no-op 409; a rejected row must be re-proposed). The result
//            says whether the approver is the admin who proposed it
//            (`sameAdmin`) so the route can flag it in the audit row.
//   reject   proposed → rejected, OR approved → rejected (that is the
//            rollback: the resolver falls back to the previous approved row
//            for the sector, or the static table). rejected_at = now.
//
// Both invalidate the resolver cache so the next valuation sees the change.
// Injectable client (tests); never throws on a DB error — returns a reason.

import { invalidateSectorMultiplesCache, OVERRIDES_TABLE, type SectorMultipleOverride } from "./sector-multiples";
import { cleanReviewNote } from "./multiples-admin";

export const REVIEW_BODY_MAX_BYTES = 4 * 1024;

/**
 * Optional `{ note }` body on approve / reject. An empty body is fine;
 * malformed JSON or an oversize body is refused (`ok:false` with the status
 * the route should send).
 */
export async function readReviewNote(request: Request): Promise<{ ok: true; note: string | null } | { ok: false; status: 400 | 413; reason: "invalid_json" | "payload_too_large" }> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, reason: "invalid_json" };
  }
  if (!text.trim()) return { ok: true, note: null };
  if (Buffer.byteLength(text, "utf8") > REVIEW_BODY_MAX_BYTES) return { ok: false, status: 413, reason: "payload_too_large" };
  try {
    const body: unknown = JSON.parse(text);
    return { ok: true, note: cleanReviewNote((body as { note?: unknown } | null)?.note) };
  } catch {
    return { ok: false, status: 400, reason: "invalid_json" };
  }
}

export interface ReviewClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          select: (cols: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> };
        };
      };
    };
  };
}

export type ReviewFailure = "not_found" | "already_approved" | "already_rejected" | "not_reviewable" | "query_failed" | "update_failed" | "raced";

export interface ReviewResult {
  ok: true;
  row: SectorMultipleOverride;
  previousStatus: SectorMultipleOverride["status"];
  /** approve only: the approver is the admin who typed the proposal. */
  sameAdmin: boolean;
}

export async function reviewOverride(
  client: ReviewClient,
  id: string,
  decision: "approve" | "reject",
  actor: { userId: string; note: string | null; now?: Date },
): Promise<ReviewResult | { ok: false; reason: ReviewFailure; error?: string }> {
  const now = (actor.now ?? new Date()).toISOString();

  const cur = await client.from(OVERRIDES_TABLE).select("*").eq("id", id).maybeSingle();
  if (cur.error) return { ok: false, reason: "query_failed", error: cur.error.message };
  if (!cur.data) return { ok: false, reason: "not_found" };
  const row = cur.data as SectorMultipleOverride;

  let patch: Record<string, unknown>;
  if (decision === "approve") {
    if (row.status === "approved") return { ok: false, reason: "already_approved" };
    if (row.status === "rejected") return { ok: false, reason: "not_reviewable" };
    patch = { status: "approved", approved_by: actor.userId, approved_at: now, review_note: actor.note };
  } else {
    if (row.status === "rejected") return { ok: false, reason: "already_rejected" };
    patch = { status: "rejected", rejected_at: now, review_note: actor.note };
  }

  // The second `.eq("status", …)` makes the flip conditional on the status
  // we just read — two admins clicking at once cannot both "win".
  const upd = await client.from(OVERRIDES_TABLE).update(patch).eq("id", id).eq("status", row.status).select("*").maybeSingle();
  if (upd.error) return { ok: false, reason: "update_failed", error: upd.error.message };
  if (!upd.data) return { ok: false, reason: "raced" };

  invalidateSectorMultiplesCache();
  const updated = upd.data as SectorMultipleOverride;
  return {
    ok: true,
    row: updated,
    previousStatus: row.status,
    sameAdmin: decision === "approve" && row.proposed_by === "admin" && row.proposed_by_user_id === actor.userId,
  };
}
