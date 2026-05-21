"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
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
  { href: "/insights", label: "Insights" },
  { href: "/auth/login", label: "Login" },
];

function isDropdown(item: NavEntry): item is NavDropdown {
  return (item as NavDropdown).groups !== undefined;
}

export function Navbar() {
  const [open, setOpen] = React.useState(false);

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
              <Link href="/score">
                <Button variant="primary" size="sm" className="h-10 px-5 rounded-xl text-sm font-semibold">
                  Get your Score
                </Button>
              </Link>
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
          <div className="absolute top-[72px] left-4 right-4 max-h-[calc(100dvh-88px)] overflow-y-auto rounded-2xl border border-surface-200/80 bg-white shadow-2xl">
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

              <div className="mt-2 pt-3 border-t border-surface-100 flex flex-col gap-2">
                <Link href="/score" onClick={() => setOpen(false)}>
                  <Button variant="primary" size="md" className="w-full">
                    Get your Score
                  </Button>
                </Link>
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
          <div className="rounded-2xl border border-surface-200/80 bg-white/98 backdrop-blur-xl p-3 shadow-xl">
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
