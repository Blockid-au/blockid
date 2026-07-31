/**
 * (reseller) persona layout — Master Upgrade Plan §16.5.
 *
 * Thin passthrough. The existing per-route `reseller/layout.tsx`
 * inside the moved subtree already handles the `reseller.console`
 * entitlement gate and mounts the reseller shell — we keep that as
 * the source of truth to avoid duplicating the check. This layout
 * just marks the route-group boundary.
 */

import type { ReactNode } from "react";

export default function ResellerGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
