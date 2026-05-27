"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FileText,
  FlaskConical,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  Link2,
  Map,
  PieChart,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
  user: {
    email: string;
    displayName?: string | null;
  };
}

interface AdminNavGroup {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[];
}

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "General",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/self-analysis", label: "Self-Assessment", icon: Sparkles },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/credits", label: "Credits", icon: Coins },
      { href: "/admin/team", label: "Team", icon: Bot },
      { href: "/admin/architecture", label: "Architecture", icon: Layers },
    ],
  },
  {
    label: "Content & Growth",
    items: [
      { href: "/admin/roadmap", label: "Roadmap", icon: Map },
      { href: "/admin/documents", label: "Documents", icon: FileText },
      { href: "/admin/growth", label: "Growth Intelligence", icon: TrendingUp },
      { href: "/admin/rnd", label: "R&D Reports", icon: FlaskConical },
      { href: "/admin/accelerator", label: "Accelerator", icon: GraduationCap },
    ],
  },
  {
    label: "Equity & Vesting",
    items: [
      { href: "/workspace/equity-setup", label: "Equity Setup", icon: PieChart },
      { href: "/workspace/vesting", label: "Vesting Schedules", icon: Calendar },
      { href: "/workspace/cap-table", label: "Cap Table", icon: Shield },
      { href: "/workspace/esop", label: "ESOP Management", icon: Users },
    ],
  },
  {
    label: "Blockchain & Tokens",
    items: [
      { href: "/admin/tokens", label: "Token Management", icon: Coins },
      { href: "/workspace/wallet", label: "Wallet", icon: Wallet },
      { href: "/workspace/equity-dashboard", label: "Blockchain Sync", icon: Link2 },
    ],
  },
  {
    label: "Other",
    items: [
      { href: "/admin/listings", label: "Listings", icon: ExternalLink },
    ],
  },
];

export function AdminLayout({ children, user }: AdminLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col border-r border-surface-200/80 bg-white transition-all duration-200",
          "lg:relative lg:flex",
          mobileOpen ? "flex" : "hidden lg:flex",
          sidebarOpen ? "w-56" : "w-14",
        )}
      >
        {/* Sidebar header */}
        <div
          className={cn(
            "flex items-center border-b border-surface-200 h-14 px-3 shrink-0",
            sidebarOpen ? "justify-between" : "justify-center",
          )}
        >
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <Logo variant="light" />
              <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 uppercase tracking-wider">
                Admin
              </span>
            </div>
          ) : (
            <Shield strokeWidth={1.75} className="h-4 w-4 text-red-500" />
          )}
          <button
            type="button"
            onClick={() => {
              setSidebarOpen((v) => !v);
              setMobileOpen(false);
            }}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? (
              <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
            ) : (
              <ChevronRight strokeWidth={1.75} className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Nav items (grouped) */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              {sidebarOpen && (
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = exact
                    ? pathname === href
                    : pathname === href || pathname.startsWith(href + "/");
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
                      <Icon
                        strokeWidth={1.75}
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-brand-600" : "",
                        )}
                      />
                      {sidebarOpen && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: home link */}
        <div className="px-2 pb-3 border-t border-surface-200 pt-3 space-y-0.5">
          <Link
            href="/dashboard/svi"
            className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors"
          >
            <BarChart3 strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Workspace</span>}
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors"
          >
            <Home strokeWidth={1.75} className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Back to Homepage</span>}
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-surface-200/60 bg-white/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg text-ink-600 hover:text-ink-800 hover:bg-surface-100 cursor-pointer"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-500">
              {user.displayName ?? user.email}
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="h-8 px-3 rounded-lg text-xs font-medium text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
