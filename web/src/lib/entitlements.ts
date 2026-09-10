// Entitlement engine — canonical `can(user, feature)` API.
//
// Single source of truth for gating paid features. Reads the `plans` table
// (via plans-db.ts with 60s in-memory TTL) and evaluates whether the current
// user's plan grants the requested feature flag. Falls back to an in-memory
// map for legacy plan IDs (`free`, `founding50`, `growth`, `growth_annual`)
// so grandfathered customers keep their capabilities during the v2 rollout.
//
// All gate hits are optionally recorded to `analytics_events` for the
// upgrade-CTA funnel (feature_gate_hit) — CDO wires GA4 off the same event.
//
// Server-only mutation (recordGateHit) uses the Supabase service role via
// getSupabaseAdmin(). Pure lookups (can/requireFeature) work in any runtime
// because plans-db keeps the last-good snapshot in memory.

import "server-only";

import { getPlanCached } from "@/lib/plans-db";
import { getUserGrantedFeatures } from "@/lib/entitlements/user-grants";
import { getUserTimedGrants } from "@/lib/entitlements/timed-grants";
import { getSupabaseAdmin } from "@/lib/supabase";
import { shouldFire, recordConversionEvent } from "@/lib/conversion/triggers";
import { emitEvent } from "@/lib/analytics/server";

// ---------------------------------------------------------------------------
// Feature catalog — union of every gate name used across the product.
// Keep this in sync with plans.feature_flags JSONB values seeded in
// migration 0074_plans_matrix.sql (see CTO spec §3).
// ---------------------------------------------------------------------------

export type Feature =
  // Founder track
  | "svi.run"
  | "svi.run.limited"
  | "profile.multi"
  | "cap_table.write"
  | "cap_table.read"
  | "data_room.access"
  | "data_room.read"
  | "data_room.write"
  | "evidence.upload"
  | "report.basic"
  | "report.premium"
  | "investor_links"
  | "investor_links.premium"
  | "term_sheet.ai"
  | "term_sheet_ai"
  | "esop.manage"
  | "blockchain.sync"
  | "advisor_portal"
  | "advisor.cohort"
  | "white_label"
  | "pdf_branding"
  | "sso"
  | "api"
  | "api.access"
  | "multi_entity"
  | "sla"
  | "equity_offer.request"
  // Investor track
  | "watchlist"
  | "svi.feed"
  | "diligence_pack"
  | "portfolio"
  | "lp_export"
  | "custom_benchmark"
  | "multi_fund"
  | "investor.dealflow"
  // Advisor / accelerator track
  | "advisory_equity"
  | "cohort.view"
  | "cohort.manage"
  | "cohort.view.stats"
  | "accelerator.cohort"
  | "weekly_delta"
  | "lp_report"
  // Reseller module (docs/plans/reseller-module-plan.md § A.2, U.14, U.15.13)
  | "reseller.console"
  | "reseller.create_startup"
  | "reseller.grant_credits"
  // Founder Startup Package (Ship-1 guided-flow SKU). Unlocks the guided
  // interview, agent dispatch, live SVI meter, Day-0 dataroom, and public
  // /startup/[slug] listing. See docs/plans/startup-package.
  | "startup_package"
  // Share Management add-on bundle (§ F, U.15.13). Delegates all cap-table /
  // data-room / esop / blockchain / token / vesting primitives.
  | "share_management"
  | "vesting.read"
  | "vesting.write"
  // Money Finder (G11 T0242, plan §4e/§4h). `grant_finder` = the full ranked
  // grant & program report is included in the plan (no credit spend);
  // `money_radar` = Founder Radar deadline alerts (surface wired in T0247).
  // Granted from Starter up, to the Startup Package and to every evaluator
  // rung — mirrored in plans.csv + migration 0316.
  | "grant_finder"
  | "money_radar";

