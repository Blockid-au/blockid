/**
 * Content for `/compare`, `/compare/chatgpt`, `/compare/valuers` and the
 * Vietnamese mirror `/vi/compare` (T0274 part 2, G12 sprint S4).
 *
 * WHY A BUILDER
 *
 * Same reason as `../solutions/evaluator-page-props.ts`: one function turns
 * the catalogue into the page's props, so the English page, its two alias
 * routes and the Vietnamese mirror render the same table by construction,
 * and a test can pin the wording without mounting the marketing shell.
 *
 * WHAT THE PAGE SAYS (evaluator-traction-2026-09-10.md §4a, §4b, App. A, App. C)
 *
 *   - a nine-row, three-column table: BlockID · ChatGPT · an independent valuer
 *   - the approved "Why not just ask ChatGPT?" paragraph, as a pull-quote
 *     (reused verbatim from `solutions.faq.chatgpt.*`)
 *   - a fairness section — what a general chatbot is genuinely good at
 *   - the six differentiators, each linking to a proof surface
 *   - a plain-text source list (Appendix C critiques by name + year; price
 *     anchors as published list prices, Sept 2026, by source domain)
 *
 * Every BlockID amount is a `{token}` resolved by `fillPrices()` from
 * plans.csv and the report SKU, so the page cannot drift from the catalogue.
 * Competitor prices are literals on purpose: they are quotations of someone
 * else's list price on a date, not a figure we own.
 */

import { t, type Messages } from "@/lib/i18n/t";
import { fillPrices } from "../solutions/solutions-pricing";
import { EVALUATOR_PRICING_HREF } from "../solutions/solutions-shared";

/**
 * `all` is `/compare`; the other two are the alias routes. They share the H1
 * and the table — the alias changes the lede, the metadata, the highlighted
 * column and the GA4 `variant`.
 */
export type CompareVariant = "all" | "chatgpt" | "valuers";
export const COMPARE_VARIANTS: readonly CompareVariant[] = ["all", "chatgpt", "valuers"];
export const COMPARE_ALIAS_SLUGS = ["chatgpt", "valuers"] as const;

export function isCompareAlias(slug: string): slug is (typeof COMPARE_ALIAS_SLUGS)[number] {
  return (COMPARE_ALIAS_SLUGS as readonly string[]).includes(slug);
}

/** Where each route lives; the alias routes are English-only. */
export function comparePath(variant: CompareVariant, lang: "en" | "vi" = "en"): string {
  const base = variant === "all" ? "/compare" : `/compare/${variant}`;
  return lang === "vi" ? `/vi${base}` : base;
}

export const COMPARE_CTA_HREF = {
  report: "/analyze",
  trial: "/signup?segment=evaluator&plan=investor_angel",
  plans: EVALUATOR_PRICING_HREF,
} as const;

export interface CompareRow {
  key: string;
  label: string;
  blockid: string;
  chatgpt: string;
  valuer: string;
}

export interface CompareCard {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}

export interface CompareFaq {
  q: string;
  a: string;
}

export interface ComparePageProps {
  variant: CompareVariant;
  lang: "en" | "vi";
  eyebrow: string;
  headline: string;
  lede: string;
  cta: { report: string; trial: string; plans: string; note: string };
  table: {
    kicker: string;
    title: string;
    caption: string;
    columns: { criterion: string; blockid: string; chatgpt: string; valuer: string };
    rows: CompareRow[];
  };
  pullquote: { kicker: string; q: string; a: string };
  fair: { title: string; intro: string; items: { title: string; body: string }[]; outro: string };
  diff: { kicker: string; title: string; cards: CompareCard[] };
  faqTitle: string;
  faqs: CompareFaq[];
  sources: { title: string; intro: string; items: string[]; prices: string };
  breadcrumb: { name: string; href: string }[];
}

/** The nine table rows, in the order the plan lists them (§4a / task brief). */
export const COMPARE_ROW_KEYS = [
  "rubric",
  "reviewers",
  "evidence",
  "updates",
  "australia",
  "confidentiality",
  "audit",
  "time",
  "price",
] as const;

/**
 * Differentiator → proof surface. Same order as the six cards on the
 * `/solutions/*` evaluator pages.
 */
export const COMPARE_PROOF_HREFS = [
  "/how-it-works",
  "/team",
  "/legal/privacy",
  "/funding",
  "/tbr/demo",
  "/guide",
] as const;

