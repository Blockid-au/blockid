/**
 * SolutionsPageShell — reusable server component for the four persona pages
 * under `/solutions/{founder,vn-sme,investor,accelerator}` (Master Upgrade
 * Plan §7.1 sitemap + §7.2 messaging).
 *
 * Anatomy (locked by plan):
 *   1. Persona hero — headline + emotional line + 2 CTAs
 *      (primary: /signup?intent=business_id, secondary: sample Trust Report A$5.50)
 *   2. 3-card benefit grid
 *   3. 30 / 60 / 90-day journey preview
 *   4. FAQ (paywall + verification level + refund)
 *   5. Footer disclaimer (Auschain PTY LTD ABN)
 *
 * All copy from §2 Locked Brand Message Set is quoted verbatim in the shared
 * strings; persona-specific supporting copy is passed in via props. Nothing
 * on these pages is legal or financial advice — the same disclaimer that
 * ships on /pricing applies.
 *
 * Server component. Pure presentation, no data fetch. `lang` prop lets the
 * VN mirror set `<section lang="vi">` while reusing this shell.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export interface SolutionBenefit {
  title: string;
  body: string;
}

export interface SolutionJourneyStep {
  window: string; // "Day 0-30" etc.
  headline: string;
  bullets: string[];
}

export interface SolutionFaq {
  q: string;
  a: string;
}

export interface SolutionPageProps {
  slug: "founder" | "vn-sme" | "investor" | "accelerator";
  lang?: "en" | "vi";
  eyebrow: string;
  headline: string;
  personaLine: string;
  emotionalLine: string;
  outcomeLine: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  benefitsTitle: string;
  benefits: [SolutionBenefit, SolutionBenefit, SolutionBenefit];
  journeyTitle: string;
  journey: [SolutionJourneyStep, SolutionJourneyStep, SolutionJourneyStep];
  faqTitle: string;
  faqs: SolutionFaq[];
  disclaimer: ReactNode;
}

const SIGNUP_HREF = "/signup?intent=business_id";
const SAMPLE_REPORT_HREF = "/reports/samples";

export function SolutionsPageShell(props: SolutionPageProps) {
  const {
    slug,
    lang = "en",
    eyebrow,
    headline,
    personaLine,
    emotionalLine,
    outcomeLine,
    primaryCtaLabel,
    secondaryCtaLabel,
    benefitsTitle,
    benefits,
    journeyTitle,
    journey,
    faqTitle,
    faqs,
    disclaimer,
  } = props;

  return (
    <MarketingShell>
      <div lang={lang} data-persona={slug}>
        {/* Hero */}
        <section
          aria-labelledby={`solutions-${slug}-heading`}
          className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-6 pt-16 pb-12 sm:pt-24 sm:pb-16"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-accent)]">
            {eyebrow}
          </p>
          <h1
            id={`solutions-${slug}-heading`}
            className="font-display text-balance text-3xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-4xl md:text-5xl"
          >
            {headline}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[var(--fintech-ink-muted)]">
            {personaLine}
          </p>
          <blockquote className="border-l-2 border-[var(--fintech-accent)] pl-4 text-base italic text-[var(--fintech-ink)]">
            &ldquo;{emotionalLine}&rdquo;
            <footer className="mt-2 text-xs not-italic text-[var(--fintech-ink-muted)]">
              {outcomeLine}
            </footer>
          </blockquote>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={SIGNUP_HREF}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--fintech-accent)] px-6 text-sm font-semibold text-[var(--fintech-bg-primary)] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-[var(--fintech-accent-hover)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {primaryCtaLabel}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={SAMPLE_REPORT_HREF}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--fintech-border-strong)] px-6 text-sm font-medium text-[var(--fintech-ink)] transition-colors duration-200 hover:bg-[var(--fintech-bg-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {secondaryCtaLabel}
            </Link>
          </div>
        </section>

        {/* Benefits — 3 cards */}
        <section
          aria-labelledby={`solutions-${slug}-benefits`}
          className="mx-auto max-w-5xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-benefits`}
            className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {benefitsTitle}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <li
                key={b.title}
                className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
              >
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--fintech-accent)]/15 text-[var(--fintech-accent)]">
                  <Check aria-hidden="true" className="h-4 w-4" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-[var(--fintech-ink)]">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                  {b.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Journey — 30/60/90 */}
        <section
          aria-labelledby={`solutions-${slug}-journey`}
          className="mx-auto max-w-5xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-journey`}
            className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {journeyTitle}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {journey.map((step, i) => (
              <li
                key={step.window}
                className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-6"
              >
                <div className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--fintech-accent)]"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fintech-ink-muted)]">
                    {step.window}
                  </span>
                </div>
                <p className="mt-3 font-display text-base font-semibold text-[var(--fintech-ink)]">
                  {step.headline}
                </p>
                <ul className="mt-3 space-y-2">
                  {step.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-[var(--fintech-ink-muted)]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fintech-accent)]"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby={`solutions-${slug}-faq`}
          className="mx-auto max-w-4xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-faq`}
            className="font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {faqTitle}
          </h2>
          <dl className="mt-8 space-y-4">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6"
              >
                <dt className="font-display text-base font-semibold text-[var(--fintech-ink)]">
                  {f.q}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Disclaimer footer band (page-level, above MarketingFooter) */}
        <section
          aria-label="Regulatory disclaimer"
          className="mx-auto max-w-4xl px-6 pb-16"
        >
          <p className="text-xs leading-relaxed text-[var(--fintech-ink-muted)]">
            {disclaimer}
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}
