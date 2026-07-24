/**
 * Role → nav overlay resolver — ux-ia-startup-flow-v1 §C.6 (P6).
 *
 * The canonical sidebar catalogue lives in
 * `web/src/components/workspace/nav-groups.ts:NAV_GROUPS`. Segment gating
 * (`item.segments`, `group.segments`) already fires inside
 * `workspace-layout.tsx:resolveGroup()` and is sufficient for 80% of the
 * per-audience shaping. What we add here is the *overlay*:
 *
 *   • `hiddenGroups`  — groups to fully drop even when segment-gating would
 *     let them render (e.g. suppress the founder-oriented "Ownership &
 *     Equity" group for a plain `journalist` account).
 *   • `topNavExtras`  — extra top-bar CTAs for the workspace header (kept
 *     surgical — a single Link entry today, but the type allows more later).
 *   • `sidebarOrder`  — optional label ordering hint. When present, the
 *     resolver orders the resolved NAV_GROUPS to place these labels first;
 *     unlisted groups keep their catalogue order after them.
 *
 * Kept intentionally *additive* — no group definitions are duplicated here.
 * The layout applies the overlay as a filter/reorder step, so
 * NAV_GROUPS stays the single source of truth for icons + hrefs + gating.
 *
 * The union of "roles" accepted is `AccountType` from `@/lib/segments` (the
 * `app_users.account_type` column), plus a virtual `admin` value coming from
 * `user.role === "admin"`. The two are disjoint at the data layer (admin is
 * a *role*, not an account type) so this helper accepts both under a single
 * discriminated string.
 */

import type { AccountType, Segment } from "@/lib/segments";

// A user can be identified by their `app_users.account_type`, their
// `app_users.segment` (which overlaps AccountType but adds `lp`), or the
// virtual `admin` role. Accept the union so callers pass whatever they
// have without needing to map first.
export type RoleKey = AccountType | Segment | "admin";

export interface TopNavExtra {
  href: string;
  label: string;
  /** Short badge shown to the right of the label — e.g. "Console". Optional. */
  badge?: string;
  /** WCAG label if the visible text is a short glyph. */
  ariaLabel?: string;
}

export interface RoleMenuOverlay {
  /** Human-readable label of the role, for admin panels + debug telemetry. */
  roleLabel: string;
  /** Group labels (matching NAV_GROUPS[].label) to hide unconditionally. */
  hiddenGroups: string[];
  /** Extra top-bar link cluster shown next to the Demo/Notification icons. */
  topNavExtras: TopNavExtra[];
  /**
   * Ordering hint. Listed labels render first (in this order); everything
   * else keeps its catalogue order behind them. Labels not present in
   * NAV_GROUPS are ignored — makes the overlay safe to edit standalone.
   */
  sidebarOrder: string[];
}

/**
 * Default overlay — used for founders and any role that is not explicitly
 * remapped. Frozen so consumers can safely spread it without mutation risk.
 */
const DEFAULT_OVERLAY: RoleMenuOverlay = Object.freeze({
  roleLabel: "Founder",
  hiddenGroups: [],
  topNavExtras: [],
  sidebarOrder: [
    "Overview",
    "Build & Validate",
    "Ownership & Equity",
    "Fundraise",
    "Grow & Scale",
    "Account",
  ],
});

