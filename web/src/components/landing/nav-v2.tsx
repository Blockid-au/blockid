"use client";

/**
 * NavV2 — persistent header for the Homepage v2 lux theme.
 *
 * The v2 render tree previously had NO nav/header at all (the shared
 * <Navbar/> is only wired into the legacy V1 <SVIEntrance/> tree), which
 * left the wireframe's `[Logo] Product Pricing Investors [Sign in][Start
 * free]` bar missing entirely — no way to navigate the site, no
 * persistent brand mark, no sign-in affordance above the fold.
 *
 * This is a lightweight, self-contained client component (no new deps):
 *  - Sticky top bar, semantic <header>/<nav aria-label="Primary">.
 *  - "Beta" badge next to the wordmark so early users know this is the
 *    v2.0-beta surface (gated by NEXT_PUBLIC_UPGRADE_V2).
 *  - Desktop link row + mobile disclosure menu (keyboard + focus-visible
 *    accessible, aria-expanded/aria-controls wired correctly).
 */

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS: { href: string; label: string }[] = [
  { href: "#product", label: "Product" },
  { href: "#pricing-anchor", label: "Pricing" },
  { href: "/for/investors", label: "Investors" },
  { href: "#faq", label: "Docs" },
];

export function NavV2() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-brand-gold/10 bg-brand-navy/85 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-base font-semibold text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
        >
          BlockID<span className="text-brand-gold">.au</span>
          <span className="inline-flex items-center rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-cyan">
            Beta
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/auth/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            Sign in
          </Link>
          <Link
            href="/signup?trial=7d"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-gold px-4 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-gold-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Start free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-ink md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          aria-expanded={open}
          aria-controls="nav-v2-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* Mobile panel */}
      {open && (
        <div
          id="nav-v2-mobile-menu"
          className="border-t border-brand-gold/10 bg-brand-navy px-4 pb-4 pt-2 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-brand-ink-muted hover:bg-white/5 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-brand-ink-muted hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Sign in
            </Link>
            <Link
              href="/signup?trial=7d"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-gold px-4 text-sm font-semibold text-brand-navy hover:bg-brand-gold-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default NavV2;
