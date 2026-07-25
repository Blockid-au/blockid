/**
 * /startup/[slug] — public Startup Package listing (subgoal 9).
 *
 * Server component (RSC). Reads a founder's public Package listing:
 *   - projects row keyed by slug (must have package_purchased_at)
 *   - latest svi_snapshots row
 *   - assembled_reports rows where report_type LIKE 'package_step_%' AND
 *     public=true
 *   - reserved cap-table allocation summary
 *
 * When the project either doesn't exist, hasn't purchased the Package,
 * or has zero public interview answers + zero public reports, the page
 * returns notFound() so the URL surfaces a clean 404 (never an empty
 * skeleton page).
 *
 * Prerender-friendly: generateStaticParams returns the top 50 by SVI at
 * build time; the rest are ISR (60s revalidate) so a fresh purchase
 * appears without a rebuild.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles, Coins, Mail } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import {
  listTopSlugs,
  loadPublicListing,
  type PublicListingPayload,
} from "@/lib/startup-package/public-listing";

const SITE_URL = "https://blockid.au";

// ISR — every 60s any /startup/[slug] not covered by generateStaticParams
// re-renders on next request. Keeps the SVI badge fresh without a redeploy.
export const revalidate = 60;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  // Best-effort — if the DB isn't reachable during the build, the caller
  // pattern (Next.js swallowing throw) still lets ISR pick up on-demand.
  try {
    const slugs = await listTopSlugs(50);
    return slugs.map((slug) => ({ slug }));
  } catch {
    // Also swallow the build-time filesystem probe below so `pnpm build`
    // in an env without Supabase env vars doesn't blow up.
    return safeSlugsFromDisk();
  }
}

/** Optional dev-mode source: content/reports fixtures list of slugs. */
async function safeSlugsFromDisk(): Promise<{ slug: string }[]> {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports"),
    path.join(process.cwd(), "content", "reports"),
  ];
  for (const dir of candidates) {
    try {
      const entries = await fs.readdir(dir);
      const slugs = entries
        .filter((f) => f.startsWith("startup-package-"))
        .map((f) => f.replace(/^startup-package-/, "").replace(/\..*$/, ""));
      if (slugs.length > 0) return slugs.map((slug) => ({ slug }));
    } catch {
      // continue
    }
  }
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await loadPublicListing(slug);
  if (!listing) {
    return {
      title: "Startup listing — BlockID.au",
      robots: { index: false, follow: false },
    };
  }
  const canonical = `${SITE_URL}/startup/${slug}`;
  const title = `${listing.hero.name} — BlockID startup listing`;
  const description = listing.hero.onelinePitch;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "BlockID.au",
      locale: "en_AU",
      images: [
        {
          url: `${canonical}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${listing.hero.name} — BlockID startup listing`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function StartupListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await loadPublicListing(slug);
  if (!listing) notFound();

  return (
    <MarketingShell>
      <PageViewTracker
        event="startup_listing_viewed"
        params={{ slug }}
      />
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <ListingHero listing={listing} slug={slug} />
        <CardRow listing={listing} />
        <ReservedAllocationStrip listing={listing} />
        <PublicReports listing={listing} />
        <ContactCta listing={listing} />
      </div>
    </MarketingShell>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function ListingHero({
  listing,
  slug,
}: {
  listing: PublicListingPayload;
  slug: string;
}) {
  return (
    <header className="mb-10 border-b border-white/10 pb-8">
      <div className="flex flex-wrap items-baseline gap-3 text-xs uppercase tracking-[0.16em] text-cyan-300/80">
        <span className="rounded bg-cyan-500/15 px-2 py-0.5">
          BlockID Startup Package
        </span>
        {listing.hero.industry ? (
          <span className="rounded bg-white/5 px-2 py-0.5 text-white/70">
            {listing.hero.industry}
          </span>
        ) : null}
        <span className="text-white/40">/{slug}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
        {listing.hero.name}
      </h1>
      <p className="mt-4 max-w-3xl text-base text-white/70 md:text-lg">
        {listing.hero.onelinePitch}
      </p>
      {listing.svi ? <SviBadge svi={listing.svi} /> : null}
    </header>
  );
}

function SviBadge({ svi }: { svi: NonNullable<PublicListingPayload["svi"]> }) {
  const bandColour: Record<typeof svi.band, string> = {
    seed: "bg-slate-500/20 text-slate-100 ring-slate-400/40",
    growth: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
    scale: "bg-cyan-500/15 text-cyan-100 ring-cyan-400/40",
    unicorn: "bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/40",
  };
  return (
    <div
      className={
        "mt-6 inline-flex items-baseline gap-3 rounded-full px-4 py-2 text-sm font-medium ring-1 " +
        bandColour[svi.band]
      }
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span className="font-mono text-lg">{svi.total}</span>
      <span className="text-white/70">SVI · {svi.label}</span>
    </div>
  );
}

function CardRow({ listing }: { listing: PublicListingPayload }) {
  if (listing.cards.length === 0) return null;
  return (
    <section aria-labelledby="listing-cards" className="mb-12">
      <h2 id="listing-cards" className="sr-only">
        Startup summary
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {listing.cards.map((card) => (
          <article
            key={card.slot}
            className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">
              {card.title}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              {card.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReservedAllocationStrip({
  listing,
}: {
  listing: PublicListingPayload;
}) {
  if (!listing.reservedAllocation) return null;
  const r = listing.reservedAllocation;
  return (
    <section
      aria-labelledby="reserved-allocation"
      className="mb-12 rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-white/5 to-cyan-500/10 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <Coins className="h-5 w-5 text-fuchsia-200" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="reserved-allocation"
              className="text-sm font-semibold uppercase tracking-widest text-fuchsia-100"
            >
              Reserved allocation
            </h2>
            <p className="mt-1 text-lg text-white">
              <span className="font-mono">{r.pctReserved}%</span>
              <span className="mx-2 text-white/40">·</span>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-sm">
                {r.ticker}
              </span>
            </p>
          </div>
        </div>
        <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">
          {r.ctaLabel}
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-xs text-white/60">
        DB-first cap-table reservation held by the founder inside their
        BlockID workspace. {r.onChain ? "On-chain token issued." : "Available for on-chain issuance on founder opt-in."}
      </p>
    </section>
  );
}

function PublicReports({ listing }: { listing: PublicListingPayload }) {
  if (listing.publicReports.length === 0) return null;
  return (
    <section aria-labelledby="public-reports" className="mb-12">
      <h2
        id="public-reports"
        className="mb-4 text-xl font-semibold text-white"
      >
        Public Package reports
      </h2>
      <ul className="space-y-3">
        {listing.publicReports.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-white/10 bg-white/5 p-4"
          >
            <p className="text-sm font-semibold text-white">{r.title}</p>
            <p className="mt-1 text-xs text-white/50">
              Published {r.createdAt.slice(0, 10)}
            </p>
            {r.excerpt ? (
              <p className="mt-2 text-sm text-white/75">{r.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContactCta({ listing }: { listing: PublicListingPayload }) {
  const isMailto = listing.contact.kind === "mailto";
  const label = isMailto ? "Contact founder" : "Send a message";
  const Icon = isMailto ? Mail : ArrowRight;
  return (
    <section aria-labelledby="contact-founder" className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <div>
          <h2
            id="contact-founder"
            className="text-base font-semibold text-white"
          >
            Interested in this startup?
          </h2>
          <p className="mt-1 text-sm text-white/60">
            {listing.contact.displayName
              ? `${listing.contact.displayName} responds within 3 business days.`
              : "The founding team responds within 3 business days."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={listing.contact.href}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-400"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
          <span className="inline-flex items-center gap-1 text-xs text-white/40">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Verified founder
          </span>
        </div>
      </div>
    </section>
  );
}
