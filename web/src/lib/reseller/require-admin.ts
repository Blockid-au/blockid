// Shared requireAdmin() middleware — replaces the ~20 inline copies of
//   `user.email === ADMIN_EMAIL || user.role === "admin"`
// scattered across /admin/*/route.ts and /api/admin/**/*.ts.
//
// Per docs/plans/reseller-module-plan.md § U.14 (P0 blocking consolidation)
// and § U.15.12 R-06 (CISO D3-CISO-06).
//
// Kept in web/src/lib/reseller/ during P0/P1 to co-locate with the module
// that introduced it; will be relocated to web/src/lib/auth-guards.ts in P8
// hardening. Consumers should import via the barrel so the move is
// non-breaking.

import "server-only";
import type { AppUser } from "@/lib/auth";
import { ADMIN_EMAIL } from "@/lib/auth";

export class AdminGateError extends Error {
  constructor(public code: "no_user" | "not_admin" = "not_admin", msg?: string) {
    super(msg ?? code);
    this.name = "AdminGateError";
  }
}

/** Returns true if the given user is admin by email OR role. */
export function isAdmin(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  if ((user.role ?? "") === "admin") return true;
  if ((user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) return true;
  return false;
}

/**
 * Throw AdminGateError if the user is not admin. Use as the first line of
 * every /admin/* route handler.
 *
 * NOTE (CISO D3-CISO-06): a reseller-role JWT with matching admin email
 * MUST NOT be treated as admin. Enforcement of reseller-role separation
 * lives in the session issuer; this guard only checks the resolved AppUser
 * fields as it always has.
 */
export function requireAdmin(user: AppUser | null | undefined): asserts user is AppUser {
  if (!user) throw new AdminGateError("no_user");
  if (!isAdmin(user)) throw new AdminGateError("not_admin");
}
