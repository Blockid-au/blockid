// Billing Microservice — Fastify server
//
// Handles all Stripe integration and credit balance management.
// Called internally by the Next.js monolith via X-Internal-Key header.
// Stripe webhook route bypasses internal auth (uses Stripe signature).

import Fastify from "fastify";
import { creditsRoutes } from "./routes/credits.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { webhookRoutes } from "./routes/webhook.js";
import { portalRoutes } from "./routes/portal.js";
import { cancelRoutes } from "./routes/cancel.js";
import { changePlanRoutes } from "./routes/change-plan.js";
import { couponRoutes } from "./routes/coupon.js";

const PORT = parseInt(process.env.PORT || "4011", 10);
const BILLING_SECRET = process.env.BILLING_SECRET;

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

// ---------------------------------------------------------------------------
// Internal auth hook — all routes except /webhook and /health require
// X-Internal-Key header matching BILLING_SECRET.
// ---------------------------------------------------------------------------

app.addHook("onRequest", async (request, reply) => {
  const { url } = request;

  // Health check and webhook are public (webhook uses Stripe signature).
  if (url === "/health" || url?.startsWith("/webhook")) {
    return;
  }

  if (!BILLING_SECRET) {
    app.log.error("BILLING_SECRET env var is not set — rejecting all internal requests");
    reply.code(503).send({ error: "Service not configured" });
    return;
  }

  const key = request.headers["x-internal-key"];
  if (key !== BILLING_SECRET) {
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
    service: "@blockid/billing",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Register route modules
// ---------------------------------------------------------------------------

await app.register(creditsRoutes, { prefix: "/credits" });
await app.register(checkoutRoutes);
await app.register(webhookRoutes);
await app.register(portalRoutes);
await app.register(cancelRoutes);
await app.register(changePlanRoutes);
await app.register(couponRoutes, { prefix: "/coupon" });

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Billing service listening on http://0.0.0.0:${PORT}`);
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
