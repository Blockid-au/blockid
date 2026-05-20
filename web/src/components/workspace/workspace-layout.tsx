"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Banknote, BarChart3, Bell, BookOpen, Briefcase, ChevronLeft, ChevronRight, CreditCard, DoorOpen, FileText, FolderCheck, FolderOpen, Home,
  Key, LayoutDashboard, Map, PieChart, Shield, Table2, TrendingUp, User
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CreditBalance } from "@/components/ui/credit-balance";
import { ProjectSwitcher } from "@/components/ui/project-switcher";
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
}

const NAV_ITEMS = [
  { href: "/workspace/projects", label: "My Startups", icon: Briefcase },
  { href: "/dashboard/svi", label: "SVI Dashboard", icon: TrendingUp },
  { href: "/workspace/evidence", label: "Evidence Vault", icon: FileText },
  { href: "/workspace/data-room", label: "Data Room", icon: FolderCheck },
  { href: "/workspace/equity", label: "Equity Split", icon: PieChart },
  { href: "/workspace/cap-table", label: "Cap Table", icon: Table2 },
  { href: "/workspace/fundraise", label: "Fundraise", icon: Banknote },
  { href: "/workspace/documents", label: "Documents", icon: FolderOpen },
  { href: "/workspace/reports", label: "Weekly Reports", icon: Activity },
  { href: "/workspace/roadmap", label: "Roadmap", icon: Map },
  { href: "/workspace/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/workspace/journal", label: "Growth Journal", icon: BookOpen },
  { href: "/workspace/exit", label: "Exit Modeling", icon: DoorOpen },
  { href: "/workspace/profile", label: "My Profile", icon: User },
  { href: "/workspace/billing", label: "Billing", icon: CreditCard },
  { href: "/workspace/api-keys", label: "API Keys", icon: Key },
  { href: "/workspace/notifications", label: "Notifications", icon: Bell },
];

const ADMIN_NAV = { href: "/admin", label: "Admin Panel", icon: Shield };

export function WorkspaceLayout({ children, user, startupName, notificationCount = 0 }: WorkspaceLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";

  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col border-r border-surface-200/80 bg-white transition-all duration-200",
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
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150",
                  active
                    ? "bg-brand-50 text-brand-700 font-semibold shadow-sm border border-brand-100"
                    : "text-ink-500 hover:text-ink-800 hover:bg-surface-50",
                )}
              >
                <Icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active ? "text-brand-600" : "")} />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: home link */}
        <div className="px-2 pb-3 border-t border-surface-200 pt-3">
          <Link href="/" className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors">
            <Home strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Back to Home</span>}
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-surface-200/60 bg-white/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
            </button>
            <ProjectSwitcher />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Credit balance */}
            <CreditBalance />

            {/* Notifications */}
            <button type="button" className="relative h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer">
              <Bell strokeWidth={1.75} className="h-4 w-4" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
              )}
            </button>

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

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
