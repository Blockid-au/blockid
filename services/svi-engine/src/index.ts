// SVI Engine Microservice — Fastify server
//
// Startup Value Index (SVI) computation engine. Owns signal extraction,
// score computation, and analysis persistence. Pure deterministic — no AI.
//
// Internal routes (X-Internal-Key auth): POST /analyze, POST /rescore,
//   GET /latest, GET /history, POST /share
// Partner routes (API key auth): POST /v1/analyze
// Public: GET /health

import Fastify from "fastify";
import { analyzeRoutes } from "./routes/analyze.js";
import { historyRoutes } from "./routes/history.js";
import { partnerRoutes } from "./routes/partner.js";

const PORT = parseInt(process.env.PORT ?? "4013", 10);
const SVI_SECRET = process.env.SVI_SECRET;

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
  // Allow large request bodies for long startup descriptions + evidence
  bodyLimit: 2 * 1024 * 1024, // 2 MB
});

// ---------------------------------------------------------------------------
// Internal auth hook — all routes except /health and /v1/* require
// X-Internal-Key header matching SVI_SECRET.
// Partner routes (/v1/*) handle their own API key auth.
// ---------------------------------------------------------------------------

app.addHook("onRequest", async (request, reply) => {
  const { url } = request;

  // Health check is public
  if (url === "/health") return;

  // Partner API routes handle their own auth via API key
  if (url?.startsWith("/v1/")) return;

  if (!SVI_SECRET) {
    app.log.error("SVI_SECRET env var is not set — rejecting all internal requests");
    reply.code(503).send({ error: "Service not configured" });
    return;
  }

  const key = request.headers["x-internal-key"];
  if (key !== SVI_SECRET) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", async () => {
  return {
    status: "ok",
    service: "@blockid/svi-engine",
    version: "1.0.0",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Register route modules
// ---------------------------------------------------------------------------

await app.register(analyzeRoutes);
await app.register(historyRoutes);
await app.register(partnerRoutes);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down gracefully");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`SVI Engine listening on http://0.0.0.0:${PORT}`);
} catch (err) {
  app.log.fatal(err, "Failed to start SVI Engine");
  process.exit(1);
}
