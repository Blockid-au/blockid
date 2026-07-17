// Conversion trigger registry (T-0410).
//
// A "trigger" is a moment in the product where the CRO stack may show an
// upgrade CTA — feature-gate hit, trial day-5 nudge, credits low, etc.
// Each trigger has a stable ID, a copy key, and a rate-limit envelope so
// we never spam a user with the same modal.
//
// The 1-per-session cap + 24h cool-down per (user, trigger) are enforced
// by shouldFire() below and mirrored to conversion_events on accept /
// dismiss so the CDO funnel dashboards can compute lift.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export type ConversionTrigger =
  | "feature_gate_hit"
  | "trial_day_5"
  | "trial_day_6"
  | "trial_day_7"
  | "credits_low"
  | "credits_exhausted"
  | "report_cap_hit"
  | "watchlist_cap_hit"
  | "cohort_seat_cap_hit"
  | "post_cancel_winback";

export type ConversionAction = "shown" | "accepted" | "dismissed" | "snoozed";

export interface TriggerSpec {
  id: ConversionTrigger;
  /** Copy key resolved on the client via useUpgradePrompt(). */
  copyKey: string;
  /** Recommended target plan (fallback if entitlement lookup fails). */
  suggestedPlan?: string;
  /** Cool-down between two shows for the same (user, trigger). */
  cooldownSec: number;
  /** Whether the trigger counts against the 1-per-session cap. */
  countsAgainstSessionCap: boolean;
}

/** Registry — new triggers must be added here first. */
export const TRIGGERS: Record<ConversionTrigger, TriggerSpec> = {
  feature_gate_hit:      { id: "feature_gate_hit",     copyKey: "upgrade.gate_hit",      cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: true },
  trial_day_5:           { id: "trial_day_5",          copyKey: "upgrade.trial_day_5",   cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: false },
  trial_day_6:           { id: "trial_day_6",          copyKey: "upgrade.trial_day_6",   cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: false },
  trial_day_7:           { id: "trial_day_7",          copyKey: "upgrade.trial_day_7",   cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: false },
  credits_low:           { id: "credits_low",          copyKey: "upgrade.credits_low",   cooldownSec: 60 * 60 * 12, countsAgainstSessionCap: true },
  credits_exhausted:     { id: "credits_exhausted",    copyKey: "upgrade.credits_zero",  cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: true },
  report_cap_hit:        { id: "report_cap_hit",       copyKey: "upgrade.report_cap",    cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: true },
  watchlist_cap_hit:     { id: "watchlist_cap_hit",    copyKey: "upgrade.watchlist_cap", cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: true },
  cohort_seat_cap_hit:   { id: "cohort_seat_cap_hit",  copyKey: "upgrade.cohort_cap",    cooldownSec: 60 * 60 * 24, countsAgainstSessionCap: true },
  post_cancel_winback:   { id: "post_cancel_winback",  copyKey: "upgrade.winback",       cooldownSec: 60 * 60 * 24 * 7, countsAgainstSessionCap: false },
};

const SESSION_CAP = 1;

export interface FireContext {
  userId: string | null;
  sessionId: string | null;
  trigger: ConversionTrigger;
  /** Server clock (unix seconds). Injected for deterministic tests. */
  now?: number;
}

export interface FireDecision {
  fire: boolean;
  reason?: "no_user" | "session_cap" | "cooldown" | "trigger_off";
}

/**
 * Decide whether to fire a trigger for this user right now. Reads the last
 * two conversion_events rows for the (user, trigger) and applies both the
 * per-trigger cool-down and the 1-per-session cap.
 */
export async function shouldFire(ctx: FireContext): Promise<FireDecision> {
  const spec = TRIGGERS[ctx.trigger];
  if (!spec) return { fire: false, reason: "trigger_off" };
  if (!ctx.userId) return { fire: false, reason: "no_user" };

  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  const supabase = getSupabaseAdmin();
  if (!supabase) return { fire: true };

  const cooldownFloorIso = new Date((now - spec.cooldownSec) * 1000).toISOString();
  const { data: recent } = await supabase
    .from("conversion_events")
    .select("ts, trigger, action")
    .eq("user_id", ctx.userId)
    .eq("trigger", ctx.trigger)
    .gte("ts", cooldownFloorIso)
    .order("ts", { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    return { fire: false, reason: "cooldown" };
  }

  if (spec.countsAgainstSessionCap && ctx.sessionId) {
    const { count } = await supabase
      .from("conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("action", "shown")
      .filter("detail->>session_id", "eq", ctx.sessionId);
    if ((count ?? 0) >= SESSION_CAP) {
      return { fire: false, reason: "session_cap" };
    }
  }

  return { fire: true };
}

export interface RecordEventInput {
  userId: string | null;
  trigger: ConversionTrigger;
  action: ConversionAction;
  planFrom?: string | null;
  planTo?: string | null;
  sessionId?: string | null;
  detail?: Record<string, unknown>;
}

/** Insert a conversion_events row (best-effort). */
export async function recordConversionEvent(input: RecordEventInput): Promise<void> {
  if (!input.userId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const detail = { ...(input.detail ?? {}) } as Record<string, unknown>;
  if (input.sessionId) detail.session_id = input.sessionId;
  await supabase.from("conversion_events").insert({
    user_id: input.userId,
    trigger: input.trigger,
    action: input.action,
    plan_from: input.planFrom ?? null,
    plan_to: input.planTo ?? null,
    detail,
  });
}
