/**
 * MarketingShell — the unified layout wrapper for every public marketing
 * page (roadmap, changelog, status, security-audit, demo, svi, /for/*,
 * /legal/*, pricing).
 *
 * Anatomy:
 *   - Skip link to `#main-content` (visible on focus, keyboard-accessible).
 *   - Persistent `NavV2` header (client component, self-scoped dark).
 *   - `<main id="main-content">` on the light-first `bg-surface` ground
 *     with `text-primary` as the base ink colour.
 *   - `MarketingFooter` — shared 4-column public footer, an intentional
 *     dark punctuation band scoped with `data-theme="dark"`.
 *
 * 2026-09-08 (rev.4 rollout): the wrapper used to carry `data-theme="lux"`,
 * which pulled the whole `--ds-*` ramp to the deep-navy dark palette. That
 * made every marketing page dark while the homepage, /analyze, the
 * dashboard, the workspace and admin had all moved to the light-first
 * system — so a visitor got two themes in one session, the switch landing
 * on /pricing. The attribute is gone; the shell now inherits the document
 * light palette and each page styles itself with semantic tokens.
 *
 * The lux CSS in globals.css is retained as an opt-in (three non-marketing
 * surfaces still request it) but nothing under this shell uses it.
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
    <div className="min-h-screen bg-surface text-primary">
      {/* Skip-link for keyboard + screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:items-center focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2 focus:ring-offset-surface"
      >
        Skip to main content
      </a>

      <NavV2 />

      <main
        id="main-content"
        className="relative isolate min-h-[60vh] bg-surface text-primary"
      >
        {children}
      </main>

      <MarketingFooter />
    </div>
  );
}

export default MarketingShell;
