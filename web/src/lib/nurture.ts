// T_EMAIL_0001 — Post-signup nurture email queue helper (server-only).
//
// Enqueues the D+1, D+4, D+9 nurture emails for a new user immediately
// after account creation. The actual sending is handled by the cron job at
// /api/cron/nurture-emails (runs hourly, CRON_SECRET-gated).
//
// Safe to call from any signup path — errors are caught and logged but
// never re-thrown so the signup flow is never broken.

import "server-only";
import { getSupabaseAdmin } from "./supabase";

const NURTURE_DAYS = [1, 4, 9] as const;

/**
 * Enqueue the D+1, D+4, D+9 nurture sequence for `userId`.
 * Idempotent — the UNIQUE index on (user_id, day) silently
 * drops duplicate inserts (race-condition safe).
 */
export async function enqueueNurtureSequence(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.warn("[nurture] Supabase not configured — skipping nurture enqueue for", userId);
      return;
    }

    const now = new Date();
    const rows = NURTURE_DAYS.map((day) => {
      const scheduledAt = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);
      return {
        user_id: userId,
        day,
        scheduled_at: scheduledAt.toISOString(),
      };
    });

    const { error } = await supabase
      .from("nurture_email_queue")
      .insert(rows, { ignoreDuplicates: true } as { ignoreDuplicates: boolean });

    if (error) {
      console.error("[nurture] Failed to enqueue nurture sequence for", userId, error);
    } else {
      console.log("[nurture] Enqueued D1/D4/D9 sequence for user", userId);
    }
  } catch (err) {
    console.error("[nurture] Unexpected error enqueuing for", userId, err);
  }
}
