/**
 * /samples content (G17 D4). Plain data so the page test can pin that every
 * card links to a page that exists on disk; icons are named here and mapped
 * to Lucide components in page.tsx (keeps this file React-free).
 */

export type SampleIcon = "search" | "file" | "scroll" | "landmark" | "route" | "book";

export interface SampleCard {
  icon: SampleIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
  ctaId?: string;
}

/** The documents a run produces — every href is a public page. */
export const SAMPLE_DOSSIERS: readonly SampleCard[] = [
  {
    icon: "file",
    title: "Investor Dossier (demo)",
    body: "The evaluator-side report: score, eight dimensions with evidence, valuation range, cohort table and the verification badge — for a fixture company.",
    href: "/tbr/demo",
    cta: "Open the dossier",
    ctaId: "samples_dossier",
  },
  {
    icon: "scroll",
    title: "Trusted Business Report (sample)",
    body: "The written report a founder is emailed as a PDF: the same eight readings, a prioritised action list and a 90-day plan.",
    href: "/sample-business-report",
    cta: "Read the sample report",
    ctaId: "samples_tbr",
  },
  {
    icon: "landmark",
    title: "Funding report (demo)",
    body: "The Money Finder output: matched grants and programs, a Gantt of deadlines and the eligibility notes behind each match.",
    href: "/funding/report/demo",
    cta: "See the funding report",
    ctaId: "samples_funding",
  },
  {
    icon: "search",
    title: "Anonymised run reports",
    body: "The three runs above, each as the full page a founder sees after the sixty-second score.",
    href: "/reports/samples",
    cta: "Browse the runs",
  },
  {
    icon: "book",
    title: "How the score is built",
    body: "The public methodology: what each dimension measures, how the cohort bands are drawn and the weekly backtest.",
    href: "/methodology",
    cta: "Read the methodology",
  },
  {
    icon: "route",
    title: "The twelve phases",
    body: "The journey ladder every run places a company on, from Vision to Funding, with the work each phase asks for.",
    href: "/showcase/atlassian/growth-phases",
    cta: "See the phases",
  },
];

/** Showcase journeys — the Atlassian walkthrough leads (G7 Q2). */
export const SAMPLE_JOURNEYS: readonly SampleCard[] = [
  {
    icon: "route",
    title: "Atlassian (interactive)",
    body: "Step through the journey of an Australian company that went from two founders to a listing — the live walkthrough.",
    href: "/showcase/atlassian?step=1",
    cta: "Start at step 1",
    ctaId: "samples_atlassian",
  },
  {
    icon: "route",
    title: "Canva",
    body: "Design tool to decacorn: how the eight dimensions moved phase by phase.",
    href: "/showcase/canva",
    cta: "Canva journey",
  },
  {
    icon: "route",
    title: "Xero",
    body: "Accounting software from Wellington to the ASX — the public-record ladder.",
    href: "/showcase/xero",
    cta: "Xero journey",
  },
  {
    icon: "route",
    title: "SafetyCulture",
    body: "A Townsville checklist app to a global platform, phase by phase.",
    href: "/showcase/safetyculture",
    cta: "SafetyCulture journey",
  },
  {
    icon: "route",
    title: "Airwallex",
    body: "Melbourne fintech to a multi-billion payments company on the same twelve steps.",
    href: "/showcase/airwallex",
    cta: "Airwallex journey",
  },
  {
    icon: "route",
    title: "Culture Amp",
    body: "People analytics from Melbourne — the twelve phases on the public record.",
    href: "/showcase/culture-amp",
    cta: "Culture Amp journey",
  },
];
