/**
 * TierGate — server component that renders `children` iff the user's tier
 * covers `minTier`; renders null otherwise.
 *
 * v3 §16.4 pass-through — the parent already has a resolved PlanTier
 * (from getCurrentUserTier or similar), so this is a small, no-fanfare
 * gate for wrapping page fragments (a cap-table widget, a report
 * download button) whose presence should follow the same hide-not-teaser
 * rule as the sidebar.
 *
 * Contrast with UpgradeChip: TierGate hides silently; UpgradeChip shows
 * a "why can't I see this?" nudge for deep-linked pages.
 *
 * No tests — trivial pass-through logic covered by tierCovers.
 */

import type { ReactNode } from "react";

import { tierCovers } from "@/lib/entitlements/tier-ladder";
import type { PlanTier } from "@/lib/segments";

export interface TierGateProps {
  tier: PlanTier | null | undefined;
  minTier: PlanTier;
  children: ReactNode;
}

export function TierGate({
  tier,
  minTier,
  children,
}: TierGateProps): React.JSX.Element | null {
  if (!tierCovers(tier, minTier)) return null;
  return <>{children}</>;
}
