// Auth routes — register, login, magic-link, verify, logout, reset/set password.
//
// POST /register       — { email, password, displayName? }
// POST /login          — { email, password }
// POST /magic-link     — { email, intent? }
// POST /verify-magic   — { token }
// POST /logout         — { sessionToken }
// POST /reset-password — { email }
// POST /set-password   — { token, password }

import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { hashPassword, verifyPassword, generateTempPassword } from "../lib/passwords.js";
import {
  createSession,
  createMagicLink,
  consumeMagicLink,
  destroySession,
} from "../lib/sessions.js";
import { mapAppUser, normaliseEmail, isValidEmail, APP_USER_SELECT } from "../lib/users.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeName(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.replace(/<[^>]*>/g, "").trim().slice(0, 100);
}

function isAdminEmail(email: string): boolean {
  return normaliseEmail(email) === "admin@blockid.au";
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /register ────────────────────────────────────────────────────
  app.post<{
    Body: { email?: string; password?: string; displayName?: string };
  }>("/register", async (request, reply) => {
    const { email, password, displayName } = request.body ?? {};

    if (!isValidEmail(email)) {
      return reply.code(400).send({ ok: false, error: "Valid email is required" });
    }
    if (!password || typeof password !== "string") {
      return reply.code(400).send({ ok: false, error: "Password is required" });
    }
    if (password.length < 8) {
      return reply.code(400).send({ ok: false, error: "Password must be at least 8 characters" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const normEmail = normaliseEmail(email);

    // Check existing user
    const { data: existing } = await supabase
      .from("app_users")
      .select("id, password_hash")
      .eq("email", normEmail)
      .maybeSingle();

    if (existing) {
      // Allow setting password on magic-link / Google-only accounts
      if (!existing.password_hash) {
        const hash = await hashPassword(password);
        await supabase
          .from("app_users")
          .update({
            password_hash: hash,
            display_name: sanitizeName(displayName) || undefined,
            last_login_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        const sessionToken = await createSession({
          userId: existing.id,
          ipHash: request.headers["x-forwarded-for"] as string | undefined,
          userAgent: request.headers["user-agent"],
        });
        if (!sessionToken) {
          return reply.code(500).send({ ok: false, error: "Session creation failed" });
        }

        const { data: user } = await supabase
          .from("app_users")
          .select(APP_USER_SELECT)
          .eq("id", existing.id)
          .single();

        return { ok: true, user: user ? mapAppUser(user) : undefined, sessionToken };
      }

      return reply.code(409).send({
        ok: false,
        error: "An account with this email already exists. Try logging in instead.",
      });
    }

    // Create new user
    const hash = await hashPassword(password);
    const role = isAdminEmail(normEmail) ? "admin" : "user";

    const { data: created, error: createErr } = await supabase
      .from("app_users")
      .insert({
        email: normEmail,
        password_hash: hash,
        display_name: sanitizeName(displayName) || null,
        role,
        last_login_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createErr || !created) {
      app.log.error({ err: createErr }, "app_users insert failed");
      return reply.code(500).send({ ok: false, error: "Registration failed" });
    }

    const sessionToken = await createSession({
      userId: created.id,
      ipHash: request.headers["x-forwarded-for"] as string | undefined,
      userAgent: request.headers["user-agent"],
    });
    if (!sessionToken) {
      return reply.code(500).send({ ok: false, error: "Session creation failed" });
    }

    const { data: user } = await supabase
      .from("app_users")
      .select(APP_USER_SELECT)
      .eq("id", created.id)
      .single();

    return { ok: true, user: user ? mapAppUser(user) : undefined, sessionToken };
  });

  // ── POST /login ───────────────────────────────────────────────────────
  app.post<{
    Body: { email?: string; password?: string };
  }>("/login", async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!isValidEmail(email)) {
      return reply.code(400).send({ ok: false, error: "Valid email is required" });
    }
    if (!password || typeof password !== "string") {
      return reply.code(400).send({ ok: false, error: "Password is required" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const normEmail = normaliseEmail(email);

    const { data: user, error } = await supabase
      .from("app_users")
      .select(`${APP_USER_SELECT}, password_hash`)
      .eq("email", normEmail)
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, "DB query error during login");
      return reply.code(500).send({ ok: false, error: "Database error" });
    }
    if (!user) {
      return reply.code(401).send({ ok: false, error: "Invalid email or password" });
    }
    if (!user.password_hash) {
      return reply.code(401).send({
        ok: false,
        error: "This account uses Google or magic link login. Set a password first or use those methods.",
        reason: "no_password",
      });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ ok: false, error: "Invalid email or password" });
    }

    // Bump last login
    await supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    const sessionToken = await createSession({
      userId: user.id,
      ipHash: request.headers["x-forwarded-for"] as string | undefined,
      userAgent: request.headers["user-agent"],
    });
    if (!sessionToken) {
      return reply.code(500).send({ ok: false, error: "Session creation failed" });
    }

    return { ok: true, user: mapAppUser(user), sessionToken };
  });

  // ── POST /magic-link ─────────────────────────────────────────────────
  app.post<{
    Body: { email?: string; intent?: string; pendingPayload?: Record<string, unknown> };
  }>("/magic-link", async (request, reply) => {
    const { email, intent, pendingPayload } = request.body ?? {};

    if (!isValidEmail(email)) {
      return reply.code(400).send({ ok: false, error: "Valid email is required" });
    }

    const normEmail = normaliseEmail(email);
    const result = await createMagicLink({
      email: normEmail,
      intent: intent ?? "login",
      pendingPayload,
      ipHash: request.headers["x-forwarded-for"] as string | undefined,
    });

    if (!result) {
      return reply.code(500).send({ ok: false, error: "Failed to create magic link" });
    }

    // The caller (Next.js monolith) is responsible for sending the email.
    // We return the token so it can build the link.
    return { ok: true, token: result.token, expiresAt: result.expiresAt };
  });

  // ── POST /verify-magic ───────────────────────────────────────────────
  app.post<{
    Body: { token?: string };
  }>("/verify-magic", async (request, reply) => {
    const { token } = request.body ?? {};

    if (!token || typeof token !== "string") {
      return reply.code(400).send({ ok: false, error: "Token is required" });
    }

    const result = await consumeMagicLink(token);
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        not_found: 404,
        expired: 410,
        already_used: 410,
        db_error: 500,
      };
      return reply
        .code(statusMap[result.reason ?? "db_error"] ?? 500)
        .send({ ok: false, error: `Magic link ${result.reason}`, reason: result.reason });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const email = normaliseEmail(result.email!);

    // Upsert user
    let userId: string;
    const { data: existing } = await supabase
      .from("app_users")
      .select("id")
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
        .select("id")
        .single();
      if (createErr || !created) {
        app.log.error({ err: createErr }, "app_users insert failed during magic link verify");
        return reply.code(500).send({ ok: false, error: "User creation failed" });
      }
      userId = created.id;
    }

    const sessionToken = await createSession({
      userId,
      ipHash: request.headers["x-forwarded-for"] as string | undefined,
      userAgent: request.headers["user-agent"],
    });
    if (!sessionToken) {
      return reply.code(500).send({ ok: false, error: "Session creation failed" });
    }

    const { data: user } = await supabase
      .from("app_users")
      .select(APP_USER_SELECT)
      .eq("id", userId)
      .single();

    return {
      ok: true,
      user: user ? mapAppUser(user) : undefined,
      sessionToken,
      intent: result.intent,
      pendingPayload: result.pendingPayload,
    };
  });

  // ── POST /logout ──────────────────────────────────────────────────────
  app.post<{
    Body: { sessionToken?: string };
  }>("/logout", async (request, reply) => {
    const { sessionToken } = request.body ?? {};

    if (!sessionToken || typeof sessionToken !== "string") {
      return reply.code(400).send({ ok: false, error: "sessionToken is required" });
    }

    await destroySession(sessionToken);
    return { ok: true };
  });

  // ── POST /reset-password ──────────────────────────────────────────────
  app.post<{
    Body: { email?: string };
  }>("/reset-password", async (request, reply) => {
    const { email } = request.body ?? {};

    if (!isValidEmail(email)) {
      return reply.code(400).send({ ok: false, error: "Valid email is required" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const normEmail = normaliseEmail(email);
    const { data: user } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", normEmail)
      .maybeSingle();

    // Always return ok to avoid revealing whether an account exists.
    if (!user) {
      return { ok: true };
    }

    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);

    const { error } = await supabase
      .from("app_users")
      .update({ password_hash: hash })
      .eq("id", user.id);

    if (error) {
      app.log.error({ err: error }, "reset password failed");
      return reply.code(500).send({ ok: false, error: "Password reset failed" });
    }

    // Return the temp password so the caller (monolith) can email it.
    return { ok: true, tempPassword };
  });

  // ── POST /set-password ────────────────────────────────────────────────
  app.post<{
    Body: { token?: string; password?: string };
  }>("/set-password", async (request, reply) => {
    const { token, password } = request.body ?? {};

    if (!token || typeof token !== "string") {
      return reply.code(400).send({ ok: false, error: "Token is required" });
    }
    if (!password || typeof password !== "string") {
      return reply.code(400).send({ ok: false, error: "Password is required" });
    }
    if (password.length < 8) {
      return reply.code(400).send({ ok: false, error: "Password must be at least 8 characters" });
    }

    // Consume the magic link token to verify identity
    const result = await consumeMagicLink(token);
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        not_found: 404,
        expired: 410,
        already_used: 410,
        db_error: 500,
      };
      return reply
        .code(statusMap[result.reason ?? "db_error"] ?? 500)
        .send({ ok: false, error: `Token ${result.reason}`, reason: result.reason });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const email = normaliseEmail(result.email!);
    const hash = await hashPassword(password);

    const { error } = await supabase
      .from("app_users")
      .update({ password_hash: hash })
      .eq("email", email);

    if (error) {
      app.log.error({ err: error }, "set password failed");
      return reply.code(500).send({ ok: false, error: "Set password failed" });
    }

    return { ok: true };
  });
}
