/**
 * SolutionsPageShell — the shell behind the five persona pages at
 * `/solutions/{founder,vn-sme,investor,advisor,accelerator}` and their
 * Vietnamese mirrors under `/vi/solutions/*`.
 *
 * WHAT THIS SHELL IS FOR, AFTER 2026-09-09
 *
 * It used to be an anatomy locked to a product we no longer sell: a hero whose
 * secondary CTA was "See a sample Trust Report (A$5.50)", a fixed grid of
 * exactly three benefits, a mandatory 30/60/90 journey, and a refund FAQ for a
 * SKU that has never taken a payment. Personas with less to say than the
 * anatomy demanded filled the gap with claims — cohort management, LP packs,
 * advisor rostering, dual-jurisdiction identity — none of which have a table
 * or a code path behind them.
 *
 * Two changes stop that recurring:
 *
 *   1. `benefits` and `journey` are arrays, not three-tuples. A persona that
 *      honestly has two things to say now renders two cards instead of
 *      inventing a third, and `journey` may be omitted entirely.
 *   2. Every string rendered here passes through `fillPrices()`, so a price on
 *      a persona page can only come from the catalogue. Both language mirrors
 *      go through this one function, so English and Vietnamese cannot drift
 *      apart on an amount.
 *
 * The hero's supporting line is a plain lede, not a blockquote. It was styled
 * as a quotation with an attribution footer while carrying house copy, which
 * reads as a customer testimonial we do not have.
 *
 * Server component. Pure presentation, no data fetch. `lang` lets the VN
 * mirror set `<section lang="vi">` while reusing this shell.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { fillPrices } from "./solutions-pricing";

/**
 * Trust badges surfaced on `/solutions/investor`, and reusable on any persona
 * page that opts in. Each badge must be a regulatory fact about Auschain PTY
 * LTD that we can point at, not a capability claim.
 */
export interface SolutionTrustBadge {
  label: string;
  sub: string;
}

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
  /**
   * Optional "read more" line rendered under the answer — the evaluator
   * pages' ChatGPT FAQ points at `/compare/chatgpt` this way (T0274).
   */
  href?: string;
  linkLabel?: string;
}

/**
 * The persona pages. `advisor` joined on 2026-09-10 (T0274): until then
 * `/solutions/advisor` was a 301 to `/for/advisor`, which sold advisory firms
 * the founder Growth plan.
 */
export type SolutionSlug =
  | "founder"
  | "vn-sme"
  | "investor"
  | "accelerator"
  | "advisor";

/**
 * Where an evaluator persona's primary CTA lands (G12 §3c.3): the signup
 * form reads `segment=evaluator&plan=<row>` and starts the 7-day card-required
 * Stripe trial on that rung. One place, so the three pages and their
 * Vietnamese mirrors cannot drift.
 */
export const EVALUATOR_SIGNUP_HREF = {
  investor: "/signup?segment=evaluator&plan=investor_angel&trial=1",
  advisor: "/signup?segment=evaluator&plan=investor_advisor&trial=1",
  accelerator: "/signup?segment=evaluator&plan=investor_vc_small&trial=1",
} as const;

/** The pricing page's evaluator view, for the evaluator pages' secondary CTA. */
export const EVALUATOR_PRICING_HREF = "/pricing?segment=evaluator";

export interface SolutionPageProps {
  slug: SolutionSlug;
  lang?: "en" | "vi";
  eyebrow: string;
  headline: string;
  personaLine: string;
  /** The hero lede, under the persona line. Not a quotation. */
  emotionalLine: string;
  /** A short supporting line under the lede. */
  outcomeLine: string;
  primaryCtaLabel: string;
  /** Override the persona's default target from `primaryCtaHrefForSlug()`. */
  primaryCtaHref?: string;
  secondaryCtaLabel: string;
  /** Defaults to {@link SECONDARY_CTA_FALLBACK_HREF}. */
  secondaryCtaHref?: string;
  benefitsTitle: string;
  /**
   * One card per genuine capability. Two is a fine number; padding to three
   * with something we cannot do is what this array type exists to prevent.
   */
  benefits: readonly SolutionBenefit[];
  /** Omit both when a persona has no honest 30/60/90 to describe. */
  journeyTitle?: string;
  journey?: readonly SolutionJourneyStep[];
  faqTitle: string;
  faqs: SolutionFaq[];
  disclaimer: ReactNode;
  /**
   * B2 Task 6 — optional compliance/trust badge strip. Rendered between the
   * hero and the benefits grid when supplied. Investor persona currently
   * opts in; other personas may follow.
   */
  trustBadges?: SolutionTrustBadge[];
  /**
   * B2 Task 7 — optional sample-report preview card. When present, renders a
   * dedicated section between the benefits grid and the journey timeline.
   */
  samplePreview?: {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  };
  /**
   * G12 traction T2 — optional pilot offer card, rendered after the journey
   * and before the FAQ. The accelerator persona uses it for the 14-day
   * Program pilot on a live intake; other personas leave it out.
   */
  pilotCta?: {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  };
}

