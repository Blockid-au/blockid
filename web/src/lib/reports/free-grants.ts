// The free allowance — the ledger (G25-C, 2026-09-21, migration 0439).
//
// One `free_report_grants` row per free business report. The row is
// RESERVED before the analysis runs (`recordSubmission`, delivery_status
// `queued`, analysis_id null), attached to the saved `analyses` row once
// it exists (`attachAnalysis`), and stamped when the PDF e-mail goes out
// (`markDelivered`). A run that never saved gives its reservation back
// (`releaseGrant`).
//
// The UNIQUE (email_hash, sequence_no) index is the arbiter: two concurrent
// submissions from one address cannot both be "the first", and a third
// insert fails at the database whatever the counts said. `recordSubmission`
// retries the next sequence once, then answers `allowance_used`.
//
// Fail-soft on writes (log, return a value the route can act on), strict on
// reads — the same contract as lib/analyses/store.ts. Every reader is
// bounded so an admin page can never pull the whole table.

import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  FREE_REPORTS_PER_EMAIL,
  emptyFreeReportMetrics,
  foldFreeReportMetrics,
  freeReportsDailyCap,
  normaliseReportEmail,
  cleanReportEmail,
  utcDayStart,
  type FreeReportDeliveryStatus,
  type FreeReportGrantLite,
  type FreeReportMetrics,
  type FreeReportSource,
} from "./free-grants-rules";

export const FREE_REPORT_GRANTS_TABLE = "free_report_grants";

/** sha256 hex of the normalised address — the ledger's `email_hash`. */
export function hashReportEmail(normalised: string): string {
  return createHash("sha256").update(`free-report:${normalised}`, "utf8").digest("hex");
}

export interface FreeReportGrantRow {
  id: string;
  email_hash: string;
  email: string;
  project_id: string | null;
  analysis_id: string | null;
  ip_hash: string | null;
  submitted_at: string;
  delivered_at: string | null;
  delivery_status: FreeReportDeliveryStatus;
  sequence_no: 1 | 2;
  source: FreeReportSource;
}

const GRANT_COLUMNS =
  "id, email_hash, email, project_id, analysis_id, ip_hash, submitted_at, delivered_at, delivery_status, sequence_no, source";

/** The identity pair the ledger keys on. Null when the address is malformed. */
export function reportEmailIdentity(raw: unknown): { email: string; normalised: string; emailHash: string } | null {
  const email = cleanReportEmail(raw);
  const normalised = normaliseReportEmail(raw);
  if (!email || !normalised) return null;
  return { email, normalised, emailHash: hashReportEmail(normalised) };
}

export interface RemainingFreeReports {
  used: number;
  remaining: number;
  /** The rows behind `used` (newest first), for the resend / status views. */
  grants: FreeReportGrantRow[];
}

/**
 * How many free reports an address has left. Unavailable database → the
 * permissive answer (nothing used): a platform wobble must open the free
 * path, not wall it — the UNIQUE index still stops a third row.
 */
