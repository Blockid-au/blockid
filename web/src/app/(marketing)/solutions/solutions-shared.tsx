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
 * Test contract (grep before touching): `data-testid="pilot-offer"` +
 * `pilot-offer-card[data-sku]` + `pilot-buy-<sku>` (tests/e2e/smoke/
 * post-deploy.spec.ts, tests/live-qa/34-purchase-path.spec.ts), one `<h1>`,
 * one FAQPage + one BreadcrumbList JSON-LD (the colocated page tests),
 * `data-persona` on the wrapper, `solutions-problem` / `solutions-statement`
 * / `solutions-tiers` (G21 P0-C).
 *
 * Server component. Pure presentation, no data fetch. `lang` lets the VN
 * mirror set `<div lang="vi">` while reusing this shell.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Database,
  FileCheck2,
  FolderLock,
  Landmark,
  LineChart,
  Link2,
  ListChecks,
  ScanSearch,
  Scale,
  Share2,
  ShieldCheck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PilotOffer, type PilotOfferProps, type PilotOfferTier } from "@/components/marketing/PilotOffer";
import {
  CtaBand,
  Faq,
  TrustBand,
  FeatureGrid,
  FOCUS_RING,
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
 * page that opts in. Each badge must be a regulatory fact about the operator
 * (LEGAL_ENTITY) that we can point at, not a capability claim.
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

/** Personas whose page mounts the G21 `TrustBand` above the close by default. */
export const TRUST_BAND_DEFAULT_SLUGS: ReadonlySet<SolutionSlug> = new Set<SolutionSlug>([
  "investor",
  "founder",
  "advisor",
  "accelerator",
]);

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
   * G21 P0-C — the opening statement under the hero: three short lines that
   * name the problem and one line that names the answer ("Your applicants
   * arrive in different formats… BlockID creates one consistent assessment
   * layer.").
   */
  problem?: { lines: readonly string[]; resolution: string };
  /**
   * G21 P0-C — a numbered step grid (the founder's nine-step workflow).
   * Distinct from `journey`, which carries bullets per stage.
   */
  workflow?: { title: string; lede?: string; steps: readonly { title: string; body: string }[] };
  /**
   * G21 P0-C — one quiet statement band ("Humans make the decision",
   * "BlockID supports due diligence. It does not replace due diligence.").
   */
  statement?: { eyebrow?: string; title: string; body: string };
  /**
   * G21 P0-C — the paid Cohort Validation Pilot block, rendered after the
   * journey / statement and before the FAQ with `id="pilot"` so
   * `/solutions/accelerator#pilot` lands on it. Accelerator only.
   */
  pilotOffer?: Omit<PilotOfferProps, "id">;
  /** G21 P0-C — plan rungs for this persona, prices from constants via tokens. */
  tiers?: { title: string; lede?: string; items: readonly PilotOfferTier[] };
  /**
   * The closing `CtaBand` title / line. Defaults per persona family
   * (`CLOSING_COPY`) so the three evaluator pages and the two founder pages
   * close on the same sentence in each language.
   */
  closingTitle?: string;
  closingSub?: string;
  /**
   * G21 P0-A — the `TrustBand` above the closing band. Defaults to on for
   * the investor / founder / advisor personas; the accelerator page mounts
   * its own from lane P0-C and opts out until then.
   */
  showTrustBand?: boolean;
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
      return "/analyze";
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

/** Icons for the numbered workflow steps (founder: add → preview → claims → evidence → confidence → gaps → data room → share → track). */
export const WORKFLOW_ICONS: readonly LucideIcon[] = [
  Upload,
  BarChart3,
  ScanSearch,
  FileCheck2,
  ShieldCheck,
  ListChecks,
  FolderLock,
  Share2,
  LineChart,
];

/** Icons for the plan-rung cards. */
const TIER_ICONS: readonly LucideIcon[] = [ClipboardCheck, Users, Landmark, Link2];

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
      title: "Run your next intake as one comparable cohort.",
      sub: "Book the paid pilot on one real intake or your existing cohort. Your committee still makes every decision.",
    },
    founder: {
      title: "Know what to fix before your next application.",
      sub: "You'll know exactly what to fix before your next application or investor meeting. The first run is free and needs no card.",
    },
  },
  vi: {
    evaluator: {
      title: "Chấm điểm thương vụ tiếp theo trên một thước đo.",
      sub: "Bắt đầu dùng thử ở gói phù hợp với bàn làm việc của bạn. Huỷ trong cổng thanh toán trước khi hết hạn và bạn không trả gì.",
    },
    accelerator: {
      title: "Chạy đợt tuyển sinh tiếp theo như một khoá có thể so sánh.",
      sub: "Đặt thí điểm trả phí trên một đợt tuyển sinh thật hoặc khoá hiện có. Hội đồng của bạn vẫn ra mọi quyết định.",
    },
    founder: {
      title: "Biết cần sửa gì trước lần nộp hồ sơ tiếp theo.",
      sub: "Bạn sẽ biết chính xác cần sửa gì trước lần nộp hồ sơ hoặc buổi gặp nhà đầu tư tiếp theo. Lần chạy đầu tiên miễn phí và không cần thẻ.",
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
    problem,
    workflow,
    statement,
    pilotOffer,
    tiers,
    closingTitle,
    closingSub,
    showTrustBand = TRUST_BAND_DEFAULT_SLUGS.has(slug),
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

        {/* G21 P0-C — the opening lines: three problems, one answer */}
        {problem ? (
          <Section id="problem" ariaLabel={fillPrices(problem.resolution)} spacing="sm" tone="sunken">
            <div data-testid="solutions-problem" className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <ul className="space-y-2">
                {problem.lines.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-base leading-relaxed text-secondary sm:text-lg">
                    <span aria-hidden="true" className="mt-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <span>{fillPrices(line)}</span>
                  </li>
                ))}
              </ul>
              <ArrowRight aria-hidden="true" className="hidden h-6 w-6 text-accent lg:block" />
              <p className="font-display text-xl font-semibold tracking-tight text-primary sm:text-2xl">
                {fillPrices(problem.resolution)}
              </p>
            </div>
          </Section>
        ) : null}

        {/* G21 P0-C — numbered workflow (the founder's nine steps) */}
        {workflow ? (
          <Section id="workflow" title={fillPrices(workflow.title)} lede={workflow.lede ? fillPrices(workflow.lede) : undefined}>
            <FeatureGrid
              columns={3}
              numbered
              ariaLabel={fillPrices(workflow.title)}
              items={workflow.steps.map((step, i) => ({
                icon: WORKFLOW_ICONS[i % WORKFLOW_ICONS.length]!,
                title: fillPrices(step.title),
                body: fillPrices(step.body),
              }))}
            />
          </Section>
        ) : null}

        {/* B2 Task 6 — trust / compliance facts (investor persona opts in) */}
        {trustBadges && trustBadges.length > 0 ? (
          <Section id="compliance" ariaLabel="Compliance and trust badges" spacing="sm" tone="sunken">
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

        {/* G21 P0-C — one statement band: who decides */}
        {statement ? (
          <Section id="statement" eyebrow={statement.eyebrow ? fillPrices(statement.eyebrow) : undefined} title={fillPrices(statement.title)} align="center" spacing="sm">
            <p data-testid="solutions-statement" className="mx-auto max-w-2xl text-center text-base leading-relaxed text-secondary sm:text-lg">
              {fillPrices(statement.body)}
            </p>
          </Section>
        ) : null}

        {/* G21 P0-C — the paid Cohort Validation Pilot (#pilot) */}
        {pilotOffer ? (
          <PilotOffer
            id="pilot"
            ctaPrefix={`solutions_${slug}_pilot`}
            {...pilotOffer}
            copy={{
              ...pilotOffer.copy,
              eyebrow: fillPrices(pilotOffer.copy.eyebrow),
              title: fillPrices(pilotOffer.copy.title),
              lede: fillPrices(pilotOffer.copy.lede),
              afterLede: pilotOffer.copy.afterLede ? fillPrices(pilotOffer.copy.afterLede) : undefined,
              afterTiers: pilotOffer.copy.afterTiers?.map((t) => ({ ...t, price: fillPrices(t.price), sub: fillPrices(t.sub) })),
            }}
          />
        ) : null}

        {/* G21 P0-C — plan rungs for this persona (prices via tokens) */}
        {tiers ? (
          <Section id="plans" title={fillPrices(tiers.title)} lede={tiers.lede ? fillPrices(tiers.lede) : undefined} tone="sunken">
            <div data-testid="solutions-tiers">
              <FeatureGrid
                columns={tiers.items.length >= 4 ? 4 : tiers.items.length === 3 ? 3 : 2}
                ariaLabel={fillPrices(tiers.title)}
                items={tiers.items.map((t, i) => ({
                  icon: TIER_ICONS[i % TIER_ICONS.length]!,
                  title: `${fillPrices(t.name)} — ${fillPrices(t.price)}`,
                  body: fillPrices(t.sub),
                  href: t.href,
                  cta: fillPrices(t.label),
                  ctaId: t.ctaId ?? `solutions_${slug}_tier_${i + 1}`,
                }))}
              />
            </div>
          </Section>
        ) : null}

        {/* FAQ — the visible FAQPage */}
        <Section id="faq" title={fillPrices(faqTitle)}>
          <Faq items={faqItems} className="max-w-3xl" />
        </Section>

        {/* G21 P0-A — who stands behind the score, above the close (every
            persona page, incl. the accelerator / BlockID Cohort page). */}
        {showTrustBand ? <TrustBand /> : null}

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
