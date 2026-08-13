/**
 * (app) route-group layout — Master Upgrade Plan §16.5.
 *
 * Gates every authenticated surface (founder workspace, investor
 * portal, accelerator console, reseller console, enterprise admin,
 * site admin) behind a signed-in-user check. Anonymous callers are
 * bounced to /auth/login with `next=` preserving their original URL.
 *
 * Deliberately does NOT wrap children in `WorkspaceLayout` — the
 * moved pages (dashboard, workspace, reseller, admin, …) already
 * mount their own shells (WorkspaceLayout for founder pages, a
 * minimal shell for reseller, a chrome-free layout for admin). Adding
 * the shell here would double-render nav and break spacing. Persona
 * sub-layouts (`(founder)/layout.tsx` etc.) may add persona-specific
 * chrome once the physical moves settle.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getServerAnonClient } from "@/lib/supabase/server-anon";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Prefer the Supabase anon session (SSO cookie) but fall back to the
  // legacy `sessions` table via getCurrentUser — both auth systems are
  // in flight (§8.9). Either one being present = signed in.
  //
  // The Supabase probe is wrapped in try/catch because `auth.getUser()`
  // in @supabase/ssr may THROW (not just return `{data:{user:null}}`)
  // when it hits stale/rotated `sb-*-auth-token` cookies whose refresh
  // path errors — a very common shape for reseller-provisioned accounts
  // that were originally magic-linked before password auth landed. A
  // thrown error inside a Server Component layout crashes the render,
  // which the browser sees as a failed navigation → the user bounces
  // back to /auth/login and thinks the session didn't stick. Swallow
  // the throw and fall through to the legacy `blockid_session` check
  // so a stale Supabase cookie can never invalidate a live custom
  // session.
  let signedIn = false;
  try {
    const client = await getServerAnonClient();
    if (client) {
      const { data } = await client.auth.getUser();
      if (data?.user) signedIn = true;
    }
  } catch {
    // Fall through to the legacy check below — never let a Supabase
    // client error kill the authenticated layout for a user whose
    // `blockid_session` is perfectly valid.
  }
  if (!signedIn) {
    const legacy = await getCurrentUser();
    if (legacy) signedIn = true;
  }

  if (!signedIn) {
    // Preserve the caller's original URL so post-login redirect returns
    // them to the page they asked for. `x-pathname` is stamped by
    // middleware.ts (Server Components cannot otherwise see the URL);
    // it carries path + search so deep links keep their query params.
    let next = "/dashboard";
    try {
      const h = await headers();
      const seen = h.get("x-pathname") ?? h.get("x-invoke-path");
      // Only accept a same-origin absolute path, and never point back at
      // an auth route — that would bounce the user in a loop.
      if (
        seen &&
        seen.startsWith("/") &&
        !seen.startsWith("//") &&
        !seen.startsWith("/auth/")
      ) {
        next = seen;
      }
    } catch {
      // headers() may be unavailable during static prerender — ignore.
    }
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return <>{children}</>;
}
