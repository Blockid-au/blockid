/**
 * (founder) persona layout — Master Upgrade Plan §16.5.
 *
 * Thin passthrough for now. Founder pages (dashboard, workspace,
 * checkout, onboarding) already mount `WorkspaceLayout` from within
 * their own page trees, so this layout only exists to establish the
 * route-group boundary. Persona-specific chrome (e.g. founder-only
 * nav badges, coaching banners) can slot in here later without
 * touching the moved pages.
 *
 * Auth is enforced by the parent `(app)/layout.tsx` — no need to
 * re-check the session here.
 */

import type { ReactNode } from "react";

export default function FounderLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
