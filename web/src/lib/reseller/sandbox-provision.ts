// Pure helpers for reseller sandbox provisioning (P6.4).
//
// The sandbox is one hidden `projects` row per reseller org, owned by the
// invoking reseller-admin user, flagged with `reseller_sandbox_id`. It bypasses
// PLAN_PROJECT_LIMITS because the reseller org — not a customer subscription —
// owns the workspace. See docs/plans/reseller-module-plan.md § U.4 and
// migration web/supabase/migrations/0092_reseller_column_extensions.sql.
//
// Kept dependency-free so slug/name shape can be unit tested without a live DB.

export interface SandboxProvisionInput {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  user_id: string;
}

export interface SandboxProjectInsert {
  user_id: string;
  name: string;
  slug: string;
  description: string;
  is_default: false;
  reseller_sandbox_id: string;
}

/**
 * Derive the deterministic sandbox project row for a reseller. Slug is
 * prefixed with `reseller-sandbox-` so it cannot collide with a real
 * customer-facing project slug from `toSlug()` in web/src/lib/projects.ts,
 * which never emits that literal prefix on user input.
 */
export function buildSandboxProjectInsert(
  input: SandboxProvisionInput,
): SandboxProjectInsert {
  const codeSlug = input.reseller_code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "reseller";

  const displayName = input.reseller_display_name.trim() || input.reseller_code;

  return {
    user_id: input.user_id,
    name: `${displayName} Sandbox`,
    slug: `reseller-sandbox-${codeSlug}`,
    description:
      "Reseller org sandbox — credits spent inside this workspace draw from your monthly_credit_budget instead of a personal wallet.",
    is_default: false,
    reseller_sandbox_id: input.reseller_id,
  };
}

export type SandboxRoleGate = "owner" | "admin" | "viewer";

/**
 * Only owners and admins may provision the sandbox. Viewers get read-only
 * scope elsewhere; provisioning would create billable capacity so we lock it.
 */
export function canProvisionSandbox(role: SandboxRoleGate): boolean {
  return role === "owner" || role === "admin";
}
