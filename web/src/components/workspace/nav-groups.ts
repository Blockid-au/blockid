// Workspace sidebar nav-group catalogue.
//
// Extracted verbatim from workspace-layout.tsx so that (a) the layout stays
// focused on rendering and (b) other surfaces (mobile nav, command-palette,
// deep-link resolver) can import the same source of truth.
//
// Since 2026-07-24 (docs/plans/tier-menu-2026-07-24/01-cpo-menu-nest.md) the
// catalogue is nested — top-level groups own optional `subgroups` (Ideate
// -> Validate -> Build -> Fundraise -> Scale & Exit -> Roles -> Account),
// and the legacy flat `items[]` at group level is a concatenation of all
// subgroup items so pre-nested renderers (workspace-layout's pillar
// renderer) keep working while the new `nested-sidebar.tsx` reads
// `subgroups` directly.
//
// Each NavLeaf carries optional gates evaluated by the sidebar:
//   • minPhase      — legacy 0..5 lifecycle phase. Lower phases render dimmed.
//   • growthPhase   — 6-bucket workflow-step phase (see workflow-steps.ts).
//   • minPlan       — required PlanTier. Failing items render grayed-out + lock.
//   • minTier       — alias for minPlan (preferred name in the nested schema).
//   • segments      — audience filter. Wrong audience ⇒ fully hidden.
//   • feature       — entitlement flag consulted through useEntitlement().can().
//   • requiredFeature — alias for feature (preferred name in the nested schema).
//   • lifecycle     — beta/live/stable badge chip.

import type { LucideIcon } from "lucide-react";
import {
  Activity, Archive, Banknote, BarChart3, Bell, BookOpen, Briefcase, Calendar, CreditCard,
  DollarSign, DoorOpen, ExternalLink, FileText, FolderCheck, FolderOpen, Gift,
  LineChart, Link2, Map, Palette, PieChart, Rocket, Share2, Shield, ShieldCheck, Table2,
  Target, TrendingUp, User, Users, Wand2, Wallet, Zap,
  ClipboardList, Eye, Layers, Settings2, MessageSquare, Send, Building2,
  ClipboardCheck, FileBarChart, Handshake, LayoutDashboard, Tag, Coins, Plug,
  Inbox, GraduationCap, LayoutGrid,
} from "lucide-react";

import type { PlanTier, Segment } from "@/lib/segments";
import type { GrowthPhase, WorkflowStep } from "@/lib/nav/workflow-steps";

export type FeatureLifecycle = "beta" | "live" | "stable";

/**
 * A single navigable sidebar row. Type kept as `NavItem` for backward
 * compatibility with existing consumers; `NavLeaf` is the preferred alias
 * in the nested schema (nav-schema.ts consumers should import NavLeaf).
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minPhase?: number;
  /** Required plan tier. Fails ⇒ dimmed + lock icon + Upgrade tooltip. */
  minPlan?: PlanTier;
  /** Preferred alias for `minPlan` — same semantics. */
  minTier?: PlanTier;
  /** 6-bucket workflow-step growth phase (0..5). See workflow-steps.ts. */
  growthPhase?: GrowthPhase;
  /** Audience filter. Fails ⇒ item is fully hidden. */
  segments?: Segment[];
  lifecycle?: FeatureLifecycle;
  /** Entitlement flag consulted via useEntitlement().can(). */
  feature?: string;
  /** Preferred alias for `feature`. */
  requiredFeature?: string;
  /**
   * Add-on identifier. When the item is locked and this is set, the sidebar
   * keeps the item visible with an "Add-on" pill and links to
   * `/workspace/billing?openAddon=<key>` so the purchase drawer opens
   * without the user leaving their current context. Per plan § F.5.
   */
  addOnKey?: "share_management";
}

/** Alias — the design-spec name. Structurally identical to NavItem. */
export type NavLeaf = NavItem;

/**
 * Nested subgroup — a titled cluster of leaves inside a top-level group.
 * Kept intentionally minimal; the same gating fields (`minTier`,
 * `segments`) apply to the whole cluster.
 */
export interface NavSubgroup {
  id: string;
  label: string;
  minTier?: PlanTier;
  segments?: Segment[];
  /** Entitlement flag that gates the whole subgroup. */
  requiredFeature?: string;
  items: NavLeaf[];
}

