// Wave 27C — Founder notification hub helper.
//
// Thin server-side wrapper over `founder_notifications` writes. Every writer
// is fail-open — analytics + activity feed must never block the main path.

import "server-only";
import { getSupabaseAdmin } from "./supabase";

export type NotificationKind =
  | "tbr_view"
  | "tbr_qa_asked"
  | "tbr_lead"
  | "report_shared"
  | "analysis_done"
  | "svi_trend_alert";

interface InsertArgs {
  userId: string;
  projectId?: string | null;
  kind: NotificationKind;
  payload?: Record<string, unknown>;
  /**
   * If set, suppress if any notification with the same kind + payload.dedupeKey
   * has been written for the same user within `throttleMs` milliseconds.
   * Used to keep tbr_view notifications from spamming the feed on refresh.
   */
  dedupeKey?: string;
  throttleMs?: number;
}

/** Insert a notification row for a founder. Silent on failure. */
export async function insertNotification(args: InsertArgs): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    if (!args.userId) return;

    // Throttle: check for an existing recent row with the same dedupeKey.
    if (args.dedupeKey && typeof args.throttleMs === "number" && args.throttleMs > 0) {
      const since = new Date(Date.now() - args.throttleMs).toISOString();
      const { data: recent } = await supabase
        .from("founder_notifications")
        .select("id")
        .eq("user_id", args.userId)
        .eq("kind", args.kind)
        .gte("created_at", since)
        .contains("payload", { dedupeKey: args.dedupeKey })
        .limit(1)
        .maybeSingle();
      if (recent) return;
    }

    const payload: Record<string, unknown> = { ...(args.payload ?? {}) };
    if (args.dedupeKey) payload.dedupeKey = args.dedupeKey;

    await supabase.from("founder_notifications").insert({
      user_id: args.userId,
      project_id: args.projectId ?? null,
      kind: args.kind,
      payload,
    });
  } catch (err) {
    // Never propagate — this is an activity feed, not a hard dependency.
    console.warn("[notifications] insert failed:", err);
  }
}

/**
 * Look up the founder (user_id + project_id) that owns a share_token. Used
 * by anonymous /tbr endpoints that need to notify the owner.
 */
export async function ownerFromShareToken(
  token: string,
): Promise<{ userId: string; projectId: string | null; email: string | null } | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("account_id, project_id")
      .eq("report_share_token", token)
      .maybeSingle();
    const row = snap as { account_id: string | null; project_id: string | null } | null;
    if (!row?.account_id) return null;
    const { data: acct } = await supabase
      .from("svi_accounts")
      .select("user_id, email")
      .eq("id", row.account_id)
      .maybeSingle();
    const a = acct as { user_id: string | null; email: string | null } | null;
    if (!a?.user_id) return null;
    return { userId: a.user_id, projectId: row.project_id, email: a.email };
  } catch {
    return null;
  }
}