export async function remainingFreeReports(rawEmail: unknown): Promise<RemainingFreeReports> {
  const identity = reportEmailIdentity(rawEmail);
  if (!identity) return { used: 0, remaining: FREE_REPORTS_PER_EMAIL, grants: [] };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { used: 0, remaining: FREE_REPORTS_PER_EMAIL, grants: [] };
  const { data, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .select(GRANT_COLUMNS)
    .eq("email_hash", identity.emailHash)
    .order("sequence_no", { ascending: false })
    .limit(FREE_REPORTS_PER_EMAIL + 1);
  if (error) {
    console.error("[free-grants:remaining] query failed —", error.message);
    return { used: 0, remaining: FREE_REPORTS_PER_EMAIL, grants: [] };
  }
  const grants = (data as unknown as FreeReportGrantRow[] | null) ?? [];
  const used = grants.length;
  return { used, remaining: Math.max(0, FREE_REPORTS_PER_EMAIL - used), grants };
}

/** Free reports this IP hash started today (UTC). Null when the hash is unknown or the read failed. */
export async function countIpFreeReportsToday(ipHash: string | null, now: Date = new Date()): Promise<number | null> {
  if (!ipHash) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { count, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("submitted_at", utcDayStart(now.getTime()));
  if (error) {
    console.error("[free-grants:ip-today] query failed —", error.message);
    return null;
  }
  return count ?? 0;
}

/** Free reports submitted platform-wide today (UTC). 0 when the read failed (the cap then never fires — fail open). */
export async function countFreeReportsSubmittedToday(now: Date = new Date()): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .select("id", { count: "exact", head: true })
    .gte("submitted_at", utcDayStart(now.getTime()));
  if (error) {
    console.error("[free-grants:today] query failed —", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Is the platform cap reached for today? The cron reads this to decide whether guest rows may start. */
export async function freeReportsCapReached(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const cap = freeReportsDailyCap(env);
  const today = await countFreeReportsSubmittedToday(now);
  return today >= cap;
}

export type RecordSubmissionOutcome =
  | { ok: true; grant: FreeReportGrantRow }
  | { ok: false; reason: "allowance_used" | "invalid_email" | "unavailable" };

/**
 * Reserve the next free report for an address. `sequenceNo` is the caller's
 * best guess from `remainingFreeReports`; the UNIQUE index has the last
 * word — on a collision the next sequence is tried once, then the address
 * is out of free reports.
 */
export async function recordSubmission(input: {
  email: unknown;
  sequenceNo: 1 | 2;
  source: FreeReportSource;
  ipHash?: string | null;
  projectId?: string | null;
  analysisId?: string | null;
  now?: Date;
}): Promise<RecordSubmissionOutcome> {
  const identity = reportEmailIdentity(input.email);
  if (!identity) return { ok: false, reason: "invalid_email" };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const attempts: Array<1 | 2> = input.sequenceNo === 1 ? [1, 2] : [2];
  for (const sequenceNo of attempts) {
    const { data, error } = await supabase
      .from(FREE_REPORT_GRANTS_TABLE)
      .insert({
        email_hash: identity.emailHash,
        email: identity.email,
        project_id: input.projectId ?? null,
        analysis_id: input.analysisId ?? null,
        ip_hash: input.ipHash ?? null,
        submitted_at: (input.now ?? new Date()).toISOString(),
        delivery_status: "queued",
        sequence_no: sequenceNo,
        source: input.source,
      })
      .select(GRANT_COLUMNS)
      .single();
    if (!error && data) return { ok: true, grant: data as unknown as FreeReportGrantRow };
    // 23505 = unique_violation: that sequence already exists for the address.
    if (error && error.code === "23505") continue;
    console.error("[free-grants:record] insert failed —", error?.message ?? "no row");
    return { ok: false, reason: "unavailable" };
  }
  return { ok: false, reason: "allowance_used" };
}

/** Point the reservation at the saved analyses row. */
export async function attachAnalysis(grantId: string, analysisId: string, projectId?: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const patch: Record<string, unknown> = { analysis_id: analysisId };
  if (projectId) patch.project_id = projectId;
  const { error } = await supabase.from(FREE_REPORT_GRANTS_TABLE).update(patch).eq("id", grantId);
  if (error) {
    console.error("[free-grants:attach] update failed —", error.message);
    return false;
  }
  return true;
}

/**
 * Review v3.27.0 P1: a run that failed TERMINALLY (attempts exhausted, no
 * document) gives the address its allowance back — the grant row is deleted
 * so the next submission takes the same sequence number again. Returns the
 * number of rows released (0 when the analysis already has a document or no
 * grant).
 */
export async function releaseGrantForFailedAnalysis(analysisId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .delete()
    .eq("analysis_id", analysisId)
    .neq("delivery_status", "sent")
    .select("id");
  if (error) {
    console.error("[free-grants:release-failed] delete failed —", error.message);
    return 0;
  }
  return (data as Array<{ id: string }> | null)?.length ?? 0;
}

/** Give a reservation back (the run never produced a saved analysis). */
export async function releaseGrant(grantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from(FREE_REPORT_GRANTS_TABLE).delete().eq("id", grantId).is("analysis_id", null);
  if (error) console.error("[free-grants:release] delete failed —", error.message);
}

/**
 * Stamp the grant behind an analysis when its PDF e-mail went out (`sent`)
 * or provably did not (`failed`). Returns the row so the caller can emit
 * the funnel event with the grant id; null when no grant exists for the
 * analysis (a paid / entitled run) or the write failed.
 */
export async function markDelivered(
  analysisId: string,
  status: Extract<FreeReportDeliveryStatus, "sent" | "failed">,
  now: Date = new Date(),
): Promise<FreeReportGrantRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const patch: Record<string, unknown> = { delivery_status: status };
  if (status === "sent") patch.delivered_at = now.toISOString();
  const { data, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .update(patch)
    .eq("analysis_id", analysisId)
    .select(GRANT_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[free-grants:delivered] update failed —", error.message);
    return null;
  }
  return (data as unknown as FreeReportGrantRow | null) ?? null;
}

/** Which of these analyses have a free grant (the cron's cap hold applies only to those). Empty set on failure (nothing held). */
export async function grantedAnalysisIds(analysisIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = analysisIds.filter(Boolean).slice(0, 500);
  if (ids.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase.from(FREE_REPORT_GRANTS_TABLE).select("analysis_id").in("analysis_id", ids);
  if (error) {
    console.error("[free-grants:granted] query failed —", error.message);
    return out;
  }
  for (const r of (data as Array<{ analysis_id: string | null }> | null) ?? []) if (r.analysis_id) out.add(r.analysis_id);
  return out;
}

/** How long a reservation may sit with no analysis before it is treated as abandoned. */
export const STALE_RESERVATION_MS = 60 * 60 * 1000;

/**
 * Give back reservations whose run never saved (a crash between reserve and
 * save, or a release that failed). Called by the first-analysis cron. Returns
 * the number removed; 0 on failure.
 */
export async function releaseStaleReservations(now: Date = new Date()): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const before = new Date(now.getTime() - STALE_RESERVATION_MS).toISOString();
  const { data, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .delete()
    .is("analysis_id", null)
    .eq("delivery_status", "queued")
    .lt("submitted_at", before)
    .select("id");
  if (error) {
    console.error("[free-grants:stale] delete failed —", error.message);
    return 0;
  }
  return ((data as unknown[] | null) ?? []).length;
}

/** The grant behind an analysis, if any. */
export async function grantForAnalysis(analysisId: string): Promise<FreeReportGrantRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(FREE_REPORT_GRANTS_TABLE)
    .select(GRANT_COLUMNS)
    .eq("analysis_id", analysisId)
    .maybeSingle();
  if (error) {
    console.error("[free-grants:for-analysis] query failed —", error.message);
    return null;
  }
  return (data as unknown as FreeReportGrantRow | null) ?? null;
}

/** Upper bound on rows the metrics reader folds (newest first). */
export const FREE_REPORT_METRICS_ROW_LIMIT = 20_000;

/**
 * The `/api/status` + `/admin/funnel` block. Bounded; a failed read answers
 * the empty block with the configured cap (never throws — the status route
 * degrades, it does not 500).
 */
export async function readFreeReportMetrics(opts: { now?: Date; env?: NodeJS.ProcessEnv } = {}): Promise<FreeReportMetrics> {
  const now = opts.now ?? new Date();
  const cap = freeReportsDailyCap(opts.env ?? process.env);
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyFreeReportMetrics(cap, now.getTime());
  try {
    const { data, error } = await supabase
      .from(FREE_REPORT_GRANTS_TABLE)
      .select("email_hash, email, submitted_at, delivered_at, delivery_status")
      .order("submitted_at", { ascending: false })
      .limit(FREE_REPORT_METRICS_ROW_LIMIT);
    if (error) {
      console.error("[free-grants:metrics] query failed —", error.message);
      return emptyFreeReportMetrics(cap, now.getTime());
    }
    const rows = ((data as unknown as Array<FreeReportGrantLite & { email: string }> | null) ?? []);
    const convertedToPaid = await countConvertedToPaid(rows.map((r) => r.email));
    return foldFreeReportMetrics(rows, { now: now.getTime(), cap, convertedToPaid });
  } catch (err) {
    console.error("[free-grants:metrics] threw —", err);
    return emptyFreeReportMetrics(cap, now.getTime());
  }
}

/** How long `/api/status` reuses the last metrics read (monitors poll it). */
export const FREE_REPORT_METRICS_CACHE_MS = 60_000;
let metricsCache: { at: number; value: FreeReportMetrics } | null = null;

/** The metrics block with a short cache — for `/api/status`. `/admin/funnel` reads live. */
export async function readFreeReportMetricsCached(now: Date = new Date()): Promise<FreeReportMetrics> {
  if (metricsCache && now.getTime() - metricsCache.at < FREE_REPORT_METRICS_CACHE_MS) return metricsCache.value;
  const value = await readFreeReportMetrics({ now });
  metricsCache = { at: now.getTime(), value };
  return value;
}

/** Test hook. */
export function resetFreeReportMetricsCache(): void {
  metricsCache = null;
}

/** Distinct grant addresses that later paid: a paid guest A$3 order, or a member's paid Trusted Business Report order. */
/** PostgREST `in` filters ride on the URL — keep each chunk well under proxy limits (review 2026-09-21). */
const IN_CHUNK = 200;

function chunk<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function countConvertedToPaid(emails: string[]): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const distinct = Array.from(new Set(emails.map((e) => e.toLowerCase()))).slice(0, 2000);
  if (distinct.length === 0) return 0;
  const paid = new Set<string>();
  try {
    const byId = new Map<string, string>();
    for (const part of chunk(distinct)) {
      const { data: guests } = await supabase
        .from("guest_analyses")
        .select("email")
        .in("email", part)
        .in("status", ["paid", "analyzing", "delivered"])
        .limit(IN_CHUNK);
      for (const g of (guests as Array<{ email: string }> | null) ?? []) paid.add(g.email.toLowerCase());
      const { data: users } = await supabase.from("app_users").select("id, email").in("email", part).limit(IN_CHUNK);
      for (const u of (users as Array<{ id: string; email: string }> | null) ?? []) byId.set(u.id, u.email.toLowerCase());
    }
    for (const ids of chunk(Array.from(byId.keys()))) {
      const { data: orders } = await supabase
        .from("report_orders")
        .select("user_id")
        .in("user_id", ids)
        .in("status", ["PAID", "GENERATING", "READY", "EXPIRED"])
        .limit(IN_CHUNK * 4);
      for (const o of (orders as Array<{ user_id: string }> | null) ?? []) {
        const e = byId.get(o.user_id);
        if (e) paid.add(e);
      }
    }
  } catch (err) {
    console.error("[free-grants:converted] read failed —", err);
  }
  return paid.size;
}
