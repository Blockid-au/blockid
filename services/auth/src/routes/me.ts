// GET /me — Validate session token and return the authenticated user.
//
// The session token is read from the Authorization: Bearer header.
// Returns { ok: true, user } or { ok: false }.

import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { validateSession } from "../lib/sessions.js";
import { mapAppUser, APP_USER_SELECT } from "../lib/users.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ ok: false, user: null });
    }

    const token = authHeader.slice(7);
    if (!token) {
      return reply.code(401).send({ ok: false, user: null });
    }

    const session = await validateSession(token);
    if (!session) {
      return reply.code(401).send({ ok: false, user: null });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, user: null });
    }

    const { data: user } = await supabase
      .from("app_users")
      .select(APP_USER_SELECT)
      .eq("id", session.userId)
      .maybeSingle();

    if (!user) {
      return reply.code(401).send({ ok: false, user: null });
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name ?? null,
        plan: user.plan ?? null,
        role: user.role === "admin" ? "admin" : "user",
        onboardingCompleted: user.onboarding_completed ?? false,
        avatarUrl: user.avatar_url ?? null,
        startupName: user.startup_name ?? null,
        startupStage: user.startup_stage ?? null,
        industry: user.industry ?? null,
        createdAt: user.created_at,
      },
    };
  });
}
