// Legacy route → v4 route redirect table — G13-W1-IA1 (D6).
//
// `next.config.ts` spreads `LEGACY_REDIRECTS` into `redirects()`, so every
// entry here is a permanent (308) redirect served before routing. The table
// lives in src/ (not in next.config.ts) so it is unit-testable
// (`legacy-redirects.test.ts` proves every destination page exists and no
// entry chains into another) and reusable by the post-deploy smoke, which
// HEADs every source and expects the mapped `Location`.
//
// Two lists:
//   • LEGACY_REDIRECTS — live now: the destination page exists on disk.
//   • DEFERRED_REDIRECTS — the rest of spec §A.5. Their destinations are hub
//     tabs that S-IA2 (hubs), S-IA4 (onboarding merge) or S-IA5 (public
//     rename) create. Until then the old page stays where it is and the
//     sidebar leaf keeps pointing at it (`NavLeaf.v4Href` records the
//     target). When a later sprint creates the destination page, the
//     colocated test fails ("deferred destination now exists — move the
//     entry to LEGACY_REDIRECTS") so nothing is forgotten.
//
// Routes that must NEVER appear as a source (D6): /workspace/billing (Stripe
// return), /workspace/evaluations (claim tokens), /workspace/reports/[id]
// (email links), /analyze, /startup-package, /reseller/*, /innovator/*,
// /admin/*, /tbr/[token], /reports/[ticker].
//
// Dependency-free on purpose — next.config.ts requires this file through
// Next's own TS require hook at build time.

export interface LegacyRedirect {
  /** Next.js `source` path (may carry `:path*`). */
  source: string;
  /** Next.js `destination`. */
  destination: string;
  /** `true` → 308. Only `/dashboard/onboarding` is temporary (307) per §A.5. */
  permanent: boolean;
  /** Why the old route moved — surfaces in the redirect test output. */
  note?: string;
}

export interface DeferredRedirect extends LegacyRedirect {
  /** Sprint that creates the destination page (or merges the content). */
  pendingSprint: "S-IA2" | "S-IA4" | "S-IA5";
  /**
   * The destination page already exists, but the source still carries
   * content the destination has not absorbed — the redirect is held until
   * the sprint merges it (§A.5: /dashboard/reports, /dashboard/onboarding).
   */
  held?: true;
}

/** Sources that must never be redirected (D6). Pinned by the test. */
export const NEVER_REDIRECT: readonly string[] = Object.freeze([
  "/workspace/billing",
  "/workspace/evaluations",
  "/workspace/reports/[id]",
  "/analyze",
  "/startup-package",
  "/reseller",
  "/innovator",
  "/admin",
  "/tbr/[token]",
  "/reports/[ticker]",
]);

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = Object.freeze([
  // D10 route renames — the page directories moved in S-IA1.
  { source: "/workspace/evaluation", destination: "/workspace/score/criteria", permanent: true, note: "founder 13-criteria rubric → Score › Criteria (collision with /workspace/evaluations)" },
  { source: "/workspace/investor/preferences", destination: "/workspace/investor/mandate", permanent: true, note: "investor Preferences → Mandate" },
  { source: "/workspace/investor-preferences", destination: "/workspace/investor/mandate", permanent: true, note: "alias page deleted" },
  // Redirect-only alias pages under (app) replaced by config redirects.
  { source: "/workspace/deal-flow", destination: "/workspace/investor/dealflow", permanent: true, note: "alias page deleted" },
  { source: "/workspace/watchlist", destination: "/workspace/investor/watchlist", permanent: true, note: "alias page deleted" },
  { source: "/workspace/portfolio", destination: "/workspace/investor/portfolio", permanent: true, note: "alias page deleted" },
  { source: "/workspace/client-roster", destination: "/workspace/advisor/roster", permanent: true, note: "alias page deleted" },
  { source: "/workspace/advisor-notes", destination: "/workspace/advisor/notes", permanent: true, note: "alias page deleted" },
  { source: "/workspace/cohort", destination: "/workspace/accelerator/cohort", permanent: true, note: "alias page deleted" },
  // Retired paywall page — was a server redirect to /pricing carrying its
  // query string; Next config redirects pass the query through unchanged.
  { source: "/workspace/reports/upgrade", destination: "/pricing", permanent: true, note: "alias page deleted (query passes through)" },
]);

