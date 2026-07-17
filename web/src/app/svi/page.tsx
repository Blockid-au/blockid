/**
 * /svi — hero-search destination.
 *
 * The homepage hero-search form navigates to /svi?query=<x>. This route
 * renders a placeholder "Analysing …" card so the user has a landing surface
 * while the real search-to-scan pipeline is being wired up (tracked under
 * T-0319, ships with /svi live-lookup and streaming SVI badge). For MVP it
 * simply reflects the query back, explains what a full scan involves, and
 * routes them onward to /pricing (paid scan) or /score (self-serve form).
 *
 * Server component. `robots: noindex, nofollow` because the URL is a
 * search-result surface with no static content worth ranking; keeping it out
 * of the index avoids duplicate-thin-content signals during the MVP phase.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

const SITE_URL = "https://blockid.au";
const MAX_QUERY_LEN = 120;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Startup search — BlockID.au",
  description:
    "Reflect a queried company name and route to a full investor-readiness scan.",
  alternates: { canonical: `${SITE_URL}/svi` },
  robots: { index: false, follow: false },
};

function firstString(
  raw: string | string[] | undefined,
): string {
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0] : "";
  return typeof raw === "string" ? raw : "";
}

function sanitiseQuery(raw: string): string {
  // Strip control chars, cap length. This value renders inline as text — it
  // is not eval'd, dangerouslySetInnerHTML'd, or concatenated into a URL.
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    out += ch;
  }
  return out.trim().slice(0, MAX_QUERY_LEN);
}

export default async function SVISearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = sanitiseQuery(firstString(sp.query));
  const displayQuery = query.length > 0 ? query : "";

  return (
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <NavV2 />

      <main className="mx-auto max-w-4xl px-4 pb-24 pt-12 sm:px-6">
        <div className="rounded-2xl border border-brand-cyan/20 bg-brand-navy/60 p-8 shadow-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
            <Search aria-hidden="true" className="h-3.5 w-3.5" />
            Investor-readiness lookup
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            {displayQuery.length > 0
              ? `Analysing ${displayQuery}…`
              : "Search a startup"}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-brand-ink-muted">
            {displayQuery.length > 0
              ? "We are matching your query against public filings, product signals, and comparable-round data. A live SVI badge and short evidence chain will appear here once the streaming lookup ships."
              : "Type a company name in the homepage search bar to see a live investor-readiness lookup. Full scans take about 30 seconds and pull from ASIC, LinkedIn, product signals, and comparables."}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-brand-navy p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-cyan">
                What a full scan returns
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-brand-ink-muted">
                <li>SVI score across 13 evaluation criteria.</li>
                <li>Valuation snapshot (DCF, Berkus, Scorecard, comps).</li>
                <li>Cap-table + ESOP dilution modelling.</li>
                <li>Shareable investor-pack PDF.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-brand-navy p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-cyan">
                Next step
              </p>
              <p className="mt-3 text-sm text-brand-ink-muted">
                Run a paid scan for the full 8-dimension breakdown, or take the
                free self-serve form for a top-line snapshot in under two
                minutes.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing?utm_source=svi_placeholder"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-cyan px-5 text-sm font-semibold text-brand-navy transition duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Run a full scan
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/score"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-ink/20 px-5 text-sm font-semibold text-brand-ink transition-colors duration-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              Free self-serve form
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 bg-brand-navy-deep">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-brand-ink-muted">
              &copy; {new Date().getFullYear()} Auschain Pty Ltd (ACN 659 615
              111). BlockID.au.
            </p>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap items-center gap-4 text-xs text-brand-ink-muted">
                <li>
                  <Link href="/pricing" className="hover:text-brand-ink">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/changelog" className="hover:text-brand-ink">
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-brand-ink">
                    Privacy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-6">
            <NotFinancialAdvice kind="not_financial_advice" compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
