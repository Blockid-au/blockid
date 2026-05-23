// Session management for the auth microservice.
//
// Sessions use nanoid(32) tokens (~192 bits of entropy) stored in the
// `sessions` table. Default TTL is 90 days with no sliding extension —
// require fresh login to discourage indefinite stale cookies.

import { nanoid } from "nanoid";
import { getSupabase } from "./supabase.js";

const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "90", 10);
const MAGIC_LINK_TTL_MIN = 15;

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

export function newSessionToken(): string {
  return nanoid(32);
}

export function newMagicLinkToken(): string {
  return nanoid(24);
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export interface CreateSessionArgs {
  userId: string;
  ipHash?: string | null;
  userAgent?: string | null;
}

export async function createSession(
  args: CreateSessionArgs,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const token = newSessionToken();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("sessions").insert({
    token,
    user_id: args.userId,
    expires_at: expiresAt,
    ip_hash: args.ipHash ?? null,
    user_agent: args.userAgent ?? null,
  });

  if (error) {
    console.error("[auth:sessions] insert failed", error);
    return null;
  }

  return token;
}

/**
 * Validate a session token and return the associated user_id.
 * Deletes expired sessions automatically; touches last_used_at.
 */
export async function validateSession(
  token: string,
): Promise<{ userId: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[auth:sessions] read failed", error);
    return null;
  }
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Expired — best-effort delete.
    await supabase.from("sessions").delete().eq("token", token);
    return null;
  }

  // Touch last_used_at (fire-and-forget).
  void supabase
    .from("sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token);

  return { userId: session.user_id };
}

/**
 * Destroy a session by token.
 */
export async function destroySession(token: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("token", token);

  if (error) {
    console.error("[auth:sessions] delete failed", error);
    return false;
  }

  return true;
}

/**
 * Clean up all expired sessions. Run periodically (e.g. hourly).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("token");

  if (error) {
    console.error("[auth:sessions] cleanup failed", error);
    return 0;
  }

  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Magic link helpers
// ---------------------------------------------------------------------------

export interface CreateMagicLinkArgs {
  email: string;
  intent: string;
  pendingPayload?: Record<string, unknown>;
  ipHash?: string | null;
}

export async function createMagicLink(
  args: CreateMagicLinkArgs,
): Promise<{ token: string; expiresAt: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const token = newMagicLinkToken();
  const expiresAt = new Date(
    Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("magic_links").insert({
    token,
    email: args.email,
    intent: args.intent,
    pending_payload: args.pendingPayload ?? {},
    expires_at: expiresAt,
    ip_hash: args.ipHash ?? null,
  });

  if (error) {
    console.error("[auth:sessions] magic_links insert failed", error);
    return null;
  }

  return { token, expiresAt };
}

/**
 * Consume a magic link token. Atomically:
 *   - reads the row (must exist, not consumed, not expired)
 *   - flips consumed_at
 * Returns the email + payload so the caller can upsert the user.
 */
export async function consumeMagicLink(
  token: string,
): Promise<{
  ok: boolean;
  email?: string;
  intent?: string;
  pendingPayload?: Record<string, unknown>;
  reason?: "not_found" | "expired" | "already_used" | "db_error";
}> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "db_error" };

  const { data: row, error: readErr } = await supabase
    .from("magic_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (readErr) {
    console.error("[auth:sessions] magic_links read failed", readErr);
    return { ok: false, reason: "db_error" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumed_at) return { ok: false, reason: "already_used" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Flip consumed_at first; if anything below fails the link can't be replayed.
  const { error: consumeErr } = await supabase
    .from("magic_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null);

  if (consumeErr) {
    console.error("[auth:sessions] magic_links consume failed", consumeErr);
    return { ok: false, reason: "db_error" };
  }

  return {
    ok: true,
    email: row.email,
    intent: row.intent,
    pendingPayload: (row.pending_payload as Record<string, unknown>) ?? {},
  };
}
