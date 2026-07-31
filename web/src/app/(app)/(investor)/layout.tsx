/**
 * (investor) persona layout — Master Upgrade Plan §16.5.
 *
 * Thin passthrough with a persona/plan hint. Investor-only surfaces
 * (deal flow, portfolio, LP export) are moved under this group in a
 * follow-up tick. Parent `(app)/layout.tsx` already enforces the
 * signed-in check; a persona guard is added here once the investor
 * pages actually live inside the group so we don't 302-loop empty
 * groups.
 */

import type { ReactNode } from "react";

export default function InvestorLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
