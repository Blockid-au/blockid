// report-quota — who pays for a Trust BizReport run from /workspace/evaluations
// (T0271, G12 sprint S3; docs/plans/evaluator-traction-2026-09-10.md §3b).
//
//   full report  → 1 of the plan's `usage_limits.reports_per_month`
//                  (Scout 10 / Firm 30 / Program 100; -1 / ≥9999 = unlimited)
//                  while any remain, otherwise FEATURE_COSTS.trust_report
//                  (3 credits = A$3);
//   re-score     → FEATURE_COSTS.trust_report_rescore (1 credit = A$1),
//                  never the quota — the quota is priced as "10 × A$3".
//
// Trial (G12 §3b, S7-C): while the user's Stripe subscription is `trialing`
// (`subscription_trial_state.status`, mirrored by the webhook, with
// trial_end > now) the included quota is TRIAL_REPORT_ALLOWANCE = 1 for the
// WHOLE trial — not the plan's reports_per_month — counted against
// paid_via='quota' rows since trial_start. Beyond that the run is charged to
// credits exactly as after the quota; never blocked. The plan quota applies
// automatically once the status flips to `active` (day 8 charge).
//
// `used` is the number of `evaluation_reports` rows (migration 0317) with
// paid_via='quota' inside the current UTC calendar month; the row is written
// by the route only AFTER the pipeline succeeded, so a failed run consumes
// nothing. The cost preview (`previewReportCharge`) is what the confirm
// dialog shows before anything runs — transparent-pricing rule. Items
// queued in the user's batches are reserved quota and are subtracted from
// the preview (review #8); a row created in the last 10 min for the same
// (evaluation, kind) — or carrying the client's idempotency key — is reused
// by the route instead of re-run (review #9, migration 0325).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPlanCached } from "@/lib/plans-db";
import { LEGACY_PLAN_MAP } from "@/lib/plans";
import { FEATURE_COSTS, getBalance } from "@/lib/credits";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvaluationReportKind = "full" | "rescore";
export type EvaluationReportPaidVia = "quota" | "credits";

export const REPORT_KIND_FEATURE: Record<EvaluationReportKind, "trust_report" | "trust_report_rescore"> = {
  full: "trust_report",
  rescore: "trust_report_rescore",
};

/** Included full reports for the whole card-required trial (not per month). */
export const TRIAL_REPORT_ALLOWANCE = 1;
/** Card-required evaluator trial length (plan §3b); used only to infer a missing trial_start. */
export const TRIAL_LENGTH_DAYS = 7;

export interface ReportTrial {
  /** status='trialing' and trial_end in the future. */
  active: boolean;
  ends_at: string | null;
  started_at: string | null;
  /** TRIAL_REPORT_ALLOWANCE — surfaced so the UI never hard-codes it. */
  allowance: number;
  /** paid_via='quota' rows since trial_start (0 when not trialing). */
  used: number;
  plan_id: string | null;
}

export const NO_TRIAL: ReportTrial = Object.freeze({
  active: false,
  ends_at: null,
  started_at: null,
  allowance: TRIAL_REPORT_ALLOWANCE,
  used: 0,
  plan_id: null,
}) as ReportTrial;

export interface ReportQuota {
  /**
   * Included reports per month (TRIAL_REPORT_ALLOWANCE for the whole trial
   * while `trial.active`); Number.MAX_SAFE_INTEGER when unlimited; 0 when
   * the plan has none.
   */
  limit: number;
  /** paid_via='quota' rows this UTC calendar month (since trial_start while trialing). */
  used: number;
  remaining: number;
  unlimited: boolean;
  /**
   * False when the plan row carries no `usage_limits.reports_per_month` at
   * all (accelerator_* Contact-Sales rows) — distinct from a configured 0.
   * Batch POST turns it into 402 quota_not_configured (review #14).
   */
  configured?: boolean;
  /** Trial state the quota was derived from (S7-C). */
  trial?: ReportTrial;
}

