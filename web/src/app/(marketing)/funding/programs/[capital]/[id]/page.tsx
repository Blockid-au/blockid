/**
 * /funding/programs/[capital]/[id] — one program: at a glance, who it is
 * for, what you get, how to apply, timing, FAQ and related funding, plus
 * "Add to my plan for A$3" into /funding (T0242). A row requested under the
 * wrong capital redirects nowhere — it 404s, so the canonical URL is the
 * only one that indexes. T0241.
 *
 * S9-B: the sections below the header are built by `lib/funding/enrich.ts`
 * from the row's structured fields only (fixed vocabulary + generic
 * per-type explainers), so a five-word `summary` no longer leaves the page
 * thin. `FAQPage` JSON-LD is emitted only when ≥ 2 Q&As render.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { StatusChip } from "@/components/funding/status-chip";
import { programTerms } from "@/components/funding/program-card";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingGuides } from "@/components/funding/funding-guides";
import { AtAGlance, Faq, HowToApply, Prose, Related, Timing } from "@/components/funding/enrichment-sections";
import { getProgram, listGrants, listPrograms } from "@/lib/funding/data";
import {
  buildProgramEventsJsonLd,
  buildProgramJsonLd,
  capitalDisplayName,
  capitalFromSlug,
  capitalSlug,
  eligibilityRequirements,
  humanize,
  programTypeLabel,
  stateLabel,
} from "@/lib/funding/directory";
import { enrichProgram } from "@/lib/funding/enrich";
import { FUNDING_CRUMBS, PROGRAM_GUIDES, programDescription, programPath, programTitle } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

type Params = { capital: string; id: string };

export async function generateStaticParams(): Promise<Params[]> {
  const rows = await listPrograms();
  return rows.map((p) => ({ capital: capitalSlug(p.capital), id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { capital: slug, id } = await params;
  const capital = capitalFromSlug(slug);
  const p = await getProgram(id);
  if (!capital || !p || p.capital !== capital) {
    return pageMetadata({ title: { absolute: "Program not found" }, description: "This program is not in the BlockID directory.", path: "/funding/programs", index: false });
  }
  // S8-A: `${name} — ${type} in ${city}, ${STATE}` (≤ 60, unique) + composed 140–160 description.
  return pageMetadata({ title: { absolute: programTitle(p) }, description: programDescription(p), path: programPath(p.capital, p.id) });
}

export default async function ProgramDetailPage({ params }: { params: Promise<Params> }) {
  const { capital: slug, id } = await params;
  const capital = capitalFromSlug(slug);
  const p = await getProgram(id);
  if (!capital || !p || p.capital !== capital) notFound();

  const [programs, grants] = await Promise.all([listPrograms({ capital }), listGrants()]);
  const e = enrichProgram(p, { programs, grants });

  const capitalPath = `/funding/programs/${capitalSlug(capital)}`;
  const planHref = `/funding?program=${encodeURIComponent(p.id)}`;
  const requirements = eligibilityRequirements(p.eligibility);
  const terms = programTerms(p);
  const closed = p.status === "closed";
  const jsonLd = [buildProgramJsonLd(p), ...buildProgramEventsJsonLd([p])];
  if (e.faqJsonLd) jsonLd.push(e.faqJsonLd);

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd items={FUNDING_CRUMBS.program(p)} />
      <FundingJsonLd data={jsonLd} />

      <article className="mx-auto max-w-5xl px-6 pt-12 pb-12 sm:pt-16" data-program-id={p.id}>
        <Link href={capitalPath} className="inline-flex items-center gap-1 text-sm font-semibold text-action hover:text-action-hover">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {capitalDisplayName(capital)} programs
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
            {programTypeLabel(p.program_type)} · {p.city} · {stateLabel(p.state)}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{p.name}</h1>
          {p.operator ? <p className="mt-2 text-base text-secondary">Run by {p.operator}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {terms.length ? <p className="font-display text-xl font-semibold text-primary">{terms.join(" · ")}</p> : null}
            <StatusChip status={p.status} applications_close={p.applications_close} />
          </div>
          {p.summary ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-secondary">{p.summary}</p> : null}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
            {closed ? (
              <span className="inline-flex h-10 items-center rounded-full border border-bear/40 bg-bear/10 px-5 text-bear">
                Closed — do not apply
              </span>
            ) : (
              <Link
                href={planHref}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 text-on-action hover:bg-action-hover"
              >
                Add to my plan for A$3
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            )}
            <a
              href={p.official_url}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-5 text-primary hover:bg-surface-sunken"
            >
              Official page
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Apply only through the program&rsquo;s own site. The A$3 plan places this program on a twelve-month timeline
            with the grants and other programs that fit your stage.
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-10">
            <AtAGlance facts={e.atAGlance} />

            <Prose id="who" heading="Who it is for" sentences={e.whoItIsFor}>
              {requirements.length ? (
                <ul className="mt-4 divide-y divide-line-subtle rounded-2xl border border-line-subtle bg-surface-raised" data-eligibility>
                  {requirements.map((r) => (
                    <li key={r.key} data-gate={r.key} className="flex items-start gap-3 px-4 py-3 text-sm">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                      <span className="flex-1 text-primary">{r.label}</span>
                      <span className="shrink-0 font-medium text-secondary">{r.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-secondary">No structured gates recorded — read the official criteria before applying.</p>
              )}
              {p.demographic_tags.length ? (
                <p className="mt-3 text-sm text-secondary">Designed for: {p.demographic_tags.map(humanize).join(", ")}.</p>
              ) : null}
              {p.industry_tags.length ? (
                <p className="mt-1 text-sm text-secondary">Industries: {p.industry_tags.map(humanize).join(", ")}.</p>
              ) : null}
            </Prose>

            <Prose id="get" heading="What you get" sentences={e.whatYouGet}>
              {p.benefits.length ? (
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-primary" data-benefits>
                  {p.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </Prose>

            <HowToApply data={e.howToApply} officialLabel="Apply on the official page" draft={{ refId: p.id, kind: "program" }} />

            <Timing data={e.timing} />

            <Faq items={e.faq} />

            <Related data={e.related} programsHeading={`More ${capitalDisplayName(capital)} programs`} grantsHeading="Grants that fit this stage" />
          </div>

          <aside className="h-fit rounded-2xl border border-line-subtle bg-surface-sunken p-5">
            <nav className="space-y-1.5 text-sm" aria-label="Related">
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">More funding</p>
              <p>
                <Link href={e.related.capital.href} className="text-action underline-offset-2 hover:underline">
                  {e.related.capital.label}
                </Link>
              </p>
              <p>
                <Link href={e.related.stateGrants.href} className="text-action underline-offset-2 hover:underline">
                  {e.related.stateGrants.label}
                </Link>
              </p>
              <p>
                <Link href="/funding/report/demo" className="text-action underline-offset-2 hover:underline">
                  See a sample A$3 report
                </Link>
              </p>
            </nav>
            <div className="mt-6 border-t border-line-subtle pt-4">
              <FundingGuides guides={PROGRAM_GUIDES} heading="Guides" compact />
            </div>
          </aside>
        </div>
      </article>

      <FundingDisclaimer lastVerifiedAt={p.last_verified_at} />
    </MarketingShell>
  );
}
