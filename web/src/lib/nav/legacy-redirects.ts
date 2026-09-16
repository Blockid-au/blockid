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
//   • DEFERRED_REDIRECTS — the rest of spec §A.5. S-IA2 (G13-W2) flipped
//     the founder hub rows live; what remains waits on the evaluator
//     Reports hub, S-IA4 (onboarding merge) or S-IA5 (public rename).
//     Until then the old page stays where it is and the sidebar leaf keeps
//     pointing at it. When a later sprint creates the destination page,
//     the colocated test fails ("deferred destination now exists — move
//     the entry to LEGACY_REDIRECTS") so nothing is forgotten.
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
  // ── S-IA2 (G13-W2) — hub tabs. Pages moved with `git mv`
  // (web/scripts/codemods/s-ia2-moves.sh); literal hrefs rewritten
  // (s-ia2-rewrite-paths.py) so nothing double-hops. Composed tabs
  // (History, Benchmark, Connectors, On-chain, Manage, Competitors, Tech,
  // Compliance, Access, Enterprise) absorb several old pages each.
  { source: "/dashboard/svi", destination: "/workspace/score", permanent: true },
  { source: "/dashboard/history", destination: "/workspace/score/history", permanent: true },
  { source: "/workspace/analyses", destination: "/workspace/score/history", permanent: true },
  { source: "/workspace/svi-trend", destination: "/workspace/score/trend", permanent: true },
  { source: "/dashboard/benchmark", destination: "/workspace/score/benchmark", permanent: true },
  { source: "/workspace/svi-benchmarks", destination: "/workspace/score/benchmark", permanent: true },
  { source: "/workspace/listings/new", destination: "/workspace/score/listing", permanent: true },
  { source: "/workspace/svi-evidence", destination: "/workspace/evidence/gaps", permanent: true },
  { source: "/workspace/integrations", destination: "/workspace/evidence/connectors", permanent: true },
  { source: "/dashboard/integrations", destination: "/workspace/evidence/connectors", permanent: true },
  { source: "/workspace/metrics", destination: "/workspace/evidence/metrics", permanent: true },
  { source: "/workspace/roadmap", destination: "/workspace/plan", permanent: true },
  // Bare /workspace/guide never had an index page — land on chapter 1 (exact row first).
  { source: "/workspace/guide", destination: "/workspace/plan/guide/01-vision", permanent: true },
  { source: "/workspace/guide/:path*", destination: "/workspace/plan/guide/:path*", permanent: true },
  { source: "/workspace/journal", destination: "/workspace/plan/journal", permanent: true },
  { source: "/workspace/business-report", destination: "/workspace/reports/business", permanent: true },
  { source: "/workspace/investor-pack", destination: "/workspace/reports/investor-pack", permanent: true },
  { source: "/dashboard/c-level-reports", destination: "/workspace/reports/c-level", permanent: true },
  { source: "/dashboard/investor-links", destination: "/workspace/investors/access", permanent: true },
  { source: "/dashboard/data-room", destination: "/workspace/investors/access", permanent: true },
  { source: "/dashboard/advisor", destination: "/workspace/investors/access", permanent: true },
  { source: "/dashboard/mentor-invite", destination: "/workspace/investors/access", permanent: true },
  { source: "/dashboard/settings/mentor-access", destination: "/workspace/investors/access", permanent: true },
  { source: "/dashboard/valuation", destination: "/workspace/valuation", permanent: true },
  { source: "/dashboard/cfo", destination: "/workspace/valuation/cfo", permanent: true },
  { source: "/workspace/financial-forecast", destination: "/workspace/valuation/forecast", permanent: true },
  { source: "/dashboard/fundraise", destination: "/workspace/raise", permanent: true },
  { source: "/workspace/fundraise", destination: "/workspace/raise/round", permanent: true },
  { source: "/workspace/pitchdeck-analyze", destination: "/workspace/raise/deck", permanent: true },
  { source: "/workspace/term-sheet", destination: "/workspace/raise/term-sheet", permanent: true },
  { source: "/dashboard/accelerator", destination: "/workspace/accelerators", permanent: true },
  { source: "/dashboard/accelerator-criteria", destination: "/workspace/accelerators/criteria", permanent: true },
  { source: "/dashboard/finance", destination: "/workspace/finance", permanent: true },
  { source: "/workspace/revenue", destination: "/workspace/finance/revenue", permanent: true },
  { source: "/workspace/expenses", destination: "/workspace/finance/expenses", permanent: true },
  { source: "/workspace/tax-invoice-checker", destination: "/workspace/finance/invoices", permanent: true },
  { source: "/workspace/dividends", destination: "/workspace/finance/dividends", permanent: true },
  { source: "/workspace/equity-setup", destination: "/workspace/equity/setup", permanent: true },
  { source: "/workspace/cap-table", destination: "/workspace/equity/cap-table", permanent: true },
  { source: "/workspace/shareholders", destination: "/workspace/equity/shareholders", permanent: true },
  { source: "/workspace/secondary-offer", destination: "/workspace/equity/secondary", permanent: true },
  { source: "/workspace/wallet", destination: "/workspace/equity/on-chain", permanent: true },
  { source: "/workspace/equity-dashboard", destination: "/workspace/equity/on-chain", permanent: true },
  { source: "/workspace/vesting", destination: "/workspace/esop/vesting", permanent: true },
  { source: "/workspace/equity-esop", destination: "/workspace/esop/manage", permanent: true },
  { source: "/dashboard/esop", destination: "/workspace/esop/manage", permanent: true },
  { source: "/workspace/equity-offer", destination: "/workspace/esop/offers", permanent: true },
  { source: "/dashboard/team", destination: "/workspace/team/salaries", permanent: true },
  { source: "/dashboard/market-size", destination: "/workspace/strategy", permanent: true },
  { source: "/workspace/competitors", destination: "/workspace/strategy/competitors", permanent: true },
  { source: "/workspace/competitive-positioning", destination: "/workspace/strategy/competitors", permanent: true },
  { source: "/workspace/tech-analysis", destination: "/workspace/strategy/tech", permanent: true },
  { source: "/dashboard/analyzer", destination: "/workspace/strategy/tech", permanent: true },
  { source: "/workspace/gtm-strategy", destination: "/workspace/strategy/gtm", permanent: true },
  { source: "/workspace/pricing-tiers", destination: "/workspace/strategy/pricing", permanent: true },
  { source: "/workspace/roadmap-builder", destination: "/workspace/strategy/roadmap", permanent: true },
  { source: "/workspace/data-room", destination: "/workspace/documents/data-room", permanent: true },
  { source: "/dashboard/compliance", destination: "/workspace/documents/compliance", permanent: true },
  { source: "/compliance/calendar", destination: "/workspace/documents/compliance", permanent: true },
  { source: "/workspace/esic-assessment", destination: "/workspace/documents/compliance", permanent: true },
  { source: "/workspace/exit-strategy", destination: "/workspace/exit/strategy", permanent: true },
  { source: "/dashboard/exit-readiness", destination: "/workspace/exit/benchmark", permanent: true },
  { source: "/workspace/listing-readiness", destination: "/workspace/exit/listing", permanent: true },
  { source: "/workspace/clean-room", destination: "/workspace/exit/clean-room", permanent: true },
  { source: "/dashboard/portfolio", destination: "/workspace/projects/compare", permanent: true },
  { source: "/workspace/profile", destination: "/workspace/settings/profile", permanent: true },
  { source: "/workspace/founder-profile", destination: "/workspace/settings/founder", permanent: true },
  { source: "/workspace/notifications", destination: "/workspace/settings/notifications", permanent: true },
  { source: "/workspace/referrals", destination: "/workspace/settings/referrals", permanent: true },
  { source: "/workspace/feedback", destination: "/workspace/settings/feedback", permanent: true },
  { source: "/workspace/branding", destination: "/workspace/settings/enterprise", permanent: true },
  { source: "/workspace/api-keys", destination: "/workspace/settings/enterprise", permanent: true },
  { source: "/workspace/sso", destination: "/workspace/settings/enterprise", permanent: true },
  { source: "/workspace/white-label", destination: "/workspace/settings/enterprise", permanent: true },
  { source: "/workspace/svi-api", destination: "/workspace/settings/enterprise", permanent: true },
  { source: "/workspace/audit-log", destination: "/workspace/settings/audit", permanent: true },
  { source: "/workspace/applications", destination: "/workspace/accelerator/applications", permanent: true },
  { source: "/dashboard/reports", destination: "/workspace/reports", permanent: true, note: "index page deleted — /workspace/reports is the All reports list (order moved to /workspace/reports/order; LP quarterly stays at /dashboard/reports/lp-quarterly)" },
  // Nested routes under moved directories (one hop, never a chain).
  { source: "/dashboard/history/:startupId", destination: "/workspace/score/history/:startupId", permanent: true, note: "per-startup score history" },
  { source: "/dashboard/reports/order", destination: "/workspace/reports/order", permanent: true, note: "TBR order landing (Stripe success_url + credits path; query passes through)" },
  { source: "/dashboard/c-level-reports/:role", destination: "/workspace/reports/c-level/:role", permanent: true },
  { source: "/workspace/investor-pack/generate", destination: "/workspace/reports/investor-pack/generate", permanent: true },
  { source: "/dashboard/investor-links/new", destination: "/workspace/investors/access/new", permanent: true },
  { source: "/workspace/financial-forecast/:path*", destination: "/workspace/valuation/forecast/:path*", permanent: true, note: "wizard + [modelId]" },
  { source: "/workspace/fundraise/:path*", destination: "/workspace/raise/round/:path*", permanent: true, note: "structure + [roundId]" },
  { source: "/workspace/equity-offer/request", destination: "/workspace/esop/offers/request", permanent: true },
  { source: "/workspace/exit-strategy/:path*", destination: "/workspace/exit/strategy/:path*", permanent: true, note: "new + [scenarioId]" },
  { source: "/workspace/notifications/preferences", destination: "/workspace/settings/notifications/preferences", permanent: true },
]);

/**
 * Spec §A.5 entries whose destination does not exist yet. Kept as data so
 * the hub sprints flip them by moving rows into `LEGACY_REDIRECTS`.
 */
export const DEFERRED_REDIRECTS: readonly DeferredRedirect[] = Object.freeze([
  // Evaluator reports hub (`/workspace/investor/reports`) — not built in
  // S-IA2: it needs a "Trust reports" root page (S-IA4 investor landing
  // work) and the LP composer is the accelerator persona's own leaf, so it
  // cannot move into the founder Reports hub without evaluators inheriting
  // founder tab chrome.
  { source: "/workspace/lp-report", destination: "/workspace/reports/lp", permanent: true, pendingSprint: "S-IA2", note: "founder; evaluator handled by alias page" },
  { source: "/workspace/weekly-digest", destination: "/workspace/investor/reports/digest", permanent: true, pendingSprint: "S-IA2" },
  { source: "/workspace/investor/digest", destination: "/workspace/investor/reports/digest", permanent: true, pendingSprint: "S-IA2" },
  { source: "/dashboard/onboarding", destination: "/onboarding", permanent: false, pendingSprint: "S-IA4", held: true, note: "held until the WelcomeWizard merges into the single /onboarding wizard (temp 307 then)" },
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
