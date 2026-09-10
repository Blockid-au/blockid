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
import { getCurrentUser } from "@/lib/auth";
import { getFounderNavContext } from "@/lib/nav/founder-phase";
import { FounderNavContextProvider } from "@/components/workspace/founder-nav-context";

export const dynamic = "force-dynamic";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  const nav = await getFounderNavContext(user);
  return <FounderNavContextProvider value={nav}>{children}</FounderNavContextProvider>;
}