/** How long a just-written evaluation_reports row is returned instead of re-run (review #9). */
export const REPORT_REUSE_WINDOW_MS = 10 * 60 * 1000;

export interface ReportCharge {
  kind: EvaluationReportKind;
  /** `none` = neither quota nor enough credits → 402. */
  via: EvaluationReportPaidVia | "none";
  /** Credits that will be spent (0 when via=quota). */
  credits: number;
  /** Full price in credits regardless of how it is paid — for the dialog. */
  list_credits: number;
  balance: number;
  quota: ReportQuota;
  /** Quota left AFTER this run (unchanged when paid by credits). */
  remaining_quota: number;
}

export interface EvaluationReportRow {
  id: string;
  evaluationId: string;
  projectId: string;
  userId: string;
  kind: EvaluationReportKind;
  paidVia: EvaluationReportPaidVia;
  creditsCost: number;
  reportRef: string | null;
  shareToken: string | null;
  sviTotal: number | null;
  createdAt: string;
  idempotencyKey?: string | null;
}

export interface LastEvaluationReport {
  evaluationId: string;
  kind: EvaluationReportKind;
  createdAt: string;
  sviTotal: number | null;
  shareToken: string | null;
  reportUrl: string | null;
  pdfUrl: string | null;
}

type Row = Record<string, unknown>;

const REPORT_COLUMNS = "id, evaluation_id, project_id, user_id, kind, paid_via, credits_cost, report_ref, share_token, svi_total, created_at";
const REPORT_COLUMNS_WITH_KEY = "id, evaluation_id, project_id, user_id, kind, paid_via, credits_cost, report_ref, share_token, svi_total, created_at, idempotency_key";

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** `[startIso, endIso)` of the UTC calendar month containing `now`. */
export function monthWindow(now: Date = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1)).toISOString(),
    end: new Date(Date.UTC(y, m + 1, 1)).toISOString(),
  };
}

/** plans.usage_limits.reports_per_month → limit (unlimited sentinels -1 / ≥9999). */
export function reportLimitFromUsageLimits(limits: Record<string, unknown> | null | undefined): number {
  const raw = limits?.reports_per_month;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  if (n < 0 || n >= 9999) return Number.MAX_SAFE_INTEGER;
  return Math.floor(n);
}

export function buildQuota(limit: number, used: number, configured = true, trial: ReportTrial = NO_TRIAL): ReportQuota {
  const unlimited = limit >= Number.MAX_SAFE_INTEGER;
  return {
    limit,
    used,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    unlimited,
    configured,
    trial,
  };
}

/**
 * Trial quota: TRIAL_REPORT_ALLOWANCE for the whole trial, `used` = rows
 * since trial_start. Pure — `getReportQuota` picks this over the plan quota
 * whenever `trial.active`.
 */
export function buildTrialQuota(trial: ReportTrial): ReportQuota {
  return buildQuota(trial.allowance, trial.used, true, trial);
}

/** `subscription_trial_state` row → ReportTrial (active only while trialing and unexpired). */
export function trialFromState(
  row: { status?: string | null; trial_start?: string | null; trial_end?: string | null; plan_id?: string | null } | null | undefined,
  now: Date = new Date(),
  used = 0,
): ReportTrial {
  if (!row) return NO_TRIAL;
  const endMs = row.trial_end ? Date.parse(row.trial_end) : NaN;
  const active = row.status === "trialing" && Number.isFinite(endMs) && endMs > now.getTime();
  return {
    active,
    ends_at: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
    started_at: row.trial_start && Number.isFinite(Date.parse(row.trial_start)) ? new Date(row.trial_start).toISOString() : null,
    allowance: TRIAL_REPORT_ALLOWANCE,
    used: active ? used : 0,
    plan_id: row.plan_id ?? null,
  };
}

/** True when `usage_limits.reports_per_month` is present (any value, incl. 0). */
export function reportLimitIsConfigured(limits: Record<string, unknown> | null | undefined): boolean {
  const raw = limits?.reports_per_month;
  if (raw == null) return false;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n);
}

