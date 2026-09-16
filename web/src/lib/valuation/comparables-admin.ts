// Admin review helpers for `au_comparable_raises` (G13-W5-R5 / S-R5).
//
// The weekly ingest writes `pending` rows; an admin approves (→ `verified`,
// the only status the valuation chapter and the landing copy count) or
// rejects them on /admin/comparables. Approval may carry edits — the
// regex extraction guesses sector / stage and never sees a post-money or
// ARR figure, so the reviewer fills those from the source before the row
// counts toward "with disclosed multiples".
//
// Pure validation + a small query layer over an injected client (the
// route tests use an in-memory fake; nothing here imports server-only).

import type { AUStage } from "@/lib/data/au-comparables";
import { AU_STAGE_VALUES, SECTOR_VALUES } from "./comparables-enums";
import { COMPARABLES_TABLE, invalidateComparablesCache, type ComparableRaiseRow, type ComparableStatus } from "./comparables-repo";

export { AU_STAGE_VALUES, SECTOR_VALUES };

export type ReviewDecision = "approve" | "reject";

export interface ComparableEdits {
  sector?: string;
  stage?: AUStage;
  name?: string;
  round_date?: string;
  amount_aud?: number | null;
  post_money_aud?: number | null;
  arr_aud?: number | null;
  arr_multiple?: number | null;
  founded_year?: number | null;
  notable?: boolean;
}

