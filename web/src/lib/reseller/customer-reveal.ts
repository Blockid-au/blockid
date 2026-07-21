// Reveal-email guard for the reseller console customer list.
//
// Per docs/plans/reseller-module-plan.md § C.1.2 + § H.10 resolution:
// "masked in list; reveal-on-click logs to reseller_audit_log".
//
// Pure decision helpers so the route handler stays thin and the invariants
// (uuid shape + membership in the scoped allowedCustomerIds set) are
// exercised in unit tests without hitting Supabase.

export type RevealDecision =
  | { ok: true; customerId: string }
  | { ok: false; reason: "missing_id" | "invalid_id" | "not_in_scope" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decideReveal(customerId: unknown, allowedIds: string[]): RevealDecision {
  if (typeof customerId !== "string" || customerId.length === 0) {
    return { ok: false, reason: "missing_id" };
  }
  if (!UUID_RE.test(customerId)) {
    return { ok: false, reason: "invalid_id" };
  }
  if (!allowedIds.includes(customerId)) {
    return { ok: false, reason: "not_in_scope" };
  }
  return { ok: true, customerId };
}

/**
 * Deterministic mask matching the server-render at
 * web/src/app/reseller/customers/page.tsx so the client-side "revealed →
 * mask" toggle produces the same string as the initial SSR paint.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? "•"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
