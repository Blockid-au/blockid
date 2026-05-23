// API key management routes.
//
// POST   /keys          — Create a new API key
// GET    /keys?userId=x — List keys for user
// DELETE /keys/:id      — Revoke a key
// POST   /keys/validate — Validate a raw API key

import type { FastifyInstance } from "fastify";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  validateApiKey,
  checkRateLimit,
} from "../lib/api-keys.js";

export async function keysRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /keys ────────────────────────────────────────────────────────
  app.post<{
    Body: { userId?: string; name?: string; permissions?: string[] };
  }>("/", async (request, reply) => {
    const { userId, name, permissions } = request.body ?? {};

    if (!userId || typeof userId !== "string") {
      return reply.code(400).send({ ok: false, error: "userId is required" });
    }

    const result = await createApiKey(userId, name, permissions);
    if (!result.ok) {
      return reply.code(403).send(result);
    }

    return { ok: true, key: result.key, keyId: result.keyId };
  });

  // ── GET /keys ─────────────────────────────────────────────────────────
  app.get<{
    Querystring: { userId?: string };
  }>("/", async (request, reply) => {
    const { userId } = request.query;

    if (!userId || typeof userId !== "string") {
      return reply.code(400).send({ ok: false, error: "userId query parameter is required" });
    }

    const keys = await listApiKeys(userId);
    return { ok: true, keys };
  });

  // ── DELETE /keys/:id ──────────────────────────────────────────────────
  app.delete<{
    Params: { id: string };
    Querystring: { userId?: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const userId = request.query.userId ?? (request.body as { userId?: string })?.userId;

    if (!userId || typeof userId !== "string") {
      return reply.code(400).send({ ok: false, error: "userId is required" });
    }

    const result = await revokeApiKey(id, userId);
    if (!result.ok) {
      return reply.code(500).send(result);
    }

    return { ok: true };
  });

  // ── POST /keys/validate ──────────────────────────────────────────────
  app.post<{
    Body: { apiKey?: string };
  }>("/validate", async (request, reply) => {
    const { apiKey } = request.body ?? {};

    if (!apiKey || typeof apiKey !== "string") {
      return reply.code(400).send({ ok: false, error: "apiKey is required" });
    }

    const validated = await validateApiKey(apiKey);
    if (!validated.valid) {
      return reply.code(401).send({ ok: false, error: "Invalid API key" });
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
      validated.keyHash!,
      validated.rateLimitPerMin!,
    );

    return {
      ok: true,
      userId: validated.userId,
      keyId: validated.keyId,
      email: validated.email,
      permissions: validated.permissions,
      rateLimit: {
        allowed: rateLimitResult.allowed,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt.toISOString(),
      },
    };
  });
}
