/**
 * MarketingFooter — compact 4-column footer for public marketing pages.
 *
 * Server component. Reads `web/content/reports/version.json` at request time
 * to stamp the live build version in the bottom row. If the file is missing
 * or malformed, the version string simply drops away — the rest of the
 * footer keeps rendering. No client JS, no external deps.
 *
 * The colour palette is anchored to the fintech token set that ships in
 * `globals.css` under `@theme` — `--fintech-*` — so the footer stays on
 * palette with the unified marketing shell.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";

type VersionFile = {
  version?: unknown;
};

function readVersionString(): string | null {
  const candidates = [
    path.join(process.cwd(), "content", "reports", "version.json"),
    path.join(process.cwd(), "web", "content", "reports", "version.json"),
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as VersionFile;
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        return parsed.version;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

type FooterColumn = {
  title: string;
  items: { href: string; label: string }[];
};

const COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    items: [
      { href: "/svi", label: "SVI lookup" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Book a demo" },
    ],
  },
  {
    title: "For",
    items: [
      { href: "/for/founder", label: "Founders" },
      { href: "/for/investor", label: "Investors" },
      { href: "/for/advisor", label: "Advisors" },
      { href: "/for/accelerator", label: "Accelerators" },
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
      className="mt-24 border-t border-[var(--fintech-border)] bg-[var(--fintech-bg-primary)] text-[var(--fintech-ink-muted)]"
      aria-labelledby="marketing-footer-heading"
    >
      <h2 id="marketing-footer-heading" className="sr-only">
        Site footer
      </h2>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--fintech-accent)]">
              {col.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-md text-sm text-[var(--fintech-ink-muted)] transition-colors duration-200 hover:text-[var(--fintech-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--fintech-border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--fintech-ink-muted)]">
            Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111 &middot; Sydney NSW
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--fintech-ink-muted)]">
            <span>&copy; {year} Auschain Pty Ltd</span>
            {version ? (
              <span className="font-mono text-[var(--fintech-ink-muted)]">
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