// ---------------------------------------------------------------------------
// Session subset — matches what `/api/entitlement/me` returns to the client
// and what call-sites pass into `can()`. Kept intentionally slim (no PII).
// ---------------------------------------------------------------------------

export interface UserWithPlan {
  id: string;
  plan: string;
  segment: string;
  jurisdiction?: string;
  legal_review_passed?: boolean;
}

// ---------------------------------------------------------------------------
// Legacy plan mapping — grandfather the pre-v2 SKUs into v2 entitlements
// without forcing a DB rewrite. Consulted only if plans-db lookup misses.
// ---------------------------------------------------------------------------

const LEGACY_PLAN_MAP: Record<string, string> = {
  free: "founder_free",
  founding50: "founder_starter",
  growth: "founder_growth",
  growth_annual: "founder_growth",
};

// Fallback feature bundles for legacy plans when the plans table has not been
// seeded yet (fresh dev DB, or migration failure). Mirrors 0074_plans_matrix.
// Exported so entitlements/tier-ladder.test.ts can assert the ladder covers
// every feature key the fallback surfaces (no orphan gates).
export const LEGACY_FEATURE_FALLBACK: Record<string, Feature[]> = {
  founder_free: ["svi.run.limited", "startup_package"],
  founder_starter: [
    "svi.run",
    "evidence.upload",
    "report.basic",
    "investor_links",
    // 2026-09-09: the A$29 rung's data room and live investor link, moved
    // down from Growth. Kept in step with plans.csv + migration 0131 so a
    // plans-table miss cannot silently take back what the homepage sells.
    "data_room.access",
    "investor_links.premium",
    // 2026-09-10 (T0242): Money Finder report + Founder Radar are part of
    // the A$29 rung ("free with Founder Radar" on the /funding paywall).
    "grant_finder",
    "money_radar",
  ],
  founder_growth: [
    "svi.run",
    "evidence.upload",
    "report.basic",
    "report.premium",
    "cap_table.write",
    "cap_table.read",
    "data_room.read",
    "data_room.access",
    "term_sheet.ai",
    "term_sheet_ai",
    "investor_links",
    "investor_links.premium",
    "profile.multi",
    "pdf_branding",
    "equity_offer.request",
    // 2026-09-07 (B6): Growth (A$99) buys the Cap Table + Data Room
    // package per the Universal 3-rung ladder — the stand-alone
    // share_management add-on was silently 402'ing A$99 subscribers
    // when they tried to open /workspace/cap-table.
    "share_management",
    "grant_finder",
    "money_radar",
  ],
  founder_scale: [
    "svi.run",
    "evidence.upload",
    "report.basic",
    "report.premium",
    "cap_table.write",
    "cap_table.read",
    "data_room.write",
    "data_room.read",
    "data_room.access",
    "term_sheet.ai",
    "term_sheet_ai",
    "investor_links",
    "investor_links.premium",
    "profile.multi",
    "esop.manage",
    "blockchain.sync",
    "advisor_portal",
    "white_label",
    "pdf_branding",
    "equity_offer.request",
    // Redundant with Growth's grant — kept for belt-and-braces so a
    // grandfathered Scale (now displayed as Pro) subscriber without the
    // DB row still resolves share_management.
    "share_management",
    "grant_finder",
    "money_radar",
  ],
  founder_enterprise: [
    "svi.run",
    "evidence.upload",
    "report.basic",
    "report.premium",
    "cap_table.write",
    "cap_table.read",
    "data_room.write",
    "data_room.read",
    "data_room.access",
    "term_sheet.ai",
    "term_sheet_ai",
    "investor_links",
    "investor_links.premium",
    "profile.multi",
    "esop.manage",
    "blockchain.sync",
    "advisor_portal",
    "white_label",
    "pdf_branding",
    "sso",
    "api",
    "api.access",
    "multi_entity",
    "sla",
    "equity_offer.request",
    "share_management",
    "grant_finder",
    "money_radar",
  ],
  // Startup Package (A$149 one-off, plans.csv founder_package). Ship-1 gave
  // it startup_package + pdf_branding; T0242 adds the Money Finder report so
  // the paywall card reads "included in your Startup Package".
  founder_package: ["startup_package", "pdf_branding", "grant_finder", "money_radar"],
  // Why: reseller-admin plan is not in the plans table (0074 or plans.csv);
  // without this bundle, gateRequireFeature("reseller.*") 402s every reseller
  // console + mutation route so the Playwright wave-1..3 rows in
  // docs/plans/p10-deferred-spec-activation-order.md can never green.
  // See docs/plans/p10-wave1-preflight-finding.md finding #2 (Option A).
  reseller_admin: [
    "reseller.console",
    "reseller.create_startup",
    "reseller.grant_credits",
  ],
  // G12 (2026-09-10): evaluator + accelerator bundles mirror the tier-ladder
  // feature lists so a fresh DB (or a plans-row read failure) never locks a
  // paying Scout / Firm / Program / Cohort customer out of the pages that
  // gate on investor.dealflow, watchlist, portfolio, advisor_portal,
  // advisor.cohort, accelerator.cohort and lp_report. Same lists as
  // plans.csv + migration 0309.
  // Every evaluator rung also gets the Money Finder report + radar (T0242):
  // a Scout / Firm / Program user runs it for the startups they evaluate.
  investor_angel: ["watchlist", "svi.feed", "investor.dealflow", "grant_finder", "money_radar"],
  investor_advisor: [
    "watchlist", "svi.feed", "investor.dealflow",
    "advisory_equity", "advisor_portal", "advisor.cohort", "white_label",
    "grant_finder", "money_radar",
  ],
  investor_vc_small: [
    "watchlist", "svi.feed", "investor.dealflow",
    "advisory_equity", "advisor_portal", "advisor.cohort", "white_label",
    "portfolio", "diligence_pack", "api", "api.access", "lp_export", "lp_report",
    "grant_finder", "money_radar",
  ],
  investor_vc_ent: [
    "watchlist", "svi.feed", "investor.dealflow",
    "advisory_equity", "advisor_portal", "advisor.cohort", "white_label",
    "portfolio", "diligence_pack", "api", "api.access", "lp_export", "lp_report",
    "custom_benchmark", "multi_fund", "sso", "weekly_delta",
    "grant_finder", "money_radar",
  ],
  accelerator_starter: ["cohort.view", "cohort.view.stats", "accelerator.cohort"],
  accelerator_growth: ["cohort.view", "cohort.view.stats", "accelerator.cohort", "cohort.manage"],
  accelerator_enterprise: [
    "cohort.view", "cohort.view.stats", "accelerator.cohort", "cohort.manage",
    "white_label", "api", "api.access", "sso", "lp_report",
  ],
};

