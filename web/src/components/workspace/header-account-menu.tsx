"use client";

// Workspace topbar — the avatar account menu.
//
// Live QA lane 1 F4 (2026-09-13): at 390 px the header's right-hand row
// measured 574 px — wallet, credits, dark-mode toggle, notifications, avatar
// and "Out" laid out inline — so "Switch to dark mode", "Notifications" and
// "Sign out" sat off-screen and could not be tapped. Below `sm` the layout
// shows only the notification bell and this avatar button; the menu carries
// the credit balance, the wallet button and the theme toggle there. From
// `sm` up those three render inline in the header and are hidden here.
//
// G13-W1-IA1 (D5): Account left the sidebar. This menu now renders at EVERY
// width and is the single home for Profile · Billing · Settings · Guides ·
// Sign out (spec §A.1 footer row + §E S-IA1). Sidebar footer keeps one
// "Settings" link.
//
// The menu's children mount only while it is open, so at rest every topbar
// widget (each of which fetches or listens) exists exactly once.

import * as React from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, CreditCard, LogOut, Moon, Settings2, User } from "lucide-react";
import { CreditBalance } from "@/components/ui/credit-balance";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { LogoutButton } from "@/components/auth/LogoutButton";

export interface HeaderUser {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/** Avatar-menu rows (spec §A.1: Profile, Billing, Settings, Help › Guides, Sign out). */
export const USER_MENU_ITEMS: ReadonlyArray<{ href: string; label: string; icon: typeof User }> = Object.freeze([
  { href: "/workspace/profile", label: "Profile", icon: User },
  { href: "/workspace/billing", label: "Billing", icon: CreditCard },
  { href: "/workspace/settings", label: "Settings", icon: Settings2 },
  { href: "/workspace/knowledge-base", label: "Guides", icon: BookOpen },
]);

/** The 28 px avatar used as the menu trigger. */
export function HeaderAvatar({ user }: { user: HeaderUser }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full ring-2 ring-action/30" />;
  }
  return (
    <div className="h-7 w-7 rounded-full bg-action flex items-center justify-center text-xs font-bold text-on-action ring-2 ring-action/30">
      {(user.displayName ?? user.email)[0].toUpperCase()}
    </div>
  );
}

export interface HeaderAccountMenuProps {
  user: HeaderUser;
  /** Test seam — renderToStaticMarkup cannot click; the layout never passes this. */
  initialOpen?: boolean;
  /** Fired with the row's href when a menu link is clicked (GA4 `nav_click`). */
  onNavigate?: (item: { href: string; label: string }) => void;
}

export function HeaderAccountMenu({ user, initialOpen = false, onNavigate }: HeaderAccountMenuProps) {
  const [open, setOpen] = React.useState(initialOpen);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-testid="header-account-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-9 flex items-center gap-1.5 rounded-lg pl-1 pr-1.5 hover:bg-surface-hover transition-colors cursor-pointer"
        data-testid="header-account-menu-button"
      >
        <HeaderAvatar user={user} />
        <span className="hidden sm:inline text-sm text-muted max-w-[140px] truncate">{user.displayName ?? user.email}</span>
        <ChevronDown strokeWidth={1.75} className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          data-testid="header-account-menu-panel"
          className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line-subtle bg-surface shadow-lg z-50 p-2 animate-fade-in"
        >
          <div className="px-2 py-1.5 border-b border-line-subtle mb-1">
            <p className="text-sm font-medium text-primary truncate">{user.displayName ?? user.email}</p>
            {user.displayName && <p className="text-xs text-muted truncate">{user.email}</p>}
          </div>

          {/* Below sm only: the widgets the inline header cluster carries from sm up. */}
          <div className="sm:hidden" data-testid="header-account-menu-mobile-widgets">
            {/* Credit balance — the same widget as the desktop pill */}
            <div className="px-2 py-1.5" role="none">
              <CreditBalance />
            </div>

            {/* Wallet connect */}
            <div className="px-2 py-1.5" role="none">
              <ConnectWalletButton />
            </div>

            {/* Theme */}
            <div className="flex items-center justify-between px-2 py-1.5 text-sm text-primary" role="none">
              <span className="flex items-center gap-2">
                <Moon strokeWidth={1.75} className="h-4 w-4 text-muted" />
                Theme
              </span>
              <ThemeToggle />
            </div>
            <div className="my-1 border-t border-line-subtle" role="none" />
          </div>

          {/* Account rows — every width */}
          {USER_MENU_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => {
                onNavigate?.({ href, label });
                setOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:text-primary hover:bg-surface-hover transition-colors"
            >
              <Icon strokeWidth={1.75} className="h-4 w-4" />
              {label}
            </Link>
          ))}

          {/* Sign out */}
          <LogoutButton className="mt-1 w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted hover:text-primary hover:bg-surface-hover transition-colors cursor-pointer">
            <LogOut strokeWidth={1.75} className="h-4 w-4" />
            Sign out
          </LogoutButton>
        </div>
      )}
    </div>
  );
}