const ROLE_OVERLAY_TABLE: Record<RoleKey, RoleMenuOverlay> = {
  founder: DEFAULT_OVERLAY,

  // Angel + VC surfaces: hide founder-only *operational* clusters that would
  // never apply to an investor account (Build/Ownership/Grow); Fundraise
  // stays visible because angels/VCs also read Fundraise-status dashboards
  // when evaluating deals. The Investor group is segment-gated in
  // NAV_GROUPS so it renders automatically — we just reorder it to the top.
  investor_angel: {
    roleLabel: "Angel investor",
    hiddenGroups: ["Build & Validate", "Ownership & Equity", "Grow & Scale"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Investor", "Fundraise", "Account"],
  },
  investor_vc: {
    roleLabel: "VC investor",
    hiddenGroups: ["Build & Validate", "Ownership & Equity", "Grow & Scale"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Investor", "Fundraise", "Account"],
  },

  advisor: {
    roleLabel: "Advisor",
    hiddenGroups: ["Build & Validate", "Grow & Scale"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Advisor", "Ownership & Equity", "Fundraise", "Account"],
  },

  accelerator: {
    roleLabel: "Accelerator",
    hiddenGroups: ["Build & Validate", "Ownership & Equity"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Accelerator", "Fundraise", "Grow & Scale", "Account"],
  },
  // Incubators use the same shape as accelerators for now — the app has no
  // dedicated Incubator NAV_GROUP yet, so we alias to the accelerator layout
  // and let the segment filter render whatever is scoped.
  incubator: {
    roleLabel: "Incubator",
    hiddenGroups: ["Build & Validate", "Ownership & Equity"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Accelerator", "Fundraise", "Grow & Scale", "Account"],
  },

  reseller: {
    roleLabel: "Reseller",
    hiddenGroups: ["Build & Validate", "Ownership & Equity", "Fundraise", "Grow & Scale"],
    // Reseller console lives at /reseller — the sidebar has a Reseller
    // group already (feature-gated), but the top-bar extra makes the
    // console 1-click from any page.
    topNavExtras: [
      { href: "/reseller", label: "Reseller", badge: "Console" },
    ],
    sidebarOrder: ["Overview", "Reseller", "Account"],
  },

  journalist: {
    roleLabel: "Journalist",
    // Journalists get a stripped, read-only shell — Overview + Account only.
    // The Investor/Advisor/Accelerator/Reseller groups are segment-gated so
    // they never render for this account_type anyway; we hide founder ops
    // explicitly to keep the sidebar to two buckets.
    hiddenGroups: ["Build & Validate", "Ownership & Equity", "Fundraise", "Grow & Scale"],
    topNavExtras: [],
    sidebarOrder: ["Overview", "Account"],
  },
  // affiliate + investor (legacy) — inherit default.
  affiliate: DEFAULT_OVERLAY,
  investor: DEFAULT_OVERLAY,
  lp: DEFAULT_OVERLAY,

  admin: {
    roleLabel: "Admin",
    hiddenGroups: [],
    topNavExtras: [
      { href: "/admin", label: "Admin", ariaLabel: "Admin control panel" },
    ],
    sidebarOrder: [
      "Overview",
      "Build & Validate",
      "Ownership & Equity",
      "Fundraise",
      "Grow & Scale",
      "Investor",
      "Advisor",
      "Accelerator",
      "Reseller",
      "Admin",
      "Account",
    ],
  },
};

/**
 * Resolve the overlay for a workspace user.
 *
 * @param user - the shape passed to `WorkspaceLayout`. `role === "admin"`
 *   short-circuits to the admin overlay; otherwise `segment` (from
 *   `app_users.segment`) selects the audience overlay; finally we fall
 *   back to `accountType` (a broader label) and then the default.
 */
export function getMenuOverlayForRole(user: {
  role?: string | null;
  segment?: string | null;
  accountType?: string | null;
}): RoleMenuOverlay {
  if (user.role === "admin") return ROLE_OVERLAY_TABLE.admin;
  const key = (user.segment || user.accountType) as RoleKey | undefined;
  if (key && Object.prototype.hasOwnProperty.call(ROLE_OVERLAY_TABLE, key)) {
    return ROLE_OVERLAY_TABLE[key];
  }
  return DEFAULT_OVERLAY;
}

/**
 * Utility — apply an overlay to a list of resolved sidebar groups. Kept
 * standalone (no React) so it is unit-testable and reusable by mobile nav
 * + command palette. Returns a new array; input is not mutated.
 */
export function applySidebarOverlay<G extends { label: string }>(
  groups: G[],
  overlay: RoleMenuOverlay,
): G[] {
  const hidden = new Set(overlay.hiddenGroups);
  const kept = groups.filter((g) => !hidden.has(g.label));
  if (overlay.sidebarOrder.length === 0) return kept;
  const rank = new Map<string, number>();
  overlay.sidebarOrder.forEach((label, i) => rank.set(label, i));
  // Stable sort: prefer explicit rank; unranked groups fall to the end
  // in their original catalogue order.
  return [...kept].sort((a, b) => {
    const ra = rank.has(a.label) ? rank.get(a.label)! : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.label) ? rank.get(b.label)! : Number.POSITIVE_INFINITY;
    return ra - rb;
  });
}
