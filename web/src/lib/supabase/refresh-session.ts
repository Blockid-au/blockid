/**
 * refresh-session — middleware helper that refreshes a Supabase JWT
 * (via `@supabase/ssr`) and injects three privacy-preserving request
 * headers that downstream RSCs can read.
 *
 * Master Upgrade Plan §8.9 stage 2. Contract:
 *
 *   1. If no Supabase auth cookie is present → pass through, no
 *      headers injected. (Cheap, no network call.)
 *   2. If a cookie is present, call `supabase.auth.getUser()`:
 *      - success → inject `x-blockid-user-id`, hashed prefix into
 *        `x-blockid-user-email`, and `x-blockid-session-fresh`.
 *        The ssr client transparently refreshes the JWT if it was
 *        expired and writes the new cookies onto the response.
 *      - failure (network, invalid token, unrefreshable, etc.) →
 *        log a warning and pass through with no headers. NEVER sign
 *        the user out silently.
 *   3. Service-role callers (identified by an `x-blockid-service`
 *      header the internal cron sets) skip the refresh entirely.
 *
 * The heavy lifting — cookie plumbing, envs — lives in
 * `getMiddlewareClient()`. This module is pure enough to unit-test.
 */

import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const HEADER_USER_ID = "x-blockid-user-id";
export const HEADER_USER_EMAIL = "x-blockid-user-email";
export const HEADER_SESSION_FRESH = "x-blockid-session-fresh";
export const HEADER_SERVICE_BYPASS = "x-blockid-service";

const SUPABASE_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;
const LEGACY_COOKIE_NAMES = ["sb-access-token", "sb:token"];

/**
 * True if any cookie that could carry a Supabase session is present
 * on the request. Cheap, no JWT validation.
 */
export function hasSupabaseAuthCookie(req: NextRequest): boolean {
  for (const name of LEGACY_COOKIE_NAMES) {
    if (req.cookies.get(name)?.value) return true;
  }
  for (const c of req.cookies.getAll()) {
    if (SUPABASE_AUTH_COOKIE_RE.test(c.name) && c.value.length > 0) return true;
  }
  return false;
}

/**
 * Hash-prefix an email so downstream code can correlate requests to
 * an identity without receiving the plaintext address. 12 hex chars
 * (~48 bits) is enough to distinguish real users but not enough to
 * brute-force back to the address in a leaked log.
 */
export function hashEmailPrefix(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);
}

/**
 * Inject the three identity headers onto BOTH the request (so
 * downstream Route Handlers in the same middleware chain can read
 * them via `headers()`) and the response (belt-and-braces for
 * services that echo request headers back).
 */
export function injectUserHeaders(
  request: NextRequest,
  response: NextResponse,
  user: Pick<User, "id" | "email">,
): void {
  request.headers.set(HEADER_USER_ID, user.id);
  response.headers.set(HEADER_USER_ID, user.id);
  if (user.email) {
    const hashed = hashEmailPrefix(user.email);
    request.headers.set(HEADER_USER_EMAIL, hashed);
    response.headers.set(HEADER_USER_EMAIL, hashed);
  }
  request.headers.set(HEADER_SESSION_FRESH, "1");
  response.headers.set(HEADER_SESSION_FRESH, "1");
}

/**
 * The refresh entry point. Callers pass a factory that constructs a
 * middleware-scoped Supabase client (so tests can stub without
 * requiring @supabase/ssr envs).
 */
export interface RefreshDeps {
  clientFactory: (req: NextRequest, res: NextResponse) => SupabaseClient | null;
  logger?: (msg: string, err?: unknown) => void;
}

export interface RefreshResult {
  outcome:
    | "no-cookie"
    | "no-client"
    | "service-bypass"
    | "header-injected"
    | "no-user"
    | "error";
  userId?: string;
}

export async function refreshSessionAndInjectHeaders(
  request: NextRequest,
  response: NextResponse,
  deps: RefreshDeps,
): Promise<RefreshResult> {
  const log = deps.logger ?? ((msg: string, err?: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[sso/refresh] ${msg}`, err ?? "");
  });

  // Service-role internal callers (cron, worker) bypass entirely —
  // they never have a user session and paying the ssr cost is waste.
  if (request.headers.get(HEADER_SERVICE_BYPASS) === "1") {
    return { outcome: "service-bypass" };
  }

  if (!hasSupabaseAuthCookie(request)) {
    return { outcome: "no-cookie" };
  }

  const supabase = deps.clientFactory(request, response);
  if (!supabase) {
    // Envs not configured — nothing to refresh, but the cookie is
    // still present (legacy install). Pass through without a header.
    return { outcome: "no-client" };
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      log("supabase.auth.getUser returned error", error);
      return { outcome: "error" };
    }
    if (!data?.user) {
      return { outcome: "no-user" };
    }
    injectUserHeaders(request, response, data.user);
    return { outcome: "header-injected", userId: data.user.id };
  } catch (err) {
    log("supabase.auth.getUser threw", err);
    return { outcome: "error" };
  }
}
