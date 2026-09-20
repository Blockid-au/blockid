/**
 * /features copy — the eight capability cards, grouped by audience
 * (G17 P2-A moved them out of page.tsx; Next only allows route-segment
 * exports from a page file). Icons are Lucide names resolved in page.tsx
 * so this file stays React-free. `page.test.ts` reads this file for the
 * tool count.
 */

import { LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";

export type FeatureIcon =
  | "bar-chart"
  | "link"
  | "coins"
  | "wrench"
  | "book"
  | "file-check"
  | "shield-check"
  | "receipt";

export interface FeatureCopy {
  /** Anchor on the card — `/features#per-investor-tracked-share-links` is linked from the homepage grid. */
  anchor: string;
  title: string;
  copy: string;
  href: string;
  linkLabel: string;
  icon: FeatureIcon;
}

export const FOUNDER_FEATURES: readonly FeatureCopy[] = [
  {
    anchor: "cohort-percentile-scoring",
    title: "Cohort percentile scoring",
    copy: "See exactly where your SVI score sits inside your sector cohort — not just a number, a percentile.",
    href: "/how-it-works#dimensions",
    linkLabel: "How the score works",
    icon: "bar-chart",
  },
  {
    anchor: "per-investor-tracked-share-links",
    title: "Per-investor tracked share links",
    copy: "Every investor gets a unique URL. You see who opened it, when, and how long they read.",
    href: "/sample",
    linkLabel: "See a sample link",
    icon: "link",
  },
  {
    anchor: "dividend-engine",
    title: "Dividend engine with franking credits",
    // "on-chain optional" dropped 2026-09-09: the on-chain leg runs through
    // executeOnChainTx in lib/blockchain-sync.ts, which is a stub that returns
    // a fabricated hash. The franking-credit calculation itself is real
    // (lib/dividends.ts, /api/dividends, /workspace/finance/dividends).
    copy: "Work out a dividend and its franking credits on-platform, with the imputation arithmetic done for you.",
    href: "/tools",
    linkLabel: "Explore the toolset",
    icon: "coins",
  },
  {
    anchor: "free-tools",
    // 16, not 17 — /tools renders ALL_TOOLS.length and there are 16 routes
    // under app/tools/. The features-page test counts the directories.
    title: "16 free tools",
    copy: "From SAFE calculator to R&D-tax checker to ESOP eligibility — 16 focused tools, all free, no login required.",
    href: "/tools",
    linkLabel: "Open the tools hub",
    icon: "wrench",
  },
  {
    anchor: "guided-journey",
    title: "12-chapter guided journey",
    copy: "A step-by-step operator's manual — 12 chapters from ideation to your first Series A.",
    href: "/guide/01-vision",
    linkLabel: "Start the guide",
    icon: "book",
  },
];

export const INVESTOR_FEATURES: readonly FeatureCopy[] = [
  {
    anchor: "evidence-completeness",
    title: "Evidence completeness engine",
    copy: "Every SVI dimension carries a completeness percentage — no evidence = no confident score.",
    href: "/how-it-works#dimensions",
    linkLabel: "See how it works",
    icon: "file-check",
  },
  {
    anchor: "lp-anonymisation",
    title: "LP report anonymisation",
    copy: "Share benchmark data with LPs without exposing individual startup names.",
    href: "/solutions/investor",
    linkLabel: "For investors",
    icon: "shield-check",
  },
];

export const EVERYONE_FEATURES: readonly FeatureCopy[] = [
  {
    anchor: "ato-tax-invoice",
    title: "ATO tax invoice at checkout",
    copy: `Your Stripe receipt is an ATO-compliant tax invoice with our ${LEGAL_ENTITY_ABN_LABEL} and GST amount.`,
    href: "/pricing",
    linkLabel: "See pricing",
    icon: "receipt",
  },
];
