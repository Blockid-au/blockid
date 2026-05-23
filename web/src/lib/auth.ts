// BlockID idea-phase auth (server-only).
//
// Custom magic-link auth that fits the existing server-only Supabase model
// (service-role key, RLS enabled with no policies). We deliberately do NOT
// use Supabase Auth here — that would require shipping the anon key to the
// browser and introduce a second access pattern.
//
// Flow:
//   1. POST /api/auth/request  — body { email, intent, pendingPayload? }.
//      Creates a magic_links row with a 24-char token (~140 bits), 15-min
//      expiry. The pendingPayload (idea-eval / equity-split / funding-plan
//      sessionStorage) is stored alongside so the verify step can hydrate
//      it atomically once the user is authenticated.
//   2. Email goes out via Resend with /auth/verify?token=...
//   3. GET /auth/verify  — route handler consumes the token: upserts the
//      app_user, creates a session row, sets the HttpOnly cookie, hydrates
//      pending data, mints a Founder Pack if intent=save_founder_pack, and
//      302 redirects to /dashboard (or /s/p/[slug]).
//
// Sessions: 32-char nanoid (~190 bits), 90-day fixed expiry (no sliding
// extension — require fresh login to discourage indefinite stale cookies).
// Cookie is HttpOnly + SameSite=Lax + Secure-when-https.

import "server-only";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { initializeCredits } from "./credits";
import { processReferral } from "./referrals";

export const SESSION_COOKIE = "blockid_session";
export const SESSION_TTL_DAYS = 90;
export const MAGIC_LINK_TTL_MIN = 15;

export type MagicLinkIntent = "save_founder_pack" | "login";

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: "user" | "admin";
  plan: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  discountPct: number | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  onboardingCompleted: boolean;
  startupGoals: string[] | null;
}

export interface PendingPayload {
  // Captured client-side from sessionStorage when the user clicks "Save Founder Pack".
  // All three are optional — a partial pack is allowed.
  ideaEval?: { inputs: unknown; ideaName?: string };
  equitySplit?: { founders: unknown[]; settings: unknown };
  fundingPlan?: { inputs: unknown };
  // Post-login redirect target. When set, the verify route redirects here
  // instead of the default /dashboard.
  next?: string;
  // Referral code captured from ?ref= URL param, stored in localStorage on
  // the client and passed through pendingPayload during signup.
  referralCode?: string;
}

// -----------------------------------------------------------------------------
// Token generation. nanoid (secure, default alphabet) is fine for both —
// 24 chars * 64 alphabet ≈ 144 bits, 32 chars ≈ 192 bits.
// -----------------------------------------------------------------------------

export function newMagicLinkToken(): string {
  return nanoid(24);
}

export function newSessionToken(): string {
  return nanoid(32);
}

// -----------------------------------------------------------------------------
// Email normalisation. We trim + lowercase before any DB read/write so
// "Foo@Bar.com" and "foo@bar.com" map to the same app_users row.
// -----------------------------------------------------------------------------

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
  );
}

// -----------------------------------------------------------------------------
// Magic-link issuance. Returns { ok, token } so the caller can decide whether
// to actually send the email (and so the dev server can short-circuit when
// SUPABASE/RESEND aren't configured).
// -----------------------------------------------------------------------------

export interface RequestMagicLinkArgs {
  email: string;
  intent: MagicLinkIntent;
  pendingPayload?: PendingPayload;
  ipHash?: string | null;
}

export interface RequestMagicLinkResult {
  ok: boolean;
  token: string;
  expiresAt: string;
  reason?: "not_configured" | "db_error";
}

export async function requestMagicLink(
  args: RequestMagicLinkArgs,
): Promise<RequestMagicLinkResult> {
  const token = newMagicLinkToken();
  const expiresAt = new Date(
    Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000,
  ).toISOString();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn(
      "[blockid:auth] Supabase not configured — returning unsigned token",
      { email: args.email, intent: args.intent },
    );
    return { ok: false, token, expiresAt, reason: "not_configured" };
  }

  const { error } = await supabase.from("magic_links").insert({
    token,
    email: normaliseEmail(args.email),
    intent: args.intent,
    pending_payload: args.pendingPayload ?? {},
    expires_at: expiresAt,
    ip_hash: args.ipHash ?? null,
  });
  if (error) {
    console.error("[blockid:auth] magic_links insert failed", error);
    return { ok: false, token, expiresAt, reason: "db_error" };
  }
  return { ok: true, token, expiresAt };
}

// -----------------------------------------------------------------------------
// Magic-link consumption. Atomically:
//   - reads the row (must exist, not consumed, not expired)
//   - flips consumed_at
//   - upserts the app_user (unique on email)
//   - bumps last_login_at
// Returns the user + the original payload so the caller can hydrate.
// -----------------------------------------------------------------------------

