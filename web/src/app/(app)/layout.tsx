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
  const client = await getServerAnonClient();
  let signedIn = false;
  if (client) {
    const { data } = await client.auth.getUser();
    if (data?.user) signedIn = true;
  }
  if (!signedIn) {
    const legacy = await getCurrentUser();
    if (legacy) signedIn = true;
  }

  if (!signedIn) {
    // Preserve the caller's original URL so post-login redirect returns
    // them to the page they asked for.
    let next = "/dashboard";
    try {
      const h = await headers();
      next = h.get("x-pathname") ?? h.get("x-invoke-path") ?? next;
    } catch {
      // headers() may be unavailable during static prerender — ignore.
    }
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return <>{children}</>;
}
