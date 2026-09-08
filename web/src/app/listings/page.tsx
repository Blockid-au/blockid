// /listings — public AU Startup Directory (searchable browse-all page).
//
// T-1300 first-scaffold for Goal 5C. Sibling to the BSI-AU brand /index
// page and to /listings/[ticker] detail pages. Reads via
// getPublicListings() which safely degrades to an empty list before the
// 0082 migration has been applied.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getPublicListings, type Listing } from "@/lib/listings/listings-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Australian Startup Directory — BlockID.au",
  description:
    "Public directory of Australian startups with BlockID SVI grades. Browse by sector, stage, or state.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/listings" },
  openGraph: {
    title: "Australian Startup Directory — BlockID.au",
    description:
      "Browse Australian startups by sector, stage, or state. SVI grade + latest raise per listing.",
    url: "https://blockid.au/listings",
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
  },
};

function EmptyState(): ReactNode {
  return (
    <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-8 text-center">
      <p className="text-lg font-semibold text-primary">
        Be the first startup in your sector.
      </p>
      <p className="mt-2 text-sm text-secondary">
        List yours in under 5 minutes and get an SVI grade on day one.
      </p>
      <Link
        href="/workspace/listings/new"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action hover:opacity-90"
      >
        List your startup
      </Link>
    </div>
  );
}

function Row({ listing }: { listing: Listing }): ReactNode {
  return (
    <tr className="border-t border-line-subtle hover:bg-surface-raised/60">
      <td className="px-4 py-3 font-mono text-sm text-action">
        <Link href={`/listings/${listing.ticker}`}>{listing.ticker}</Link>
      </td>
      <td className="px-4 py-3 text-sm text-primary">
        <Link href={`/listings/${listing.ticker}`} className="hover:underline">
          {listing.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-secondary">{listing.sector ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-secondary">{listing.svi_grade ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-secondary">
        {listing.latest_raise_aud_cents
          ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(listing.latest_raise_aud_cents / 100)
          : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-secondary">{listing.hq_state ?? "—"}</td>
    </tr>
  );
}

export default async function ListingsDirectoryPage() {
  const listings = await getPublicListings({ limit: 200, sortBy: "recent" });

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Directory"
        title="Australian startup directory"
        subtitle="Every public BlockID listing. Filter by sector or stage, click through for SVI + team + raise history."
        primaryCta={{ href: "/workspace/listings/new", label: "List your startup" }}
        secondaryCta={{ href: "/index", label: "See the index" }}
      />
      <MarketingSection kicker="Browse" title={`${listings.length} public listing${listings.length === 1 ? "" : "s"}`}>
        {listings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line-subtle">
            <table className="w-full">
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ticker</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">SVI grade</th>
                  <th className="px-4 py-3 font-semibold">Latest raise</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <Row key={l.ticker} listing={l} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarketingSection>
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <NotFinancialAdvice kind="not_financial_advice" compact />
      </div>
    </MarketingShell>
  );
}
