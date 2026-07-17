// /listings/[ticker] — public detail page for a single startup listing.
//
// T-1300 first-scaffold for Goal 5C. Server-rendered. Metadata is composed
// per-listing so each URL is Google-friendly.
//
// The view enforces is_public = true; a missing ticker → notFound() → 404.
// PII columns (startup_id, event history) are never fetched here.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import {
  getListingByTicker,
  getPublicListings,
  type Listing,
} from "@/lib/listings/listings-db";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function normaliseTicker(raw: string): string {
  return decodeURIComponent(raw).trim().toUpperCase();
}

function formatAud(cents: number | null): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `A$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `A$${(dollars / 1_000).toFixed(0)}k`;
  return `A$${dollars.toFixed(0)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const normalised = normaliseTicker(ticker);
  const listing = await getListingByTicker(normalised);
  const canonical = `https://blockid.au/listings/${normalised}`;

  if (!listing) {
    return {
      title: `${normalised} — Listing not found — BlockID.au`,
      description: "This startup listing is not available.",
      robots: { index: false, follow: false },
      alternates: { canonical },
    };
  }

  const parts: string[] = [];
  if (listing.sector) parts.push(listing.sector);
  if (listing.stage) parts.push(listing.stage);
  if (listing.hq_state) parts.push(listing.hq_state);
  const sub = parts.length ? parts.join(" · ") : "AU startup";
  const description =
    listing.one_liner ??
    `${listing.name} — SVI-graded Australian startup profile on BlockID.au (${sub}).`;

  return {
    title: `${listing.name} (${listing.ticker}) — ${sub} — BlockID.au`,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title: `${listing.name} (${listing.ticker}) — BlockID.au`,
      description,
      url: canonical,
      type: "profile",
    },
  };
}

export default async function StartupListingPage({ params }: PageProps) {
  const { ticker } = await params;
  const normalised = normaliseTicker(ticker);
  const listing = await getListingByTicker(normalised);
  if (!listing) notFound();

  // Comparable set — top-5 other listings in the same sector, similar SVI
  // band. This is a coarse first pass; a proper comparable-set query lands
  // in T-1308.
  const comparables = await loadComparables(listing);

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow={`Ticker · ${listing.ticker}`}
        title={listing.name}
        subtitle={listing.one_liner ?? undefined}
        primaryCta={{ href: "/score", label: "Score my startup" }}
        secondaryCta={{ href: "/index", label: "Back to index" }}
      />

      <MarketingSection>
        <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-3">
          <SviCard listing={listing} />
          <SnapshotCard listing={listing} />
          <RaiseCard listing={listing} />
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="mx-auto max-w-6xl px-6">
          <ComparableSet listings={comparables} />
          <div className="mt-8">
            <NotFinancialAdvice kind="not_financial_advice" compact />
          </div>
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}

// ---------------------------------------------------------------------------
// Comparable-set loader — same sector, +/- 15 SVI band, exclude self,
// capped at 5. Loads a wider window then filters in-memory so the SEO
// surface still renders even when the sector has few peers.
// ---------------------------------------------------------------------------

async function loadComparables(anchor: Listing): Promise<Listing[]> {
  if (!anchor.sector) return [];
  const pool = await getPublicListings({
    limit: 50,
    sector: anchor.sector,
    sortBy: "svi_score",
  });

  const anchorScore = anchor.svi_score;
  const band = 15;

  return pool
    .filter((row) => row.ticker !== anchor.ticker)
    .filter((row) => {
      if (anchorScore == null || row.svi_score == null) return true;
      return Math.abs(row.svi_score - anchorScore) <= band;
    })
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Presentational cards — all server components.
// ---------------------------------------------------------------------------

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)]/60 p-6"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--fintech-ink-muted)]">
        {title}
      </h2>
      <div className="mt-3 text-sm text-[var(--fintech-ink)]">{children}</div>
    </section>
  );
}

function SviCard({ listing }: { listing: Listing }) {
  return (
    <Card title="SVI">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-4xl font-semibold text-[var(--fintech-ink)]">
          {listing.svi_grade ?? "—"}
        </span>
        <span className="text-lg text-[var(--fintech-ink-muted)]">
          {listing.svi_score != null ? listing.svi_score : "—"}
        </span>
      </div>
      <p className="mt-3 text-xs text-[var(--fintech-ink-muted)]">
        Last updated {formatDate(listing.updated_at)}
      </p>
      <p className="mt-4 text-xs leading-relaxed text-[var(--fintech-ink-muted)]">
        SVI is BlockID.au&apos;s 13-criteria composite score for AU startups.{" "}
        <Link
          href="/svi"
          className="rounded text-[var(--fintech-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)]"
        >
          Methodology
        </Link>
      </p>
    </Card>
  );
}

function SnapshotCard({ listing }: { listing: Listing }) {
  return (
    <Card title="Company snapshot">
      <dl className="grid grid-cols-1 gap-y-2">
        <SnapshotRow label="Sector" value={listing.sector} />
        <SnapshotRow label="Stage" value={listing.stage} />
        <SnapshotRow label="HQ state" value={listing.hq_state} />
        <SnapshotRow
          label="Website"
          value={
            listing.website_url ? (
              <a
                href={listing.website_url}
                rel="nofollow noopener noreferrer"
                target="_blank"
                className="rounded text-[var(--fintech-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)]"
              >
                {listing.website_url.replace(/^https?:\/\//, "")}
              </a>
            ) : null
          }
        />
        <SnapshotRow label="Listed" value={formatDate(listing.listed_at)} />
      </dl>
    </Card>
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
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--fintech-border)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs uppercase tracking-wider text-[var(--fintech-ink-muted)]">
        {label}
      </dt>
      <dd className="text-right text-sm text-[var(--fintech-ink)]">
        {value ?? <span className="text-[var(--fintech-ink-muted)]">—</span>}
      </dd>
    </div>
  );
}

function RaiseCard({ listing }: { listing: Listing }) {
  return (
    <Card title="Latest raise">
      <p className="font-display text-3xl font-semibold text-[var(--fintech-ink)]">
        {formatAud(listing.latest_raise_aud_cents)}
      </p>
      <p className="mt-3 text-xs text-[var(--fintech-ink-muted)]">
        Sourced from the founder&apos;s workspace declaration. Full raise
        history lands in a later scaffold.
      </p>
    </Card>
  );
}

function ComparableSet({ listings }: { listings: Listing[] }) {
  return (
    <section
      aria-labelledby="comparables-heading"
      className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)]/40 p-6"
    >
      <h2
        id="comparables-heading"
        className="text-xs font-semibold uppercase tracking-wider text-[var(--fintech-ink-muted)]"
      >
        Comparable set
      </h2>
      {listings.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--fintech-ink-muted)]">
          No peers in the same sector and SVI band yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--fintech-border)]">
          {listings.map((row) => (
            <li key={row.ticker} className="flex items-center justify-between gap-4 py-3">
              <div>
                <Link
                  href={`/listings/${encodeURIComponent(row.ticker)}`}
                  className="rounded font-medium text-[var(--fintech-ink)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)]"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-[var(--fintech-ink-muted)]">
                  {row.ticker}
                  {row.stage ? ` · ${row.stage}` : ""}
                  {row.hq_state ? ` · ${row.hq_state}` : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--fintech-border-strong)] px-3 py-1 text-xs font-semibold text-[var(--fintech-ink)]">
                {row.svi_grade ?? "—"}
                {row.svi_score != null ? (
                  <span className="text-[var(--fintech-ink-muted)]">{row.svi_score}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
