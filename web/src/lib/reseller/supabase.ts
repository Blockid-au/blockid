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
import type { StageKey } from "@/lib/journey-vocabulary";
import { deriveCanonicalStage } from "./customer-journey";
import type { ScopedResellerSession } from "./scope";

export interface AttributedCustomerRow {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
  onboarding_completed: boolean | null;
  /**
   * Derived canonical VC-journey stage (Idea → Public/Exit). Computed at
   * query-transform time from the customer's latest SVI score — pure
   * function, no DB migration. See
   * docs/plans/real-world-workflow-parity-audit-2026-07-23.md gap #3.
   */
  canonical_stage: StageKey;
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
        .select("id, email, display_name, created_at, last_login_at, onboarding_completed")
        .in("id", allowedIds);
      if (error) throw error;

      // Second query — latest SVI score per customer, used to derive the
      // canonical VC-journey stage. Purely additive; we degrade gracefully
      // if svi_analyses is empty or the query fails (missing scores map to
      // the safe 'idea' bucket via deriveCanonicalStage).
      const latestScoreByUser = new Map<string, number>();
      try {
        const { data: sviRows } = await supabase
          .from("svi_analyses")
          .select("user_id, total_svi, created_at")
          .in("user_id", allowedIds)
          .order("created_at", { ascending: true });
        for (const row of sviRows ?? []) {
          const r = row as { user_id: string; total_svi: number | null };
          if (typeof r.total_svi === "number") {
            // ascending order → last write wins → latest score
            latestScoreByUser.set(r.user_id, r.total_svi);
          }
        }
      } catch {
        // Non-fatal — customers still render, canonical_stage falls back to
        // 'idea' for everyone whose score we couldn't read.
      }

