// Auth Microservice — Fastify server
//
// Handles all authentication, session management, and API key operations.
// Owns the app_users, sessions, magic_links, api_keys, and
// email_preferences tables.
//
// Public routes: /health, auth endpoints (register, login, etc.)
// Internal routes: /users/* (requires X-Internal-Key header)
// Session-auth routes: /me (requires Authorization: Bearer <sessionToken>)

import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { keysRoutes } from "./routes/keys.js";
import { usersRoutes } from "./routes/users.js";
import { cleanupExpiredSessions } from "./lib/sessions.js";

const PORT = parseInt(process.env.PORT || "4012", 10);
const AUTH_SECRET = process.env.AUTH_SECRET;

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

// ---------------------------------------------------------------------------
// Internal auth hook — /users/* requires X-Internal-Key header matching
// AUTH_SECRET. All other routes are either public or use Bearer token auth.
// ---------------------------------------------------------------------------

app.addHook("onRequest", async (request, reply) => {
  const { url } = request;

  // Routes that do NOT require X-Internal-Key:
  //   /health — public health check
  //   /register, /login, /magic-link, /verify-magic, /logout — public auth
  //   /reset-password, /set-password — public auth
  //   /me — uses Bearer session token (validated in the route handler)
  //   /keys/* — internal but uses X-Internal-Key just like /users

  if (
    url === "/health" ||
    url === "/register" ||
    url === "/login" ||
    url === "/magic-link" ||
    url === "/verify-magic" ||
    url === "/logout" ||
    url === "/reset-password" ||
    url === "/set-password" ||
    url === "/me"
  ) {
    return;
  }

  // All other routes (/users/*, /keys/*) require internal auth.
  if (!AUTH_SECRET) {
    app.log.error("AUTH_SECRET env var is not set — rejecting internal requests");
    reply.code(503).send({ error: "Service not configured" });
    return;
  }

  const key = request.headers["x-internal-key"];
  if (key !== AUTH_SECRET) {
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
    service: "@blockid/auth",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Register route modules
// ---------------------------------------------------------------------------

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(keysRoutes, { prefix: "/keys" });
await app.register(usersRoutes, { prefix: "/users" });

// ---------------------------------------------------------------------------
// Periodic session cleanup — every hour, remove expired sessions.
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  try {
    const count = await cleanupExpiredSessions();
    if (count > 0) {
      app.log.info(`Cleaned up ${count} expired sessions`);
    }
  } catch (err) {
    app.log.error({ err }, "Session cleanup failed");
  }
}, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Auth service listening on http://0.0.0.0:${PORT}`);
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
