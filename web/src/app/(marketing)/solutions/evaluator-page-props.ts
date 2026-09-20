/**
 * Props for the persona pages — `/solutions/investor`, `/solutions/advisor`,
 * `/solutions/accelerator`, `/solutions/founder` — and their Vietnamese
 * mirrors (T0274, G12 sprint S1; founder joined in G21 P0-C).
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
 * WHAT THE PAGES SAY (G21 P0-C, docs/plans/g21-fi-upgrade-2026-09-20.md § P0-C)
 *
 *   accelerator  "BlockID Cohort": the opening lines (different formats /
 *                different judgement / different feedback → one assessment
 *                layer), three capability cards, the six-stage workflow
 *                listing only what ships today, "Humans make the decision",
 *                the paid Cohort Validation Pilot (#pilot) and the Cohort 25
 *                / Cohort 100 rungs after it. No free / comped pilot copy.
 *   investor     "Standardise the first-pass review before human investment
 *                judgement begins." — six functions that ship (intake,
 *                comparable assessment, evidence gaps, risk flags, data
 *                room, team collaboration; portfolio is hidden → omitted),
 *                the supports-not-replaces statement, Scout → Fund rungs.
 *   founder      "See what an evaluator can verify — not only what your
 *                pitch says." — nine numbered steps, three cards, Free /
 *                Starter / Growth rungs; the Trusted Business Report is
 *                "{reportPrice} per report, pay-as-you-go", never a headline.
 *
 * Every amount is a `{token}` resolved by `fillPrices()` from plans.csv /
 * plans-v2 / pilot-skus; `{principle}` is the approved data sentence in the
 * page's language.
 */

import { t, type Messages } from "@/lib/i18n/t";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";
import { type PilotSkuId } from "@/lib/pricing/pilot-skus";
import { type PilotOfferCopy, type PilotOfferTier } from "@/components/marketing/PilotOffer";
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

/** The accelerator hero's primary CTA — the paid pilot block on the same page. */
export const ACCELERATOR_PILOT_ANCHOR = "#pilot";
/** The accelerator hero's secondary CTA — the demo batch / sample cohort. */
export const SAMPLE_COHORT_HREF = "/showcase/atlassian?step=1";

/** Where each persona's plan cards land: the signup with the rung pre-selected. */
export const TIER_SIGNUP_HREF = {
  founder_free: "/analyze",
  founder_starter: "/onboarding?trial=1&plan=founder_starter",
  founder_growth: "/onboarding?trial=1&plan=founder_growth",
  investor_angel: EVALUATOR_SIGNUP_HREF.investor,
  investor_advisor: EVALUATOR_SIGNUP_HREF.advisor,
  investor_vc_small: "/signup?segment=evaluator&plan=investor_vc_small&trial=1",
  investor_fund: "/signup?segment=evaluator&plan=investor_fund&trial=1",
  accelerator_starter: "/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual",
  accelerator_growth: "/signup?segment=evaluator&plan=accelerator_growth&trial=1&interval=annual",
} as const;

/**
 * Regulatory facts about the operator (LEGAL_ENTITY) that we can point at, not
 * capability claims — hard-coded rather than translated for that reason.
 * The Privacy Act and Essential Eight lines are the same two already
 * published in the sitewide marketing JSON-LD.
 */
const TRUST_BADGES: SolutionTrustBadge[] = [
  { label: `ASIC ${LEGAL_ENTITY_ABN_LABEL}`, sub: LEGAL_ENTITY.operator },
  { label: "Privacy Act 1988", sub: "APP 1-13 controls" },
  { label: "Essential Eight — ML1", sub: "ACSC-aligned baseline" },
  { label: "Stripe verified merchant", sub: "PCI DSS via Stripe" },
  { label: "GST-registered", sub: "ATO tax invoice on every charge" },
];

/** `{principle}` → the approved data sentence in the page's language. */
function withPrinciple(m: Messages, text: string): string {
  return text.replace("{principle}", t(m, "solutions.principle.data"));
}

function benefits(m: Messages, persona: string, count: number): SolutionBenefit[] {
  const out: SolutionBenefit[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push({
      title: t(m, `solutions.${persona}.benefit${i}.title`),
      body: withPrinciple(m, t(m, `solutions.${persona}.benefit${i}.body`)),
    });
  }
  return out;
}

