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
// `used` is the number of `evaluation_reports` rows (migration 0317) with
// paid_via='quota' inside the current UTC calendar month; the row is written
// by the route only AFTER the pipeline succeeded, so a failed run consumes
// nothing. The cost preview (`previewReportCharge`) is what the confirm
// dialog shows before anything runs — transparent-pricing rule.

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

export interface ReportQuota {
  /** Included reports per month; Number.MAX_SAFE_INTEGER when unlimited; 0 when the plan has none. */
  limit: number;
  /** paid_via='quota' rows this UTC calendar month. */
  used: number;
  remaining: number;
  unlimited: boolean;
}

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

export function buildQuota(limit: number, used: number): ReportQuota {
  const unlimited = limit >= Number.MAX_SAFE_INTEGER;
  return {
    limit,
    used,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    unlimited,
  };
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
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function resolvePlanId(planId: string | null | undefined): string {
  if (!planId) return "founder_free";
  return LEGACY_PLAN_MAP[planId]?.id ?? planId;
}

export async function getReportLimitForPlan(plan: string | null | undefined): Promise<number> {
  try {
    const row = await getPlanCached(resolvePlanId(plan));
    return reportLimitFromUsageLimits(row?.usage_limits ?? null);
  } catch {
    return 0;
  }
}

async function countQuotaUsedThisMonth(userId: string, now: Date): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { start, end } = monthWindow(now);
  const { count, error } = await supabase
    .from("evaluation_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("paid_via", "quota")
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) {
    // 42P01 = migration 0317 not applied yet → nothing used.
    if ((error as { code?: string }).code !== "42P01") {
      console.error("[blockid:evaluations:quota] count failed", error);
    }
    return 0;
  }
  return count ?? 0;
}

/** `{limit, used, remaining}` for the user's plan this calendar month. */
export async function getReportQuota(
  user: { id: string; plan?: string | null },
  now: Date = new Date(),
): Promise<ReportQuota> {
  const [limit, used] = await Promise.all([
    getReportLimitForPlan(user.plan ?? null),
    countQuotaUsedThisMonth(user.id, now),
  ]);
  return buildQuota(limit, used);
}

/** The cost preview shown before anything runs. */
export async function previewReportCharge(
  user: { id: string; plan?: string | null },
  kind: EvaluationReportKind,
): Promise<ReportCharge> {
  const [quota, balance] = await Promise.all([getReportQuota(user), getBalance(user.id)]);
  return resolveReportCharge(kind, quota, balance);
}

/** Latest evaluation_reports row per evaluation the user holds (for the list page). */
export async function listLastEvaluationReports(userId: string): Promise<Record<string, LastEvaluationReport>> {
  const out: Record<string, LastEvaluationReport> = {};
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("evaluation_reports")
    .select("id, evaluation_id, project_id, user_id, kind, paid_via, credits_cost, report_ref, share_token, svi_total, created_at")
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
}): Promise<EvaluationReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluation_reports")
    .insert({
      evaluation_id: input.evaluationId,
      project_id: input.projectId,
      user_id: input.userId,
      kind: input.kind,
      paid_via: input.paidVia,
      credits_cost: input.creditsCost,
      report_ref: input.reportRef,
      share_token: input.shareToken,
      svi_total: input.sviTotal,
    })
    .select("id, evaluation_id, project_id, user_id, kind, paid_via, credits_cost, report_ref, share_token, svi_total, created_at")
    .single();
  if (error || !data) {
    console.error("[blockid:evaluations:quota] evaluation_reports insert failed", error);
    return null;
  }
  return mapEvaluationReportRow(data as Row);
}
