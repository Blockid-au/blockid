// Self-service deletion — request / re-auth / grace / cancel state (S24-B).
//
// Privacy Policy v2.3 clause 8 promises removal on request; this is the
// mechanism behind "Delete account" in Account settings:
//
//   1. re-authentication — the caller proves control of the account again:
//      password users send their password (bcrypt compare, rate-limited);
//      passwordless (Google / magic-link) users request a 15-minute single-use
//      re-auth token by email (`mintReauthToken` → `consumeReauthToken`);
//   2. typed confirmation "DELETE" (route-level);
//   3. shared projects — an owner whose project still has other accepted
//      members must transfer or archive it first (`sharedProjectsOwnedBy`
//      → 409 with the list) so co-founders never lose a workspace silently;
//   4. grace — `deletion_requested_at` is stamped, a cancel link is emailed
//      (`deletion_cancel_token_hash`), and the daily cron
//      (/api/cron/account-erasure) erases accounts whose request is older
//      than GRACE_DAYS. Cancelling clears the state; logging in during the
//      grace period does NOT cancel (the settings page shows the pending
//      state with a Cancel button).
//
// Tokens are 32-char nanoids; only their sha256 is stored (same pattern as
// password_reset_tokens, 0343). Columns are added by migration 0348.

import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

export const GRACE_DAYS = 7;
export const REAUTH_TTL_MIN = 15;
export const CONFIRMATION_PHRASE = "DELETE";

export interface DeletionDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newToken(): string {
  return nanoid(32);
}

/** Constant-time compare of two hex digests (length mismatch → false). */
export function hashesEqual(a: string | null | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function scheduledFor(requestedAt: Date | string, graceDays = GRACE_DAYS): Date {
  const t = typeof requestedAt === "string" ? new Date(requestedAt) : requestedAt;
  return new Date(t.getTime() + graceDays * 86_400_000);
}

export function isDue(requestedAt: string | null | undefined, now: Date, graceDays = GRACE_DAYS): boolean {
  if (!requestedAt) return false;
  return scheduledFor(requestedAt, graceDays).getTime() <= now.getTime();
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

// ─── status ──────────────────────────────────────────────────────────────────

export interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  hasPassword: boolean;
  erased: boolean;
}

export async function getDeletionStatus(db: DeletionDb, userId: string): Promise<DeletionStatus | null> {
  const { data, error } = await db
    .from("app_users")
    .select("id, deletion_requested_at, password_hash, erased_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const requestedAt = (data.deletion_requested_at as string | null) ?? null;
  return {
    pending: Boolean(requestedAt) && !data.erased_at,
    requestedAt,
    scheduledFor: requestedAt ? scheduledFor(requestedAt).toISOString() : null,
    hasPassword: Boolean(data.password_hash),
    erased: Boolean(data.erased_at),
  };
}

// ─── re-auth token (passwordless accounts) ───────────────────────────────────

export async function mintReauthToken(db: DeletionDb, userId: string, now = new Date()): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + REAUTH_TTL_MIN * 60_000).toISOString();
  const { error } = await db
    .from("app_users")
    .update({ deletion_reauth_token_hash: hashToken(token), deletion_reauth_expires_at: expiresAt })
    .eq("id", userId);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, token, expiresAt };
}