/**
 * Decide how a run is paid. Quota first for full reports; credits otherwise.
 * `balance` is the credit balance; `costs` default to FEATURE_COSTS.
 */
export function resolveReportCharge(
  kind: EvaluationReportKind,
  quota: ReportQuota,
  balance: number,
  costs: { full: number; rescore: number } = {
    full: FEATURE_COSTS.trust_report,
    rescore: FEATURE_COSTS.trust_report_rescore,
  },
): ReportCharge {
  const list = kind === "full" ? costs.full : costs.rescore;
  if (kind === "full" && quota.remaining > 0) {
    return {
      kind,
      via: "quota",
      credits: 0,
      list_credits: list,
      balance,
      quota,
      remaining_quota: quota.unlimited ? Number.MAX_SAFE_INTEGER : quota.remaining - 1,
    };
  }
  if (balance >= list) {
    return { kind, via: "credits", credits: list, list_credits: list, balance, quota, remaining_quota: quota.remaining };
  }
  return { kind, via: "none", credits: list, list_credits: list, balance, quota, remaining_quota: quota.remaining };
}

export function reportUrlForToken(token: string | null, base = ""): string | null {
  return token ? `${base}/tbr/${encodeURIComponent(token)}` : null;
}

export function pdfUrlForToken(token: string | null, base = ""): string | null {
  return token ? `${base}/api/svi/report/pdf?token=${encodeURIComponent(token)}` : null;
}

export function mapEvaluationReportRow(row: Row): EvaluationReportRow {
  const svi = row.svi_total == null ? null : Number(row.svi_total);
  return {
    id: String(row.id),
    evaluationId: String(row.evaluation_id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    kind: row.kind === "rescore" ? "rescore" : "full",
    paidVia: row.paid_via === "credits" ? "credits" : "quota",
    creditsCost: Number(row.credits_cost ?? 0) || 0,
    reportRef: row.report_ref == null ? null : String(row.report_ref),
    shareToken: row.share_token == null ? null : String(row.share_token),
    sviTotal: svi != null && Number.isFinite(svi) ? svi : null,
    createdAt: String(row.created_at ?? ""),
    idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A client idempotency key must be a uuid; anything else is treated as absent. */
export function normaliseIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return UUID_RE.test(v) ? v : null;
}

/** 42703 = undefined column → migration 0325 not applied yet. */
function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42703";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function resolvePlanId(planId: string | null | undefined): string {
  if (!planId) return "founder_free";
  return LEGACY_PLAN_MAP[planId]?.id ?? planId;
}

export async function getReportLimitForPlan(plan: string | null | undefined): Promise<number> {
  return (await getReportLimitInfoForPlan(plan)).limit;
}

/** `limit` plus whether the plan row configures reports_per_month at all. */
export async function getReportLimitInfoForPlan(plan: string | null | undefined): Promise<{ limit: number; configured: boolean }> {
  try {
    const row = await getPlanCached(resolvePlanId(plan));
    const limits = row?.usage_limits ?? null;
    return { limit: reportLimitFromUsageLimits(limits), configured: reportLimitIsConfigured(limits) };
  } catch {
    return { limit: 0, configured: false };
  }
}

/**
 * Items still queued or running across every batch the user owns — reserved
 * quota. POST /api/evaluations/batch and previewReportCharge subtract this
 * from the remaining reports_per_month so a queued batch and direct runs
 * cannot both claim the same slots (review #8). Lives here (not batch.ts)
 * because batch.ts imports this module.
 */
export async function countPendingBatchItems(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);
  if (error || !data || data.length === 0) return 0;
  const ids = (data as Row[]).map((r) => String(r.id));
  const { count, error: err2 } = await supabase
    .from("evaluation_batch_items")
    .select("id", { count: "exact", head: true })
    .in("batch_id", ids)
    .in("status", ["queued", "running"]);
  if (err2) return 0;
  return count ?? 0;
}