function faqs(m: Messages, persona: string, count: number, chatgpt = true): SolutionFaq[] {
  const out: SolutionFaq[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push({
      q: t(m, `solutions.${persona}.faq.q${i}`),
      a: t(m, `solutions.${persona}.faq.a${i}`),
    });
  }
  // §4b — the one-paragraph answer, on every evaluator page, with a line
  // through to the full three-way comparison (T0274 part 2).
  if (chatgpt) {
    out.push({
      q: t(m, "solutions.faq.chatgpt.q"),
      a: t(m, "solutions.faq.chatgpt.a"),
      href: COMPARE_CHATGPT_HREF,
      linkLabel: t(m, "compare.faq.link"),
    });
  }
  return out;
}

function tier(m: Messages, prefix: string, href: string, ctaId: string): PilotOfferTier {
  return {
    name: t(m, `${prefix}.name`),
    price: t(m, `${prefix}.price`),
    sub: t(m, `${prefix}.sub`),
    label: t(m, `${prefix}.label`),
    href,
    ctaId,
  };
}

function hero(
  m: Messages,
  persona: "investor" | "advisor" | "accelerator" | "founder",
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
    primaryCtaHref:
      persona === "accelerator" ? ACCELERATOR_PILOT_ANCHOR : persona === "founder" ? "/analyze" : EVALUATOR_SIGNUP_HREF[persona],
    benefitsTitle: t(m, `solutions.${persona}.benefits.title`),
    faqTitle: t(m, `solutions.${persona}.faq.title`),
    disclaimer: t(m, `solutions.${persona}.disclaimer`),
  };
}

