"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
}

interface NavDropdown {
  label: string;
  items: NavLink[];
}

type NavEntry = NavLink | NavDropdown;

const navItems: NavEntry[] = [
  { href: "/#product", label: "Product" },
  { href: "/#pricing", label: "Pricing" },
  {
    label: "Tools",
    items: [
      { href: "/tools/dilution", label: "Dilution Calculator" },
      { href: "/tools/cap-table", label: "Cap Table Diff" },
      { href: "/tools/term-sheet", label: "Term Sheet AI" },
      { href: "/tools/data-room", label: "Data Room Checklist" },
    ],
  },
  { href: "#", label: "Login" },
];

function isDropdown(item: NavEntry): item is NavDropdown {
  return (item as NavDropdown).items !== undefined;
}

export function Navbar() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="fixed top-4 left-4 right-4 z-50">
      <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-ink-900/70 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {navItems.map((item) =>
              isDropdown(item) ? (
                <ToolsDropdown key={item.label} entry={item} />
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 cursor-pointer rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Link href="/score">
              <Button variant="primary" size="sm" className="h-9">
                Get Score
              </Button>
            </Link>
          </div>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-200 hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
          >
            {open ? (
              <X strokeWidth={1.75} className="h-5 w-5" />
            ) : (
              <Menu strokeWidth={1.75} className="h-5 w-5" />
            )}
          </button>
        </div>
        {open && (
          <div className="md:hidden mt-3 border-t border-white/10 pt-3">
            <nav
              className="flex flex-col gap-1"
              aria-label="Mobile primary"
            >
              {navItems.map((item) =>
                isDropdown(item) ? (
                  <div key={item.label} className="flex flex-col">
                    <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {item.label}
                    </p>
                    {item.items.map((sub) => (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        onClick={() => setOpen(false)}
                        className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 cursor-pointer rounded-md transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 cursor-pointer rounded-md transition-colors"
                  >
                    {item.label}
                  </Link>
                ),
              )}
              <Link
                href="/score"
                onClick={() => setOpen(false)}
                className="mt-2"
              >
                <Button variant="primary" size="md" className="w-full">
                  Get Score
                </Button>
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

function ToolsDropdown({ entry }: { entry: NavDropdown }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  // Close on outside click + Escape.
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
        className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 cursor-pointer rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
      >
        {entry.label}
        <ChevronDown
          strokeWidth={1.75}
          className="h-3.5 w-3.5 opacity-70"
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full pt-2 min-w-[220px]"
        >
          <div className="rounded-xl border border-white/10 bg-ink-900/95 p-1.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            {entry.items.map((sub) => (
              <Link
                key={sub.label}
                href={sub.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
              >
                {sub.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
