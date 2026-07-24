// Persistent, Postgres-backed rate limiter (round 5.4b).
//
// A fixed-window counter that lives in `public.endpoint_rate_limits`,
// driven by the atomic upsert-and-increment RPC `public.consume_rate_limit`.
// Unlike the in-process `Map`-based helpers in `../rate-limit.ts` this
// limiter survives process restarts and works across containers, so it's
// the right choice for user-scoped quotas on write endpoints (e.g. the
// dataroom populate action, reveal-email, etc.).
//
// Migration: web/supabase/migrations/0107_rate_limits.sql
//
// Algorithm
// ---------
//   window_start = floor(now, windowSeconds)   // shared across all callers
//   count = consume_rate_limit(bucket_key, window_start)   // atomic in PG
//   allowed = count <= limit
//
// The ON CONFLICT branch inside `consume_rate_limit` runs atomically, so
// two concurrent hits from the same actor cannot both "sneak in" at the
// boundary. Because we use a fixed (rather than sliding) window, a caller
// can in theory burn 2×limit requests across the window boundary —
// acceptable for this use case; if we need stricter behaviour later we
// can layer a sliding window on top of the same table.
//
// Fail-open policy
// ----------------
// If the DB call fails (Supabase down, RPC missing on a fresh preview
// env, network blip) we log a warning and RETURN allowed=true so a
// database wobble cannot lock every user out of the app. Once the
// endpoint_rate_limits infrastructure is confirmed in every environment
// we can flip this to fail-closed.
// TODO(rate-limit): fail-closed once metrics show <1 error/day.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Result of a single {@link consumeRateLimit} call.
 */
export type RateLimitResult = {
  /** True when the caller is under-quota (or the DB failed and we fell open). */
  allowed: boolean;
  /** The configured limit for this bucket, echoed back so the caller can label 429s. */
  limit: number;
  /** How many more calls the caller may make in the current window. */
  remaining: number;
  /** ISO timestamp of when the current window ends and the counter resets. */
  reset_at: string;
  /** Seconds until the window resets. Populated when `allowed === false`. */
  retry_after_seconds?: number;
};

export type ConsumeRateLimitOpts = {
  /** Endpoint identifier, e.g. `"dataroom.populate"`. Stable and short. */
  bucket: string;
  /** User id (UUID) or IP address for anonymous callers. */
  actorId: string;
  /** Maximum calls allowed inside `windowSeconds`. */
  limit: number;
  /** Length of the fixed window in seconds. */
  windowSeconds: number;
};

/**
 * Consume one unit against a persistent rate-limit bucket.
 *
 * @example
 *   const rl = await consumeRateLimit({
 *     bucket: "dataroom.populate",
 *     actorId: user.id,
 *     limit: 5,
 *     windowSeconds: 3600,
 *   });
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: "rate_limited", limit: rl.limit, retry_after_seconds: rl.retry_after_seconds },
 *       { status: 429, headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) } },
 *     );
 *   }
 *
 * @example
 *   // Anonymous callers — fall back to IP.
 *   const rl = await consumeRateLimit({
 *     bucket: "public.contact",
 *     actorId: request.headers.get("x-forwarded-for") ?? "anon",
 *     limit: 3,
 *     windowSeconds: 300,
 *   });
 */
export async function consumeRateLimit(
  opts: ConsumeRateLimitOpts,
): Promise<RateLimitResult> {
  const { bucket, actorId, limit, windowSeconds } = opts;

  if (!bucket || !actorId) {
    // Misuse — treat as allowed but log so we notice in dev.
    console.warn(
      "[rate-limit] consumeRateLimit called with empty bucket/actorId",
      { bucket, actorId },
    );
    return failOpen(limit, windowSeconds);
  }

  const bucketKey = `${bucket}:${actorId}`;
  const now = Date.now();
  const windowMs = Math.max(1, windowSeconds) * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEndMs = windowStartMs + windowMs;
  const resetAt = new Date(windowEndMs).toISOString();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Supabase not configured (marketing-site dev mode) — fall open.
    return failOpen(limit, windowSeconds);
  }

  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket_key: bucketKey,
      p_window_start: windowStart,
    });

    if (error || typeof data !== "number") {
      console.warn("[rate-limit] consume_rate_limit RPC failed — failing open", {
        error,
        data,
      });
      return failOpen(limit, windowSeconds);
    }

    const currentCount = data;
    if (currentCount > limit) {
      const retryAfter = Math.max(1, Math.ceil((windowEndMs - now) / 1000));
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset_at: resetAt,
        retry_after_seconds: retryAfter,
      };
    }
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - currentCount),
      reset_at: resetAt,
    };
  } catch (err) {
    console.warn("[rate-limit] consumeRateLimit threw — failing open", err);
    return failOpen(limit, windowSeconds);
  }
}

function failOpen(limit: number, windowSeconds: number): RateLimitResult {
  const resetAt = new Date(Date.now() + windowSeconds * 1000).toISOString();
  return {
    allowed: true,
    limit,
    remaining: limit,
    reset_at: resetAt,
  };
}
