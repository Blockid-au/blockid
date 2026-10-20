// G35 Pricing v5 P4 — "Mark reviewed" for a Verified report order (plan §6.6).
//
// markReviewed(db, { orderId, reviewer }) — admin-only, idempotent:
//
//   1. Guards: reviewer is admin; order exists; its tier is Verified; it is
//      IN_REVIEW (REFUNDED → "refunded"; anything else → "not_in_review");
//      it has a report. A READY order this flow already delivered answers
//      `alreadyReviewed: true` and changes nothing (no second e-mail).
//   2. Recompute (pure, recompute.ts): verification level via
//      lib/verification/level-engine.ts and evidence confidence via
//      lib/svi/evidence-confidence.ts from the ACCEPTED evidence.
//   3. Commit point — ONE compare-and-set UPDATE:
//        report_orders SET status=READY, reviewed_by/at, delivered_at
//        WHERE id=? AND status='IN_REVIEW'
//      PostgREST has no multi-statement transaction, so this CAS is the
//      lock: of two concurrent clicks (or a click racing W3's refund) exactly
//      one wins; the loser re-reads and answers alreadyReviewed / refunded.
//      Nothing customer-visible is written before it.
//   4. After the CAS (each step recorded; a failure lands in `warnings` and
//      a re-run REPAIRS it — READY + reviewed_by set + badge missing is the
//      repair state): assembled_reports.reviewed=true / reviewed_at / by /
//      payg_tier=verified (the badge), report_reviews → completed,
//      projects.verification_level (when it moved), the latest
//      svi_snapshots.evidence_confidence.
//   5. Investor Pack PDF from the reviewed report (investor-pack.ts) —
//      rendered directly, NO credits involved (the Verified price includes it).
//   6. E-mail the buyer (report link + pack attached), analytics
//      `payg_verified_reviewed`, audit rows (verified_review.completed,
//      verification.level_recomputed).
//
// Side-effect dependencies are injectable for tests.

import type { InvestorPackData } from "@/lib/pdf/investor-pack";
import type { LogUserActionInput } from "@/lib/audit/log";
import { nextState } from "@/lib/paywall/report-order-state";
import type { ReportV2 } from "@/lib/report-v2/schema";
import type { AnalysisLike } from "@/lib/svi/evidence-confidence";
import { buildReviewBadge, readReviewBadgeState, reviewerPublicName } from "./badge";
import { ensureReview, loadVerifiedReviewDetail, type ReviewDb, type ReviewItem, type VerifiedReviewDetail } from "./detail";
import { investorPackDataFromReport } from "./investor-pack";
import { recomputeAfterReview, type RecomputeResult, type ReviewedEvidence } from "./recompute";
import { toInstant } from "./sla";

type Row = Record<string, unknown>;

export interface Reviewer {
  id: string;
  displayName?: string | null;
  /** Caller-resolved admin flag (isAdmin(user)); false → "forbidden". */
  isAdmin: boolean;
}

export interface MarkReviewedDeps {
  now?: () => Date;
  renderInvestorPack?: (data: InvestorPackData) => Promise<Buffer>;
  sendReviewedEmail?: (args: {
    to: string;
    input: { startupName: string; reportUrl: string; badgeLabel: string; name?: string | null; accepted: number; reviewed: number };
    investorPack?: Buffer | null;
  }) => Promise<{ ok: boolean; reason?: string }>;
  track?: (name: string, params: Record<string, unknown>, opts: { userId?: string | null; eventId?: string }) => Promise<unknown>;
  audit?: (input: LogUserActionInput) => Promise<unknown>;
  siteUrl?: () => string;
}

export type MarkReviewedError = "forbidden" | "not_found" | "migration_pending" | "db_error" | "refunded" | "not_in_review" | "not_verified" | "no_report";

export interface MarkReviewedOk {
  ok: true;
  orderId: string;
  alreadyReviewed: boolean;
  /** True when this call finished a READY order whose post-commit steps had failed before. */
  repaired: boolean;
  reviewedAt: string;
  badgeLabel: string | null;
  previousLevel: number | null;
  verificationLevel: number | null;
  evidenceConfidence: number | null;
  emailSent: boolean;
  investorPackBytes: number;
  /** delivered_at ≤ sla_due_at (null when the order had no SLA). */
  slaMet: boolean | null;
  warnings: string[];
}

export type MarkReviewedResult = MarkReviewedOk | { ok: false; error: MarkReviewedError };