/** `/solutions/investor` — the first-pass review; Scout → Fund rungs. */
export function buildInvestorProps(m: Messages, lang: Lang = "en"): SolutionPageProps {
  return {
    ...hero(m, "investor", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.evaluatorPricing"),
    secondaryCtaHref: EVALUATOR_PRICING_HREF,
    benefits: benefits(m, "investor", 6),
    statement: {
      eyebrow: t(m, "solutions.investor.statement.eyebrow"),
      title: t(m, "solutions.investor.statement.title"),
      body: t(m, "solutions.investor.statement.body"),
    },
    tiers: {
      title: t(m, "solutions.investor.tiers.title"),
      lede: t(m, "solutions.investor.tiers.lede"),
      items: [
        tier(m, "solutions.investor.tiers.scout", TIER_SIGNUP_HREF.investor_angel, "solutions_investor_tier_scout"),
        tier(m, "solutions.investor.tiers.firm", TIER_SIGNUP_HREF.investor_advisor, "solutions_investor_tier_firm"),
        tier(m, "solutions.investor.tiers.program", TIER_SIGNUP_HREF.investor_vc_small, "solutions_investor_tier_program"),
        tier(m, "solutions.investor.tiers.fund", TIER_SIGNUP_HREF.investor_fund, "solutions_investor_tier_fund"),
      ],
    },
    // Pricing v4 (2026-09-16): q4/a4 = "What does Fund add?"
    faqs: faqs(m, "investor", 4),
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

/** The six-stage workflow (Intake → Assessment → Selection → Program → Demo day → Sponsor reporting): three shipped bullets per stage (G21 P2: import, snapshots, filters, overrides, feedback letters, demo-day pack, Cohort Report, pilot metrics). */
function acceleratorJourney(m: Messages): SolutionJourneyStep[] {
  const step = (n: 1 | 2 | 3 | 4 | 5 | 6): SolutionJourneyStep => ({
    window: t(m, `solutions.accelerator.journey.window${n}`),
    headline: t(m, `solutions.accelerator.journey.step${n}.head`),
    bullets: [t(m, `solutions.accelerator.journey.step${n}.b1`), t(m, `solutions.accelerator.journey.step${n}.b2`), t(m, `solutions.accelerator.journey.step${n}.b3`)],
  });
  return [step(1), step(2), step(3), step(4), step(5), step(6)];
}

/** The paid pilot block's copy from the catalogue (amounts come from `PILOT_SKUS` inside the component). */
export function acceleratorPilotCopy(m: Messages): PilotOfferCopy {
  const list = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => t(m, `${prefix}${i + 1}`));
  return {
    eyebrow: t(m, "solutions.accelerator.pilot.eyebrow"),
    title: t(m, "solutions.accelerator.pilot.title"),
    lede: t(m, "solutions.accelerator.pilot.lede"),
    applicantsLine: t(m, "solutions.accelerator.pilot.applicants"),
    scopeLine: t(m, "solutions.accelerator.pilot.scope"),
    includesTitle: t(m, "solutions.accelerator.pilot.includesTitle"),
    includes: list("solutions.accelerator.pilot.include", 8),
    buyLabel: t(m, "solutions.accelerator.pilot.buy"),
    metricsTitle: t(m, "solutions.accelerator.pilot.metricsTitle"),
    metricsLede: t(m, "solutions.accelerator.pilot.metricsLede"),
    metrics: list("solutions.accelerator.pilot.metric", 6),
    afterTitle: t(m, "solutions.accelerator.after.title"),
    afterLede: t(m, "solutions.accelerator.after.lede"),
    afterTiers: [
      tier(m, "solutions.accelerator.after.cohort25", TIER_SIGNUP_HREF.accelerator_starter, "solutions_accelerator_after_cohort25"),
      tier(m, "solutions.accelerator.after.cohort100", TIER_SIGNUP_HREF.accelerator_growth, "solutions_accelerator_after_cohort100"),
    ],
  };
}

/**
 * `/solutions/accelerator` — the BlockID Cohort page. `configured` says,
 * per SKU, whether the founder has set the Stripe price env var (server
 * pages compute it with `isPilotSkuConfigured`); an unconfigured SKU's
 * button is a contact link, never a dead checkout.
 */
export function buildAcceleratorProps(
  m: Messages,
  lang: Lang = "en",
  configured: Readonly<Record<PilotSkuId, boolean>> = { cohort_pilot_25: false, cohort_pilot_50: false },
): SolutionPageProps {
  const path = `${lang === "vi" ? "/vi" : ""}/solutions/accelerator${ACCELERATOR_PILOT_ANCHOR}`;
  return {
    ...hero(m, "accelerator", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.sampleCohort"),
    secondaryCtaHref: SAMPLE_COHORT_HREF,
    problem: {
      lines: [
        t(m, "solutions.accelerator.problem.line1"),
        t(m, "solutions.accelerator.problem.line2"),
        t(m, "solutions.accelerator.problem.line3"),
      ],
      resolution: t(m, "solutions.accelerator.problem.resolution"),
    },
    benefits: benefits(m, "accelerator", 3),
    journeyTitle: t(m, "solutions.accelerator.journey.title"),
    journey: acceleratorJourney(m),
    statement: {
      eyebrow: t(m, "solutions.accelerator.statement.eyebrow"),
      title: t(m, "solutions.accelerator.statement.title"),
      body: t(m, "solutions.accelerator.statement.body"),
    },
    pilotOffer: {
      copy: acceleratorPilotCopy(m),
      configured,
      returnPath: path,
    },
    faqs: faqs(m, "accelerator", 3),
    trustBadges: TRUST_BADGES,
  };
}

/** `/solutions/founder` — nine steps, three cards, Free / Starter / Growth. */
export function buildFounderProps(m: Messages, lang: Lang = "en"): SolutionPageProps {
  return {
    ...hero(m, "founder", lang),
    secondaryCtaLabel: t(m, "solutions.cta.secondary.pricing"),
    secondaryCtaHref: "/pricing",
    workflow: {
      title: t(m, "solutions.founder.workflow.title"),
      lede: t(m, "solutions.founder.workflow.lede"),
      steps: Array.from({ length: 9 }, (_, i) => ({
        title: t(m, `solutions.founder.step${i + 1}.title`),
        body: t(m, `solutions.founder.step${i + 1}.body`),
      })),
    },
    benefits: benefits(m, "founder", 3),
    tiers: {
      title: t(m, "solutions.founder.tiers.title"),
      lede: t(m, "solutions.founder.tiers.lede"),
      items: [
        tier(m, "solutions.founder.tiers.free", TIER_SIGNUP_HREF.founder_free, "solutions_founder_tier_free"),
        tier(m, "solutions.founder.tiers.starter", TIER_SIGNUP_HREF.founder_starter, "solutions_founder_tier_starter"),
        tier(m, "solutions.founder.tiers.growth", TIER_SIGNUP_HREF.founder_growth, "solutions_founder_tier_growth"),
      ],
    },
    faqs: faqs(m, "founder", 3, false),
  };
}
