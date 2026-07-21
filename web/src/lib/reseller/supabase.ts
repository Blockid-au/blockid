// Typed reseller-scoped Supabase wrapper.
//
// Per docs/plans/reseller-module-plan.md § U.15.13 (CISO D3-CISO-01):
// this replaces the ad-hoc `scopedReseller` grep enforcement with a typed
// data-access boundary. Every read/write auto-injects reseller_id filtering
// so a forgotten `.eq('reseller_id', …)` cannot leak cross-tenant data.
//
// Usage inside /api/reseller/* handlers:
//
//   const scope = await scopedReseller(user);
//   const db = resellerSupabase(scope);
//   const customers = await db.attributedCustomers();  // auto-scoped
//   const codes = await db.promotionCodes();           // auto-scoped
//
// The wrapper is intentionally NARROW: it exposes only the read shapes and
// mutations that the reseller console legitimately needs. Anything requiring
// a raw admin client must go through a separate audited helper.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { ScopedResellerSession } from "./scope";

export interface AttributedCustomerRow {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface PromotionCodeRow {
  id: string;
  tier_pct: number;
  code: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  active: boolean;
  created_at: string;
}

export interface AttributionRow {
  id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
  status: string;
  attributed_at: string;
  source: string;
  promotion_code_id: string | null;
}

/**
 * Build a reseller-scoped data-access surface. All reads are auto-scoped
 * to the session's reseller_id. Never returns rows for other resellers.
 */
export function resellerSupabase(scope: ScopedResellerSession) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("resellerSupabase: supabase not configured");

  return {
    /** The current reseller row (self). */
    async selfReseller() {
      const { data, error } = await supabase
        .from("resellers")
        .select("*")
        .eq("id", scope.reseller_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    /** All active promotion codes owned by this reseller. */
    async promotionCodes(): Promise<PromotionCodeRow[]> {
      const { data, error } = await supabase
        .from("reseller_promotion_codes")
        .select("id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active, created_at")
        .eq("reseller_id", scope.reseller_id)
        .order("tier_pct", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PromotionCodeRow[];
    },

    /** Attributed customers (operational fields only — no workspace content). */
    async attributedCustomers(): Promise<AttributedCustomerRow[]> {
      const allowedIds = await scope.allowedCustomerIds();
      if (allowedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("app_users")
        .select("id, email, display_name, created_at, last_login_at")
        .in("id", allowedIds);
      if (error) throw error;
      return (data ?? []).map((u: {id: string; email: string; display_name: string | null; created_at: string; last_login_at: string | null;}) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.display_name,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
      }));
    },

    /** Active attribution rows for this reseller. */
    async attributions(): Promise<AttributionRow[]> {
      const { data, error } = await supabase
        .from("reseller_attributions")
        .select("id, subject_type, subject_user_id, subject_project_id, status, attributed_at, source, promotion_code_id")
        .eq("reseller_id", scope.reseller_id)
        .eq("status", "active")
        .eq("opted_out", false);
      if (error) throw error;
      return (data ?? []) as AttributionRow[];
    },

    /**
     * Portfolio SVI aggregate — one row per (month, project). k>=5 anonymity
     * (U.15.3) enforced by the caller before rendering; this helper returns
     * raw scoped rows and the caller aggregates + suppresses.
     */
    async portfolioSviRaw() {
      const allowedIds = await scope.allowedCustomerIds();
      if (allowedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("svi_analyses")
        .select("id, project_id, score, created_at")
        .in("user_id", allowedIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    /**
     * Insert a reseller-audit-log row. Every reseller-console read of a
     * customer surface calls this via a middleware; see D.3 (E.3).
     */
    async auditLog(entry: {
      actor_user_id: string;
      subject_user_id?: string | null;
      action: string;
      fields?: string[];
      route: string;
      ip?: string | null;
      user_agent?: string | null;
      metadata?: Record<string, unknown>;
    }) {
      const { error } = await supabase.from("reseller_audit_log").insert({
        reseller_id: scope.reseller_id,
        actor_user_id: entry.actor_user_id,
        subject_user_id: entry.subject_user_id ?? null,
        action: entry.action,
        fields: entry.fields ?? [],
        route: entry.route,
        ip: entry.ip ?? null,
        user_agent: entry.user_agent ?? null,
        metadata: entry.metadata ?? {},
      });
      if (error) throw error;
    },
  };
}

export type ResellerSupabase = ReturnType<typeof resellerSupabase>;
