// Persistence for /analyze runs.
//
// Every function here is fail-soft on the write path and strict on the read
// path. A founder must never lose a good analysis to a database hiccup, and
// must never see somebody else's.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import {
  buildAnalysisRow,
  toClientAnalysis,
  type CompactSvi,
  type StoredAnalysisRow,
} from "./payload";
import { anonRunWindowStart } from "./signup-gate";

export const ANALYSES_TABLE = "analyses";
export const GUEST_ANALYSES_TABLE = "guest_analyses";

/** Columns a list view needs. Deliberately excludes `input_text`/`intake`. */
export const LIST_COLUMNS =
  "id, created_at, input_kind, input_url, input_filename, stage, stage_label, svi_total, valuation_mid_aud, user_id";

/** Every column, for the single-row read. */
export const DETAIL_COLUMNS =
  "id, anon_key, user_id, input_kind, input_text, input_chars, input_truncated, input_url, input_filename, intake, context, svi, svi_total, stage, stage_label, valuation_mid_aud, created_at";

// ── Rate limiting ────────────────────────────────────────────────────────
// The write path is unauthenticated by design, so it needs a ceiling or a
// loop can fill the table. Two buckets, because either one alone is trivially
// beaten: an attacker can drop the cookie (defeating the anon-key bucket) or
// rotate IPs (defeating the IP bucket), but doing both at scale is work.

export const WRITE_LIMIT_PER_ANON = 30;
export const WRITE_LIMIT_PER_IP = 60;
export const WRITE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface WriteLimitResult {
  allowed: boolean;
  reason?: "anon" | "ip";
}

export function checkAnalysisWriteLimit(
  anonKey: string,
  ip: string,
): WriteLimitResult {
  const byAnon = checkRateLimit(
    `analysis-write:anon:${anonKey}`,
    WRITE_LIMIT_PER_ANON,
    WRITE_LIMIT_WINDOW_MS,
  );
  if (!byAnon.allowed) return { allowed: false, reason: "anon" };
  const byIp = checkRateLimit(
    `analysis-write:ip:${ip}`,
    WRITE_LIMIT_PER_IP,
    WRITE_LIMIT_WINDOW_MS,
  );
  if (!byIp.allowed) return { allowed: false, reason: "ip" };
  return { allowed: true };
}

// ── Signup gate: how many runs has this browser already had? ─────────────

/**
 * Count this anon key's runs inside the gate window.
 *
 * Reads at most `cap` ids and returns how many came back, so the query is a
 * bounded index scan on `analyses_anon_key_created_idx (anon_key, created_at
 * desc)` — no `count(*)` over an unbounded slice. The gate only ever compares
 * against FREE_ANON_RUNS, so an exact count above the cap is worthless.
 *
 * FAILS OPEN. If Supabase is unreachable or the query errors we return 0 and
 * the visitor gets their run. The wall exists to protect model spend from
 * repeat anonymous visitors; blocking a real founder because our database
 * hiccuped would cost more than the run it saved, and the anonymous write
 * rate limit is still underneath as a ceiling.
 */
export async function countAnonRunsInWindow(
  anonKey: string,
  opts?: { since?: string; cap?: number },
): Promise<number> {
  const cap = opts?.cap ?? 10;
  const since = opts?.since ?? anonRunWindowStart();
  if (!anonKey) return 0;
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return 0;
    const { data, error } = await supabase
      .from(ANALYSES_TABLE)
      .select("id")
      .eq("anon_key", anonKey)
      .gte("created_at", since)
      .limit(cap);
    if (error) {
      console.error("[analyses:count] query failed —", error.message);
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    console.error("[analyses:count] threw —", err);
    return 0;
  }
}

// ── Write ────────────────────────────────────────────────────────────────

export interface SaveAnalysisInput {
  anonKey: string;
  userId?: string | null;
  result: IntakeResult;
  svi?: CompactSvi | null;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
}

/**
 * Persist one run. Returns the new row id, or null if anything at all went
 * wrong. NEVER throws: the caller returns the analysis to the founder either
 * way. A dropped row is a bug we can see in the logs; a lost analysis is a
 * lost customer.
 */
