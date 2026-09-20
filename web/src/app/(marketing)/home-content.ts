/**
 * Homepage copy + link data (G17 D1–D3, docs/plans/unicorn-homepage-2026-09-19.md).
 * Kept out of page.tsx (Next only allows the route-segment exports there) so
 * the colocated test can pin the audience hrefs, the step count and the
 * "Go deeper" anchors without rendering.
 */

import { PRODUCT_SECTION_IDS, productAnchor } from "./product/product-content";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";

export type HomeIcon = "investors" | "accelerators" | "advisors" | "paste" | "score" | "dossier";

export interface HomeCard {
  icon: HomeIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
  ctaId?: string;
}

/** Block 2 — "Who it's for": three audience cards, one sentence + one link each. */
export const HOME_AUDIENCES: readonly HomeCard[] = [
  {
    icon: "investors",
    title: "Investors",
    body: "Screen every inbound deal on the same eight dimensions, with the evidence attached, before the first meeting.",
    href: "/solutions/investor",
    cta: "For investors",
    ctaId: "home_audience_investor",
  },
  {
    icon: "accelerators",
    title: "Accelerators",
    body: "Score a whole intake in an afternoon and rank it against the Australian cohort at each stage.",
    href: "/solutions/accelerator",
    cta: "For accelerators",
    ctaId: "home_audience_accelerator",
  },
  {
    icon: "advisors",
    title: "Advisors",
    body: "Hand a client a valuation range they can defend and the list of what their data room is missing.",
    href: "/solutions/advisor",
    cta: "For advisors",
    ctaId: "home_audience_advisor",
  },
];

/** Block 3 — "How it works": three steps. */
export const HOME_STEPS: readonly HomeCard[] = [
  {
    icon: "paste",
    title: "Paste a name, a deck or a URL",
    body: "One box. It works out what you gave it — a company name, a pitch deck, a website, or three sentences of an idea.",
  },
  {
    icon: "score",
    title: "Get the score and the range",
    body: "Eight dimensions scored against Australian companies at the same stage, and a valuation range with the working shown. Sixty seconds.",
  },
  {
    icon: "dossier",
    title: "Open the dossier",
    body: "An Investor Dossier for the evaluator, a cohort table for the intake, and a feedback letter the founder can act on.",
  },
];

/** Block 3 footer — the "Go deeper" row that keeps the old `/#worth`-style anchors landing sensibly. */
export const HOME_GO_DEEPER: readonly { href: string; label: string }[] = [
  { href: productAnchor("worth"), label: "How the valuation range is built" },
  { href: productAnchor("state"), label: "The eight dimensions" },
  { href: productAnchor("journey"), label: "The twelve-phase journey" },
  { href: productAnchor("next"), label: "The data room checklist" },
];

// Every Go-deeper anchor must be one of /product's real section ids.
for (const link of HOME_GO_DEEPER) {
  const id = link.href.split("#")[1];
  if (!(PRODUCT_SECTION_IDS as readonly string[]).includes(id ?? "")) {
    throw new Error(`HOME_GO_DEEPER anchor ${link.href} is not a /product section`);
  }
}

/** Block 5 — the quiet proof row (text only; "empty until real"). */
export const HOME_PROOF_ITEMS: readonly { label: string; sub?: string; href?: string }[] = [
  { label: "Built in Sydney", sub: `Australian owned · ${LEGAL_ENTITY.marketingOperator}` },
  { label: "Data hosted in Australia", sub: "AU Privacy Act 1988" },
  { label: "Essential Eight aligned", sub: "Security posture", href: "/security-audit" },
  { label: "Stripe PCI DSS Level 1", sub: "Payments" },
  { label: "Open methodology", sub: "Weekly backtest", href: "/methodology" },
];
