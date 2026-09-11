// /listings — the public directory of Australian startups that have chosen
// to publish a Startup Value Index profile.
//
// This page used to render three seeded "(sample)" companies out of
// startup_listings. They were the only rows that table ever held, and every
// one of them linked its "website" back at blockid.au. They are gone
// (migration 0128): a directory of invented companies is worse than an honest
// empty state — it misrepresents traction to the first real visitor and it is
// the fabricated-entity pattern search engines penalise. If nobody has
// published yet, this page says so.
//
// Browsable rather than a flat list: sector and stage are the two axes a
// founder or an investor actually filters an AU directory on, and both are
// rendered as real links so the state is shareable. The filtered views are
// noindex + canonical back here — with a handful of published profiles,
// indexing every sector x stage combination would manufacture exactly the
// thin faceted pages the profiles themselves are gated against.

import type { Metadata } from "next";
import { fitDescription, fitTitle } from "@/lib/seo/page-meta";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { ItemListJsonLd } from "@/components/seo/json-ld";
import { listPublished, type PublishedRow } from "@/lib/publish/store";
import { SECTOR_LABELS } from "@/lib/svi-analysis";
import { ProfileCard } from "./related-profiles";

export const dynamic = "force-dynamic";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/listings`;

interface PageProps {
  searchParams?: Promise<{ sector?: string; stage?: string }>;
}

function parseStage(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n : null;
}

function parseSector(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SECTOR_LABELS, key) ? key : null;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = (await searchParams) ?? {};
  const sector = parseSector(sp.sector);
  const stage = parseStage(sp.stage);
  const filtered = Boolean(sector || stage !== null);

  const title = sector
    ? fitTitle(`${SECTOR_LABELS[sector]} startups in Australia — scored and valued`)
    : "Australian startup directory — scored and valued";
  const description = sector
    ? fitDescription([`Australian ${SECTOR_LABELS[sector]} startups with a published Startup Value Index profile: score across eight dimensions, indicative valuation range and stage.`], { min: 70, max: 165 })
    : "Every Australian startup with a published Startup Value Index profile: a score across eight dimensions, an indicative valuation range, its stage and what comes next.";

  return {
    title,
    description,
    // A filtered slice is a navigation state, not a document worth its own
    // index entry while the directory is this size.
    robots: filtered
      ? { index: false, follow: true }
      : { index: true, follow: true },
    alternates: { canonical: CANONICAL },
    openGraph: {
      title,
      description,
      url: CANONICAL,
      siteName: "BlockID.au",
      type: "website",
      locale: "en_AU",
    },
  };
}

function Chip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
        active
          ? "border-transparent bg-action text-on-action"
          : "border-line bg-surface text-primary hover:bg-surface-hover"
      }`}
    >
      {label}
      {count != null && (
        <span className={active ? "text-on-action" : "text-tertiary"}>
          {count}
        </span>
      )}
    </Link>
  );
}

function facetHref(sector: string | null, stage: number | null): string {
  const qs = new URLSearchParams();
  if (sector) qs.set("sector", sector);
  if (stage !== null) qs.set("stage", String(stage));
  const s = qs.toString();
  return s ? `/listings?${s}` : "/listings";
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-line bg-surface-sunken p-8 text-center">
      <p className="font-display text-xl font-semibold text-strong">
        No founder has published a profile yet.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-secondary">
        This directory only ever shows real Australian startups whose founders
        chose to make their analysis public. Nothing is scraped, and nothing is
        invented to fill the page. Run an analysis and yours can be the first.
      </p>
      <Link
        href="/analyze"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        Score your startup free
      </Link>
    </div>
  );
}