export async function saveAnalysis(
  input: SaveAnalysisInput,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error(
        "[analyses:save] supabase not configured — analysis NOT persisted",
      );
      return null;
    }
    const row = buildAnalysisRow(input);
    const { data, error } = await supabase
      .from(ANALYSES_TABLE)
      .insert(row)
      .select("id")
      .single();
    if (error) {
      console.error("[analyses:save] insert failed —", error.message, {
        inputKind: input.result.inputKind,
      });
      return null;
    }
    return (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[analyses:save] threw —", err);
    return null;
  }
}

// ── Read ─────────────────────────────────────────────────────────────────

export interface Viewer {
  userId?: string | null;
  anonKey?: string | null;
}

/**
 * Fetch one analysis if — and only if — the caller owns it. Returns null for
 * "does not exist" AND for "not yours", so the route can answer 404 to both
 * and never confirm that an id exists to someone who cannot see it.
 *
 * A claimed row (user_id set) is reachable by its owner alone: the anon key
 * that created it was cleared at claim time and must not be a second key to
 * an account's data.
 */
export async function getAnalysisForViewer(
  id: string,
  viewer: Viewer,
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[analyses:get] query failed —", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as StoredAnalysisRow;
  const authorised = row.user_id
    ? Boolean(viewer.userId) && viewer.userId === row.user_id
    : Boolean(viewer.anonKey) && viewer.anonKey === row.anon_key;
  if (!authorised) return null;
  return toClientAnalysis(row);
}

export const LIST_LIMIT = 50;

/** The caller's own runs, newest first. Empty array when nothing identifies them. */
export async function listAnalysesForViewer(
  viewer: Viewer,
  limit = LIST_LIMIT,
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase
    .from(ANALYSES_TABLE)
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (viewer.userId) {
    query = query.eq("user_id", viewer.userId);
  } else if (viewer.anonKey) {
    query = query.eq("anon_key", viewer.anonKey).is("user_id", null);
  } else {
    return [];
  }
  const { data, error } = await query;
  if (error) {
    console.error("[analyses:list] query failed —", error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

// ── Claim ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  analyses: number;
  guestAnalyses: number;
}

/**
 * Attach prior work to a freshly-authenticated account.
 *
 * Two sources:
 *   1. `analyses` rows written against the browser's anon cookie;
 *   2. `guest_analyses` rows bought with this email — someone paid A$3 for a
 *      report and, before migration 0124, could never reach it again.
 *
 * Idempotent by construction: both updates carry `user_id is null`, so a
 * second run matches nothing, updates nothing and returns zero. It never
 * re-stamps `claimed_at`, never duplicates, and never errors on a repeat.
 * Fail-soft: a failed claim is logged and reported as zero — it must never
 * break a signup or a login.
 */
export async function claimAnalyses(params: {
  userId: string;
  anonKey?: string | null;
  email?: string | null;
}): Promise<ClaimResult> {
  const result: ClaimResult = { analyses: 0, guestAnalyses: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) return result;
  const claimedAt = new Date().toISOString();

  if (params.anonKey) {
    try {
      const { data, error } = await supabase
        .from(ANALYSES_TABLE)
        .update({ user_id: params.userId, claimed_at: claimedAt })
        .eq("anon_key", params.anonKey)
        .is("user_id", null)
        .select("id");
      if (error) {
        console.error("[analyses:claim] analyses update failed —", error.message);
      } else {
        result.analyses = (data ?? []).length;
      }
    } catch (err) {
      console.error("[analyses:claim] analyses update threw —", err);
    }
  }

  const email = params.email?.trim().toLowerCase();
  if (email) {
    try {
      const { data, error } = await supabase
        .from(GUEST_ANALYSES_TABLE)
        .update({ user_id: params.userId, claimed_at: claimedAt })
        .eq("email", email)
        .is("user_id", null)
        .select("id");
      if (error) {
        console.error(
          "[analyses:claim] guest_analyses update failed —",
          error.message,
        );
      } else {
        result.guestAnalyses = (data ?? []).length;
      }
    } catch (err) {
      console.error("[analyses:claim] guest_analyses update threw —", err);
    }
  }

  return result;
}
