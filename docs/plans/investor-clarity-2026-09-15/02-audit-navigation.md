> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G13 · read-only codebase audit 2026-09-15 (input to the G13 goal doc).

# Exploration report 2 — Navigation / Menu / Post-login IA (2026-09-15)

## Live sidebar = src/components/workspace/nav-groups.ts (NAV_GROUPS 7 groups + ADMIN_NAV_GROUP), rendered ONLY by src/components/workspace/workspace-layout.tsx (863 lines). Gates: segments mismatch→hidden; feature missing→hidden; minPhase>currentPhase→hidden or "Later phases (N)" expander; minPlan unmet→dimmed+lock→/workspace/billing; addOnKey→Add-on pill. currentPhase 0..5 from src/lib/nav/founder-phase.ts (max(SVI band, projects.growth_phase_current)). Core groups home/validate/account never hidden by phase.

### Catalogue
- HOME: My Startups /workspace/projects; Archived; Portfolio (beta) /dashboard/portfolio; SVI Score /dashboard/svi; Score History /dashboard/history; New Analysis /analyze; Action Plan /workspace/roadmap. NO /dashboard link in sidebar.
- VALIDATE (minPhase 0): Get Investor-Ready → Startup Package /startup-package; Discover → Grant & Program Finder /workspace/funding, Market Size /dashboard/market-size, Knowledge Base /workspace/knowledge-base; Evaluate → Your Analyses /workspace/analyses, Evaluation (13) /workspace/evaluation, Evidence Vault /workspace/evidence, Evidence Completeness /workspace/svi-evidence, Business Report (TBR) /workspace/business-report, SVI Trend /workspace/svi-trend; Track → Metrics /workspace/metrics, Weekly Reports /workspace/reports.
- BUILD (minPhase 2): Equity Setup → /workspace/equity-setup, /workspace/equity, /workspace/cap-table, /workspace/shareholders; People → ESOP Setup /workspace/esop [add-on], Vesting /workspace/vesting [add-on], ESOP Manage /workspace/equity-esop, Equity Offer /workspace/equity-offer; Blockchain → Wallet /workspace/wallet, Blockchain Sync /workspace/equity-dashboard; Strategy → Competitors, Tech Analysis, Code & Web Analyzer /dashboard/analyzer, GTM Strategy, Pricing Tiers, Roadmap /workspace/roadmap-builder, Team Planner /workspace/team.
- FUNDRAISE (minPhase 3): Valuation & Finance → VC Valuation /dashboard/valuation, CFO Advisor /dashboard/cfo, Finance P&L /dashboard/finance, ESOP Manager /dashboard/esop, Team & Salaries /dashboard/team; Data Room → /workspace/data-room, Documents /workspace/documents, ESIC /workspace/esic-assessment, Compliance Panel /dashboard/compliance, Compliance Calendar /compliance/calendar; Accelerators → /dashboard/accelerator, /dashboard/accelerator-criteria; Raise → Financial Forecast, Fundraise Readiness /dashboard/fundraise, Raise Capital /workspace/fundraise, Investor CRM /workspace/investors.
- SCALE & EXIT (minPhase 4): Revenue → /workspace/revenue, expenses, tax-invoice-checker, journal, dividends; Exit → /workspace/exit, /workspace/exit-strategy, /dashboard/exit-readiness, /workspace/listing-readiness, /workspace/clean-room.
- ROLES: Investor [investor_angel|investor_vc|advisor|accelerator] → Startups I'm evaluating /workspace/evaluations, Deal Flow /workspace/deal-flow (alias), Watchlist (alias), Portfolio (alias, vc_small), Preferences /workspace/investor-preferences (alias); Advisor → Client Roster (alias), Notes (alias), Weekly Digest; Accelerator → Cohort (alias), Applications, LP Report; Reseller [feature reseller.console] → /reseller/*; Mentor → /reseller/mentor (appears twice: Reseller›Mentor and Mentor›Roster).
- ACCOUNT: Profile → /workspace/profile, /workspace/settings, /workspace/founder-profile, /workspace/notifications, /workspace/referrals, /workspace/feedback; Billing; Enterprise → integrations, branding, Advisor Portal /dashboard/advisor, API keys, SSO, white-label.
- ADMIN group when role=admin.

### Role overlay src/lib/nav/role-menu-overlay.ts (hiddenGroups / sidebarOrder / topNavExtras): investor_angel|investor_vc hide Validate, Build, Scale&Exit → order Home, Roles, Fundraise, Account. advisor hides Validate, Scale&Exit. accelerator hides Validate, Build. reseller/mentor/innovator hide all founder groups (Home, Roles, Account) + console link. journalist Home+Account only. Overlay hides by LABEL.
### Dead parallel systems: src/lib/roles/role-taxonomy.ts ROLE_SPECS (landingHref/menuGroupIds unwired, only tourSlug used); nav-schema.ts + filter-nav-for-user.ts + nested-sidebar.tsx (V2, unmounted); nav/journey-sidebar.tsx + persona-rail.tsx (V3, unmounted); workflow-steps.ts.
### Other shells: admin-layout.tsx (5 groups incl. links to founder /workspace equity pages), reseller layout wraps WorkspaceLayout (phase 0), innovator own 4-tab nav, compliance wraps WorkspaceLayout. Topbar: ProjectSwitcher, "Demo · Live" → /showcase/atlassian?step=1, topNavExtras, ResellerPill, wallet, credits, theme, NotificationBell, avatar. Sidebar top: RecommendedNextStepTile + UnlockPulseCard.

