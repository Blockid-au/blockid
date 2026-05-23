/**
 * AI Gateway — standalone Fastify microservice for unified AI provider routing.
 *
 * Phase 1 extraction from the Next.js monolith. Provides a single POST /generate
 * endpoint that routes through providers with automatic fallback and budget tracking.
 *
 * Internal-only service — no CORS, authenticated via X-Internal-Key header.
 */

import Fastify from "fastify";
import { generateRoute } from "./routes/generate.js";
import { getBudgetStatus } from "./budget.js";

const PORT = parseInt(process.env.PORT ?? "4010", 10);
const INTERNAL_SECRET = process.env.AI_GATEWAY_SECRET ?? "";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
  // Keep-alive for internal service mesh
  keepAliveTimeout: 72_000,
  // Allow large request bodies for long prompts / system messages
  bodyLimit: 2 * 1024 * 1024, // 2 MB
});

// ── Authentication hook ─────────────────────────────────────────────
// All requests (except /health) must include the shared secret.

app.addHook("onRequest", async (request, reply) => {
  // Skip auth for health check
  if (request.url === "/health") return;

  if (!INTERNAL_SECRET) {
    request.log.warn("AI_GATEWAY_SECRET not set — running without auth");
    return;
  }

  const provided = request.headers["x-internal-key"];
  if (provided !== INTERNAL_SECRET) {
    return reply.status(401).send({ ok: false, error: "Unauthorized" });
  }
});

// ── Health check ────────────────────────────────────────────────────

app.get("/health", async () => {
  const budget = getBudgetStatus();
  return {
    status: "ok",
    service: "ai-gateway",
    version: "1.0.0",
    uptime: Math.round(process.uptime()),
    budget,
  };
});

// ── Register routes ─────────────────────────────────────────────────

await app.register(generateRoute);

// ── Graceful shutdown ───────────────────────────────────────────────

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down gracefully");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start server ────────────────────────────────────────────────────

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(
    `AI Gateway listening on http://0.0.0.0:${PORT} (internal only)`,
  );
} catch (err) {
  app.log.fatal(err, "Failed to start AI Gateway");
  process.exit(1);
}
