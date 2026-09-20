/**
 * Footer link columns for the one public footer (`marketing/footer.tsx`).
 * Until G13-W5-IA5 this list was shared by two footers (marketing +
 * `site/footer.tsx`) so they could not drift; the legacy footer is gone and
 * its Company column now lives here.
 *
 * G17 D5 (2026-09-19): FOUR columns — Product · For · Company · Legal — the
 * same on every page. The bar shrank to five entries (Product · Solutions ·
 * Samples · Pricing · Docs), so everything the old seven-column footer and
 * the old bar carried (the Funding rail, the free tools, the case studies,
 * Docs / Changelog / Roadmap / Status) is folded into these four rather than
 * dropped: nothing that had inbound links may 404 (D7). Every href here
 * resolves to a page on disk — the colocated test walks src/app.
 */

export type FooterColumn = {
  title: string;
  items: { href: string; label: string }[];
};

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    // What it is and what it produces — the intro page, the samples, the
    // ladder rungs, the money rail and the tools (all the old bar's depth).
    title: "Product",
    items: [
      { href: "/product", label: "Product overview" },
      { href: "/samples", label: "Sample results" },
      { href: "/features", label: "All features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/methodology", label: "Methodology" },
      { href: "/startup-index", label: "Startup Value Index" },
      { href: "/funding", label: "Money Finder" },
      { href: "/funding/grants", label: "Grants" },
      { href: "/funding/programs", label: "Programs by city" },
      { href: "/tools", label: "Free tools" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
    ],
  },
  {
    // Persona landings, the evaluator pilot and the walk-through demo.
    title: "For",
    items: [
      { href: "/solutions/investor", label: "Investors" },
      { href: "/solutions/accelerator", label: "Accelerators" },
      { href: "/solutions/advisor", label: "Advisors" },
      { href: "/solutions/founder", label: "Founders" },
      // G21 P0-C — the paid Cohort Validation Pilot (A$1,500 / A$2,500 one-off).
      { href: "/pilot", label: "Cohort pilot" },
      { href: "/showcase/atlassian?step=1", label: "Atlassian demo (live)" },
      { href: "/showcase", label: "All case studies" },
      { href: "/compare", label: "Compare" },
    ],
  },
  {
    // The Company column the legacy site/footer.tsx carried for the ~50
    // pages only it reached, plus the Docs-column rows that were company
    // news rather than product docs. "Invest in BlockID" is the renamed
    // /investors pitch (S-IA5, F2).
    title: "Company",
    items: [
      { href: "/about", label: "About" },
      { href: "/team", label: "Team" },
      { href: "/about/invest", label: "Invest in BlockID" },
      { href: "/benchmarks", label: "AU Benchmarks" },
      { href: "/insights", label: "Insights" },
      { href: "/changelog", label: "Changelog" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/status", label: "Status" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/legal/terms", label: "Terms" },
      // QA-3 (2026-09-12): the one refund policy is Terms clause 3A.
      { href: "/legal/terms#refunds", label: "Refunds" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/disclaimers", label: "Disclaimers" },
      { href: "/security-audit", label: "Security audit" },
    ],
  },
];