/**
 * Where the secondary CTA goes when a persona does not name its own.
 *
 * It used to be `/reports/samples`, labelled "See a sample Trust Report
 * (A$5.50)". That route redirects to `/guide/reports`, which is the internal
 * report library — cards labelled by C-Level agent, not an anonymised customer
 * report — so the button promised a sample of the paid deliverable and
 * delivered a jargon-labelled index of our own artefacts. /pricing is a page
 * that says what each rung actually includes.
 */
const SECONDARY_CTA_FALLBACK_HREF = "/pricing";

/**
 * Where a persona's primary CTA goes.
 *
 * Founder, VN-SME and investor all land on `/svi` — the analysis itself. The
 * first run is free and asks for nothing, so sending a first-time visitor to a
 * pricing card asked them to choose a plan before they had seen the product.
 * (It also deep-linked `#tier-pro`, a A$299 tier retired on 2026-09-08 and
 * only reachable now through a hidden alias on the Growth card.)
 *
 * The three evaluator personas (investor, advisor, accelerator) land on the
 * evaluator signup with their recommended rung pre-selected — Scout, Firm,
 * Program — because for them the product *is* the workspace plus the trial
 * (G12 D1: 7 days, card required). Accelerator used to go to contact-sales;
 * that row is still the secondary CTA for multi-cohort programs.
 */