/** Single use: the hash is cleared the moment it matches. */
export async function consumeReauthToken(db: DeletionDb, userId: string, token: string, now = new Date()): Promise<"ok" | "invalid" | "expired" | "error"> {
  if (typeof token !== "string" || token.length < 16) return "invalid";
  const { data, error } = await db
    .from("app_users")
    .select("deletion_reauth_token_hash, deletion_reauth_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return "error";
  if (!hashesEqual(data?.deletion_reauth_token_hash as string | null | undefined, hashToken(token))) return "invalid";
  const storedHash = data.deletion_reauth_token_hash as string;
  const exp = data.deletion_reauth_expires_at ? new Date(data.deletion_reauth_expires_at as string).getTime() : 0;
  // Burn the token first (single use), then judge expiry.
  const { error: clearErr } = await db
    .from("app_users")
    .update({ deletion_reauth_token_hash: null, deletion_reauth_expires_at: null })
    .eq("id", userId)
    .eq("deletion_reauth_token_hash", storedHash);
  if (clearErr) return "error";
  if (exp < now.getTime()) return "expired";
  return "ok";
}

// ─── shared-project gate ─────────────────────────────────────────────────────

export interface SharedProject {
  id: string;
  name: string;
  slug: string | null;
  members: number;
}

/**
 * Projects the user owns that are not archived and still have at least one
 * OTHER accepted member. Deleting the owner would cascade those workspaces
 * away from the co-founders, so the route returns them as a 409.
 */
export async function sharedProjectsOwnedBy(db: DeletionDb, userId: string): Promise<SharedProject[]> {
  const { data: projects, error } = await db
    .from("projects")
    .select("id, name, slug")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error || !projects?.length) return [];
  const ids = (projects as { id: string }[]).map((p) => p.id);
  const { data: members } = await db
    .from("project_members")
    .select("project_id, user_id")
    .in("project_id", ids)
    .eq("status", "accepted");
  const counts = new Map<string, number>();
  for (const m of (members ?? []) as { project_id: string; user_id: string | null }[]) {
    if (m.user_id && m.user_id === userId) continue;
    counts.set(m.project_id, (counts.get(m.project_id) ?? 0) + 1);
  }
  return (projects as { id: string; name: string; slug: string | null }[])
    .filter((p) => (counts.get(p.id) ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, slug: p.slug ?? null, members: counts.get(p.id) ?? 0 }));
}

// ─── request / cancel ────────────────────────────────────────────────────────

export async function requestDeletion(
  db: DeletionDb,
  userId: string,
  opts: { reason?: string | null; now?: Date } = {},
): Promise<{ ok: true; cancelToken: string; requestedAt: string; scheduledFor: string } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const cancelToken = newToken();
  const requestedAt = now.toISOString();
  const { error } = await db
    .from("app_users")
    .update({
      deletion_requested_at: requestedAt,
      deletion_reason: (opts.reason ?? "").toString().slice(0, 500) || null,
      deletion_cancel_token_hash: hashToken(cancelToken),
    })
    .eq("id", userId)
    .is("erased_at", null);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, cancelToken, requestedAt, scheduledFor: scheduledFor(now).toISOString() };
}

const CLEARED = { deletion_requested_at: null, deletion_reason: null, deletion_cancel_token_hash: null };

export async function cancelDeletion(db: DeletionDb, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from("app_users").update(CLEARED).eq("id", userId).is("erased_at", null);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

/** Cancel via the emailed link. Returns the user id on success. */
export async function cancelDeletionByToken(db: DeletionDb, token: string): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "error" }> {
  if (typeof token !== "string" || token.length < 16) return { ok: false, reason: "invalid" };
  const { data, error } = await db
    .from("app_users")
    .select("id")
    .eq("deletion_cancel_token_hash", hashToken(token))
    .is("erased_at", null)
    .maybeSingle();
  if (error) return { ok: false, reason: "error" };
  if (!data?.id) return { ok: false, reason: "invalid" };
  const res = await cancelDeletion(db, data.id as string);
  return res.ok ? { ok: true, userId: data.id as string } : { ok: false, reason: "error" };
}

// ─── cron: who is due ────────────────────────────────────────────────────────

export const ERASURE_BATCH_MAX = 25;

export async function listDueForErasure(db: DeletionDb, now = new Date(), limit = ERASURE_BATCH_MAX): Promise<{ id: string; deletion_requested_at: string }[]> {
  const cutoff = new Date(now.getTime() - GRACE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("app_users")
    .select("id, deletion_requested_at")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff)
    .is("erased_at", null)
    .order("deletion_requested_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, ERASURE_BATCH_MAX)));
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as { id: string; deletion_requested_at: string }[];
}
