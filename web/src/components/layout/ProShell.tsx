/**
 * ProShell — shared "Pro Template" layout wrapper.
 *
 * Minimalist, professional nav + footer applied consistently across
 * public/marketing surfaces (home, pricing, login, /index landing,
 * founding-50). Two variants:
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
  { href: "/index", label: "Startup Index" },
  { href: "/founding-50", label: "Founding 100" },
  { href: "/pricing", label: "Pricing" },
  { href: "/auth/login", label: "Login" },
] as const;

export function ProShell({ children, variant = "landing" }: ProShellProps) {
  const isLanding = variant === "landing";

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0F1E] text-white/90">
      {isLanding ? <ProShellNavLandingTracker /> : null}

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0A0F1E]"
      >
        Skip to content
      </a>

      <header
        className={
          isLanding
            ? "absolute top-0 left-0 right-0 z-40"
            : "sticky top-0 z-40 border-b border-white/5 bg-[#0A0F1E]/90 backdrop-blur"
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
                className="rounded-md px-3 py-2 text-[13px] font-medium text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/svi"
              className="ml-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0A0F1E] transition-colors hover:bg-white/90"
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
              className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#0A0F1E]"
            >
              SVI
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer
        className={
          "border-t border-white/5 bg-[#070B17] text-white/60 " +
          (isLanding ? "py-10" : "py-6")
        }
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <p className="text-[12px]">
            © {new Date().getFullYear()} BlockID · Auschain PTY LTD · ACN
            659&nbsp;615&nbsp;111
          </p>
          <div className="flex items-center gap-4 text-[12px]">
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/index" className="hover:text-white">
              Startup Index™
            </Link>
            <Link href="/founding-50" className="hover:text-white">
              Founding 100
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ProShell;
