// BlockID API authentication helper (server-only).
//
// Supports two authentication methods:
//   1. API key via Authorization: Bearer bk_live_xxx header
//   2. Session cookie (existing magic-link / Google OAuth sessions)
//
// API routes call authenticateRequest(request) and get back a unified
// result regardless of which auth method was used.

import "server-only";
import { getCurrentUser } from "./auth";
import { validateApiKey, checkRateLimit } from "./api-keys";

export interface AuthResult {
  userId: string;
  email: string;
  authMethod: "session" | "api_key";
  permissions?: string[];
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
}

/**
 * Authenticate an incoming API request.
 *
 * Checks for a Bearer token first (API key). If not present or invalid,
 * falls back to session cookie auth.
 *
 * Returns null if neither method yields a valid user.
 * Throws a RateLimitError if the API key is valid but rate-limited.
 */
export async function authenticateRequest(
  request: Request,
): Promise<{ auth: AuthResult; rateLimit?: RateLimitInfo } | null> {
  // 1. Check for API key in Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer bk_live_")) {
    const rawKey = authHeader.slice(7); // strip "Bearer "
    const validated = await validateApiKey(rawKey);

    if (!validated.valid || !validated.userId) {
      return null; // Invalid key — don't fall back to session
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
      validated.keyHash!,
      validated.rateLimitPerMin!,
    );

    if (!rateLimitResult.allowed) {
      // Return a distinguishable shape so callers can return 429
      return null; // Caller should check headers for rate-limit info
    }

    return {
      auth: {
        userId: validated.userId,
        email: validated.email ?? "",
        authMethod: "api_key",
        permissions: validated.permissions,
      },
      rateLimit: {
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
      },
    };
  }

  // 2. Fall back to session cookie auth
  const user = await getCurrentUser();
  if (!user) return null;

  return {
    auth: {
      userId: user.id,
      email: user.email,
      authMethod: "session",
    },
  };
}

/**
 * Authenticate request via API key only (no session fallback).
 * Returns rate limit info alongside auth, or null if invalid.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<{
  auth: AuthResult;
  rateLimit: RateLimitInfo;
  rateLimited: boolean;
} | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer bk_live_")) return null;

  const rawKey = authHeader.slice(7);
  const validated = await validateApiKey(rawKey);

  if (!validated.valid || !validated.userId) return null;

  const rateLimitResult = await checkRateLimit(
    validated.keyHash!,
    validated.rateLimitPerMin!,
  );

  return {
    auth: {
      userId: validated.userId,
      email: validated.email ?? "",
      authMethod: "api_key",
      permissions: validated.permissions,
    },
    rateLimit: {
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt,
    },
    rateLimited: !rateLimitResult.allowed,
  };
}

// ---------------------------------------------------------------------------
// Simplified API key auth for public v1 endpoints.
// Returns a flat object or null — caller handles rate-limit via headers.
// ---------------------------------------------------------------------------

export interface APIKeyAuth {
  userId: string;
  email: string;
  keyId: string;
  plan: string;
}

/**
 * Authenticate via API key for public /api/v1/* endpoints.
 *
 * Validates the key, updates last_used_at, checks rate limits, and
 * returns a flat auth payload with plan info. Returns null if the key
 * is invalid, inactive, or rate-limited.
 */
export async function authenticateAPIKey(
  request: Request,
): Promise<APIKeyAuth | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer bk_live_")) return null;

  const rawKey = authHeader.slice(7); // Remove "Bearer "
  const validated = await validateApiKey(rawKey);

  if (!validated.valid || !validated.userId) return null;

  // Enforce rate limit
  const rateLimitResult = await checkRateLimit(
    validated.keyHash!,
    validated.rateLimitPerMin!,
  );
  if (!rateLimitResult.allowed) return null;

  // Resolve user plan from app_users
  const { getSupabaseAdmin } = await import("./supabase");
  const supabase = getSupabaseAdmin();
  let plan = "free";
  let email = validated.email ?? "";

  if (supabase) {
    const { data: user } = await supabase
      .from("app_users")
      .select("email, plan")
      .eq("id", validated.userId)
      .maybeSingle();

    if (user) {
      email = user.email ?? email;
      plan = user.plan ?? "free";
    }
  }

  return {
    userId: validated.userId,
    email,
    keyId: validated.keyHash ?? "",
    plan,
  };
}
