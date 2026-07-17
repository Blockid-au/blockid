/**
 * /svi — hero-search destination.
 *
 * The homepage hero-search form navigates to /svi?query=<x>. This route
 * renders a placeholder "Analysing …" card so the user has a landing surface
 * while the real search-to-scan pipeline is being wired up. For MVP it
 * simply reflects the query back, explains what a full scan involves, and
 * routes them onward to /pricing (paid scan) or /score (self-serve form).
 *
 * Server component. `robots: noindex, nofollow` because the URL is a
 * search-result surface with no static content worth ranking.
 */

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

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

  const heroTitle =
    displayQuery.length > 0 ? `Analysing ${displayQuery}…` : "Search a startup";
  const heroSubtitle =
    displayQuery.length > 0
      ? "We are matching your query against public filings, product signals, and comparable-round data. A live SVI badge and short evidence chain will appear here once the streaming lookup ships."
      : "Type a company name in the homepage search bar to see a live investor-readiness lookup. Full scans take about 30 seconds and pull from ASIC, LinkedIn, product signals, and comparables.";

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Investor-readiness lookup"
        title={heroTitle}
        subtitle={heroSubtitle}
        primaryCta={{
          href: "/pricing?utm_source=svi_placeholder",
          label: "Run a full scan",
        }}
        secondaryCta={{ href: "/score", label: "Free self-serve form" }}
      />

      <section
        aria-label="Scan details"
        className="mx-auto max-w-5xl px-6 py-6 sm:py-10"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
              What a full scan returns
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--fintech-ink-muted)]">
              <li>SVI score across 13 evaluation criteria.</li>
              <li>Valuation snapshot (DCF, Berkus, Scorecard, comps).</li>
              <li>Cap-table + ESOP dilution modelling.</li>
              <li>Shareable investor-pack PDF.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
              Next step
            </p>
            <p className="mt-3 text-sm text-[var(--fintech-ink-muted)]">
              Run a paid scan for the full 8-dimension breakdown, or take the
              free self-serve form for a top-line snapshot in under two
              minutes.
            </p>
          </div>
        </div>
      </section>

      <MarketingSection
        tone="elevated"
        title="Why founders run a full scan"
        kicker="Signal"
      >
        <p className="text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
          The free self-serve form gives you a top-line number. A full scan
          gives you the evidence chain — every score anchored to a source
          you can inspect, plus a shareable investor-pack PDF that dulls
          the sharp edges of a cold intro.
        </p>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Turn the lookup into a live investor pack."
        primary={{ href: "/pricing?utm_source=svi_cta", label: "Choose a plan" }}
        secondary={{ href: "/demo", label: "Book a demo" }}
      />
    </MarketingShell>
  );
}