/**
 * Spec §A.5 entries whose destination does not exist yet. Kept as data so
 * the hub sprints flip them by moving rows into `LEGACY_REDIRECTS`.
 */
export const DEFERRED_REDIRECTS: readonly DeferredRedirect[] = Object.freeze([
  // Score hub
  { source: "/dashboard/svi", destination: "/workspace/score", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/history", destination: "/workspace/score/history", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/analyses", destination: "/workspace/score/history", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/svi-trend", destination: "/workspace/score/trend", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/benchmark", destination: "/workspace/score/benchmark", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/svi-benchmarks", destination: "/workspace/score/benchmark", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/listings/new", destination: "/workspace/score/listing", permanent: true, pendingSprint: "S-IA2" },
  // Evidence hub
  { source: "/workspace/svi-evidence", destination: "/workspace/evidence/gaps", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/integrations", destination: "/workspace/evidence/connectors", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/integrations", destination: "/workspace/evidence/connectors", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/metrics", destination: "/workspace/evidence/metrics", permanent: true, pendingSprint: "S-IA2" },
  // Plan hub
  { source: "/workspace/roadmap", destination: "/workspace/plan", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/guide/:path*", destination: "/workspace/plan/guide/:path*", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/journal", destination: "/workspace/plan/journal", permanent: true, pendingSprint: "S-IA2" },
  // Reports hub
  { source: "/workspace/business-report", destination: "/workspace/reports/business", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/investor-pack", destination: "/workspace/reports/investor-pack", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/reports", destination: "/workspace/reports", permanent: true, pendingSprint: "S-IA2", held: true, note: "held until /workspace/reports lists every artefact (order + LP quarterly live under /dashboard/reports today)" },
  { source: "/dashboard/c-level-reports", destination: "/workspace/reports/c-level", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/lp-report", destination: "/workspace/reports/lp", permanent: true, pendingSprint: "S-IA2", note: "founder; evaluator handled by alias page" },
  // Investors hub
  { source: "/dashboard/investor-links", destination: "/workspace/investors/access", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/data-room", destination: "/workspace/investors/access", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/advisor", destination: "/workspace/investors/access", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/mentor-invite", destination: "/workspace/investors/access", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/settings/mentor-access", destination: "/workspace/investors/access", permanent: true, pendingSprint: "S-IA2" },
  // Valuation hub
  { source: "/dashboard/valuation", destination: "/workspace/valuation", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/cfo", destination: "/workspace/valuation/cfo", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/financial-forecast", destination: "/workspace/valuation/forecast", permanent: true, pendingSprint: "S-IA2" },
  // Raise hub
  { source: "/dashboard/fundraise", destination: "/workspace/raise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/fundraise", destination: "/workspace/raise/round", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/pitchdeck-analyze", destination: "/workspace/raise/deck", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/term-sheet", destination: "/workspace/raise/term-sheet", permanent: true, pendingSprint: "S-IA2" },
  // Accelerators hub
  { source: "/dashboard/accelerator", destination: "/workspace/accelerators", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/accelerator-criteria", destination: "/workspace/accelerators/criteria", permanent: true, pendingSprint: "S-IA2" },
  // Finance hub
  { source: "/dashboard/finance", destination: "/workspace/finance", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/revenue", destination: "/workspace/finance/revenue", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/expenses", destination: "/workspace/finance/expenses", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/tax-invoice-checker", destination: "/workspace/finance/invoices", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/dividends", destination: "/workspace/finance/dividends", permanent: true, pendingSprint: "S-IA2" },
  // Equity hub
  { source: "/workspace/equity-setup", destination: "/workspace/equity/setup", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/cap-table", destination: "/workspace/equity/cap-table", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/shareholders", destination: "/workspace/equity/shareholders", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/secondary-offer", destination: "/workspace/equity/secondary", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/wallet", destination: "/workspace/equity/on-chain", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/equity-dashboard", destination: "/workspace/equity/on-chain", permanent: true, pendingSprint: "S-IA2" },
  // ESOP hub
  { source: "/workspace/vesting", destination: "/workspace/esop/vesting", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/equity-esop", destination: "/workspace/esop/manage", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/esop", destination: "/workspace/esop/manage", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/equity-offer", destination: "/workspace/esop/offers", permanent: true, pendingSprint: "S-IA2" },
  // Team hub
  { source: "/dashboard/team", destination: "/workspace/team/salaries", permanent: true, pendingSprint: "S-IA2" },
  // Strategy hub
  { source: "/dashboard/market-size", destination: "/workspace/strategy/market", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/competitors", destination: "/workspace/strategy/competitors", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/competitive-positioning", destination: "/workspace/strategy/competitors", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/tech-analysis", destination: "/workspace/strategy/tech", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/analyzer", destination: "/workspace/strategy/tech", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/gtm-strategy", destination: "/workspace/strategy/gtm", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/pricing-tiers", destination: "/workspace/strategy/pricing", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/roadmap-builder", destination: "/workspace/strategy/roadmap", permanent: true, pendingSprint: "S-IA2" },
  // Documents hub
  { source: "/workspace/data-room", destination: "/workspace/documents/data-room", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/compliance", destination: "/workspace/documents/compliance", permanent: true, pendingSprint: "S-IA2" },
  { source: "/compliance/calendar", destination: "/workspace/documents/compliance", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/esic-assessment", destination: "/workspace/documents/compliance", permanent: true, pendingSprint: "S-IA2" },
  // Exit hub
  { source: "/workspace/exit-strategy", destination: "/workspace/exit/strategy", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/exit-readiness", destination: "/workspace/exit/benchmark", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/listing-readiness", destination: "/workspace/exit/listing", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/clean-room", destination: "/workspace/exit/clean-room", permanent: true, pendingSprint: "S-IA2" },
  // Projects hub
  { source: "/dashboard/portfolio", destination: "/workspace/projects/compare", permanent: true, pendingSprint: "S-IA2" },
  // Settings hub
  { source: "/workspace/profile", destination: "/workspace/settings/profile", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/founder-profile", destination: "/workspace/settings/founder", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/notifications", destination: "/workspace/settings/notifications", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/referrals", destination: "/workspace/settings/referrals", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/feedback", destination: "/workspace/settings/feedback", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/branding", destination: "/workspace/settings/enterprise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/api-keys", destination: "/workspace/settings/enterprise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/sso", destination: "/workspace/settings/enterprise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/white-label", destination: "/workspace/settings/enterprise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/svi-api", destination: "/workspace/settings/enterprise", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/audit-log", destination: "/workspace/settings/audit", permanent: true, pendingSprint: "S-IA2" },
  // Evaluator reports hub
  { source: "/workspace/weekly-digest", destination: "/workspace/investor/reports/digest", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/investor/digest", destination: "/workspace/investor/reports/digest", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/applications", destination: "/workspace/accelerator/applications", permanent: true, pendingSprint: "S-IA2" },
  // Onboarding merge (temporary 307 until S-IA4, then permanent).
  { source: "/dashboard/onboarding", destination: "/onboarding", permanent: false, pendingSprint: "S-IA4", held: true, note: "held until the WelcomeWizard merges into the single /onboarding wizard (temp 307 then)" },
  // Public rename — CMO sign-off before S-IA5 ships.
  { source: "/investors", destination: "/about/invest", permanent: true, pendingSprint: "S-IA5", note: "public 301; sitemap + JSON-LD + footer link" },
]);

/** Next.js `redirects()` rows for the live table. */
export function legacyRedirectRows(): Array<{ source: string; destination: string; permanent: boolean }> {
  return LEGACY_REDIRECTS.map(({ source, destination, permanent }) => ({ source, destination, permanent }));
}

/** Where a legacy path lands today (exact-match sources only). */
export function resolveLegacyRedirect(pathname: string): string | null {
  const hit = LEGACY_REDIRECTS.find((r) => r.source === pathname);
  return hit ? hit.destination : null;
}
