/**
 * /funding/programs — free, indexable directory of accelerators, incubators
 * and startup programs in every Australian capital (T0241, G11 S2, D7 =
 * all eight capitals + Remote). Capital cards carry live counts from
 * `au_programs`; the list below filters by capital / program type / stage
 * off `searchParams` with plain links (no client state).
 *
 * S10-A (perf audit finding 4): the list is grouped by capital in
 * `CAPITALS` order — six compact rows per capital, the rest as name-only
 * links in a native `<details>` — so the page stays under 300 KB of HTML
 * while every one of the 199 detail URLs is still linked exactly once.
 */

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageHero, Section } from "@/components/marketing/template";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { CapitalPicker } from "@/components/funding/capital-picker";
import { FilterChips, type FilterChipGroup } from "@/components/funding/filter-chips";
import { DirectoryGroup } from "@/components/funding/directory-group";
import { INDEX_ROWS_CLASS, ProgramRow } from "@/components/funding/index-rows";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingGuides } from "@/components/funding/funding-guides";
import { FundingFaq } from "@/components/funding/funding-faq";
import { directoryFaq } from "@/lib/funding/faq";
import { listPrograms } from "@/lib/funding/data";
import { CAPITALS } from "@/lib/funding/seed-map";
import {
  SITE_URL,
  applyProgramFilters,
  capitalDisplayName,
  capitalSlug,
  capitalUrl,
  countByCapital,
  distinct,
  latestVerifiedAt,
  parseProgramFilters,
  programTypeLabel,
  programUrl,
  stageLabel,
  type SearchParamsLike,
} from "@/lib/funding/directory";
import { groupProgramsByCapital } from "@/lib/funding/index-groups";
import {
  FUNDING_CRUMBS,
  PROGRAMS_DESCRIPTION,
  PROGRAMS_TITLE,
  PROGRAM_GUIDES,
  capitalPath,
  capitalSeo,
  programPath,
  satelliteList,
} from "@/lib/funding/seo";
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
  const rows = applyProgramFilters(all, filters);
  const capitalGroups = groupProgramsByCapital(rows);
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

  // Capped at the rows visible per group; each capital page (which carries
  // its full list) is referenced as its own ListItem ahead of its rows.
  const listItems = capitalGroups.flatMap((g) => [
    { name: capitalSeo(g.key).h1, url: capitalUrl(g.key) },
    ...g.visible.map((p) => ({ name: p.name, url: programUrl(p.capital, p.id) })),
  ]);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Australian startup programs",
    url: `${SITE_URL}${PATH}`,
    numberOfItems: rows.length + capitalGroups.length,
    itemListElement: listItems.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };

  return (
    <MarketingShell>
      <PageViewTracker event="funding_directory_viewed" params={{ kind: "programs" }} />
      <BreadcrumbListJsonLd items={[...FUNDING_CRUMBS.programs]} />
      <FundingJsonLd data={itemList} />

      {/* G17 P2-A: the template hero; the live counts keep their data-* hooks. */}
      <PageHero
        eyebrow="Free directory"
        title="Startup accelerators, incubators and programs in every Australian capital"
        sub={
          <>
            <strong className="font-semibold text-primary" data-total-count={all.length}>
              {all.length} programs
            </strong>{" "}
            across the eight capitals and online,{" "}
            <strong className="font-semibold text-primary" data-open-count={openTotal}>
              {openTotal} taking applications
            </strong>
            . Each capital has its own twelve-month intake calendar. Listings and official links are free; the paid
            part is a plan that sequences the right programs and grants for <em>your</em> stage.
          </>
        }
        ctas={[
          { href: "/funding", label: "Build my funding plan", ctaId: "programs_hero_plan" },
          { href: "/funding/grants", label: "Grants directory" },
        ]}
        align="start"
      />

      <Section id="capitals" title="Pick your capital" spacing="sm" tone="sunken">
        <CapitalPicker counts={counts} />
      </Section>

      <Section id="filters" ariaLabel="Filters" spacing="sm" divider={false}>
        <FilterChips base={PATH} current={current} groups={groups} />
      </Section>

      <Section id="programs" ariaLabel="Programs" spacing="sm" divider={false}>
        <p id="programs-list-heading" className="mb-4 text-sm font-semibold text-secondary">
          {rows.length} {rows.length === 1 ? "program" : "programs"}
          {filters.capital ? ` · ${filters.capital}` : ""}
          {filters.type ? ` · ${programTypeLabel(filters.type)}` : ""}
          {filters.stage ? ` · ${stageLabel(filters.stage)}` : ""}
          {capitalGroups.length > 1 ? " · grouped by capital, open first" : ""}
        </p>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
            {all.length === 0
              ? "The programs catalogue is being refreshed. Check back shortly."
              : "No programs match those filters. Try clearing one."}
          </p>
        ) : (
          <div className="space-y-10">
            {capitalGroups.map((g) => {
              const name = capitalDisplayName(g.key);
              const sats = satelliteList(g.key);
              const n = g.rows.length;
              const note = [
                `${n} ${n === 1 ? "program" : "programs"}`,
                `${g.open} open`,
                sats ? `also covers ${sats}` : g.key === "Remote" ? "online and national programs" : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <DirectoryGroup
                  key={g.key}
                  dataAttrs={{ "data-capital-group": g.key }}
                  headingId={`capital-${capitalSlug(g.key)}`}
                  heading={name}
                  href={capitalPath(g.key)}
                  note={note}
                  seeAllLabel={n > g.visible.length ? `See all ${n} programs in ${name}` : `See the ${name} intake calendar`}
                  tail={g.tail.map((p) => ({ href: programPath(p.capital, p.id), name: p.name }))}
                  tailSummary={`All ${n} programs in ${name}`}
                  tailLead="Continuing from the rows above, open first then by name:"
                >
                  <ul className={INDEX_ROWS_CLASS}>
                    {g.visible.map((p) => (
                      <ProgramRow key={p.id} program={p} showCity={p.city !== g.key} />
                    ))}
                  </ul>
                </DirectoryGroup>
              );
            })}
          </div>
        )}
      </Section>

      <FundingGuides guides={PROGRAM_GUIDES} heading="Read before you apply" />

      <FundingFaq items={directoryFaq("programs")} />

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
