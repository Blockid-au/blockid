/**
 * MarketingShell — the unified layout wrapper for every public marketing
 * page (roadmap, changelog, status, security-audit, demo, svi, /for/*,
 * /legal/*, pricing).
 *
 * Anatomy:
 *   - Skip link to `#main-content` (visible on focus, keyboard-accessible).
 *   - Persistent `NavV2` header (client component, self-contained).
 *   - `<main id="main-content">` with the fintech deep-navy background,
 *     a subtle radial gradient decorative layer (no external asset), and
 *     `text-[var(--fintech-ink)]` as the base ink colour.
 *   - `MarketingFooter` — shared 4-column public footer.
 *
 * The outer wrapping div carries `data-theme="lux"` so the `[data-theme=lux]`
 * overrides in `globals.css` (buttons/cards) automatically reskin
 * homepage-shared elements to the same fintech palette.
 *
 * Server component. No client state. Children may be either server or
 * client components.
 */

import type { ReactNode } from "react";
import { NavV2 } from "@/components/landing/nav-v2";
import { MarketingFooter } from "./marketing-footer";

interface MarketingShellProps {
  children: ReactNode;
}

export function MarketingShell({ children }: MarketingShellProps) {
  return (
    <div
      data-theme="lux"
      className="min-h-screen bg-[var(--fintech-bg-primary)] text-[var(--fintech-ink)]"
    >
      {/* Skip-link for keyboard + screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:items-center focus:rounded-lg focus:bg-[var(--fintech-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--fintech-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--fintech-accent)] focus:ring-offset-2 focus:ring-offset-[var(--fintech-bg-primary)]"
      >
        Skip to main content
      </a>

      <NavV2 />

      <main
        id="main-content"
        className="relative isolate min-h-[60vh] bg-[var(--fintech-bg-primary)] text-[var(--fintech-ink)]"
      >
        {/* Subtle decorative radial gradient — single background-image, no
             external asset. `pointer-events-none` + `aria-hidden` so it never
             intercepts interaction or reaches assistive tech. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(60% 40% at 50% -10%, rgba(34, 211, 238, 0.14) 0%, rgba(34, 211, 238, 0) 60%), radial-gradient(50% 40% at 90% 20%, rgba(168, 85, 247, 0.10) 0%, rgba(168, 85, 247, 0) 65%)",
          }}
        />
        {children}
      </main>

      <MarketingFooter />
    </div>
  );
}

export default MarketingShell;
