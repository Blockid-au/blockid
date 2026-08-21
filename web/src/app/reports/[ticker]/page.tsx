// /reports/[ticker] — public "trust report" landing per startup.
//
// Investor-first entry point: no auth, no token. Composes the SEO-safe
// public listing view (v_startup_listing_public) with the marketing shell
// so an investor lands directly on the SVI grade + score + one-liner +
// benchmark, with CTAs to (a) request the full data-room / investor pack
// via an investor-link, (b) jump to the graded listings directory.
//
// PII stays on the founder side. This page reads only the whitelisted
// public columns already exposed at /listings/[ticker].

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getListingByTicker } from "@/lib/listings/listings-db";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function normaliseTicker(raw: string): string {
  return decodeURIComponent(raw).trim().toUpperCase();
}

function formatAud(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `A$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `A$${(dollars / 1_000).toFixed(0)}k`;
  return `A$${dollars.toFixed(0)}`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const t = normaliseTicker(ticker);
  const listing = await getListingByTicker(t);
  if (!listing) return { title: `Trust report · ${t} · BlockID.au` };
  const title = `${listing.name} — trust report · BlockID SVI ${listing.svi_grade ?? "unrated"}`;
  const description =
    listing.one_liner ??
    `Investor-ready evaluation for ${listing.name}: BlockID SVI score, benchmark, evidence, and data-room access.`;
  return {
    title,
    description,
    openGraph: { title, description, url: `/reports/${t}` },
  };
}

export default async function TrustReportPage({ params }: PageProps) {
  const { ticker } = await params;
  const t = normaliseTicker(ticker);
  const listing = await getListingByTicker(t);
  if (!listing) notFound();

  const score = listing.svi_score ?? null;
  const grade = listing.svi_grade ?? null;

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Trust report"
        title={listing.name}
        subtitle={
          listing.one_liner ??
          "Investor-ready evaluation composed from the founder's public disclosures and BlockID's Startup Value Index."
        }
      />

      <MarketingSection>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="SVI grade" value={grade ?? "Unrated"} />
          <StatCard
            label="SVI score"
            value={score != null ? String(score) : "—"}
            detail="of 100"
          />
          <StatCard
            label="Latest raise"
            value={formatAud(listing.latest_raise_aud_cents ?? null)}
          />
        </div>
      </MarketingSection>

      <MarketingSection
        kicker="Company snapshot"
        title="Who they are, at a glance"
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <SnapshotRow label="Sector" value={listing.sector ?? "—"} />
          <SnapshotRow label="Stage" value={listing.stage ?? "—"} />
          <SnapshotRow label="HQ" value={listing.hq_state ?? "—"} />
          <SnapshotRow
            label="Website"
            value={
              listing.website_url ? (
                <a
                  href={listing.website_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-600 hover:underline"
                >
                  {listing.website_url}
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>
      </MarketingSection>

      <MarketingSection
        kicker="Take the next step"
        title="Get the full pack"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard
            title="Request the full investor pack"
            body="Ask the founder for the tokenised PDF pack: cap table, DCF, competitive positioning, evidence completeness, and the exit scenarios."
            cta="Request pack"
            href={`/listings/${t}`}
          />
          <ActionCard
            title="Compare with peers"
            body="See how this SVI grade sits within the sector cohort on the Startup Value Index."
            cta="Open the index"
            href="/startup-index"
          />
        </div>
      </MarketingSection>

      <MarketingSection>
        <p className="text-xs text-ink-400">
          Public disclosures composed at read-time from the founder's
          BlockID.au listing. Not investment advice.{" "}
          <Link href={`/listings/${t}`} className="underline">
            View source listing →
          </Link>
        </p>
        <NotFinancialAdvice kind="listing" />
      </MarketingSection>
    </MarketingShell>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl tabular-nums text-ink-800">
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-ink-400">{detail}</p> : null}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-xl border border-surface-200 bg-white/60 px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-ink-500">
        {label}
      </dt>
      <dd className="text-sm text-ink-800">{value}</dd>
    </div>
  );
}

function ActionCard({
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
