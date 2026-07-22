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
import { getSupabaseAdmin } from "@/lib/supabase";

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
  | "white_label"
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
  // Share Management add-on bundle (§ F, U.15.13). Delegates all cap-table /
  // data-room / esop / blockchain / token / vesting primitives.
  | "share_management"
  | "vesting.read"
  | "vesting.write";

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
const LEGACY_FEATURE_FALLBACK: Record<string, Feature[]> = {
  founder_free: ["svi.run.limited"],
  founder_starter: [
    "svi.run",
    "evidence.upload",
    "report.basic",
    "investor_links",
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
    "equity_offer.request",
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
    "equity_offer.request",
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
    "sso",
    "api",
    "api.access",
    "multi_entity",
    "sla",
    "equity_offer.request",
  ],
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
// getEntitlements — load the effective feature flag set for a user, merging
// DB row (source of truth) with the legacy fallback table.
// Exported so `/api/entitlement/me` can return the full list to the client.
// ---------------------------------------------------------------------------

export async function getEntitlements(planId: string | null | undefined): Promise<string[]> {
  const resolved = resolvePlanId(planId);

  try {
    const row = await getPlanCached(resolved);
    if (row && Array.isArray(row.feature_flags)) {
      return row.feature_flags as string[];
    }
  } catch {
    // fall through to fallback
  }

  return LEGACY_FEATURE_FALLBACK[resolved] ?? LEGACY_FEATURE_FALLBACK.founder_free ?? [];
}

// ---------------------------------------------------------------------------
// can — the single API every gate calls. Never throws; returns bool so the
// caller can decide between fallback UI, redirect, or 402 response.
// ---------------------------------------------------------------------------

export async function can(user: UserWithPlan | null, feature: Feature): Promise<boolean> {
  if (!user) return false;
  const flags = await getEntitlements(user.plan);
  return flags.includes(feature);
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

  // analytics_events (CDO — GA4 mirror). Table may not exist yet; ignore errors.
  try {
    await supabase.from("analytics_events").insert({
      user_id: user?.id ?? null,
      event_name: "feature_gate_hit",
      params,
    });
  } catch {
    // table missing or write failed — do not block UX
  }

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
