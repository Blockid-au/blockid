// GET /api/cron/reseller-weekly-digest
//
// Weekly leading-signal digest per reseller. Runs Mondays (crontab.production)
// per docs/plans/reseller-module-plan.md § U.5 P11 (weekly KPI digest to
// admin@blockid.au) and Customer-Success advisory §24 rec #3 which asked for
// last-login recency + time-to-first-report leading indicators so CS can act
// BEFORE attributed_churn_30d fires.
//
// For each active reseller, iterate attributed customers, join svi_analyses
// (via app_users.email — the joining shape used elsewhere in the codebase),
// compute buildLeadingSignalSummary, and email admin@blockid.au a CSV+HTML
// digest with one row per reseller.
//
// ?skip_email=1 → dry-run (no email send). Response body still includes the
// per-reseller summary counts so operators can eyeball the numbers.
//
// Auth: shared CRON_SECRET pattern (matches sibling reseller-* cron routes).

import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildDigestSnapshot,
  readLastDigestSnapshot,
  readLastNDigestSnapshots,
  serialiseDigestSnapshot,
  type DigestSnapshot,
} from "@/lib/reseller/digest-snapshot";
import {
  computeDigestSnapshotDelta,
  formatDigestSnapshotDeltaSection,
  type DigestSnapshotDelta,
} from "@/lib/reseller/digest-snapshot-delta";
import {
  computeDigestSnapshotMetricDelta,
  formatDigestSnapshotMetricDeltaSection,
  type DigestSnapshotMetricDelta,
} from "@/lib/reseller/digest-snapshot-metric-delta";
import {
  computeDigestSnapshotMetricPctChange,
  formatDigestSnapshotMetricPctChangeSection,
  type DigestSnapshotMetricPctChange,
} from "@/lib/reseller/digest-snapshot-metric-pct-change";
import {
  computeDigestSnapshotPerResellerDelta,
  formatDigestSnapshotPerResellerDeltaSection,
  type DigestSnapshotPerResellerDelta,
} from "@/lib/reseller/digest-snapshot-per-reseller-delta";
import {
  computeDigestSnapshotRollingTrend,
  formatDigestSnapshotRollingTrendSection,
  type DigestSnapshotRollingTrend,
} from "@/lib/reseller/digest-snapshot-rolling-trend";
import {
  computeDigestSnapshotPerResellerRollingTrend,
  formatDigestSnapshotPerResellerRollingTrendSection,
  type DigestSnapshotPerResellerRollingTrend,
} from "@/lib/reseller/digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerMetricPctChange,
  formatDigestSnapshotPerResellerMetricPctChangeSection,
  type DigestSnapshotPerResellerMetricPctChange,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change";
