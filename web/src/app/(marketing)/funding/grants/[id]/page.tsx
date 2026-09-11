/**
 * /funding/grants/[id] — one grant, every field (T0241). Eligibility gates
 * from the `eligibility` jsonb become a requirements checklist; evidence,
 * how-to-apply and the official link are free; "Check my eligibility for
 * A$3" is the only paid door (/funding, T0242).
 *
 * Static params come from the table at build time; unknown ids render on
 * demand (dynamicParams default) and 404 when the row is missing.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FundingJsonLd } from "@/components/funding/funding-json-ld";
import { StatusChip } from "@/components/funding/status-chip";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { FundingGuides } from "@/components/funding/funding-guides";
import { getGrant, listGrants } from "@/lib/funding/data";
import {
  buildGrantJsonLd,
  eligibilityRequirements,
  formatAudRange,
  formatLooseDate,
  fundingTypeLabel,
  humanize,
  levelLabel,
  stageLabel,
  stateLabel,
} from "@/lib/funding/directory";
import { FUNDING_CRUMBS, grantDescription, grantPath, grantTitle, grantsStatePath, guidesForGrant } from "@/lib/funding/seo";
import { pageMetadata } from "@/lib/seo/page-meta";

export const revalidate = 3600;

type Params = { id: string };

export async function generateStaticParams(): Promise<Params[]> {
  const rows = await listGrants({ excludeNonMatching: true });
  return rows.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const g = await getGrant(id);
  if (!g || g.exclude_from_matching) {
    return pageMetadata({ title: { absolute: "Grant not found" }, description: "This grant is not in the BlockID directory.", path: "/funding/grants", index: false });
  }
  // S8-A: `${name} — ${state} ${funding noun}` (≤ 60, unique across the
  // directory) + a composed 140–160 description — never the bare summary.
  return pageMetadata({ title: { absolute: grantTitle(g) }, description: grantDescription(g), path: grantPath(g.id) });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="text-sm text-primary">{children}</dd>
    </div>
  );
}

export default async function GrantDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const g = await getGrant(id);
  if (!g || g.exclude_from_matching) notFound();

  const eligibleHref = `/funding?grant=${encodeURIComponent(g.id)}`;
  const requirements = eligibilityRequirements(g.eligibility);
  const range = formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note);

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd items={FUNDING_CRUMBS.grant(g)} />
      <FundingJsonLd data={buildGrantJsonLd(g)} />

      <article className="mx-auto max-w-5xl px-6 pt-12 pb-12 sm:pt-16" data-grant-id={g.id}>
        <Link href="/funding/grants" className="inline-flex items-center gap-1 text-sm font-semibold text-action hover:text-action-hover">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          All grants
        </Link>

        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
            {levelLabel(g.level)} · {stateLabel(g.state)} · {fundingTypeLabel(g.funding_type)}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{g.name}</h1>
          {g.provider ? <p className="mt-2 text-base text-secondary">{g.provider}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="font-display text-2xl font-semibold text-primary">{range}</p>
            <StatusChip status={g.status} closes_at={g.closes_at} next_round_note={g.next_round_note} />
          </div>
          {g.summary ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-secondary">{g.summary}</p> : null}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Link
              href={eligibleHref}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 text-on-action hover:bg-action-hover"
            >
              Check my eligibility for A$3
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a
              href={g.official_url}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-5 text-primary hover:bg-surface-sunken"
            >
              Official page
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Apply only on the official portal. The list is free; the A$3 check is BlockID&rsquo;s analysis of your own startup
            against these gates.
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-10">
            <section aria-labelledby="eligibility-heading">
              <h2 id="eligibility-heading" className="font-display text-xl font-semibold text-primary">
                Eligibility requirements
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
                <p className="mt-4 text-sm text-secondary">
                  No structured gates recorded yet — read the official guidelines before applying.
                </p>
              )}
              {g.demographic_tags.length ? (
                <p className="mt-3 text-sm text-secondary">
                  Reserved for: {g.demographic_tags.map(humanize).join(", ")}.
                </p>
              ) : null}
              {g.industry_tags.length ? (
                <p className="mt-1 text-sm text-secondary">Industries: {g.industry_tags.map(humanize).join(", ")}.</p>
              ) : null}
            </section>

            {g.evidence_needed.length ? (
              <section aria-labelledby="evidence-heading">
                <h2 id="evidence-heading" className="font-display text-xl font-semibold text-primary">
                  Evidence you will need
                </h2>
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-primary" data-evidence>
                  {g.evidence_needed.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {g.how_to_apply ? (
              <section aria-labelledby="apply-heading">
                <h2 id="apply-heading" className="font-display text-xl font-semibold text-primary">
                  How to apply
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-primary">{g.how_to_apply}</p>
              </section>
            ) : null}
          </div>

          <aside className="h-fit rounded-2xl border border-line-subtle bg-surface-sunken p-5">
            <dl className="space-y-4">
              <Field label="Amount">{range}</Field>
              {g.amount_note && (g.amount_min_aud || g.amount_max_aud) ? <Field label="Amount note">{g.amount_note}</Field> : null}
              {g.co_contribution ? <Field label="Co-contribution">{g.co_contribution}</Field> : null}
              {g.application_window ? <Field label="Application window">{humanize(g.application_window)}</Field> : null}
              {g.opens_at ? <Field label="Opens">{formatLooseDate(g.opens_at)}</Field> : null}
              {g.closes_at ? <Field label="Closes">{formatLooseDate(g.closes_at)}</Field> : null}
              {g.lodgement_deadline ? <Field label="Lodgement deadline">{g.lodgement_deadline}</Field> : null}
              {g.next_round_note ? <Field label="Next round">{g.next_round_note}</Field> : null}
              {g.stage_tags.length ? (
                <Field label="Stages">{g.stage_tags.map(stageLabel).join(", ")}</Field>
              ) : null}
              {g.superseded_by ? (
                <Field label="Superseded by">
                  <Link href={`/funding/grants/${encodeURIComponent(g.superseded_by)}`} className="text-action underline-offset-2 hover:underline">
                    {g.superseded_by}
                  </Link>
                </Field>
              ) : null}
              <Field label="Last verified">
                {g.last_verified_at ? formatLooseDate(g.last_verified_at) : "not yet recorded"}
                {" · "}
                <span className="text-secondary">{g.status_confidence} confidence</span>
              </Field>
              {g.source_url ? (
                <Field label="Source">
                  <a href={g.source_url} rel="nofollow noopener noreferrer" target="_blank" className="break-all text-action underline-offset-2 hover:underline">
                    {g.source_url}
                  </a>
                </Field>
              ) : null}
            </dl>
            <nav className="mt-6 space-y-1.5 border-t border-line-subtle pt-4 text-sm" aria-label="Related">
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">More funding</p>
              <p>
                <Link href={grantsStatePath(g.state)} className="text-action underline-offset-2 hover:underline">
                  {g.state === "national" ? "All federal grants" : `All ${stateLabel(g.state)} grants`}
                </Link>
              </p>
              <p>
                <Link href="/funding/programs" className="text-action underline-offset-2 hover:underline">
                  Accelerators and programs
                </Link>
              </p>
              <p>
                <Link href="/funding/report/demo" className="text-action underline-offset-2 hover:underline">
                  See a sample A$3 report
                </Link>
              </p>
            </nav>
            <div className="mt-6 border-t border-line-subtle pt-4">
              <FundingGuides guides={guidesForGrant(g)} heading="Guides" compact />
            </div>
          </aside>
        </div>
      </article>

      <FundingDisclaimer lastVerifiedAt={g.last_verified_at} />
    </MarketingShell>
  );
}
