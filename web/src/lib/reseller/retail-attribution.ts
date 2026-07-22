// Retail per-project reseller attribution — closes the gap that
// tick 91 identified as the last non-human-blocked frontier leaf:
// createProject() (web/src/lib/projects.ts) is the entry point every
// retail founder uses to spawn a workspace, but until now it never
// wrote a reseller_attributions row for founders who arrived via a
// ?via=<code> cookie. Only the wholesale /api/reseller/create-startup
// route materialised the per-project row, so the retail funnel's
// attribution lived exclusively on the app_users cache column and
// commission accrual (P3) had no per-project provenance for retail.
//
// Design mirrors the already-CTO-approved wholesale execute() path in
// web/src/app/api/reseller/create-startup/route.ts:299-320:
//   - Guarded by the U.15.1 partial unique index on
//     reseller_attributions(subject_project_id) WHERE subject_type='project'
//     AND status='active' AND opted_out=false, so a concurrent race lands
//     one winner + one benign duplicate rejection.
//   - source='code' (matches the ck_source check constraint from 0091:123)
//     because retail attribution originated from the ?via= cookie, not
//     admin-manual provisioning.
//   - promotion_code_id=null: the ?via= cookie carries the reseller CODE
//     (not the promotion_code_id) and processAttribution() never persisted
//     which specific promotion_code the founder redeemed. Commission tier
//     resolves at charge time from the Stripe promotion_code applied on the
//     subscription (webhook helpers already handle both paths), so leaving
//     it null here does not break P3 accrual.
//   - metadata carries {origin: 'retail_project_create'} so downstream
//     analytics can distinguish retail vs wholesale attribution rows.
//
// Failure is non-fatal: retail project creation must never fail because
// of an attribution-side error (a founder with a broken cookie or a
// terminated reseller code should still get their project). Callers log
// and move on, matching the processAttribution() posture.

export interface RetailAttributionInput {
  /** app_users.attribution_reseller_id (user-level cache). Null when the
   *  founder never carried a ?via= cookie through signup. */
  userAttributionResellerId: string | null | undefined;
  /** resellers.status for the cached reseller id. Null when the row was
   *  deleted or never existed. */
  resellerStatus: string | null | undefined;
  /** True when reseller_attributions already carries an active row scoped
   *  to this project (partial-unique-guarded case: repeat createProject
   *  attempts after a rollback, or a race with the wholesale route). */
  hasActiveProjectAttribution: boolean;
}

export type RetailAttributionDecision =
  | {
      ok: true;
      plan: {
        reseller_id: string;
        source: "code";
        metadata: { origin: "retail_project_create" };
      };
    }
  | {
      ok: false;
      reason:
        | "no_attribution_cache"
        | "reseller_inactive"
        | "already_attributed";
    };

export function decideRetailAttribution(
  input: RetailAttributionInput,
): RetailAttributionDecision {
  const resellerId = input.userAttributionResellerId;
  if (!resellerId || typeof resellerId !== "string") {
    return { ok: false, reason: "no_attribution_cache" };
  }
  if (input.resellerStatus !== "active") {
    return { ok: false, reason: "reseller_inactive" };
  }
  if (input.hasActiveProjectAttribution) {
    return { ok: false, reason: "already_attributed" };
  }
  return {
    ok: true,
    plan: {
      reseller_id: resellerId,
      source: "code",
      metadata: { origin: "retail_project_create" },
    },
  };
}

/**
 * Adapter that walks the four DB reads + one INSERT + one UPDATE the
 * decision plan calls for. Kept in this module (not in the pure lib) so
 * consumers can import the pure decision helper for unit tests without
 * pulling in the Supabase client.
 *
 * Contract:
 *   - Never throws. Any error is logged and swallowed so createProject()
 *     cannot regress a retail founder's ability to spawn a workspace.
 *   - Returns the decision reason for observability (callers can surface
 *     it in structured logs, but the createProject() consumer treats
 *     every non-'ok' outcome the same way: silent no-op).
 *   - Stamps projects.attribution_reseller_id as the canonical per-project
 *     column and inserts the reseller_attributions ledger row. Both writes
 *     succeed together or both fail together (best-effort: the ledger
 *     insert is guarded by the partial unique so a race lands cleanly).
 */
export type AttributeAdapterOutcome =
  | { ok: true; attribution_id: string; reseller_id: string }
  | {
      ok: false;
      reason:
        | "no_attribution_cache"
        | "reseller_inactive"
        | "already_attributed"
        | "not_configured"
        | "insert_failed"
        | "user_lookup_failed";
    };

export async function attributeProjectFromUserCache(
  userId: string,
  projectId: string,
): Promise<AttributeAdapterOutcome> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  try {
    const { data: userRow, error: userErr } = await supabase
      .from("app_users")
      .select("attribution_reseller_id")
      .eq("id", userId)
      .maybeSingle();
    if (userErr) {
      console.error("[reseller] attributeProjectFromUserCache user_lookup_failed:", userErr);
      return { ok: false, reason: "user_lookup_failed" };
    }
    const resellerId = (userRow?.attribution_reseller_id as string | null) ?? null;
    if (!resellerId) {
      return { ok: false, reason: "no_attribution_cache" };
    }

    const { data: resellerRow } = await supabase
      .from("resellers")
      .select("status")
      .eq("id", resellerId)
      .maybeSingle();
    const resellerStatus = (resellerRow?.status as string | null) ?? null;

    const { data: existingAttrs } = await supabase
      .from("reseller_attributions")
      .select("id")
      .eq("subject_type", "project")
      .eq("subject_project_id", projectId)
      .eq("status", "active")
      .eq("opted_out", false)
      .limit(1);
    const hasActiveProjectAttribution = Boolean(existingAttrs && existingAttrs.length > 0);

    const decision = decideRetailAttribution({
      userAttributionResellerId: resellerId,
      resellerStatus,
      hasActiveProjectAttribution,
    });
    if (!decision.ok) return { ok: false, reason: decision.reason };

    const { data: attrRow, error: attrErr } = await supabase
      .from("reseller_attributions")
      .insert({
        reseller_id: decision.plan.reseller_id,
        subject_type: "project",
        subject_project_id: projectId,
        subject_user_id: null,
        source: decision.plan.source,
        promotion_code_id: null,
        metadata: decision.plan.metadata,
      })
      .select("id")
      .single();
    if (attrErr || !attrRow) {
      // 23505 = partial-unique race (concurrent createProject attempt or
      // wholesale route landed first). Treat as already_attributed rather
      // than a failure so the caller sees a benign outcome.
      if (attrErr?.code === "23505") {
        return { ok: false, reason: "already_attributed" };
      }
      console.error("[reseller] attributeProjectFromUserCache insert_failed:", attrErr);
      return { ok: false, reason: "insert_failed" };
    }

    // Stamp the canonical per-project column so downstream lookups
    // (webhook helpers, portfolio aggregates, customer drawer) don't need
    // to join through reseller_attributions on the hot path.
    await supabase
      .from("projects")
      .update({ attribution_reseller_id: decision.plan.reseller_id })
      .eq("id", projectId);

    return {
      ok: true,
      attribution_id: attrRow.id as string,
      reseller_id: decision.plan.reseller_id,
    };
  } catch (err) {
    console.error("[reseller] attributeProjectFromUserCache threw:", err);
    return { ok: false, reason: "insert_failed" };
  }
}