export default async function ListingsDirectoryPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const sector = parseSector(sp.sector);
  const stage = parseStage(sp.stage);

  // Load the whole directory once, then facet in memory: the counts on the
  // chips have to reflect what is really there, and a per-facet query would
  // either lie or cost 30 round trips.
  const all = await listPublished({ limit: 500 });
  const rows = all.filter(
    (r) =>
      (!sector || r.sector === sector) &&
      (stage === null || r.stage === stage),
  );

  const sectorCounts = new Map<string, number>();
  const stageCounts = new Map<number, string>();
  const stageTally = new Map<number, number>();
  for (const row of all) {
    sectorCounts.set(row.sector, (sectorCounts.get(row.sector) ?? 0) + 1);
    if (typeof row.stage === "number") {
      stageTally.set(row.stage, (stageTally.get(row.stage) ?? 0) + 1);
      if (row.stage_label) stageCounts.set(row.stage, row.stage_label);
    }
  }
  const sectors = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const stages = [...stageTally.entries()].sort((a, b) => a[0] - b[0]);

  const heading = sector
    ? `${SECTOR_LABELS[sector]} startups in Australia`
    : "Australian startup directory";

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Australian startup directory", href: "/listings" },
        ]}
      />
      {rows.length > 0 && (
        <ItemListJsonLd
          url={CANONICAL}
          name={heading}
          description="Australian startups with a published Startup Value Index profile."
          items={rows.map((r: PublishedRow) => ({
            name: r.company_name,
            url: `${SITE_URL}/listings/${r.slug}`,
            description: r.one_liner,
          }))}
        />
      )}

      <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <header className="pt-10 sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">
            Published by their founders
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-strong sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">
            Every profile here belongs to an Australian startup whose founder
            ran a Startup Value Index analysis and then chose to make it
            public. Each one carries a score across eight dimensions, an
            indicative valuation range with the methods behind it, the stage
            the company is at, and what that stage calls for next. Nothing is
            scraped and nothing is invented.
          </p>
        </header>

        {/* ── What you are looking at ──────────────────────────────── */}
        <section
          aria-labelledby="directory-explainer-heading"
          className="mt-8 rounded-2xl border border-line-subtle bg-surface-sunken p-5 sm:p-6"
        >
          <h2
            id="directory-explainer-heading"
            className="font-display text-lg font-semibold text-strong"
          >
            What a profile tells you
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold text-primary">
                An index number
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-secondary">
                One figure per company, benchmarked against Australian startups
                at the same stage rather than against everybody at once.
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-primary">
                Eight dimensions
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-secondary">
                Founder and team, market, product, traction, cap table,
                investor readiness, legal, and strategy — each scored out of
                100, so a strong company with one soft flank still reads
                honestly.
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-primary">
                A valuation range
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-secondary">
                A modelled band in Australian dollars, with the named methods
                that produced it. Orientation, not a price and not advice.
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-secondary">
            <Link
              href="/svi"
              className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              How the index is built
            </Link>
            {" · "}
            <Link
              href="/how-it-works"
              className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              How an analysis runs
            </Link>
            {" · "}
            <Link
              href="/pricing"
              className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              What it costs
            </Link>
          </p>
        </section>

        {/* ── Facets ───────────────────────────────────────────────── */}
        {all.length > 0 && (
          <div className="mt-8 space-y-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">
                Sector
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip
                  href={facetHref(null, stage)}
                  label="All sectors"
                  count={all.length}
                  active={sector === null}
                />
                {sectors.map(([key, count]) => (
                  <Chip
                    key={key}
                    href={facetHref(key, stage)}
                    label={SECTOR_LABELS[key] ?? key}
                    count={count}
                    active={sector === key}
                  />
                ))}
              </div>
            </div>
            {stages.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">
                  Stage
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    href={facetHref(sector, null)}
                    label="Any stage"
                    active={stage === null}
                  />
                  {stages.map(([value, count]) => (
                    <Chip
                      key={value}
                      href={facetHref(sector, value)}
                      label={stageCounts.get(value) ?? `Stage ${value}`}
                      count={count}
                      active={stage === value}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── The directory ────────────────────────────────────────── */}
        <section aria-labelledby="directory-heading" className="mt-8">
          <h2 id="directory-heading" className="sr-only">
            Published profiles
          </h2>
          {all.length === 0 ? (
            <EmptyState />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface-sunken p-8 text-center">
              <p className="text-base font-semibold text-primary">
                Nothing published in that slice yet.
              </p>
              <p className="mt-2 text-sm text-secondary">
                <Link
                  href="/listings"
                  className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  Clear the filters
                </Link>{" "}
                to see the whole directory.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-secondary">
                {rows.length} published profile{rows.length === 1 ? "" : "s"},
                highest index first.
              </p>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {rows.map((row) => (
                  <ProfileCard key={row.slug} row={row} />
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Get listed ───────────────────────────────────────────── */}
        <section
          aria-labelledby="get-listed-heading"
          className="mt-10 rounded-2xl border border-line bg-surface-sunken p-6"
        >
          <h2
            id="get-listed-heading"
            className="font-display text-xl font-semibold text-strong"
          >
            Publish your own
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
            Run an analysis on your pitch deck or your website, and if you like
            what it says you can publish a profile from it. You write the name
            and the description, you see the finished page before it goes
            anywhere, and you can take it down at any time.
          </p>
          <Link
            href="/analyze"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Start a free analysis
          </Link>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-secondary">
          Figures on these profiles come from a single analysis of material the
          founder supplied. They are not audited financial statements, and
          nothing in this directory is financial product advice or takes your
          objectives or circumstances into account.
        </p>
      </div>
    </MarketingShell>
  );
}
