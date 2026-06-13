"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Banknote, BarChart3, Bell, BookOpen, Briefcase, Calendar, ChevronLeft, ChevronRight, CreditCard, DollarSign, DoorOpen, ExternalLink, FileText, FolderCheck, FolderOpen, Gift, Home,
  LayoutDashboard, Link2, Map, Palette, PieChart, Share2, Shield, Table2, Target, TrendingUp, User, Users, Wand2, Wallet, Zap, LineChart,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CreditBalance } from "@/components/ui/credit-balance";
import { CreditBadge } from "@/components/workspace/credit-badge";
import { ProjectSwitcher } from "@/components/ui/project-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { FeedbackWidget } from "@/components/ui/feedback-widget";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  user: {
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    role?: string;
  };
  startupName?: string;
  notificationCount?: number;
  /** Current startup phase (0-5). Controls which sidebar groups are highlighted vs dimmed. */
  currentPhase?: number;
}

interface NavGroup {
  label: string;
  stage?: string;
  /** Minimum phase (0-5) for this group to be fully accessible. Lower phases show dimmed. */
  minPhase?: number;
  items: { href: string; label: string; icon: LucideIcon }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/workspace/projects", label: "My Startups", icon: Briefcase },
      { href: "/dashboard/svi", label: "SVI Score", icon: TrendingUp },
      { href: "/", label: "New Analysis", icon: Zap },
      { href: "/workspace/roadmap", label: "Action Plan", icon: Map },
    ],
  },
  {
    label: "Build & Validate",
    stage: "Idea \u2192 MVP",
    minPhase: 0,
    items: [
      { href: "/workspace/evaluation", label: "Evaluation (13)", icon: FileText },
      { href: "/workspace/evidence", label: "Evidence Vault", icon: FileText },
      { href: "/workspace/metrics", label: "Metrics", icon: BarChart3 },
      { href: "/workspace/reports", label: "Weekly Reports", icon: Activity },
    ],
  },
  {
    label: "Ownership & Equity",
    stage: "MVP \u2192 Launch",
    minPhase: 2,
    items: [
      { href: "/workspace/equity-setup", label: "Equity Setup", icon: Wand2 },
      { href: "/workspace/equity", label: "Equity Split", icon: PieChart },
      { href: "/workspace/cap-table", label: "Cap Table", icon: Table2 },
      { href: "/workspace/shareholders", label: "Shareholders", icon: Shield },
      { href: "/workspace/esop", label: "ESOP", icon: Users },
      { href: "/workspace/vesting", label: "Vesting", icon: Calendar },
      { href: "/workspace/wallet", label: "Wallet", icon: Wallet },
      { href: "/workspace/equity-dashboard", label: "Blockchain Sync", icon: Link2 },
    ],
  },
  {
    label: "Fundraise",
    stage: "Pre-seed \u2192 Series A",
    minPhase: 3,
    items: [
      { href: "/dashboard/valuation", label: "VC Valuation", icon: Target },
      { href: "/dashboard/cfo", label: "CFO Advisor", icon: LineChart },
      { href: "/workspace/data-room", label: "Data Room", icon: FolderCheck },
      { href: "/workspace/fundraise", label: "Raise Capital", icon: Banknote },
      { href: "/workspace/documents", label: "Documents", icon: FolderOpen },
    ],
  },
  {
    label: "Grow & Scale",
    stage: "Revenue \u2192 Scale",
    minPhase: 4,
    items: [
      { href: "/workspace/revenue", label: "Revenue", icon: DollarSign },
      { href: "/workspace/journal", label: "Growth Journal", icon: BookOpen },
      { href: "/workspace/dividends", label: "Dividends", icon: Gift },
      { href: "/workspace/exit", label: "Exit Modeling", icon: DoorOpen },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/workspace/profile", label: "My Profile", icon: User },
      { href: "/workspace/billing", label: "Billing", icon: CreditCard },
      { href: "/workspace/notifications", label: "Notifications", icon: Bell },
      { href: "/workspace/referrals", label: "Referrals", icon: Gift },
      { href: "/workspace/branding", label: "Custom Branding", icon: Palette },
      { href: "/dashboard/advisor", label: "Advisor Portal", icon: Share2 },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  label: "Admin",
  items: [
    { href: "/admin", label: "Admin Panel", icon: Shield },
    { href: "/admin/goals", label: "CEO Goals", icon: Target },
    { href: "/admin/listings", label: "Listings", icon: ExternalLink },
  ],
};

export function WorkspaceLayout({ children, user, startupName, currentPhase = 0 }: Omit<WorkspaceLayoutProps, "notificationCount">) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";

  const navGroups = isAdmin ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800 dark:bg-surface-50 dark:text-ink-800 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col border-r border-surface-200/80 bg-white dark:bg-surface-100 transition-all duration-200",
        "lg:relative lg:flex",
        mobileOpen ? "flex" : "hidden lg:flex",
        sidebarOpen ? "w-56" : "w-14",
      )}>
        {/* Sidebar header */}
        <div className={cn(
          "flex items-center border-b border-surface-200 h-14 px-3 shrink-0",
          sidebarOpen ? "justify-between" : "justify-center",
        )}>
          {sidebarOpen ? <Logo variant="light" /> : null}
          <button
            type="button"
            onClick={() => { setSidebarOpen(v => !v); setMobileOpen(false); }}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? <ChevronLeft strokeWidth={1.75} className="h-4 w-4" /> : <ChevronRight strokeWidth={1.75} className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-1 px-1 overflow-y-auto">
          {navGroups.map((group) => {
            const isFuturePhase = group.minPhase != null && group.minPhase > currentPhase;
            return (
            <div key={group.label} className="mb-1">
              {/* Group header */}
              {sidebarOpen && (
                <div className="px-3 pt-4 pb-1.5 flex items-center justify-between">
                  <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", isFuturePhase ? "text-ink-300" : "text-ink-400")}>{group.label}</span>
                  {group.stage && (
                    <span className={cn("text-[9px]", isFuturePhase ? "text-ink-300/50" : "text-ink-400/60")}>
                      {isFuturePhase ? "Coming soon" : group.stage}
                    </span>
                  )}
                </div>
              )}
              {/* Group items */}
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150 mx-1",
                      active
                        ? "bg-brand-50 text-brand-700 font-semibold shadow-sm border border-brand-100"
                        : isFuturePhase
                          ? "text-ink-300 hover:text-ink-500 hover:bg-surface-50/50 opacity-60"
                          : "text-ink-500 hover:text-ink-800 hover:bg-surface-50",
                    )}
                  >
                    <Icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active ? "text-brand-600" : isFuturePhase ? "text-ink-300" : "")} />
                    {sidebarOpen && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

        {/* Bottom: credit badge + home link */}
        <div className="px-2 pb-3 border-t border-surface-200 pt-3 space-y-2">
          {sidebarOpen && <div className="px-1"><CreditBadge /></div>}
          <Link href="/" className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors">
            <Home strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Back to Home</span>}
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-surface-200/60 bg-white/90 dark:bg-surface-100/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
            </button>
            <ProjectSwitcher />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Wallet connect (auto-adds/switches to the BlockID chain) */}
            <ConnectWalletButton compact />

            {/* Credit balance */}
            <CreditBalance />

            {/* Dark mode toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <NotificationBell />

            {/* Avatar */}
            <div className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-100 transition-colors cursor-pointer">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full ring-2 ring-brand-100" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-brand-100">
                  {(user.displayName ?? user.email)[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-ink-700 hidden sm:block max-w-[140px] truncate">{user.displayName ?? user.email}</span>
            </div>

            {/* Sign out */}
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="h-8 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer">
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden">Out</span>
              </button>
            </form>
          </div>
        </header>

        {/* Founding 50 upgrade nudge — shown when user has 1 free credit left */}
        <UpgradePrompt />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Floating feedback FAB */}
      <FeedbackWidget page={pathname} />
    </div>
  );
}