export interface ConsumeMagicLinkResult {
  ok: boolean;
  user?: AppUser;
  intent?: MagicLinkIntent;
  pendingPayload?: PendingPayload;
  reason?:
    | "not_configured"
    | "not_found"
    | "expired"
    | "already_used"
    | "db_error";
}

export async function consumeMagicLink(
  token: string,
): Promise<ConsumeMagicLinkResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const { data: row, error: readErr } = await supabase
    .from("magic_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (readErr) {
    console.error("[blockid:auth] magic_links read failed", readErr);
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
    console.error("[blockid:auth] magic_links consume failed", consumeErr);
    return { ok: false, reason: "db_error" };
  }

  const email = normaliseEmail(row.email);

  // Upsert the app_user. Two-step: try insert, fall back to select on conflict.
  // We don't use upsert+returning because the unique constraint is on email
  // and supabase-js v2 needs explicit onConflict.
  let userId: string | null = null;
  const { data: existing } = await supabase
    .from("app_users")
    .select("id, email, display_name, created_at, last_login_at")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    userId = existing.id;
    await supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    const { data: created, error: createErr } = await supabase
      .from("app_users")
      .insert({ email, last_login_at: new Date().toISOString() })
      .select("id, email, display_name, created_at, last_login_at")
      .single();
    if (createErr || !created) {
      console.error("[blockid:auth] app_users insert failed", createErr);
      return { ok: false, reason: "db_error" };
    }
    userId = created.id;

    // Grant free credits to new users.
    await initializeCredits(created.id);

    // Process referral if a referral code was passed in the pending payload.
    const pendingRef = (row.pending_payload as PendingPayload)?.referralCode;
    if (pendingRef) {
      await processReferral(created.id, pendingRef).catch((err) =>
        console.error("[blockid:auth] referral processing failed", err),
      );
    }
  }

  // Re-read to get the current row (handles both upsert branches uniformly).
  const { data: user } = await supabase
    .from("app_users")
    .select(
      "id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals",
    )
    .eq("id", userId!)
    .single();
  if (!user) return { ok: false, reason: "db_error" };

  return {
    ok: true,
    user: mapAppUser(user),
    intent: row.intent as MagicLinkIntent,
    pendingPayload: (row.pending_payload as PendingPayload) ?? {},
  };
}

// -----------------------------------------------------------------------------
// Session create/read/destroy. Cookie operations must happen in a Route
// Handler or Server Function — we don't set cookies from Server Components.
// -----------------------------------------------------------------------------

export interface CreateSessionArgs {
  userId: string;
  ipHash?: string | null;
  userAgent?: string | null;
}

export async function createSessionRow(
  args: CreateSessionArgs,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
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
    console.error("[blockid:auth] sessions insert failed", error);
    return null;
  }
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    // Secure in prod (https) — Next sets it correctly when the request is
    // served over https; we read NEXT_PUBLIC_SITE_URL as a hint for dev.
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// -----------------------------------------------------------------------------
// getCurrentUser — read the cookie, look up the session, return the user or
// null. Bumps last_used_at for liveness telemetry. Tolerates Supabase being
// unconfigured (returns null without throwing) so dev pages don't crash.
// -----------------------------------------------------------------------------

export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return null;
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("token, user_id, expires_at")
    .eq("token", cookie.value)
    .maybeSingle();
  if (sessErr) {
    console.error("[blockid:auth] sessions read failed", sessErr);
    return null;
  }
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Expired — best-effort delete and forget.
    await supabase.from("sessions").delete().eq("token", cookie.value);
    return null;
  }

  // Touch last_used_at (fire-and-forget; don't block render).
  void supabase
    .from("sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", cookie.value);

  const { data: user } = await supabase
    .from("app_users")
    .select(
      "id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals",
    )
    .eq("id", session.user_id)
    .maybeSingle();
  if (!user) return null;
  return mapAppUser(user);
}

// -----------------------------------------------------------------------------
// Row → AppUser mapper. Centralises the camelCase conversion so every call
// site stays DRY.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    role: row.role === "admin" ? "admin" : "user",
    plan: row.plan ?? null,
    googleId: row.google_id ?? null,
    avatarUrl: row.avatar_url ?? null,
    discountPct: row.discount_pct ?? null,
    startupName: row.startup_name ?? null,
    startupStage: row.startup_stage ?? null,
    industry: row.industry ?? null,
    onboardingCompleted: row.onboarding_completed ?? false,
    startupGoals: row.startup_goals ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// -----------------------------------------------------------------------------
