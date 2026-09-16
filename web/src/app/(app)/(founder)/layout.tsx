/**
 * (founder) persona layout — Master Upgrade Plan §16.5 + S7-A (G8 follow-up).
 *
 * Founder pages (dashboard, workspace, checkout, onboarding) mount
 * `WorkspaceLayout` from within their own page trees, so this layout adds
 * NO chrome of its own (double-wrapping the shell would double-render the
 * nav). What it does add is the ONE founder nav phase: it resolves
 * max(SVI band, growth phase) server-side once per request and publishes
 * it through `FounderNavContextProvider`, so every sidebar under this
 * group gates on the same 0..5 number whether or not the page passes
 * `currentPhase` itself. See `web/src/lib/nav/founder-phase.ts`.
 *
 * Auth is enforced by the parent `(app)/layout.tsx`. The loader is
 * non-fatal — no session / no project / no DB → phase 0 (the pre-S7-A
 * default), never a 500.
 */

import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFounderNavContext } from "@/lib/nav/founder-phase";
import { FounderNavContextProvider } from "@/components/workspace/founder-nav-context";
import { landingHrefFor, personaLandingEnabled } from "@/lib/auth/post-login";
import { resolvePersonaForUser } from "@/lib/nav/persona-server";
import { isEvaluatorPersona } from "@/lib/nav/persona";

export const dynamic = "force-dynamic";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);

  // G13-W4-IA4 persona redirect (§C.1) lives HERE, not only in
  // dashboard/page.tsx: `dashboard/loading.tsx` puts the page behind a
  // Suspense boundary, so a `redirect()` thrown by the page arrives after the
  // shell has streamed and Next downgrades it to a client-side redirect via an
  // inline <script> — which the nonce CSP blocks (12 console errors and the
  // landing rendered under /dashboard on 2026-09-16). The layout resolves
  // before the shell is sent, so this one is a real 307.
  if (user && personaLandingEnabled()) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      const persona = await resolvePersonaForUser(user);
      if (isEvaluatorPersona(persona)) redirect(landingHrefFor(persona));
    }
  }

  const nav = await getFounderNavContext(user);
  return <FounderNavContextProvider value={nav}>{children}</FounderNavContextProvider>;
}
