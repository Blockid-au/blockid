/**
 * Enrichment sections for the program + grant detail pages (S9-B).
 *
 * Renders the structured sections built by `lib/funding/enrich.ts` — At a
 * glance, Who it is for, What you get, How to apply, Timing, FAQ, Related —
 * in the directory's design language (rounded-2xl cards, surface tokens,
 * `font-display` h2s, small uppercase dt labels). Every section returns
 * `null` when its data is empty so a page never shows an empty heading.
 * Server components, no data fetch; the FAQ JSON-LD rides on FundingJsonLd.
 */

import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import type { Fact, FaqItem, HowToApplySection as HowToApplyData, RelatedLink, RelatedSection as RelatedData, TimingSection as TimingData } from "@/lib/funding/enrich";
import { DEADLINE_LABELS, DEADLINE_TONE } from "@/lib/funding/deadline-status";

const H2 = "font-display text-xl font-semibold text-primary";

export function AtAGlance({ facts }: { facts: ReadonlyArray<Fact> }) {
  if (facts.length === 0) return null;
  return (
    <section aria-labelledby="glance-heading" data-section="at-a-glance">
      <h2 id="glance-heading" className={H2}>
        At a glance
      </h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 rounded-2xl border border-line-subtle bg-surface-raised p-5 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5" data-fact={f.label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{f.label}</dt>
            <dd className="text-sm text-primary [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Prose({
  id,
  heading,
  sentences,
  children,
}: {
  id: string;
  heading: string;
  sentences: ReadonlyArray<string>;
  /** Existing structured lists (eligibility checklist, benefits) that sit under the prose. */
  children?: React.ReactNode;
}) {
  if (sentences.length === 0 && !children) return null;
  return (
    <section aria-labelledby={`${id}-heading`} data-section={id}>
      <h2 id={`${id}-heading`} className={H2}>
        {heading}
      </h2>
      {sentences.length ? (
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-primary">
          {sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function HowToApply({ data, officialLabel = "Official page" }: { data: HowToApplyData; officialLabel?: string }) {
  const hasContent = data.intro || data.steps.length || data.evidence.length || data.prompts.length;
  if (!hasContent) return null;
  return (
    <section aria-labelledby="apply-heading" data-section="how-to-apply">
      <h2 id="apply-heading" className={H2}>
        How to apply
      </h2>
      {data.intro ? <p className="mt-4 text-sm leading-relaxed text-primary">{data.intro}</p> : null}
      {data.steps.length ? (
        <ol className="mt-4 space-y-2 text-sm leading-relaxed text-primary" data-apply-steps>
          {data.steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-action/10 text-[11px] font-semibold text-action"
              >
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {data.evidence.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-primary">Evidence you will need</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-primary" data-evidence>
            {data.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.prompts.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-primary">You will be asked</h3>
          <ul className="mt-2 space-y-2" data-apply-prompts>
            {data.prompts.map((q) => (
              <li key={q} className="flex items-start gap-3 rounded-2xl border border-line-subtle bg-surface-raised px-4 py-3 text-sm text-primary">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-5 text-sm font-semibold">
        <a
          href={data.officialUrl}
          rel="nofollow noopener noreferrer"
          target="_blank"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-5 text-primary hover:bg-surface-sunken"
        >
          {officialLabel}
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">(opens the official site in a new tab)</span>
        </a>
      </p>
    </section>
  );
}

export function Timing({ data }: { data: TimingData }) {
  if (data.sentences.length === 0) return null;
  return (
    <section aria-labelledby="timing-heading" data-section="timing" data-deadline-status={data.status}>
      <h2 id="timing-heading" className={H2}>
        Timing
      </h2>
      <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DEADLINE_TONE[data.status]}`}>
          {DEADLINE_LABELS[data.status]}
        </span>
        <span className="text-xs text-secondary">{data.label}</span>
      </p>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-primary">
        {data.sentences.map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
    </section>
  );
}

export function Faq({ items }: { items: ReadonlyArray<FaqItem> }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="faq-heading" data-section="faq">
      <h2 id="faq-heading" className={H2}>
        Frequently asked
      </h2>
      <dl className="mt-4 divide-y divide-line-subtle rounded-2xl border border-line-subtle bg-surface-raised">
        {items.map((q) => (
          <div key={q.question} className="px-4 py-3" data-faq-item>
            <dt className="text-sm font-semibold text-primary">{q.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-secondary">{q.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RelatedCards({ heading, items, kind }: { heading: string; items: ReadonlyArray<RelatedLink>; kind: "program" | "grant" }) {
  if (items.length === 0) return null;
  return (
    <div data-related={kind}>
      <h3 className="text-sm font-semibold text-primary">{heading}</h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-3">
        {items.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="flex h-full flex-col gap-1 rounded-2xl border border-line-subtle bg-surface-raised px-4 py-3 transition-colors duration-200 hover:border-action"
            >
              <span className="text-sm font-semibold leading-snug text-primary">{r.name}</span>
              <span className="text-xs text-secondary">{r.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Related({ data, programsHeading, grantsHeading }: { data: RelatedData; programsHeading: string; grantsHeading: string }) {
  return (
    <section aria-labelledby="related-heading" data-section="related">
      <h2 id="related-heading" className={H2}>
        Related funding
      </h2>
      <div className="mt-4 space-y-6">
        <RelatedCards heading={programsHeading} items={data.programs} kind="program" />
        <RelatedCards heading={grantsHeading} items={data.grants} kind="grant" />
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <Link
            href={data.funding.href}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-action px-5 text-on-action hover:bg-action-hover"
            data-funding-cta
          >
            {data.funding.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link href={`/insights/${data.insight.slug}`} className="text-action underline-offset-2 hover:underline" data-related-insight={data.insight.slug}>
            {data.insight.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