export const MARK_REVIEWED_ROUTE = "api/admin/verified-reviews/[orderId]/mark-reviewed/route.ts";

/** Reviewer outcome → recompute input. Claims are statements, not evidence: recorded, not graded. */
export function reviewedEvidence(items: readonly ReviewItem[]): ReviewedEvidence[] {
  return items
    .filter((i) => i.kind !== "claim" && i.decision)
    .map((i) => ({
      decision: i.decision!,
      dims: i.dims,
      // An accepted Evidence Hub row went through applyEvidenceReview approve → third_party_verified.
      level: i.kind === "hub" && i.decision === "accept" ? "third_party_verified" : i.level,
      source: i.source,
    }));
}

async function defaultDeps(): Promise<Required<MarkReviewedDeps>> {
  return {
    now: () => new Date(),
    renderInvestorPack: async (data) => (await import("./investor-pack")).renderVerifiedInvestorPack(data),
    sendReviewedEmail: async (args) => (await import("./email")).sendVerifiedReviewedEmail(args),
    track: async (name, params, opts) => {
      const { trackEvent } = await import("@/lib/analytics/events");
      return trackEvent(name as never, params as never, opts);
    },
    audit: async (input) => (await import("@/lib/audit/log")).logUserAction(input),
    siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, ""),
  };
}

async function readProject(db: ReviewDb, projectId: string | null): Promise<{ level: number | null; hasAbn: boolean; name: string | null }> {
  if (!projectId) return { level: null, hasAbn: false, name: null };
  try {
    let res = await db.from("projects").select("id, name, verification_level, abn").eq("id", projectId).maybeSingle();
    if (res.error) res = await db.from("projects").select("id, name, verification_level").eq("id", projectId).maybeSingle();
    const row = (res.data ?? null) as Row | null;
    const lvl = row?.verification_level;
    return { level: typeof lvl === "number" ? lvl : null, hasAbn: typeof row?.abn === "string" && row.abn.trim().length > 0, name: typeof row?.name === "string" ? row.name : null };
  } catch {
    return { level: null, hasAbn: false, name: null };
  }
}

async function latestSnapshot(db: ReviewDb, projectId: string | null): Promise<{ id: string; analysis: AnalysisLike | null } | null> {
  if (!projectId) return null;
  try {
    const { data, error } = await db.from("svi_snapshots").select("id, analysis_json").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    const a = (data as Row).analysis_json;
    return { id: String((data as Row).id), analysis: a && typeof a === "object" ? (a as AnalysisLike) : null };
  } catch {
    return null;
  }
}

/** Compare-and-set IN_REVIEW → READY. Returns true when THIS call moved the order. */
async function commitOrder(db: ReviewDb, orderId: string, reviewerId: string, nowIso: string): Promise<boolean | "error"> {
  try {
    const { data, error } = await db
      .from("report_orders")
      .update({ status: "READY", reviewed_by: reviewerId, reviewed_at: nowIso, delivered_at: nowIso })
      .eq("id", orderId)
      .eq("status", "IN_REVIEW")
      .select("id");
    if (error) return "error";
    return Array.isArray(data) && data.length > 0;
  } catch {
    return "error";
  }
}

function slaMet(detail: VerifiedReviewDetail, deliveredIso: string): boolean | null {
  const due = toInstant(detail.order.slaDueAt);
  const done = toInstant(deliveredIso);
  if (!due || !done) return null;
  return done.getTime() <= due.getTime();
}