      return (data ?? []).map((u: {id: string; email: string; display_name: string | null; created_at: string; last_login_at: string | null; onboarding_completed: boolean | null;}) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.display_name,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
        onboarding_completed: u.onboarding_completed,
        canonical_stage: deriveCanonicalStage(latestScoreByUser.get(u.id) ?? null),
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
     * Reseller-lens investor-review rows scoped to attributed customers'
     * projects. Selects ONLY the reseller-visible fields (project_id, rating,
     * created_at) — never `comment` or `reviewer_email` — so the U.9 §5
     * "no content" boundary is enforced at the query layer. Caller feeds
     * the rows into buildReviewsSummary() for the k>=5 aggregate rollup.
     */
    async showcaseReviewsAggregate(): Promise<{ project_id: string; rating: number; created_at: string }[]> {
      const allowedIds = await scope.allowedCustomerIds();
      if (allowedIds.length === 0) return [];
      const { data: projectRows, error: projectErr } = await supabase
        .from("projects")
        .select("id")
        .in("user_id", allowedIds);
      if (projectErr) throw projectErr;
      const projectIds = (projectRows ?? []).map((r: { id: string }) => r.id);
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("showcase_reviews")
        .select("project_id, rating, created_at")
        .in("project_id", projectIds);
      if (error) throw error;
      return (data ?? []) as { project_id: string; rating: number; created_at: string }[];
    },

    /**
     * Portfolio SVI aggregate — one row per (month, project). k>=5 anonymity
     * (U.15.3) enforced by the caller before rendering; this helper returns
     * raw scoped rows and the caller aggregates + suppresses.
     */
    async portfolioSviRaw(): Promise<{ id: string; project_id: string; score: number | null; created_at: string }[]> {
      const allowedIds = await scope.allowedCustomerIds();
      if (allowedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("svi_analyses")
        .select("id, project_id, total_svi, created_at")
        .in("user_id", allowedIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: { id: string; project_id: string; total_svi: number | null; created_at: string }) => ({
        id: r.id,
        project_id: r.project_id,
        score: r.total_svi,
        created_at: r.created_at,
      }));
    },

    // -----------------------------------------------------------------
    // Mentor console — reads/writes for the reseller-mentor surface.
    // Tables (mentor_consent / mentor_notes / mentor_checkins /
    // mentor_goals) are gated by their own RLS + a CTO migration; helpers
    // degrade gracefully to [] / null while the schema lands so the UI
    // ships behind a feature flag without runtime errors.
    // -----------------------------------------------------------------

    /** Consent tier for a single mentee: 'basic' | 'reports' | 'full' | null. */
    async mentorConsent(subjectUserId: string): Promise<{
      tier: "basic" | "reports" | "full";
      granted_at: string | null;
    } | null> {
      try {
        const { data } = await supabase
          .from("mentor_consent")
          .select("tier, granted_at")
          .eq("reseller_id", scope.reseller_id)
          .eq("subject_user_id", subjectUserId)
          .maybeSingle();
        if (!data) return null;
        const tier = (data as { tier?: string }).tier;
        if (tier === "basic" || tier === "reports" || tier === "full") {
          return { tier, granted_at: (data as { granted_at: string | null }).granted_at };
        }
        return { tier: "basic", granted_at: (data as { granted_at: string | null }).granted_at };
      } catch {
        return null;
      }
    },

    /** All mentor notes for a mentee, mentor-visible only. */
    async mentorNotes(subjectUserId: string): Promise<
      Array<{ id: string; body: string; tags: string[]; created_at: string }>
    > {
      try {
        const { data } = await supabase
          .from("mentor_notes")
          .select("id, body, tags, created_at")
          .eq("reseller_id", scope.reseller_id)
          .eq("subject_user_id", subjectUserId)
          .order("created_at", { ascending: false });
        return (data ?? []) as Array<{ id: string; body: string; tags: string[]; created_at: string }>;
      } catch {
        return [];
      }
    },

    /** Upcoming + past check-ins for a mentee. */
    async mentorCheckins(subjectUserId: string): Promise<
      Array<{ id: string; scheduled_at: string; status: string; agenda: string | null; next_step: string | null }>
    > {
      try {
        const { data } = await supabase
          .from("mentor_checkins")
          .select("id, scheduled_at, status, agenda, next_step")
          .eq("reseller_id", scope.reseller_id)
          .eq("subject_user_id", subjectUserId)
          .order("scheduled_at", { ascending: false });
        return (data ?? []) as Array<{ id: string; scheduled_at: string; status: string; agenda: string | null; next_step: string | null }>;
      } catch {
        return [];
      }
    },

    /** Mentor-set goals with target dates + status. */
    async mentorGoals(subjectUserId: string): Promise<
      Array<{ id: string; title: string; target_date: string | null; status: string }>
    > {
      try {
        const { data } = await supabase
          .from("mentor_goals")
          .select("id, title, target_date, status")
          .eq("reseller_id", scope.reseller_id)
          .eq("subject_user_id", subjectUserId)
          .order("target_date", { ascending: true });
        return (data ?? []) as Array<{ id: string; title: string; target_date: string | null; status: string }>;
      } catch {
        return [];
      }
    },

    /** Days-since-last-mentor-activity per mentee (checkin or note). */
    async mentorActivityDays(subjectUserIds: string[]): Promise<Map<string, number | null>> {
      const out = new Map<string, number | null>();
      for (const id of subjectUserIds) out.set(id, null);
      if (subjectUserIds.length === 0) return out;
      const now = Date.now();
      try {
        const [{ data: cRows }, { data: nRows }] = await Promise.all([
          supabase
            .from("mentor_checkins")
            .select("subject_user_id, scheduled_at")
            .eq("reseller_id", scope.reseller_id)
            .in("subject_user_id", subjectUserIds),
          supabase
            .from("mentor_notes")
            .select("subject_user_id, created_at")
            .eq("reseller_id", scope.reseller_id)
            .in("subject_user_id", subjectUserIds),
        ]);
        const latest = new Map<string, number>();
        for (const r of (cRows ?? []) as Array<{ subject_user_id: string; scheduled_at: string }>) {
          const t = new Date(r.scheduled_at).getTime();
          if (!Number.isNaN(t) && (latest.get(r.subject_user_id) ?? 0) < t) latest.set(r.subject_user_id, t);
        }
        for (const r of (nRows ?? []) as Array<{ subject_user_id: string; created_at: string }>) {
          const t = new Date(r.created_at).getTime();
          if (!Number.isNaN(t) && (latest.get(r.subject_user_id) ?? 0) < t) latest.set(r.subject_user_id, t);
        }
        for (const [id, t] of latest) {
          out.set(id, Math.max(0, Math.floor((now - t) / 86_400_000)));
        }
      } catch {
        // degrade to nulls
      }
      return out;
    },

    /** Cohort rows this reseller owns (accelerator overlap). */
    async ownedCohorts(): Promise<Array<{ id: string; name: string; created_at: string }>> {
      try {
        const { data } = await supabase
          .from("accelerator_cohorts")
          .select("id, name, created_at, reseller_id")
          .eq("reseller_id", scope.reseller_id);
        return (data ?? []) as Array<{ id: string; name: string; created_at: string }>;
      } catch {
        return [];
      }
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
