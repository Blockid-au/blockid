/**
 * Consolidated role taxonomy — single source of truth for the 6 canonical
 * blockid.au audience roles wired into the workspace shell.
 *
 * Downstream consumers:
 *   • Onboarding wizard   — routes a fresh signup to `landingHref`.
 *   • Workspace layout    — reads `menuGroupIds` to build the sidebar overlay
 *                           on top of NAV_GROUPS (see role-menu-overlay.ts).
 *   • Feature spotlight   — auto-launches the tour identified by `tourSlug`
 *                           on the role's landing page.
 *
 * Kept as pure data (no React, no fetch). The IDs in `menuGroupIds` MUST map
 * to entries in `web/src/components/workspace/nav-groups.ts:NAV_GROUPS[].id`
 * (or `ADMIN_NAV_GROUP.id`). New group IDs referenced here without a matching
 * NAV_GROUPS entry are treated as declared-for-next-phase and are surfaced by
 * the taxonomy test as a warning, not a hard failure.
 *
 * Consolidated from the 6 role designs in
 * docs/plans/role-based-2026-07-25/{founder,advisor,mentor,accelerator,
 * innovator,reseller}.md via 00-consolidated-taxonomy.md.
 */

export const ROLES = [
  "founder",
  "advisor",
  "mentor",
  "accelerator",
  "innovator",
  "reseller",
] as const;

export type Role = (typeof ROLES)[number];

export interface RoleSpec {
  /** Machine key — matches app_users.segment / account_type. */
  key: Role;
  /** Human-readable label for admin panels + role picker UIs. */
  label: string;
  /** The URL the role's first-run flow deposits the user on. Must start with '/'. */
  landingHref: string;
  /**
   * Ordered list of NAV_GROUPS[].id the role sees in the sidebar. First entry
   * is always "home". Order here is the desired top-of-sidebar order and is
   * what feeds `sidebarOrder` inside role-menu-overlay.ts.
   */
  menuGroupIds: string[];
  /** FeatureTourSlug that auto-launches on `landingHref`. */
  tourSlug: string;
}

export const ROLE_SPECS: Record<Role, RoleSpec> = {
  founder: {
    key: "founder",
    label: "Founder / Startup Member",
    landingHref: "/dashboard",
    menuGroupIds: [
      "home",
      "validate",
      "build",
      "fundraise",
      "scale-exit",
      "roles",
      "account",
    ],
    tourSlug: "founder-first-run",
  },

  advisor: {
    key: "advisor",
    label: "Independent Advisor",
    landingHref: "/dashboard/advisor",
    menuGroupIds: ["home", "roles", "build", "fundraise", "account"],
    tourSlug: "advisor-first-run",
  },

  mentor: {
    key: "mentor",
    label: "Program Mentor",
    landingHref: "/reseller/mentor",
    menuGroupIds: ["home", "roles", "account"],
    tourSlug: "mentor-first-run",
  },

  accelerator: {
    key: "accelerator",
    label: "Accelerator Program Manager",
    landingHref: "/workspace/accelerator",
    menuGroupIds: ["home", "roles", "fundraise", "scale-exit", "account"],
    tourSlug: "accelerator-first-run",
  },

  innovator: {
    key: "innovator",
    label: "Corporate Innovator",
    landingHref: "/innovator",
    // Corporate innovator lives entirely inside the /innovator/* console
    // (mirrors the reseller pattern), so the workspace sidebar surfaces
    // only Home, Roles and Account. The top-nav "Innovator" badge in
    // role-menu-overlay.ts is the 1-click bridge back to /innovator.
    menuGroupIds: ["home", "roles", "account"],
    tourSlug: "innovator-first-run",
  },

  reseller: {
    key: "reseller",
    label: "Reseller / Affiliate",
    landingHref: "/reseller",
    menuGroupIds: ["home", "roles", "account"],
    tourSlug: "reseller-first-run",
  },
};

/** Convenience: iterate specs in declared ROLES order. */
export function listRoleSpecs(): RoleSpec[] {
  return ROLES.map((r) => ROLE_SPECS[r]);
}

/** Look up a spec by string; returns undefined on unknown role. */
export function getRoleSpec(key: string): RoleSpec | undefined {
  return (ROLES as readonly string[]).includes(key)
    ? ROLE_SPECS[key as Role]
    : undefined;
}