## Redirect-only aliases under (app): /workspace→/dashboard; /workspace/portfolio, /watchlist, /deal-flow, /investor-preferences, /advisor-notes, /client-roster, /cohort → real pages; /dashboard/onboarding; /workspace/reports/upgrade→/pricing; next.config: /login→/auth/login, /score→/analyze?tier=free, /svi,/index,/live→/startup-index, /for/*→/solutions/*, /plans,/subscribe,/founding-*→/pricing.

## Overlap table (label | routes | note)
- Dashboard: /dashboard (landing, no sidebar entry) vs /dashboard/svi "SVI Score" (447 lines, own NextBestAction/NextStep tiles); LivingSVIDashboard rendered on both.
- Portfolio: /dashboard/portfolio (Home, beta) vs /workspace/portfolio→/workspace/investor/portfolio (Roles) — same label, two pages.
- Analyses: /workspace/analyses "Your Analyses", /analyze "New Analysis", /workspace/evaluation "Evaluation (13)", /workspace/evaluations "Startups I'm evaluating", /dashboard/history "Score History"; /score → /analyze.
- Reports (8 surfaces): /workspace/reports "Weekly Reports", /dashboard/reports (no nav), /workspace/business-report "Business Report (TBR)", /workspace/investor-pack (no nav), /dashboard/c-level-reports (no nav), /reseller/reports, /workspace/lp-report, /workspace/accelerator/quarterly-report; marketing user menu "My reports" → /workspace/reports.
- Evidence: /workspace/evidence "Evidence Vault" + /workspace/svi-evidence "Evidence Completeness".
- Data room/documents (4): /workspace/data-room, /workspace/documents, /dashboard/data-room "Investor Access" (no nav), /dashboard/investor-links (no nav).
- Funding/money: /workspace/funding "Grant & Program Finder", /dashboard/fundraise "Fundraise Readiness", /workspace/fundraise "Raise Capital", /workspace/investors "Investor CRM", /workspace/financial-forecast, public /funding, MoneyRadarTile.
- Roadmap (3): /workspace/roadmap "Action Plan" (title "Growth Roadmap"), /workspace/roadmap-builder "Roadmap", GrowthRoadmap widget; + /admin/roadmap, public /roadmap.
- ESOP/Equity: /workspace/esop "ESOP Setup", /workspace/equity-esop "ESOP Manage", /dashboard/esop "ESOP Manager", /workspace/equity "Equity Split", /workspace/equity-setup, /workspace/vesting, /workspace/esop/grants — 3 subgroups across 2 groups.
- Team: /workspace/team "Team Planner" (title "Team & Salaries") vs /dashboard/team "Team & Salaries".
- Exit (3): /workspace/exit, /workspace/exit-strategy, /dashboard/exit-readiness.
- Competitors: /workspace/competitors vs /workspace/competitive-positioning (no nav). Benchmarks: /dashboard/benchmark vs /workspace/svi-benchmarks (no nav). Integrations: /workspace/integrations vs /dashboard/integrations.
- Advisor: /dashboard/advisor "Advisor Portal" (Account›Enterprise) vs /workspace/advisor hub (no nav) vs Roles›Advisor.
- Accelerator: /dashboard/accelerator tracker + criteria (founder-facing) vs /workspace/accelerator hub (no nav) + cohort/applications (program manager) + /admin/accelerator.
- Investor: /workspace/investor hub (no nav), /workspace/investor/*, /workspace/investors (founder CRM), /workspace/investor-pack, public /investor + /investors.
- Mentor: /reseller/mentor twice under Roles. Compliance: /dashboard/compliance + /compliance/calendar. Settings: /workspace/settings, profile, founder-profile, notifications/preferences, /dashboard/settings/mentor-access. Demo: 3 entry points.
- ~25 founder pages with NO sidebar entry: /dashboard, /dashboard/benchmark, c-level-reports, data-room, integrations, investor-links, mentor-invite, reports, settings/mentor-access, /workspace/accelerator*, advisor*, audit-log, competitive-positioning, investor*, investor-pack, pitchdeck-analyze, secondary-offer, svi-api, svi-benchmarks, term-sheet, listings/new.
- Dead link: onboarding-progress-bar.tsx:34 → /workspace/market-size (page is /dashboard/market-size).

## Post-login
1. (app)/layout.tsx auth gate → /auth/login?next; persona sub-layouts are passthroughs; only (founder)/layout.tsx sets nav phase.
2. auth/login/page.tsx next ?? "/dashboard"; login-form.tsx password → nextUrl ?? "/" + ?logged_in=true; register → /workspace/analyses if analyses claimed else /dashboard.
3. auth/verify/route.ts magic link → pack page > next > /dashboard?logged_in=true. google-login.ts → /dashboard or /onboarding if !onboarding_completed.
4. /dashboard page.tsx:418-437 → /dashboard/onboarding (WelcomeWizard 3 steps, always role founder, finish → /analyze) if !onboardingCompleted && !isMember && zero analyses.
5. /onboarding (6-step wizard: segment founder/investor_angel/investor_vc/advisor/accelerator → goal → tier → trial → payment → first startup); exits → /dashboard?onboarding=complete or /workspace/guide/01-vision or /workspace/billing.
6. NO segment-aware landing: investors/advisors/accelerators land on founder /dashboard with RoleLandingIntro role="founder". ROLE_SPECS.landingHref unused. Reseller without entitlement → /dashboard/svi.
7. /dashboard first-screen cards (page.tsx 818-1220): RoleLandingIntro, OnboardingWelcomeModal, checkout/welcome banners, EmptyDashboardState, JourneyBar, JourneyStepLadder, ScnPositionHero + MoneyRadarTile, ValueImpactBanner, SviDimensionChart, NextUnlockCard, project card, WidgetGrid (src/lib/dashboard/widget-ids.ts: health-score, metrics, svi-radar, github-evidence, guide-next, reports-actions, status-cards, data-room, ai-eval-summary, svi-trend, cohort-benchmark, cap-activity, growth-roadmap, growth-progress), LivingSVIDashboard. Shell: RecommendedNextStepTile (/api/nudge/next-steps, fallback src/lib/nav/next-step-recommender.ts 12-phase), OnboardingProgressBar (12 steps, src/lib/onboarding-steps.ts), UnlockPulseCard, TrialBanner, UpgradeBanner/Modal, ProductTour, FeatureSpotlight, UpgradePrompt, TrialCountdownBanner.
8. FIVE competing "what next" systems: RecommendedNextStepTile (12-phase), NextUnlockCard (phase gate), JourneyBar/JourneyStepLadder, OnboardingProgressBar, and on /dashboard/svi NextBestActionWidget + NextStepTile + ScnActionPlanCard. Two phase scales (0..5 vs 1..12; bridged founder-phase-shared.ts / workflow-steps.ts).

## Marketing header/footer
- src/components/landing/nav-v2.tsx MENU (max 7, e2e-tested): Get my score /analyze; Get funding (Grants, Programs by city, Do you need money?, Investor readiness, R&D Tax & ESIC); Free tools (16); Pricing; Demo (Atlassian, Sprocketbay, BlockID, Canva, Xero, SafetyCulture, All). CTA NEED_MONEY_CTA → /funding?intent=money; signed-in "My workspace" → /dashboard; USER_MENU_ITEMS: New analysis /score, My SVI score /dashboard/svi, My reports /workspace/reports, Dashboard /dashboard.
- Two headers (NavV2 dark on 62 pages; legacy site/navbar.tsx light on 51 pages incl. login/onboarding) and two footers (footer-columns.ts shared; site/footer.tsx adds Company column).

## Docs
- docs/plans/ux-ia-startup-flow-goal.md (G7 done), mega-2026-07-24/01-cmo-menu-ia.md, 02-cpo-onboarding.md, tier-menu-2026-07-24/01..04 + tier-boundary-matrix.md (NestedSidebar never mounted), role-based-2026-07-25/*, unlock-next-level-2026-07-31.md (G8), docs/user/menu-walkthrough.md (generated via scripts/docs/render-unlock-matrix.mjs), money-finder (G11 owns public nav), evaluator-traction (G12), mentor-console-2026-07-24/01-cpo-mentor-ia.md, atlassian-standard-mapping-goal.md (§16 PersonaRail/JourneySidebar v3 spec, in_progress, never mounted), reviews/a11y-mobile-audit-2026-09-11.md, qa-lead-audit-2026-09-14.md, feature-completeness-2026-09-13.md.

## Top confusions
1. Three nav architectures in code, one live (+ role-taxonomy duplicating role-menu-overlay).
2. /dashboard landing has no sidebar link; "SVI Score" = second dashboard.
3. /dashboard/* vs /workspace/* prefixes meaningless; duplicate pages with identical titles.
4. Roles group links to alias routes; /reseller/mentor twice.
5. Two onboarding wizards; no persona-aware landing.
6. Five next-step surfaces, two phase scales.
7. Report sprawl (8). 8. Six document-ish pages. 9. Two headers/footers, Demo ×3. 10. ~25 orphan pages.
