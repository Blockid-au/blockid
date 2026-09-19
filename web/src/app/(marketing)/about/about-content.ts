/**
 * /about copy (G17 P2-A moved it out of page.tsx). Qualitative trust
 * signals only — "empty until real" per SOURCE-OF-TRUTH: no invented
 * customer counts, no funding-facilitated figures, no satisfaction
 * percentages. The build-version paragraph that used to live here (file
 * counts, model names, migration numbers) drifted with every release and
 * is gone; /changelog carries that. React-free; icons resolved in page.tsx.
 */

export type AboutIcon =
  | "target"
  | "layout"
  | "file"
  | "globe"
  | "zap"
  | "code"
  | "shield"
  | "scale"
  | "bot"
  | "trending";

export interface AboutCard {
  icon: AboutIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

export const ABOUT_WHAT_WE_DO: readonly AboutCard[] = [
  {
    icon: "target",
    title: "Startup Value Index (SVI)",
    body: "8-dimension AI scoring that tracks viability from idea to scale.",
    href: "/product",
    cta: "How the score works",
  },
  {
    icon: "layout",
    title: "Cap table & ownership",
    body: "Model equity splits, dilution scenarios and vesting schedules.",
    href: "/tools/cap-table",
    cta: "Try the cap table",
  },
  {
    icon: "file",
    title: "Investor-ready documents",
    body: "Data rooms, term sheets and export packs for due diligence.",
    href: "/samples",
    cta: "See sample output",
  },
  {
    icon: "globe",
    title: "AU compliance tools",
    body: "ESIC eligibility checker, R&D tax calculator, ASIC tracking.",
    href: "/tools",
    cta: "Open the tools hub",
  },
  {
    icon: "zap",
    title: "AI-powered analysis",
    body: "Competitive research, market sizing and growth scoring in seconds.",
    href: "/analyze",
    cta: "Score a startup",
  },
  {
    icon: "code",
    title: "Free startup tools",
    body: "Idea valuation, equity split, funding plan, dilution modelling and more — no login required.",
    href: "/tools",
    cta: "All free tools",
  },
];

export const ABOUT_APPROACH: readonly AboutCard[] = [
  {
    icon: "shield",
    title: "Evidence-backed scoring",
    body: "Every SVI dimension is scored against real evidence — ABN registrations, financial data, team structure, market signals — not self-reported surveys.",
  },
  {
    icon: "scale",
    title: "Australian regulatory compliance",
    body: "Built for ABN, ASIC, ESIC, R&D Tax Incentive and ESOP structures under Australian law. Your data is hosted with Australian residency.",
  },
  {
    icon: "bot",
    title: "A C-suite of specialised agents",
    body: "From competitive research to R&D eligibility, each agent is purpose-built for a specific domain — institutional-grade analysis at startup speed, with an auditor that flags unsupported claims.",
  },
  {
    icon: "trending",
    title: "Startup Value Index",
    body: "An 8-dimension scoring engine that tracks your startup across team, market, product, traction, financials, legal, IP and investor readiness.",
  },
];

/** Regulatory facts about the operating entity — never capability claims. */
export const ABOUT_PROOF = [
  { label: "Auschain Pty Ltd", sub: "ACN 659 615 111 · ABN 79 659 615 111" },
  { label: "Sydney NSW", sub: "Australian-owned HQ" },
  { label: "Australian data residency", sub: "Hosted in Australia" },
  { label: "ASIC · ESIC · R&D", sub: "Compliance-first tooling" },
  { label: "8 SVI dimensions", sub: "Evidence-linked scoring" },
] as const;

export const ABOUT_AU_NATIVE: readonly string[] = [
  "Auschain Pty Ltd (ACN 659 615 111, ABN 79 659 615 111)",
  "Headquartered in Sydney, NSW, Australia",
  "Data hosted with Australian residency",
  "Compliance frameworks built for ASIC and ATO requirements",
  "Tools built for Australian regulations: ESOP structures, SAFE notes under local law, R&D Tax Incentive, ESIC",
];

export const ABOUT_TEAM_PARAGRAPHS: readonly string[] = [
  "BlockID was built by an experienced founder who has lived the startup journey — raising capital, negotiating term sheets, and building cap tables from scratch. Instead of assembling a traditional team of dozens, BlockID is powered by 11 specialised C-Level AI agents (CTO, CFO, CPO, CMO, CRO, CLO, CHRO, CISO, CDO, COO, plus a Customer Success lead), each purpose-built for a critical domain: valuation, competitive research, R&D eligibility, financial modelling, compliance and more.",
  "The result is a platform that would typically need a team of twenty, shipped with the speed of AI-native development and reviewed by a human before anything reaches a customer. What shipped and when is on the changelog.",
];
