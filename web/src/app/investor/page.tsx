// /investor — public investor landing page.
//
// Anonymous, no login. Answers "I am an investor, where do I find trust
// reports?" in one screen. Uses the same MarketingShell as /for/investor
// but keeps the shorter, memorable URL for the top-nav dropdown.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { getPublicListings } from "@/lib/listings/listings-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Investor home · BlockID.au trust reports",
  description:
    "Browse Australian startups with a BlockID SVI grade, open a trust report in one click, and request the full data-room pack.",
  openGraph: {
    title: "Investor home · BlockID.au",
    description:
      "Browse graded Australian startups and open their trust reports without signing up.",
  },
};

export default async function InvestorPage() {
  const featured = await getPublicListings({ sortBy: "svi_score", limit: 8 });

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="For investors"
        title="Trust reports without the back-and-forth"
        subtitle="Open a founder's SVI grade, evidence completeness and headline financials from one page — no login required. Request the full pack in one click when you're ready."
      />

      <MarketingSection>
        <div className="grid gap-4 sm:grid-cols-3">
          <PathCard
            title="Browse startups"
            body="Filter the public index by sector, stage, HQ and SVI grade."
            cta="Open directory"
            href="/listings"
          />
          <PathCard
            title="Startup Value Index"
            body="See how each grade compares within its sector cohort."
            cta="View index"
            href="/startup-index"
          />
          <PathCard
            title="Sample trust report"
            body="Reference SVI report + investor pack (fully-populated demo)."
            cta="Open sample"
            href="/showcase/atlassian?step=1"
          />
        </div>
      </MarketingSection>

      {featured.length > 0 && (
        <MarketingSection
          kicker="Top SVI grades this week"
          title="Featured startups"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((l) => (
              <Link
                key={l.ticker}
                href={`/reports/${l.ticker}`}
                className="group block rounded-xl border border-surface-200 bg-white p-4 transition-colors hover:border-brand-500/50"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
                  {l.sector ?? "—"} · {l.hq_state ?? "AU"}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink-800">
                  {l.name}
                </p>
                {l.one_liner ? (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                    {l.one_liner}
                  </p>
                ) : null}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="font-mono text-lg tabular-nums text-ink-800">
                    {l.svi_score ?? "—"}
                  </span>
                  <span className="text-xs font-medium text-brand-600 group-hover:underline">
                    Open trust report →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </MarketingSection>
      )}

      <MarketingSection
        kicker="Why BlockID"
        title="Every score has receipts"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReasonRow
            title="Evidence-linked"
            body="Every SVI dimension carries a completeness percentage and links to its underlying evidence — not just a vibe."
          />
          <ReasonRow
            title="AU-specific"
            body="Benchmarks priced in AUD, ESIC / R&D Tax Incentive treatment built in, ASIC-consistent disclosures."
          />
          <ReasonRow
            title="Founder-mediated"
            body="Full data-room access still runs through the founder — investors request; founders authorise."
          />
        </ul>
      </MarketingSection>
    </MarketingShell>
  );
}

function PathCard({
  title,
  body,
  cta,
  href,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-surface-200 bg-white p-5 transition-colors hover:border-brand-500/50"
    >
      <h3 className="text-lg font-semibold text-ink-800">{title}</h3>
      <p className="mt-2 text-sm text-ink-500">{body}</p>
      <span className="mt-4 inline-flex text-sm font-medium text-brand-600 group-hover:underline">
        {cta} →
      </span>
    </Link>
  );
}

function ReasonRow({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-xl border border-surface-200 bg-white p-4">
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 text-xs text-ink-500">{body}</p>
    </li>
  );
}
