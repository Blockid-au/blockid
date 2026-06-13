"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Menu, X, LayoutDashboard, LogOut, BarChart3, FileText, TrendingUp } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/ui/language-toggle";

interface NavLink {
  href: string;
  label: string;
}

interface NavDropdownGroup {
  heading: string;
  items: NavLink[];
}

interface NavDropdown {
  label: string;
  groups: NavDropdownGroup[];
}

type NavEntry = NavLink | NavDropdown;

const navItems: NavEntry[] = [
  { href: "/score", label: "Get SVI Score" },
  {
    label: "Free Tools",
    groups: [
      {
        heading: "Start with your idea",
        items: [
          { href: "/tools/idea-valuation", label: "Idea Valuation" },
          { href: "/tools/equity-split", label: "Equity Split" },
          { href: "/tools/cofounder-match", label: "Co-founder Match" },
          { href: "/tools/funding-plan", label: "Funding Plan" },
        ],
      },
      {
        heading: "When you're raising",
        items: [
          { href: "/tools/dilution", label: "Dilution Calculator" },
          { href: "/tools/cap-table", label: "Cap Table Diff" },
          { href: "/tools/term-sheet", label: "Term Sheet AI" },
          { href: "/tools/data-room", label: "Data Room Checklist" },
        ],
      },
    ],
  },
  { href: "/#product", label: "Product" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/insights", label: "Insights" },
  { href: "/version", label: "Version" },
];

function isDropdown(item: NavEntry): item is NavDropdown {
  return (item as NavDropdown).groups !== undefined;
}

/* ── Auth state hook ─────────────────────────────────────────────────── */

interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  plan?: string;
}

function useAuthUser() {
  const [user, setUser] = React.useState<AuthUser | null | undefined>(undefined); // undefined = loading

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data.ok && data.user ? data.user : null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => { cancelled = true; };
  }, []);

  return user;
}

/* ── User menu dropdown ──────────────────────────────────────────────── */

