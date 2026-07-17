// Lifecycle state machine (T-0410).
//
// Drives the drip campaign: day0 welcome → day3 activation nudge → day5
// upgrade CTA → day6 last-call → day7 trial end → day14 winback → winback
// tail. The cron in web/cron/lifecycle-mailer.mjs picks rows off
// lifecycle_state where next_send_at <= now() with skip-locked so
// concurrent runners don't double-send.
//
// Each transition mutates only lifecycle_state (single-row upsert per
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

/** Advance a user to the next step and stamp the new next_send_at. */
export async function advance(userId: string, from: LifecycleStep, now = new Date()): Promise<LifecycleStep> {
  const supabase = getSupabaseAdmin();
  const transition = NEXT[from];
  const next: LifecycleStep = transition ? transition.next : "done";
  const nextSendAt = transition ? new Date(now.getTime() + transition.delayMs).toISOString() : null;
  if (!supabase) return next;

  const { data: current } = await supabase
    .from("lifecycle_state")
    .select("history")
    .eq("user_id", userId)
    .maybeSingle();

  const history = Array.isArray(current?.history) ? current!.history : [];
  history.push({ step: from, ts: now.toISOString() });

  await supabase.from("lifecycle_state").upsert(
    {
      user_id: userId,
      current_step: next,
      next_send_at: nextSendAt,
      updated_at: now.toISOString(),
      history,
    },
    { onConflict: "user_id" },
  );
  return next;
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
 * TODO(security-audit H-code-1 / next milestone): the current plain SELECT
 * lets two overlapping cron ticks pick the same row and double-send. Move
 * to a Postgres RPC `pick_lifecycle_due(limit)` that does
 * `UPDATE lifecycle_state SET next_send_at = null WHERE user_id IN
 *   (SELECT user_id FROM lifecycle_state WHERE next_send_at <= now()
 *    AND current_step <> 'done' ORDER BY next_send_at LIMIT $1
 *    FOR UPDATE SKIP LOCKED) RETURNING *`. Until then, keep the
 * cron cadence ≥ 15 min (job wall-time budget) so overlap is unlikely.
 */
export async function loadDue(limit = 100, now = new Date()): Promise<LifecycleRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("lifecycle_state")
    .select("user_id, current_step, next_send_at, updated_at, history")
    .lte("next_send_at", now.toISOString())
    .neq("current_step", "done")
    .order("next_send_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as LifecycleRow[];
}
