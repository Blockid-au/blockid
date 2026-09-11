/**
 * /funding/programs — free, indexable directory of accelerators, incubators
 * and startup programs in every Australian capital (T0241, G11 S2, D7 =
 * all eight capitals + Remote). Capital cards carry live counts from
 * `au_programs`; the list below filters by capital / program type / stage
 * off `searchParams` with plain links (no client state).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { CapitalPicker } from "@/components/funding/capital-picker";
import { FilterChips, type FilterChipGroup } from "@/components/funding/filter-chips";
import { ProgramCard } from "@/components/funding/program-card";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingGuides } from "@/components/funding/funding-guides";
import { listPrograms } from "@/lib/funding/data";
import { CAPITALS } from "@/lib/funding/seed-map";
import {
  SITE_URL,
  applyProgramFilters,
  capitalSlug,
  countByCapital,
  distinct,
  latestVerifiedAt,
  parseProgramFilters,
  programTypeLabel,
  programUrl,
  sortByStatusThenName,
  stageLabel,
  type SearchParamsLike,
} from "@/lib/funding/directory";
import { FUNDING_CRUMBS, PROGRAMS_DESCRIPTION, PROGRAMS_TITLE, PROGRAM_GUIDES } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

const PATH = "/funding/programs";

// S8-A: primary keyword "startup accelerators australia"; ≤ 60 with the
// brand suffix the root template appends, 140–160 description, OG image.
export const metadata: Metadata = pageMetadata({ title: PROGRAMS_TITLE, description: PROGRAMS_DESCRIPTION, path: PATH });

export default async function ProgramsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsLike>;
}) {
  const sp = await searchParams;
  const filters = parseProgramFilters(sp);
  const all = await listPrograms();
  const counts = countByCapital(all);
  const rows = sortByStatusThenName(applyProgramFilters(all, filters));
  const openTotal = all.filter((p) => p.status === "open").length;
  const lastVerified = latestVerifiedAt(all);

  const current = {
    capital: filters.capital ? capitalSlug(filters.capital) : null,
    type: filters.type,
    stage: filters.stage,
    status: filters.status,
  };

  const groups: FilterChipGroup[] = [
    {
      param: "capital",
      label: "Capital",
      options: CAPITALS.filter((c) => counts[c].total > 0).map((c) => ({
        value: capitalSlug(c),
        label: c,
        count: counts[c].total,
      })),
    },
    {
      param: "type",
      label: "Type",
      options: distinct(all.map((p) => p.program_type)).map((t) => ({
        value: t,
        label: programTypeLabel(t),
        count: all.filter((p) => p.program_type === t).length,
      })),
    },
    {
      param: "stage",
      label: "Stage",
      options: distinct(all.flatMap((p) => p.stage_tags)).map((t) => ({
        value: t,
        label: stageLabel(t),
        count: all.filter((p) => p.stage_tags.includes(t)).length,
      })),
    },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Australian startup programs",
    url: `${SITE_URL}${PATH}`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 100).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: programUrl(p.capital, p.id),
    })),
  };

  return (
    <MarketingShell>
      <PageViewTracker event="funding_directory_viewed" params={{ kind: "programs" }} />
      <BreadcrumbListJsonLd items={[...FUNDING_CRUMBS.programs]} />
      <FundingJsonLd data={itemList} />

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-8 sm:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">Free directory</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
          Startup accelerators, incubators and programs in every Australian capital
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">
          <strong className="font-semibold text-primary" data-total-count={all.length}>
            {all.length} programs
          </strong>{" "}
          across the eight capitals and online,{" "}
          <strong className="font-semibold text-primary" data-open-count={openTotal}>
            {openTotal} taking applications
          </strong>
          . Each capital has its own twelve-month intake calendar. Listings and official links are free; the paid
          part is a plan that sequences the right programs and grants for <em>your</em> stage.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/funding"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
          >
            Build my funding plan
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/funding/grants"
            className="inline-flex h-10 items-center rounded-full border border-line px-5 font-semibold text-primary hover:bg-surface-sunken"
          >
            Grants directory
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="capitals-heading">
        <h2 id="capitals-heading" className="mb-4 font-display text-2xl font-semibold tracking-tight text-primary">
          Pick your capital
        </h2>
        <CapitalPicker counts={counts} />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-6" aria-label="Filters">
        <FilterChips base={PATH} current={current} groups={groups} />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="programs-list-heading">
        <h2 id="programs-list-heading" className="mb-4 text-sm font-semibold text-secondary">
          {rows.length} {rows.length === 1 ? "program" : "programs"}
          {filters.capital ? ` · ${filters.capital}` : ""}
          {filters.type ? ` · ${programTypeLabel(filters.type)}` : ""}
          {filters.stage ? ` · ${stageLabel(filters.stage)}` : ""}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
            {all.length === 0
              ? "The programs catalogue is being refreshed. Check back shortly."
              : "No programs match those filters. Try clearing one."}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((p) => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </div>
        )}
      </section>

      <FundingGuides guides={PROGRAM_GUIDES} heading="Read before you apply" />

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
