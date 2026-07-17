// Lifecycle state machine (T-0410).
//
// Drives the drip campaign: day0 welcome → day3 activation nudge → day5
// upgrade CTA → day6 last-call → day7 trial end → day14 winback → winback
// tail. The cron in web/cron/lifecycle-mailer.mjs picks rows off
// lifecycle_state via the pick_lifecycle_due() RPC (see migration 0081)
// which uses FOR UPDATE SKIP LOCKED so overlapping runners can't
// double-send the same row.
//
// Each transition mutates only lifecycle_state (single-row update per
// user) — the actual email is emitted by the caller so we can swap
// providers without touching the state machine.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export const LIFECYCLE_STEPS = [
  "day0",
  "day3",
  "day5",
  "day6",
  "day7",
  "day14",
  "winback",
  "done",
] as const;

export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

const DAY = 24 * 60 * 60 * 1000;

/** Ordered transitions with default delay from the current step. */
const NEXT: Record<LifecycleStep, { next: LifecycleStep; delayMs: number } | null> = {
  day0: { next: "day3", delayMs: 3 * DAY },
  day3: { next: "day5", delayMs: 2 * DAY },
  day5: { next: "day6", delayMs: 1 * DAY },
  day6: { next: "day7", delayMs: 1 * DAY },
  day7: { next: "day14", delayMs: 7 * DAY },
  day14: { next: "winback", delayMs: 14 * DAY },
  winback: { next: "done", delayMs: 30 * DAY },
  done: null,
};

export interface LifecycleRow {
  user_id: string;
  current_step: LifecycleStep | null;
  next_send_at: string | null;
  updated_at: string;
  history: Array<{ step: LifecycleStep; ts: string }>;
}

interface PickedRow {
  user_id: string;
  current_step: LifecycleStep | null;
  history: unknown;
  updated_at: string;
}

/**
 * Initialise a user at day0 with next_send_at = now (i.e. send immediately).
 * Preserves existing history on re-entry (second product line, etc.) so
 * downstream churn attribution can still see prior touchpoints.
 */
export async function startLifecycle(userId: string, now = new Date()): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: existing } = await supabase
    .from("lifecycle_state")
    .select("history")
    .eq("user_id", userId)
    .maybeSingle();
  const history = Array.isArray(existing?.history) ? existing!.history : [];
  await supabase.from("lifecycle_state").upsert(
    {
      user_id: userId,
      current_step: "day0",
      next_send_at: now.toISOString(),
      updated_at: now.toISOString(),
      history,
    },
    { onConflict: "user_id" },
  );
}

/**
 * Advance a user to the next step and stamp the new next_send_at.
 *
 * Delegates to the `advance_lifecycle` RPC (migration 0081) which does the
 * history append + step transition in a single UPDATE — no more
 * read → append → upsert race window.
 */
export async function advance(userId: string, from: LifecycleStep, now = new Date()): Promise<LifecycleStep> {
  const transition = NEXT[from];
  const next: LifecycleStep = transition ? transition.next : "done";
  const nextSendAt = transition ? new Date(now.getTime() + transition.delayMs).toISOString() : null;

  // Terminal state — nothing to write, and the RPC would just no-op.
  if (!transition) return next;

  const supabase = getSupabaseAdmin();
  if (!supabase) return next;

  const { data, error } = await supabase.rpc("advance_lifecycle", {
    p_user: userId,
    p_from: from,
    p_next: next,
    p_next_send_at: nextSendAt,
  });
  if (error) {
    // Surface transport errors; caller decides whether to retry the tick.
    // Historically we swallowed these and the row was left stuck.
    throw new Error(`advance_lifecycle rpc failed: ${error.message}`);
  }
  // RPC returns the resolved next step (or null if the row didn't exist).
  return (typeof data === "string" ? (data as LifecycleStep) : next);
}

/** Cancel further sends (e.g. user churned, unsubscribed). */
export async function stopLifecycle(userId: string, now = new Date()): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("lifecycle_state").upsert(
    {
      user_id: userId,
      current_step: "done",
      next_send_at: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );
}

/**
 * Load rows due for send.
 *
 * Calls `pick_lifecycle_due(limit)` (migration 0081) which atomically
 * selects + reserves rows using FOR UPDATE SKIP LOCKED — two overlapping
 * cron ticks can no longer pick the same row. The returned rows already
 * have next_send_at cleared; the caller is responsible for either
 * advancing them (success path) or explicitly re-scheduling on failure.
 */
export async function loadDue(limit = 100, _now = new Date()): Promise<LifecycleRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.rpc("pick_lifecycle_due", { p_limit: limit });
  const rows = (data ?? []) as PickedRow[];
  return rows.map((r): LifecycleRow => ({
    user_id: r.user_id,
    current_step: r.current_step,
    // Row has been reserved — next_send_at is null until advance() re-stamps it.
    next_send_at: null,
    updated_at: r.updated_at,
    history: Array.isArray(r.history)
      ? (r.history as Array<{ step: LifecycleStep; ts: string }>)
      : [],
  }));
}
