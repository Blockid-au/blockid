/**
 * SOC2-lite audit trail helper (Iteration-12 T5).
 *
 * Every critical mutation route calls `logUserAction` AFTER the mutation
 * succeeds. Writes go through the service-role client (bypasses RLS on
 * insert). Reads use the same client but filter by `user_id`, so callers
 * must pre-authenticate the user themselves.
 *
 * PII policy: `fields` may hold action metadata (plan id, changed-field
 * names, subject counts) but never plaintext credentials, tokens, or email
 * addresses. Use IDs where possible.
 *
 * Never throws: audit is a side-channel. Insert failures log to console and
 * return `{ ok: false }` so the caller can carry on.
 */
import { getSupabaseAdmin } from "@/lib/supabase";

export interface LogUserActionInput {
  userId: string;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  fields?: Record<string, unknown>;
  route: string;
  ip?: string | null;
  ua?: string | null;
}

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  fields: Record<string, unknown>;
  route: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Append one audit row. Never throws — failures are logged and swallowed so
 * the caller's happy path is untouched.
 */
export async function logUserAction(
  input: LogUserActionInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[blockid:audit] supabase admin not configured — skipping audit row");
    return { ok: false, reason: "supabase_not_configured" };
  }

  try {
    const { error } = await supabase.from("app_user_audit_log").insert({
      user_id: input.userId,
      action: input.action,
      subject_type: input.subjectType,
      subject_id: input.subjectId ?? null,
      fields: input.fields ?? {},
      route: input.route,
      ip: input.ip ?? null,
      user_agent: input.ua ?? null,
    });
    if (error) {
      console.error("[blockid:audit] insert failed", {
        action: input.action,
        route: input.route,
        code: error.code,
        message: error.message,
      });
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[blockid:audit] insert threw", {
      action: input.action,
      route: input.route,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "threw" };
  }
}

export interface GetUserAuditLogOpts {
  limit?: number;
  offset?: number;
}

/**
 * Read a user's own audit rows (reverse-chronological). Returns `[]` on
 * failure so the viewer degrades gracefully. Callers MUST have already
 * authenticated the user — this helper does no auth checks itself.
 */
export async function getUserAuditLog(
  userId: string,
  opts: GetUserAuditLogOpts = {},
): Promise<AuditLogRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);

  try {
    const { data, error } = await supabase
      .from("app_user_audit_log")
      .select("id, user_id, action, subject_type, subject_id, fields, route, ip, user_agent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("[blockid:audit] select failed", {
        userId,
        code: error.code,
        message: error.message,
      });
      return [];
    }
    return (data ?? []) as AuditLogRow[];
  } catch (err) {
    console.error("[blockid:audit] select threw", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Extract the caller's IP address from a Next.js Request headers bag.
 * Prefers `x-forwarded-for` (first hop) then `x-real-ip`. Returns null if
 * neither is present or the value is malformed.
 */
export function extractIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export function extractUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 500) : null;
}