export interface ReviewBody {
  decision: ReviewDecision;
  note?: string;
  edits?: ComparableEdits;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function optNumber(v: unknown, key: string, errors: string[]): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${key} must be a non-negative number`);
    return undefined;
  }
  return n;
}

/** Validate a review request body. Returns the normalised body or the list of problems. */
export function validateReviewBody(raw: unknown): { ok: true; body: ReviewBody } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["body must be an object"] };
  const r = raw as Record<string, unknown>;
  if (r.decision !== "approve" && r.decision !== "reject") errors.push("decision must be approve | reject");
  let note: string | undefined;
  if (r.note !== undefined) {
    if (typeof r.note !== "string") errors.push("note must be a string");
    else if (r.note.length > 500) errors.push("note must be ≤ 500 characters");
    else note = r.note.trim() || undefined;
  }
  let edits: ComparableEdits | undefined;
  if (r.edits !== undefined) {
    if (!r.edits || typeof r.edits !== "object") errors.push("edits must be an object");
    else {
      const e = r.edits as Record<string, unknown>;
      edits = {};
      if (e.sector !== undefined) {
        if (typeof e.sector !== "string" || !SECTOR_VALUES.includes(e.sector)) errors.push(`sector must be one of ${SECTOR_VALUES.join(", ")}`);
        else edits.sector = e.sector;
      }
      if (e.stage !== undefined) {
        if (typeof e.stage !== "string" || !AU_STAGE_VALUES.includes(e.stage as AUStage)) errors.push(`stage must be one of ${AU_STAGE_VALUES.join(", ")}`);
        else edits.stage = e.stage as AUStage;
      }
      if (e.name !== undefined) {
        if (typeof e.name !== "string" || !e.name.trim() || e.name.trim().length > 120) errors.push("name must be 1–120 characters");
        else edits.name = e.name.trim();
      }
      if (e.round_date !== undefined) {
        if (typeof e.round_date !== "string" || !ISO_DATE_RE.test(e.round_date) || Number.isNaN(new Date(e.round_date).getTime())) errors.push("round_date must be YYYY-MM-DD");
        else edits.round_date = e.round_date;
      }
      for (const key of ["amount_aud", "post_money_aud", "arr_aud", "arr_multiple"] as const) {
        const v = optNumber(e[key], key, errors);
        if (v !== undefined) edits[key] = v;
      }
      if (e.founded_year !== undefined) {
        if (e.founded_year === null || e.founded_year === "") edits.founded_year = null;
        else {
          const y = Number(e.founded_year);
          if (!Number.isInteger(y) || y < 1900 || y > 2100) errors.push("founded_year must be a year");
          else edits.founded_year = y;
        }
      }
      if (e.notable !== undefined) {
        if (typeof e.notable !== "boolean") errors.push("notable must be boolean");
        else edits.notable = e.notable;
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, body: { decision: r.decision as ReviewDecision, note, edits } };
}

/** The UPDATE payload for a decision. Derives arr_multiple from post-money ÷ ARR when both are present and no multiple was typed. */
export function reviewUpdate(body: ReviewBody, reviewer: string, now: Date = new Date()): Record<string, unknown> {
  const status: ComparableStatus = body.decision === "approve" ? "verified" : "rejected";
  const patch: Record<string, unknown> = { status, review_note: body.note ?? null, updated_at: now.toISOString() };
  if (status === "verified") {
    patch.verified_by = reviewer;
    patch.verified_at = now.toISOString();
  } else {
    patch.verified_by = null;
    patch.verified_at = null;
  }
  const e = body.edits ?? {};
  for (const [k, v] of Object.entries(e)) if (v !== undefined) patch[k] = v;
  if (e.arr_multiple === undefined && typeof e.post_money_aud === "number" && typeof e.arr_aud === "number" && e.arr_aud > 0) {
    patch.arr_multiple = Math.round((e.post_money_aud / e.arr_aud) * 10) / 10;
  }
  return patch;
}

// ─── Query layer (injected client) ───────────────────────────────────────────

export interface ComparablesAdminDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        order(col: string, opts: { ascending: boolean }): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
        maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, v: string): { select(cols: string): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } };
    };
  };
}

export interface ComparablesQueue {
  pending: ComparableRaiseRow[];
  verified: ComparableRaiseRow[];
  rejected: ComparableRaiseRow[];
  counts: { pending: number; verified: number; rejected: number; withMultiples: number };
  /** 42P01-style "not migrated" signal for the page. */
  error: string | null;
}

async function listByStatus(db: ComparablesAdminDb, status: ComparableStatus, limit: number, orderCol: string): Promise<{ rows: ComparableRaiseRow[]; error: string | null }> {
  const { data, error } = await db.from(COMPARABLES_TABLE).select("*").eq("status", status).order(orderCol, { ascending: false }).limit(limit);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ComparableRaiseRow[], error: null };
}

/** The three lists the review page renders (pending oldest-first is handled client-side; queries are newest-first). */
export async function loadComparablesQueue(db: ComparablesAdminDb): Promise<ComparablesQueue> {
  const [p, v, r] = await Promise.all([listByStatus(db, "pending", 200, "created_at"), listByStatus(db, "verified", 5000, "round_date"), listByStatus(db, "rejected", 50, "updated_at")]);
  const error = p.error ?? v.error ?? r.error;
  const withMultiples = v.rows.filter((row) => (Number(row.arr_multiple) || 0) > 0 || ((Number(row.post_money_aud) || 0) > 0 && (Number(row.arr_aud) || 0) > 0)).length;
  return {
    pending: p.rows,
    verified: v.rows.slice(0, 100),
    rejected: r.rows,
    counts: { pending: p.rows.length, verified: v.rows.length, rejected: r.rows.length, withMultiples },
    error,
  };
}

export type ReviewFailure = "not_found" | "already_decided" | "query_failed" | "update_failed";

/**
 * Apply a decision. Only `pending` rows are reviewable from the queue; a
 * verified row may still be rejected (a rollback, flagged in the result).
 * Invalidates the repo cache so the next report sees the new N.
 */
export async function reviewComparable(
  db: ComparablesAdminDb,
  id: string,
  body: ReviewBody,
  ctx: { reviewer: string; now?: Date },
): Promise<{ ok: true; row: ComparableRaiseRow; rollback: boolean } | { ok: false; reason: ReviewFailure; error?: string }> {
  const { data, error } = await db.from(COMPARABLES_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, reason: "query_failed", error: error.message };
  if (!data) return { ok: false, reason: "not_found" };
  const current = data as ComparableRaiseRow;
  const rollback = current.status === "verified" && body.decision === "reject";
  if (current.status === "verified" && body.decision === "approve") return { ok: false, reason: "already_decided" };
  if (current.status === "rejected" && body.decision === "reject") return { ok: false, reason: "already_decided" };
  const patch = reviewUpdate(body, ctx.reviewer, ctx.now);
  const upd = await db.from(COMPARABLES_TABLE).update(patch).eq("id", id).select("*").maybeSingle();
  if (upd.error) return { ok: false, reason: "update_failed", error: upd.error.message };
  if (!upd.data) return { ok: false, reason: "not_found" };
  invalidateComparablesCache();
  return { ok: true, row: upd.data as ComparableRaiseRow, rollback };
}