// Google OAuth login. Upserts an app_user by google_id (or email fallback),
// creates a session, and returns the token + user.
// -----------------------------------------------------------------------------

export interface GoogleProfile {
  sub: string; // Google ID
  email: string;
  name?: string;
  picture?: string;
}

export interface LoginWithGoogleResult {
  ok: boolean;
  sessionToken?: string;
  user?: AppUser;
  reason?: "not_configured" | "db_error";
}

function isAdminEmail(email: string): boolean {
  return normaliseEmail(email) === "admin@blockid.au";
}

export async function loginWithGoogle(
  profile: GoogleProfile,
  opts?: { ipHash?: string | null; userAgent?: string | null; referralCode?: string | null },
): Promise<LoginWithGoogleResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const email = normaliseEmail(profile.email);
  const now = new Date().toISOString();
  const role = isAdminEmail(email) ? "admin" : "user";

  // Try to find existing user by google_id first, then by email.
  let userId: string | null = null;

  const { data: byGoogle } = await supabase
    .from("app_users")
    .select("id")
    .eq("google_id", profile.sub)
    .maybeSingle();

  if (byGoogle) {
    userId = byGoogle.id;
  } else {
    const { data: byEmail } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (byEmail) {
      userId = byEmail.id;
    }
  }

  if (userId) {
    // Update existing user with latest Google info.
    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        google_id: profile.sub,
        avatar_url: profile.picture ?? null,
        display_name: profile.name ?? null,
        role,
        last_login_at: now,
      })
      .eq("id", userId);
    if (updateErr) {
      console.error("[blockid:auth] google login update failed", updateErr);
      return { ok: false, reason: "db_error" };
    }
  } else {
    // Create new user.
    const { data: created, error: createErr } = await supabase
      .from("app_users")
      .insert({
        email,
        google_id: profile.sub,
        avatar_url: profile.picture ?? null,
        display_name: profile.name ?? null,
        role,
        last_login_at: now,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("[blockid:auth] google login insert failed", createErr);
      return { ok: false, reason: "db_error" };
    }
    userId = created.id;

    // Grant free credits to new users.
    await initializeCredits(created.id);

    // Process referral if a referral code was provided (from cookie/session).
    if (opts?.referralCode) {
      await processReferral(created.id, opts.referralCode).catch((err) =>
        console.error("[blockid:auth] google referral processing failed", err),
      );
    }
  }

  // Create session.
  const sessionToken = await createSessionRow({
    userId: userId!,
    ipHash: opts?.ipHash ?? null,
    userAgent: opts?.userAgent ?? null,
  });
  if (!sessionToken) return { ok: false, reason: "db_error" };

  // Re-read the full user row.
  const { data: user } = await supabase
    .from("app_users")
    .select(
      "id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals",
    )
    .eq("id", userId!)
    .single();
  if (!user) return { ok: false, reason: "db_error" };

  return { ok: true, sessionToken, user: mapAppUser(user) };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE);
  await clearSessionCookie();
  if (!cookie?.value) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("sessions").delete().eq("token", cookie.value);
}

// -----------------------------------------------------------------------------
// Password-based registration. Hashes the password with bcrypt (12 rounds)
// and creates a new user.
// -----------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

export interface RegisterWithPasswordResult {
  ok: boolean;
  sessionToken?: string;
  user?: AppUser;
  reason?: "not_configured" | "email_taken" | "weak_password" | "db_error";
}

export async function registerWithPassword(args: {
  email: string;
  password: string;
  displayName?: string;
  ipHash?: string | null;
  userAgent?: string | null;
  referralCode?: string | null;
}): Promise<RegisterWithPasswordResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  if (args.password.length < 8) return { ok: false, reason: "weak_password" };

  const email = normaliseEmail(args.email);

  // Check existing user
  const { data: existing } = await supabase
    .from("app_users")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    // If user exists but no password, allow setting password (merge accounts)
    if (!existing.password_hash) {
      const hash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);
      await supabase.from("app_users").update({
        password_hash: hash,
        display_name: args.displayName || undefined,
        last_login_at: new Date().toISOString(),
      }).eq("id", existing.id);

      const sessionToken = await createSessionRow({
        userId: existing.id,
        ipHash: args.ipHash ?? null,
        userAgent: args.userAgent ?? null,
      });
      if (!sessionToken) return { ok: false, reason: "db_error" };

      const { data: user } = await supabase
        .from("app_users")
        .select("id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals")
        .eq("id", existing.id)
        .single();

      return { ok: true, sessionToken, user: user ? mapAppUser(user) : undefined };
    }
    return { ok: false, reason: "email_taken" };
  }

  // Create new user with password
  const hash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);
  const role = isAdminEmail(email) ? "admin" : "user";

  const { data: created, error: createErr } = await supabase
    .from("app_users")
    .insert({
      email,
      password_hash: hash,
      display_name: args.displayName || null,
      role,
      last_login_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createErr || !created) {
    console.error("[blockid:auth] password register insert failed", createErr);
    return { ok: false, reason: "db_error" };
  }

  await initializeCredits(created.id);
  if (args.referralCode) {
    await processReferral(created.id, args.referralCode).catch(() => {});
  }

  const sessionToken = await createSessionRow({
    userId: created.id,
    ipHash: args.ipHash ?? null,
    userAgent: args.userAgent ?? null,
  });
  if (!sessionToken) return { ok: false, reason: "db_error" };

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals")
    .eq("id", created.id)
    .single();

  return { ok: true, sessionToken, user: user ? mapAppUser(user) : undefined };
}

