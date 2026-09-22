/**
 * Homepage copy + link data — G21 P0-B (docs/plans/g21-fi-upgrade-2026-09-20.md
 * § 0 + § P0-B, 2026-09-20; was G17 D1–D3). Kept out of page.tsx (Next only
 * allows the route-segment exports there) so the colocated test can pin the
 * section order, the CTAs, the six product steps and the comparison lists
 * without rendering.
 *
 * POSITIONING: BlockID is evidence-backed startup assessment infrastructure
 * for accelerators, innovation programs and professional evaluators;
 * founders own the data. Three messages everywhere — Screen faster · Trust
 * the evidence · Track improvement. Never "our AI is better", never an agent
 * count, never a price on the home (G17 D3 still holds: the page test pins
 * `/A\$\d/` absent).
 */

import { HOMEPAGE_HERO, HOMEPAGE_SAMPLE_HREF } from "@/lib/marketing/homepage-hero";

/** Icon keys resolved to Lucide components in page.tsx (this file stays plain data). */
export type HomeSequenceIcon = "application" | "evidence" | "score" | "dossier" | "cohort" | "progress";
export type HomeMessageIcon = "faster" | "evidence" | "improvement";

/** The two home CTAs — the hero, the nav and the closing band all use these. */
export const HOME_PRIMARY_CTA = {
  href: "#smart-intake-input",
  label: HOMEPAGE_HERO.en.submit,
} as const;
export const HOME_SECONDARY_CTA = {
  href: HOMEPAGE_SAMPLE_HREF,
  label: HOMEPAGE_HERO.en.sample,
} as const;

/** Section ids inside <main>, in order (the page test pins this list). */
export const HOME_SECTION_IDS = [
  "problem",
  "sequence",
  "messages",
  "why-not-chatgpt",
  "built-for",
  "cta",
] as const;

// ─── a. Problem ──────────────────────────────────────────────────────────────

export const HOME_PROBLEM = {
  eyebrow: "The problem",
  title: "Startup screening was not designed to scale.",
  lede: "Every program runs intake the same way — and it breaks in the same three places.",
} as const;

export interface HomeProblemStep {
  title: string;
  body: string;
  examples: readonly string[];
}

export const HOME_PROBLEM_STEPS: readonly HomeProblemStep[] = [
  {
    title: "Different inputs",
    body: "Every applicant arrives in a different shape, so nothing can be read side by side.",
    examples: ["PDF", "Forms", "Decks", "E-mails", "Spreadsheets"],
  },
  {
    title: "Subjective review",
    body: "Different reviewers apply different criteria to incomplete evidence.",
    examples: ["Different reviewers", "Inconsistent criteria", "Incomplete evidence"],
  },
  {
    title: "Weak feedback",
    body: "Founders get a yes or a no; sponsors cannot measure cohort improvement; evaluators cannot easily compare companies.",
    examples: ["Yes/no to founders", "No cohort measure", "Hard to compare"],
  },
];

// ─── b. Product sequence ─────────────────────────────────────────────────────

export const HOME_SEQUENCE = {
  eyebrow: "What BlockID does",
  title: "From application to a comparable record.",
  lede: "One pipeline, applied the same way to every company and every point in time.",
  href: "/product",
  linkLabel: "See the product in detail",
  ctaId: "home_sequence_product",
} as const;

export interface HomeSequenceStep {
  icon: HomeSequenceIcon;
  title: string;
  caption: string;
}

export const HOME_SEQUENCE_STEPS: readonly HomeSequenceStep[] = [
  { icon: "application", title: "Founder application", caption: "Deck, form, website or a paste" },
  { icon: "evidence", title: "Evidence extracted", caption: "Claims separated from proof" },
  { icon: "score", title: "SVI + confidence", caption: "Startup Value Index, eight dimensions" },
  { icon: "dossier", title: "Evaluator dossier", caption: "What the evidence supports" },
  { icon: "cohort", title: "Cohort table", caption: "Every applicant, side by side" },
  { icon: "progress", title: "Progress over time", caption: "Re-assess and measure movement" },
];

/** The sample link that sits under the sequence (kept from G17: a real anonymised dossier). */
export const HOME_SAMPLE_LINK = {
  href: "/tbr/demo",
  label: "Open a sample dossier",
  ctaId: "home_sample_dossier",
} as const;

// ─── c. Three messages ───────────────────────────────────────────────────────

export const HOME_MESSAGES_SECTION = {
  eyebrow: "Three things it changes",
  title: "Screen faster. Trust the evidence. Track improvement.",
} as const;

export interface HomeMessage {
  icon: HomeMessageIcon;
  title: string;
  body: string;
}

export const HOME_MESSAGES: readonly HomeMessage[] = [
  {
    icon: "faster",
    title: "Screen faster",
    body: "Every applicant is normalised into the same framework.",
  },
  {
    icon: "evidence",
    title: "Trust the evidence",
    body: "Scores show what evidence supports them and what remains unverified.",
  },
  {
    icon: "improvement",
    title: "Track improvement",
    body: "Re-assess companies through the program and measure movement.",
  },
];

// ─── d. Why not ChatGPT? ─────────────────────────────────────────────────────

export const HOME_WHY_NOT = {
  eyebrow: "A fair question",
  title: "Why not ChatGPT?",
  other: {
    title: "A general assistant",
    sub: "Answers the prompt in front of it.",
    items: [
      "One-off",
      "Prompt dependent",
      "No persistent company record",
      "Inconsistent comparison",
      "No evidence hierarchy",
      "No institutional workflow",
    ],
  },
  ours: {
    title: "BlockID",
    sub: "Assessment infrastructure with a record that persists.",
    items: [
      "Persistent startup record",
      "Common rubric",
      "Evidence provenance",
      "Verification status",
      "Comparable cohorts",
      "Score history",
      "Evaluator workflow",
      "Audit trail",
    ],
  },
  line: "ChatGPT analyses what you paste. BlockID builds and maintains a structured, evidence-backed company record and applies the same assessment methodology across every company and every point in time.",
} as const;

// ─── e. Built for ────────────────────────────────────────────────────────────

export const HOME_BUILT_FOR_SECTION = {
  eyebrow: "Built for",
  title: "Organisations that assess startups again and again.",
  lede: "Founders take part, keep control of their data and get the improvement plan.",
} as const;

export const HOME_BUILT_FOR: readonly string[] = [
  "Accelerators",
  "Incubators",
  "Universities",
  "Innovation Programs",
  "Venture Studios",
  "Funds",
];

// ─── g. Closing band ─────────────────────────────────────────────────────────

export const HOME_FINAL = {
  title: HOMEPAGE_HERO.en.close,
  sub: HOMEPAGE_HERO.en.closeSub,
} as const;
