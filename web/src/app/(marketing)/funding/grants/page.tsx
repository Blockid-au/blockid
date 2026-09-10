/**
 * /funding/grants — free, indexable directory of Australian startup grants
 * (T0241, G11 S2). Server-rendered from `au_grants`; filters by state /
 * funding type / stage come from `searchParams` and are plain links, so the
 * page has no client state.
 *
 * Positioning (plan §5a): business.gov.au says "don't pay for government
 * grant information", so the list and every official link are free. The
 * "Am I eligible?" link is the only door to the paid analysis (/funding,
 * T0242). Counts and A$ totals are computed from the rows — never typed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { FilterChips, type FilterChipGroup } from "@/components/funding/filter-chips";
import { GrantCard } from "@/components/funding/grant-card";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { listGrants } from "@/lib/funding/data";
import { AU_STATES } from "@/lib/funding/seed-map";
import {
  SITE_URL,
  applyGrantFilters,
  distinct,
  formatAudCompact,
  fundingTypeLabel,
  grantStats,
  grantUrl,
  latestVerifiedAt,
  parseGrantFilters,
  sortByStatusThenName,
  stageLabel,
  stateLabel,
  type SearchParamsLike,
} from "@/lib/funding/directory";

export const revalidate = 3600;

const PATH = "/funding/grants";
const TITLE = "Australian startup grants, open right now · BlockID.au";
const DESCRIPTION =
  "Every Australian government grant, voucher, tax offset and loan for startups in one free list — federal, state and council — with official links, A$ ranges, closing dates and stage tags. Filter by state, funding type and stage.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}${PATH}`,
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function GrantsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsLike>;
}) {
  const sp = await searchParams;
  const filters = parseGrantFilters(sp);
  const all = await listGrants({ excludeNonMatching: true });
  const stats = grantStats(all);
  const rows = sortByStatusThenName(applyGrantFilters(all, filters));
  const lastVerified = latestVerifiedAt(all);

  const current = { state: filters.state, type: filters.type, stage: filters.stage, status: filters.status };

  const stateOptions = AU_STATES.filter((s) => all.some((g) => g.state === s)).map((s) => ({
    value: s,
    label: s === "national" ? "National" : s,
    count: all.filter((g) => g.state === s).length,
  }));
  const typeOptions = distinct(all.map((g) => g.funding_type)).map((t) => ({
    value: t,
    label: fundingTypeLabel(t),
    count: all.filter((g) => g.funding_type === t).length,
  }));
  const stageOptions = distinct(all.flatMap((g) => g.stage_tags)).map((t) => ({
    value: t,
    label: stageLabel(t),
    count: all.filter((g) => g.stage_tags.includes(t)).length,
  }));
  const groups: FilterChipGroup[] = [
    { param: "state", label: "State", options: stateOptions },
    { param: "type", label: "Type", options: typeOptions },
    { param: "stage", label: "Stage", options: stageOptions },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Australian startup grants",
    url: `${SITE_URL}${PATH}`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 100).map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: g.name,
      url: grantUrl(g.id),
    })),
  };

  const scopeLine = [
    filters.state ? stateLabel(filters.state) : null,
    filters.type ? fundingTypeLabel(filters.type) : null,
    filters.stage ? stageLabel(filters.stage) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <MarketingShell>
      <PageViewTracker event="funding_directory_viewed" params={{ kind: "grants" }} />
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Funding", href: "/funding" },
          { name: "Grants", href: PATH },
        ]}
      />
      <FundingJsonLd data={itemList} />

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-8 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">Free directory</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
          Australian startup grants, open right now
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">
          <strong className="font-semibold text-primary" data-open-count={stats.open}>
            {stats.open} {stats.open === 1 ? "grant is" : "grants are"} open
          </strong>{" "}
          across{" "}
          <span data-total-count={stats.total}>
            {stats.total} federal, state and council schemes
          </span>
          {stats.openMaxAud > 0 ? (
            <>
              , with maximum awards adding up to{" "}
              <strong className="font-semibold text-primary" data-open-max-aud={stats.openMaxAud}>
                {formatAudCompact(stats.openMaxAud)}
              </strong>
            </>
          ) : null}
          . Every row links to the official page — government grant information is free. What BlockID sells is the
          analysis: whether <em>your</em> startup is eligible, what to gather, and when to apply.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/funding"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
          >
            Check my eligibility
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/funding/programs"
            className="inline-flex h-10 items-center rounded-full border border-line px-5 font-semibold text-primary hover:bg-surface-sunken"
          >
            Accelerators and programs
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-6" aria-label="Filters">
        <FilterChips base={PATH} current={current} groups={groups} />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="grants-list-heading">
        <h2 id="grants-list-heading" className="mb-4 text-sm font-semibold text-secondary">
          {rows.length} {rows.length === 1 ? "grant" : "grants"}
          {scopeLine ? ` · ${scopeLine}` : ""}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
            {all.length === 0
              ? "The grants catalogue is being refreshed. Check back shortly."
              : "No grants match those filters. Try clearing one — national schemes apply in every state."}
          </p>
        ) : (
          <div className="grid gap-4">
            {rows.map((g) => (
              <GrantCard key={g.id} grant={g} />
            ))}
          </div>
        )}
      </section>

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