export function primaryCtaHrefForSlug(slug: SolutionSlug): string {
  switch (slug) {
    case "founder":
    case "vn-sme":
      return "/svi";
    case "investor":
    case "advisor":
    case "accelerator":
      return EVALUATOR_SIGNUP_HREF[slug];
  }
}

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
    primaryCtaHref,
    secondaryCtaLabel,
    secondaryCtaHref,
    benefitsTitle,
    benefits,
    journeyTitle,
    journey,
    faqTitle,
    faqs,
    disclaimer,
    trustBadges,
    samplePreview,
    pilotCta,
  } = props;

  // S8-A: the visible FAQ below is the page's FAQPage (one per page — the
  // marketing layout no longer emits an invisible one); prices are filled
  // the same way the rendered dl is, so the schema text matches the page.
  const faqEntity = faqs.map((f) => ({ question: fillPrices(f.q), answer: fillPrices(f.a) }));
  const pagePath = `${lang === "vi" ? "/vi" : ""}/solutions/${slug}`;

  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: lang === "vi" ? "/vi" : "/" },
          { name: lang === "vi" ? "Giải pháp" : "Solutions", href: `${lang === "vi" ? "/vi" : ""}/solutions` },
          { name: fillPrices(headline), href: pagePath },
        ]}
      />
      {faqEntity.length > 0 ? <FAQJsonLd items={faqEntity} /> : null}
      <div lang={lang} data-persona={slug}>
        {/* Hero */}
        <section
          aria-labelledby={`solutions-${slug}-heading`}
          className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-6 pt-16 pb-12 sm:pt-24 sm:pb-16"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-action">
            {fillPrices(eyebrow)}
          </p>
          <h1
            id={`solutions-${slug}-heading`}
            className="font-display text-balance text-3xl font-semibold tracking-tight text-primary sm:text-4xl md:text-5xl"
          >
            {fillPrices(headline)}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-secondary">
            {fillPrices(personaLine)}
          </p>
          {/*
            House copy, not a customer quote. It was rendered as a
            <blockquote> in curly quotes with an attribution footer, which is
            the visual grammar of a testimonial — and we have none to show.
          */}
          <div className="border-l-2 border-action pl-4">
            <p className="text-base text-primary">{fillPrices(emotionalLine)}</p>
            <p className="mt-2 text-xs text-secondary">
              {fillPrices(outcomeLine)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={primaryCtaHref ?? primaryCtaHrefForSlug(slug)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-on-action shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-action-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {fillPrices(primaryCtaLabel)}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={secondaryCtaHref ?? SECONDARY_CTA_FALLBACK_HREF}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-line px-6 text-sm font-medium text-primary transition-colors duration-200 hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {fillPrices(secondaryCtaLabel)}
            </Link>
          </div>
        </section>

        {/* B2 Task 6 — trust / compliance badges (investor persona opts in) */}
        {trustBadges && trustBadges.length > 0 && (
          <section
            aria-label="Compliance and trust badges"
            className="mx-auto max-w-5xl px-6 pb-6"
          >
            <ul className="flex flex-wrap items-center gap-3">
              {trustBadges.map((badge) => (
                <li
                  key={badge.label}
                  className="inline-flex items-start gap-2 rounded-xl border border-line-subtle bg-surface-sunken px-3 py-2"
                >
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-action"
                  />
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-semibold text-primary">
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-secondary">
                      {badge.sub}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Benefits — 3 cards */}
        <section
          aria-labelledby={`solutions-${slug}-benefits`}
          className="mx-auto max-w-5xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-benefits`}
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {fillPrices(benefitsTitle)}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <li
                key={b.title}
                className="rounded-2xl border border-line-subtle bg-surface-sunken p-6"
              >
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-action/15 text-action">
                  <Check aria-hidden="true" className="h-4 w-4" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-primary">
                  {fillPrices(b.title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">
                  {fillPrices(b.body)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* B2 Task 7 — sample investor report preview (opt-in) */}
        {samplePreview && (
          <section
            aria-label="Sample investor report preview"
            className="mx-auto max-w-5xl px-6 py-8"
          >
            <div className="rounded-2xl border border-action/40 bg-surface-sunken p-6 sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-action">
                {fillPrices(samplePreview.eyebrow)}
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold text-primary sm:text-2xl">
                {fillPrices(samplePreview.title)}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                {fillPrices(samplePreview.body)}
              </p>
              <Link
                href={samplePreview.ctaHref}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl border border-action px-5 text-sm font-semibold text-action transition-colors duration-200 hover:bg-action/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {fillPrices(samplePreview.ctaLabel)}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/*
          Journey — optional. A persona with nothing honest to put in a
          90-day arc renders no arc at all rather than a padded one.
        */}
        {journey && journey.length > 0 && (
        <section
          aria-labelledby={`solutions-${slug}-journey`}
          className="mx-auto max-w-5xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-journey`}
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {fillPrices(journeyTitle ?? "")}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {journey.map((step, i) => (
              <li
                key={step.window}
                className="rounded-2xl border border-line-subtle bg-surface-raised p-6"
              >
                <div className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs uppercase tracking-[0.2em] text-action"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
                    {step.window}
                  </span>
                </div>
                <p className="mt-3 font-display text-base font-semibold text-primary">
                  {fillPrices(step.headline)}
                </p>
                <ul className="mt-3 space-y-2">
                  {step.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-sm text-secondary"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-action"
                      />
                      <span>{fillPrices(bullet)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
        )}

        {/* G12 T2 — pilot offer (accelerator persona opts in) */}
        {pilotCta && (
          <section
            aria-label="Pilot offer"
            data-testid="pilot-cta"
            className="mx-auto max-w-5xl px-6 py-8"
          >
            <div className="rounded-2xl border border-action/40 bg-surface-sunken p-6 sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-action">
                {fillPrices(pilotCta.eyebrow)}
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold text-primary sm:text-2xl">
                {fillPrices(pilotCta.title)}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-secondary">
                {fillPrices(pilotCta.body)}
              </p>
              <Link
                href={pilotCta.ctaHref}
                data-testid="pilot-cta-link"
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-on-action shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-action-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {fillPrices(pilotCta.ctaLabel)}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section
          aria-labelledby={`solutions-${slug}-faq`}
          className="mx-auto max-w-4xl px-6 py-12"
        >
          <h2
            id={`solutions-${slug}-faq`}
            className="font-display text-2xl font-semibold tracking-tight text-primary sm:text-3xl"
          >
            {fillPrices(faqTitle)}
          </h2>
          <dl className="mt-8 space-y-4">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-2xl border border-line-subtle bg-surface-sunken p-6"
              >
                <dt className="font-display text-base font-semibold text-primary">
                  {fillPrices(f.q)}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-secondary">
                  {fillPrices(f.a)}
                  {f.href && f.linkLabel ? (
                    <Link
                      href={f.href}
                      className="mt-3 flex w-fit items-center gap-1 font-medium text-action underline-offset-2 hover:underline"
                    >
                      {fillPrices(f.linkLabel)}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  ) : null}
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
          <p className="text-xs leading-relaxed text-secondary">
            {disclaimer}
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}
