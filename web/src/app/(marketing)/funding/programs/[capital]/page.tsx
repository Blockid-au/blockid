/**
 * /funding/programs/[capital] — one page per capital (Sydney … Darwin, plus
 * Remote = Australia-wide / online; G11-5 grouping folds Gold Coast,
 * Sunshine Coast, regional QLD, Wollongong, Geelong and Launceston into
 * their capital). Month-by-month intake calendar for the next twelve months
 * from `intake_months` / `applications_close` / `next_cohort_start`, then
 * the list: open first, then upcoming, paused, and closed marked "do not
 * apply". JSON-LD `ItemList` + one `Event` per dated cohort start. T0241.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageHero, Section } from "@/components/marketing/template";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { CapitalPicker } from "@/components/funding/capital-picker";
import { IntakeCalendar } from "@/components/funding/intake-calendar";
import { ProgramCard } from "@/components/funding/program-card";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingGuides } from "@/components/funding/funding-guides";
import { listPrograms } from "@/lib/funding/data";
import { CAPITALS } from "@/lib/funding/seed-map";
import {
  SITE_URL,
  buildIntakeCalendar,
  stateLabel,
  buildProgramEventsJsonLd,
  capitalDisplayName,
  capitalFromSlug,
  capitalSlug,
  countByCapital,
  latestVerifiedAt,
  programUrl,
  sortByStatusThenName,
} from "@/lib/funding/directory";
import { FUNDING_CRUMBS, PROGRAM_GUIDES, capitalPath, capitalSeo, grantsStatePath, stateForCapital } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

type Params = { capital: string };

export function generateStaticParams(): Params[] {
  return CAPITALS.map((c) => ({ capital: capitalSlug(c) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { capital: slug } = await params;
  const capital = capitalFromSlug(slug);
  if (!capital) {
    return pageMetadata({ title: { absolute: "Capital not found" }, description: "No programs directory for that city.", path: "/funding/programs", index: false });
  }
  // S8-A: "accelerator programs <city>" / "startup incubator <city>"; the
  // description names the satellite cities the capital page folds in.
  const seo = capitalSeo(capital);
  return pageMetadata({ title: seo.title, description: seo.description, path: capitalPath(capital) });
}

export default async function CapitalProgramsPage({ params }: { params: Promise<Params> }) {
  const { capital: slug } = await params;
  const capital = capitalFromSlug(slug);
  if (!capital) notFound();

  const path = `/funding/programs/${capitalSlug(capital)}`;
  const all = await listPrograms();
  const counts = countByCapital(all);
  const rows = sortByStatusThenName(all.filter((p) => p.capital === capital));
  const calendar = buildIntakeCalendar(rows, new Date());
  const openCount = rows.filter((p) => p.status === "open").length;
  const closedCount = rows.filter((p) => p.status === "closed").length;
  const lastVerified = latestVerifiedAt(rows);
  const name = capitalDisplayName(capital);
  const seo = capitalSeo(capital);
  const heading = seo.h1;
  const state = stateForCapital(capital);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    url: `${SITE_URL}${path}`,
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 100).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: programUrl(p.capital, p.id),
    })),
  };
  const events = buildProgramEventsJsonLd(rows);

  return (
    <MarketingShell>
      <PageViewTracker event="funding_directory_viewed" params={{ kind: "programs", capital }} />
      <BreadcrumbListJsonLd items={FUNDING_CRUMBS.capital(capital)} />
      <FundingJsonLd data={[itemList, ...events]} />

      {/* G17 P2-A: template hero (data-capital + the live counts keep their hooks);
          `#list-heading` stays the h2 id live-qa 20-funding asserts (Section id="list"). */}
      <div data-capital={capital}>
        <PageHero
          eyebrow="Free directory"
          title={heading}
          sub={
            <>
              <strong className="font-semibold text-primary" data-total-count={rows.length}>
                {rows.length} {rows.length === 1 ? "program" : "programs"}
              </strong>
              {" · "}
              <strong className="font-semibold text-primary" data-open-count={openCount}>
                {openCount} open
              </strong>
              {closedCount ? ` · ${closedCount} closed and kept for the record` : ""}. Intake months below come from each
              program&rsquo;s published dates; the official page is always the source of truth.
              {seo.coverage ? (
                <>
                  {" "}
                  <span data-capital-coverage>{seo.coverage}</span>
                </>
              ) : null}
            </>
          }
          ctas={[
            { href: `/funding?capital=${capitalSlug(capital)}`, label: "Sequence these for my startup", ctaId: "capital_hero_plan" },
            { href: "/funding/programs", label: "All capitals" },
          ]}
          visual={<CapitalPicker counts={counts} current={capital} variant="compact" />}
          footnote={
            <>
              Looking for grants instead?{" "}
              <Link href={grantsStatePath(state)} className="font-semibold text-action underline-offset-2 hover:underline">
                {state === "national" ? "Federal startup grants" : `${stateLabel(state)} startup grants`}
              </Link>
              {" · "}
              <Link href="/funding/report/demo" className="font-semibold text-action underline-offset-2 hover:underline">
                see a sample A$3 report
              </Link>
            </>
          }
          align="start"
        />
      </div>

      <Section
        id="calendar"
        title="Next twelve months"
        lede="Applications close, cohorts start and usual intake months, grouped by month."
        tone="sunken"
        spacing="sm"
      >
        <IntakeCalendar months={calendar} />
      </Section>

      <Section
        id="list"
        title={`Every program in ${name}`}
        spacing="sm"
        actions={[{ href: `/funding?capital=${capitalSlug(capital)}`, label: "Sequence these for my startup", variant: "link" }]}
      >
        {rows.length === 0 ? (
          <p className="rounded-xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
            No programs recorded for {name} yet.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((p) => (
              <ProgramCard key={p.id} program={p} showCity={p.city !== capital} />
            ))}
          </div>
        )}
      </Section>

      <FundingGuides guides={PROGRAM_GUIDES} heading="Read before you apply" />

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
