/**
 * SolutionsPageShell — the shell behind the five persona pages at
 * `/solutions/{founder,vn-sme,investor,advisor,accelerator}` and their
 * Vietnamese mirrors under `/vi/solutions/*`.
 *
 * G17 P2-A (2026-09-19): the shell now renders on the unicorn template
 * (docs/design/unicorn-template.md) — `PageHero` → `Section`s →
 * `CtaBand` — so every persona page shares the homepage's rhythm, tokens
 * and chrome. Page-local hero / section markup is gone; what remains here
 * is the persona *content model*, which is unchanged:
 *
 *   1. `benefits` and `journey` are arrays, not three-tuples. A persona that
 *      honestly has two things to say renders two cards instead of
 *      inventing a third, and `journey` may be omitted entirely.
 *   2. Every string rendered here passes through `fillPrices()`, so a price on
 *      a persona page can only come from the catalogue. Both language mirrors
 *      go through this one function, so English and Vietnamese cannot drift
 *      apart on an amount.
 *
 * No price table lives here (D3/D5): the evaluator pages link to
 * `/pricing?segment=evaluator` for the ladder.
 *
 * Test contract (grep before touching): `data-testid="pilot-cta"` +
 * `pilot-cta-link` (tests/e2e/smoke/post-deploy.spec.ts), one `<h1>`, one
 * FAQPage + one BreadcrumbList JSON-LD (the colocated page tests),
 * `data-persona` on the wrapper.
 *
 * Server component. Pure presentation, no data fetch. `lang` lets the VN
 * mirror set `<div lang="vi">` while reusing this shell.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Database,
  FileCheck2,
  Landmark,
  ScanSearch,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CTA_CLASS,
  CtaBand,
  Faq,
  FeatureGrid,
  FOCUS_RING,
  MOTION,
  PageHero,
  ProofBand,
  Section,
  type FaqItem,
  type FeatureItem,
} from "@/components/marketing/template";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { cn } from "@/lib/utils";
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
  /** Lucide icon for the card; defaults to the position's icon in `BENEFIT_ICONS`. */
  icon?: LucideIcon;
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
  // Pricing v4 (2026-09-16): programs land on the Intake link (14-day trial).
  accelerator: "/signup?segment=evaluator&plan=accelerator_intake&trial=1",
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
   * B2 Task 6 — optional compliance/trust badge strip. Rendered as the
   * template's `ProofBand` between the hero and the benefits grid when
   * supplied. Investor persona currently opts in; other personas may follow.
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
  /**
   * The closing `CtaBand` title / line. Defaults per persona family
   * (`CLOSING_COPY`) so the three evaluator pages and the two founder pages
   * close on the same sentence in each language.
   */
  closingTitle?: string;
  closingSub?: string;
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

/**
 * Icons for the benefit cards, by position. The evaluator pages carry the
 * six differentiators of evaluator-traction-2026-09-10.md §4 in this order
 * (one rubric · the whole C-suite · the startup's own evidence · built for
 * Australia · the price · method, not vibes); the founder pages use the
 * first three.
 */
export const BENEFIT_ICONS: readonly LucideIcon[] = [
  ScanSearch,
  Users,
  Database,
  Landmark,
  FileCheck2,
  Scale,
];

type ClosingFamily = "evaluator" | "accelerator" | "founder";

function closingFamily(slug: SolutionSlug): ClosingFamily {
  if (slug === "accelerator") return "accelerator";
  if (slug === "investor" || slug === "advisor") return "evaluator";
  return "founder";
}

/** Default closing-band copy per persona family and language (D5: one CtaBand per page). */
export const CLOSING_COPY: Readonly<
  Record<"en" | "vi", Record<ClosingFamily, { title: string; sub: string }>>
