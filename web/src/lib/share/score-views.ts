// score_views for both kinds of /s/<slug> share (26/09/2026).
//
// /s/<slug> serves a legacy `scores` row OR an `svi_analyses` row (every
// /startup-index listing links to its analysis id). `score_views.score_id`
// references `scores(id)`, so every analysis-share view failed with FK 23503
// and was silently dropped — no row since 2026-09-08. Migration 0468
// (supabase/pending-authority/0468_score_views_any_subject.sql) adds a
// nullable `svi_analysis_id` FK + a one-subject CHECK; this module writes the
// column that matches the subject and reads both.
//
// Until 0468 is applied the `svi_analysis_id` column does not exist: a write
// for an analysis share is skipped (the pre-fix behaviour — the row could not
// be stored anyway) and reads fall back to `score_id` only. Nothing throws.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ShareSubjectKind = "score" | "svi_analysis";
export type ShareViewColumn = "score_id" | "svi_analysis_id";

const SUBJECT_COLUMNS: readonly ShareViewColumn[] = ["score_id", "svi_analysis_id"];

export function shareViewColumn(kind: ShareSubjectKind): ShareViewColumn {
  return kind === "svi_analysis" ? "svi_analysis_id" : "score_id";
}

interface PgError {
  code?: string;
  message?: string;
}

/** The `svi_analysis_id` column is not there yet (0468 not applied / schema cache not reloaded). */
export function isMissingSubjectColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as PgError;
  if (code === "42703" || code === "PGRST204") return true;
  return /svi_analysis_id/.test(message ?? "") && /does not exist|schema cache|could not find/i.test(message ?? "");
}

let warnedMigrationPending = false;
function warnMigrationPending(op: string): void {
  if (warnedMigrationPending) return;
  warnedMigrationPending = true;
  console.warn(
    JSON.stringify({ event: "score_views.migration_pending", op, migration: "0468_score_views_any_subject", note: "svi_analyses share views are not stored until 0468 is applied" }),
  );
}

/** Test hook: re-arm the once-per-process warning. */
export function __resetScoreViewsWarningForTests(): void {
  warnedMigrationPending = false;
}

export interface RecordShareViewArgs {
  slug: string;
  kind: ShareSubjectKind;
  viewerHash: string | null;
  userAgent?: string | null;
  referer?: string | null;
}

export type RecordShareViewResult =
  | { ok: true; column: ShareViewColumn }
  | { ok: false; reason: "unknown_subject" | "migration_pending" | "error" };

/** Insert one view row on the column matching the share's subject. Never throws. */
export async function recordShareView(
  supabase: SupabaseClient,
  args: RecordShareViewArgs,
): Promise<RecordShareViewResult> {
  const column = shareViewColumn(args.kind);
  try {
    const { error } = await supabase.from("score_views").insert({
      [column]: args.slug,
      viewer_ip_hash: args.viewerHash,
      viewer_ua: args.userAgent?.slice(0, 512) ?? null,
      referer: args.referer?.slice(0, 512) ?? null,
    });
    if (!error) return { ok: true, column };
    // 23503 = the subject row does not exist (a stale / fake slug) — crawler
    // noise, dropped silently to keep the log signal-to-noise up.
    if ((error as PgError).code === "23503") return { ok: false, reason: "unknown_subject" };
    if (column === "svi_analysis_id" && isMissingSubjectColumn(error)) {
      warnMigrationPending("insert");
      return { ok: false, reason: "migration_pending" };
    }
    console.error("[blockid:s] view insert failed", error);
    return { ok: false, reason: "error" };
  } catch (e) {
    console.error("[blockid:s] view insert threw", e);
    return { ok: false, reason: "error" };
  }
}

/** Views of this share by this viewer hash since `sinceIso` (0 on any read failure). */
export async function countRecentShareViews(
  supabase: SupabaseClient,
  args: { slug: string; kind: ShareSubjectKind; viewerHash: string; sinceIso: string },
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("score_views")
      .select("id", { count: "exact", head: true })
      .eq(shareViewColumn(args.kind), args.slug)
      .eq("viewer_ip_hash", args.viewerHash)
      .gte("viewed_at", args.sinceIso);
    if (error) {
      if (isMissingSubjectColumn(error)) warnMigrationPending("count");
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Newest view row id for (slug, viewer) whichever subject column holds the
 * slug. Used by the engagement tracker, which only knows the slug.
 */
export async function latestShareViewId(
  supabase: SupabaseClient,
  slug: string,
  viewerHash: string,
): Promise<string | null> {
  for (const column of SUBJECT_COLUMNS) {
    try {
      const { data, error } = await supabase
        .from("score_views")
        .select("id")
        .eq(column, slug)
        .eq("viewer_ip_hash", viewerHash)
        .order("viewed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isMissingSubjectColumn(error)) warnMigrationPending("latest");
        else console.error("[blockid:track] score_views lookup failed", error);
        continue;
      }
      const id = (data as { id?: string } | null)?.id;
      if (id) return id;
    } catch {
      /* try the next column */
    }
  }
  return null;
}
