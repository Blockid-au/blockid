// /listings/[slug] — a published Australian startup profile.
//
// WHY THIS ROUTE, and not a sixth near-duplicate.
//
// Five public company-ish surfaces already existed. Four of them are somebody
// else's job:
//
//   /s/[slug]        a private, tokenised investor share link for one score
//   /startup/[slug]  a Startup Package listing, gated on a purchase
//   /id/[slug]       a verified Business ID profile, gated on verification
//   /reports/[ticker] the investor "trust report" over startup_listings
//
// The fifth — /listings, already in the navbar as "Browse startups", already
// in the sitemap, already carrying a [ticker] detail page — was built to be
// exactly this and never got real data: the only rows startup_listings ever
// held were three seeded "(sample)" companies (retired in 0128), and
// public_index_submissions has zero rows to this day. So this takes over the
// URL space that was already the public directory rather than minting a
// sixth one for Google to disambiguate.
//
// The legacy ticker namespace is uppercase (SAMPLE-01) and slugs are
// lowercase kebab, so the two cannot collide. A ticker that does resolve is
// redirected to /reports/[ticker], the surviving surface for that data model,
// instead of duplicating 200 lines of it here.
//
// An unpublished profile 404s. `getPublishedBySlug` reads a view that requires
// analyses.public_visible = true, so withdrawal takes effect on the very next
// request — there is no cache to wait out and no "hidden but reachable" state.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { PublicProfileBody } from "@/components/publish/public-profile-body";
import { getListingByTicker } from "@/lib/listings/listings-db";
import { getPublishedBySlug, listPublished } from "@/lib/publish/store";
import {
  buildProfileJsonLd,
  buildPublicProfile,
  profileDescription,
  profileTitle,
  type PublicProfile,
} from "@/lib/publish/profile";
import { RelatedProfiles } from "../related-profiles";

export const dynamic = "force-dynamic";

const SITE_URL = "https://blockid.au";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function normalise(raw: string): string {
  return decodeURIComponent(raw ?? "").trim().toLowerCase();
}

async function loadProfile(slug: string): Promise<PublicProfile | null> {
  const row = await getPublishedBySlug(slug);
  if (!row || !row.svi) return null;
  return buildPublicProfile({
    slug: row.slug,
    companyName: row.company_name,
    oneLiner: row.one_liner,
    sector: row.sector,
    websiteUrl: row.website_url,
    svi: row.svi,
    analysedAt: row.analysed_at,
    publishedAt: row.first_published_at,
    updatedAt: row.updated_at,
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = normalise((await params).slug);
  const profile = await loadProfile(slug);
  const canonical = `${SITE_URL}/listings/${slug}`;

  if (!profile) {
    // A withdrawn or never-published slug must not sit in an index anywhere,
    // so the miss is explicitly noindex on top of the 404 the page returns.
    return {
      title: "Profile not available · BlockID.au",
      description: "This startup profile is not published.",
      robots: { index: false, follow: false },
      alternates: { canonical },
    };
  }

  const title = profileTitle(profile);
  const description = profileDescription(profile);
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "BlockID.au",
      type: "profile",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function ProfileJsonLd({ profile }: { profile: PublicProfile }) {
  let nonce: string | undefined;
  try {
    nonce = (await headers()).get("x-nonce") ?? undefined;
  } catch {
    nonce = undefined;
  }
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildProfileJsonLd(profile)),
      }}
    />
  );
}

export default async function PublishedProfilePage({ params }: PageProps) {
  const slug = normalise((await params).slug);
  const profile = await loadProfile(slug);

  if (!profile) {
    // Legacy ticker namespace: uppercase, cannot collide with a slug.
    const ticker = slug.toUpperCase();
    if (/^[A-Z0-9-]{2,20}$/.test(ticker)) {
      const legacy = await getListingByTicker(ticker);
      if (legacy) redirect(`/reports/${encodeURIComponent(ticker)}`);
    }
    notFound();
  }

  // Same sector first, then the rest — internal links from a cluster page
  // back into its siblings, so no published profile is an orphan.
  const pool = await listPublished({ limit: 30 });
  const related = pool.filter((r) => r.slug !== profile.slug);

  return (
    <MarketingShell>
      <ProfileJsonLd profile={profile} />
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Australian startup directory", href: "/listings" },
          { name: profile.companyName, href: `/listings/${profile.slug}` },
        ]}
      />
      <PublicProfileBody profile={profile} />
      <RelatedProfiles
        rows={related}
        anchorSector={profile.sector}
        heading="Other published Australian startups"
      />
    </MarketingShell>
  );
}