import {
  computeDigestSnapshotPerResellerMetricPctChangePerMetric,
  formatDigestSnapshotPerResellerMetricPctChangePerMetricSection,
  type DigestSnapshotPerResellerMetricPctChangePerMetric,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-per-metric";
import {
  computeDigestSnapshotPerResellerMetricPctChangeCoverage,
  formatDigestSnapshotPerResellerMetricPctChangeCoverageSection,
  type DigestSnapshotPerResellerMetricPctChangeCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-coverage";
import {
  computeDigestSnapshotPerResellerPctChangeCoverage,
  formatDigestSnapshotPerResellerPctChangeCoverageSection,
  type DigestSnapshotPerResellerPctChangeCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-coverage";
import {
  computeDigestSnapshotPerResellerMetricPctChangePerReseller,
  formatDigestSnapshotPerResellerMetricPctChangePerResellerSection,
  type DigestSnapshotPerResellerMetricPctChangePerReseller,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-per-reseller";
import {
  computeDigestSnapshotTopMovers,
  formatDigestSnapshotTopMoversSection,
  type DigestSnapshotTopMovers,
} from "@/lib/reseller/digest-snapshot-top-movers";
import {
  computeDigestSnapshotTopMoversPerMetric,
  formatDigestSnapshotTopMoversPerMetricSection,
  type DigestSnapshotTopMoversPerMetric,
} from "@/lib/reseller/digest-snapshot-top-movers-per-metric";
import {
  computeDigestSnapshotTopMoversPerReseller,
  formatDigestSnapshotTopMoversPerResellerSection,
  type DigestSnapshotTopMoversPerReseller,
} from "@/lib/reseller/digest-snapshot-top-movers-per-reseller";
import {
  computeDigestSnapshotDirectionStreaks,
  formatDigestSnapshotDirectionStreaksSection,
  type DigestSnapshotDirectionStreaks,
} from "@/lib/reseller/digest-snapshot-direction-streaks";
import {
  computeDigestSnapshotPerResellerDirectionStreaks,
  formatDigestSnapshotPerResellerDirectionStreaksSection,
  type DigestSnapshotPerResellerDirectionStreaks,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPctChangeStreaks,
  formatDigestSnapshotPctChangeStreaksSection,
  type DigestSnapshotPctChangeStreaks,
} from "@/lib/reseller/digest-snapshot-pct-change-streaks";
import {
  computeDigestSnapshotPerResellerPctChangeStreaks,
  formatDigestSnapshotPerResellerPctChangeStreaksSection,
  type DigestSnapshotPerResellerPctChangeStreaks,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPctChangeStreakCoverage,
  formatDigestSnapshotPctChangeStreakCoverageSection,
  type DigestSnapshotPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-coverage";
import {
  computeDigestSnapshotPerResellerPctChangeStreakCoverage,
  formatDigestSnapshotPerResellerPctChangeStreakCoverageSection,
  type DigestSnapshotPerResellerPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-coverage";
import {
  computeDigestSnapshotDirectionStreakCoverage,
  formatDigestSnapshotDirectionStreakCoverageSection,
  type DigestSnapshotDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-direction-streak-coverage";
import {
  computeDigestSnapshotPerResellerDirectionStreakCoverage,
  formatDigestSnapshotPerResellerDirectionStreakCoverageSection,
  type DigestSnapshotPerResellerDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-coverage";
import {
  computeDigestSnapshotPerMetricDirectionStreakCoverage,
  formatDigestSnapshotPerMetricDirectionStreakCoverageSection,
  type DigestSnapshotPerMetricDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-coverage";
import {
  computeDigestSnapshotPerMetricPctChangeStreakCoverage,
  formatDigestSnapshotPerMetricPctChangeStreakCoverageSection,
  type DigestSnapshotPerMetricPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-coverage";
import {
  computeDigestSnapshotDirectionStreakLeaderboard,
  formatDigestSnapshotDirectionStreakLeaderboardSection,
  type DigestSnapshotDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-direction-streak-leaderboard";
import {
  computeDigestSnapshotPctChangeStreakLeaderboard,
  formatDigestSnapshotPctChangeStreakLeaderboardSection,
  type DigestSnapshotPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotPerMetricDirectionStreakLeaderboard,
  formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection,
  type DigestSnapshotPerMetricDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-leaderboard";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLeaderboard,
  formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection,
  type DigestSnapshotPerMetricPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotPerResellerDirectionStreakLeaderboard,
  formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection,
  type DigestSnapshotPerResellerDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-leaderboard";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLeaderboard,
  formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection,
  type DigestSnapshotPerResellerPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotDirectionStreakLengthHistogram,
  formatDigestSnapshotDirectionStreakLengthHistogramSection,
  type DigestSnapshotDirectionStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-direction-streak-length-histogram";
import {
  computeDigestSnapshotPctChangeStreakLengthHistogram,
  formatDigestSnapshotPctChangeStreakLengthHistogramSection,
  type DigestSnapshotPctChangeStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-length-histogram";
import {
  computeDigestSnapshotPerResellerDirectionStreakLengthHistogram,
  formatDigestSnapshotPerResellerDirectionStreakLengthHistogramSection,
  type DigestSnapshotPerResellerDirectionStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-length-histogram";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram,
  formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection,
  type DigestSnapshotPerResellerPctChangeStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-length-histogram";
import {
  buildAnomalySummary,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  type AuditLogRow,
} from "@/lib/reseller/audit-anomaly";
import {
  computeAttributedChurn30dByReseller,
  formatWeeklyDigestAttributedChurnSection,
  type AttributedChurnRow,
  type ChurnCandidateRow,
} from "@/lib/reseller/attributed-churn-30d";
import {
  computeAttributedMrrByReseller,
  formatWeeklyDigestAttributedMrrSection,
  type AttributedMrrRow,
  type AttributedSubscriptionRow,
} from "@/lib/reseller/attributed-mrr";
import {
  computeNetContributionByReseller,
  formatWeeklyDigestNetContributionSection,
  type NetContributionInput,
  type NetContributionRow,
} from "@/lib/reseller/attributed-net-contribution";
import {
  computeBudgetUtilization,
  formatWeeklyDigestBudgetSection,
  type BudgetUtilizationRow,
} from "@/lib/reseller/budget-utilization";
import {
  computeClawbackExposureByReseller,
  formatWeeklyDigestClawbackExposureSection,
  type ClawbackExposureRow,
  type ExposedCommissionRow,
} from "@/lib/reseller/clawback-exposure";
import {
  computeContributionMargins,
  formatWeeklyDigestContributionMarginSection,
  type ContributionMargins,
} from "@/lib/reseller/contribution-margin";
import {
  COHORT_MONTHS_WINDOW,
  computeCohortVelocityByReseller,
  formatWeeklyDigestCohortVelocitySection,
  recentCohortKeys,
  type ActivationEventRow,
  type AttributionCohortRow,
  type CohortVelocityRow,
} from "@/lib/reseller/cohort-velocity";
import {
  computeClearedMtdByReseller,
  formatWeeklyDigestClearedMtdSection,
  type ClearedCommissionRow,
  type ClearedMtdRow,
} from "@/lib/reseller/commission-cleared-mtd";
import {
  computeMonthlyUsage,
  monthKey as creditMonthKey,
  type ResellerCreditGrantRow,
} from "@/lib/reseller/credit-grants";
import { HUMAN_BLOCKED_ITEMS } from "@/lib/reseller/human-blocked-registry";
import {
  buildLeadingSignalSummary,
  type AttributedCustomerRow,
  type AttributedReportRow,
} from "@/lib/reseller/leading-signals";
import {
  LEDGER_DRIFT_WINDOW_DAYS,
  computeLedgerDriftByReseller,
  formatWeeklyDigestLedgerDriftSection,
  type CommissionDriftRow,
  type LedgerDriftRow,
  type RevenueEventDriftRow,
} from "@/lib/reseller/ledger-drift-events";
import {
  computeGstReconciliationDeltaByReseller,
  formatWeeklyDigestGstReconciliationDeltaSection,
  type GstLedgerRow,
  type GstReconciliationDeltaRow,
} from "@/lib/reseller/gst-reconciliation-delta";
import {
  LTV_REVENUE_KINDS,
  computeLtvCacByReseller,
  formatWeeklyDigestLtvCacSection,
  type CacCommissionRow,
  type LtvCacRow,
  type LtvRevenueRow,
} from "@/lib/reseller/ltv-cac";
import {
  computeSandboxShare,
  formatWeeklyDigestSandboxShareSection,
  type SandboxShareRow,
} from "@/lib/reseller/sandbox-share-of-budget";
import {
  computeTierMixByReseller,
  formatWeeklyDigestTierMixSection,
  type TierMixAttributionRow,
  type TierMixRow,
} from "@/lib/reseller/tier-mix";
import {
  formatWeeklyDigestAnomaliesSection,
  formatWeeklyDigestCsv,
  formatWeeklyDigestEmail,
  formatWeeklyDigestHumanBlockedSection,
  isoWeekKey,
  type WeeklyDigestRow,
} from "@/lib/reseller/weekly-digest";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

interface ResellerMetaRow {
  id: string;
  code: string;
  display_name: string | null;
  monthly_credit_budget: number | null;
  monthly_sandbox_credits: number | null;
}

interface AppUserRow {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

interface SviAnalysisRow {
  email: string;
  created_at: string;
}

interface AttributionRow {
  reseller_id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
  attributed_at: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const now = new Date();
  const week = isoWeekKey(now);

  const { data: resellersData, error: resellersErr } = await supabase
    .from("resellers")
    .select("id, code, display_name, monthly_credit_budget, monthly_sandbox_credits")
    .eq("status", "active");
  if (resellersErr) {
    return NextResponse.json(
      { ok: false, reason: "resellers_query_failed", error: resellersErr.message },
      { status: 500 },
    );
  }
  const resellers = (resellersData ?? []) as ResellerMetaRow[];
  if (resellers.length === 0) {
    return NextResponse.json({ ok: true, week, reseller_count: 0, emailed: false });
  }

  const resellerIds = resellers.map((r) => r.id);
  const { data: attribData, error: attribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, subject_type, subject_user_id, subject_project_id, attributed_at")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (attribErr) {
    return NextResponse.json(
      { ok: false, reason: "attributions_query_failed", error: attribErr.message },
      { status: 500 },
    );
  }
  const attributions = (attribData ?? []) as AttributionRow[];

  // Resolve project attributions to user_ids so the per-reseller customer
  // list mirrors scope.allowedCustomerIds() semantics.
  const projectIds = new Set<string>();
  for (const a of attributions) {
    if (a.subject_type === "project" && a.subject_project_id) {
      projectIds.add(a.subject_project_id);
    }
  }
  const projectToUser = new Map<string, string>();
  if (projectIds.size > 0) {
    const { data: projRows, error: projErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .in("id", Array.from(projectIds));
    if (projErr) {
      return NextResponse.json(
        { ok: false, reason: "projects_query_failed", error: projErr.message },
        { status: 500 },
      );
    }
    for (const p of (projRows ?? []) as { id: string; user_id: string }[]) {
      projectToUser.set(p.id, p.user_id);
    }
  }

  const customersByReseller = new Map<string, Set<string>>();
  for (const a of attributions) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectToUser.get(a.subject_project_id) ?? null;
    }
    if (!uid) continue;
    const set = customersByReseller.get(a.reseller_id) ?? new Set<string>();
    set.add(uid);
    customersByReseller.set(a.reseller_id, set);
  }

  const allUserIds = Array.from(
    new Set(Array.from(customersByReseller.values()).flatMap((s) => Array.from(s))),
  );

  let usersById = new Map<string, AppUserRow>();
  let userIdByEmail = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: userRows, error: userErr } = await supabase
      .from("app_users")
      .select("id, email, created_at, last_login_at")
      .in("id", allUserIds);
    if (userErr) {
      return NextResponse.json(
        { ok: false, reason: "app_users_query_failed", error: userErr.message },
        { status: 500 },
      );
    }
    for (const u of (userRows ?? []) as AppUserRow[]) {
      usersById.set(u.id, u);
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  // Bridge svi_analyses (email-keyed, no user_id column) → user_id via the
  // app_users.email map built above. Missing/unknown emails are silently
  // dropped by leading-signals so a stray report cannot poison the rollup.
  let reportsByUser = new Map<string, AttributedReportRow[]>();
  if (userIdByEmail.size > 0) {
    const emails = Array.from(userIdByEmail.keys());
    const { data: sviRows, error: sviErr } = await supabase
      .from("svi_analyses")
      .select("email, created_at")
      .in("email", emails);
    if (sviErr) {
      return NextResponse.json(
        { ok: false, reason: "svi_query_failed", error: sviErr.message },
        { status: 500 },
      );
    }
    for (const s of (sviRows ?? []) as SviAnalysisRow[]) {
      if (!s.email) continue;
      const uid = userIdByEmail.get(s.email.toLowerCase());
      if (!uid) continue;
      const list = reportsByUser.get(uid) ?? [];
      list.push({ user_id: uid, generated_at: s.created_at });
      reportsByUser.set(uid, list);
    }
  }

  const digestRows: WeeklyDigestRow[] = [];
  for (const r of resellers) {
    const uids = Array.from(customersByReseller.get(r.id) ?? []);
    const customers: AttributedCustomerRow[] = uids
      .map((uid) => usersById.get(uid))
      .filter((u): u is AppUserRow => Boolean(u))
      .map((u) => ({
        id: u.id,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
      }));
    const reports: AttributedReportRow[] = uids.flatMap(
      (uid) => reportsByUser.get(uid) ?? [],
    );
    const summary = buildLeadingSignalSummary({ customers, reports, now });
    digestRows.push({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      summary,
    });
  }

  const csv = formatWeeklyDigestCsv(week, digestRows);
  // Preserve the header block separately so P11.25 can splice the top-movers
  // executive summary (computed later, once the rolling-trend fold lands) right
  // after the header without touching any of the drill-down sections appended
  // to `html` in between.
  const digestHeader = formatWeeklyDigestEmail(week, digestRows);
  let html = digestHeader;

  // Fold in audit-log anomaly hotspots (P10 dry-run per plan Verification #5).
  // Scope the query to the active reseller set so a stale terminated reseller
  // can't inflate the counts. Failures are logged and skipped — the leading-
  // signal digest is the primary content and must ship even when audit
  // telemetry is unavailable.
  const anomalyWindowStart = new Date(
    now.getTime() - DEFAULT_ANOMALY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const { data: auditRows, error: auditErr } = await supabase
    .from("reseller_audit_log")
    .select("reseller_id, actor_user_id, subject_user_id, action, created_at")
    .in("reseller_id", resellerIds)
    .gte("created_at", anomalyWindowStart.toISOString());
  let anomalySummary: ReturnType<typeof buildAnomalySummary> | null = null;
  if (auditErr) {
    console.error("[reseller-weekly-digest] audit_log query failed", auditErr.message);
  } else {
    anomalySummary = buildAnomalySummary((auditRows ?? []) as AuditLogRow[], { now });
    const resellerDisplayNames: Record<string, string> = {};
    for (const r of resellers) {
      resellerDisplayNames[r.id] = r.display_name ?? r.code;
    }
    const section = formatWeeklyDigestAnomaliesSection(anomalySummary, resellerDisplayNames);
    if (section) html += section;
  }

  // COO advisory rec #1: surface the two open human_blocked escalations
  // (P1.5 InfoVision H.20 ABN + GST; P8.5 Stripe add-on price env vars) so
  // admin@blockid.au sees them in the Monday email without grepping the goal
  // file. Static registry — see human-blocked-registry.ts for the source list.
  const humanBlockedSection = formatWeeklyDigestHumanBlockedSection(HUMAN_BLOCKED_ITEMS);
  if (humanBlockedSection) html += humanBlockedSection;

  // P11 canonical KPI (`credit_budget_utilization` + `sandbox_share_of_budget`
  // from reseller-module-goal.md `weekly_digest_kpis`). Roll monthly grants
  // per reseller for the current UTC month_key so ops sees each partner's
  // month-to-date share of monthly_credit_budget + monthly_sandbox_credits
  // without hand-hitting /admin/resellers. Failures degrade to a skipped
  // section so the leading-signal digest still ships.
  const currentMonthKey = creditMonthKey(now);
  let budgetRows: BudgetUtilizationRow[] = [];
  const { data: grantRows, error: grantErr } = await supabase
    .from("reseller_credit_grants")
    .select("reseller_id, kind, amount, month_key, over_budget, created_at, sandbox_project_id, target_user_id")
    .in("reseller_id", resellerIds)
    .eq("month_key", currentMonthKey);
  let budgetSkippedReason: string | null = null;
  if (grantErr) {
    console.error("[reseller-weekly-digest] budget grant query failed", grantErr.message);
    budgetSkippedReason = "budget_query_failed";
  } else {
    const grantsByReseller = new Map<string, ResellerCreditGrantRow[]>();
    for (const g of (grantRows ?? []) as ResellerCreditGrantRow[]) {
      const list = grantsByReseller.get(g.reseller_id) ?? [];
      list.push(g);
      grantsByReseller.set(g.reseller_id, list);
    }
    budgetRows = resellers.map((r) => {
      const usage = computeMonthlyUsage(
        grantsByReseller.get(r.id) ?? [],
        currentMonthKey,
      );
      return {
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        utilization: computeBudgetUtilization({
          monthly_credit_budget: r.monthly_credit_budget ?? 0,
          monthly_sandbox_credits: r.monthly_sandbox_credits ?? 0,
          grant_credits_used: usage.grant_credits_used,
          sandbox_credits_used: usage.sandbox_credits_used,
        }),
      };
    });
    const budgetSection = formatWeeklyDigestBudgetSection(budgetRows, currentMonthKey);
    if (budgetSection) html += budgetSection;
  }

  // P11.2 canonical KPI (`tier_mix` from reseller-module-goal.md
  // `weekly_digest_kpis`). Distribution of active attributed customers across
  // the 0/10/20/30/40 wholesale-tier ladder (U.15.1). Query resolves promo
  // codes via reseller_promotion_codes so the digest never leaks per-customer
  // rows — only the aggregate counts land in the section. Failures degrade to
  // a skipped section so the earlier signals still ship.
  let tierMixRows: TierMixRow[] = [];
  let tierMixSkippedReason: string | null = null;
  // Re-issue a scoped attribution query with promotion_code_id — the earlier
  // attribution select is a hot path shared with the leading-signal rollup and
  // widening it with a nullable column would ripple through the customer-set
  // typing for no gain (the tier-mix section only needs reseller_id + promo_id).
  const { data: tierAttribData, error: tierAttribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, promotion_code_id")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (tierAttribErr) {
    console.error("[reseller-weekly-digest] tier-mix attribs query failed", tierAttribErr.message);
    tierMixSkippedReason = "tier_attribs_query_failed";
  } else {
    const tierAttribs = (tierAttribData ?? []) as {
      reseller_id: string;
      promotion_code_id: string | null;
    }[];
    const promoIdSet = new Set<string>();
    for (const a of tierAttribs) {
      if (a.promotion_code_id) promoIdSet.add(a.promotion_code_id);
    }
    const tierByPromo = new Map<string, number>();
    if (promoIdSet.size > 0) {
      const { data: promoRows, error: promoErr } = await supabase
        .from("reseller_promotion_codes")
        .select("id, tier_pct")
        .in("id", Array.from(promoIdSet));
      if (promoErr) {
        console.error("[reseller-weekly-digest] tier-mix promo query failed", promoErr.message);
        tierMixSkippedReason = "tier_promo_query_failed";
      } else {
        for (const p of (promoRows ?? []) as { id: string; tier_pct: number }[]) {
          tierByPromo.set(p.id, p.tier_pct);
        }
      }
    }
    if (!tierMixSkippedReason) {
      const rows: TierMixAttributionRow[] = tierAttribs.map((a) => ({
        reseller_id: a.reseller_id,
        tier_pct: a.promotion_code_id
          ? (tierByPromo.get(a.promotion_code_id) ?? null)
          : null,
      }));
      const mixByReseller = computeTierMixByReseller(resellerIds, rows);
      tierMixRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        mix: mixByReseller.get(r.id) ?? {
          counts: { 0: 0, 10: 0, 20: 0, 30: 0, 40: 0 },
          none: 0,
          total: 0,
        },
      }));
      const tierMixSection = formatWeeklyDigestTierMixSection(tierMixRows);
      if (tierMixSection) html += tierMixSection;
    }
  }

  // P11.3 canonical KPI (`commission_cleared_mtd` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller cleared-commission count + AUD total
  // for the current UTC month. Joins reseller_commission_events(event_type=
  // 'cleared', created_at >= start-of-month) against parent reseller_commissions
  // for reseller_id + commission_aud_cents. Failures degrade to a skipped
  // section so the earlier signals still ship.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const clearedMonthKey = currentMonthKey;
  let clearedMtdRows: ClearedMtdRow[] = [];
  let clearedMtdSkippedReason: string | null = null;
  const { data: clearedEventRows, error: clearedEventErr } = await supabase
    .from("reseller_commission_events")
    .select("commission_id, created_at")
    .eq("event_type", "cleared")
    .gte("created_at", monthStart.toISOString());
  if (clearedEventErr) {
    console.error(
      "[reseller-weekly-digest] cleared events query failed",
      clearedEventErr.message,
    );
    clearedMtdSkippedReason = "cleared_events_query_failed";
  } else {
    const clearedEvents = (clearedEventRows ?? []) as {
      commission_id: string;
      created_at: string;
    }[];
    const commissionIds = Array.from(
      new Set(clearedEvents.map((e) => e.commission_id).filter(Boolean)),
    );
    const commissionById = new Map<
      string,
      { reseller_id: string; commission_aud_cents: number }
    >();
    if (commissionIds.length > 0) {
      const { data: commissionRows, error: commissionErr } = await supabase
        .from("reseller_commissions")
        .select("id, reseller_id, commission_aud_cents")
        .in("id", commissionIds);
      if (commissionErr) {
        console.error(
          "[reseller-weekly-digest] cleared commissions query failed",
          commissionErr.message,
        );
        clearedMtdSkippedReason = "cleared_commissions_query_failed";
      } else {
        for (const c of (commissionRows ?? []) as {
          id: string;
          reseller_id: string;
          commission_aud_cents: number;
        }[]) {
          commissionById.set(c.id, {
            reseller_id: c.reseller_id,
            commission_aud_cents: c.commission_aud_cents,
          });
        }
      }
    }
    if (!clearedMtdSkippedReason) {
      const clearedRows: ClearedCommissionRow[] = [];
      for (const e of clearedEvents) {
        const parent = commissionById.get(e.commission_id);
        if (!parent) continue;
        clearedRows.push({
          reseller_id: parent.reseller_id,
          commission_aud_cents: parent.commission_aud_cents,
        });
      }
      const mtdByReseller = computeClearedMtdByReseller(resellerIds, clearedRows);
      clearedMtdRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        mtd: mtdByReseller.get(r.id) ?? { cleared_count: 0, cleared_cents: 0 },
      }));
      const clearedMtdSection = formatWeeklyDigestClearedMtdSection(
        clearedMtdRows,
        clearedMonthKey,
      );
      if (clearedMtdSection) html += clearedMtdSection;
    }
  }

  // P11.4 canonical KPI (`clawback_exposure` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller sum of commissions still inside the
  // clawback window — status IN ('pending_clearance','dispute_open') on
  // reseller_commissions_current. Ops reads this alongside commission_cleared_mtd
  // (P11.3): cleared is realised revenue, exposure is the still-at-risk pile
  // that could be clawed back if a refund/dispute lands before pending_until.
  // Failures degrade to a skipped section so the earlier signals still ship.
  let clawbackRows: ClawbackExposureRow[] = [];
  let clawbackSkippedReason: string | null = null;
  const { data: exposedRows, error: exposedErr } = await supabase
    .from("reseller_commissions_current")
    .select("reseller_id, commission_aud_cents, status")
    .in("reseller_id", resellerIds)
    .in("status", ["pending_clearance", "dispute_open"]);
  if (exposedErr) {
    console.error(
      "[reseller-weekly-digest] clawback exposure query failed",
      exposedErr.message,
    );
    clawbackSkippedReason = "clawback_query_failed";
  } else {
    const exposed = (exposedRows ?? []) as ExposedCommissionRow[];
    const exposureByReseller = computeClawbackExposureByReseller(
      resellerIds,
      exposed,
    );
    clawbackRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      exposure: exposureByReseller.get(r.id) ?? {
        pending_count: 0,
        pending_cents: 0,
        dispute_count: 0,
        dispute_cents: 0,
        total_count: 0,
        total_cents: 0,
      },
    }));
    const clawbackSection = formatWeeklyDigestClawbackExposureSection(clawbackRows);
    if (clawbackSection) html += clawbackSection;
  }

  // P11.5 canonical KPI (`attributed_mrr` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller sum of monthly recurring revenue from
  // attributed customers whose subscription_trial_state.status='active'. Ops
  // reads this alongside clawback_exposure (P11.4): MRR is the running-revenue
  // book, exposure is the still-at-risk pile that could reverse. Yearly plans
  // normalise ÷12 to match the v_mrr_active view from migration 0083. Reuses
  // the customersByReseller map built for leading-signals so no extra
  // attribution round-trip is needed. Failures degrade to a skipped section so
  // the earlier signals still ship.
  let mrrRows: AttributedMrrRow[] = [];
  let mrrSkippedReason: string | null = null;
  if (allUserIds.length === 0) {
    mrrRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      mrr: { active_subs: 0, mrr_cents: 0 },
    }));
    const mrrSection = formatWeeklyDigestAttributedMrrSection(mrrRows);
    if (mrrSection) html += mrrSection;
  } else {
    const { data: subRows, error: subErr } = await supabase
      .from("subscription_trial_state")
      .select("user_id, plan_id, status")
      .in("user_id", allUserIds)
      .eq("status", "active");
    if (subErr) {
      console.error("[reseller-weekly-digest] mrr subs query failed", subErr.message);
      mrrSkippedReason = "mrr_subs_query_failed";
    } else {
      const subs = (subRows ?? []) as {
        user_id: string;
        plan_id: string | null;
        status: string;
      }[];
      const planIds = Array.from(
        new Set(subs.map((s) => s.plan_id).filter((id): id is string => Boolean(id))),
      );
      const planById = new Map<
        string,
        { interval: string | null; price_aud_cents: number }
      >();
      if (planIds.length > 0) {
        const { data: planRows, error: planErr } = await supabase
          .from("plans")
          .select("id, interval, price_aud_cents")
          .in("id", planIds);
        if (planErr) {
          console.error("[reseller-weekly-digest] mrr plans query failed", planErr.message);
          mrrSkippedReason = "mrr_plans_query_failed";
        } else {
          for (const p of (planRows ?? []) as {
            id: string;
            interval: string | null;
            price_aud_cents: number | null;
          }[]) {
            planById.set(p.id, {
              interval: p.interval,
              price_aud_cents: p.price_aud_cents ?? 0,
            });
          }
        }
      }
      if (!mrrSkippedReason) {
        // Reverse-lookup user_id → reseller_id from customersByReseller.
        // First-seen wins on the exceedingly rare case of an attribution row
        // shared across resellers so MRR is never double-counted.
        const userToReseller = new Map<string, string>();
        for (const [rid, uids] of customersByReseller.entries()) {
          for (const uid of uids) {
            if (!userToReseller.has(uid)) userToReseller.set(uid, rid);
          }
        }
        const attributedSubs: AttributedSubscriptionRow[] = [];
        for (const s of subs) {
          const rid = userToReseller.get(s.user_id);
          if (!rid) continue;
          const plan = s.plan_id ? planById.get(s.plan_id) : null;
          attributedSubs.push({
            reseller_id: rid,
            plan_id: s.plan_id,
            price_aud_cents: plan?.price_aud_cents ?? 0,
            interval: plan?.interval ?? null,
          });
        }
        const mrrByReseller = computeAttributedMrrByReseller(resellerIds, attributedSubs);
        mrrRows = resellers.map((r) => ({
          reseller_id: r.id,
          reseller_code: r.code,
          reseller_display_name: r.display_name ?? r.code,
          mrr: mrrByReseller.get(r.id) ?? { active_subs: 0, mrr_cents: 0 },
        }));
        const mrrSection = formatWeeklyDigestAttributedMrrSection(mrrRows);
        if (mrrSection) html += mrrSection;
      }
    }
  }

  // P11.6 canonical KPI (`attributed_net_contribution` from reseller-module-goal.md
  // `weekly_digest_kpis`). Composite bottom-line per reseller:
  //   net = attributed_mrr − commission_cleared_mtd − credit_cogs_mtd
  // Sourced by folding the three earlier sections' aggregates so no extra
  // Supabase round-trip is needed. Skipped when any of the three feeder
  // sections was itself skipped (so a partial digest never emits a misleading
  // margin column against zero-input).
  let netContributionRows: NetContributionRow[] = [];
  let netContributionSkippedReason: string | null = null;
  if (budgetSkippedReason) {
    netContributionSkippedReason = `budget_upstream_${budgetSkippedReason}`;
  } else if (clearedMtdSkippedReason) {
    netContributionSkippedReason = `cleared_upstream_${clearedMtdSkippedReason}`;
  } else if (mrrSkippedReason) {
    netContributionSkippedReason = `mrr_upstream_${mrrSkippedReason}`;
  } else {
    const mrrById = new Map(mrrRows.map((r) => [r.reseller_id, r.mrr.mrr_cents]));
    const clearedById = new Map(
      clearedMtdRows.map((r) => [r.reseller_id, r.mtd.cleared_cents]),
    );
    // Total monthly credit consumption = grant_used + sandbox_used from P11.1
    // budgetRows. Both dimensions draw on the same AI provider bill so both
    // count against COGS.
    const creditsUsedById = new Map(
      budgetRows.map((r) => [
        r.reseller_id,
        r.utilization.grant_used + r.utilization.sandbox_used,
      ]),
    );
    const inputs: NetContributionInput[] = resellers.map((r) => ({
      reseller_id: r.id,
      mrr_cents: mrrById.get(r.id) ?? 0,
      commission_cleared_mtd_cents: clearedById.get(r.id) ?? 0,
      credits_used_mtd: creditsUsedById.get(r.id) ?? 0,
    }));
    const netByReseller = computeNetContributionByReseller(resellerIds, inputs);
    netContributionRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      net: netByReseller.get(r.id) ?? {
        revenue_cents: 0,
        commission_cost_cents: 0,
        credit_cogs_cents: 0,
        net_contribution_cents: 0,
      },
    }));
    const netSection = formatWeeklyDigestNetContributionSection(
      netContributionRows,
      currentMonthKey,
    );
    if (netSection) html += netSection;
  }

  // P11.34 canonical KPI (`contribution_margin_pct` from reseller-module-goal.md
  // `weekly_digest_kpis`). Dedicated margin projection folded from the P11.6
  // NetContributionRow list — sorted by margin desc so most-profitable partners
  // land first (opposite of P11.6's code-alphabetical sort). Skipped when the
  // upstream net-contribution feeder itself was skipped so a partial digest
  // never emits a stale margin section against zero-input. Cron-route wiring
  // for the P11.34 pure lib (mirrors the P11.14→P11.15 / P11.17→P11.18 /
  // P11.20→P11.21 / P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 /
  // P11.28→P11.29 / P11.30→P11.31 / P11.32→P11.33 pure-lib-first pattern).
  let contributionMargins: ContributionMargins | null = null;
  let contributionMarginSkippedReason: string | null = null;
  if (netContributionSkippedReason) {
    contributionMarginSkippedReason = `net_upstream_${netContributionSkippedReason}`;
  } else {
    contributionMargins = computeContributionMargins(
      netContributionRows,
      currentMonthKey,
    );
    const marginSection =
      formatWeeklyDigestContributionMarginSection(contributionMargins);
    if (marginSection) html += marginSection;
  }

  // P11.7 canonical KPI (`attributed_churn_30d` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller count of attributed customers whose
  // subscription_trial_state.status flipped to canceled or trial_ended_no_payment
  // inside the last 30 days. Loss-side twin of P11.5 attributed_mrr — ops reads
  // MRR alongside churn to see whether the running-revenue book is growing or
  // eroding. Query is a second scoped subscription_trial_state select because
  // the earlier P11.5 select is status='active' only; widening it with an OR on
  // status would ripple through the mrr rollup for no gain. Failures degrade to
  // a skipped section so the earlier signals still ship.
  let churnRows: AttributedChurnRow[] = [];
  let churnSkippedReason: string | null = null;
  const attributedTotals = new Map<string, number>();
  for (const [rid, uids] of customersByReseller.entries()) {
    attributedTotals.set(rid, uids.size);
  }
  if (allUserIds.length === 0) {
    churnRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      churn: {
        churned_count: 0,
        canceled_count: 0,
        trial_ended_count: 0,
        attributed_total: attributedTotals.get(r.id) ?? 0,
        churn_pct: 0,
      },
    }));
    const churnSection = formatWeeklyDigestAttributedChurnSection(churnRows);
    if (churnSection) html += churnSection;
  } else {
    const { data: churnSubRows, error: churnSubErr } = await supabase
      .from("subscription_trial_state")
      .select("user_id, status, updated_at")
      .in("user_id", allUserIds)
      .in("status", ["canceled", "trial_ended_no_payment"]);
    if (churnSubErr) {
      console.error(
        "[reseller-weekly-digest] churn subs query failed",
        churnSubErr.message,
      );
      churnSkippedReason = "churn_subs_query_failed";
    } else {
      const churnSubs = (churnSubRows ?? []) as {
        user_id: string;
        status: string | null;
        updated_at: string | null;
      }[];
      // Reverse-lookup user_id → reseller_id from customersByReseller.
      // First-seen wins on the exceedingly rare case of an attribution row
      // shared across resellers so churn is never double-counted — same posture
      // as P11.5 attributed-mrr.
      const userToReseller = new Map<string, string>();
      for (const [rid, uids] of customersByReseller.entries()) {
        for (const uid of uids) {
          if (!userToReseller.has(uid)) userToReseller.set(uid, rid);
        }
      }
      const candidateRows: ChurnCandidateRow[] = [];
      for (const s of churnSubs) {
        const rid = userToReseller.get(s.user_id);
        if (!rid) continue;
        candidateRows.push({
          reseller_id: rid,
          status: s.status,
          updated_at: s.updated_at,
        });
      }
      const churnByReseller = computeAttributedChurn30dByReseller(
        resellerIds,
        candidateRows,
        { now, attributedTotals },
      );
      churnRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        churn: churnByReseller.get(r.id) ?? {
          churned_count: 0,
          canceled_count: 0,
          trial_ended_count: 0,
          attributed_total: attributedTotals.get(r.id) ?? 0,
          churn_pct: 0,
        },
      }));
      const churnSection = formatWeeklyDigestAttributedChurnSection(churnRows);
      if (churnSection) html += churnSection;
    }
  }

  // P11.8 canonical KPI (`ledger_drift_events` from reseller-module-goal.md
  // `weekly_digest_kpis`). Reconciles revenue_events (CFO ledger) against
  // reseller_commissions (payout ledger) on stripe_event_id inside a rolling
  // 7-day window scoped to the active reseller set. Two buckets per reseller:
  //   • missing_commission — revenue-recognising events with reseller_id set
  //     had no matching commission row (payout would silently skip).
  //   • orphan_commission — commission rows whose stripe event has no matching
  //     revenue_events row in the window (manual insert or handler misconfig).
  // Failures degrade to a skipped section so the earlier signals still ship.
  const driftWindowStart = new Date(
    now.getTime() - LEDGER_DRIFT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  let driftRows: LedgerDriftRow[] = [];
  let driftSkippedReason: string | null = null;
  const { data: driftRevenueRows, error: driftRevenueErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, stripe_event_id, kind, ts")
    .in("reseller_id", resellerIds)
    .gte("ts", driftWindowStart.toISOString());
  if (driftRevenueErr) {
    console.error(
      "[reseller-weekly-digest] drift revenue query failed",
      driftRevenueErr.message,
    );
    driftSkippedReason = "drift_revenue_query_failed";
  } else {
    const { data: driftCommissionRows, error: driftCommissionErr } = await supabase
      .from("reseller_commissions")
      .select("reseller_id, stripe_event_id, created_at")
      .in("reseller_id", resellerIds)
      .gte("created_at", driftWindowStart.toISOString());
    if (driftCommissionErr) {
      console.error(
        "[reseller-weekly-digest] drift commission query failed",
        driftCommissionErr.message,
      );
      driftSkippedReason = "drift_commission_query_failed";
    } else {
      const driftByReseller = computeLedgerDriftByReseller(
        resellerIds,
        (driftRevenueRows ?? []) as RevenueEventDriftRow[],
        (driftCommissionRows ?? []) as CommissionDriftRow[],
      );
      driftRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        drift: driftByReseller.get(r.id) ?? {
          missing_commission_count: 0,
          orphan_commission_count: 0,
          total_drift_count: 0,
        },
      }));
      const driftSection = formatWeeklyDigestLedgerDriftSection(driftRows);
      if (driftSection) html += driftSection;
    }
  }

  // P11.9 canonical KPI (`gst_reconciliation_delta` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller month-to-date ledger-side GST from
  // revenue_events.gst_aud_cents scoped to the active reseller set. Positive
  // kinds (subscribe/renewal/upgrade/downgrade/trial_convert) add to
  // positive_gst_cents; refund/chargeback add absolute magnitude to
  // reversal_gst_cents; net = positive − reversal. Complements the portfolio-
  // wide P7.3 monthly reconciliation cron (which pages against Stripe's
  // invoice.tax on an A$1 tolerance) by surfacing per-reseller attribution
  // ahead of the monthly close. Failures degrade to a skipped section.
  let gstDeltaRows: GstReconciliationDeltaRow[] = [];
  let gstDeltaSkippedReason: string | null = null;
  const { data: gstLedgerRows, error: gstLedgerErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, kind, gst_aud_cents")
    .in("reseller_id", resellerIds)
    .gte("ts", monthStart.toISOString());
  if (gstLedgerErr) {
    console.error(
      "[reseller-weekly-digest] gst ledger query failed",
      gstLedgerErr.message,
    );
    gstDeltaSkippedReason = "gst_ledger_query_failed";
  } else {
    const gstDeltaByReseller = computeGstReconciliationDeltaByReseller(
      resellerIds,
      (gstLedgerRows ?? []) as GstLedgerRow[],
    );
    gstDeltaRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      delta: gstDeltaByReseller.get(r.id) ?? {
        positive_count: 0,
        positive_gst_cents: 0,
        reversal_count: 0,
        reversal_gst_cents: 0,
        net_gst_cents: 0,
      },
    }));
    const gstDeltaSection = formatWeeklyDigestGstReconciliationDeltaSection(
      gstDeltaRows,
      currentMonthKey,
    );
    if (gstDeltaSection) html += gstDeltaSection;
  }

  // P11.10 canonical KPI (`cohort_velocity` from reseller-module-goal.md
  // `weekly_digest_kpis`, D2-CFO-07 cohort_velocity_median_days). Per-reseller
  // × per-cohort (last COHORT_MONTHS_WINDOW UTC months) funnel-speed aggregate:
  // how many customers were attributed in the cohort, how many have their first
  // svi_analysis on record, and the median days from attribution_ts →
  // first_report_ts across activated customers. Reuses the projectToUser +
  // reportsByUser structures already resolved above for the leading-signal
  // section so no extra Supabase round-trip is needed. Failures degrade to a
  // skipped section (skipped_reason='cohort_upstream_empty_reports') only when
  // the reports pipeline itself skipped upstream — the reseller_attributions
  // read above already errors out early if it fails so this section inherits
  // that gate.
  const cohortMonths = recentCohortKeys(now, COHORT_MONTHS_WINDOW);
  const cohortAttribRows: AttributionCohortRow[] = [];
  for (const a of attributions) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectToUser.get(a.subject_project_id) ?? null;
    }
    if (!uid) continue;
    cohortAttribRows.push({
      reseller_id: a.reseller_id,
      subject_user_id: uid,
      attributed_at: a.attributed_at,
    });
  }
  const cohortActivationRows: ActivationEventRow[] = [];
  for (const [uid, reports] of reportsByUser.entries()) {
    for (const r of reports) {
      cohortActivationRows.push({ user_id: uid, generated_at: r.generated_at });
    }
  }
  const cohortByReseller = computeCohortVelocityByReseller(
    resellerIds,
    cohortMonths,
    cohortAttribRows,
    cohortActivationRows,
  );
  const cohortVelocityRows: CohortVelocityRow[] = resellers.map((r) => ({
    reseller_id: r.id,
    reseller_code: r.code,
    reseller_display_name: r.display_name ?? r.code,
    cohorts: cohortByReseller.get(r.id)?.cohorts ?? cohortMonths.map((m) => ({
      cohort_month: m,
      attributed_count: 0,
      activated_count: 0,
      activation_pct: 0,
      median_days_to_activation: null,
    })),
  }));
  const cohortSection = formatWeeklyDigestCohortVelocitySection(cohortVelocityRows);
  if (cohortSection) html += cohortSection;

  // P11.11 canonical KPI (`ltv_cac_per_reseller` from reseller-module-goal.md
  // `weekly_digest_kpis`, D2-CFO-07). Channel-health golden ratio per reseller:
  //   LTV  = Σ revenue_events.net_aud_cents scoped to reseller_id (all-time)
  //   CAC  = Σ reseller_commissions_current.commission_aud_cents WHERE status='cleared'
  //   ratio = LTV / CAC (rendered as N.NN×)
  // GST-net revenue is used on the LTV side because the GST portion is remitted
  // to the ATO and never lands as BlockID take-home — so the ratio compares
  // BlockID's realised revenue against realised commission cost. Pending +
  // disputed commissions are excluded because P11.4 clawback_exposure already
  // surfaces the still-at-risk pile. Failures degrade to a skipped section
  // (skipped_reason='ltv_revenue_query_failed' | 'ltv_commission_query_failed')
  // so the earlier signals still ship.
  let ltvCacRows: LtvCacRow[] = [];
  let ltvCacSkippedReason: string | null = null;
  const { data: ltvRevenueData, error: ltvRevenueErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, net_aud_cents, kind")
    .in("reseller_id", resellerIds)
    .in("kind", LTV_REVENUE_KINDS as unknown as string[]);
  if (ltvRevenueErr) {
    console.error(
      "[reseller-weekly-digest] ltv revenue query failed",
      ltvRevenueErr.message,
    );
    ltvCacSkippedReason = "ltv_revenue_query_failed";
  } else {
    const { data: ltvCommissionData, error: ltvCommissionErr } = await supabase
      .from("reseller_commissions_current")
      .select("reseller_id, commission_aud_cents")
      .in("reseller_id", resellerIds)
      .eq("status", "cleared");
    if (ltvCommissionErr) {
      console.error(
        "[reseller-weekly-digest] ltv commission query failed",
        ltvCommissionErr.message,
      );
      ltvCacSkippedReason = "ltv_commission_query_failed";
    } else {
      const ltvCacByReseller = computeLtvCacByReseller(
        resellerIds,
        (ltvRevenueData ?? []) as LtvRevenueRow[],
        (ltvCommissionData ?? []) as CacCommissionRow[],
        attributedTotals,
      );
      ltvCacRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        ltv_cac: ltvCacByReseller.get(r.id) ?? {
          lifetime_revenue_cents: 0,
          cumulative_cleared_commission_cents: 0,
          attributed_customers: attributedTotals.get(r.id) ?? 0,
          ltv_per_customer_cents: 0,
          cac_per_customer_cents: 0,
          ltv_cac_ratio_hundredths: null,
        },
      }));
      const ltvCacSection = formatWeeklyDigestLtvCacSection(ltvCacRows);
      if (ltvCacSection) html += ltvCacSection;
    }
  }

  // P11.12 canonical KPI (`sandbox_share_of_budget` from reseller-module-goal.md
  // `weekly_digest_kpis`). Complementary to P11.1 credit-budget utilization
  // which reports sandbox_used vs monthly_sandbox_credits (sandbox against its
  // OWN cap). This section reports two different ratios: (a) sandbox as a
  // fraction of TOTAL consumption (sandbox / (sandbox + grants)) — channel-
  // health signal for "experimentation vs delivery"; and (b) sandbox as a
  // fraction of the primary monthly_credit_budget dial (H.15) — capacity
  // signal for "how much of the customer budget is sandbox eating." Reuses
  // budgetRows already computed for P11.1 so no additional supabase query
  // fires; when P11.1 skipped (budget_query_failed) this section skips too
  // via the same skipped_reason so ops sees a single upstream failure.
  const sandboxShareRows: SandboxShareRow[] = budgetSkippedReason
    ? []
    : budgetRows.map((r) => ({
        reseller_id: r.reseller_id,
        reseller_code: r.reseller_code,
        reseller_display_name: r.reseller_display_name,
        share: computeSandboxShare({
          sandbox_credits_used: r.utilization.sandbox_used,
          grant_credits_used: r.utilization.grant_used,
          monthly_credit_budget: r.utilization.grant_budget,
        }),
      }));
  const sandboxShareSection = formatWeeklyDigestSandboxShareSection(
    sandboxShareRows,
    currentMonthKey,
  );
  if (sandboxShareSection) html += sandboxShareSection;

  // P11.15 week-over-week delta section. Read the previous snapshot from the
  // JSONL history (P11.13 persistence), diff it against the current envelope
  // via the pure lib (P11.14), and append the resulting HTML table so ops
  // sees which KPI sections changed shape without opening two digest emails
  // side by side. A missing/unreadable/empty JSONL history is treated as a
  // first-run no-op (skipped_reason='no_previous_snapshot') so the very first
  // Monday after P11.15 ships does not fault. The delta section is deferred
  // until AFTER every KPI section is appended so the trailing table stays
  // adjacent to the sandbox-share row it primarily compares against.
  const webDir =
    process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
  const digestJsonlPath = `${webDir}/content/reports/reseller-weekly-digest.jsonl`;
  // P11.20 rolling trend window — 4 weeks total including the current run, so
  // read the last 3 historical snapshots off disk and prepend them to the
  // current envelope before folding via computeDigestSnapshotRollingTrend.
  const ROLLING_TREND_WINDOW_SIZE = 4;
  let previousSnapshot: DigestSnapshot | null = null;
  let previousSnapshotSkipReason: string | null = null;
  let priorTrendSnapshots: readonly DigestSnapshot[] = [];
  try {
    const text = readFileSync(digestJsonlPath, "utf8");
    previousSnapshot = readLastDigestSnapshot(text);
    if (!previousSnapshot) previousSnapshotSkipReason = "no_previous_snapshot";
    priorTrendSnapshots = readLastNDigestSnapshots(
      text,
      ROLLING_TREND_WINDOW_SIZE - 1,
    );
  } catch (e) {
    const errno =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: unknown }).code)
        : "";
    previousSnapshotSkipReason =
      errno === "ENOENT" ? "no_previous_snapshot" : "history_read_failed";
    if (errno !== "ENOENT") {
      console.error("[reseller-weekly-digest] history read failed", e);
    }
  }

  // Build a slim envelope shaped like the response body's KPI-section keys so
  // computeDigestSnapshotDelta reads the same rows-length + skipped-reason
  // signals from this run as it will from next week's persisted snapshot. Only
  // presence + skipped_reason + rows.length are read (see readSectionState),
  // so we omit the numeric row content here to keep the diff footprint small.
  const currentEnvelopeForDelta: Record<string, unknown> = {
    reseller_count: digestRows.length,
    emailed: false,
    budget_utilization: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : { rows: budgetRows },
    tier_mix: tierMixSkippedReason
      ? { skipped_reason: tierMixSkippedReason }
      : { rows: tierMixRows },
    commission_cleared_mtd: clearedMtdSkippedReason
      ? { skipped_reason: clearedMtdSkippedReason }
      : { rows: clearedMtdRows },
    clawback_exposure: clawbackSkippedReason
      ? { skipped_reason: clawbackSkippedReason }
      : { rows: clawbackRows },
    attributed_mrr: mrrSkippedReason
      ? { skipped_reason: mrrSkippedReason }
      : { rows: mrrRows },
    attributed_net_contribution: netContributionSkippedReason
      ? { skipped_reason: netContributionSkippedReason }
      : { rows: netContributionRows },
    contribution_margin_pct: contributionMarginSkippedReason
      ? { skipped_reason: contributionMarginSkippedReason }
      : { rows: contributionMargins?.rows ?? [] },
    attributed_churn_30d: churnSkippedReason
      ? { skipped_reason: churnSkippedReason }
      : { rows: churnRows },
    ledger_drift_events: driftSkippedReason
      ? { skipped_reason: driftSkippedReason }
      : { rows: driftRows },
    gst_reconciliation_delta: gstDeltaSkippedReason
      ? { skipped_reason: gstDeltaSkippedReason }
      : { rows: gstDeltaRows },
    cohort_velocity: { rows: cohortVelocityRows },
    ltv_cac_per_reseller: ltvCacSkippedReason
      ? { skipped_reason: ltvCacSkippedReason }
      : { rows: ltvCacRows },
    sandbox_share_of_budget: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : { rows: sandboxShareRows },
  };
  const currentSnapshotForDelta = buildDigestSnapshot({
    capturedAt: now,
    week,
    envelope: currentEnvelopeForDelta,
  });
  let snapshotDelta: DigestSnapshotDelta | null = null;
  let snapshotMetricDelta: DigestSnapshotMetricDelta | null = null;
  let snapshotMetricPctChange: DigestSnapshotMetricPctChange | null = null;
  let snapshotPerResellerDelta: DigestSnapshotPerResellerDelta | null = null;
  let snapshotRollingTrend: DigestSnapshotRollingTrend | null = null;
  let snapshotPerResellerRollingTrend:
    | DigestSnapshotPerResellerRollingTrend
    | null = null;
  let snapshotPerResellerMetricPctChange:
    | DigestSnapshotPerResellerMetricPctChange
    | null = null;
  let snapshotPerResellerMetricPctChangePerMetric:
    | DigestSnapshotPerResellerMetricPctChangePerMetric
    | null = null;
  let snapshotPerResellerMetricPctChangeCoverage:
    | DigestSnapshotPerResellerMetricPctChangeCoverage
    | null = null;
  let snapshotPerResellerPctChangeCoverage:
    | DigestSnapshotPerResellerPctChangeCoverage
    | null = null;
  let snapshotPerResellerMetricPctChangePerReseller:
    | DigestSnapshotPerResellerMetricPctChangePerReseller
    | null = null;
  let snapshotTopMovers: DigestSnapshotTopMovers | null = null;
  let topMoversSection = "";
  let snapshotTopMoversPerMetric: DigestSnapshotTopMoversPerMetric | null = null;
  let topMoversPerMetricSection = "";
  let snapshotTopMoversPerReseller:
    | DigestSnapshotTopMoversPerReseller
    | null = null;
  let topMoversPerResellerSection = "";
  let snapshotDirectionStreaks: DigestSnapshotDirectionStreaks | null = null;
  let directionStreaksSection = "";
  let snapshotPerResellerDirectionStreaks:
    | DigestSnapshotPerResellerDirectionStreaks
    | null = null;
  let perResellerDirectionStreaksSection = "";
  let snapshotPctChangeStreaks: DigestSnapshotPctChangeStreaks | null = null;
  let pctChangeStreaksSection = "";
  let snapshotPerResellerPctChangeStreaks:
    | DigestSnapshotPerResellerPctChangeStreaks
    | null = null;
  let perResellerPctChangeStreaksSection = "";
  let snapshotPctChangeStreakCoverage:
    | DigestSnapshotPctChangeStreakCoverage
    | null = null;
  let pctChangeStreakCoverageSection = "";
  let snapshotPerResellerPctChangeStreakCoverage:
    | DigestSnapshotPerResellerPctChangeStreakCoverage
    | null = null;
  let perResellerPctChangeStreakCoverageSection = "";
  let snapshotDirectionStreakCoverage:
    | DigestSnapshotDirectionStreakCoverage
    | null = null;
  let directionStreakCoverageSection = "";
  let snapshotPerResellerDirectionStreakCoverage:
    | DigestSnapshotPerResellerDirectionStreakCoverage
    | null = null;
  let perResellerDirectionStreakCoverageSection = "";
  let snapshotPerMetricDirectionStreakCoverage:
    | DigestSnapshotPerMetricDirectionStreakCoverage
    | null = null;
  let perMetricDirectionStreakCoverageSection = "";
  let snapshotPerMetricPctChangeStreakCoverage:
    | DigestSnapshotPerMetricPctChangeStreakCoverage
    | null = null;
  let perMetricPctChangeStreakCoverageSection = "";
  let snapshotDirectionStreakLeaderboard:
    | DigestSnapshotDirectionStreakLeaderboard
    | null = null;
  let directionStreakLeaderboardSection = "";
  let snapshotPctChangeStreakLeaderboard:
    | DigestSnapshotPctChangeStreakLeaderboard
    | null = null;
  let pctChangeStreakLeaderboardSection = "";
  let snapshotPerMetricDirectionStreakLeaderboard:
    | DigestSnapshotPerMetricDirectionStreakLeaderboard
    | null = null;
  let perMetricDirectionStreakLeaderboardSection = "";
  let snapshotPerMetricPctChangeStreakLeaderboard:
    | DigestSnapshotPerMetricPctChangeStreakLeaderboard
    | null = null;
  let perMetricPctChangeStreakLeaderboardSection = "";
  let snapshotPerResellerDirectionStreakLeaderboard:
    | DigestSnapshotPerResellerDirectionStreakLeaderboard
    | null = null;
  let perResellerDirectionStreakLeaderboardSection = "";
  let snapshotPerResellerPctChangeStreakLeaderboard:
    | DigestSnapshotPerResellerPctChangeStreakLeaderboard
    | null = null;
  let perResellerPctChangeStreakLeaderboardSection = "";
  let snapshotDirectionStreakLengthHistogram:
    | DigestSnapshotDirectionStreakLengthHistogram
    | null = null;
  let directionStreakLengthHistogramSection = "";
  let snapshotPctChangeStreakLengthHistogram:
    | DigestSnapshotPctChangeStreakLengthHistogram
    | null = null;
  let pctChangeStreakLengthHistogramSection = "";
  let snapshotPerResellerDirectionStreakLengthHistogram:
    | DigestSnapshotPerResellerDirectionStreakLengthHistogram
    | null = null;
  let perResellerDirectionStreakLengthHistogramSection = "";
  let snapshotPerResellerPctChangeStreakLengthHistogram:
    | DigestSnapshotPerResellerPctChangeStreakLengthHistogram
    | null = null;
  let perResellerPctChangeStreakLengthHistogramSection = "";
  if (previousSnapshot) {
    snapshotDelta = computeDigestSnapshotDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const deltaSection = formatDigestSnapshotDeltaSection(snapshotDelta);
    if (deltaSection) html += deltaSection;
    // P11.16 — per-metric numeric delta. The previous snapshot carries the
    // full response body (see appendFileSync below at `envelope: body`) so its
    // rows[] arrays hold the numeric fields HEADLINE_METRICS sums. The current
    // slim envelope holds numeric row content too (each section's rows[] are
    // the same shape the response body publishes), so this diff is
    // symmetrical whether previous OR current came off disk.
    snapshotMetricDelta = computeDigestSnapshotMetricDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const metricDeltaSection =
      formatDigestSnapshotMetricDeltaSection(snapshotMetricDelta);
    if (metricDeltaSection) html += metricDeltaSection;
    // P11.38 — signed percent-change companion to the P11.16 absolute
    // cent/count metric-delta table (module P11.37). Reuses HEADLINE_METRICS +
    // readSectionTotal from the P11.16 lib so the two projections cannot drift
    // on which row-level field they sum or how they walk the flat-vs-nested
    // envelope. Consumes the same (previousSnapshot, currentSnapshotForDelta)
    // pair — no extra fs read, no second envelope fold. Rendered directly
    // after the P11.16 absolute-delta section so the reader walks structural
    // triage → per-metric absolute cents → per-metric percent change and can
    // triage a +A$500 mover as either "5000% pop on a $10 base worth
    // investigating" or "0.05% blip on a $1M base — noise" at a glance
    // without opening the sibling table.
    snapshotMetricPctChange = computeDigestSnapshotMetricPctChange(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const metricPctChangeSection =
      formatDigestSnapshotMetricPctChangeSection(snapshotMetricPctChange);
    if (metricPctChangeSection) html += metricPctChangeSection;
    // P11.18 — per-reseller drill-down (module P11.17). Names the specific
    // partners whose per-metric total moved so ops does not have to open
    // /admin/resellers/[code] per row to identify the mover. Rendered after
    // the portfolio table so the aggregate lands first and the drill-down
    // reads as a follow-up.
    snapshotPerResellerDelta = computeDigestSnapshotPerResellerDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const perResellerDeltaSection =
      formatDigestSnapshotPerResellerDeltaSection(snapshotPerResellerDelta);
    if (perResellerDeltaSection) html += perResellerDeltaSection;
    // P11.20 — N-week rolling trend across HEADLINE_METRICS. Fold the last
    // ROLLING_TREND_WINDOW_SIZE-1 historical snapshots off disk plus the
    // current run into computeDigestSnapshotRollingTrend so ops sees a compact
    // portfolio-wide trend table sorted by |first→last delta| desc. Rendered
    // after the per-reseller drill-down so a top-to-bottom read walks
    // structural triage → portfolio totals → per-partner drill-down →
    // multi-week trend. The pure lib suppresses its own output when
    // window_size < 2 or every metric has a null delta, so no extra guard is
    // needed at the call site.
    const trendSnapshots: readonly DigestSnapshot[] = [
      ...priorTrendSnapshots,
      currentSnapshotForDelta,
    ];
    snapshotRollingTrend = computeDigestSnapshotRollingTrend(trendSnapshots);
    const rollingTrendSection = formatDigestSnapshotRollingTrendSection(
      snapshotRollingTrend,
    );
    if (rollingTrendSection) html += rollingTrendSection;
    // P11.22 — per-reseller drill-down for the P11.20/P11.21 portfolio rolling
    // trend. Names the specific partners whose per-metric total moved across
    // the N-week window so ops does not have to open /admin/resellers/[code]
    // per row to identify which partner drove the aggregate slide. Same
    // trendSnapshots buffer as P11.21 (no second fs read). Rendered after the
    // portfolio trend section so a top-to-bottom read walks structural triage
    // → portfolio totals → per-partner drill-down → portfolio trend →
    // per-partner trend drill-down. The pure lib suppresses its own output
    // when window_size < 2 or every (metric × reseller) row has a zero delta,
    // so no extra guard is needed at the call site.
    snapshotPerResellerRollingTrend =
      computeDigestSnapshotPerResellerRollingTrend(trendSnapshots);
    const perResellerRollingTrendSection =
      formatDigestSnapshotPerResellerRollingTrendSection(
        snapshotPerResellerRollingTrend,
      );
    if (perResellerRollingTrendSection)
      html += perResellerRollingTrendSection;
    // P11.40 — per-(reseller × metric) percent-change drill-down (module
    // P11.39). Companion to the P11.38 portfolio-scale pct-change section —
    // guarantees a small partner doubling attributed_mrr at low scale (a
    // +100% signal worth investigating) surfaces even when a bigger partner
    // nudging the same metric by 1% wins the raw absolute-cents ranking that
    // drowns the relative signal in the aggregate denominator. Consumes the
    // SAME snapshotPerResellerRollingTrend fold P11.29 top-movers-per-
    // reseller / P11.33 per-reseller direction-streaks read from (no second
    // per-reseller trend fold, no divergence risk on how first_total /
    // last_total are computed), and reuses the P11.37 PCT_CHANGE_MATERIAL_
    // THRESHOLD constant so the "material" band is one source of truth
    // across the portfolio + per-partner percent-change surfaces. Rendered
    // directly after the per-reseller rolling trend drill-down (P11.22/
    // P11.23) so ops walks per-partner absolute trend → per-partner
    // percent-change drill-down on the same page.
    snapshotPerResellerMetricPctChange =
      computeDigestSnapshotPerResellerMetricPctChange(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangeSection =
      formatDigestSnapshotPerResellerMetricPctChangeSection(
        snapshotPerResellerMetricPctChange,
      );
    if (perResellerMetricPctChangeSection)
      html += perResellerMetricPctChangeSection;
    // P11.42 — per-metric coverage spotlight for the P11.39/P11.40 per-
    // (reseller × metric) percent-change drill-down (module P11.41).
    // P11.39/P11.40 pool every metric into one |pct_change| leaderboard so a
    // metric whose partners all move sharply in relative terms (an
    // attributed_mrr sea-change week) can starve coverage for metrics whose
    // biggest movers are smaller in |pct_change| but still material to ops
    // (a tier_mix or attributed_churn_30d row that never surfaces even
    // though it crossed the PCT_CHANGE_MATERIAL_THRESHOLD floor). This
    // section guarantees every HEADLINE_METRICS spec with a computable-pct
    // mover gets at least one row — the P11.26 → P11.41 twin on the
    // relative axis. Consumes the SAME snapshotPerResellerRollingTrend fold
    // as P11.40, so a metric group's spotlight row cannot diverge from the
    // pooled drill-down above it. Rendered directly after the per-reseller
    // pct-change drill-down so ops walks pooled per-partner |pct| →
    // per-metric |pct| spotlight (coverage guarantee) on the same page.
    snapshotPerResellerMetricPctChangePerMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangePerMetricSection =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        snapshotPerResellerMetricPctChangePerMetric,
      );
    if (perResellerMetricPctChangePerMetricSection)
      html += perResellerMetricPctChangePerMetricSection;
    // P11.44 — per-metric |pct_change| coverage summary (module P11.43).
    // Companions the P11.41/P11.42 per-metric spotlight above: the spotlight
    // names the biggest mover per metric; this coverage table quantifies the
    // bucket depth behind that name (total_rows / computable_rows /
    // material_rows / material_rate_pct + signed-pct min/median/max
    // distribution) so ops can distinguish "one of many big movers" (crowded
    // market — spotlight partner is representative) from "the only mover we
    // can talk about" (thin signal — spotlight partner is the entire story).
    // Consumes the SAME snapshotPerResellerRollingTrend fold as P11.40/P11.42,
    // so a coverage cell cannot diverge from the spotlight row it summarises.
    // Rendered directly after the per-metric spotlight so ops walks per-metric
    // spotlight (who moved most in each metric) → per-metric coverage (how
    // thin/deep the movement was in each metric) on the same page.
    snapshotPerResellerMetricPctChangeCoverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangeCoverageSection =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(
        snapshotPerResellerMetricPctChangeCoverage,
      );
    if (perResellerMetricPctChangeCoverageSection)
      html += perResellerMetricPctChangeCoverageSection;
    // P11.46 — per-reseller |pct_change| coverage summary (module P11.45).
    // Mirror pivot of the P11.44 per-metric coverage above: instead of grouping
    // by HEADLINE_METRICS to answer "how thin/deep was each metric moved
    // across the partner set", this folds the SAME
    // snapshotPerResellerRollingTrend object by reseller_code to answer "how
    // thin/deep did each partner move across the metric set". A partner who
    // touched every metric with small moves reads identically to one who
    // touched only one metric with a large move under the P11.44 grouping;
    // this table separates them. Rows emitted in reseller_code alphabetical
    // order so ops reads the same partner ladder every Monday. Rendered
    // directly after perResellerMetricPctChangeCoverageSection so the reader
    // walks per-metric coverage (which METRICS moved broadly) → per-reseller
    // coverage (which PARTNERS moved broadly) on the same page — mirrors the
    // P11.44 landing after P11.42 for the same-axis pair above.
    snapshotPerResellerPctChangeCoverage =
      computeDigestSnapshotPerResellerPctChangeCoverage(
        snapshotPerResellerRollingTrend,
      );
    const perResellerPctChangeCoverageSection =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(
        snapshotPerResellerPctChangeCoverage,
      );
    if (perResellerPctChangeCoverageSection)
      html += perResellerPctChangeCoverageSection;
    // P11.48 — per-reseller |pct_change| spotlight (module P11.47). Mirror of
    // the P11.41/P11.42 per-metric |pct_change| spotlight on the per-reseller
    // axis: guarantees every partner surfaces its own biggest relative mover
    // regardless of how the pooled P11.39 leaderboard OR the per-metric
    // P11.41 spotlight shakes out. Coverage-per-partner rather than
    // depth-per-partner (DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE=1). Consumes
    // the SAME snapshotPerResellerRollingTrend fold as P11.40/P11.42/P11.44/
    // P11.46 — no second per-reseller trend fold, no divergence risk. Ops
    // walks per-reseller coverage summary (P11.46: how thin/deep each partner
    // moved) → per-reseller |pct| spotlight (P11.48: which single metric
    // moved the most in relative terms for each partner) on the same page.
    snapshotPerResellerMetricPctChangePerReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangePerResellerSection =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        snapshotPerResellerMetricPctChangePerReseller,
      );
    if (perResellerMetricPctChangePerResellerSection)
      html += perResellerMetricPctChangePerResellerSection;
    // P11.25 — top-N |delta| movers headline (module P11.24). Project the
    // per-reseller rolling trend into the biggest cross-metric shifts and
    // render a compact executive summary. Computed here so the source data
    // (snapshotPerResellerRollingTrend) is guaranteed populated; spliced right
    // after digestHeader below so it lands above the fold in the email preview
    // pane rather than at the bottom of the drill-down ladder.
    snapshotTopMovers = computeDigestSnapshotTopMovers(
      snapshotPerResellerRollingTrend,
    );
    topMoversSection = formatDigestSnapshotTopMoversSection(snapshotTopMovers);
    // P11.27 — per-metric top-N |delta| spotlight (module P11.26). Projects the
    // SAME per-reseller rolling trend down to at least one row per
    // HEADLINE_METRICS spec that has any mover, so count-unit metrics
    // (attributed_churn_30d, cohort_velocity, ledger_drift_events, tier_mix,
    // sandbox_share_of_budget, budget_utilization) surface alongside the
    // cents-scale movers that dominate the P11.24 portfolio-wide ranking. No
    // second rolling-trend fold, no divergence risk.
    snapshotTopMoversPerMetric = computeDigestSnapshotTopMoversPerMetric(
      snapshotPerResellerRollingTrend,
    );
    topMoversPerMetricSection = formatDigestSnapshotTopMoversPerMetricSection(
      snapshotTopMoversPerMetric,
    );
    // P11.29 — per-reseller top-N |delta| spotlight (module P11.28). Projects
    // the SAME per-reseller rolling trend down to at least one row per
    // reseller_code that has any non-null-non-zero mover, so a busy partner
    // driving several material shifts is guaranteed a spotlight row even when
    // each of their moves loses the metric-group race to a larger competitor
    // in the P11.24/P11.26 headlines. No second rolling-trend fold, no
    // divergence risk vs. the per-metric spotlight or the drill-down table
    // that consumes the same source.
    snapshotTopMoversPerReseller = computeDigestSnapshotTopMoversPerReseller(
      snapshotPerResellerRollingTrend,
    );
    topMoversPerResellerSection =
      formatDigestSnapshotTopMoversPerResellerSection(
        snapshotTopMoversPerReseller,
      );
    // P11.31 — sustained-direction streak detector (module P11.30). Projects
    // the SAME portfolio-wide rolling trend used by P11.21 down to the longest
    // run of consecutive same-sign point-to-point deltas per metric. Answers
    // the persistence angle the |delta|-magnitude ranking (P11.24/P11.26/
    // P11.28) may bury — a metric that slid every week is a fundamentally
    // different signal from one that dropped once and stayed flat, even at
    // equal |first→last| delta. Consumes snapshotRollingTrend directly (no
    // second trend fold, no divergence risk vs. the drill-down trend table
    // this streak summary sits above).
    snapshotDirectionStreaks = computeDigestSnapshotDirectionStreaks(
      snapshotRollingTrend,
    );
    directionStreaksSection = formatDigestSnapshotDirectionStreaksSection(
      snapshotDirectionStreaks,
    );
    // P11.33 — per-reseller sustained-direction streak detector (module P11.32).
    // Projects the SAME per-reseller rolling trend used by P11.22 down to the
    // longest run of consecutive same-sign point-to-point deltas per
    // (metric × reseller_code). Drills down the P11.31 portfolio streak table
    // above it and — critically — surfaces counter-balanced patterns
    // invisible to P11.31 (partner A slides -5000/wk while partner B climbs
    // +5000/wk for 3 weeks → portfolio flat every single week so P11.31 is
    // silent yet both partners ran material length-3 streaks). Consumes
    // snapshotPerResellerRollingTrend directly (no second per-reseller trend
    // fold, no divergence risk vs. the per-reseller drill-down trend table
    // this streak drill-down summarises).
    snapshotPerResellerDirectionStreaks =
      computeDigestSnapshotPerResellerDirectionStreaks(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreaksSection =
      formatDigestSnapshotPerResellerDirectionStreaksSection(
        snapshotPerResellerDirectionStreaks,
      );
    // P11.50 — sustained-|pct|-material streak detector (module P11.49).
    // Companion to the P11.31 sign-of-delta streak table above. Consumes the
    // SAME portfolio-wide snapshotRollingTrend the P11.21/P11.31 sections
    // already read (no second trend fold, no divergence risk vs. the trend
    // table this streak summary sits beside). Surfaces metrics whose |pct|
    // stayed ≥ 25% for 2+ consecutive point-to-point transitions — a
    // sustained-volatility signal invisible to the P11.31 direction filter
    // when a metric's sign flips week over week but its magnitude keeps
    // swinging materially.
    snapshotPctChangeStreaks = computeDigestSnapshotPctChangeStreaks(
      snapshotRollingTrend,
    );
    pctChangeStreaksSection = formatDigestSnapshotPctChangeStreaksSection(
      snapshotPctChangeStreaks,
    );
    // P11.52 — per-reseller sustained-|pct|-material streak detector (module
    // P11.51). Drills the P11.50 portfolio |pct|-material streak table above
    // down to (metric × reseller_code) so ops can name the specific partner
    // whose subscriber mix keeps churning materially week over week even when
    // direction flips. Consumes the SAME snapshotPerResellerRollingTrend the
    // P11.22/P11.33 sections already read (no second per-reseller trend fold,
    // no divergence risk vs. the per-reseller sign-streak table it sits
    // beside). Surfaces counter-balanced volatility invisible to P11.50 —
    // partner A churns +35/-30/+40/-32% while partner B swings the opposite
    // direction by the same magnitude, leaving the portfolio total flat every
    // week so P11.50 stays silent yet both partners ran material length-3
    // streaks.
    snapshotPerResellerPctChangeStreaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreaksSection =
      formatDigestSnapshotPerResellerPctChangeStreaksSection(
        snapshotPerResellerPctChangeStreaks,
      );
    // P11.54 — portfolio-wide sustained-|pct|-material streak coverage summary
    // (module P11.53). Topline for the P11.49/P11.50 spotlight below: how many
    // of the canonical HEADLINE_METRICS ladder is on a length-N streak this
    // week, with min/median/max streak length across the qualifying metrics.
    // Consumes the SAME portfolio-wide snapshotRollingTrend the P11.49 detector
    // already consumes (no extra fold, no divergence vs. the spotlight rows it
    // summarises). Lands directly above pctChangeStreaksSection so ops reads
    // the topline (is the whole portfolio churning, or one outlier metric
    // monopolising the signal?) before scanning the per-metric detail table.
    snapshotPctChangeStreakCoverage =
      computeDigestSnapshotPctChangeStreakCoverage(snapshotRollingTrend);
    pctChangeStreakCoverageSection =
      formatDigestSnapshotPctChangeStreakCoverageSection(
        snapshotPctChangeStreakCoverage,
      );
    // P11.56 — per-reseller sustained-|pct|-material streak coverage summary
    // (module P11.55). Per-partner topline for the P11.51/P11.52 spotlight
    // below, mirroring how P11.54 tops P11.49/P11.50 on the portfolio axis.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.51 detector
    // already consumes (no extra per-reseller trend fold, no divergence risk
    // vs. the spotlight rows this coverage summary tops). Lands directly
    // above perResellerPctChangeStreaksSection so ops reads the per-partner
    // topline (which partners have how many KPIs on a streak) before scanning
    // the per-(metric × partner) detail rows — mirrors the P11.54 topline →
    // P11.50 detail convention on the portfolio axis.
    snapshotPerResellerPctChangeStreakCoverage =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakCoverageSection =
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(
        snapshotPerResellerPctChangeStreakCoverage,
      );
    // P11.58 — portfolio-wide sustained-direction streak coverage summary
    // (module P11.57). Topline for the P11.30/P11.31 direction-streak
    // spotlight, mirroring how P11.54 tops P11.49/P11.50 for |pct|-magnitude
    // coverage on the portfolio axis. Consumes the SAME portfolio-wide
    // snapshotRollingTrend the P11.30 detector already consumes (no extra
    // fold, no divergence risk vs. the spotlight rows this coverage summary
    // tops). Lands directly above directionStreaksSection so ops reads the
    // topline (how many KPIs are on a same-direction streak, split up vs
    // down) before scanning the per-metric detail table — a portfolio with
    // 5 up-streaks and 0 down-streaks tells a fundamentally different story
    // from 0 up / 5 down even at the same coverage_rate_pct.
    snapshotDirectionStreakCoverage =
      computeDigestSnapshotDirectionStreakCoverage(snapshotRollingTrend);
    directionStreakCoverageSection =
      formatDigestSnapshotDirectionStreakCoverageSection(
        snapshotDirectionStreakCoverage,
      );
    // P11.60 — per-reseller sustained-direction streak coverage summary
    // (module P11.59). Per-partner topline for the P11.32/P11.33 direction
    // spotlight, mirroring how P11.56 tops P11.51/P11.52 for |pct|-magnitude
    // coverage on the per-partner axis and how P11.58 tops P11.30/P11.31 on
    // the portfolio direction axis. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector already consumes (no
    // extra per-reseller trend fold, no divergence risk vs. the spotlight rows
    // this coverage summary tops). Lands directly above
    // perResellerDirectionStreaksSection so ops reads the per-partner topline
    // (which partners have how many KPIs on a same-direction streak, split up
    // vs down) before scanning the per-(metric × partner) detail rows — a
    // partner with 3 up / 0 down at 100% coverage is systemically climbing,
    // 0 up / 3 down at 100% is systemically sliding, 2 up / 2 down is
    // oscillating internally in a way the aggregate hides.
    snapshotPerResellerDirectionStreakCoverage =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakCoverageSection =
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(
        snapshotPerResellerDirectionStreakCoverage,
      );
    // P11.62 — per-metric sustained-direction streak coverage summary
    // (module P11.61). Metric-anchored topline for the P11.30/P11.31 direction
    // spotlight, pivoting the P11.59/P11.60 per-partner coverage shape onto
    // the metric axis. Delegates to computeDigestSnapshotPerResellerDirectionStreaks
    // through the pure lib so the per-KPI up/down partner counts cannot
    // diverge from the P11.32 spotlight rows this coverage summary tops.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // already consumes (no extra fold, no divergence risk). Lands directly
    // ABOVE directionStreaksSection (P11.31 portfolio spotlight) so ops reads
    // the metric-anchored topline (for THIS KPI, how many partners are on a
    // streak, up vs down) before scanning the per-metric spotlight — a KPI
    // with 5/5 partners on a downward streak is under systemic pressure that
    // justifies a product/pricing/retention response, a KPI with 3 up / 2
    // down is idiosyncratic noise that the composite P11.58 portfolio topline
    // above it would collapse into a single "streak on/off" signal.
    snapshotPerMetricDirectionStreakCoverage =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakCoverageSection =
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(
        snapshotPerMetricDirectionStreakCoverage,
      );
    // P11.64 — per-metric sustained-|pct|-material streak coverage summary
    // (module P11.63). Metric-anchored topline for the P11.49/P11.50 portfolio
    // |pct|-material spotlight, pivoting the P11.55/P11.56 per-partner coverage
    // shape onto the metric axis and mirroring P11.62's per-metric direction
    // coverage on the |pct|-magnitude axis. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // the per-KPI streaking-partner counts cannot diverge from the P11.51
    // spotlight rows this coverage summary tops. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector already consumes (no
    // extra fold, no divergence risk). Lands directly ABOVE pctChangeStreaksSection
    // (P11.50 portfolio |pct| spotlight) so ops reads the metric-anchored
    // topline (for THIS KPI, how many partners are swinging materially this
    // window) before scanning the per-metric spotlight — a KPI with 5/5
    // partners on a length-3+ |pct|-material streak is under systemic
    // portfolio-wide volatility that justifies a product/pricing/retention
    // response, a KPI with 1/5 streaking is a single-partner idiosyncratic
    // outlier that the composite P11.54 portfolio topline above it collapses
    // into a single "streak on/off" signal. No up/down split because |pct| is
    // signless-material (unlike P11.62 which carries the split on the direction
    // axis).
    snapshotPerMetricPctChangeStreakCoverage =
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakCoverageSection =
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(
        snapshotPerMetricPctChangeStreakCoverage,
      );
    // P11.66 — top-of-fold sustained-direction streak leaderboard (module
    // P11.65). Ranks the deepest sustained-direction streaks across the
    // (metric × partner) matrix by length desc primary, |cumulative_delta|
    // desc secondary so both persistence and magnitude float to the top.
    // Delegates to computeDigestSnapshotPerResellerDirectionStreaks through
    // the pure lib so leaderboard entries cannot diverge from the P11.32
    // spotlight rows they summarise — an entry ranked #1 here appears in the
    // P11.32 table below with matching direction / length / cumulative_delta.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // already consumes (no extra fold, no divergence risk vs. the spotlight
    // rows this leaderboard tops). Lands directly ABOVE
    // perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads the
    // top-N leaderboard strip before scrolling into the full drill-down
    // table — on a large portfolio the P11.32 spotlight is length-sorted but
    // uncapped and can carry dozens of rows, and this leaderboard surfaces
    // the deepest partner × KPI runs at a glance. total_qualified is carried
    // on the envelope so a "Top 10 of 47" caption tells ops how much detail
    // lives in the P11.32 spotlight below.
    snapshotDirectionStreakLeaderboard =
      computeDigestSnapshotDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    directionStreakLeaderboardSection =
      formatDigestSnapshotDirectionStreakLeaderboardSection(
        snapshotDirectionStreakLeaderboard,
      );
    // P11.68 — top-of-fold sustained-|pct|-material streak leaderboard (module
    // P11.67). |pct|-magnitude analogue of the P11.66 direction-streak
    // leaderboard: ranks the most-volatile sustained-|pct|-material streaks
    // across the (metric × partner) matrix by length desc primary,
    // cumulative_abs_pct desc secondary so both persistence and total swing
    // magnitude float to the top. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.51/P11.52 spotlight rows
    // they summarise — an entry ranked #1 here appears in the P11.52 table
    // below with matching length / max_abs_pct / min_abs_pct / transitions.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.51 detector
    // already consumes (no extra fold, no divergence risk vs. the spotlight
    // rows this leaderboard tops). Lands directly ABOVE
    // perResellerPctChangeStreaksSection (P11.51/P11.52) so ops reads the
    // top-N leaderboard strip before scrolling into the full drill-down table
    // — on a large portfolio the P11.51 spotlight is length-sorted but uncapped
    // and can carry dozens of rows, and this leaderboard surfaces the most
    // volatile partner × KPI runs at a glance. total_qualified is carried on
    // the envelope so a "Top 10 of 47" caption tells ops how much detail lives
    // in the P11.51/P11.52 spotlight below.
    snapshotPctChangeStreakLeaderboard =
      computeDigestSnapshotPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    pctChangeStreakLeaderboardSection =
      formatDigestSnapshotPctChangeStreakLeaderboardSection(
        snapshotPctChangeStreakLeaderboard,
      );
    // P11.70 — per-metric top-of-fold sustained-direction streak leaderboards
    // (module P11.69). Per-KPI analogue of the P11.66 flat matrix leaderboard:
    // instead of one length-sorted top-N pool across every (metric × partner)
    // pair, this renders an independent top-N ranking PER metric so a partner
    // leading on churn recovery cannot be crowded out by a partner riding a
    // volatile attributed_mrr swing. Delegates to
    // computeDigestSnapshotPerResellerDirectionStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.32 spotlight rows they
    // summarise — an entry ranked #1 in a group here appears in the P11.32
    // table below with matching direction / length / cumulative_delta.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // and the P11.66 flat leaderboard already consume (no extra fold, no
    // divergence risk vs. the spotlight rows this leaderboard tops). Lands
    // directly BETWEEN the P11.66 flat matrix leaderboard and the
    // perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads matrix
    // top-N → per-KPI top-N (equal footing across metrics) → full per-partner
    // drill-down. Per-group total_qualified is carried on the envelope so a
    // "Top 3 of 8 partners on attributed_mrr" caption tells ops how much
    // detail lives in the P11.32 spotlight below for that KPI specifically.
    snapshotPerMetricDirectionStreakLeaderboard =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakLeaderboardSection =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(
        snapshotPerMetricDirectionStreakLeaderboard,
      );
    // P11.72 — per-metric top-of-fold sustained-|pct|-material streak
    // leaderboards (module P11.71). |pct|-magnitude analogue of the P11.70
    // per-metric direction-streak leaderboards: instead of one length-sorted
    // top-N pool across every (metric × partner) pair (the P11.68 flat matrix
    // leaderboard), this renders an independent top-N ranking PER metric so a
    // partner leading on churn volatility cannot be crowded out by a partner
    // riding a volatile attributed_mrr swing. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.51/P11.52 spotlight rows
    // they summarise — an entry ranked #1 in a group here appears in the
    // P11.52 table below with matching length / max_abs_pct / min_abs_pct /
    // cumulative_abs_pct. Consumes the SAME snapshotPerResellerRollingTrend
    // the P11.51 detector and the P11.68 flat leaderboard already consume (no
    // extra fold, no divergence risk vs. the spotlight rows this per-metric
    // leaderboard tops). Lands directly BETWEEN the P11.68 flat matrix
    // leaderboard (pctChangeStreakLeaderboardSection) and the
    // perResellerPctChangeStreaksSection (P11.51/P11.52) so ops reads matrix
    // top-N → per-KPI top-N (equal footing across metrics) → full per-partner
    // drill-down — structural echo of the P11.66 → P11.70 → P11.32 placement
    // on the direction axis, mirrored on the |pct|-magnitude axis. Per-group
    // total_qualified is carried on the envelope so a "Top 3 of 8 partners on
    // churn" caption tells ops how much detail lives in the P11.52 spotlight
    // below for that KPI specifically.
    snapshotPerMetricPctChangeStreakLeaderboard =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakLeaderboardSection =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(
        snapshotPerMetricPctChangeStreakLeaderboard,
      );
    // P11.74 — per-partner top-of-fold sustained-direction streak
    // leaderboards (module P11.73). Per-partner analogue of the P11.70
    // per-metric leaderboards: instead of one length-sorted top-N pool per
    // KPI, this renders an independent top-N ranking PER partner so a small
    // partner leading on their own churn recovery ranks #1 on their own book
    // even if their MRR magnitude wouldn't crack the flat matrix leaderboard
    // (P11.66) or the per-metric strip (P11.70). Delegates to
    // computeDigestSnapshotPerResellerDirectionStreaks through the pure lib
    // so leaderboard entries cannot diverge from the P11.32 spotlight rows
    // they summarise — an entry ranked #1 in a partner group here appears in
    // the P11.32 table below with matching direction / length /
    // cumulative_delta. Consumes the SAME snapshotPerResellerRollingTrend the
    // P11.32 detector and the P11.66 / P11.70 leaderboards already consume
    // (no extra fold, no divergence risk vs. the spotlight rows this
    // per-partner leaderboard tops). Lands directly BETWEEN the P11.70
    // per-metric leaderboard (perMetricDirectionStreakLeaderboardSection) and
    // the perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads
    // matrix top-N → per-KPI top-N → per-partner top-N (equal footing across
    // partners) → full per-(metric × partner) drill-down. Closes the
    // leaderboard family's per-partner axis symmetric with the coverage
    // family's per-reseller split at P11.59. Per-group total_qualified is
    // carried on the envelope so a "Top 3 of 8 KPIs for ACME" caption tells
    // ops how much detail lives in the P11.32 spotlight below for that
    // partner specifically.
    snapshotPerResellerDirectionStreakLeaderboard =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakLeaderboardSection =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(
        snapshotPerResellerDirectionStreakLeaderboard,
      );
    // P11.76 — per-partner top-of-fold sustained-|pct|-material streak
    // leaderboards (module P11.75). |pct|-magnitude analogue of the P11.74
    // per-partner direction leaderboards, and per-partner analogue of the
    // P11.72 per-metric |pct|-material leaderboards: instead of one length-
    // sorted top-N pool per KPI, this renders an independent top-N ranking
    // PER partner so a small partner leading on their own churn volatility
    // ranks #1 on their own book even if their MRR magnitude wouldn't crack
    // the flat matrix leaderboard (P11.68) or the per-metric strip (P11.72).
    // Delegates to computeDigestSnapshotPerResellerPctChangeStreaks through
    // the pure lib so leaderboard entries cannot diverge from the P11.52
    // spotlight rows they summarise — an entry ranked #1 in a partner group
    // here appears in the P11.52 table below with matching length /
    // max_abs_pct / min_abs_pct / cumulative_abs_pct. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector and the P11.68 /
    // P11.72 leaderboards already consume (no extra fold, no divergence risk
    // vs. the spotlight rows this per-partner leaderboard tops). Lands
    // directly BETWEEN the P11.72 per-metric |pct|-material leaderboard
    // (perMetricPctChangeStreakLeaderboardSection) and the
    // perResellerPctChangeStreaksSection (P11.52) so ops reads matrix top-N
    // → per-KPI top-N → per-partner top-N (equal footing across partners) →
    // full per-(metric × partner) drill-down. Closes the leaderboard
    // family's per-partner axis on the |pct|-magnitude axis symmetric with
    // the P11.74 per-partner direction leaderboard and mirrors the coverage
    // family's per-reseller split at P11.55. Per-group total_qualified is
    // carried on the envelope so a "Top 3 of 8 KPIs for ACME" caption tells
    // ops how much detail lives in the P11.52 spotlight below for that
    // partner specifically.
    snapshotPerResellerPctChangeStreakLeaderboard =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakLeaderboardSection =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(
        snapshotPerResellerPctChangeStreakLeaderboard,
      );
    // P11.78 — portfolio direction-streak length-frequency histogram (module
    // P11.77). Consumes snapshotDirectionStreaks (P11.30) directly rather
    // than re-folding snapshotRollingTrend so this histogram cannot diverge
    // from the P11.30 rows the P11.31 table renders above it. Complements
    // the P11.57 coverage topline (share of possible cells qualifying) and
    // the P11.67 leaderboard (top-N deepest runs) by exposing the SHAPE of
    // persistence between them — two portfolios with the same coverage% and
    // the same leaderboard #1 can differ sharply in tail, and neither
    // coverage nor leaderboard exposes that. Section splices directly BELOW
    // directionStreaksSection (P11.31 spotlight table) so ops reads the
    // per-metric spotlight and then the shape-of-persistence tail
    // underneath.
    snapshotDirectionStreakLengthHistogram =
      computeDigestSnapshotDirectionStreakLengthHistogram(
        snapshotDirectionStreaks,
      );
    directionStreakLengthHistogramSection =
      formatDigestSnapshotDirectionStreakLengthHistogramSection(
        snapshotDirectionStreakLengthHistogram,
      );
    // P11.80 — portfolio |pct|-material-streak length-frequency histogram
    // (module P11.79). Magnitude-axis analogue of the P11.78 direction
    // histogram wired directly above. Consumes snapshotPctChangeStreaks
    // (P11.49) directly rather than re-folding snapshotRollingTrend so this
    // histogram cannot diverge from the P11.49 rows the P11.50 table renders
    // above it. Complements the P11.53 coverage topline (share of possible
    // cells qualifying at |Δ%| ≥ threshold) and the P11.67 leaderboard (top-N
    // deepest volatile runs) by exposing the SHAPE of magnitude persistence
    // between them — two portfolios with the same coverage% and the same
    // leaderboard #1 can differ sharply in tail, and neither coverage nor
    // leaderboard exposes that. Section splices directly BELOW
    // pctChangeStreaksSection (P11.50 spotlight table) per the P11.79
    // formatter docblock's explicit placement rule so ops reads the
    // count-per-metric list and then the shape-of-persistence tail
    // underneath, mirroring the P11.78 direction placement rule on the
    // magnitude axis.
    snapshotPctChangeStreakLengthHistogram =
      computeDigestSnapshotPctChangeStreakLengthHistogram(
        snapshotPctChangeStreaks,
      );
    pctChangeStreakLengthHistogramSection =
      formatDigestSnapshotPctChangeStreakLengthHistogramSection(
        snapshotPctChangeStreakLengthHistogram,
      );
    // P11.82 — per-partner sustained-direction streak length-frequency
    // histogram (module P11.81). Per-partner analogue of the P11.78 portfolio
    // histogram, closing the histogram family's per-partner axis symmetric
    // with the P11.59 (coverage) / P11.73 (leaderboard) per-partner splits.
    // Delegates to computeDigestSnapshotPerResellerDirectionStreaks through
    // the pure lib so per-partner histogram groups cannot diverge from the
    // P11.32 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector and the P11.73
    // per-partner leaderboard already consume (no extra fold, no divergence
    // risk vs. the spotlight rows below). Per-partner bucket set is DENSE
    // from min_streak_length to that partner's own max_length so a partner
    // whose deepest run is length-4 does not carry a phantom length-5 bucket
    // sourced from a sibling partner's tail. Section splices directly BETWEEN
    // perResellerDirectionStreakLeaderboardSection (P11.74 per-partner top-N)
    // and perResellerDirectionStreaksSection (P11.32/P11.33 per-partner
    // spotlight) so ops reads per-partner coverage (P11.60) → per-partner
    // top-N (P11.74) → per-partner shape-of-persistence tail (this section)
    // → per-partner spotlight detail (P11.32).
    snapshotPerResellerDirectionStreakLengthHistogram =
      computeDigestSnapshotPerResellerDirectionStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakLengthHistogramSection =
      formatDigestSnapshotPerResellerDirectionStreakLengthHistogramSection(
        snapshotPerResellerDirectionStreakLengthHistogram,
      );
    // P11.84 — per-partner sustained-|pct|-material streak length-frequency
    // histogram (module P11.83). Magnitude-axis analogue of the P11.82
    // per-partner direction-streak histogram wired above and per-partner
    // analogue of the P11.80 portfolio |pct|-material histogram, closing the
    // histogram family's per-partner axis on the magnitude side symmetric
    // with the P11.55 (coverage) / P11.75 (leaderboard) per-partner splits.
    // Delegates to computeDigestSnapshotPerResellerPctChangeStreaks through
    // the pure lib so per-partner histogram groups cannot diverge from the
    // P11.51 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector and P11.75
    // per-partner leaderboard already consume (no extra fold, no divergence
    // risk vs. the per-partner spotlight rows below). Per-partner bucket set
    // is DENSE from min_streak_length to that partner's own max_length so a
    // partner whose deepest |pct|-material run is length-4 does not carry a
    // phantom length-5 bucket sourced from a sibling partner's tail. Section
    // splices directly BETWEEN perResellerPctChangeStreakLeaderboardSection
    // (P11.76 per-partner top-N pct-change leaderboard) and
    // perResellerPctChangeStreaksSection (P11.51/P11.52 per-partner
    // spotlight) so ops reads per-partner coverage (P11.55) → per-partner
    // top-N (P11.75) → per-partner shape-of-persistence tail (this section)
    // → per-partner spotlight detail (P11.51), mirroring the P11.82
    // placement on the direction axis.
    snapshotPerResellerPctChangeStreakLengthHistogram =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakLengthHistogramSection =
      formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
        snapshotPerResellerPctChangeStreakLengthHistogram,
      );
  }
  if (
    topMoversSection ||
    topMoversPerMetricSection ||
    topMoversPerResellerSection ||
    directionStreakCoverageSection ||
    perMetricDirectionStreakCoverageSection ||
    directionStreaksSection ||
    directionStreakLengthHistogramSection ||
    perResellerDirectionStreakCoverageSection ||
    directionStreakLeaderboardSection ||
    perMetricDirectionStreakLeaderboardSection ||
    perResellerDirectionStreakLeaderboardSection ||
    perResellerDirectionStreakLengthHistogramSection ||
    perResellerDirectionStreaksSection ||
    pctChangeStreakCoverageSection ||
    perMetricPctChangeStreakCoverageSection ||
    pctChangeStreaksSection ||
    pctChangeStreakLengthHistogramSection ||
    perResellerPctChangeStreakCoverageSection ||
    pctChangeStreakLeaderboardSection ||
    perMetricPctChangeStreakLeaderboardSection ||
    perResellerPctChangeStreakLeaderboardSection ||
    perResellerPctChangeStreakLengthHistogramSection ||
    perResellerPctChangeStreaksSection
  ) {
    // Splice all executive-summary sections above the fold, in the order
    // P11.24 (portfolio |delta|) → P11.26 (per-metric spotlight) → P11.28
    // (per-reseller spotlight) → P11.30 (portfolio sustained-direction
    // streaks) → P11.32 (per-reseller sustained-direction streaks) so the
    // biggest single shift lands first, the per-metric coverage table rounds
    // out any metric whose mover was buried by unit-scale dominance, the
    // per-reseller spotlight guarantees every partner with any material shift
    // gets at least one row regardless of whether they lead a metric group
    // globally, the portfolio direction-streak table surfaces the persistence
    // angle the three |delta|-magnitude sections above it may bury, and the
    // per-reseller streak drill-down names the specific partner behind each
    // portfolio streak (and — critically — surfaces counter-balanced patterns
    // invisible to the portfolio streak table above it when partner slides
    // and gains cancel each other week-over-week).
    const rest = html.slice(digestHeader.length);
    html =
      digestHeader +
      topMoversSection +
      topMoversPerMetricSection +
      topMoversPerResellerSection +
      directionStreakCoverageSection +
      perMetricDirectionStreakCoverageSection +
      directionStreaksSection +
      directionStreakLengthHistogramSection +
      perResellerDirectionStreakCoverageSection +
      directionStreakLeaderboardSection +
      perMetricDirectionStreakLeaderboardSection +
      perResellerDirectionStreakLeaderboardSection +
      perResellerDirectionStreakLengthHistogramSection +
      perResellerDirectionStreaksSection +
      pctChangeStreakCoverageSection +
      perMetricPctChangeStreakCoverageSection +
      pctChangeStreaksSection +
      pctChangeStreakLengthHistogramSection +
      perResellerPctChangeStreakCoverageSection +
      pctChangeStreakLeaderboardSection +
      perMetricPctChangeStreakLeaderboardSection +
      perResellerPctChangeStreakLeaderboardSection +
      perResellerPctChangeStreakLengthHistogramSection +
      perResellerPctChangeStreaksSection +
      rest;
  }

  let emailed = false;
  if (!skipEmail && digestRows.length > 0) {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller weekly leading-signal digest — ${week} (${digestRows.length} reseller${digestRows.length === 1 ? "" : "s"})`,
      html,
      attachments: [
        {
          filename: `reseller-weekly-digest-${week}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv",
        },
      ],
    }).catch((e) => {
      console.error("[reseller-weekly-digest] email failed", e);
      return { ok: false, id: "" } as const;
    });
    emailed = Boolean((result as { ok?: boolean }).ok);
  }

  const body = {
    ok: true,
    week,
    reseller_count: digestRows.length,
    rows: digestRows.map((r) => ({
      reseller_id: r.reseller_id,
      reseller_code: r.reseller_code,
      attributed_total: r.summary.attributed_total,
      inactive_7d: r.summary.inactive_7d,
      inactive_30d: r.summary.inactive_30d,
      activated_first_report: r.summary.activated_first_report,
      activated_first_report_pct: r.summary.activated_first_report_pct,
      median_days_to_first_report: r.summary.median_days_to_first_report,
    })),
    emailed,
    anomalies: anomalySummary
      ? {
          actor_hotspot_count: anomalySummary.actor_hotspots.length,
          subject_hotspot_count: anomalySummary.subject_hotspots.length,
          total_rows_in_window: anomalySummary.total_rows_in_window,
          threshold: anomalySummary.threshold,
          window_start: anomalySummary.window_start,
          window_end: anomalySummary.window_end,
        }
      : { skipped_reason: "audit_log_query_failed" },
    human_blocked: {
      count: HUMAN_BLOCKED_ITEMS.length,
      ids: HUMAN_BLOCKED_ITEMS.map((i) => i.id),
    },
    budget_utilization: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: budgetRows.length,
          rows: budgetRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            grant_used: r.utilization.grant_used,
            grant_budget: r.utilization.grant_budget,
            grant_pct: r.utilization.grant_pct,
            sandbox_used: r.utilization.sandbox_used,
            sandbox_cap: r.utilization.sandbox_cap,
            sandbox_pct: r.utilization.sandbox_pct,
          })),
        },
    tier_mix: tierMixSkippedReason
      ? { skipped_reason: tierMixSkippedReason }
      : {
          reseller_count: tierMixRows.length,
          rows: tierMixRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            tier_0: r.mix.counts[0],
            tier_10: r.mix.counts[10],
            tier_20: r.mix.counts[20],
            tier_30: r.mix.counts[30],
            tier_40: r.mix.counts[40],
            none: r.mix.none,
            total: r.mix.total,
          })),
        },
    commission_cleared_mtd: clearedMtdSkippedReason
      ? { skipped_reason: clearedMtdSkippedReason }
      : {
          month_key: clearedMonthKey,
          reseller_count: clearedMtdRows.length,
          rows: clearedMtdRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            cleared_count: r.mtd.cleared_count,
            cleared_cents: r.mtd.cleared_cents,
          })),
        },
    clawback_exposure: clawbackSkippedReason
      ? { skipped_reason: clawbackSkippedReason }
      : {
          reseller_count: clawbackRows.length,
          rows: clawbackRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            pending_count: r.exposure.pending_count,
            pending_cents: r.exposure.pending_cents,
            dispute_count: r.exposure.dispute_count,
            dispute_cents: r.exposure.dispute_cents,
            total_count: r.exposure.total_count,
            total_cents: r.exposure.total_cents,
          })),
        },
    attributed_mrr: mrrSkippedReason
      ? { skipped_reason: mrrSkippedReason }
      : {
          reseller_count: mrrRows.length,
          rows: mrrRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            active_subs: r.mrr.active_subs,
            mrr_cents: r.mrr.mrr_cents,
            arr_cents: r.mrr.mrr_cents * 12,
          })),
        },
    attributed_churn_30d: churnSkippedReason
      ? { skipped_reason: churnSkippedReason }
      : {
          window_days: 30,
          reseller_count: churnRows.length,
          rows: churnRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            attributed_total: r.churn.attributed_total,
            canceled_count: r.churn.canceled_count,
            trial_ended_count: r.churn.trial_ended_count,
            churned_count: r.churn.churned_count,
            churn_pct: r.churn.churn_pct,
          })),
        },
    ledger_drift_events: driftSkippedReason
      ? { skipped_reason: driftSkippedReason }
      : {
          window_days: LEDGER_DRIFT_WINDOW_DAYS,
          reseller_count: driftRows.length,
          rows: driftRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            missing_commission_count: r.drift.missing_commission_count,
            orphan_commission_count: r.drift.orphan_commission_count,
            total_drift_count: r.drift.total_drift_count,
          })),
        },
    attributed_net_contribution: netContributionSkippedReason
      ? { skipped_reason: netContributionSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: netContributionRows.length,
          rows: netContributionRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            revenue_cents: r.net.revenue_cents,
            commission_cost_cents: r.net.commission_cost_cents,
            credit_cogs_cents: r.net.credit_cogs_cents,
            net_contribution_cents: r.net.net_contribution_cents,
          })),
        },
    contribution_margin_pct: contributionMarginSkippedReason
      ? { skipped_reason: contributionMarginSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: contributionMargins?.reseller_count ?? 0,
          portfolio_revenue_cents:
            contributionMargins?.portfolio_revenue_cents ?? 0,
          portfolio_net_cents: contributionMargins?.portfolio_net_cents ?? 0,
          portfolio_margin_pct:
            contributionMargins?.portfolio_margin_pct ?? null,
          rows: (contributionMargins?.rows ?? []).map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            revenue_cents: r.revenue_cents,
            net_contribution_cents: r.net_contribution_cents,
            margin_pct: r.margin_pct,
          })),
        },
    gst_reconciliation_delta: gstDeltaSkippedReason
      ? { skipped_reason: gstDeltaSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: gstDeltaRows.length,
          rows: gstDeltaRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            positive_count: r.delta.positive_count,
            positive_gst_cents: r.delta.positive_gst_cents,
            reversal_count: r.delta.reversal_count,
            reversal_gst_cents: r.delta.reversal_gst_cents,
            net_gst_cents: r.delta.net_gst_cents,
          })),
        },
    cohort_velocity: {
      window_months: COHORT_MONTHS_WINDOW,
      cohort_months: cohortMonths,
      reseller_count: cohortVelocityRows.length,
      rows: cohortVelocityRows.map((r) => ({
        reseller_id: r.reseller_id,
        reseller_code: r.reseller_code,
        cohorts: r.cohorts.map((c) => ({
          cohort_month: c.cohort_month,
          attributed_count: c.attributed_count,
          activated_count: c.activated_count,
          activation_pct: c.activation_pct,
          median_days_to_activation: c.median_days_to_activation,
        })),
      })),
    },
    ltv_cac_per_reseller: ltvCacSkippedReason
      ? { skipped_reason: ltvCacSkippedReason }
      : {
          reseller_count: ltvCacRows.length,
          rows: ltvCacRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            attributed_customers: r.ltv_cac.attributed_customers,
            lifetime_revenue_cents: r.ltv_cac.lifetime_revenue_cents,
            cumulative_cleared_commission_cents:
              r.ltv_cac.cumulative_cleared_commission_cents,
            ltv_per_customer_cents: r.ltv_cac.ltv_per_customer_cents,
            cac_per_customer_cents: r.ltv_cac.cac_per_customer_cents,
            ltv_cac_ratio_hundredths: r.ltv_cac.ltv_cac_ratio_hundredths,
          })),
        },
    sandbox_share_of_budget: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: sandboxShareRows.length,
          rows: sandboxShareRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            sandbox_credits_used: r.share.sandbox_credits_used,
            grant_credits_used: r.share.grant_credits_used,
            total_credits_used: r.share.total_credits_used,
            monthly_credit_budget: r.share.monthly_credit_budget,
            share_of_consumption_pct: r.share.share_of_consumption_pct,
            share_of_budget_pct: r.share.share_of_budget_pct,
          })),
        },
    snapshot_delta: snapshotDelta
      ? {
          previous_captured_at: snapshotDelta.previous_captured_at,
          previous_week: snapshotDelta.previous_week,
          current_captured_at: snapshotDelta.current_captured_at,
          current_week: snapshotDelta.current_week,
          previous_reseller_count: snapshotDelta.previous_reseller_count,
          current_reseller_count: snapshotDelta.current_reseller_count,
          reseller_count_delta: snapshotDelta.reseller_count_delta,
          sections: snapshotDelta.sections,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_metric_delta: snapshotMetricDelta
      ? {
          previous_captured_at: snapshotMetricDelta.previous_captured_at,
          previous_week: snapshotMetricDelta.previous_week,
          current_captured_at: snapshotMetricDelta.current_captured_at,
          current_week: snapshotMetricDelta.current_week,
          metrics: snapshotMetricDelta.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_metric_pct_change: snapshotMetricPctChange
      ? {
          previous_captured_at: snapshotMetricPctChange.previous_captured_at,
          previous_week: snapshotMetricPctChange.previous_week,
          current_captured_at: snapshotMetricPctChange.current_captured_at,
          current_week: snapshotMetricPctChange.current_week,
          metrics: snapshotMetricPctChange.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_delta: snapshotPerResellerDelta
      ? {
          previous_captured_at: snapshotPerResellerDelta.previous_captured_at,
          previous_week: snapshotPerResellerDelta.previous_week,
          current_captured_at: snapshotPerResellerDelta.current_captured_at,
          current_week: snapshotPerResellerDelta.current_week,
          rows: snapshotPerResellerDelta.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_rolling_trend: snapshotRollingTrend
      ? {
          window_size: snapshotRollingTrend.window_size,
          first_week: snapshotRollingTrend.first_week,
          last_week: snapshotRollingTrend.last_week,
          metrics: snapshotRollingTrend.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_rolling_trend: snapshotPerResellerRollingTrend
      ? {
          window_size: snapshotPerResellerRollingTrend.window_size,
          first_week: snapshotPerResellerRollingTrend.first_week,
          last_week: snapshotPerResellerRollingTrend.last_week,
          rows: snapshotPerResellerRollingTrend.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_metric_pct_change:
      snapshotPerResellerMetricPctChange
        ? {
            window_size: snapshotPerResellerMetricPctChange.window_size,
            first_week: snapshotPerResellerMetricPctChange.first_week,
            last_week: snapshotPerResellerMetricPctChange.last_week,
            top_n: snapshotPerResellerMetricPctChange.top_n,
            threshold: snapshotPerResellerMetricPctChange.threshold,
            rows: snapshotPerResellerMetricPctChange.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_per_metric:
      snapshotPerResellerMetricPctChangePerMetric
        ? {
            window_size:
              snapshotPerResellerMetricPctChangePerMetric.window_size,
            first_week:
              snapshotPerResellerMetricPctChangePerMetric.first_week,
            last_week:
              snapshotPerResellerMetricPctChangePerMetric.last_week,
            top_n_per_metric:
              snapshotPerResellerMetricPctChangePerMetric.top_n_per_metric,
            threshold:
              snapshotPerResellerMetricPctChangePerMetric.threshold,
            rows: snapshotPerResellerMetricPctChangePerMetric.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_coverage:
      snapshotPerResellerMetricPctChangeCoverage
        ? {
            window_size:
              snapshotPerResellerMetricPctChangeCoverage.window_size,
            first_week:
              snapshotPerResellerMetricPctChangeCoverage.first_week,
            last_week:
              snapshotPerResellerMetricPctChangeCoverage.last_week,
            threshold: snapshotPerResellerMetricPctChangeCoverage.threshold,
            rows: snapshotPerResellerMetricPctChangeCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_coverage:
      snapshotPerResellerPctChangeCoverage
        ? {
            window_size: snapshotPerResellerPctChangeCoverage.window_size,
            first_week: snapshotPerResellerPctChangeCoverage.first_week,
            last_week: snapshotPerResellerPctChangeCoverage.last_week,
            threshold: snapshotPerResellerPctChangeCoverage.threshold,
            rows: snapshotPerResellerPctChangeCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_per_reseller:
      snapshotPerResellerMetricPctChangePerReseller
        ? {
            window_size:
              snapshotPerResellerMetricPctChangePerReseller.window_size,
            first_week:
              snapshotPerResellerMetricPctChangePerReseller.first_week,
            last_week:
              snapshotPerResellerMetricPctChangePerReseller.last_week,
            top_n_per_reseller:
              snapshotPerResellerMetricPctChangePerReseller.top_n_per_reseller,
            threshold:
              snapshotPerResellerMetricPctChangePerReseller.threshold,
            rows: snapshotPerResellerMetricPctChangePerReseller.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_top_movers: snapshotTopMovers
      ? {
          window_size: snapshotTopMovers.window_size,
          first_week: snapshotTopMovers.first_week,
          last_week: snapshotTopMovers.last_week,
          top_n: snapshotTopMovers.top_n,
          rows: snapshotTopMovers.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_top_movers_per_metric: snapshotTopMoversPerMetric
      ? {
          window_size: snapshotTopMoversPerMetric.window_size,
          first_week: snapshotTopMoversPerMetric.first_week,
          last_week: snapshotTopMoversPerMetric.last_week,
          top_n_per_metric: snapshotTopMoversPerMetric.top_n_per_metric,
          rows: snapshotTopMoversPerMetric.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_top_movers_per_reseller: snapshotTopMoversPerReseller
      ? {
          window_size: snapshotTopMoversPerReseller.window_size,
          first_week: snapshotTopMoversPerReseller.first_week,
          last_week: snapshotTopMoversPerReseller.last_week,
          top_n_per_reseller: snapshotTopMoversPerReseller.top_n_per_reseller,
          rows: snapshotTopMoversPerReseller.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_direction_streaks: snapshotDirectionStreaks
      ? {
          window_size: snapshotDirectionStreaks.window_size,
          first_week: snapshotDirectionStreaks.first_week,
          last_week: snapshotDirectionStreaks.last_week,
          min_streak_length: snapshotDirectionStreaks.min_streak_length,
          rows: snapshotDirectionStreaks.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_direction_streaks:
      snapshotPerResellerDirectionStreaks
        ? {
            window_size: snapshotPerResellerDirectionStreaks.window_size,
            first_week: snapshotPerResellerDirectionStreaks.first_week,
            last_week: snapshotPerResellerDirectionStreaks.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreaks.min_streak_length,
            rows: snapshotPerResellerDirectionStreaks.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streaks: snapshotPctChangeStreaks
      ? {
          window_size: snapshotPctChangeStreaks.window_size,
          first_week: snapshotPctChangeStreaks.first_week,
          last_week: snapshotPctChangeStreaks.last_week,
          min_streak_length: snapshotPctChangeStreaks.min_streak_length,
          threshold: snapshotPctChangeStreaks.threshold,
          rows: snapshotPctChangeStreaks.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_pct_change_streaks:
      snapshotPerResellerPctChangeStreaks
        ? {
            window_size: snapshotPerResellerPctChangeStreaks.window_size,
            first_week: snapshotPerResellerPctChangeStreaks.first_week,
            last_week: snapshotPerResellerPctChangeStreaks.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreaks.min_streak_length,
            threshold: snapshotPerResellerPctChangeStreaks.threshold,
            rows: snapshotPerResellerPctChangeStreaks.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_coverage: snapshotPctChangeStreakCoverage
      ? {
          window_size: snapshotPctChangeStreakCoverage.window_size,
          first_week: snapshotPctChangeStreakCoverage.first_week,
          last_week: snapshotPctChangeStreakCoverage.last_week,
          min_streak_length: snapshotPctChangeStreakCoverage.min_streak_length,
          threshold: snapshotPctChangeStreakCoverage.threshold,
          total_metrics: snapshotPctChangeStreakCoverage.total_metrics,
          metrics_with_streak:
            snapshotPctChangeStreakCoverage.metrics_with_streak,
          coverage_rate_pct: snapshotPctChangeStreakCoverage.coverage_rate_pct,
          min_length: snapshotPctChangeStreakCoverage.min_length,
          max_length: snapshotPctChangeStreakCoverage.max_length,
          median_length: snapshotPctChangeStreakCoverage.median_length,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_pct_change_streak_coverage:
      snapshotPerResellerPctChangeStreakCoverage
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakCoverage.window_size,
            first_week: snapshotPerResellerPctChangeStreakCoverage.first_week,
            last_week: snapshotPerResellerPctChangeStreakCoverage.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakCoverage.min_streak_length,
            threshold: snapshotPerResellerPctChangeStreakCoverage.threshold,
            rows: snapshotPerResellerPctChangeStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_coverage: snapshotDirectionStreakCoverage
      ? {
          window_size: snapshotDirectionStreakCoverage.window_size,
          first_week: snapshotDirectionStreakCoverage.first_week,
          last_week: snapshotDirectionStreakCoverage.last_week,
          min_streak_length: snapshotDirectionStreakCoverage.min_streak_length,
          total_metrics: snapshotDirectionStreakCoverage.total_metrics,
          metrics_with_streak:
            snapshotDirectionStreakCoverage.metrics_with_streak,
          metrics_up_streak: snapshotDirectionStreakCoverage.metrics_up_streak,
          metrics_down_streak:
            snapshotDirectionStreakCoverage.metrics_down_streak,
          coverage_rate_pct: snapshotDirectionStreakCoverage.coverage_rate_pct,
          up_coverage_rate_pct:
            snapshotDirectionStreakCoverage.up_coverage_rate_pct,
          down_coverage_rate_pct:
            snapshotDirectionStreakCoverage.down_coverage_rate_pct,
          min_length: snapshotDirectionStreakCoverage.min_length,
          max_length: snapshotDirectionStreakCoverage.max_length,
          median_length: snapshotDirectionStreakCoverage.median_length,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_direction_streak_coverage:
      snapshotPerResellerDirectionStreakCoverage
        ? {
            window_size:
              snapshotPerResellerDirectionStreakCoverage.window_size,
            first_week:
              snapshotPerResellerDirectionStreakCoverage.first_week,
            last_week: snapshotPerResellerDirectionStreakCoverage.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakCoverage.min_streak_length,
            rows: snapshotPerResellerDirectionStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_coverage:
      snapshotPerMetricDirectionStreakCoverage
        ? {
            window_size: snapshotPerMetricDirectionStreakCoverage.window_size,
            first_week: snapshotPerMetricDirectionStreakCoverage.first_week,
            last_week: snapshotPerMetricDirectionStreakCoverage.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakCoverage.min_streak_length,
            rows: snapshotPerMetricDirectionStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_coverage:
      snapshotPerMetricPctChangeStreakCoverage
        ? {
            window_size: snapshotPerMetricPctChangeStreakCoverage.window_size,
            first_week: snapshotPerMetricPctChangeStreakCoverage.first_week,
            last_week: snapshotPerMetricPctChangeStreakCoverage.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakCoverage.min_streak_length,
            threshold: snapshotPerMetricPctChangeStreakCoverage.threshold,
            rows: snapshotPerMetricPctChangeStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_leaderboard:
      snapshotDirectionStreakLeaderboard
        ? {
            window_size: snapshotDirectionStreakLeaderboard.window_size,
            first_week: snapshotDirectionStreakLeaderboard.first_week,
            last_week: snapshotDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotDirectionStreakLeaderboard.min_streak_length,
            top_n: snapshotDirectionStreakLeaderboard.top_n,
            total_qualified:
              snapshotDirectionStreakLeaderboard.total_qualified,
            rows: snapshotDirectionStreakLeaderboard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_leaderboard:
      snapshotPctChangeStreakLeaderboard
        ? {
            window_size: snapshotPctChangeStreakLeaderboard.window_size,
            first_week: snapshotPctChangeStreakLeaderboard.first_week,
            last_week: snapshotPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPctChangeStreakLeaderboard.min_streak_length,
            threshold: snapshotPctChangeStreakLeaderboard.threshold,
            top_n: snapshotPctChangeStreakLeaderboard.top_n,
            total_qualified:
              snapshotPctChangeStreakLeaderboard.total_qualified,
            rows: snapshotPctChangeStreakLeaderboard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_leaderboard:
      snapshotPerMetricDirectionStreakLeaderboard
        ? {
            window_size:
              snapshotPerMetricDirectionStreakLeaderboard.window_size,
            first_week:
              snapshotPerMetricDirectionStreakLeaderboard.first_week,
            last_week: snapshotPerMetricDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakLeaderboard.min_streak_length,
            top_n_per_metric:
              snapshotPerMetricDirectionStreakLeaderboard.top_n_per_metric,
            groups: snapshotPerMetricDirectionStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_leaderboard:
      snapshotPerMetricPctChangeStreakLeaderboard
        ? {
            window_size:
              snapshotPerMetricPctChangeStreakLeaderboard.window_size,
            first_week:
              snapshotPerMetricPctChangeStreakLeaderboard.first_week,
            last_week:
              snapshotPerMetricPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakLeaderboard.min_streak_length,
            threshold: snapshotPerMetricPctChangeStreakLeaderboard.threshold,
            top_n_per_metric:
              snapshotPerMetricPctChangeStreakLeaderboard.top_n_per_metric,
            groups: snapshotPerMetricPctChangeStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_direction_streak_leaderboard:
      snapshotPerResellerDirectionStreakLeaderboard
        ? {
            window_size:
              snapshotPerResellerDirectionStreakLeaderboard.window_size,
            first_week:
              snapshotPerResellerDirectionStreakLeaderboard.first_week,
            last_week:
              snapshotPerResellerDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakLeaderboard.min_streak_length,
            top_n_per_reseller:
              snapshotPerResellerDirectionStreakLeaderboard.top_n_per_reseller,
            groups: snapshotPerResellerDirectionStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_streak_leaderboard:
      snapshotPerResellerPctChangeStreakLeaderboard
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakLeaderboard.window_size,
            first_week:
              snapshotPerResellerPctChangeStreakLeaderboard.first_week,
            last_week:
              snapshotPerResellerPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakLeaderboard.min_streak_length,
            threshold:
              snapshotPerResellerPctChangeStreakLeaderboard.threshold,
            top_n_per_reseller:
              snapshotPerResellerPctChangeStreakLeaderboard.top_n_per_reseller,
            groups: snapshotPerResellerPctChangeStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_length_histogram:
      snapshotDirectionStreakLengthHistogram
        ? {
            window_size:
              snapshotDirectionStreakLengthHistogram.window_size,
            first_week:
              snapshotDirectionStreakLengthHistogram.first_week,
            last_week:
              snapshotDirectionStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotDirectionStreakLengthHistogram.min_streak_length,
            total_streaks:
              snapshotDirectionStreakLengthHistogram.total_streaks,
            max_length:
              snapshotDirectionStreakLengthHistogram.max_length,
            buckets: snapshotDirectionStreakLengthHistogram.buckets,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_length_histogram:
      snapshotPctChangeStreakLengthHistogram
        ? {
            window_size:
              snapshotPctChangeStreakLengthHistogram.window_size,
            first_week:
              snapshotPctChangeStreakLengthHistogram.first_week,
            last_week:
              snapshotPctChangeStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPctChangeStreakLengthHistogram.min_streak_length,
            threshold:
              snapshotPctChangeStreakLengthHistogram.threshold,
            total_streaks:
              snapshotPctChangeStreakLengthHistogram.total_streaks,
            max_length:
              snapshotPctChangeStreakLengthHistogram.max_length,
            buckets: snapshotPctChangeStreakLengthHistogram.buckets,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_direction_streak_length_histogram:
      snapshotPerResellerDirectionStreakLengthHistogram
        ? {
            window_size:
              snapshotPerResellerDirectionStreakLengthHistogram.window_size,
            first_week:
              snapshotPerResellerDirectionStreakLengthHistogram.first_week,
            last_week:
              snapshotPerResellerDirectionStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakLengthHistogram.min_streak_length,
            groups:
              snapshotPerResellerDirectionStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_streak_length_histogram:
      snapshotPerResellerPctChangeStreakLengthHistogram
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakLengthHistogram.window_size,
            first_week:
              snapshotPerResellerPctChangeStreakLengthHistogram.first_week,
            last_week:
              snapshotPerResellerPctChangeStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakLengthHistogram.min_streak_length,
            threshold:
              snapshotPerResellerPctChangeStreakLengthHistogram.threshold,
            groups:
              snapshotPerResellerPctChangeStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    ran_at: now.toISOString(),
  };

  // P11.13 snapshot persistence — append one JSONL row so future ticks can
  // compute week-over-week deltas without re-running every Supabase query. A
  // fs failure MUST NOT break the digest response since the email + numeric
  // envelope are the authoritative product; the JSONL is an aid, not a gate.
  try {
    const snapshot = buildDigestSnapshot({
      capturedAt: now,
      week,
      envelope: body,
    });
    const line = serialiseDigestSnapshot(snapshot);
    try {
      mkdirSync(dirname(digestJsonlPath), { recursive: true });
    } catch {
      /* ignore — parent likely exists */
    }
    appendFileSync(digestJsonlPath, line, { encoding: "utf8" });
  } catch (e) {
    console.error("[reseller-weekly-digest] snapshot append failed", e);
  }

  return NextResponse.json(body);
}

export { GET as POST };
