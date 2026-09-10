/**
 * Props for the three evaluator persona pages — `/solutions/investor`,
 * `/solutions/advisor`, `/solutions/accelerator` — and their Vietnamese
 * mirrors (T0274, G12 sprint S1).
 *
 * WHY A BUILDER
 *
 * Each persona page and its `/vi/` twin used to be a 100-line copy of the
 * same JSX with `getMessages("en")` swapped for `getMessages("vi")`. That is
 * six files that must agree on which keys are rendered, which benefit cards
 * exist and where the CTAs go — and on 2026-09-10 they did not: the English
 * accelerator page had a journey the Vietnamese one lacked a key for. One
 * builder per persona, parameterised by the catalogue, means the two
 * languages render the same page by construction, and a test can assert the
 * props without mounting the marketing shell.
 *
 * WHAT THE PAGES SAY (evaluator-traction-2026-09-10.md §4)
 *
 * Six benefit cards, one per differentiator, in the plan's order:
 *   1. one rubric — 8 dimensions × 13 criteria × 12 growth phases
 *   2. the whole C-suite — 11 C-Level agents, then an auditor
 *   3. the startup's own evidence, accumulating (+ the approved data principle)
 *   4. built for Australia — AUD methods, ESIC / R&DTI / s708, grants
 *   5. A$3, not A$3,000
 *   6. method, not vibes — public guide + the founder's doctoral research (DBA)
 *
 * plus the "Why not just ask ChatGPT?" FAQ (§4b) on every evaluator page.
 * Every amount is a `{token}` resolved by `fillPrices()` from plans.csv.
 */

import { t, type Messages } from "@/lib/i18n/t";
import {
  EVALUATOR_PRICING_HREF,
  EVALUATOR_SIGNUP_HREF,
  type SolutionBenefit,
  type SolutionFaq,
  type SolutionJourneyStep,
  type SolutionPageProps,
  type SolutionTrustBadge,
} from "./solutions-shared";

type Lang = "en" | "vi";

/** The alias route of `/compare` that the ChatGPT FAQ links through to. */
export const COMPARE_CHATGPT_HREF = "/compare/chatgpt";

/**
 * Regulatory facts about Auschain PTY LTD that we can point at, not
 * capability claims — hard-coded rather than translated for that reason.
 * The Privacy Act and Essential Eight lines are the same two already
 * published in the sitewide marketing JSON-LD.
 */
const TRUST_BADGES: SolutionTrustBadge[] = [
  { label: "ASIC ABN 79 659 615 111", sub: "Auschain PTY LTD" },
  { label: "Privacy Act 1988", sub: "APP 1-13 controls" },
  { label: "Essential Eight — ML1", sub: "ACSC-aligned baseline" },
  { label: "Stripe verified merchant", sub: "PCI DSS via Stripe" },
  { label: "GST-registered", sub: "ATO tax invoice on every charge" },
];

function benefits(m: Messages, persona: string, count: number): SolutionBenefit[] {
  const out: SolutionBenefit[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push({
      title: t(m, `solutions.${persona}.benefit${i}.title`),
      body: t(m, `solutions.${persona}.benefit${i}.body`),
    });
  }
  return out;
}

function faqs(m: Messages, persona: string, count: number): SolutionFaq[] {
  const out: SolutionFaq[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push({
      q: t(m, `solutions.${persona}.faq.q${i}`),
      a: t(m, `solutions.${persona}.faq.a${i}`),
    });
  }
  // §4b — the one-paragraph answer, on every evaluator page, with a line
  // through to the full three-way comparison (T0274 part 2).
  out.push({
    q: t(m, "solutions.faq.chatgpt.q"),
    a: t(m, "solutions.faq.chatgpt.a"),
    href: COMPARE_CHATGPT_HREF,
    linkLabel: t(m, "compare.faq.link"),
  });
  return out;
}

function hero(
  m: Messages,
  persona: "investor" | "advisor" | "accelerator",
  lang: Lang,
): Pick<
  SolutionPageProps,
  | "slug"
  | "lang"
  | "eyebrow"
  | "headline"
  | "personaLine"
  | "emotionalLine"
  | "outcomeLine"
  | "primaryCtaLabel"
  | "primaryCtaHref"
  | "benefitsTitle"
  | "faqTitle"
  | "disclaimer"
> {
  return {
    slug: persona,
    lang,
    eyebrow: t(m, `solutions.${persona}.eyebrow`),
    headline: t(m, `solutions.${persona}.headline`),
    personaLine: t(m, `solutions.${persona}.persona`),
    emotionalLine: t(m, `solutions.${persona}.lede`),
    outcomeLine: t(m, `solutions.${persona}.support`),
    primaryCtaLabel: t(m, `solutions.${persona}.cta`),
    primaryCtaHref: EVALUATOR_SIGNUP_HREF[persona],
    benefitsTitle: t(m, `solutions.${persona}.benefits.title`),
    faqTitle: t(m, `solutions.${persona}.faq.title`),
    disclaimer: t(m, `solutions.${persona}.disclaimer`),
  };
}

/** `/solutions/investor` — Scout A$79 recommended. */
export function buildInvestorProps(m: Messages, lang: Lang = "en"): SolutionPageProps {
  return {
    ...hero(m, "investor", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.evaluatorPricing"),
    secondaryCtaHref: EVALUATOR_PRICING_HREF,
    benefits: benefits(m, "investor", 6),
    faqs: faqs(m, "investor", 3),
    trustBadges: TRUST_BADGES,
  };
}

/** `/solutions/advisor` — Firm A$149 recommended. */
export function buildAdvisorProps(m: Messages, lang: Lang = "en"): SolutionPageProps {
  return {
    ...hero(m, "advisor", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.evaluatorPricing"),
    secondaryCtaHref: EVALUATOR_PRICING_HREF,
    benefits: benefits(m, "advisor", 6),
    faqs: faqs(m, "advisor", 3),
    trustBadges: TRUST_BADGES,
  };
}

function acceleratorJourney(m: Messages): SolutionJourneyStep[] {
  const step = (n: 1 | 2 | 3): SolutionJourneyStep => ({
    window: t(m, `solutions.accelerator.journey.window${n}`),
    headline: t(m, `solutions.accelerator.journey.step${n}.head`),
    bullets: [
      t(m, `solutions.accelerator.journey.step${n}.b1`),
      t(m, `solutions.accelerator.journey.step${n}.b2`),
      t(m, `solutions.accelerator.journey.step${n}.b3`),
    ],
  });
  return [step(1), step(2), step(3)];
}

/**
 * `/solutions/accelerator` — Program A$349 recommended; Contact Sales stays
 * as the secondary CTA for multi-cohort programs. Batch scoring and the
 * sponsor/LP export are worded "coming in this release" in the catalogue
 * (T0272 flips the copy when Program ships them).
 */
export function buildAcceleratorProps(m: Messages, lang: Lang = "en"): SolutionPageProps {
  return {
    ...hero(m, "accelerator", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.contactSales"),
    secondaryCtaHref: "/pricing#contact-sales",
    benefits: benefits(m, "accelerator", 6),
    journeyTitle: t(m, "solutions.accelerator.journey.title"),
    journey: acceleratorJourney(m),
    faqs: faqs(m, "accelerator", 3),
    trustBadges: TRUST_BADGES,
  };
}