/**
 * Pillar bucket used by workspace-layout's pillar-aware renderer.
 *
 *   overview   — always expanded, first pillar. Landing surfaces.
 *   now        — founder-facing groups tied to phase progression. Only the
 *                pillar that brackets `currentPhase` auto-expands.
 *   coming_up  — reserved for the next-phase preview slot (mapped to the
 *                "Later phases" P5 expander today).
 *   later      — later-phase groups collapsed under P5 disclosure.
 *   role       — audience overlays (investor/advisor/…); only the role
 *                matching the user's segment renders.
 *   account    — utility group; collapsed by default.
 */
export type NavPillar =
  | "overview"
  | "now"
  | "coming_up"
  | "later"
  | "role"
  | "account";

export interface NavGroup {
  /** Stable identifier — the sidebar collapse state persists per id. */
  id?: string;
  label: string;
  stage?: string;
  minPhase?: number;
  minPlan?: PlanTier;
  minTier?: PlanTier;
  segments?: Segment[];
  collapsible?: boolean;
  /**
   * Progressive-disclosure default. When true the pillar renders collapsed
   * on first paint. workspace-layout overrides this for the pillar whose
   * `minPhase` brackets the founder's current phase.
   */
  defaultCollapsed?: boolean;
  /** Sidebar pillar bucket — see NavPillar. */
  pillar?: NavPillar;
  /** Workflow-step this group belongs to. Undefined for Home/Roles/Account. */
  workflowStep?: WorkflowStep;
  /** Nested subgroups. When present, the flat `items` field is a
   *  convenience concatenation for legacy renderers. */
  subgroups?: NavSubgroup[];
  /** Flat item list — always populated (concatenated from subgroups when
   *  the group is nested). Legacy renderers read this. */
  items: NavLeaf[];
}

// ---------------------------------------------------------------------------
// Nested catalogue definition — subgroups are defined here first, then
// concatenated into the top-level `items` field so legacy renderers still
// work. The nested-sidebar renderer reads `subgroups` directly.
// ---------------------------------------------------------------------------

/** Helper — flatten subgroups into a single items[] array for legacy consumers. */
function flatten(subgroups: NavSubgroup[]): NavLeaf[] {
  const out: NavLeaf[] = [];
  for (const sg of subgroups) out.push(...sg.items);
  return out;
}

// --- Home ------------------------------------------------------------------
// Formerly "Overview". Flat (no subgroups) — the landing pillar of the shell.
const HOME_ITEMS: NavLeaf[] = [
  { href: "/workspace/projects", label: "My Startups", icon: Briefcase, growthPhase: 0 },
  { href: "/workspace/projects/archived", label: "Archived", icon: Archive, growthPhase: 0 },
  { href: "/dashboard/portfolio", label: "Portfolio", icon: LayoutDashboard, lifecycle: "beta", growthPhase: 0 },
  { href: "/dashboard/svi", label: "SVI Score", icon: TrendingUp, growthPhase: 0 },
  { href: "/", label: "New Analysis", icon: Zap, growthPhase: 0 },
  { href: "/workspace/roadmap", label: "Action Plan", icon: Map, growthPhase: 0 },
];

// --- Validate --------------------------------------------------------------
const VALIDATE_SUBGROUPS: NavSubgroup[] = [
  {
    id: "validate.discover",
    label: "Discover",
    items: [
      { href: "/dashboard/market-size", label: "Market Size", icon: PieChart, minPlan: "starter", minTier: "starter", growthPhase: 1 },
      { href: "/workspace/knowledge-base", label: "Knowledge Base", icon: BookOpen, minPlan: "starter", minTier: "starter", growthPhase: 1 },
    ],
  },
  {
    id: "validate.evaluate",
    label: "Evaluate",
    items: [
      { href: "/workspace/evaluation", label: "Evaluation (13)", icon: FileText, minPlan: "starter", minTier: "starter", growthPhase: 1 },
      { href: "/workspace/evidence", label: "Evidence Vault", icon: FileText, minPlan: "starter", minTier: "starter", growthPhase: 1 },
    ],
  },
  {
    id: "validate.track",
    label: "Track",
    items: [
      { href: "/workspace/metrics", label: "Metrics", icon: BarChart3, minPlan: "growth", minTier: "growth", growthPhase: 1 },
      { href: "/workspace/reports", label: "Weekly Reports", icon: Activity, growthPhase: 1 },
    ],
  },
];

