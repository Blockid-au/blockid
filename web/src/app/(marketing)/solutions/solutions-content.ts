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
    title: "Standardise the first-pass review before human investment judgement begins",
    body: "Every deal on one comparable Startup Value Index, with the evidence gaps and risk flags named before the meeting. Supports due diligence; never replaces it.",
    icon: "search",
  },
  {
    href: "/solutions/accelerator",
    eyebrow: "For accelerators, incubators and innovation programs",
    title: "Turn your next startup intake into a comparable, evidence-backed cohort",
    body: "Score applicants consistently, identify who needs deeper review, target mentor support and show sponsors measurable progress. Start a Cohort plan on your next intake — 14-day trial, card required.",
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
    title: "See what an evaluator can verify — not only what your pitch says",
    body: "Add a URL or a deck, get a Startup Value Index preview, see which claims lack evidence and fix them before your next application or investor meeting.",
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