/** paid_via='quota' rows for the user inside `[start, end)` (end optional). */
async function countQuotaUsed(userId: string, start: string | null, end: string | null): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  let q = supabase
    .from("evaluation_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("paid_via", "quota");
  if (start) q = q.gte("created_at", start);
  if (end) q = q.lt("created_at", end);
  const { count, error } = await q;
  if (error) {
    // 42P01 = migration 0317 not applied yet → nothing used.
    if ((error as { code?: string }).code !== "42P01") {
      console.error("[blockid:evaluations:quota] count failed", error);
    }
    return 0;
  }
  return count ?? 0;
}

async function countQuotaUsedThisMonth(userId: string, now: Date): Promise<number> {
  const { start, end } = monthWindow(now);
  return countQuotaUsed(userId, start, end);
}

/**
 * The user's trial as the Stripe webhook mirrors it into
 * `subscription_trial_state` (register-with-card seeds the row with
 * status='trialing'; customer.subscription.updated/deleted rewrite `status`
 * from the Stripe subscription). No row / lookup error → not trialing.
 */
export async function getTrialState(userId: string, now: Date = new Date()): Promise<ReportTrial> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NO_TRIAL;
  const { data, error } = await supabase
    .from("subscription_trial_state")
    .select("status, trial_start, trial_end, plan_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code !== "42P01") {
      console.error("[blockid:evaluations:quota] trial lookup failed", error);
    }
    return NO_TRIAL;
  }
  return trialFromState(data as Parameters<typeof trialFromState>[0], now);
}

/** paid_via='quota' rows since the trial started (whole trial, not per month). */
export async function countTrialReportsUsed(userId: string, trial: Pick<ReportTrial, "started_at" | "ends_at">): Promise<number> {
  // Stripe omits `trial_start` on some subscription payloads; without a start
  // bound the count would cover the user's whole history and show "1/1 used"
  // to a re-trialling or previously paying evaluator. Treat unknown as 0.
  if (!trial.started_at) {
    // Never fail open on cost: bound the window by the trial length instead.
    if (!trial.ends_at) return 0;
    const endMs = Date.parse(trial.ends_at);
    if (!Number.isFinite(endMs)) return 0;
    const inferredStart = new Date(endMs - TRIAL_LENGTH_DAYS * 86_400_000).toISOString();
    return countQuotaUsed(userId, inferredStart, null);
  }
  return countQuotaUsed(userId, trial.started_at, null);
}

/**
 * `{limit, used, remaining, trial}` — TRIAL_REPORT_ALLOWANCE for the whole
 * trial while the subscription is `trialing`, otherwise the plan's
 * reports_per_month this calendar month.
 */
export async function getReportQuota(
  user: { id: string; plan?: string | null },
  now: Date = new Date(),
): Promise<ReportQuota> {
  const trial = await getTrialState(user.id, now);
  if (trial.active) {
    const used = await countTrialReportsUsed(user.id, trial);
    return buildTrialQuota({ ...trial, used });
  }
  const [info, used] = await Promise.all([
    getReportLimitInfoForPlan(user.plan ?? null),
    countQuotaUsedThisMonth(user.id, now),
  ]);
  return buildQuota(info.limit, used, info.configured, trial);
}

/**
 * The cost preview shown before anything runs. Items already queued in the
 * user's batches are reserved quota (review #8): they are subtracted from
 * `remaining` so a direct run never takes a slot a queued batch will need.
 */
export async function previewReportCharge(
  user: { id: string; plan?: string | null },
  kind: EvaluationReportKind,
): Promise<ReportCharge> {
  const [quota, balance, pending] = await Promise.all([
    getReportQuota(user),
    getBalance(user.id),
    countPendingBatchItems(user.id).catch(() => 0),
  ]);
  const reserved = quota.unlimited ? quota : buildQuota(quota.limit, quota.used + pending, quota.configured, quota.trial);
  return resolveReportCharge(kind, reserved, balance);
}

