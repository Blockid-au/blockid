/**
 * MarketingFooter — compact 4-column footer for public marketing pages.
 *
 * Server component. Reads `web/content/reports/version.json` at request time
 * to stamp the live build version in the bottom row. If the file is missing
 * or malformed, the version string simply drops away — the rest of the
 * footer keeps rendering. No client JS, no external deps.
 *
 * The footer is an intentional DARK punctuation band that closes every
 * marketing page — the same footer edge the light-first homepage uses. It
 * self-scopes with `data-theme="dark"` (the ProShell pattern) so the
 * semantic tokens inside resolve against the dark `--ds-*` ramp without
 * leaking that palette into the light page above it.
 *
 * Only semantic tokens are used inside the scope. Never reach for the
 * `ink-*` / `surface-*` numeric ramps here: those INVERT inside a dark
 * scope, so `bg-ink-950` would paint near-white.
 */

import Link from "next/link";
import { PartnerFooterRow } from "@/components/marketing/partner-footer-row";
import versionData from "../../../content/reports/version.json";

function readVersionString(): string | null {
  const v = (versionData as { version?: unknown }).version;
  return typeof v === "string" && v.length > 0 ? v : null;
}

type FooterColumn = {
  title: string;
  items: { href: string; label: string }[];
};

const COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    items: [
      // B1 Task 5 — canonical SVI URL is /index (was /svi; now 301-redirected).
      { href: "/index", label: "SVI lookup" },
      { href: "/one-click-report", label: "One-Click Report · A$3" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Book a demo" },
    ],
  },
  {
    title: "For",
    items: [
      // B1 Task 3/4 — /for/{founder,investor,accelerator} now 301 → /solutions/*.
      { href: "/solutions/founder", label: "Founders" },
      { href: "/solutions/investor", label: "Investors" },
      { href: "/for/advisor", label: "Advisors" },
      { href: "/solutions/accelerator", label: "Accelerators" },
    ],
  },
  // ux-ia-startup-flow-v1 §C.7 — Case Studies column so the Demo walkthrough
  // is discoverable from every marketing footer, not just the top-nav.
  {
    title: "Case Studies",
    items: [
      { href: "/showcase/atlassian?step=1", label: "Atlassian (live demo)" },
      { href: "/showcase/canva", label: "Canva" },
      { href: "/showcase/xero", label: "Xero" },
      { href: "/showcase/safetyculture", label: "SafetyCulture" },
      { href: "/showcase", label: "All case studies" },
    ],
  },
  {
    title: "Docs",
    items: [
      { href: "/team", label: "Team" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/changelog", label: "Changelog" },
      { href: "/status", label: "Status" },
      { href: "/security-audit", label: "Security audit" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/disclaimers", label: "Disclaimers" },
    ],
  },
];

export function MarketingFooter() {
  const version = readVersionString();
  const year = new Date().getUTCFullYear();
  return (
    <footer
      data-theme="dark"
      className="mt-24 border-t border-line-subtle bg-surface text-secondary"
      aria-labelledby="marketing-footer-heading"
    >
      <h2 id="marketing-footer-heading" className="sr-only">
        Site footer
      </h2>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-action">
              {col.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-md text-sm text-secondary transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* Curator-controlled accelerator strip — renders NOTHING when the
          partners config is empty. Inherits footer ink via currentColor. */}
      <div className="border-t border-line-subtle text-secondary">
        <div className="mx-auto max-w-7xl px-6">
          <PartnerFooterRow group="accepted" />
        </div>
      </div>
      {/* AU support surface — P1 audit 2026-08-23 asked for a visible
          support email, business hours in AEST, and the "AU Privacy Act
          1988 compliant" badge (now truthful after the Privacy rewrite). */}
      <div className="border-t border-line-subtle">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 text-xs text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="mailto:support@blockid.au"
              className="rounded-md text-action underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              support@blockid.au
            </a>
            <span>Mon&ndash;Fri 9:00&ndash;18:00 AEST</span>
            <span className="inline-flex items-center rounded-full border border-line-subtle px-2 py-0.5 uppercase tracking-[0.14em] text-[10px] text-secondary">
              AU-based support
            </span>
          </p>
          <p className="text-secondary">
            AU Privacy Act 1988 compliant &middot; AU data residency
          </p>
        </div>
      </div>
      <div className="border-t border-line-subtle">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-secondary">
            PPL Food PTY LTD
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-secondary">
            <span>&copy; {year} PPL Food PTY LTD</span>
            {version ? (
              <span className="font-mono text-secondary">
                {version}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default MarketingFooter;
