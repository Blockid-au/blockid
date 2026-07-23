// Audit-log manifest — single source of truth for which mutation routes MUST
// invoke `logUserAction` on success. Iteration-16 DX #2 (from survey pass 9).
//
// Mirrors the CISO `feature-gates.manifest.ts` pattern (§ P8.1) but for the
// SOC2-lite audit trail (Iteration-12 T5). When a new mutation route ships,
// its `{route, method, action, subject_type}` row goes here — CI (npm run
// lint:audit) then enforces that either (a) the route imports `logUserAction`,
// or (b) it carries an explicit `// audit-exempt: <reason>` pragma.
//
// This file is import-safe (types only, no runtime deps) so both the vitest
// suite and the plain-node CLI walker can read it.
//
// Extending the manifest is additive: adding a new row cannot break existing
// tests. Removing a row only breaks the CI lint if the underlying route file
// still has a mutation handler and no exemption pragma — which is exactly the
// drift signal we want.

export type HttpMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface AuditManifestEntry {
  /** Route path relative to web/src/app — e.g. "api/projects/route.ts" */
  route: string;
  /** HTTP verb of the handler wired to logUserAction */
  method: HttpMethod;
  /** `action` string persisted to app_user_audit_log.action */
  action: string;
  /** `subject_type` string persisted to app_user_audit_log.subject_type */
  subject_type: string;
  /** Optional note explaining the entry */
  note?: string;
}

/**
 * Every mutation route currently wired to `logUserAction`. One row per
 * `{route, method}` pair — a single route.ts may appear multiple times if
 * it exports several mutation handlers.
 *
 * When adding a new row, keep the actions dot-namespaced (`<domain>.<verb>`)
 * so downstream reporting can group cleanly.
 */
export const AUDIT_MANIFEST: readonly AuditManifestEntry[] = Object.freeze([
  // Wave 1 — Iteration-12 T5 (6bba689e)
  {
    route: "api/projects/route.ts",
    method: "POST",
    action: "project.create",
    subject_type: "project",
  },
  {
    route: "api/projects/[id]/route.ts",
    method: "DELETE",
    action: "project.archive",
    subject_type: "project",
  },
  {
    route: "api/stripe/checkout/route.ts",
    method: "POST",
    action: "stripe.checkout.create",
    subject_type: "stripe_session",
  },

  // Wave 2 — projects mutation coverage (e3ef49d9)
  {
    route: "api/projects/[id]/route.ts",
    method: "PATCH",
    action: "project.updated",
    subject_type: "project",
  },
  {
    route: "api/projects/[id]/members/route.ts",
    method: "POST",
    action: "project.member.invited",
    subject_type: "project_member",
  },
  {
    route: "api/projects/[id]/members/route.ts",
    method: "DELETE",
    action: "project.member.revoked",
    subject_type: "project_member",
  },
  {
    route: "api/projects/members/accept/route.ts",
    method: "POST",
    action: "project.member.accepted",
    subject_type: "project_member",
  },

  // Wave 3 — Stripe lifecycle + API keys (efe7db97)
  {
    route: "api/stripe/change-plan/route.ts",
    method: "POST",
    action: "stripe.plan.changed",
    subject_type: "stripe_subscription",
  },
  {
    route: "api/stripe/cancel/route.ts",
    method: "POST",
    action: "stripe.subscription.canceled",
    subject_type: "stripe_subscription",
  },
  {
    route: "api/stripe/reactivate/route.ts",
    method: "POST",
    action: "stripe.subscription.reactivated",
    subject_type: "stripe_subscription",
  },
  {
    route: "api/keys/route.ts",
    method: "POST",
    action: "api_key.created",
    subject_type: "api_key",
  },
  {
    route: "api/keys/[id]/route.ts",
    method: "DELETE",
    action: "api_key.revoked",
    subject_type: "api_key",
  },
]);

/**
 * Routes for which `logUserAction` MUST fire on the success path. Derived
 * from AUDIT_MANIFEST — kept as its own export so the CLI walker (plain
 * .mjs, no tsx) can read it via regex without evaluating the manifest.
 *
 * The CI lint (npm run lint:audit) treats every route.ts file NOT in this
 * list as opt-in-only: it can still call logUserAction, but the lint won't
 * fail if it doesn't. Files IN this list must either import `logUserAction`
 * or carry a `// audit-exempt: <reason>` pragma.
 */
export const AUDIT_REQUIRED_ROUTES: readonly string[] = Object.freeze(
  [...new Set(AUDIT_MANIFEST.map((e) => e.route))].sort(),
);

/** HTTP verbs that count as "mutation" for the audit-drift lens. */
export const AUDIT_MUTATION_METHODS: readonly HttpMethod[] = Object.freeze([
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
]);

/** Look up manifest entries for a route path. Returns [] if unlisted. */
export function auditEntriesFor(route: string): AuditManifestEntry[] {
  return AUDIT_MANIFEST.filter((e) => e.route === route);
}

/** Look up the manifest entry for a specific `{route, method}` pair. */
export function auditEntryFor(
  route: string,
  method: HttpMethod,
): AuditManifestEntry | null {
  return (
    AUDIT_MANIFEST.find((e) => e.route === route && e.method === method) ?? null
  );
}
