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

// Best-effort extraction of the client IP from a Headers object — the hop
// our edge actually saw, never a value the client can forge (S20-A review
// P2-3; same rule as lib/audit/redact.ts `clientIp`):
//   1. `cf-connecting-ip` (Cloudflare sets it at the edge);
//   2. the LAST `x-forwarded-for` hop — nginx appends its `$remote_addr`
//      via `$proxy_add_x_forwarded_for`, so the last entry is the peer of
//      our proxy while the FIRST entry is whatever the client sent. The
//      old "first hop" rule let `X-Forwarded-For: <victim>` pick the
//      view-tracking hash and the promo-code rate-limit key;
//   3. `x-real-ip`.
// Signature unchanged: rate-limit keys (`?? "unknown"`) keep working.
export function clientIpFromHeaders(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}