// ---------------------------------------------------------------------------
// resolvePlanId — apply legacy mapping BEFORE hitting the plans table.
// This means a customer with plan="growth" resolves to plans.id="founder_growth".
// ---------------------------------------------------------------------------

function resolvePlanId(planId: string | null | undefined): string {
  if (!planId) return "founder_free";
  return LEGACY_PLAN_MAP[planId] ?? planId;
}

// ---------------------------------------------------------------------------
// getEntitlements — the effective feature flag set, in two layers.
//
//   plan layer  — plans.feature_flags for the resolved plan id, falling back
//                 to LEGACY_FEATURE_FALLBACK when the table has not been
//                 seeded. Unchanged behaviour; this is what every caller got
//                 before add-ons existed.
//   user layer  — features granted to this specific user in the `entitlements`
//                 table: a paid add-on, or a manual support override. Unioned
//                 on top; it can only ever widen.
//   timed layer — features a one-off purchase grants for a window, read off
//                 `app_users` timestamp columns (entitlements/timed-grants.ts;
//                 today only `money_radar_until`). Same union-only rule.
//
// Why `userId` is an optional second argument rather than a new signature or a
// parallel `getEntitlementsForUser()`
// ------------------------------------------------------------------------
// `can(user, feature)` — which is what all 39+ gate call sites actually reach
// for, via `requireFeature`, `gateRequireFeature` and `requireTierForPage` —
// already receives a `UserWithPlan` and therefore already has the user id. It
// simply was not passing it down. So making entitlement resolution user-aware
// needs no change at any gate call site at all: `can()` passes `user.id` and
// every gate becomes add-on-aware at once. The wide mechanical rename the
// problem statement worried about turns out not to be necessary.
//
// A parallel user-aware function was the alternative, and the objection to it
// is real: two resolvers drift, and the day one of them learns about a new
// grant source and the other does not is the day a paying customer is denied
// something they bought. This keeps ONE resolver and ONE union rule. The
// optional argument is not a second API; it is the same API told who is
// asking.
//
// Omitting `userId` is safe by construction: it yields the plan layer alone,
// which is narrower. A call site that forgets it under-grants (the user sees
// an upgrade prompt for something they own — visible, reported, fixable) and
// can never over-grant.
// ---------------------------------------------------------------------------

