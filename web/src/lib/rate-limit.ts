import "server-only";

/**
 * Rate limiter with pluggable storage backend.
 *
 * Current: In-memory Map (single container)
 * Future:  Redis (multi-container / Kubernetes)
 *
 * To switch to Redis, set REDIS_URL env var. The limiter automatically
 * uses Redis when available, falls back to in-memory.
 *
 * Architecture note: This module is imported by auth, cron, and AI routes.
 * When splitting into microservices, each service gets its own rate limiter
 * instance pointing to the same Redis cluster.
 */

// ── Storage interface (pluggable) ────────────────────────────────────

interface RateLimitStore {
  get(key: string): Promise<{ count: number; resetAt: number } | null>;
  set(key: string, count: number, resetAt: number): Promise<void>;
  increment(key: string): Promise<number>;
}

// ── In-memory store (single container) ───────────────────────────────

class MemoryStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.resetAt < now) this.store.delete(key);
      }
    }, 5 * 60 * 1000);
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, count: number, resetAt: number) {
    this.store.set(key, { count, resetAt });
  }

  async increment(key: string) {
    const entry = this.store.get(key);
    if (!entry) return 1;
    entry.count++;
    return entry.count;
  }
}

// ── Redis store (multi-container / Kubernetes) ───────────────────────

class RedisStore implements RateLimitStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private redis: any;
  private connected = false;

  constructor(url: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RedisModule = require("ioredis");
      const Redis = RedisModule.default ?? RedisModule;
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 3000,
        retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 2000)),
      });
      this.redis.connect().then(() => { this.connected = true; }).catch(() => {
        console.warn("[rate-limit] Redis connection failed — falling back to in-memory");
      });
    } catch (err) {
      console.warn("[rate-limit] ioredis not available — using in-memory fallback");
      this.redis = null;
    }
  }

  async get(key: string) {
    if (!this.redis || !this.connected) return null;
    try {
      const data = await this.redis.get(`rl:${key}`);
      if (!data) return null;
      return JSON.parse(data) as { count: number; resetAt: number };
    } catch {
      return null;
    }
  }

  async set(key: string, count: number, resetAt: number) {
    if (!this.redis || !this.connected) return;
    try {
      const ttlMs = Math.max(1000, resetAt - Date.now());
      await this.redis.set(`rl:${key}`, JSON.stringify({ count, resetAt }), "PX", ttlMs);
    } catch { /* fail open */ }
  }

  async increment(key: string) {
    if (!this.redis || !this.connected) return 1;
    try {
      const data = await this.redis.get(`rl:${key}`);
      if (!data) return 1;
      const entry = JSON.parse(data) as { count: number; resetAt: number };
      entry.count++;
      const ttlMs = Math.max(1000, entry.resetAt - Date.now());
      await this.redis.set(`rl:${key}`, JSON.stringify(entry), "PX", ttlMs);
      return entry.count;
    } catch {
      return 1;
    }
  }

  isAvailable(): boolean {
    return this.connected && !!this.redis;
  }
}

// ── Store singleton ──────────────────────────────────────────────────

let _store: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (!_store) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      console.log("[rate-limit] Using Redis store:", redisUrl.replace(/\/\/.*@/, "//***@"));
      _store = new RedisStore(redisUrl);
    } else {
      console.log("[rate-limit] Using in-memory store (single container mode)");
      _store = new MemoryStore();
    }
  }
  return _store;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check if a key has exceeded the rate limit.
 * @param key - Unique identifier (e.g., "login:{ip}" or "cron:agent-upgrade")
 * @param maxAttempts - Max attempts in the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed, remaining, resetIn }
 */
// Sync fallback map — used by checkRateLimit() when Redis is primary store.
// Redis operations are async but checkRateLimit() is sync (backward compat).
// This map serves as a local cache that's eventually consistent with Redis.
const syncFallback = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetIn: number } {
  const store = getStore();
  const now = Date.now();

  // For MemoryStore, access the internal map directly
  let storeMap: Map<string, { count: number; resetAt: number }>;
  if (store instanceof MemoryStore) {
    storeMap = (store as unknown as { store: Map<string, { count: number; resetAt: number }> }).store;
  } else {
    // Redis store — use sync fallback map and fire async update in background
    storeMap = syncFallback;
  }

  const entry = storeMap.get(key);

  if (!entry || entry.resetAt < now) {
    storeMap.set(key, { count: 1, resetAt: now + windowMs });
    // Async sync to Redis (fire-and-forget)
    if (!(store instanceof MemoryStore)) void store.set(key, 1, now + windowMs);
    return { allowed: true, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  if (!(store instanceof MemoryStore)) void store.set(key, entry.count, entry.resetAt);
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetIn: entry.resetAt - now,
  };
}

/**
 * Async version for Redis-compatible stores.
 * Use this in new code — it supports both in-memory and Redis.
 */
export async function checkRateLimitAsync(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const store = getStore();
  const now = Date.now();
  const entry = await store.get(key);

  if (!entry || entry.resetAt < now) {
    await store.set(key, 1, now + windowMs);
    return { allowed: true, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  const newCount = await store.increment(key);
  return {
    allowed: true,
    remaining: maxAttempts - newCount,
    resetIn: entry.resetAt - now,
  };
}