// --- Build -----------------------------------------------------------------
const BUILD_SUBGROUPS: NavSubgroup[] = [
  {
    id: "build.equity-setup",
    label: "Equity Setup",
    items: [
      { href: "/workspace/equity-setup", label: "Equity Setup", icon: Wand2, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
      { href: "/workspace/equity", label: "Equity Split", icon: PieChart, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
      { href: "/workspace/cap-table", label: "Cap Table", icon: Table2, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
      { href: "/workspace/shareholders", label: "Shareholders", icon: Shield, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
    ],
  },
  {
    id: "build.people",
    label: "People",
    items: [
      { href: "/workspace/esop", label: "ESOP Setup", icon: Users, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
      { href: "/workspace/vesting", label: "Vesting", icon: Calendar, minPlan: "starter", minTier: "starter", addOnKey: "share_management", growthPhase: 2 },
      { href: "/workspace/equity-esop", label: "ESOP Manage", icon: PieChart, minPlan: "growth", minTier: "growth", growthPhase: 2 },
      {
        href: "/workspace/equity-offer",
        label: "Equity Offer",
        icon: Handshake,
        segments: ["founder", "advisor"],
        minPlan: "scale",
        minTier: "scale",
        feature: "equity_offer.request",
        requiredFeature: "equity_offer.request",
        growthPhase: 2,
      },
    ],
  },
  {
    id: "build.blockchain",
    label: "Blockchain",
    items: [
      { href: "/workspace/wallet", label: "Wallet", icon: Wallet, minPlan: "scale", minTier: "scale", growthPhase: 2 },
      { href: "/workspace/equity-dashboard", label: "Blockchain Sync", icon: Link2, minPlan: "scale", minTier: "scale", growthPhase: 2 },
    ],
  },
];

// --- Fundraise -------------------------------------------------------------
const FUNDRAISE_SUBGROUPS: NavSubgroup[] = [
  {
    id: "fundraise.valuation-finance",
    label: "Valuation & Finance",
    items: [
      { href: "/dashboard/valuation", label: "VC Valuation", icon: Target, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/dashboard/cfo", label: "CFO Advisor", icon: LineChart, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/dashboard/finance", label: "Finance P&L", icon: DollarSign, minPlan: "starter", minTier: "starter", lifecycle: "beta", growthPhase: 3 },
      { href: "/dashboard/esop", label: "ESOP Manager", icon: Users, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/dashboard/team", label: "Team & Salaries", icon: Users, minPlan: "starter", minTier: "starter", lifecycle: "beta", growthPhase: 3 },
    ],
  },
  {
    id: "fundraise.data-room",
    label: "Data Room",
    items: [
      { href: "/workspace/data-room", label: "Data Room", icon: FolderCheck, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/workspace/documents", label: "Documents", icon: FolderOpen, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/workspace/esic-assessment", label: "ESIC Self-Assessment", icon: ShieldCheck, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/dashboard/compliance", label: "Compliance Panel", icon: ShieldCheck, minPlan: "starter", minTier: "starter", growthPhase: 3 },
    ],
  },
  {
    id: "fundraise.accelerators",
    label: "Accelerators",
    items: [
      { href: "/dashboard/accelerator", label: "Accelerator Tracker", icon: Rocket, minPlan: "growth", minTier: "growth", lifecycle: "beta", growthPhase: 3 },
      { href: "/dashboard/accelerator-criteria", label: "Accelerator Criteria", icon: BookOpen, minPlan: "growth", minTier: "growth", lifecycle: "beta", growthPhase: 3 },
    ],
  },
  {
    id: "fundraise.raise",
    label: "Raise",
    items: [
      { href: "/dashboard/fundraise", label: "Fundraise Readiness", icon: TrendingUp, minPlan: "starter", minTier: "starter", growthPhase: 3 },
      { href: "/workspace/fundraise", label: "Raise Capital", icon: Banknote, minPlan: "starter", minTier: "starter", growthPhase: 3 },
    ],
  },
];

// --- Scale & Exit ----------------------------------------------------------
const SCALE_EXIT_SUBGROUPS: NavSubgroup[] = [
  {
    id: "scale-exit.revenue",
    label: "Revenue",
    items: [
      { href: "/workspace/revenue", label: "Revenue", icon: DollarSign, minPlan: "growth", minTier: "growth", growthPhase: 4 },
      { href: "/workspace/tax-invoice-checker", label: "Tax Invoice Checker", icon: FileText, minPlan: "starter", minTier: "starter", growthPhase: 4 },
      { href: "/workspace/journal", label: "Growth Journal", icon: BookOpen, minPlan: "scale", minTier: "scale", growthPhase: 4 },
      { href: "/workspace/dividends", label: "Dividends", icon: Gift, minPlan: "growth", minTier: "growth", growthPhase: 4 },
    ],
  },
  {
    id: "scale-exit.exit",
    label: "Exit",
    items: [
      { href: "/workspace/exit", label: "Exit Modeling", icon: DoorOpen, minPlan: "growth", minTier: "growth", growthPhase: 5 },
      { href: "/dashboard/exit-readiness", label: "Exit Benchmark", icon: BarChart3, minPlan: "starter", minTier: "starter", growthPhase: 5 },
    ],
  },
];

// --- Roles -----------------------------------------------------------------
// Collapses the previously-separate Investor / Advisor / Accelerator /
// Reseller / Mentor groups into a single top-level "Roles" group. Each
// audience is one subgroup — segment / feature gating on the subgroup +
// per-leaf level ensures a user only sees the subgroup(s) that apply.
//
// IMPORTANT: The `Mentor` subgroup below is the block added by workflow
// wf2tywpoq (mentor-console). Preserved verbatim (hrefs, feature key,
// icons) per the coordination note in the release plan.
const ROLES_SUBGROUPS: NavSubgroup[] = [
  {
    id: "roles.investor",
    label: "Investor",
    segments: ["investor_angel", "investor_vc"],
    items: [
      { href: "/workspace/deal-flow", label: "Deal Flow", icon: Layers, segments: ["investor_angel", "investor_vc"] },
      { href: "/workspace/watchlist", label: "Watchlist", icon: Eye, segments: ["investor_angel", "investor_vc"] },
      {
        href: "/workspace/portfolio",
        label: "Portfolio",
        icon: PieChart,
        segments: ["investor_angel", "investor_vc"],
        minPlan: "vc_small",
        minTier: "vc_small",
      },
      { href: "/workspace/investor-preferences", label: "Preferences", icon: Settings2, segments: ["investor_angel", "investor_vc"] },
    ],
  },
  {
    id: "roles.advisor",
    label: "Advisor",
    segments: ["advisor"],
    items: [
      { href: "/workspace/client-roster", label: "Client Roster", icon: Users, segments: ["advisor"] },
      { href: "/workspace/advisor-notes", label: "Notes", icon: MessageSquare, segments: ["advisor"] },
      { href: "/workspace/weekly-digest", label: "Weekly Digest", icon: Send, segments: ["advisor"] },
    ],
  },
  {
    id: "roles.accelerator",
    label: "Accelerator",
    segments: ["accelerator"],
    items: [
      { href: "/workspace/cohort", label: "Cohort", icon: Building2, segments: ["accelerator"] },
      { href: "/workspace/applications", label: "Applications", icon: ClipboardCheck, segments: ["accelerator"] },
      {
        href: "/workspace/lp-report",
        label: "LP Report",
        icon: FileBarChart,
        segments: ["accelerator"],
        minPlan: "accel_growth",
        minTier: "accel_growth",
      },
    ],
  },
  {
    id: "roles.reseller",
    label: "Reseller",
    requiredFeature: "reseller.console",
    items: [
      { href: "/reseller", label: "Dashboard", icon: LayoutDashboard, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/customers", label: "Customers", icon: Users, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/mentor", label: "Mentor", icon: GraduationCap, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/codes", label: "Codes", icon: Tag, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/credits", label: "Credits", icon: Coins, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/requests", label: "Requests", icon: Inbox, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/reports", label: "Reports", icon: FileText, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/settings", label: "Settings", icon: Settings2, feature: "reseller.console", requiredFeature: "reseller.console" },
    ],
  },
  // NOTE: preserved verbatim from wf2tywpoq (mentor-console). Do not
  // rename or re-key the hrefs — snapshot-tested per the release plan.
  {
    id: "roles.mentor",
    label: "Mentor",
    requiredFeature: "reseller.console",
    items: [
      { href: "/reseller/mentor", label: "Roster", icon: Users, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/mentor?filter=overdue", label: "Check-in Inbox", icon: Inbox, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/mentor?tab=reports", label: "Reports Feed", icon: FileText, feature: "reseller.console", requiredFeature: "reseller.console" },
      { href: "/reseller/mentor/cohort", label: "Cohort View", icon: LayoutGrid, feature: "reseller.console", requiredFeature: "reseller.console" },
    ],
  },
];

// --- Account ---------------------------------------------------------------
const ACCOUNT_SUBGROUPS: NavSubgroup[] = [
  {
    id: "account.profile",
    label: "Profile",
    items: [
      { href: "/workspace/profile", label: "My Profile", icon: User },
      { href: "/workspace/founder-profile", label: "Founder Profile", icon: User, lifecycle: "beta" },
      { href: "/workspace/notifications", label: "Notifications", icon: Bell },
      { href: "/workspace/referrals", label: "Referrals", icon: Gift },
    ],
  },
  {
    id: "account.billing",
    label: "Billing",
    items: [
      { href: "/workspace/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    id: "account.enterprise",
    label: "Enterprise",
    items: [
      { href: "/workspace/integrations", label: "Integrations", icon: Plug },
      { href: "/workspace/branding", label: "Custom Branding", icon: Palette, minPlan: "enterprise", minTier: "enterprise" },
      { href: "/dashboard/advisor", label: "Advisor Portal", icon: Share2, minPlan: "growth", minTier: "growth" },
      { href: "/workspace/api-keys", label: "API Keys", icon: ClipboardList, minPlan: "enterprise", minTier: "enterprise" },
      { href: "/workspace/sso", label: "SSO", icon: Shield, minPlan: "enterprise", minTier: "enterprise" },
      { href: "/workspace/white-label", label: "White-label", icon: Palette, minPlan: "scale", minTier: "scale" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Top-level catalogue — 7 groups per docs/plans/tier-menu-2026-07-24.
// ---------------------------------------------------------------------------

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    pillar: "overview",
    defaultCollapsed: false,
    items: HOME_ITEMS,
  },
  {
    id: "validate",
    label: "Validate",
    stage: "Idea → MVP",
    minPhase: 0,
    pillar: "now",
    workflowStep: "validate",
    defaultCollapsed: true,
    subgroups: VALIDATE_SUBGROUPS,
    items: flatten(VALIDATE_SUBGROUPS),
  },
  {
    id: "build",
    label: "Build",
    stage: "MVP → Launch",
    minPhase: 2,
    pillar: "now",
    workflowStep: "build",
    defaultCollapsed: true,
    subgroups: BUILD_SUBGROUPS,
    items: flatten(BUILD_SUBGROUPS),
  },
  {
    id: "fundraise",
    label: "Fundraise",
    stage: "Pre-seed → Series A",
    minPhase: 3,
    pillar: "now",
    workflowStep: "fundraise",
    defaultCollapsed: true,
    subgroups: FUNDRAISE_SUBGROUPS,
    items: flatten(FUNDRAISE_SUBGROUPS),
  },
  {
    id: "scale-exit",
    label: "Scale & Exit",
    stage: "Revenue → Exit",
    minPhase: 4,
    pillar: "now",
    workflowStep: "grow",
    defaultCollapsed: true,
    subgroups: SCALE_EXIT_SUBGROUPS,
    items: flatten(SCALE_EXIT_SUBGROUPS),
  },
  {
    id: "roles",
    label: "Roles",
    stage: "Audience overlays",
    pillar: "role",
    collapsible: true,
    defaultCollapsed: true,
    subgroups: ROLES_SUBGROUPS,
    items: flatten(ROLES_SUBGROUPS),
  },
  {
    id: "account",
    label: "Account",
    pillar: "account",
    defaultCollapsed: true,
    subgroups: ACCOUNT_SUBGROUPS,
    items: flatten(ACCOUNT_SUBGROUPS),
  },
];

export const ADMIN_NAV_GROUP: NavGroup = {
  id: "admin",
  label: "Admin",
  items: [
    { href: "/admin", label: "Admin Panel", icon: Shield },
    { href: "/admin/goals", label: "CEO Goals", icon: Target },
    { href: "/dashboard/admin/content-pillars", label: "Content Pillars", icon: FileText, lifecycle: "beta" },
    { href: "/dashboard/admin/stripe-sync", label: "Stripe Sync", icon: CreditCard, lifecycle: "beta" },
    { href: "/dashboard/admin/pricing-test", label: "Pricing A/B", icon: BarChart3, lifecycle: "beta" },
    { href: "/dashboard/admin/svi-exchange", label: "SVI Exchange", icon: Rocket, lifecycle: "beta" },
    { href: "/admin/listings", label: "Listings", icon: ExternalLink },
  ],
};
