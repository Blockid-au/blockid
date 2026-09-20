/**
 * /solutions index copy — the persona cards (G17 P2-A moved them out of
 * page.tsx). Prices stay off this page (D3/D5): each card links to the
 * persona page, which links to `/pricing?segment=evaluator`.
 */

export type SolutionIcon = "rocket" | "search" | "briefcase" | "users" | "languages";

export interface SolutionCard {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: SolutionIcon;
}

export const SOLUTION_CARDS: readonly SolutionCard[] = [
  // 2026-09-10 (T0274, G12): the three evaluator personas sell the
  // Scout / Firm / Program ladder. Each card carries that persona's approved
  // line from the messaging pack; amounts live on /pricing only.
  {
    href: "/solutions/investor",
    eyebrow: "For investors",
    title: "One score across 8 investor dimensions, backed by the startup's own evidence",
    body: "Screen a deal in minutes on the same 8-dimension SVI rubric, reviewed by a C-suite of AI agents and an auditor — and watch it move every week.",
    icon: "search",
  },
  {
    href: "/solutions/accelerator",
    eyebrow: "For accelerators and incubators",
    title: "Score the whole cohort on one rubric, then show sponsors the progress",
    body: "Every startup in the program on the same 8-dimension, 13-criteria rubric, re-scored as it changes, so sponsors see movement rather than memory.",
    icon: "users",
  },
  {
    href: "/solutions/advisor",
    eyebrow: "For advisors and consulting firms",
    title: "A C-suite review of every client, in AUD, with ESIC and R&D Tax checks",
    body: "Score every client you advise on one rubric, with valuation in AUD and ESIC, R&D Tax Incentive and s708 checks — white-labelled under your firm's brand.",
    icon: "briefcase",
  },
  {
    href: "/solutions/founder",
    eyebrow: "For founders",
    title: "Score, plan and raise your Australian startup",
    body: "Paste an idea, get a Startup Value Index score, and follow the guided roadmap from Day-0 to Seed round — with AU-specific tooling for ESIC, R&D and s708 baked in.",
    icon: "rocket",
  },
  {
    href: "/solutions/vn-sme",
    eyebrow: "For VN SMEs",
    // 2026-09-09: there is no "bilingual playbook", no ABN-registration flow
    // and no ESIC-eligibility walkthrough behind this card. What exists is a
    // Vietnamese interface over the same product.
    title: "The same platform, in Vietnamese",
    body: "The site and the product's surfaces render in Vietnamese. The analysis is unchanged, and pricing stays in AUD, GST-inclusive, with an ATO tax invoice.",
    icon: "languages",
  },
];
