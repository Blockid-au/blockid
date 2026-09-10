/**
 * /funding/programs/[capital]/[id] — one program: benefits, funding and
 * equity, cost, eligibility checklist, intake dates, official link, and
 * "Add to my plan for A$3" into /funding (T0242). A row requested under the
 * wrong capital redirects nowhere — it 404s, so the canonical URL is the
 * only one that indexes. T0241.
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
import { getProgram, listPrograms } from "@/lib/funding/data";
import {
  SITE_URL,
  buildProgramEventsJsonLd,
  buildProgramJsonLd,
  capitalDisplayName,
  capitalFromSlug,
  capitalSlug,
  eligibilityRequirements,
  formatAudCompact,
  formatLooseDate,
  humanize,
  monthLong,
  programTypeLabel,
  stageLabel,
  stateLabel,
} from "@/lib/funding/directory";

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
  if (!capital || !p || p.capital !== capital) return { title: "Program not found · BlockID.au", robots: { index: false } };
  const title = `${p.name} — ${programTypeLabel(p.program_type)} in ${p.city} · BlockID.au`;
  const description =
    p.summary ??
    `${p.name}: ${programTypeLabel(p.program_type).toLowerCase()} run by ${p.operator ?? "its operator"} in ${p.city}. Benefits, funding and equity terms, eligibility, intake dates and the official application link.`;
  const path = `/funding/programs/${capitalSlug(capital)}/${encodeURIComponent(p.id)}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}`, siteName: "BlockID.au", type: "website", locale: "en_AU" },
    twitter: { card: "summary", title, description },
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="text-sm text-primary">{children}</dd>
    </div>
  );
}

export default async function ProgramDetailPage({ params }: { params: Promise<Params> }) {
  const { capital: slug, id } = await params;
  const capital = capitalFromSlug(slug);
  const p = await getProgram(id);
  if (!capital || !p || p.capital !== capital) notFound();

  const capitalPath = `/funding/programs/${capitalSlug(capital)}`;
  const path = `${capitalPath}/${encodeURIComponent(p.id)}`;
  const planHref = `/funding?program=${encodeURIComponent(p.id)}`;
  const requirements = eligibilityRequirements(p.eligibility);
  const terms = programTerms(p);
  const closed = p.status === "closed";

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Funding", href: "/funding" },
          { name: "Programs", href: "/funding/programs" },
          { name: capitalDisplayName(capital), href: capitalPath },
          { name: p.name, href: path },
        ]}
      />
      <FundingJsonLd data={[buildProgramJsonLd(p), ...buildProgramEventsJsonLd([p])]} />

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
            {p.benefits.length ? (
              <section aria-labelledby="benefits-heading">
                <h2 id="benefits-heading" className="font-display text-xl font-semibold text-primary">
                  What you get
                </h2>
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-primary" data-benefits>
                  {p.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="terms-heading">
              <h2 id="terms-heading" className="font-display text-xl font-semibold text-primary">
                Funding, equity and cost
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Funding">
                  {typeof p.funding_aud === "number" && p.funding_aud > 0 ? formatAudCompact(p.funding_aud) : "None stated"}
                </Field>
                <Field label="Equity">{p.equity_pct ?? "None stated"}</Field>
                <Field label="Cost to founder">{p.cost_to_founder ?? "Not stated"}</Field>
              </dl>
            </section>

            <section aria-labelledby="eligibility-heading">
              <h2 id="eligibility-heading" className="font-display text-xl font-semibold text-primary">
                Who can apply
              </h2>
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
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-line-subtle bg-surface-sunken p-5">
            <dl className="space-y-4">
              {p.venue ? <Field label="Venue">{p.venue}</Field> : null}
              {typeof p.length_weeks === "number" && p.length_weeks > 0 ? (
                <Field label="Length">{p.length_weeks} weeks</Field>
              ) : null}
              {p.intake_months.length ? (
                <Field label="Usual intake months">{p.intake_months.map(monthLong).join(", ")}</Field>
              ) : null}
              {p.applications_open ? <Field label="Applications open">{formatLooseDate(p.applications_open)}</Field> : null}
              {p.applications_close ? <Field label="Applications close">{formatLooseDate(p.applications_close)}</Field> : null}
              {p.next_cohort_start ? <Field label="Next cohort starts">{formatLooseDate(p.next_cohort_start)}</Field> : null}
              {p.stage_tags.length ? <Field label="Stages">{p.stage_tags.map(stageLabel).join(", ")}</Field> : null}
              <Field label="Last verified">
                {p.last_verified_at ? formatLooseDate(p.last_verified_at) : "not yet recorded"}
                {" · "}
                <span className="text-secondary">{p.status_confidence} confidence</span>
              </Field>
            </dl>
          </aside>
        </div>
      </article>

      <FundingDisclaimer lastVerifiedAt={p.last_verified_at} />
    </MarketingShell>
  );
}