> = {
  en: {
    evaluator: {
      title: "Score your next deal on one rubric.",
      sub: "Start the trial on the rung that fits your desk. Cancel in the portal before it ends and you pay nothing.",
    },
    accelerator: {
      title: "Score the whole cohort, once.",
      sub: "One rubric for every applicant, a cohort table you can sort and a report your sponsors can read.",
    },
    founder: {
      title: "See your score before you pitch.",
      sub: "The first run is free and needs no card. Paste a name, a deck or a URL.",
    },
  },
  vi: {
    evaluator: {
      title: "Chấm điểm thương vụ tiếp theo trên một thước đo.",
      sub: "Bắt đầu dùng thử ở gói phù hợp với bàn làm việc của bạn. Huỷ trong cổng thanh toán trước khi hết hạn và bạn không trả gì.",
    },
    accelerator: {
      title: "Chấm điểm cả khoá, một lần.",
      sub: "Một thước đo cho mọi hồ sơ, một bảng khoá có thể sắp xếp và một báo cáo nhà tài trợ đọc được.",
    },
    founder: {
      title: "Xem điểm của bạn trước khi gọi vốn.",
      sub: "Lần chạy đầu tiên miễn phí và không cần thẻ. Dán tên, bộ slide hoặc URL.",
    },
  },
};

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
    closingTitle,
    closingSub,
  } = props;

  // S8-A: the visible FAQ below is the page's FAQPage (one per page — the
  // marketing layout no longer emits an invisible one); prices are filled
  // the same way the rendered list is, so the schema text matches the page.
  const faqEntity = faqs.map((f) => ({ question: fillPrices(f.q), answer: fillPrices(f.a) }));
  const pagePath = `${lang === "vi" ? "/vi" : ""}/solutions/${slug}`;
  const primary = { href: primaryCtaHref ?? primaryCtaHrefForSlug(slug), label: fillPrices(primaryCtaLabel) };
  const secondary = { href: secondaryCtaHref ?? SECONDARY_CTA_FALLBACK_HREF, label: fillPrices(secondaryCtaLabel) };
  const closing = CLOSING_COPY[lang][closingFamily(slug)];

  const benefitItems: FeatureItem[] = benefits.map((b, i) => ({
    icon: b.icon ?? BENEFIT_ICONS[i % BENEFIT_ICONS.length]!,
    title: fillPrices(b.title),
    body: fillPrices(b.body),
  }));

  const faqItems: FaqItem[] = faqs.map((f) => {
    const answer = fillPrices(f.a);
    return {
      question: fillPrices(f.q),
      answerText: answer,
      answer:
        f.href && f.linkLabel ? (
          <>
            {answer}
            <Link
              href={f.href}
              className={cn("mt-3 flex w-fit items-center gap-1 font-medium text-action underline-offset-2 hover:underline", FOCUS_RING)}
            >
              {fillPrices(f.linkLabel)}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </>
        ) : (
          answer
        ),
    };
  });

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
        <PageHero
          eyebrow={fillPrices(eyebrow)}
          title={fillPrices(headline)}
          sub={fillPrices(personaLine)}
          ctas={[
            { ...primary, ctaId: `solutions_${slug}_hero_primary` },
            { ...secondary, ctaId: `solutions_${slug}_hero_secondary` },
          ]}
          footnote={
            <>
              <span className="text-primary">{fillPrices(emotionalLine)}</span>{" "}
              <span>{fillPrices(outcomeLine)}</span>
            </>
          }
          align="start"
        />

        {/* B2 Task 6 — trust / compliance facts (investor persona opts in) */}
        {trustBadges && trustBadges.length > 0 ? (
          <Section id="trust" ariaLabel="Compliance and trust badges" spacing="sm" tone="sunken">
            <ProofBand
              ariaLabel="Compliance and trust badges"
              items={trustBadges.map((b) => ({ label: b.label, sub: b.sub }))}
            />
          </Section>
        ) : null}

        {/* Benefits — one card per genuine capability */}
        <Section id="benefits" title={fillPrices(benefitsTitle)}>
          <FeatureGrid columns={3} ariaLabel={fillPrices(benefitsTitle)} items={benefitItems} />
        </Section>

        {/* B2 Task 7 — sample investor report preview (opt-in) */}
        {samplePreview ? (
          <Section
            id="sample"
            eyebrow={fillPrices(samplePreview.eyebrow)}
            title={fillPrices(samplePreview.title)}
            lede={fillPrices(samplePreview.body)}
            tone="sunken"
            actions={[{ href: samplePreview.ctaHref, label: fillPrices(samplePreview.ctaLabel), variant: "secondary" }]}
          />
        ) : null}

        {/*
          Journey — optional. A persona with nothing honest to put in a
          90-day arc renders no arc at all rather than a padded one.
        */}
        {journey && journey.length > 0 ? (
          <Section id="journey" title={fillPrices(journeyTitle ?? "")} tone="sunken">
            <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              {journey.map((step, i) => (
                <li
                  key={step.window}
                  className="flex h-full flex-col rounded-xl border border-line-subtle bg-surface p-6 shadow-1"
                >
                  <div className="flex items-baseline gap-3">
                    <span aria-hidden="true" className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                      {step.window}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-semibold tracking-tight text-primary">
                    {fillPrices(step.headline)}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {step.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm leading-relaxed text-secondary">
                        <span aria-hidden="true" className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                        <span>{fillPrices(bullet)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* G12 T2 — pilot offer (accelerator persona opts in). Test ids are load-bearing. */}
        {pilotCta ? (
          <Section id="pilot" ariaLabel="Pilot offer" spacing="sm">
            <div
              data-testid="pilot-cta"
              className="rounded-xl border border-line-subtle bg-surface-sunken p-6 shadow-1 sm:p-8"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {fillPrices(pilotCta.eyebrow)}
              </p>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl">
                {fillPrices(pilotCta.title)}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-secondary">
                {fillPrices(pilotCta.body)}
              </p>
              <Link
                href={pilotCta.ctaHref}
                data-testid="pilot-cta-link"
                data-cta-id={`solutions_${slug}_pilot`}
                className={cn(CTA_CLASS.primary, "mt-6", MOTION)}
              >
                {fillPrices(pilotCta.ctaLabel)}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </Section>
        ) : null}

        {/* FAQ — the visible FAQPage */}
        <Section id="faq" title={fillPrices(faqTitle)}>
          <Faq items={faqItems} className="max-w-3xl" />
        </Section>

        <CtaBand
          title={closingTitle ?? closing.title}
          sub={closingSub ?? closing.sub}
          primary={{ ...primary, ctaId: `solutions_${slug}_final_primary` }}
          secondary={secondary}
          footnote={disclaimer}
        />
      </div>
    </MarketingShell>
  );
}
