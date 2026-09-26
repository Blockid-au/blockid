/**
 * Homepage copy + link data — G21 P0-B (docs/plans/g21-fi-upgrade-2026-09-20.md
 * § 0 + § P0-B, 2026-09-20; was G17 D1–D3). Kept out of page.tsx (Next only
 * allows the route-segment exports there) so the colocated test can pin the
 * section order, the CTAs, the six product steps and the comparison lists
 * without rendering.
 *
 * POSITIONING (2026-09-26, founder: "đồng bộ cho nhà đầu tư giữ thông điệp
 * hero"): every section below the hero speaks to the investor the G30 hero
 * addresses — "Know the business before you invest." — and repeats its
 * outcome line: Business context · Key risks · Next questions. Founders own
 * the data. Never "our AI is better", never an agent count, never a price on
 * the home (G17 D3 still holds: the page test pins `/A\$\d/` absent).
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
  title: "Too many decks. Too little time to check them.",
  lede: "Investors see more businesses than they can research properly — and it breaks in the same three places.",
} as const;

export interface HomeProblemStep {
  title: string;
  body: string;
  examples: readonly string[];
}

export const HOME_PROBLEM_STEPS: readonly HomeProblemStep[] = [
  {
    title: "Scattered information",
    body: "Every business arrives in a different shape, so nothing can be read side by side.",
    examples: ["Decks", "Websites", "PDFs", "E-mails", "Spreadsheets"],
  },
  {
    title: "Unchecked claims",
    body: "Traction, revenue and team claims arrive without the evidence behind them.",
    examples: ["Self-reported numbers", "No verification", "Missing documents"],
  },
  {
    title: "Unclear next step",
    body: "Without a clear view of the risks, it is hard to know what to ask before the first meeting.",
    examples: ["Hidden risks", "Generic questions", "Wasted meetings"],
  },
];

// ─── b. Product sequence ─────────────────────────────────────────────────────

export const HOME_SEQUENCE = {
  eyebrow: "What BlockID does",
  title: "From a website to an investor-ready report.",
  lede: "One method, applied the same way to every business you look at.",
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
  { icon: "application", title: "Add a business", caption: "Website, documents or a description" },
  { icon: "evidence", title: "Evidence extracted", caption: "Claims separated from proof" },
  { icon: "score", title: "SVI + confidence", caption: "Startup Value Index, eight dimensions" },
  { icon: "dossier", title: "Key risks", caption: "What the evidence does not support" },
  { icon: "cohort", title: "Questions to ask", caption: "Before the first meeting" },
  { icon: "progress", title: "Track over time", caption: "Re-assess and see what changed" },
];

/** The sample link that sits under the sequence (kept from G17: a real anonymised dossier). */
export const HOME_SAMPLE_LINK = {
  href: "/tbr/demo",
  label: "Open a sample report",
  ctaId: "home_sample_dossier",
} as const;

// ─── c. Three messages ───────────────────────────────────────────────────────

export const HOME_MESSAGES_SECTION = {
  eyebrow: "What you get",
  title: "Business context. Key risks. Next questions.",
} as const;

export interface HomeMessage {
  icon: HomeMessageIcon;
  title: string;
  body: string;
}

export const HOME_MESSAGES: readonly HomeMessage[] = [
  {
    icon: "faster",
    title: "Business context",
    body: "What the business does, who it serves and how far it has come — in minutes, not a weekend.",
  },
  {
    icon: "evidence",
    title: "Key risks",
    body: "What the evidence supports, what remains unverified and where the business could break.",
  },
  {
    icon: "improvement",
    title: "Next questions",
    body: "The questions to ask before you meet — and a record you can re-check later.",
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
      "No investor workflow",
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
      "Comparable companies",
      "Score history",
      "Investor workflow",
      "Audit trail",
    ],
  },
  line: "ChatGPT analyses what you paste. BlockID builds and maintains a structured, evidence-backed company record and applies the same assessment methodology across every company and every point in time.",
} as const;

// ─── e. Built for ────────────────────────────────────────────────────────────

export const HOME_BUILT_FOR_SECTION = {
  eyebrow: "Built for",
  title: "Investors who look at startups again and again.",
  lede: "Founders take part, keep control of their data and get the improvement plan.",
} as const;

export const HOME_BUILT_FOR: readonly string[] = [
  "Angel investors",
  "Angel groups",
  "Syndicates",
  "Early-stage VCs",
  "Advisory firms",
  "Accelerators",
];

// ─── g. Closing band ─────────────────────────────────────────────────────────

export const HOME_FINAL = {
  title: HOMEPAGE_HERO.en.close,
  sub: HOMEPAGE_HERO.en.closeSub,
} as const;
