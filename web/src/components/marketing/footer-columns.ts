/**
 * Footer link columns shared by `marketing/marketing-footer.tsx` and the
 * legacy `site/footer.tsx` so the two footers cannot drift.
 *
 * Since T0238 (G11 §3a/§3d) the top nav carries only five entries, so
 * Product / For / Docs / Startup Index live here — this is their only
 * public surface. The Funding column mirrors the "Get funding" dropdown in
 * `landing/nav-v2.tsx`.
 */

export type FooterColumn = {
  title: string;
  items: { href: string; label: string }[];
};

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    // The money rail — mirrors the "Get funding" dropdown in nav-v2.tsx.
    title: "Funding",
    items: [
      { href: "/funding/grants", label: "Grants" },
      { href: "/funding/programs", label: "Programs by city" },
      { href: "/funding", label: "Do you need money?" },
      { href: "/tools/rnd-tax", label: "R&D Tax" },
      { href: "/tools/esic", label: "ESIC" },
      {
        href: "/insights/non-dilutive-funding-strategies-australia",
        label: "Non-dilutive funding guide",
      },
    ],
  },
  {
    title: "Product",
    items: [
      { href: "/features", label: "All features" },
      // B1 Task 3 — /for/founder is now a 301 to /solutions/founder.
      { href: "/solutions/founder#svi", label: "Investor-ready score" },
      { href: "/solutions/founder#captable", label: "Cap table + ESOP" },
      { href: "/solutions/founder#dataroom", label: "Data room" },
      { href: "/solutions/founder#valuation", label: "Valuation" },
      { href: "/solutions/founder#pack", label: "Investor pack" },
      // B1 Task 5 — canonical SVI URL is /index (was /svi; now 301-redirected).
      { href: "/index", label: "Startup Index" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "For",
    items: [
      // B1 Task 3/4 — /for/{founder,investor,accelerator} now 301 → /solutions/*.
      { href: "/solutions/founder", label: "Founders" },
      { href: "/solutions/investor", label: "Investors" },
      { href: "/solutions/advisor", label: "Advisors" },
      { href: "/solutions/accelerator", label: "Accelerators" },
    ],
  },
  // ux-ia-startup-flow-v1 §C.7 — Case Studies column so the Demo walkthrough
  // is discoverable from every marketing footer, not just the top-nav.
  {
    title: "Case Studies",
    items: [
      { href: "/showcase/atlassian?step=1", label: "Atlassian (live demo)" },
      { href: "/showcase/canva", label: "Canva" },
      { href: "/showcase/xero", label: "Xero" },
      { href: "/showcase/safetyculture", label: "SafetyCulture" },
      { href: "/showcase", label: "All case studies" },
    ],
  },
  {
    title: "Docs",
    items: [
      { href: "/changelog", label: "Changelog" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/team", label: "Team" },
      { href: "/status", label: "Status" },
      { href: "/security-audit", label: "Security audit" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/disclaimers", label: "Disclaimers" },
    ],
  },
];
