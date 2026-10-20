// G35 Pricing v5 P4 — the "BlockID Reviewed" badge (plan §6.6).
//
// Rule: a report shows "BlockID Reviewed · <date> · <reviewer>" ONLY when
//   1. it is served at the Verified tier (order SKU / payg_tier → verified), AND
//   2. `assembled_reports.reviewed` is true (set by markReviewed; a refunded
//      Verified order sets it back to false — `revokeReviewBadge`).
// The badge is never stored inside report_json: every read path that serves
// an order report calls `readReviewBadgeState` + `attachReviewBadge` after the
// tier projection, so revoking it is a single column flip.
//
// The reviewer is named by `app_users.display_name`; an unset name reads
// "BlockID team" — an admin e-mail address never reaches a customer report.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportAccessTier, ReportReviewBadge, ReportV2 } from "@/lib/report-v2/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

export const REVIEW_BADGE_PREFIX = "BlockID Reviewed";
export const REVIEWER_FALLBACK_NAME = "BlockID team";

const DATE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });

/** "21 Oct 2026" — the review date in Sydney. */
export function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT.format(d);
}

/** Public reviewer name: trimmed display name (no e-mail-looking strings), else "BlockID team". */
export function reviewerPublicName(displayName: unknown): string {
  if (typeof displayName !== "string") return REVIEWER_FALLBACK_NAME;
  const clean = displayName.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean || clean.includes("@")) return REVIEWER_FALLBACK_NAME;
  return clean;
}

export function reviewBadgeLabel(reviewedAt: string, reviewerName: string): string {
  const date = formatReviewDate(reviewedAt);
  return [REVIEW_BADGE_PREFIX, date, reviewerName].filter(Boolean).join(" · ");
}

export interface ReviewBadgeState {
  reviewed: boolean;
  reviewedAt: string | null;
  reviewerName: string;
}

export function buildReviewBadge(state: ReviewBadgeState | null | undefined): ReportReviewBadge | null {
  if (!state?.reviewed || !state.reviewedAt) return null;
  const reviewerName = reviewerPublicName(state.reviewerName);
  return { reviewedAt: state.reviewedAt, reviewerName, label: reviewBadgeLabel(state.reviewedAt, reviewerName) };
}

/**
 * The served document with the badge attached when (and only when) the tier
 * is Verified and the stored row is reviewed; any stray `reviewBadge` on a
 * non-qualifying document is stripped.
 */
export function attachReviewBadge(report: ReportV2, tier: ReportAccessTier, state: ReviewBadgeState | null | undefined): ReportV2 {
  const badge = tier === "verified" ? buildReviewBadge(state) : null;
  if (badge) return { ...report, reviewBadge: badge };
  if (report.reviewBadge === undefined) return report;
  const copy = { ...report };
  delete copy.reviewBadge;
  return copy;
}

/**
 * `assembled_reports.reviewed / reviewed_at / reviewed_by` (0474) + the
 * reviewer's display name. Null when the columns are absent (0474 not
 * applied), the row is missing or the read fails — callers then serve the
 * report without a badge.
 */
export async function readReviewBadgeState(db: Db, reportId: string | null | undefined): Promise<ReviewBadgeState | null> {
  if (!reportId) return null;
  try {
    const { data, error } = await db.from("assembled_reports").select("reviewed, reviewed_at, reviewed_by").eq("id", reportId).maybeSingle();
    if (error || !data) return null;
    const row = data as { reviewed?: unknown; reviewed_at?: unknown; reviewed_by?: unknown };
    const reviewed = row.reviewed === true;
    const reviewedAt = typeof row.reviewed_at === "string" ? row.reviewed_at : null;
    let name: unknown = null;
    if (reviewed && typeof row.reviewed_by === "string") {
      try {
        const { data: u } = await db.from("app_users").select("display_name").eq("id", row.reviewed_by).maybeSingle();
        name = (u as { display_name?: unknown } | null)?.display_name ?? null;
      } catch {
        name = null;
      }
    }
    return { reviewed, reviewedAt, reviewerName: reviewerPublicName(name) };
  } catch {
    return null;
  }
}

/**
 * Remove the badge from a report (refund path — plan §6.4.5: "Verified bị
 * refund → bỏ badge"). Idempotent; returns true when the write succeeded.
 * W3's `charge.refunded` handler calls this for a refunded Verified order.
 */
export async function revokeReviewBadge(db: Db, reportId: string | null | undefined): Promise<boolean> {
  if (!reportId) return false;
  try {
    const { error } = await db.from("assembled_reports").update({ reviewed: false }).eq("id", reportId);
    return !error;
  } catch {
    return false;
  }
}
