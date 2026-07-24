/**
 * AtlassianWalkthroughProvider — server component wrapper that mirror pages
 * use to plug into the demo walkthrough shell.
 *
 * Usage from a mirror page:
 *   ```tsx
 *   export default function DashboardMirrorPage() {
 *     return (
 *       <AtlassianWalkthroughProvider stepNumber={2}>
 *         <AtlassianDashboardMirror />
 *       </AtlassianWalkthroughProvider>
 *     );
 *   }
 *   ```
 *
 * The provider is a plain server component — it does not read cookies, hit
 * Supabase, or do any I/O. It resolves the step from the static walkthrough
 * registry and renders the client shell.
 */

import type { ReactNode } from "react";
import {
  ATLASSIAN_WALKTHROUGH_TOTAL,
  getStepByNumber,
} from "@/lib/showcase/atlassian/steps";
import { DemoWalkthroughShell } from "@/components/showcase/demo-walkthrough-shell";

export interface AtlassianWalkthroughProviderProps {
  /** 1-indexed step number for the current mirror page. */
  stepNumber: number;
  children: ReactNode;
}

export function AtlassianWalkthroughProvider({
  stepNumber,
  children,
}: AtlassianWalkthroughProviderProps) {
  // Defensive: an out-of-range step still renders the page — the shell
  // itself no-ops rather than throwing.
  const step = getStepByNumber(stepNumber);
  if (!step) {
    return <>{children}</>;
  }
  return (
    <DemoWalkthroughShell
      currentStep={stepNumber}
      totalSteps={ATLASSIAN_WALKTHROUGH_TOTAL}
      brand="atlassian"
    >
      {children}
    </DemoWalkthroughShell>
  );
}
