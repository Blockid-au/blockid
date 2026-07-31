/**
 * server-anon — anon-key Supabase client with SSR cookie plumbing.
 *
 * Master Upgrade Plan §8.9 stage 2 (cross-marketing↔app SSO): unlike
 * `lib/supabase.ts` (service-role, bypasses RLS, no session), this
 * module produces a *user-scoped* client that reads / writes the
 * standard Supabase auth cookies via `@supabase/ssr`. That is what
 * lets middleware refresh an expired JWT and lets RSCs know who the
 * caller is (subject to RLS).
 *
 * Two factories are exported:
 *
 *   - `getServerAnonClient()` — for use inside RSCs / server actions
 *     via `next/headers`' `cookies()`. Session refreshes attempt to
 *     write cookies back through the RSC cookie jar; when Next.js
 *     forbids that (component tree already flushed) the writes are
 *     silently discarded — middleware handles the durable refresh.
 *
 *   - `getMiddlewareClient(request, response)` — for use inside the
 *     root `middleware.ts`. Reads cookies from the incoming request
 *     and writes refreshed cookies onto the outgoing response so the
 *     client's next request has fresh tokens.
 *
 * Both return `null` when the anon envs are unset (mirroring
 * `getSupabaseAdmin()` so tests + local dev without secrets don't
 * crash on import).
 */

import "server-only";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROD_COOKIE_DOMAIN = ".blockid.au";

export function isSupabaseAnonConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function baseCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const opts: CookieOptions = {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: isProd,
  };
  if (isProd) {
    // Apex-domain cookie so /dashboard, /workspace and marketing (/)
    // — all served from blockid.au (and future app.blockid.au) —
    // share one SSO session.
    opts.domain = PROD_COOKIE_DOMAIN;
  }
  return opts;
}

/**
 * Server (RSC / route handler / server action) anon client. Uses the
 * `next/headers` cookie jar for reads *and* writes. Writes may be
 * ignored by Next.js at the RSC boundary — middleware performs the
 * authoritative refresh.
 */
export async function getServerAnonClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseAnonConfigured()) return null;
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return jar.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          try {
            const base = baseCookieOptions();
            for (const { name, value, options } of cookiesToSet) {
              jar.set({ name, value, ...base, ...options });
            }
          } catch {
            // RSCs cannot mutate cookies once the tree has started
            // streaming. Ignore — middleware writes the durable copy.
          }
        },
      },
    },
  );
}

/**
 * Middleware anon client. Reads request cookies and writes refreshed
 * cookies onto BOTH the request (so downstream code in the same
 * middleware invocation sees the fresh token) and the response (so
 * the browser stores them).
 */
export function getMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
): SupabaseClient | null {
  if (!isSupabaseAnonConfigured()) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies
            .getAll()
            .map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          const base = baseCookieOptions();
          for (const { name, value, options } of cookiesToSet) {
            // Mirror onto the request so any subsequent read within
            // this middleware sees the refreshed value.
            request.cookies.set(name, value);
            response.cookies.set({
              name,
              value,
              ...base,
              ...(options as CookieOptions),
            });
          }
        },
      },
    },
  );
}
