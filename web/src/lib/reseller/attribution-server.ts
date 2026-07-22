// Server-only reseller attribution helpers. Split from attribution.ts
// because that file is imported by client components (billing-client.tsx
// via share-mgmt-drawer.tsx) and webpack refuses `node:crypto` in the
// client bundle.
//
// See docs/plans/reseller-module-plan.md § C.2 / U.6.

import { createHash } from "node:crypto";
import { normaliseResellerCode } from "./attribution";

/**
 * Stable short hash of a reseller code, used for `client_reference_id` on
 * Stripe Checkout Sessions. Stripe truncates client_reference_id at ~200
 * chars but keeping it compact aids grep. Server-only.
 */
export function viaClientReferenceId(code: string): string {
  const clean = normaliseResellerCode(code);
  if (!clean) throw new Error("viaClientReferenceId: invalid code");
  const short = createHash("sha256").update(clean).digest("hex").slice(0, 8);
  return `reseller_attribution:${clean}:${short}`;
}