function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (user.displayName || user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-50 transition-colors cursor-pointer"
      >
        <span className="h-8 w-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
          {initials}
        </span>
        <span className="hidden lg:block text-sm font-medium text-ink-700 max-w-[120px] truncate">
          {user.displayName || user.email.split("@")[0]}
        </span>
        <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100">
            <p className="text-sm font-medium text-ink-800 truncate">{user.displayName || user.email.split("@")[0]}</p>
            <p className="text-xs text-ink-500 truncate">{user.email}</p>
            {user.plan && user.plan !== "free" && (
              <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                {user.plan}
              </span>
            )}
          </div>
          {/* Credit balance */}
          <div className="px-4 py-2 border-b border-surface-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500">Credits</span>
              <Link href="/workspace/billing" onClick={() => setOpen(false)} className="text-xs font-bold text-brand-600 hover:text-brand-700">
                View billing →
              </Link>
            </div>
          </div>
          <div className="py-1">
            <Link
              href="/score"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-50 transition-colors"
            >
              <BarChart3 strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              New Analysis
            </Link>
            <Link
              href="/dashboard/svi"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-50 transition-colors"
            >
              <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              My SVI Score
            </Link>
            <Link
              href="/workspace/reports"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-50 transition-colors"
            >
              <FileText strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              My Reports
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-50 transition-colors"
            >
              <LayoutDashboard strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Dashboard
            </Link>
            <form action="/api/auth/logout" method="post" className="w-full">
              <button
                type="submit"
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer text-left"
              >
                <LogOut strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Navbar ───────────────────────────────────────────────────────────── */

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const user = useAuthUser();

  // Lock body scroll when mobile menu is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4">
        <div className="mx-auto max-w-7xl rounded-2xl glass border border-white/20 px-5 py-3.5 shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <Logo variant="light" />

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {navItems.map((item) =>
                isDropdown(item) ? (
                  <ToolsDropdown key={item.label} entry={item} />
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="px-3.5 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                  >
                    {item.label}
                  </Link>
                ),
              )}

              {/* Auth-aware: Login link or Dashboard link */}
              {user === null && (
                <Link
                  href="/auth/login"
                  className="px-3.5 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 rounded-lg transition-colors"
                >
                  Login
                </Link>
              )}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-2">
              <Link
                href="/#idea-tools"
                className="hidden lg:inline-flex h-10 items-center px-3.5 text-sm font-medium text-ink-600 hover:text-ink-900 rounded-lg transition-colors"
              >
                Try free tools
              </Link>
              <LanguageToggle variant="icon" />

              {/* Auth-aware CTA area */}
              {user === undefined ? (
                /* Loading state — show placeholder */
                <div className="h-10 w-28 rounded-xl bg-surface-100 animate-pulse" />
              ) : user ? (
                /* Logged in — show user menu */
                <UserMenu user={user} />
              ) : (
                /* Not logged in — show Get your Score */
                <Link href="/score">
                  <Button variant="primary" size="sm" className="h-10 px-5 rounded-xl text-sm font-semibold">
                    Get your Score
                  </Button>
                </Link>
              )}
            </div>

            {/* Hamburger button */}
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-600 hover:bg-surface-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              {open ? (
                <X strokeWidth={1.75} className="h-5 w-5" />
              ) : (
                <Menu strokeWidth={1.75} className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu — separate fixed overlay, NOT inside the navbar */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-label="Navigation menu"
          className="fixed inset-0 z-40 md:hidden"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel — slides in from top, starts below navbar (~72px) */}
          <div className="absolute top-[72px] left-4 right-4 max-h-[calc(100dvh-88px)] overflow-y-auto rounded-2xl border border-surface-200/80 bg-surface-50 dark:bg-surface-100 shadow-2xl">
            <nav
              className="flex flex-col gap-0.5 p-3"
              aria-label="Mobile navigation"
            >
              {navItems.map((item) =>
                isDropdown(item) ? (
                  <MobileDropdownGroup
                    key={item.label}
                    entry={item}
                    onClose={() => setOpen(false)}
                  />
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-ink-700 hover:bg-surface-50 hover:text-ink-900 transition-colors"
                  >
                    {item.label}
                  </Link>
                ),
              )}

              {/* Auth-aware mobile section */}
              <div className="mt-2 pt-3 border-t border-surface-100 flex flex-col gap-2">
                {user ? (
                  <>
                    {/* Logged in — show user info + dashboard link */}
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="h-9 w-9 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {(user.displayName || user.email).split(/[\s@]/)[0][0].toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-800 truncate">{user.displayName || user.email.split("@")[0]}</p>
                        <p className="text-xs text-ink-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <Link href="/dashboard" onClick={() => setOpen(false)}>
                      <Button variant="primary" size="md" className="w-full">
                        Go to Dashboard
                      </Button>
                    </Link>
                    <form action="/api/auth/logout" method="post">
                      <button
                        type="submit"
                        className="w-full py-2 text-center text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors cursor-pointer"
                      >
                        Sign out
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    {/* Not logged in — show score CTA + login */}
                    <Link href="/score" onClick={() => setOpen(false)}>
                      <Button variant="primary" size="md" className="w-full">
                        Get your Score
                      </Button>
                    </Link>
                    <Link
                      href="/auth/login"
                      onClick={() => setOpen(false)}
                      className="py-2 text-center text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      Sign in
                    </Link>
                  </>
                )}
                <Link
                  href="/tools/idea-valuation"
                  onClick={() => setOpen(false)}
                  className="py-2 text-center text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors"
                >
                  Or start free with your idea
                </Link>
                <div className="flex justify-center pt-1">
                  <LanguageToggle variant="pill" />
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function MobileDropdownGroup({
  entry,
  onClose,
}: {
  entry: NavDropdown;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full rounded-xl px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-surface-50 transition-colors"
      >
        {entry.label}
        <ChevronDown
          strokeWidth={1.75}
          className={`h-4 w-4 text-ink-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="ml-3 flex flex-col gap-0.5 border-l-2 border-brand-100 pl-3 mb-1">
          {entry.groups.map((group) => (
            <div key={group.heading}>
              <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-600">
                {group.heading}
              </p>
              {group.items.map((sub) => (
                <Link
                  key={sub.label}
                  href={sub.href}
                  onClick={onClose}
                  className="block rounded-lg px-2 py-2 text-sm text-ink-600 hover:bg-surface-50 hover:text-ink-900 transition-colors"
                >
                  {sub.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsDropdown({ entry }: { entry: NavDropdown }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="inline-flex items-center gap-1 px-3.5 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
      >
        {entry.label}
        <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full pt-2 min-w-[260px]">
          <div className="rounded-2xl border border-surface-200/80 bg-surface-50/98 dark:bg-surface-100/98 backdrop-blur-xl p-3 shadow-xl">
            {entry.groups.map((group, idx) => (
              <div
                key={group.heading}
                className={idx > 0 ? "mt-1 border-t border-surface-200/60 pt-1" : ""}
              >
                <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-600">
                  {group.heading}
                </p>
                {group.items.map((sub) => (
                  <Link
                    key={sub.label}
                    href={sub.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-50 hover:text-ink-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                  >
                    {sub.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
