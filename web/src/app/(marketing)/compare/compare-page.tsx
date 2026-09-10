/**
 * ComparePage — the body behind `/compare`, `/compare/chatgpt`,
 * `/compare/valuers` and `/vi/compare` (T0274 part 2, G12 sprint S4).
 *
 * The page answers one buyer question — "why not just ask ChatGPT, or pay a
 * valuer?" — for the three evaluator personas. It is deliberately even-handed:
 * the fairness section says what a general chatbot is genuinely good at, the
 * FAQ says when an independent valuer is still the right instrument, and the
 * compact evaluator disclaimer sits at the bottom because the table talks
 * about valuation and eligibility.
 *
 * Every visible string comes from `buildCompareProps()` (catalogue keys
 * `compare.*`, tokens filled from plans.csv). Competitor prices are quoted
 * as published list prices, September 2026, and sources are cited by name
 * in plain text — this page never links to a competitor's checkout.
 *
 * Server component. No client state, no data fetch. `PageViewTracker` is the
 * only client island and fires `compare_viewed { variant }` once.
 */

import Link from "next/link";
import { ArrowRight, Check, Quote } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { COMPARE_CTA_HREF, type ComparePageProps, type CompareVariant } from "./compare-content";

const PRIMARY_BTN =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-on-action shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-action-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const SECONDARY_BTN =
  "inline-flex h-12 items-center justify-center rounded-xl border border-line px-6 text-sm font-medium text-primary transition-colors duration-200 hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Which comparison column the alias route is about; `all` highlights none. */
function highlighted(variant: CompareVariant): "chatgpt" | "valuer" | null {
  if (variant === "chatgpt") return "chatgpt";
  if (variant === "valuers") return "valuer";
  return null;
}

function CtaRow({ cta }: { cta: ComparePageProps["cta"] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={COMPARE_CTA_HREF.report} className={PRIMARY_BTN}>
        {cta.report}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
      <Link href={COMPARE_CTA_HREF.trial} className={SECONDARY_BTN}>
        {cta.trial}
      </Link>
      <Link href={COMPARE_CTA_HREF.plans} className={SECONDARY_BTN}>
        {cta.plans}
      </Link>
    </div>
  );
}

