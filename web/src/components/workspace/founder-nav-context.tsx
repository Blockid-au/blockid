"use client";

// S7-A (G8 follow-up) — client bridge for the founder nav phase.
//
// `(app)/(founder)/layout.tsx` resolves the founder's nav phase server-side
// (`getFounderNavContext()` in `lib/nav/founder-phase.ts`) and mounts this
// provider once, so every `<WorkspaceLayout>` under the founder route group
// gates its sidebar on the same 0..5 number whether or not the page passed
// `currentPhase` itself. Fallback order (pinned by founder-phase.test.ts):
//
//   explicit `currentPhase` prop  >  this context  >  0
//
// Only the plain-data value crosses the server → client boundary; the
// resolver itself is never imported here.

import * as React from "react";
import {
  EMPTY_FOUNDER_NAV_CONTEXT,
  pickNavPhase,
  type FounderNavContextValue,
} from "@/lib/nav/founder-phase";

const FounderNavContext = React.createContext<FounderNavContextValue | null>(null);

export function FounderNavContextProvider({
  value,
  children,
}: {
  value: FounderNavContextValue | null | undefined;
  children: React.ReactNode;
}) {
  const stable = React.useMemo<FounderNavContextValue>(
    () => value ?? EMPTY_FOUNDER_NAV_CONTEXT,
    [value],
  );
  return <FounderNavContext.Provider value={stable}>{children}</FounderNavContext.Provider>;
}

/** `null` outside the founder route group (reseller / compliance shells). */
export function useFounderNavContext(): FounderNavContextValue | null {
  return React.useContext(FounderNavContext);
}

/** Resolved sidebar phase: prop > founder context > 0. */
export function useResolvedNavPhase(prop: number | null | undefined): number {
  const ctx = React.useContext(FounderNavContext);
  return pickNavPhase(prop, ctx?.navPhase);
}
