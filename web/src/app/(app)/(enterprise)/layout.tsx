/**
 * (enterprise) persona layout — Master Upgrade Plan §16.5.
 *
 * Thin passthrough. Enterprise-tier surfaces will move in as they
 * are built out (SSO admin, audit export, seat billing). Persona
 * guard follows the first physical move.
 */

import type { ReactNode } from "react";

export default function EnterpriseLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