/** Reads a key and substitutes every `{token}` from the catalogue. */
function tp(m: Messages, key: string): string {
  return fillPrices(t(m, key));
}

function rows(m: Messages): CompareRow[] {
  return COMPARE_ROW_KEYS.map((key) => ({
    key,
    label: tp(m, `compare.table.row.${key}.label`),
    blockid: tp(m, `compare.table.row.${key}.blockid`),
    chatgpt: tp(m, `compare.table.row.${key}.chatgpt`),
    valuer: tp(m, `compare.table.row.${key}.valuer`),
  }));
}

function cards(m: Messages): CompareCard[] {
  return COMPARE_PROOF_HREFS.map((href, i) => ({
    title: tp(m, `compare.diff.${i + 1}.title`),
    body: tp(m, `compare.diff.${i + 1}.body`),
    href,
    linkLabel: tp(m, `compare.diff.${i + 1}.link`),
  }));
}

function faqs(m: Messages): CompareFaq[] {
  return [
    // §4b — the approved paragraph, shared with the three evaluator pages.
    { q: tp(m, "solutions.faq.chatgpt.q"), a: tp(m, "solutions.faq.chatgpt.a") },
    { q: tp(m, "compare.faq.q2"), a: tp(m, "compare.faq.a2") },
    { q: tp(m, "compare.faq.q3"), a: tp(m, "compare.faq.a3") },
    { q: tp(m, "compare.faq.q4"), a: tp(m, "compare.faq.a4") },
  ];
}

function breadcrumb(
  m: Messages,
  variant: CompareVariant,
  lang: "en" | "vi",
): { name: string; href: string }[] {
  const trail = [
    { name: tp(m, "compare.breadcrumb.home"), href: lang === "vi" ? "/vi" : "/" },
    { name: tp(m, "compare.breadcrumb.all"), href: comparePath("all", lang) },
  ];
  if (variant !== "all") {
    trail.push({ name: tp(m, `compare.breadcrumb.${variant}`), href: comparePath(variant, lang) });
  }
  return trail;
}

export function buildCompareProps(
  m: Messages,
  variant: CompareVariant = "all",
  lang: "en" | "vi" = "en",
): ComparePageProps {
  return {
    variant,
    lang,
    eyebrow: tp(m, "compare.eyebrow"),
    headline: tp(m, "compare.h1"),
    lede: tp(m, `compare.lede.${variant}`),
    cta: {
      report: tp(m, "compare.cta.report"),
      trial: tp(m, "compare.cta.trial"),
      plans: tp(m, "compare.cta.plans"),
      note: tp(m, "compare.cta.note"),
    },
    table: {
      kicker: tp(m, "compare.table.kicker"),
      title: tp(m, "compare.table.title"),
      caption: tp(m, "compare.table.caption"),
      columns: {
        criterion: tp(m, "compare.table.col.criterion"),
        blockid: tp(m, "compare.table.col.blockid"),
        chatgpt: tp(m, "compare.table.col.chatgpt"),
        valuer: tp(m, "compare.table.col.valuer"),
      },
      rows: rows(m),
    },
    pullquote: {
      kicker: tp(m, "compare.pullquote.kicker"),
      q: tp(m, "solutions.faq.chatgpt.q"),
      a: tp(m, "solutions.faq.chatgpt.a"),
    },
    fair: {
      title: tp(m, "compare.fair.title"),
      intro: tp(m, "compare.fair.intro"),
      items: [1, 2, 3].map((i) => ({
        title: tp(m, `compare.fair.${i}.title`),
        body: tp(m, `compare.fair.${i}.body`),
      })),
      outro: tp(m, "compare.fair.outro"),
    },
    diff: {
      kicker: tp(m, "compare.diff.kicker"),
      title: tp(m, "compare.diff.title"),
      cards: cards(m),
    },
    faqTitle: tp(m, "compare.faq.title"),
    faqs: faqs(m),
    sources: {
      title: tp(m, "compare.sources.title"),
      intro: tp(m, "compare.sources.intro"),
      items: [1, 2, 3, 4, 5].map((i) => tp(m, `compare.sources.${i}`)),
      prices: tp(m, "compare.sources.prices"),
    },
    breadcrumb: breadcrumb(m, variant, lang),
  };
}

/** `<title>` / description per variant, tokens filled. */
export function compareMeta(m: Messages, variant: CompareVariant): { title: string; description: string } {
  return {
    title: tp(m, `meta.compare.${variant}.title`),
    description: tp(m, `meta.compare.${variant}.description`),
  };
}
