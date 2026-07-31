/**
 * (admin) persona layout — Master Upgrade Plan §16.5.
 *
 * Thin passthrough. The moved `admin/layout.tsx` inside the subtree
 * already applies `robots: noindex` metadata and the app-wide auth
 * gate lives in `(app)/layout.tsx`. Admin-role enforcement (checking
 * `user.role === "admin"`) is done at the individual admin page
 * boundary today; centralising it here is a follow-up (needs a
 * shared audit-safe redirect target first).
 */

import type { ReactNode } from "react";

export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
