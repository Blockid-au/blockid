// Internal user management routes.
//
// These are protected by the X-Internal-Key middleware and used by other
// microservices (billing, ai-gateway) to read/update user records.
//
// GET   /users/:id — Get user by ID
// PATCH /users/:id — Update user fields

import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { mapAppUser, APP_USER_SELECT } from "../lib/users.js";

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /users/:id ────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    const { data: user, error } = await supabase
      .from("app_users")
      .select(APP_USER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, "user lookup failed");
      return reply.code(500).send({ ok: false, error: "Database error" });
    }
    if (!user) {
      return reply.code(404).send({ ok: false, error: "User not found" });
    }

    return { ok: true, user: mapAppUser(user) };
  });

  // ── PATCH /users/:id ─────────────────────────────────────────────────
  app.patch<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const body = request.body ?? {};

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, error: "Database not configured" });
    }

    // Whitelist of updatable fields — prevents arbitrary column writes.
    const ALLOWED_FIELDS: Record<string, string> = {
      plan: "plan",
      role: "role",
      displayName: "display_name",
      avatarUrl: "avatar_url",
      stripeCustomerId: "stripe_customer_id",
      startupName: "startup_name",
      startupStage: "startup_stage",
      industry: "industry",
      onboardingCompleted: "onboarding_completed",
      startupGoals: "startup_goals",
      discountPct: "discount_pct",
      googleId: "google_id",
    };

    const updates: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(ALLOWED_FIELDS)) {
      if (camel in body) {
        updates[snake] = body[camel];
      }
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ ok: false, error: "No valid fields to update" });
    }

    const { error } = await supabase
      .from("app_users")
      .update(updates)
      .eq("id", id);

    if (error) {
      app.log.error({ err: error }, "user update failed");
      return reply.code(500).send({ ok: false, error: "Update failed" });
    }

    // Return the updated user
    const { data: user } = await supabase
      .from("app_users")
      .select(APP_USER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!user) {
      return reply.code(404).send({ ok: false, error: "User not found" });
    }

    return { ok: true, user: mapAppUser(user) };
  });
}