/**
 * A row for (evaluation, kind) that a retried POST should return instead of
 * running again (review #9): the one carrying `idempotencyKey`, else the
 * newest created inside REPORT_REUSE_WINDOW_MS. Null when neither exists.
 */
export async function findRecentEvaluationReport(input: {
  evaluationId: string;
  kind: EvaluationReportKind;
  idempotencyKey?: string | null;
  now?: Date;
  windowMs?: number;
}): Promise<EvaluationReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  if (input.idempotencyKey) {
    const { data, error } = await supabase
      .from("evaluation_reports")
      .select(REPORT_COLUMNS_WITH_KEY)
      .eq("evaluation_id", input.evaluationId)
      .eq("kind", input.kind)
      .eq("idempotency_key", input.idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (data) return mapEvaluationReportRow(data as Row);
    if (error && !isMissingColumn(error) && (error as { code?: string }).code !== "42P01") {
      console.error("[blockid:evaluations:quota] idempotency lookup failed", error);
    }
  }
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - (input.windowMs ?? REPORT_REUSE_WINDOW_MS)).toISOString();
  const { data, error } = await supabase
    .from("evaluation_reports")
    .select(REPORT_COLUMNS)
    .eq("evaluation_id", input.evaluationId)
    .eq("kind", input.kind)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapEvaluationReportRow(data as unknown as Row);
}

/** Latest evaluation_reports row per evaluation the user holds (for the list page). */
export async function listLastEvaluationReports(userId: string): Promise<Record<string, LastEvaluationReport>> {
  const out: Record<string, LastEvaluationReport> = {};
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("evaluation_reports")
    .select(REPORT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return out;
  for (const raw of data as Row[]) {
    const r = mapEvaluationReportRow(raw);
    if (out[r.evaluationId]) continue;
    out[r.evaluationId] = {
      evaluationId: r.evaluationId,
      kind: r.kind,
      createdAt: r.createdAt,
      sviTotal: r.sviTotal,
      shareToken: r.shareToken,
      reportUrl: reportUrlForToken(r.shareToken),
      pdfUrl: pdfUrlForToken(r.shareToken),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Record a successful run. For paid_via='quota' this row IS the quota
 * decrement. Call only after the pipeline returned.
 */
export async function recordEvaluationReport(input: {
  evaluationId: string;
  projectId: string;
  userId: string;
  kind: EvaluationReportKind;
  paidVia: EvaluationReportPaidVia;
  creditsCost: number;
  reportRef: string | null;
  shareToken: string | null;
  sviTotal: number | null;
  /** Client key (review #9); stored so a retried POST finds this row. */
  idempotencyKey?: string | null;
}): Promise<EvaluationReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const base: Row = {
    evaluation_id: input.evaluationId,
    project_id: input.projectId,
    user_id: input.userId,
    kind: input.kind,
    paid_via: input.paidVia,
    credits_cost: input.creditsCost,
    report_ref: input.reportRef,
    share_token: input.shareToken,
    svi_total: input.sviTotal,
  };
  const insertPlain = () => supabase.from("evaluation_reports").insert(base).select(REPORT_COLUMNS).single();
  const insertKeyed = () =>
    supabase.from("evaluation_reports").insert({ ...base, idempotency_key: input.idempotencyKey }).select(REPORT_COLUMNS_WITH_KEY).single();

  let res: { data: unknown; error: { code?: string } | null } = input.idempotencyKey ? await insertKeyed() : await insertPlain();
  // Migration 0325 not applied yet → write the row without the key rather
  // than lose the quota decrement / billing record.
  if (res.error && input.idempotencyKey && isMissingColumn(res.error)) {
    res = await insertPlain();
  }
  if (res.error || !res.data) {
    console.error("[blockid:evaluations:quota] evaluation_reports insert failed", res.error);
    return null;
  }
  return mapEvaluationReportRow(res.data as unknown as Row);
}
