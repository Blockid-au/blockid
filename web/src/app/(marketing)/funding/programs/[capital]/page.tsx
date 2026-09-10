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
import { listPrograms } from "@/lib/funding/data";
import { CAPITALS } from "@/lib/funding/seed-map";
import {
  SITE_URL,
  buildIntakeCalendar,
  buildProgramEventsJsonLd,
  capitalDisplayName,
  capitalFromSlug,
  capitalSlug,
  countByCapital,
  latestVerifiedAt,
  programUrl,
  sortByStatusThenName,
} from "@/lib/funding/directory";

export const revalidate = 3600;

type Params = { capital: string };

export function generateStaticParams(): Params[] {
  return CAPITALS.map((c) => ({ capital: capitalSlug(c) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { capital: slug } = await params;
  const capital = capitalFromSlug(slug);
  if (!capital) return { title: "Capital not found · BlockID.au", robots: { index: false } };
  const name = capitalDisplayName(capital);
  const path = `/funding/programs/${capitalSlug(capital)}`;
  const title =
    capital === "Remote"
      ? "Online and Australia-wide startup programs · BlockID.au"
      : `Startup programs in ${capital} — accelerators, incubators and intake dates · BlockID.au`;
  const description =
    capital === "Remote"
      ? "Free directory of remote, online and national accelerators, incubators and founder programs open to startups anywhere in Australia, with a twelve-month intake calendar and official links."
      : `Free directory of accelerators, incubators, pre-accelerators, university programs and angel groups in ${name}, with a twelve-month intake calendar, funding and equity terms, and official application links.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}`, siteName: "BlockID.au", type: "website", locale: "en_AU" },
    twitter: { card: "summary", title, description },
  };
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
  const heading = capital === "Remote" ? "Startup programs online and Australia-wide" : `Startup programs in ${capital}`;

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
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Funding", href: "/funding" },
          { name: "Programs", href: "/funding/programs" },
          { name, href: path },
        ]}
      />
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

      <FundingDisclaimer lastVerifiedAt={lastVerified} />
    </MarketingShell>
  );
}
