// BlockID API key management (server-only).
//
// Keys follow the format: bk_live_<48 hex chars> (56 chars total).
// We store only the SHA-256 hash — the raw key is shown once at creation time
// and never persisted. The key_prefix (first 16 chars + "...") is stored for
// display in the management UI.
//
// Rate limiting uses a per-minute sliding window tracked in api_rate_limits.

import "server-only";
import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `bk_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16) + "...";
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Plan-based limits
// ---------------------------------------------------------------------------

/** Plans that are allowed to create API keys. */
const API_KEY_PLANS = new Set(["growth", "pilot", "accelerator", "enterprise"]);

/** Maximum number of active keys per user. */
const MAX_KEYS_PER_USER = 10;

/** Rate limits by plan (requests per minute). */
export function getRateLimitForPlan(plan: string | null): number {
  switch (plan) {
    case "enterprise":
    case "accelerator":
    case "pilot":
      return 1000;
    case "growth":
      return 100;
    default:
      return 60;
  }
}

export function canCreateApiKeys(plan: string | null): boolean {
  return API_KEY_PLANS.has(plan ?? "");
}

// ---------------------------------------------------------------------------
// Create API key
// ---------------------------------------------------------------------------

export async function createApiKey(
  userId: string,
  plan: string | null,
  name?: string,
): Promise<{ key: string; id: string } | { error: string }> {
  if (!canCreateApiKeys(plan)) {
    return { error: "API keys require a Growth plan or above." };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database not configured." };

  // Check key count limit
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  if ((count ?? 0) >= MAX_KEYS_PER_USER) {
    return { error: `Maximum ${MAX_KEYS_PER_USER} active keys allowed.` };
  }

  const { raw, hash, prefix } = generateApiKey();
  const rateLimit = getRateLimitForPlan(plan);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      name: name?.trim() || "Default",
      key_hash: hash,
      key_prefix: prefix,
      rate_limit_per_min: rateLimit,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[blockid:api-keys] insert failed", error);
    return { error: "Failed to create API key." };
  }

  return { key: raw, id: data.id };
}

// ---------------------------------------------------------------------------
// Validate API key
// ---------------------------------------------------------------------------

export interface ValidatedKey {
  valid: boolean;
  userId?: string;
  email?: string;
  permissions?: string[];
  rateLimitPerMin?: number;
  keyHash?: string;
}

export async function validateApiKey(rawKey: string): Promise<ValidatedKey> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { valid: false };

  const hash = hashApiKey(rawKey);

  const { data: keyRow, error } = await supabase
    .from("api_keys")
    .select("id, user_id, permissions, rate_limit_per_min, is_active, expires_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !keyRow) return { valid: false };
  if (!keyRow.is_active) return { valid: false };
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    return { valid: false };
  }

  // Update last_used_at (fire-and-forget)
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  // Look up the user email for the response
  const { data: userRow } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", keyRow.user_id)
    .maybeSingle();

  return {
    valid: true,
    userId: keyRow.user_id,
    email: userRow?.email ?? undefined,
    permissions: keyRow.permissions ?? [],
    rateLimitPerMin: keyRow.rate_limit_per_min,
    keyHash: hash,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (sliding window — 1-minute buckets)
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  keyHash: string,
  limitPerMin: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const supabase = getSupabaseAdmin();

  // Truncate to start of current minute
  const now = new Date();
  const windowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  const resetAt = new Date(windowStart.getTime() + 60_000);

  if (!supabase) {
    // No DB — allow but can't track
    return { allowed: true, remaining: limitPerMin, resetAt };
  }

  // Try to read existing row for this window
  const { data: existing } = await supabase
    .from("api_rate_limits")
    .select("request_count")
    .eq("key_hash", keyHash)
    .eq("window_start", windowStart.toISOString())
    .maybeSingle();

  const currentCount = existing?.request_count ?? 0;

  if (currentCount >= limitPerMin) {
    return { allowed: false, remaining: 0, resetAt };
  }

  // Upsert: increment counter
  if (existing) {
    await supabase
      .from("api_rate_limits")
      .update({ request_count: currentCount + 1 })
      .eq("key_hash", keyHash)
      .eq("window_start", windowStart.toISOString());
  } else {
    await supabase
      .from("api_rate_limits")
      .insert({
        key_hash: keyHash,
        window_start: windowStart.toISOString(),
        request_count: 1,
      });
  }

  return {
    allowed: true,
    remaining: limitPerMin - currentCount - 1,
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// List user's API keys (masked — never returns raw keys or hashes)
// ---------------------------------------------------------------------------

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  permissions: string[];
  rateLimitPerMin: number;
}

export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, is_active, last_used_at, created_at, permissions, rate_limit_per_min",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[blockid:api-keys] list failed", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at ?? null,
    createdAt: row.created_at,
    permissions: row.permissions ?? [],
    rateLimitPerMin: row.rate_limit_per_min,
  }));
}

// ---------------------------------------------------------------------------
// Revoke key
// ---------------------------------------------------------------------------

export async function revokeApiKey(
  keyId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured." };

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("user_id", userId); // ownership check

  if (error) {
    console.error("[blockid:api-keys] revoke failed", error);
    return { ok: false, error: "Failed to revoke key." };
  }

  return { ok: true };
}
