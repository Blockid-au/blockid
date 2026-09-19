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
 * G17 P2-A: rendered on the unicorn template — PageHero → Section (table)
 * → Section (pull-quote) → Section (fair, FeatureGrid) → Section (diff,
 * FeatureGrid) → Section (Faq) → CtaBand → Section (sources + disclaimer).
 * Test contract kept: `data-compare-variant`, `data-row` per table row,
 * the three CTA hrefs, one FAQPage + one BreadcrumbList, one h1
 * (./page.test.tsx; post-deploy smoke reads the first `<table>`).
 *
 * Server component. No client state, no data fetch. `PageViewTracker` is the
 * only client island and fires `compare_viewed { variant }` once.
 */

import Link from "next/link";
import {
  Database,
  FileCheck2,
  Landmark,
  Lightbulb,
  PenLine,
  Quote,
  Scale,
  ScanSearch,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  CTA_CLASS,
  Faq,
  FeatureGrid,
  PageHero,
  Prose,
  Section,
} from "@/components/marketing/template";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { COMPARE_CTA_HREF, type ComparePageProps, type CompareVariant } from "./compare-content";

/** Which comparison column the alias route is about; `all` highlights none. */
function highlighted(variant: CompareVariant): "chatgpt" | "valuer" | null {
  if (variant === "chatgpt") return "chatgpt";
  if (variant === "valuers") return "valuer";
  return null;
}

/** The fairness cards (build / draft / brainstorm) and the six differentiators, by position. */
const FAIR_ICONS: readonly LucideIcon[] = [Wrench, PenLine, Lightbulb];
const DIFF_ICONS: readonly LucideIcon[] = [ScanSearch, Users, Database, Landmark, FileCheck2, Scale];

export function ComparePage(props: ComparePageProps) {
  const { variant, lang, table, pullquote, fair, diff, faqs, sources, cta } = props;
  const focus = highlighted(variant);
  const colClass = (col: "blockid" | "chatgpt" | "valuer") =>
    col === "blockid"
      ? "bg-accent-soft text-primary"
      : focus === col
        ? "bg-surface-sunken text-primary"
        : "text-secondary";

  const plansLink = (
    <Link href={COMPARE_CTA_HREF.plans} className={CTA_CLASS.link}>
      {cta.plans}
    </Link>
  );

  return (
    <MarketingShell>
      <PageViewTracker event="compare_viewed" params={{ variant }} />
      <BreadcrumbListJsonLd items={props.breadcrumb} />
      <FAQJsonLd items={faqs.map((f) => ({ question: f.q, answer: f.a }))} />

      <div lang={lang} data-compare-variant={variant}>
        <PageHero
          eyebrow={props.eyebrow}
          title={props.headline}
          sub={props.lede}
          ctas={[
            { href: COMPARE_CTA_HREF.report, label: cta.report, ctaId: `compare_${variant}_hero_report` },
            { href: COMPARE_CTA_HREF.trial, label: cta.trial },
          ]}
          footnote={
            <>
              {cta.note} {plansLink}
            </>
          }
          align="start"
        />

        {/* Comparison table */}
        <Section id="table" eyebrow={table.kicker} title={table.title} tone="sunken">
          <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface shadow-1">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr className="bg-surface-sunken text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-secondary">
                    {table.columns.criterion}
                  </th>
                  <th scope="col" className="bg-accent-soft px-4 py-3 font-semibold text-primary">
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
          <p className="mt-3 text-xs text-muted">{table.caption}</p>
        </Section>

        {/* Pull-quote — the approved §4b paragraph, verbatim */}
        <Section id="pullquote" eyebrow={pullquote.kicker} title={pullquote.q}>
          <figure className="max-w-3xl rounded-xl border border-line-subtle bg-surface-sunken p-6 shadow-1 sm:p-8">
            <blockquote className="flex gap-4">
              <Quote aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-accent" />
              <p className="text-base leading-relaxed text-primary">{pullquote.a}</p>
            </blockquote>
          </figure>
        </Section>

        {/* Fairness */}
        <Section id="fair" title={fair.title} lede={fair.intro} tone="sunken">
          <FeatureGrid
            columns={3}
            ariaLabel={fair.title}
            items={fair.items.map((item, i) => ({
              icon: FAIR_ICONS[i % FAIR_ICONS.length]!,
              title: item.title,
              body: item.body,
            }))}
          />
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-secondary">{fair.outro}</p>
        </Section>

        {/* Six differentiators → proof surfaces */}
        <Section id="diff" eyebrow={diff.kicker} title={diff.title}>
          <FeatureGrid
            columns={3}
            ariaLabel={diff.title}
            items={diff.cards.map((card, i) => ({
              icon: DIFF_ICONS[i % DIFF_ICONS.length]!,
              title: card.title,
              body: card.body,
              href: card.href,
              cta: card.linkLabel,
              ctaId: `compare_diff_${i + 1}`,
            }))}
          />
        </Section>

        {/* FAQ — the visible FAQPage */}
        <Section id="faq" title={props.faqTitle} tone="sunken">
          <Faq className="max-w-3xl" items={faqs.map((f) => ({ question: f.q, answer: f.a }))} />
        </Section>

        <CtaBand
          title={cta.trial}
          sub={cta.note}
          primary={{ href: COMPARE_CTA_HREF.report, label: cta.report, ctaId: `compare_${variant}_final_report` }}
          secondary={{ href: COMPARE_CTA_HREF.trial, label: cta.trial }}
          footnote={plansLink}
          tone="base"
        />

        {/* Sources — plain text, cited by name; never a link to a competitor's checkout */}
        <Section id="sources" title={sources.title} lede={sources.intro} spacing="sm" tone="sunken">
          <Prose measure="wide">
            <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-secondary">
              {sources.items.map((s) => (
                <li key={s}>{s}</li>
              ))}
              <li>{sources.prices}</li>
            </ol>
            <div className="mt-8">
              <EvaluatorReportDisclaimer variant="compact" />
            </div>
          </Prose>
        </Section>
      </div>
    </MarketingShell>
  );
}
