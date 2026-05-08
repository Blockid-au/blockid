// Server-only IP hashing for view tracking.
//
// We never store raw IP addresses. We hash with sha256 + a daily-rotating salt,
// which means: per-day uniqueness counting works, but the same viewer on the
// next day looks like a different person — that's the privacy intent.

import "server-only";
import { createHash } from "node:crypto";

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || `${todayKey()}-default-salt`;
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

// Best-effort extraction of client IP from a Headers object. Caddy sets
// X-Forwarded-For; we take the first entry (the client) when present.
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") || null;
}