export async function getEntitlements(
  planId: string | null | undefined,
  userId?: string | null,
): Promise<string[]> {
  const resolved = resolvePlanId(planId);

  let planFlags: string[] | null = null;
  try {
    const row = await getPlanCached(resolved);
    if (row && Array.isArray(row.feature_flags)) {
      planFlags = row.feature_flags as string[];
    }
  } catch {
    // fall through to fallback
  }

  if (planFlags === null) {
    planFlags = [
      ...(LEGACY_FEATURE_FALLBACK[resolved] ?? LEGACY_FEATURE_FALLBACK.founder_free ?? []),
    ];
  }

  if (!userId) return planFlags;

  // Never throws and returns [] on any failure, so a database outage denies
  // add-on features and leaves the plan layer intact. The timed layer
  // (`app_users.money_radar_until`, 0319 — the Startup Package's 90 days of
  // Founder Radar, T0247) follows the same union-only / fail-closed contract.
  const [granted, timed] = await Promise.all([
    getUserGrantedFeatures(userId),
    getUserTimedGrants(userId),
  ]);
  if (granted.length === 0 && timed.length === 0) return planFlags;

  return Array.from(new Set([...planFlags, ...granted, ...timed]));
}

// ---------------------------------------------------------------------------
// can — the single API every gate calls. Never throws; returns bool so the
// caller can decide between fallback UI, redirect, or 402 response.
// ---------------------------------------------------------------------------

export async function can(user: UserWithPlan | null, feature: Feature): Promise<boolean> {
  if (!user) return false;
  const flags = await getEntitlements(user.plan, user.id);
  const allowed = flags.includes(feature);
  if (!allowed) {
    // Fire-and-forget CRO trigger — analytics must never block feature gate.
    void (async () => {
      try {
        const decision = await shouldFire({
          userId: user.id,
          sessionId: null, // session not available server-side; client cap enforced by useUpgradePrompt()
          trigger: "feature_gate_hit",
        });
        if (decision.fire) {
          await recordConversionEvent({
            userId: user.id,
            trigger: "feature_gate_hit",
            action: "shown",
            planFrom: user.plan ?? null,
            detail: { feature },
          });
        }
      } catch {
        // never block the gate result
      }
    })();
  }
  return allowed;
}

// ---------------------------------------------------------------------------
// requireFeature — throws when the user lacks the feature. Route handlers
// wrap this in try/catch and translate to a 402 (payment required) response.
// ---------------------------------------------------------------------------

