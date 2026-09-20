/**
 * Footer — the ONE public footer (G13-W5-IA5, spec §E S-IA5).
 *
 * Until this sprint two footers closed the public site: `MarketingFooter`
 * (this file, the compact column band under every MarketingShell page)
 * and `site/footer.tsx` (the legacy dark band under ~50 app / docs / tools
 * / auth pages, with a brand block, a Company column, a hard-coded
 * `v3.10.0` chip and the "Not financial advice" line). They drifted: the
 * legacy copy still linked a protected data-room route for a while, and the
 * version chip was two releases stale. `site/footer.tsx` is deleted; the
 * richer content it carried lives here once — brand block, Company column
 * (via `footer-columns.ts`), disclaimer line — on top of the live version
 * stamp this component always had.
 *
 * Server component. Reads `web/content/reports/version.json` at request time
 * to stamp the live build version in the bottom row. If the file is missing
 * or malformed, the version string simply drops away — the rest of the
 * footer keeps rendering. No client JS, no external deps.
 *
 * The footer is an intentional DARK punctuation band that closes every
 * public page — the same footer edge the light-first homepage uses. It
 * self-scopes with `data-theme="dark"` (the ProShell pattern) so the
 * semantic tokens inside resolve against the dark `--ds-*` ramp without
 * leaking that palette into the light page above it.
 *
 * Only semantic tokens are used inside the scope. Never reach for the
 * `ink-*` / `surface-*` numeric ramps here: those INVERT inside a dark
 * scope, so `bg-ink-950` would paint near-white.
 *
 * Entity lines come from `@/lib/site/legal-entity` (G21 P0-A): the brand
 * block names the marketing operator, the bottom row renders
 * `marketingLine()` so both roles (marketing operator · seller of record with
 * its ABN) are explicit on every page. Never hard-code either name here.
 */

import Link from "next/link";
import { MapPin, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PartnerFooterRow } from "@/components/marketing/partner-footer-row";
import { FOOTER_COLUMNS } from "@/components/marketing/footer-columns";
import { LEGAL_ENTITY, marketingLine } from "@/lib/site/legal-entity";
import versionData from "../../../content/reports/version.json";

function readVersionString(): string | null {
  const v = (versionData as { version?: unknown }).version;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Marketing entity (brand block) — the seller of record on invoices is `LEGAL_ENTITY.operator`. */
export const FOOTER_ENTITY: string = LEGAL_ENTITY.marketingOperator;

/** The one disclaimer line every public page closes with (moved from site/footer.tsx, unchanged). */
export const FOOTER_DISCLAIMER =
  "Not financial advice. BlockID is a software platform — engage a licensed adviser for your raise.";

// Columns live in footer-columns.ts. G17 D5 (2026-09-19): four columns —
// Product · For · Company · Legal — identical on every page; the old
// Funding / Case Studies / Docs columns folded into them.
const COLUMNS = FOOTER_COLUMNS;

/**
 * Language switch (G17 D5) — plain links to the EN root and the VI mirror,
 * server-rendered so the footer stays hook-free (the cookie-backed
 * `LocaleSwitcher` lives in the nav for signed-in persistence).
 */
export const FOOTER_LANGUAGES = [
  { code: "en", label: "English", href: "/" },
  { code: "vi", label: "Tiếng Việt", href: "/vi" },
] as const;

export function Footer() {
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
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-6">
        {/* Brand block (from site/footer.tsx) — logo, one-line pitch, entity + residency. */}
        <div className="sm:col-span-2 lg:col-span-2">
          <Logo variant="dark" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-secondary">
            The Startup Value Index — one evidence-backed score for every
            Australian startup, for the people who evaluate them and the
            founders who build them.
          </p>
          <div className="mt-6 space-y-2 text-xs text-secondary">
            <p className="flex items-center gap-2">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-action" aria-hidden="true" />
              <span>{FOOTER_ENTITY}</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin strokeWidth={1.75} className="h-4 w-4 text-action" aria-hidden="true" />
              {/* T0238 — dropped "SOC2 Type II in progress": SOT lists
                  SOC2-lite as an open backlog item, not an audit under
                  way. Keep footer claims to what is true today. */}
              <span>AU data residency. AU Privacy Act 1988 compliant.</span>
            </p>
          </div>
        </div>
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
        <div className="mx-auto max-w-6xl px-6">
          {/* The partner SVGs paint with currentColor, which an <img> cannot inherit → they rendered black on the dark footer (G17 screenshots). */}
          <PartnerFooterRow group="accepted" className="[&_img]:invert [&_img]:opacity-90" />
        </div>
      </div>
      {/* AU support surface — P1 audit 2026-08-23 asked for a visible
          support email, business hours in AEST, and the "AU Privacy Act
          1988 compliant" badge (now truthful after the Privacy rewrite). */}
      <div className="border-t border-line-subtle">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-secondary">
            <span data-testid="footer-entity-line">{marketingLine(year)}</span>
            <span aria-label="Language" role="group" className="inline-flex items-center gap-2">
              {FOOTER_LANGUAGES.map((l, i) => (
                <span key={l.code} className="contents">
                  {i > 0 ? <span aria-hidden="true">&middot;</span> : null}
                  <Link
                    href={l.href}
                    hrefLang={l.code}
                    lang={l.code}
                    className="rounded-md text-secondary transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                  >
                    {l.label}
                  </Link>
                </span>
              ))}
            </span>
            {version ? (
              <Link
                href="/changelog"
                className="rounded-full border border-line-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                aria-label={`View changelog for release ${version}`}
              >
                {version}
              </Link>
            ) : null}
          </p>
          <p className="text-secondary">{FOOTER_DISCLAIMER}</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
