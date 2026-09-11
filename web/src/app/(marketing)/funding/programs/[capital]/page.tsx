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
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
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

      <section className="mx-auto max-w-5xl px-6 pt-12 pb-8 sm:pt-16" data-capital={capital}>
        <Link href="/funding/programs" className="inline-flex items-center gap-1 text-sm font-semibold text-action hover:text-action-hover">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          All capitals
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-action">Free directory</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{heading}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">
          <strong className="font-semibold text-primary" data-total-count={rows.length}>
            {rows.length} {rows.length === 1 ? "program" : "programs"}
          </strong>
          {" · "}
          <strong className="font-semibold text-primary" data-open-count={openCount}>
            {openCount} open
          </strong>
          {closedCount ? ` · ${closedCount} closed and kept for the record` : ""}. Intake months below come from each
          program&rsquo;s published dates; the official page is always the source of truth.
        </p>
        {seo.coverage ? (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-secondary" data-capital-coverage>
            {seo.coverage}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-secondary">
          Looking for grants instead?{" "}
          <Link href={grantsStatePath(state)} className="font-semibold text-action underline-offset-2 hover:underline">
            {state === "national" ? "Federal startup grants" : `${stateLabel(state)} startup grants`}
          </Link>
          {" · "}
          <Link href="/funding/report/demo" className="font-semibold text-action underline-offset-2 hover:underline">
            see a sample A$3 report
          </Link>
        </p>
        <div className="mt-6">
          <CapitalPicker counts={counts} current={capital} variant="compact" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="calendar-heading">
        <h2 id="calendar-heading" className="font-display text-2xl font-semibold tracking-tight text-primary">
          Next twelve months
        </h2>
        <p className="mt-2 mb-6 text-sm text-secondary">
          Applications close, cohorts start and usual intake months, grouped by month.
        </p>
        <IntakeCalendar months={calendar} />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-12" aria-labelledby="list-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="list-heading" className="font-display text-2xl font-semibold tracking-tight text-primary">
            Every program in {name}
          </h2>
          <Link
            href={`/funding?capital=${capitalSlug(capital)}`}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover"
          >
            Sequence these for my startup
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 text-sm text-secondary">
            No programs recorded for {name} yet.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((p) => (
              <ProgramCard key={p.id} program={p} showCity={p.city !== capital} />
            ))}
          </div>
        )}
      </section>

      <FundingGuides guides={PROGRAM_GUIDES} heading="Read before you apply" />

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