export function ComparePage(props: ComparePageProps) {
  const { variant, lang, table, pullquote, fair, diff, faqs, sources } = props;
  const focus = highlighted(variant);
  const colClass = (col: "blockid" | "chatgpt" | "valuer") =>
    col === "blockid"
      ? "bg-action/5 text-primary"
      : focus === col
        ? "bg-surface-sunken text-primary"
        : "text-secondary";

  return (
    <MarketingShell>
      <PageViewTracker event="compare_viewed" params={{ variant }} />
      <BreadcrumbListJsonLd items={props.breadcrumb} />
      <FAQJsonLd items={faqs.map((f) => ({ question: f.q, answer: f.a }))} />

      <div lang={lang} data-compare-variant={variant}>
        {/* Hero */}
        <section
          aria-labelledby="compare-heading"
          className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-6 pt-16 pb-12 sm:pt-24 sm:pb-16"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-action">
            {props.eyebrow}
          </p>
          <h1
            id="compare-heading"
            className="font-display text-balance text-3xl font-semibold tracking-tight text-primary sm:text-4xl md:text-5xl"
          >
            {props.headline}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-secondary">{props.lede}</p>
          <CtaRow cta={props.cta} />
          <p className="text-xs text-secondary">{props.cta.note}</p>
        </section>

        {/* Comparison table */}
        <section aria-labelledby="compare-table-heading" className="mx-auto max-w-6xl px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
            {table.kicker}
          </p>
          <h2
            id="compare-table-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {table.title}
          </h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-line-subtle">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr className="bg-surface-sunken text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-secondary">
                    {table.columns.criterion}
                  </th>
                  <th scope="col" className="bg-action/10 px-4 py-3 font-semibold text-primary">
                    {table.columns.blockid}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-primary">
                    {table.columns.chatgpt}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-primary">
                    {table.columns.valuer}
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr
                    key={row.key}
                    data-row={row.key}
                    className="border-t border-line-subtle align-top"
                  >
                    <th scope="row" className="px-4 py-4 text-left font-semibold text-primary">
                      {row.label}
                    </th>
                    <td className={`px-4 py-4 leading-relaxed ${colClass("blockid")}`}>
                      {row.blockid}
                    </td>
                    <td className={`px-4 py-4 leading-relaxed ${colClass("chatgpt")}`}>
                      {row.chatgpt}
                    </td>
                    <td className={`px-4 py-4 leading-relaxed ${colClass("valuer")}`}>
                      {row.valuer}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-secondary">{table.caption}</p>
        </section>

        {/* Pull-quote — the approved §4b paragraph, verbatim */}
        <section aria-labelledby="compare-pullquote-heading" className="mx-auto max-w-4xl px-6 py-12">
          <figure className="rounded-3xl border border-action/40 bg-surface-sunken p-8 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
              {pullquote.kicker}
            </p>
            <h2
              id="compare-pullquote-heading"
              className="mt-3 font-display text-2xl font-semibold tracking-tight text-primary"
            >
              {pullquote.q}
            </h2>
            <blockquote className="mt-6 flex gap-4">
              <Quote aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-action" />
              <p className="text-base leading-relaxed text-primary">{pullquote.a}</p>
            </blockquote>
          </figure>
        </section>

        {/* Fairness */}
        <section aria-labelledby="compare-fair-heading" className="mx-auto max-w-5xl px-6 py-12">
          <h2
            id="compare-fair-heading"
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {fair.title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">{fair.intro}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {fair.items.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-line-subtle bg-surface-raised p-6"
              >
                <h3 className="font-display text-lg font-semibold text-primary">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-secondary">{fair.outro}</p>
        </section>

        {/* Six differentiators → proof surfaces */}
        <section aria-labelledby="compare-diff-heading" className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-action">
            {diff.kicker}
          </p>
          <h2
            id="compare-diff-heading"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {diff.title}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diff.cards.map((card) => (
              <li
                key={card.href}
                className="flex flex-col rounded-2xl border border-line-subtle bg-surface-sunken p-6"
              >
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-action/15 text-action">
                  <Check aria-hidden="true" className="h-4 w-4" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-primary">{card.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-secondary">{card.body}</p>
                <Link
                  href={card.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-action underline-offset-2 hover:underline"
                >
                  {card.linkLabel}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section aria-labelledby="compare-faq-heading" className="mx-auto max-w-4xl px-6 py-12">
          <h2
            id="compare-faq-heading"
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {props.faqTitle}
          </h2>
          <dl className="mt-8 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line-subtle bg-surface-sunken p-6">
                <dt className="font-display text-base font-semibold text-primary">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-secondary">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA band */}
        <section aria-label="Next step" className="mx-auto max-w-4xl px-6 py-8">
          <CtaRow cta={props.cta} />
        </section>

        {/* Sources — plain text, cited by name; never a link to a competitor's checkout */}
        <section aria-labelledby="compare-sources-heading" className="mx-auto max-w-4xl px-6 py-12">
          <h2
            id="compare-sources-heading"
            className="font-display text-lg font-semibold tracking-tight text-primary"
          >
            {sources.title}
          </h2>
          <p className="mt-2 text-xs text-secondary">{sources.intro}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-secondary">
            {sources.items.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>{sources.prices}</li>
          </ol>
        </section>

        {/* Compact evaluator disclaimer */}
        <section aria-label="Regulatory disclaimer" className="mx-auto max-w-4xl px-6 pb-16">
          <EvaluatorReportDisclaimer variant="compact" />
        </section>
      </div>
    </MarketingShell>
  );
}
