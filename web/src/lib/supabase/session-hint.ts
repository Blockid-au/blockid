/**
 * session-hint — cheap server-side hint of whether the requester is
 * signed in, without validating the JWT.
 *
 * Master Upgrade Plan §8.9 (persistent SSO): the marketing hero swaps
 * its primary CTA from "Create Your Business ID" (signed-out) to
 * "Continue to your Business ID" (signed-in). To do that on a Server
 * Component render we need to know the session status BEFORE calling
 * out to Supabase — this file reads the Supabase auth cookies directly
 * and returns a boolean hint.
 *
 * Contract:
 *   - `readSignedInHint()` returns `true` iff any known Supabase auth
 *     cookie is present. It does NOT verify the JWT.
 *   - If a stale/expired cookie is passed the downstream (app) route
 *     performs the real auth check via `supabase.auth.getUser(token)`
 *     and bounces to /login. The worst-case UI cost is that a
 *     signed-out user with a leftover cookie sees "Continue to your
 *     Business ID" for one click; safer than validating on every
 *     marketing render.
 *
 * Cookies we treat as a signed-in signal (both new and legacy names,
 * matching the sniff in [web/middleware.ts]):
 *   - sb-access-token
 *   - sb:token
 *   - anything matching /^sb-.*-auth-token$/  (Supabase SSR helper style)
 */

import { cookies } from "next/headers";

const KNOWN_COOKIE_NAMES = ["sb-access-token", "sb:token"];
const SUPABASE_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;

export async function readSignedInHint(): Promise<boolean> {
  const jar = await cookies();
  for (const name of KNOWN_COOKIE_NAMES) {
    const v = jar.get(name)?.value;
    if (v && v.length > 0) return true;
  }
  for (const c of jar.getAll()) {
    if (SUPABASE_AUTH_COOKIE_RE.test(c.name) && c.value.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * The route the signed-in CTA should target. Kept centralised so a
 * later change (e.g. deep-link to `/app/business/{primaryBusinessId}`
 * once we know the primary business) touches one file.
 */
export const SIGNED_IN_LANDING_HREF = "/dashboard";
