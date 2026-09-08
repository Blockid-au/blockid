// GET /api/health — alias for /api/status.
//
// External uptime monitors (Better Uptime, Pingdom, Cloudflare Health Checks)
// default to /api/health but our canonical endpoint is /api/status. Rather
// than force every monitor to update, this thin re-export forwards to the
// same handler. Any change to status semantics propagates automatically.
//
// QA sweep Sep 2026 caught this as a 404.

import "server-only";

export { GET, runtime, dynamic } from "@/app/api/status/route";