export class EntitlementError extends Error {
  readonly feature: Feature;
  readonly userId: string | null;
  readonly reason: "not_authenticated" | "feature_locked";
  constructor(feature: Feature, userId: string | null) {
    super(
      userId
        ? `User ${userId} lacks feature "${feature}"`
        : `Authentication required for feature "${feature}"`,
    );
    this.feature = feature;
    this.userId = userId;
    this.reason = userId ? "feature_locked" : "not_authenticated";
    this.name = "EntitlementError";
  }
}

export async function requireFeature(user: UserWithPlan | null, feature: Feature): Promise<void> {
  const ok = await can(user, feature);
  if (!ok) throw new EntitlementError(feature, user?.id ?? null);
}

// ---------------------------------------------------------------------------
// usageRemaining — how many units of a metered resource remain in the
// current billing period. Reads plan.usage_limits (from plans table) minus
// current consumption from usage_logs.
//
// Keys:
//   - profiles          — total distinct startup profiles created (lifetime)
//   - svi_per_month     — SVI analyses run in the trailing 30d
//   - monthly_credits   — credits granted this month vs consumed
// ---------------------------------------------------------------------------

type UsageKey = "profiles" | "svi_per_month" | "monthly_credits";

export async function usageRemaining(user: UserWithPlan, key: UsageKey): Promise<number> {
  const resolved = resolvePlanId(user.plan);
  let cap = 0;

  try {
    const plan = await getPlanCached(resolved);
    const limits = (plan?.usage_limits ?? {}) as Record<string, number>;
    cap = typeof limits[key] === "number" ? limits[key] : 0;
  } catch {
    cap = 0;
  }

  // Unlimited sentinel (>= 9999) — surface as a large number for callers to
  // treat as "no cap" without needing separate typing.
  if (cap >= 9999) return Number.MAX_SAFE_INTEGER;

  const supabase = getSupabaseAdmin();
  if (!supabase) return cap;

  const now = Date.now();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (key === "svi_per_month") {
    const { count } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("feature", ["svi_analysis", "svi_report", "svi.run"])
      .gte("created_at", monthAgo);
    return Math.max(0, cap - (count ?? 0));
  }

  if (key === "profiles") {
    // Startup profiles are stored in `svi_startups` (owner_user_id column).
    // Tolerate the older `startups` table name for pre-migration installs.
    const { count } = await supabase
      .from("svi_startups")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id);
    return Math.max(0, cap - (count ?? 0));
  }

  if (key === "monthly_credits") {
    // Credits granted THIS month by plan (positive amounts, reason=plan_grant)
    // minus spent this month. Fractional-safe.
    const { data: txs } = await supabase
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", user.id)
      .gte("created_at", monthAgo);
    const spent = (txs ?? [])
      .map((t: { amount: number }) => t.amount)
      .filter((n) => n < 0)
      .reduce((sum, n) => sum + Math.abs(n), 0);
    return Math.max(0, cap - spent);
  }

  return cap;
}

// ---------------------------------------------------------------------------
// recordGateHit — fire-and-forget insert into analytics_events for the
// upgrade-CTA funnel. Also mirrors to entitlement_events (audit table from
// migration 0075) when available so compliance has a full record.
// ---------------------------------------------------------------------------

export async function recordGateHit(
  user: UserWithPlan | null,
  feature: Feature,
  source: "menu" | "action" | "api",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const params = {
    feature,
    source,
    plan: user?.plan ?? null,
    segment: user?.segment ?? null,
  };

  // analytics_events (CDO T-1009 — GA4 + BQ mirror via typed emitEvent pipeline).
  void emitEvent({
    name: "feature_gate_hit",
    params,
    userId: user?.id ?? null,
    source: "server",
    consentGranted: true,
  });

  // entitlement_events (audit trail from 0075_entitlements_audit.sql).
  try {
    if (user?.id) {
      await supabase.from("entitlement_events").insert({
        user_id: user.id,
        feature,
        allowed: false,
        plan_id: user.plan ?? null,
        reason: "feature_locked",
        request_path: source,
      });
    }
  } catch {
    // audit table optional at this stage
  }
}
