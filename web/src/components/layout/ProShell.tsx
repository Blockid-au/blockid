/**
 * ProShell — shared "Pro Template" layout wrapper.
 *
 * Minimalist, professional nav + footer applied consistently across
 * public/marketing surfaces (home, pricing, login, /index landing).
 * Two variants:
 *
 *   - variant="landing"  → transparent nav over hero, spacious footer
 *   - variant="app"      → solid nav, compact footer
 *
 * Not applied to /admin or /dashboard shells.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ProShellNavLandingTracker } from "./pro-shell-tracker";

interface ProShellProps {
  children: ReactNode;
  variant?: "landing" | "app";
}

const NAV_LINKS = [
  { href: "/startup-index", label: "Startup Index" },
  { href: "/funding", label: "Get funding" },
  { href: "/pricing", label: "Pricing" },
  { href: "/auth/login", label: "Login" },
] as const;

export function ProShell({ children, variant = "landing" }: ProShellProps) {
  const isLanding = variant === "landing";

  return (
    // Whole ProShell is an intentional dark surface (marketing/pricing/login
    // pages hosted here always run against the deep-navy ground). Scoping
    // the entire subtree with data-theme="dark" retunes the design-system
    // vars so `var(--ds-surface-sunken)` and the raw hex fallbacks below
    // resolve to the correct dark palette.
    <div
      data-theme="dark"
      className="min-h-screen flex flex-col bg-[color:var(--ds-surface-sunken)] text-white/90"
    >
      {isLanding ? <ProShellNavLandingTracker /> : null}

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[color:var(--ds-surface-sunken)]"
      >
        Skip to content
      </a>

      <header
        className={
          isLanding
            ? "absolute top-0 left-0 right-0 z-40"
            : "sticky top-0 z-40 border-b border-white/5 bg-[color:var(--ds-surface-sunken)]/90 backdrop-blur"
        }
      >
        <nav
          aria-label="Primary"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"
        >
          <Link
            href="/"
            aria-label="BlockID — home"
            className="group inline-flex items-center gap-2 font-semibold tracking-tight text-white"
          >
            {/* Decorative brand-gradient tile — keeps the raw hex trio
                (#00D4FF → #7C5CFF → #FF6BD6) because this IS the brand
                gradient signature, not a swappable surface token. */}
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[#00D4FF] via-[#7C5CFF] to-[#FF6BD6] shadow-[0_0_16px_rgba(124,92,255,0.45)]"
            />
            <span className="text-[15px]">
              BlockID<span className="text-white/40">.au</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-[13px] font-medium text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-focus-ring)]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/svi"
              className="ml-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[color:var(--ds-surface-sunken)] transition-colors hover:bg-white/90"
            >
              Get SVI score
            </Link>
          </div>

          {/* Mobile: single primary CTA + Login */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/auth/login"
              className="rounded-md px-3 py-2 text-[13px] font-medium text-white/80 hover:text-white"
            >
              Login
            </Link>
            <Link
              href="/svi"
              className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[color:var(--ds-surface-sunken)]"
            >
              SVI
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      {/* Intentional dark footer — scope with data-theme so the dark
          palette here doesn't leak into siblings via inherited vars. */}
      <footer
        data-theme="dark"
        className={
          "border-t border-white/5 bg-[color:var(--ds-surface-sunken)] text-white/60 " +
          (isLanding ? "py-10" : "py-6")
        }
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          {/* Entity per founder decision Q-A (money-finder plan, 2026-09-10):
              PPL Food PTY LTD site-wide, no ABN/ACN in copy. */}
          <p className="text-[12px]">
            © {new Date().getUTCFullYear()} BlockID · PPL Food PTY LTD
          </p>
          <div className="flex items-center gap-4 text-[12px]">
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/startup-index" className="hover:text-white">
              Startup Index™
            </Link>
            <Link href="/funding" className="hover:text-white">
              Get funding
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ProShell;