// -----------------------------------------------------------------------------
// Password-based login. Validates email + password against bcrypt hash.
// -----------------------------------------------------------------------------

export interface LoginWithPasswordResult {
  ok: boolean;
  sessionToken?: string;
  user?: AppUser;
  reason?: "not_configured" | "invalid_credentials" | "no_password" | "db_error";
}

export async function loginWithPassword(args: {
  email: string;
  password: string;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<LoginWithPasswordResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const email = normaliseEmail(args.email);

  const { data: user, error } = await supabase
    .from("app_users")
    .select("id, email, password_hash, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals")
    .eq("email", email)
    .maybeSingle();

  if (error) return { ok: false, reason: "db_error" };
  if (!user) return { ok: false, reason: "invalid_credentials" };
  if (!user.password_hash) return { ok: false, reason: "no_password" };

  const valid = await bcrypt.compare(args.password, user.password_hash);
  if (!valid) return { ok: false, reason: "invalid_credentials" };

  // Bump last login
  await supabase.from("app_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  const sessionToken = await createSessionRow({
    userId: user.id,
    ipHash: args.ipHash ?? null,
    userAgent: args.userAgent ?? null,
  });
  if (!sessionToken) return { ok: false, reason: "db_error" };

  return { ok: true, sessionToken, user: mapAppUser(user) };
}

// -----------------------------------------------------------------------------
// Temporary password generation. Creates a readable 10-char password and
// returns it alongside its bcrypt hash. Used for auto-account creation when
// a user submits their first report without an existing account.
// -----------------------------------------------------------------------------

export function generateTempPassword(): string {
  // 10 chars from a-z, A-Z, 0-9 (no confusing chars like 0/O, 1/l/I)
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) pw += chars[b % chars.length];
  return pw;
}

export interface AutoCreateUserResult {
  ok: boolean;
  userId?: string;
  tempPassword?: string;
  isNewUser: boolean;
  reason?: "not_configured" | "db_error";
}

/**
 * Auto-create (or find) an app_users account for the given email.
 * If the user is new AND has no password, generates a temp password so
 * they can log in immediately without a magic link.
 */
export async function autoCreateUserWithTempPassword(
  email: string,
): Promise<AutoCreateUserResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, isNewUser: false, reason: "not_configured" };

  const normalised = normaliseEmail(email);

  // Check if user already exists
  const { data: existing } = await supabase
    .from("app_users")
    .select("id, password_hash")
    .eq("email", normalised)
    .maybeSingle();

  if (existing) {
    return { ok: true, userId: existing.id, isNewUser: false };
  }

  // New user — generate temp password and create account
  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

  const { data: created, error: createErr } = await supabase
    .from("app_users")
    .insert({
      email: normalised,
      password_hash: hash,
      last_login_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createErr || !created) {
    console.error("[blockid:auth] auto-create user failed", createErr);
    return { ok: false, isNewUser: true, reason: "db_error" };
  }

  // Grant free credits to new users
  await initializeCredits(created.id);

  return { ok: true, userId: created.id, tempPassword, isNewUser: true };
}

// -----------------------------------------------------------------------------
// Reset password with temp password. Generates a new temp password for an
// existing user and returns it for emailing.
// -----------------------------------------------------------------------------

export async function resetWithTempPassword(
  email: string,
): Promise<{ ok: boolean; tempPassword?: string; reason?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const normalised = normaliseEmail(email);
  const { data: user } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", normalised)
    .maybeSingle();

  if (!user) {
    // Don't reveal if user exists — return ok anyway
    return { ok: true };
  }

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: hash })
    .eq("id", user.id);

  if (error) {
    console.error("[blockid:auth] reset temp password failed", error);
    return { ok: false, reason: "db_error" };
  }

  return { ok: true, tempPassword };
}
