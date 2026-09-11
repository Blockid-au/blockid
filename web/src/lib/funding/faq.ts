// Directory FAQ (S12-A, 2026-09-11) — the four visible Q&As at the foot of
// /funding/grants and /funding/programs and the `FAQPage` object built from
// exactly those strings. Pure: strings come from `copy.ts` (EN + VI via the
// `funding.copy.faq.*` catalogue keys), the satellite sentence from
// `CAPITAL_SATELLITES`, so a copy change lands in the page and the schema at
// once and the JSON-LD can never say something the page does not show.

import { CAPITALS, CAPITAL_SATELLITES, type Capital } from "./seed-map";
import { fundingCopy } from "./copy";
import { satelliteList } from "./seo";

export interface FaqItem {
  question: string;
  answer: string;
}

export type DirectoryFaqKind = "grants" | "programs";

/** Which `faq.*` pairs each directory shows, in order (4 each). */
export const DIRECTORY_FAQ_KEYS: Readonly<Record<DirectoryFaqKind, readonly string[]>> = {
  grants: ["grantsFree", "report", "cut", "updated"],
  programs: ["cities", "equity", "updated", "report"],
};

/**
 * "Sydney also lists Wollongong; Melbourne lists Geelong; Brisbane lists Gold
 * Coast, Sunshine Coast and Regional Queensland; Hobart lists Launceston" —
 * only capitals that have satellites, in `CAPITALS` order.
 */
export function satelliteCoverage(): string {
  const parts: string[] = [];
  for (const c of CAPITALS as readonly Capital[]) {
    if ((CAPITAL_SATELLITES[c] ?? []).length === 0) continue;
    parts.push(`${c} ${parts.length === 0 ? "also lists" : "lists"} ${satelliteList(c)}`);
  }
  return parts.join("; ");
}

/** The visible Q&As for one directory, localised when `messages` is given. */
export function directoryFaq(kind: DirectoryFaqKind, messages?: Readonly<Record<string, string>> | null): FaqItem[] {
  const tokens = { satellites: satelliteCoverage() };
  return DIRECTORY_FAQ_KEYS[kind].map((key) => ({
    question: fundingCopy("faq", `${key}Q`, tokens, messages),
    answer: fundingCopy("faq", `${key}A`, tokens, messages),
  }));
}

/** schema.org `FAQPage` for the rendered items. `null` under two items — no schema without a visible list. */
export function faqPageJsonLd(items: ReadonlyArray<FaqItem>): Record<string, unknown> | null {
  const usable = items.filter((i) => i.question.trim() && i.answer.trim());
  if (usable.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: usable.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}
