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

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildAnomalySummary,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  type AuditLogRow,
} from "@/lib/reseller/audit-anomaly";
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
    .select("reseller_id, subject_type, subject_user_id, subject_project_id")
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
  let html = formatWeeklyDigestEmail(week, digestRows);

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

  return NextResponse.json({
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
    ran_at: now.toISOString(),
  });
}

export { GET as POST };
