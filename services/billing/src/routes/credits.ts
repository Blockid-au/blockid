// Credit balance routes.
//
// GET  /credits/balance?userId=xxx → getBalance
// POST /credits/check             → canAfford
// POST /credits/spend             → spendCredits
// POST /credits/grant             → grantCredits (admin use)

import type { FastifyInstance } from "fastify";
import {
  getBalance,
  canAfford,
  spendCredits,
  grantCredits,
} from "../lib/credits.js";

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /credits/balance ─────────────────────────────────────────────
  app.get<{
    Querystring: { userId?: string };
  }>("/balance", async (request, reply) => {
    const { userId } = request.query;
    if (!userId || typeof userId !== "string") {
      return reply.code(400).send({ error: "userId query parameter is required" });
    }

    const result = await getBalance(userId);
    return { ok: true, ...result };
  });

  // ── POST /credits/check ──────────────────────────────────────────────
  app.post<{
    Body: { userId?: string; feature?: string };
  }>("/check", async (request, reply) => {
    const { userId, feature } = request.body ?? {};
    if (!userId || !feature) {
      return reply.code(400).send({ error: "userId and feature are required" });
    }

    const result = await canAfford(userId, feature);
    return { ok: true, ...result };
  });

  // ── POST /credits/spend ──────────────────────────────────────────────
  app.post<{
    Body: { userId?: string; feature?: string; metadata?: Record<string, unknown> };
  }>("/spend", async (request, reply) => {
    const { userId, feature, metadata } = request.body ?? {};
    if (!userId || !feature) {
      return reply.code(400).send({ error: "userId and feature are required" });
    }

    const result = await spendCredits(userId, feature, metadata);
    if (!result.ok) {
      return reply.code(402).send({
        ok: false,
        balance: result.balance,
        reason: "insufficient_credits",
      });
    }

    return {
      ok: true,
      balance: result.balance,
      transactionId: result.transactionId,
    };
  });

  // ── POST /credits/grant ──────────────────────────────────────────────
  app.post<{
    Body: {
      userId?: string;
      amount?: number;
      reason?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/grant", async (request, reply) => {
    const { userId, amount, reason, metadata } = request.body ?? {};
    if (!userId || !amount || !reason) {
      return reply.code(400).send({ error: "userId, amount, and reason are required" });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return reply.code(400).send({ error: "amount must be a positive number" });
    }

    const result = await grantCredits(userId, amount, reason, metadata);
    if (!result.ok) {
      return reply.code(500).send({ ok: false, error: "Failed to grant credits" });
    }

    return { ok: true, balance: result.balance };
  });
}
