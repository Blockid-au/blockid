// G21-P1-B — persist Evidence Confidence beside every `svi_snapshots` row so
// history carries it (`svi_snapshots.evidence_confidence`, migration
// 0419_snapshot_evidence_confidence.sql).
//
// Every writer goes through `insertSviSnapshot` / `updateSviSnapshot`: the
// helpers add `evidence_confidence` from the analysis (the one function in
// lib/svi/evidence-confidence.ts) and FAIL SOFT when the column is absent —
// on a 42703 / PGRST204 "column does not exist" error they retry once
// without it, so a deploy ahead of the migration never loses a snapshot.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { evidenceConfidenceFromAnalysis, type AnalysisLike } from "./evidence-confidence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;
type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: PostgrestError | null };

export const EVIDENCE_CONFIDENCE_COLUMN = "evidence_confidence";

/** Postgres undefined_column / PostgREST schema-cache miss for the new column. */
export function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes(EVIDENCE_CONFIDENCE_COLUMN) && (m.includes("column") || m.includes("schema cache"));
}

/** The row plus `evidence_confidence` (0–100) when an analysis is available; unchanged otherwise. */
export function withEvidenceConfidence<T extends Row>(row: T, analysis: AnalysisLike | null | undefined, verificationLevel?: number | null): T & { evidence_confidence?: number } {
  if (!analysis) return row;
  try {
    return { ...row, [EVIDENCE_CONFIDENCE_COLUMN]: evidenceConfidenceFromAnalysis(analysis, verificationLevel) };
  } catch {
    return row;
  }
}

function without(row: Row): Row {
  const copy = { ...row };
  delete copy[EVIDENCE_CONFIDENCE_COLUMN];
  return copy;
}

/**
 * INSERT one snapshot row (with `evidence_confidence` when `analysis` is
 * given). `select` returns the inserted columns (single row). Retries without
 * the column when the database does not have it yet.
 */
export async function insertSviSnapshot<T = Row>(db: Db, row: Row, opts: { analysis?: AnalysisLike | null; verificationLevel?: number | null; select?: string } = {}): Promise<Result<T>> {
  const payload = withEvidenceConfidence(row, opts.analysis, opts.verificationLevel);
  const run = async (p: Row): Promise<Result<T>> => {
    const q = db.from("svi_snapshots").insert(p);
    if (opts.select) {
      const r = await q.select(opts.select).single();
      return { data: (r.data as T | null) ?? null, error: r.error };
    }
    const r = await q;
    return { data: null, error: r.error };
  };
  const first = await run(payload);
  if (first.error && EVIDENCE_CONFIDENCE_COLUMN in payload && isMissingColumnError(first.error)) return run(without(payload));
  return first;
}

/** UPDATE one snapshot row by id, same fail-soft rule. */
export async function updateSviSnapshot(db: Db, id: string, row: Row, opts: { analysis?: AnalysisLike | null; verificationLevel?: number | null } = {}): Promise<{ error: PostgrestError | null }> {
  const payload = withEvidenceConfidence(row, opts.analysis, opts.verificationLevel);
  const first = await db.from("svi_snapshots").update(payload).eq("id", id);
  if (first.error && EVIDENCE_CONFIDENCE_COLUMN in payload && isMissingColumnError(first.error)) {
    const second = await db.from("svi_snapshots").update(without(payload)).eq("id", id);
    return { error: second.error };
  }
  return { error: first.error };
}

/** UPSERT (the cron writer's shape), same fail-soft rule. */
export async function upsertSviSnapshot(db: Db, row: Row, opts: { analysis?: AnalysisLike | null; verificationLevel?: number | null; onConflict?: string } = {}): Promise<{ error: PostgrestError | null }> {
  const payload = withEvidenceConfidence(row, opts.analysis, opts.verificationLevel);
  const up = (p: Row) => (opts.onConflict ? db.from("svi_snapshots").upsert(p, { onConflict: opts.onConflict }) : db.from("svi_snapshots").upsert(p));
  const first = await up(payload);
  if (first.error && EVIDENCE_CONFIDENCE_COLUMN in payload && isMissingColumnError(first.error)) {
    const second = await up(without(payload));
    return { error: second.error };
  }
  return { error: first.error };
}
