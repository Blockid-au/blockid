// Stripe customer portal pre-open gate.
//
// Per docs/plans/plan-delta-2026-07-23.md § D.3 CISO advisory D3-CISO-06:
// wholesale-provisioned founders (billing_model='wholesale' — the reseller
// is the payer-of-record, the founder never checked out) must NOT be able
// to open the Stripe billing portal. The Stripe Customer object belongs to
// the reseller; opening the portal would surface the reseller's billing
// surface and let the founder cancel/modify OTHER attributed founders'
// subscriptions on the same reseller Stripe Customer.
//
// Retail-attributed founders own their own Stripe Customer object and
// MUST retain portal access — the check must gate ONLY the wholesale
// provisioned path.
//
// Design mirrors the pure decision + async adapter split used by
// web/src/lib/reseller/retail-attribution.ts:
//   - decidePortalAccess(input) is pure and unit-testable (no DB imports).
//   - isWholesaleProvisionedFounder(userId) is the Supabase adapter and
//     is only called from the route handler.
//
// Attribution shape (from wholesale flow, web/src/app/api/reseller/create-startup/route.ts:299-320):
//   reseller_attributions
//     .subject_type      = 'project'
//     .subject_project_id = <founder workspace id>
//     .subject_user_id   = null                        ← wholesale never stamps user
//     .source            = 'provisioned'               ← WHOLESALE_ATTRIBUTION_SOURCE
//     .status            = 'active'
//     .opted_out         = false
//
// The founder OWNS the project (projects.user_id = founder), so the check
// joins `projects.user_id = :userId` with an active provisioned attribution
// on that project.
//
// NOTE: no `import "server-only"` — the async adapter uses a dynamic
// import for @/lib/supabase (server-only under the hood), which keeps the
// pure decision helper importable from unit tests. Matches the pattern in
// web/src/lib/reseller/retail-attribution.ts.

export interface PortalAccessInput {
  /** True iff the current user has AT LEAST ONE active reseller_attributions
   *  row scoped to a project they own with source='provisioned'. */
  hasActiveWholesaleProvisionedAttribution: boolean;
}

export type PortalAccessDecision =
  | { ok: true }
  | { ok: false; reason: "wholesale_portal_blocked" };

/**
 * Pure decision — used by the route handler and directly unit-testable.
 * Returns `{ ok: false, reason: 'wholesale_portal_blocked' }` when the
 * user is a wholesale-provisioned founder; otherwise `{ ok: true }`.
 */
export function decidePortalAccess(input: PortalAccessInput): PortalAccessDecision {
  if (input.hasActiveWholesaleProvisionedAttribution) {
    return { ok: false, reason: "wholesale_portal_blocked" };
  }
  return { ok: true };
}

/**
 * Supabase adapter — resolves whether the given user is a
 * wholesale-provisioned founder.
 *
 * Contract:
 *   - Returns `false` if Supabase is not configured (defensive: rather
 *     surface the true infra state via other 503 codepaths than
 *     accidentally block retail users on a config miss). The route
 *     handler already checks isSupabaseConfigured() before calling.
 *   - Never throws — a query error is logged and treated as "no attribution"
 *     (fail-open for portal access matches the existing route posture: a
 *     retail founder should never be locked out by a transient DB blip).
 *
 * The query walks two steps:
 *   1. `projects` → collect all project ids owned by the user.
 *   2. `reseller_attributions` → look for source='provisioned', status='active',
 *      opted_out=false, subject_project_id IN (<step 1>).
 *
 * A single active provisioned row is sufficient — bail with `.limit(1)`.
 */
export async function isWholesaleProvisionedFounder(userId: string): Promise<boolean> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId);
    if (projErr) {
      console.error("[stripe:portal-gate] projects lookup failed:", projErr);
      return false;
    }
    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) return false;

    const { data: attrs, error: attrErr } = await supabase
      .from("reseller_attributions")
      .select("id")
      .eq("source", "provisioned")
      .eq("status", "active")
      .eq("opted_out", false)
      .in("subject_project_id", projectIds)
      .limit(1);
    if (attrErr) {
      console.error("[stripe:portal-gate] attribution lookup failed:", attrErr);
      return false;
    }
    return Boolean(attrs && attrs.length > 0);
  } catch (err) {
    console.error("[stripe:portal-gate] threw:", err);
    return false;
  }
}
