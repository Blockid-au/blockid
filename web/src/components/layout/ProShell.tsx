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
import { marketingLine } from "@/lib/site/legal-entity";
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
    // G26: the shell renders on the light template — sunken page, white
    // header with a 1 px line, navy primary CTA, dark ink text.
    <div
      className="min-h-screen flex flex-col bg-surface-sunken text-primary"
    >
      {isLanding ? <ProShellNavLandingTracker /> : null}

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Skip to content
      </a>

      <header
        className={
          isLanding
            ? "absolute top-0 left-0 right-0 z-40"
            : "sticky top-0 z-40 border-b border-line-subtle bg-surface/90 backdrop-blur"
        }
      >
        <nav
          aria-label="Primary"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"
        >
          <Link
            href="/"
            aria-label="BlockID — home"
            className="group inline-flex items-center gap-2 font-semibold tracking-tight text-primary"
          >
            {/* Decorative brand tile on the navy action token (G26). */}
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 rounded-md bg-action shadow-1"
            />
            <span className="text-[15px]">
              BlockID<span className="text-action">.au</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/analyze"
              className="ml-2 rounded-full bg-action px-4 py-2 min-h-11 text-[13px] font-semibold text-on-action transition-colors hover:bg-action-hover"
            >
              Get SVI score
            </Link>
          </div>

          {/* Mobile: single primary CTA + Login */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/auth/login"
              className="rounded-md px-3 py-2 text-[13px] font-medium text-muted hover:text-primary"
            >
              Login
            </Link>
            <Link
              href="/analyze"
              className="rounded-full bg-action px-3.5 py-1.5 min-h-11 text-[13px] font-semibold text-on-action"
            >
              SVI
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      {/* Light sunken footer (G26). */}
      <footer
        className={
          "border-t border-line-subtle bg-surface-sunken text-muted " +
          (isLanding ? "py-10" : "py-6")
        }
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          {/* G21 P0-A: one entity line from lib/site/legal-entity — both
              roles explicit (marketing operator · seller of record + ABN). */}
          <p className="text-[12px]">{marketingLine(new Date().getUTCFullYear())}</p>
          <div className="flex items-center gap-4 text-[12px]">
            <Link href="/legal/privacy" className="hover:text-primary">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-primary">
              Terms
            </Link>
            <Link href="/startup-index" className="hover:text-primary">
              Startup Index™
            </Link>
            <Link href="/funding" className="hover:text-primary">
              Get funding
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ProShell;