export async function markReviewed(db: ReviewDb, input: { orderId: string; reviewer: Reviewer }, injected: MarkReviewedDeps = {}): Promise<MarkReviewedResult> {
  if (!input.reviewer?.isAdmin || !input.reviewer.id) return { ok: false, error: "forbidden" };
  const deps = { ...(await defaultDeps()), ...injected };
  const now = deps.now();
  const loaded = await loadVerifiedReviewDetail(db, input.orderId, { now });
  if (!loaded.ok) return loaded;
  const { detail, report } = loaded;
  const order = detail.order;

  if (order.tier !== "verified") return { ok: false, error: "not_verified" };
  if (order.status === "REFUNDED") return { ok: false, error: "refunded" };

  // Idempotency / repair.
  let repairing = false;
  if (order.status === "READY" || order.status === "SHARED") {
    if (!order.reviewedBy || !order.reviewedAt) return { ok: false, error: "not_in_review" };
    const badge = await readReviewBadgeState(db, order.reportId);
    if (badge?.reviewed) {
      return {
        ok: true,
        orderId: order.id,
        alreadyReviewed: true,
        repaired: false,
        reviewedAt: order.reviewedAt,
        badgeLabel: buildReviewBadge(badge)?.label ?? null,
        previousLevel: null,
        verificationLevel: detail.startup.verificationLevel,
        evidenceConfidence: null,
        emailSent: false,
        investorPackBytes: 0,
        slaMet: slaMet(detail, order.deliveredAt ?? order.reviewedAt),
        warnings: [],
      };
    }
    repairing = true;
  } else if (order.status !== "IN_REVIEW" || nextState("IN_REVIEW", "review_completed") !== "READY") {
    return { ok: false, error: "not_in_review" };
  }
  if (!order.reportId) return { ok: false, error: "no_report" };

  // 2. Recompute from accepted evidence (pure).
  const project = await readProject(db, order.projectId);
  const snapshot = await latestSnapshot(db, order.projectId);
  const items = reviewedEvidence(detail.items);
  const recompute: RecomputeResult = recomputeAfterReview({ currentLevel: project.level ?? detail.startup.verificationLevel, hasAbn: project.hasAbn, items, analysis: snapshot?.analysis ?? null });

  // 3. Commit point.
  const nowIso = now.toISOString();
  let reviewedAt = nowIso;
  let reviewerId = input.reviewer.id;
  if (!repairing) {
    const moved = await commitOrder(db, order.id, input.reviewer.id, nowIso);
    if (moved === "error") return { ok: false, error: "db_error" };
    if (!moved) {
      // Lost the race: a refund or another reviewer got there first.
      const again = await loadVerifiedReviewDetail(db, input.orderId, { now });
      if (again.ok && again.detail.order.status === "REFUNDED") return { ok: false, error: "refunded" };
      if (again.ok && (again.detail.order.status === "READY" || again.detail.order.status === "SHARED")) {
        // The winner is finishing the post-commit steps right now — never
        // repeat them (no second e-mail); report it as already reviewed.
        const won = again.detail.order;
        return {
          ok: true,
          orderId: won.id,
          alreadyReviewed: true,
          repaired: false,
          reviewedAt: won.reviewedAt ?? nowIso,
          badgeLabel: null,
          previousLevel: null,
          verificationLevel: again.detail.startup.verificationLevel,
          evidenceConfidence: null,
          emailSent: false,
          investorPackBytes: 0,
          slaMet: slaMet(again.detail, won.deliveredAt ?? won.reviewedAt ?? nowIso),
          warnings: [],
        };
      }
      return { ok: false, error: "not_in_review" };
    }
  } else {
    reviewedAt = order.reviewedAt!;
    reviewerId = order.reviewedBy!;
  }

  const warnings: string[] = [];
  const reviewerName = reviewerPublicName(await reviewerDisplayName(db, reviewerId, input.reviewer));
  const badge = buildReviewBadge({ reviewed: true, reviewedAt, reviewerName });

  // 4a. The badge.
  try {
    const { error } = await db.from("assembled_reports").update({ reviewed: true, reviewed_at: reviewedAt, reviewed_by: reviewerId, payg_tier: "verified" }).eq("id", order.reportId);
    if (error) warnings.push(`badge:${(error as { code?: string }).code ?? "write_failed"}`);
  } catch {
    warnings.push("badge:threw");
  }
  // 4b. The review row.
  const ensured = detail.review ? ({ ok: true, review: detail.review } as const) : await ensureReview(db, order);
  if (ensured.ok) {
    try {
      const { error } = await db.from("report_reviews").update({ status: "completed", completed_at: nowIso, reviewer_id: reviewerId }).eq("id", ensured.review.id);
      if (error) warnings.push("review_row:write_failed");
    } catch {
      warnings.push("review_row:threw");
    }
  } else {
    warnings.push(`review_row:${ensured.error}`);
  }
  // 4c. Verification level (only when it moved).
  if (recompute.levelChanged && order.projectId) {
    try {
      const { error } = await db.from("projects").update({ verification_level: recompute.verificationLevel, last_verified_at: nowIso, updated_at: nowIso }).eq("id", order.projectId);
      if (error) warnings.push("verification_level:write_failed");
    } catch {
      warnings.push("verification_level:threw");
    }
  }
  // 4d. Evidence confidence on the latest snapshot (fail-soft before 0419).
  if (snapshot) {
    try {
      const { error } = await db.from("svi_snapshots").update({ evidence_confidence: recompute.evidenceConfidence.score }).eq("id", snapshot.id);
      if (error && !["42703", "PGRST204"].includes(String((error as { code?: string }).code))) warnings.push("evidence_confidence:write_failed");
    } catch {
      warnings.push("evidence_confidence:threw");
    }
  }

  // 5. Investor Pack — rendered directly, no credits.
  let pack: Buffer | null = null;
  if (report) {
    try {
      const data = investorPackDataFromReport(report as ReportV2, { reviewBadge: badge?.label ?? null, reviewedAt, items: detail.items });
      pack = await deps.renderInvestorPack(data);
    } catch (err) {
      warnings.push("investor_pack:render_failed");
      console.warn("[verified-review] investor pack render failed", err instanceof Error ? err.message : String(err));
    }
  } else {
    warnings.push("investor_pack:no_report_json");
  }

  // 6. E-mail the buyer.
  let emailSent = false;
  if (detail.buyer.email) {
    try {
      const reviewedCount = items.length;
      const res = await deps.sendReviewedEmail({
        to: detail.buyer.email,
        input: {
          startupName: detail.startup.name ?? project.name ?? (report as ReportV2 | null)?.cover?.startupName ?? "your startup",
          reportUrl: `${deps.siteUrl()}/workspace/reports/business?order=${encodeURIComponent(order.id)}`,
          badgeLabel: badge?.label ?? "BlockID Reviewed",
          name: detail.buyer.name,
          accepted: items.filter((i) => i.decision === "accept").length,
          reviewed: reviewedCount,
        },
        investorPack: pack,
      });
      emailSent = res.ok;
      if (!res.ok) warnings.push(`email:${res.reason ?? "failed"}`);
    } catch {
      warnings.push("email:threw");
    }
  } else {
    warnings.push("email:no_buyer_email");
  }

  const met = slaMet(detail, repairing ? (order.deliveredAt ?? reviewedAt) : nowIso);
  const summary = {
    order_id: order.id,
    project_id: order.projectId,
    report_id: order.reportId,
    accepted: recompute.accepted,
    rejected: recompute.rejected,
    previous_level: recompute.previousLevel,
    verification_level: recompute.verificationLevel,
    evidence_confidence: recompute.evidenceConfidence.score,
    sla_met: met,
    email_sent: emailSent,
    investor_pack_bytes: pack?.length ?? 0,
    repaired: repairing,
    warnings,
  };
  try {
    await deps.audit({ userId: input.reviewer.id, action: "verified_review.completed", subjectType: "report_order", subjectId: order.id, fields: summary, route: MARK_REVIEWED_ROUTE });
    if (recompute.levelChanged && order.projectId) {
      await deps.audit({
        userId: input.reviewer.id,
        action: "verification.level_recomputed",
        subjectType: "business",
        subjectId: order.projectId,
        fields: { from: recompute.previousLevel, to: recompute.verificationLevel, reason: "verified_review", order_id: order.id },
        route: MARK_REVIEWED_ROUTE,
      });
    }
  } catch {
    /* audit never blocks */
  }
  try {
    await deps.track(
      "payg_verified_reviewed",
      {
        order_id: order.id,
        project_id: order.projectId ?? undefined,
        sla_met: met,
        accepted: recompute.accepted,
        rejected: recompute.rejected,
        verification_level: recompute.verificationLevel,
        evidence_confidence: recompute.evidenceConfidence.score,
        investor_pack: Boolean(pack),
        email_sent: emailSent,
      },
      { userId: detail.order.userId, eventId: `payg_verified_reviewed:${order.id}` },
    );
  } catch {
    /* analytics never blocks */
  }

  return {
    ok: true,
    orderId: order.id,
    alreadyReviewed: false,
    repaired: repairing,
    reviewedAt,
    badgeLabel: badge?.label ?? null,
    previousLevel: recompute.previousLevel,
    verificationLevel: recompute.verificationLevel,
    evidenceConfidence: recompute.evidenceConfidence.score,
    emailSent,
    investorPackBytes: pack?.length ?? 0,
    slaMet: met,
    warnings,
  };
}

async function reviewerDisplayName(db: ReviewDb, reviewerId: string, reviewer: Reviewer): Promise<string | null> {
  if (reviewer.id === reviewerId && reviewer.displayName) return reviewer.displayName;
  try {
    const { data } = await db.from("app_users").select("display_name").eq("id", reviewerId).maybeSingle();
    const n = (data as Row | null)?.display_name;
    return typeof n === "string" ? n : null;
  } catch {
    return null;
  }
}
