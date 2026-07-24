// Workspace sidebar nav-group catalogue.
//
// Extracted verbatim from workspace-layout.tsx so that (a) the layout stays
// focused on rendering and (b) other surfaces (mobile nav, command-palette,
// deep-link resolver) can import the same source of truth.
//
// Each NavItem carries optional gates evaluated by workspace-layout:
//   • minPhase   — existing lifecycle phase (0-5). Lower phases render dimmed.
//   • minPlan    — required PlanTier. Failing items render grayed-out + lock.
//   • segments   — audience filter. Items outside the user's segment fully
//                  hide (wrong audience — not an upgrade opportunity).
//   • feature    — entitlement flag consulted through useEntitlement().can().
//   • lifecycle  — beta/live/stable badge chip.

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

export type FeatureLifecycle = "beta" | "live" | "stable";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minPhase?: number;
  /** Required plan tier. Fails ⇒ dimmed + lock icon + Upgrade tooltip. */
  minPlan?: PlanTier;
  /** Audience filter. Fails ⇒ item is fully hidden. */
  segments?: Segment[];
  lifecycle?: FeatureLifecycle;
  /** Entitlement flag consulted via useEntitlement().can(). */
  feature?: string;
  /**
   * Add-on identifier. When the item is locked and this is set, the sidebar
   * keeps the item visible with an "Add-on" pill and links to
   * `/workspace/billing?openAddon=<key>` so the purchase drawer opens
   * without the user leaving their current context. Per plan § F.5.
   */
  addOnKey?: "share_management";
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
  label: string;
  stage?: string;
  minPhase?: number;
  minPlan?: PlanTier;
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
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    pillar: "overview",
    defaultCollapsed: false,
    items: [
      { href: "/workspace/projects", label: "My Startups", icon: Briefcase },
      { href: "/workspace/projects/archived", label: "Archived", icon: Archive },
      { href: "/dashboard/portfolio", label: "Portfolio", icon: LayoutDashboard, lifecycle: "beta" },
      { href: "/dashboard/svi", label: "SVI Score", icon: TrendingUp },
      { href: "/", label: "New Analysis", icon: Zap },
      { href: "/workspace/roadmap", label: "Action Plan", icon: Map },
    ],
  },
  {
    label: "Build & Validate",
    stage: "Idea → MVP",
    minPhase: 0,
    pillar: "now",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/evaluation", label: "Evaluation (13)", icon: FileText, minPlan: "starter" },
      { href: "/workspace/evidence", label: "Evidence Vault", icon: FileText, minPlan: "starter" },
      { href: "/dashboard/market-size", label: "Market Size", icon: PieChart, minPlan: "starter" },
      { href: "/workspace/metrics", label: "Metrics", icon: BarChart3, minPlan: "growth" },
      { href: "/workspace/reports", label: "Weekly Reports", icon: Activity },
      { href: "/workspace/knowledge-base", label: "Knowledge Base", icon: BookOpen, minPlan: "starter" },
    ],
  },
  {
    label: "Ownership & Equity",
    stage: "MVP → Launch",
    minPhase: 2,
    pillar: "now",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/equity-setup", label: "Equity Setup", icon: Wand2, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/equity", label: "Equity Split", icon: PieChart, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/cap-table", label: "Cap Table", icon: Table2, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/shareholders", label: "Shareholders", icon: Shield, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/esop", label: "ESOP Setup", icon: Users, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/vesting", label: "Vesting", icon: Calendar, minPlan: "starter", addOnKey: "share_management" },
      { href: "/workspace/wallet", label: "Wallet", icon: Wallet, minPlan: "scale" },
      { href: "/workspace/equity-esop", label: "ESOP Manage", icon: PieChart, minPlan: "growth" },
      { href: "/workspace/equity-dashboard", label: "Blockchain Sync", icon: Link2, minPlan: "scale" },
      {
        href: "/workspace/equity-offer",
        label: "Equity Offer",
        icon: Handshake,
        segments: ["founder", "advisor"],
        minPlan: "scale",
        feature: "equity_offer.request",
      },
    ],
  },
  {
    label: "Fundraise",
    stage: "Pre-seed → Series A",
    minPhase: 3,
    pillar: "now",
    defaultCollapsed: true,
    items: [
      { href: "/dashboard/valuation", label: "VC Valuation", icon: Target, minPlan: "starter" },
      { href: "/dashboard/cfo", label: "CFO Advisor", icon: LineChart, minPlan: "starter" },
      { href: "/dashboard/finance", label: "Finance P&L", icon: DollarSign, minPlan: "starter", lifecycle: "beta" },
      { href: "/dashboard/esop", label: "ESOP Manager", icon: Users, minPlan: "starter" },
      { href: "/dashboard/team", label: "Team & Salaries", icon: Users, minPlan: "starter", lifecycle: "beta" },
      { href: "/dashboard/accelerator", label: "Accelerator Tracker", icon: Rocket, minPlan: "growth", lifecycle: "beta" },
      { href: "/dashboard/accelerator-criteria", label: "Accelerator Criteria", icon: BookOpen, minPlan: "growth", lifecycle: "beta" },
      { href: "/dashboard/fundraise", label: "Fundraise Readiness", icon: TrendingUp, minPlan: "starter" },
      { href: "/workspace/esic-assessment", label: "ESIC Self-Assessment", icon: ShieldCheck, minPlan: "starter" },
      { href: "/workspace/data-room", label: "Data Room", icon: FolderCheck, minPlan: "starter" },
      { href: "/workspace/fundraise", label: "Raise Capital", icon: Banknote, minPlan: "starter" },
      { href: "/workspace/documents", label: "Documents", icon: FolderOpen, minPlan: "starter" },
    ],
  },
  {
    label: "Grow & Scale",
    stage: "Revenue → Scale",
    minPhase: 4,
    pillar: "now",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/revenue", label: "Revenue", icon: DollarSign, minPlan: "growth" },
      { href: "/workspace/tax-invoice-checker", label: "Tax Invoice Checker", icon: FileText, minPlan: "starter" },
      { href: "/workspace/journal", label: "Growth Journal", icon: BookOpen, minPlan: "scale" },
      { href: "/workspace/dividends", label: "Dividends", icon: Gift, minPlan: "growth" },
      { href: "/workspace/exit", label: "Exit Modeling", icon: DoorOpen, minPlan: "growth" },
      { href: "/dashboard/exit-readiness", label: "Exit Benchmark", icon: BarChart3, minPlan: "starter" },
    ],
  },
  {
    label: "Investor",
    stage: "Deal flow → Portfolio",
    segments: ["investor_angel", "investor_vc"],
    collapsible: true,
    pillar: "role",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/deal-flow", label: "Deal Flow", icon: Layers, segments: ["investor_angel", "investor_vc"] },
      { href: "/workspace/watchlist", label: "Watchlist", icon: Eye, segments: ["investor_angel", "investor_vc"] },
      {
        href: "/workspace/portfolio",
        label: "Portfolio",
        icon: PieChart,
        segments: ["investor_angel", "investor_vc"],
        minPlan: "vc_small",
      },
      { href: "/workspace/investor-preferences", label: "Preferences", icon: Settings2, segments: ["investor_angel", "investor_vc"] },
    ],
  },
  {
    label: "Advisor",
    stage: "Clients → Insights",
    segments: ["advisor"],
    collapsible: true,
    pillar: "role",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/client-roster", label: "Client Roster", icon: Users, segments: ["advisor"] },
      { href: "/workspace/advisor-notes", label: "Notes", icon: MessageSquare, segments: ["advisor"] },
      { href: "/workspace/weekly-digest", label: "Weekly Digest", icon: Send, segments: ["advisor"] },
    ],
  },
  {
    label: "Accelerator",
    stage: "Cohort → LP Report",
    segments: ["accelerator"],
    collapsible: true,
    pillar: "role",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/cohort", label: "Cohort", icon: Building2, segments: ["accelerator"] },
      { href: "/workspace/applications", label: "Applications", icon: ClipboardCheck, segments: ["accelerator"] },
      {
        href: "/workspace/lp-report",
        label: "LP Report",
        icon: FileBarChart,
        segments: ["accelerator"],
        minPlan: "accel_growth",
      },
    ],
  },
  {
    label: "Reseller",
    stage: "Partners → Payout",
    collapsible: true,
    pillar: "role",
    defaultCollapsed: true,
    items: [
      { href: "/reseller", label: "Dashboard", icon: LayoutDashboard, feature: "reseller.console" },
      { href: "/reseller/customers", label: "Customers", icon: Users, feature: "reseller.console" },
      { href: "/reseller/mentor", label: "Mentor", icon: GraduationCap, feature: "reseller.console" },
      { href: "/reseller/codes", label: "Codes", icon: Tag, feature: "reseller.console" },
      { href: "/reseller/credits", label: "Credits", icon: Coins, feature: "reseller.console" },
      { href: "/reseller/requests", label: "Requests", icon: Inbox, feature: "reseller.console" },
      { href: "/reseller/reports", label: "Reports", icon: FileText, feature: "reseller.console" },
      { href: "/reseller/settings", label: "Settings", icon: Settings2, feature: "reseller.console" },
    ],
  },
  {
    label: "Mentor",
    stage: "Mentees → Growth",
    collapsible: true,
    pillar: "role",
    defaultCollapsed: true,
    items: [
      { href: "/reseller/mentor", label: "Roster", icon: Users, feature: "reseller.console" },
      { href: "/reseller/mentor?filter=overdue", label: "Check-in Inbox", icon: Inbox, feature: "reseller.console" },
      { href: "/reseller/mentor?tab=reports", label: "Reports Feed", icon: FileText, feature: "reseller.console" },
      { href: "/reseller/mentor/cohort", label: "Cohort View", icon: LayoutGrid, feature: "reseller.console" },
    ],
  },
  {
    label: "Account",
    pillar: "account",
    defaultCollapsed: true,
    items: [
      { href: "/workspace/profile", label: "My Profile", icon: User },
      { href: "/workspace/founder-profile", label: "Founder Profile", icon: User, lifecycle: "beta" },
      { href: "/workspace/billing", label: "Billing", icon: CreditCard },
      { href: "/workspace/integrations", label: "Integrations", icon: Plug },
      { href: "/workspace/notifications", label: "Notifications", icon: Bell },
      { href: "/workspace/referrals", label: "Referrals", icon: Gift },
      { href: "/workspace/branding", label: "Custom Branding", icon: Palette, minPlan: "enterprise" },
      { href: "/dashboard/advisor", label: "Advisor Portal", icon: Share2, minPlan: "growth" },
      { href: "/workspace/api-keys", label: "API Keys", icon: ClipboardList, minPlan: "enterprise" },
      { href: "/workspace/sso", label: "SSO", icon: Shield, minPlan: "enterprise" },
      { href: "/workspace/white-label", label: "White-label", icon: Palette, minPlan: "scale" },
    ],
  },
];

export const ADMIN_NAV_GROUP: NavGroup = {
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
