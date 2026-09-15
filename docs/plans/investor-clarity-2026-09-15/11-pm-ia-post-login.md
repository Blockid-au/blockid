> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G13 · goal doc [`../investor-clarity-2026-09-15.md`](../investor-clarity-2026-09-15.md). Workstream spec produced 2026-09-15 by the planning session (BA / PM / Product agents); corrections applied at merge are marked **[merge-fix]**.

# 11 — PM / UX plan: Menu simplification + post-login focus (brief item 3)

Date: 2026-09-15 · Owner: PM + UX lead · Inputs: 00-brief.md, 01-explore-investor.md, 02-explore-nav.md, code read-only (`web/src/components/workspace/nav-groups.ts`, `web/src/lib/nav/role-menu-overlay.ts`, `web/src/lib/roles/role-taxonomy.ts`, `web/src/lib/nav/founder-phase.ts`, `web/src/lib/nav/next-step-recommender.ts`, `web/src/app/(app)/(founder)/dashboard/page.tsx`, `web/tests/e2e/nav/menu-structure.spec.ts`, `web/next.config.ts`).

Scope: BOTH founder and evaluator (investor_angel / investor_vc / advisor / accelerator) groups. Reseller / mentor / innovator / admin shells are touched only where they duplicate founder nav.

House rules honoured: plan merges into SOURCE-OF-TRUTH (new G-entry "G13 IA-v4"), ROADMAP §4, roadmap-v2, GOALS.md; deploy per sprint via `web/scripts/deploy-live.sh`; each sprint ≤ 1 session then review → test → fix; no Docker/CI; DB migrations manual (this plan needs none except an optional `app_users.persona` backfill in S-IA4).

---

## 0. Diagnosis in one paragraph

The live sidebar (`nav-groups.ts`, 7 groups, 98 leaves + 8 admin) is a catalogue of every page ever shipped, not a navigation. A phase-0 founder sees Home (7) + Validate (13) = 20 items before scrolling, of which 9 are variants of "score / analysis / report". The `/dashboard/*` vs `/workspace/*` prefix carries no meaning; identical titles exist under both. Five "what next" surfaces and two phase scales compete on the same screen. Investors land on the founder dashboard because `ROLE_SPECS.landingHref` was never wired, and their sidebar is a founder sidebar with three groups hidden by label string. Three nav architectures exist in code, one is mounted. The fix is not a redesign of pages; it is (1) one persona-aware nav config with hubs + tabs, (2) redirects so nothing breaks, (3) one landing per persona with ≤ 5 blocks and ONE recommender, (4) deletion of the dead systems.

Principles (from `ui-ux-pro-max` §9 nav + `cpo-advisor` SCN rule):
- Hierarchy = task, not feature. Groups are verbs the founder is doing at their SCN stage; leaves are nouns.
- Progressive disclosure by phase stays (it works), but at the GROUP level only; leaf-level phase gates become tabs inside the hub that appear when relevant.
- Every old route keeps working (308 redirect or alias page). Merged pages become tabs inside one hub page with path segments (`/workspace/equity/cap-table`), so every tab is deep-linkable, testable and trackable.
- Sidebar ≤ 5 groups (founder) / ≤ 4 (evaluator); a group shows ≤ 6 leaves; no lifecycle chips ("beta") in the sidebar; tooltips carry the benefit.
- Account is not navigation. It moves to the avatar user menu + a single "Settings" footer link.

---

## A. TARGET IA

### A.1 Founder sidebar (4 groups + Settings footer; ≤ 6 leaves each)

Canonical prefix: `/workspace/*` for all authenticated pages. `/dashboard` is the ONLY `/dashboard` URL that survives (the landing). Every `/dashboard/<x>` page redirects to its `/workspace/*` hub tab.

| # | Group (EN / VI) | minPhase | Leaves at phase 0 | Leaves unlocked later (item minPhase) |
|---|---|---|---|---|
| G1 | **Home** / Trang chủ | 0 | Dashboard `/dashboard` · My startups `/workspace/projects` · Run analysis `/analyze` · Reports `/workspace/reports` | — |
| G2 | **Prove** / Chứng minh (tooltip: "Score, evidence and your plan") | 0 | Score `/workspace/score` · Evidence `/workspace/evidence` · Action plan `/workspace/plan` · Get investor-ready `/startup-package` | — |
| G3 | **Money** / Tiền | 0 | Grants & programs `/workspace/funding` · Investors `/workspace/investors` | Valuation `/workspace/valuation` (2) · Raise `/workspace/raise` (3) · Accelerators `/workspace/accelerators` (3) · Finance `/workspace/finance` (4) |
| G4 | **Company** / Công ty | 2 (whole group collapses into "Later phases" expander below phase 2) | — | Equity `/workspace/equity` (2) · ESOP `/workspace/esop` (2) · Team `/workspace/team` (2) · Strategy `/workspace/strategy` (1, but group gate wins) · Documents `/workspace/documents` (3) · Exit `/workspace/exit` (5) |
| footer | **Settings** `/workspace/settings` (single link, not a group) + avatar user menu (Profile, Billing, Settings, Help, Sign out) | — | — | — |

Phase-0 founder sees: 3 groups, 10 leaves (was 3 groups / 20+ leaves, plus 4 collapsed groups). Phase-5 founder sees: 4 groups, 20 leaves (was 7 groups / 98).

Hub pages and their tabs (path segments; hub root = first tab):

| Hub | Tabs (path → label) | Absorbs |
|---|---|---|
| `/workspace/score` | `/` Overview (LivingSVIDashboard + 8-dim chart) · `/history` History (runs + score history) · `/trend` Trend · `/benchmark` Benchmark · `/criteria` Criteria (13-criteria rubric) · `/listing` Public listing | /dashboard/svi, /dashboard/history, /workspace/analyses, /workspace/svi-trend, /dashboard/benchmark, /workspace/svi-benchmarks, /workspace/evaluation, /workspace/listings/new |
| `/workspace/evidence` | `/` Vault · `/gaps` Gaps (completeness, ordered by SVI impact) · `/connectors` Connectors (Stripe, GA4, GitHub, Xero, LinkedIn) · `/metrics` Metrics | /workspace/svi-evidence, /workspace/integrations, /dashboard/integrations, /workspace/metrics |
| `/workspace/plan` | `/` Action plan (12-phase growth plan; GrowthRoadmap + ScnDirectionNavigator + ScnActionPlanCard merged here) · `/guide/[step]` Guide · `/journal` Journal | /workspace/roadmap, /workspace/guide/*, /workspace/journal |
| `/workspace/reports` | `/` All reports (list of every generated artefact) · `/business` Business report (TBR) · `/investor-pack` Investor pack · `/weekly` Weekly · `/c-level` C-level · `/lp` LP slot | /workspace/business-report, /workspace/investor-pack, /dashboard/reports, /dashboard/c-level-reports, /workspace/lp-report, /workspace/reports/[id] (kept) |
| `/workspace/investors` | `/` Matches (investor-match T0251, moved off /workspace/funding) · `/pipeline` Pipeline (CRM kanban) · `/access` Access (who can see what: investor links, data-room access, advisor portal, mentor access) | /dashboard/investor-links, /dashboard/data-room, /dashboard/advisor, /dashboard/mentor-invite, /dashboard/settings/mentor-access |
| `/workspace/valuation` | `/` Valuation (5 methods) · `/cfo` CFO view · `/forecast` Forecast | /dashboard/valuation, /dashboard/cfo, /workspace/financial-forecast |
| `/workspace/raise` | `/` Readiness · `/round` Your round · `/deck` Deck check · `/term-sheet` Term sheet | /dashboard/fundraise, /workspace/fundraise, /workspace/pitchdeck-analyze, /workspace/term-sheet |
| `/workspace/accelerators` | `/` Tracker · `/criteria` Criteria | /dashboard/accelerator, /dashboard/accelerator-criteria |
| `/workspace/finance` | `/` P&L · `/revenue` Revenue · `/expenses` Expenses · `/invoices` Invoices · `/dividends` Dividends | /dashboard/finance, /workspace/revenue, /workspace/expenses, /workspace/tax-invoice-checker, /workspace/dividends |
| `/workspace/equity` | `/` Split · `/cap-table` Cap table · `/shareholders` Shareholders · `/setup` Setup wizard · `/secondary` Secondary · `/on-chain` On-chain (wallet + sync) | /workspace/equity-setup, /workspace/cap-table, /workspace/shareholders, /workspace/secondary-offer, /workspace/wallet, /workspace/equity-dashboard |
| `/workspace/esop` | `/` Setup · `/grants` Grants · `/vesting` Vesting · `/manage` Manage · `/offers` Offers | /workspace/esop/grants (kept), /workspace/vesting, /workspace/equity-esop, /dashboard/esop, /workspace/equity-offer |
| `/workspace/team` | `/` Plan · `/salaries` Salaries | /dashboard/team |
| `/workspace/strategy` | `/` Overview · `/market` Market · `/competitors` Competitors · `/tech` Tech scan · `/gtm` GTM · `/pricing` Pricing · `/roadmap` Product roadmap | /dashboard/market-size, /workspace/competitors, /workspace/competitive-positioning, /workspace/tech-analysis, /dashboard/analyzer, /workspace/gtm-strategy, /workspace/pricing-tiers, /workspace/roadmap-builder |
| `/workspace/documents` | `/` Files · `/data-room` Data room · `/compliance` Compliance (panel + calendar + ESIC check) | /workspace/data-room, /dashboard/compliance, /compliance/calendar, /workspace/esic-assessment |
| `/workspace/exit` | `/` Model · `/strategy` Strategy · `/benchmark` Benchmark · `/listing` Listing readiness · `/clean-room` Clean room | /workspace/exit-strategy, /dashboard/exit-readiness, /workspace/listing-readiness, /workspace/clean-room |
| `/workspace/settings` | `/` Account · `/profile` Profile · `/founder` Founder profile · `/notifications` Notifications · `/billing` → alias of `/workspace/billing` (route kept) · `/referrals` Referrals · `/feedback` Feedback · `/enterprise` Enterprise (branding, API keys, SSO, white-label, SVI API) · `/audit` Audit log | /workspace/profile, /workspace/founder-profile, /workspace/notifications, /workspace/referrals, /workspace/feedback, /workspace/branding, /workspace/api-keys, /workspace/sso, /workspace/white-label, /workspace/svi-api, /workspace/audit-log |
| `/workspace/projects` | `/` Active · `/archived` Archived (kept) · `/compare` Compare | /dashboard/portfolio |

Implementation shape (S-IA2): one `HubTabs` client component (`web/src/components/workspace/hub-tabs.tsx`, `role="tablist"`, keyboard arrows, `aria-current`) + a `layout.tsx` per hub that renders the tabs and `children`. Existing page components are MOVED, not rewritten: `web/src/app/(app)/(founder)/workspace/cap-table/page.tsx` → `web/src/app/(app)/(founder)/workspace/equity/cap-table/page.tsx`. Old routes become 308 redirects in `next.config.ts` (auth-only routes are `noindex`, so a permanent redirect has no SEO cost). Tabs a plan/phase does not unlock render as dimmed with a lock (same `minPlan` semantic as today) instead of disappearing (`ux: empty-nav-state`).

### A.2 Evaluator sidebar (investor_angel / investor_vc / advisor / accelerator) — ≤ 4 groups

| # | Group | investor_angel / investor_vc | advisor | accelerator |
|---|---|---|---|---|
| E1 | **Home** | Dashboard `/workspace/investor` · My evaluations `/workspace/evaluations` · Watchlist `/workspace/investor/watchlist` | Dashboard `/workspace/advisor` · Clients `/workspace/advisor/roster` · Notes `/workspace/advisor/notes` | Dashboard `/workspace/accelerator` · Cohort `/workspace/accelerator/cohort` · Applications `/workspace/accelerator/applications` |
| E2 | **Deal flow** | Deal flow `/workspace/investor/dealflow` · Startup Index `/startup-index` · Mandate `/workspace/investor/mandate` | Startup Index · Mandate (advisor "coverage") | Startup Index · Mandate (program criteria) |
| E3 | **Reports** | Reports `/workspace/investor/reports` (tabs: Trust reports · Digest · Portfolio [vc_small] · LP report [vc_small]) | Reports (Trust reports · Digest) | Reports (Trust reports · Quarterly · LP report [accel_growth]) |
| footer | Settings `/workspace/settings` + avatar menu | same | same |

No Fundraise group for evaluators (it is founder-only; today it leaks). No "Roles" group — the persona's own pages ARE the sidebar. Reseller/mentor keep their console shell (`/reseller/*`), but the duplicate `roles.reseller` + `roles.mentor` subgroups leave `NAV_GROUPS`; the reseller layout supplies its own groups (it already wraps WorkspaceLayout).

### A.3 OLD → NEW decision table (every leaf in `nav-groups.ts`)

Decision key: keep · rename · merge→X (page becomes tab X) · demote (leaves sidebar, reachable from hub/menu) · remove (nav entry only; page still redirects).

**Home (7)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| My Startups | /workspace/projects | rename "My startups" | Home |
| Archived | /workspace/projects/archived | demote → tab | Home › My startups › Archived |
| Portfolio (beta) | /dashboard/portfolio | merge→ /workspace/projects/compare, label "Compare" | Home › My startups |
| SVI Score | /dashboard/svi | merge→ /workspace/score (hub root), rename "Score" | Prove |
| Score History | /dashboard/history | merge→ /workspace/score/history | Prove › Score |
| New Analysis | /analyze | rename "Run analysis" | Home |
| Action Plan | /workspace/roadmap | rename "Action plan", route → /workspace/plan | Prove |

**Validate (13)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| Startup Package (beta) | /startup-package | rename "Get investor-ready", drop beta chip | Prove |
| Grant & Program Finder | /workspace/funding | rename "Grants & programs"; investor-match panel moves out to /workspace/investors | Money |
| Market Size | /dashboard/market-size | merge→ /workspace/strategy/market | Company › Strategy |
| Knowledge Base | /workspace/knowledge-base | demote → topbar Help menu "Guides" | Help menu |
| Your Analyses | /workspace/analyses | merge→ /workspace/score/history (runs list) | Prove › Score |
| Evaluation (13) | /workspace/evaluation | rename "Criteria", merge→ /workspace/score/criteria (resolves collision with /workspace/evaluations) | Prove › Score |
| Evidence Vault | /workspace/evidence | rename "Evidence" (hub root) | Prove |
| Evidence Completeness | /workspace/svi-evidence | rename "Gaps", merge→ /workspace/evidence/gaps | Prove › Evidence |
| Business Report (TBR) | /workspace/business-report | merge→ /workspace/reports/business, label "Business report" | Home › Reports |
| SVI Trend | /workspace/svi-trend | merge→ /workspace/score/trend | Prove › Score |
| Metrics | /workspace/metrics | merge→ /workspace/evidence/metrics | Prove › Evidence |
| Weekly Reports | /workspace/reports | rename "Reports" = hub root; weekly list at /workspace/reports/weekly | Home |

**Build (17)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| Equity Setup | /workspace/equity-setup | merge→ /workspace/equity/setup | Company › Equity |
| Equity Split | /workspace/equity | keep as hub root, label "Equity" | Company |
| Cap Table | /workspace/cap-table | merge→ /workspace/equity/cap-table | Company › Equity |
| Shareholders | /workspace/shareholders | merge→ /workspace/equity/shareholders | Company › Equity |
| ESOP Setup (add-on) | /workspace/esop | keep as hub root, label "ESOP"; add-on pill stays on the tab, not the sidebar | Company |
| Vesting (add-on) | /workspace/vesting | merge→ /workspace/esop/vesting | Company › ESOP |
| ESOP Manage | /workspace/equity-esop | merge→ /workspace/esop/manage | Company › ESOP |
| Equity Offer | /workspace/equity-offer | merge→ /workspace/esop/offers | Company › ESOP |
| Wallet | /workspace/wallet | merge→ /workspace/equity/on-chain | Company › Equity |
| Blockchain Sync | /workspace/equity-dashboard | merge→ /workspace/equity/on-chain (same tab) | Company › Equity |
| Competitors | /workspace/competitors | merge→ /workspace/strategy/competitors (+ absorbs /workspace/competitive-positioning) | Company › Strategy |
| Tech Analysis | /workspace/tech-analysis | merge→ /workspace/strategy/tech | Company › Strategy |
| Code & Web Analyzer (beta) | /dashboard/analyzer | merge→ /workspace/strategy/tech (second panel "Scan code & web") | Company › Strategy |
| GTM Strategy | /workspace/gtm-strategy | merge→ /workspace/strategy/gtm | Company › Strategy |
| Pricing Tiers | /workspace/pricing-tiers | merge→ /workspace/strategy/pricing | Company › Strategy |
| Roadmap | /workspace/roadmap-builder | rename "Product roadmap", merge→ /workspace/strategy/roadmap | Company › Strategy |
| Team Planner | /workspace/team | keep as hub root, label "Team" | Company |

**Fundraise (17)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| VC Valuation | /dashboard/valuation | rename "Valuation", route → /workspace/valuation | Money |
| CFO Advisor | /dashboard/cfo | merge→ /workspace/valuation/cfo, label "CFO view" | Money › Valuation |
| Finance P&L (beta) | /dashboard/finance | merge→ /workspace/finance (hub root "P&L") | Money › Finance |
| ESOP Manager | /dashboard/esop | remove (duplicate) → redirect /workspace/esop/manage | Company › ESOP |
| Team & Salaries (beta) | /dashboard/team | merge→ /workspace/team/salaries | Company › Team |
| Data Room | /workspace/data-room | merge→ /workspace/documents/data-room | Company › Documents |
| Documents | /workspace/documents | keep as hub root | Company |
| ESIC Self-Assessment | /workspace/esic-assessment | merge→ /workspace/documents/compliance (ESIC section, anchor `#esic`) | Company › Documents |
| Compliance Panel | /dashboard/compliance | merge→ /workspace/documents/compliance | Company › Documents |
| Compliance Calendar | /compliance/calendar | merge→ /workspace/documents/compliance (`#calendar`); `/compliance/*` shell removed | Company › Documents |
| Accelerator Tracker (beta) | /dashboard/accelerator | rename "Accelerators", route → /workspace/accelerators | Money |
| Accelerator Criteria (beta) | /dashboard/accelerator-criteria | merge→ /workspace/accelerators/criteria | Money › Accelerators |
| Financial Forecast | /workspace/financial-forecast | merge→ /workspace/valuation/forecast | Money › Valuation |
| Fundraise Readiness | /dashboard/fundraise | rename "Raise", route → /workspace/raise (hub root "Readiness") | Money |
| Raise Capital | /workspace/fundraise | merge→ /workspace/raise/round, label "Your round" | Money › Raise |
| Investor CRM | /workspace/investors | rename "Investors" (hub: Matches · Pipeline · Access) | Money |

**Scale & Exit (10)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| Revenue | /workspace/revenue | merge→ /workspace/finance/revenue | Money › Finance |
| Expenses | /workspace/expenses | merge→ /workspace/finance/expenses | Money › Finance |
| Tax Invoice Checker | /workspace/tax-invoice-checker | rename "Invoices", merge→ /workspace/finance/invoices | Money › Finance |
| Growth Journal | /workspace/journal | rename "Journal", merge→ /workspace/plan/journal | Prove › Action plan |
| Dividends | /workspace/dividends | merge→ /workspace/finance/dividends | Money › Finance |
| Exit Modeling | /workspace/exit | keep as hub root, label "Exit" | Company |
| Exit Strategy Builder | /workspace/exit-strategy | merge→ /workspace/exit/strategy | Company › Exit |
| Exit Benchmark | /dashboard/exit-readiness | merge→ /workspace/exit/benchmark | Company › Exit |
| Listing Readiness | /workspace/listing-readiness | merge→ /workspace/exit/listing | Company › Exit |
| Clean-Room Prep | /workspace/clean-room | merge→ /workspace/exit/clean-room, label "Clean room" | Company › Exit |

**Roles (23)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| Startups I'm evaluating | /workspace/evaluations | rename "My evaluations"; route kept (claim tokens, G12 emails) | Evaluator Home |
| Deal Flow (alias) | /workspace/deal-flow | link the real page /workspace/investor/dealflow | Deal flow |
| Watchlist (alias) | /workspace/watchlist | link real /workspace/investor/watchlist | Evaluator Home |
| Portfolio (alias, vc_small) | /workspace/portfolio | link real /workspace/investor/portfolio; becomes tab Reports › Portfolio | Reports |
| Preferences (alias) | /workspace/investor-preferences | rename "Mandate", route → /workspace/investor/mandate (preferences page renamed; BA taxonomy feeds it) | Deal flow |
| Client Roster (alias) | /workspace/client-roster | rename "Clients", route → /workspace/advisor/roster | Advisor Home |
| Notes (alias) | /workspace/advisor-notes | route → /workspace/advisor/notes | Advisor Home |
| Weekly Digest | /workspace/weekly-digest | merge→ /workspace/investor/reports/digest (shared reports hub, persona-filtered) | Reports |
| Cohort (alias) | /workspace/cohort | route → /workspace/accelerator/cohort | Accelerator Home |
| Applications | /workspace/applications | route → /workspace/accelerator/applications | Accelerator Home |
| LP Report (accel_growth) | /workspace/lp-report | merge→ /workspace/investor/reports/lp (founder LP slot composer stays at /workspace/reports/lp) | Reports |
| Reseller › Dashboard/Customers/Codes/Credits/Requests/Reports/Settings | /reseller/* | keep, but REMOVE from `NAV_GROUPS`; reseller layout owns its groups (`web/src/app/(app)/reseller/layout.tsx`) | Reseller console |
| Reseller › Mentor | /reseller/mentor | remove (duplicate of Mentor › Roster); dashboard card links to it | — |
| Mentor › Roster / Check-in Inbox / Reports Feed / Cohort View | /reseller/mentor, ?filter=overdue, ?tab=reports, /cohort | keep as the Mentor console group (rendered by reseller layout only when mentor entitlement) | Mentor console |

**Account (15)**

| Label (old) | Old route | Decision | New group / route |
|---|---|---|---|
| My Profile | /workspace/profile | merge→ /workspace/settings/profile; also in avatar menu | Settings |
| Account settings | /workspace/settings | keep as hub root "Settings" (footer link) | Settings |
| Founder Profile (beta) | /workspace/founder-profile | merge→ /workspace/settings/founder | Settings |
| Notifications | /workspace/notifications | merge→ /workspace/settings/notifications; bell icon deep-links here | Settings |
| Referrals | /workspace/referrals | merge→ /workspace/settings/referrals | Settings |
| Feedback & Credits | /workspace/feedback | rename "Feedback", merge→ /workspace/settings/feedback; credits live on Billing | Settings |
| Billing | /workspace/billing | keep route (Stripe return URLs, upgrade links); shown in avatar menu + Settings tab | Settings |
| Integrations | /workspace/integrations | merge→ /workspace/evidence/connectors (integrations ARE evidence sources) | Prove › Evidence |
| Custom Branding | /workspace/branding | merge→ /workspace/settings/enterprise | Settings |
| Advisor Portal | /dashboard/advisor | merge→ /workspace/investors/access ("who can see what") | Money › Investors |
| API Keys | /workspace/api-keys | merge→ /workspace/settings/enterprise | Settings |
| SSO | /workspace/sso | merge→ /workspace/settings/enterprise | Settings |
| White-label | /workspace/white-label | merge→ /workspace/settings/enterprise | Settings |

**Admin (8)** — unchanged this plan (admin shell is separate). One fix: `admin-layout.tsx` links to founder `/workspace/equity*` pages must follow the redirects (no code change needed once redirects exist).

**Orphans (no sidebar entry today) — where they land**

| Old route | New home |
|---|---|
| /dashboard (landing) | stays; gets a Home › Dashboard sidebar link |
| /dashboard/benchmark, /workspace/svi-benchmarks | /workspace/score/benchmark |
| /dashboard/c-level-reports | /workspace/reports/c-level |
| /dashboard/reports | /workspace/reports |
| /dashboard/data-room, /dashboard/investor-links, /dashboard/mentor-invite, /dashboard/settings/mentor-access | /workspace/investors/access |
| /dashboard/integrations | /workspace/evidence/connectors |
| /workspace/investor-pack | /workspace/reports/investor-pack |
| /workspace/pitchdeck-analyze | /workspace/raise/deck |
| /workspace/term-sheet | /workspace/raise/term-sheet |
| /workspace/secondary-offer | /workspace/equity/secondary |
| /workspace/svi-api | /workspace/settings/enterprise#api |
| /workspace/audit-log | /workspace/settings/audit |
| /workspace/competitive-positioning | /workspace/strategy/competitors |
| /workspace/listings/new | /workspace/score/listing |
| /workspace/guide/* | /workspace/plan/guide/* |
| /workspace/accelerator, /workspace/accelerator/* | accelerator persona Home (unchanged paths) |
| /workspace/advisor, /workspace/advisor/* | advisor persona Home |
| /workspace/investor (hub) | investor persona landing (rebuilt, §C) |
| /workspace/lp-report | founder: /workspace/reports/lp; accelerator: /workspace/investor/reports/lp |

### A.4 Public route collisions

| Today | Decision |
|---|---|
| `/investor` (public landing for investors) vs `/investors` (pitch to invest IN BlockID) | `/investors` → 301 `/about/invest` ("Invest in BlockID"); update sitemap, JSON-LD (Auschain PTY LTD entity), footer link. `/investor` stays the persona landing. CMO signs off before S-IA5 ships. |
| `/workspace/evaluation` vs `/workspace/evaluations` | founder rubric → `/workspace/score/criteria` (308); `/workspace/evaluations` unchanged |
| "Portfolio" ×2 | founder page renamed "Compare" (`/workspace/projects/compare`); investor keeps "Portfolio" |

### A.5 Redirect list (add to `web/next.config.ts` `redirects()`, all `permanent: true` except the two marked temp)

```
/dashboard/svi                     → /workspace/score
/dashboard/history                 → /workspace/score/history
/workspace/analyses                → /workspace/score/history
/workspace/svi-trend               → /workspace/score/trend
/dashboard/benchmark               → /workspace/score/benchmark
/workspace/svi-benchmarks          → /workspace/score/benchmark
/workspace/evaluation              → /workspace/score/criteria
/workspace/listings/new            → /workspace/score/listing
/workspace/svi-evidence            → /workspace/evidence/gaps
/workspace/integrations            → /workspace/evidence/connectors
/dashboard/integrations            → /workspace/evidence/connectors
/workspace/metrics                 → /workspace/evidence/metrics
/workspace/roadmap                 → /workspace/plan
/workspace/guide/:path*            → /workspace/plan/guide/:path*
/workspace/journal                 → /workspace/plan/journal
/workspace/business-report         → /workspace/reports/business
/workspace/investor-pack           → /workspace/reports/investor-pack
/dashboard/reports                 → /workspace/reports
/dashboard/c-level-reports         → /workspace/reports/c-level
/workspace/lp-report               → /workspace/reports/lp        (founder; evaluator handled by alias page)
/dashboard/investor-links          → /workspace/investors/access
/dashboard/data-room               → /workspace/investors/access
/dashboard/advisor                 → /workspace/investors/access
/dashboard/mentor-invite           → /workspace/investors/access
/dashboard/settings/mentor-access  → /workspace/investors/access
/dashboard/valuation               → /workspace/valuation
/dashboard/cfo                     → /workspace/valuation/cfo
/workspace/financial-forecast      → /workspace/valuation/forecast
/dashboard/fundraise               → /workspace/raise
/workspace/fundraise               → /workspace/raise/round
/workspace/pitchdeck-analyze       → /workspace/raise/deck
/workspace/term-sheet              → /workspace/raise/term-sheet
/dashboard/accelerator             → /workspace/accelerators
/dashboard/accelerator-criteria    → /workspace/accelerators/criteria
/dashboard/finance                 → /workspace/finance
/workspace/revenue                 → /workspace/finance/revenue
/workspace/expenses                → /workspace/finance/expenses
/workspace/tax-invoice-checker     → /workspace/finance/invoices
/workspace/dividends               → /workspace/finance/dividends
/workspace/equity-setup            → /workspace/equity/setup
/workspace/cap-table               → /workspace/equity/cap-table
/workspace/shareholders            → /workspace/equity/shareholders
/workspace/secondary-offer         → /workspace/equity/secondary
/workspace/wallet                  → /workspace/equity/on-chain
/workspace/equity-dashboard        → /workspace/equity/on-chain
/workspace/vesting                 → /workspace/esop/vesting
/workspace/equity-esop             → /workspace/esop/manage
/dashboard/esop                    → /workspace/esop/manage
/workspace/equity-offer            → /workspace/esop/offers
/dashboard/team                    → /workspace/team/salaries
/dashboard/market-size             → /workspace/strategy/market
/workspace/competitors             → /workspace/strategy/competitors
/workspace/competitive-positioning → /workspace/strategy/competitors
/workspace/tech-analysis           → /workspace/strategy/tech
/dashboard/analyzer                → /workspace/strategy/tech
/workspace/gtm-strategy            → /workspace/strategy/gtm
/workspace/pricing-tiers           → /workspace/strategy/pricing
/workspace/roadmap-builder         → /workspace/strategy/roadmap
/workspace/data-room               → /workspace/documents/data-room
/dashboard/compliance              → /workspace/documents/compliance
/compliance/calendar               → /workspace/documents/compliance
/workspace/esic-assessment         → /workspace/documents/compliance
/workspace/exit-strategy           → /workspace/exit/strategy
/dashboard/exit-readiness          → /workspace/exit/benchmark
/workspace/listing-readiness       → /workspace/exit/listing
/workspace/clean-room              → /workspace/exit/clean-room
/dashboard/portfolio               → /workspace/projects/compare
/workspace/profile                 → /workspace/settings/profile
/workspace/founder-profile         → /workspace/settings/founder
/workspace/notifications           → /workspace/settings/notifications
/workspace/referrals               → /workspace/settings/referrals
/workspace/feedback                → /workspace/settings/feedback
/workspace/branding                → /workspace/settings/enterprise
/workspace/api-keys                → /workspace/settings/enterprise
/workspace/sso                     → /workspace/settings/enterprise
/workspace/white-label             → /workspace/settings/enterprise
/workspace/svi-api                 → /workspace/settings/enterprise
/workspace/audit-log               → /workspace/settings/audit
/workspace/deal-flow               → /workspace/investor/dealflow
/workspace/watchlist               → /workspace/investor/watchlist
/workspace/portfolio               → /workspace/investor/portfolio
/workspace/investor-preferences    → /workspace/investor/mandate
/workspace/investor/preferences    → /workspace/investor/mandate
/workspace/client-roster           → /workspace/advisor/roster
/workspace/advisor-notes           → /workspace/advisor/notes
/workspace/weekly-digest           → /workspace/investor/reports/digest
/workspace/cohort                  → /workspace/accelerator/cohort
/workspace/applications            → /workspace/accelerator/applications
/workspace/investor/digest         → /workspace/investor/reports/digest
/dashboard/onboarding              → /onboarding                    (temp 307 until S-IA4 ships, then permanent)
/investors                         → /about/invest                  (public 301; S-IA5, after CMO sign-off)
```

Existing redirect-only alias pages under `(app)` (`/workspace/portfolio`, `/watchlist`, `/deal-flow`, `/investor-preferences`, `/advisor-notes`, `/client-roster`, `/cohort`, `/dashboard/onboarding`, `/workspace/reports/upgrade`) are deleted once the config redirects land (config redirects run before routing, so the page files are dead weight). Routes that must NOT move: `/workspace/billing` (Stripe return), `/workspace/evaluations` (claim tokens), `/workspace/reports/[id]` (email links), `/analyze`, `/startup-package`, `/reseller/*`, `/innovator/*`, `/admin/*`, `/tbr/[token]`, `/reports/[ticker]`.

---

## B. FOUNDER POST-LOGIN

### B.1 One landing, five blocks, ordered by benefit

Route: `/dashboard` (`web/src/app/(app)/(founder)/dashboard/page.tsx`, currently 1248 lines with ~30 conditional surfaces). Rebuilt as a thin server page that resolves scope + phase + latest analysis and renders exactly five blocks in a 12-col grid (blocks 1–2 full width on mobile, 2-up on desktop; 3–5 in a 3-up row that stacks). Nothing else above the fold except the persona hero line ("Good morning, {name} · {startup}") and a project switcher (already in topbar).

| # | Block | Component (new file) | Data | Primary action (one CTA) |
|---|---|---|---|---|
| 1 | **Where you stand** | `web/src/components/dashboard/landing/where-you-stand.tsx` | latest SVI, Δ vs previous snapshot, cohort percentile, growth phase label (12-phase), 8-dim mini radar (reuse `SviDimensionChart`) | "See full score" → /workspace/score |
| 2 | **Next best action** | `web/src/components/dashboard/landing/next-best-action.tsx` | ONE recommendation from `/api/nudge/next-steps` with pure fallback `recommendNextStep()` (`web/src/lib/nav/next-step-recommender.ts`); shows label, reason (benefit + expected SVI Δ where known), CTA, optional secondary line (Money Finder nudge phases 1–3, already modelled as `secondary`) | the recommendation's `ctaLabel` |
| 3 | **Money on the table** | `web/src/components/dashboard/landing/money-on-the-table.tsx` | `MoneyRadarTile` data (grants matched, programs open, investors matching, A$ total addressable) | "See matches" → /workspace/funding (grants) / /workspace/investors (investors) |
| 4 | **Evidence to add** | `web/src/components/dashboard/landing/evidence-to-add.tsx` | top 3 evidence gaps ordered by SVI impact (from `svi-evidence` completeness model + `NextUnlockCard` blocker logic); each row = gap · dimension · "+N pts" | "Add evidence" → /workspace/evidence/gaps |
| 5 | **Your reports** | `web/src/components/dashboard/landing/your-reports.tsx` | last 3 artefacts across TBR / investor pack / weekly (the `recentReports` query already in page.tsx), plus "Generate business report" when none | "Open reports" → /workspace/reports |

Retired from the landing (moved or deleted, see B.2): JourneyBar, JourneyStepLadder, ScnPositionHero (its "Where am I" copy folds into block 1), ValueImpactBanner (moves to /workspace/score overview), NextUnlockCard, the project card (topbar switcher covers it), the 14-widget `WidgetGrid` (`web/src/lib/dashboard/widget-ids.ts`) and `LivingSVIDashboard` (both move to /workspace/score where they belong). Banners: keep ONE slot above block 1 for the highest-priority system message (trial countdown > checkout success > sandbox AUP), never stacked.

### B.2 One recommender — components to delete or merge

Keep: `web/src/lib/nav/next-step-recommender.ts` (pure 12-phase map, already unit-tested, already has segment overrides + Money Finder secondary line) and `/api/nudge/next-steps` as the single engine. New `NextBestActionCard` consumes them.

| Component | File | Decision |
|---|---|---|
| RecommendedNextStepTile (sidebar) | `web/src/components/workspace/recommended-next-step-tile.tsx` (+ test) | DELETE — logic is the recommender; UI moves to landing block 2. Sidebar top becomes empty (cleaner). |
| NextUnlockCard | `web/src/components/dashboard/next-unlock-card.tsx` (+ test) | MERGE — its blocker list (`NEXT_UNLOCK_START_HERE`, phase-gate progress) becomes the data source of block 4 "Evidence to add"; component deleted. |
| JourneyBar | `web/src/components/dashboard/journey-bar.tsx` | DELETE — phase is a pill in block 1. |
| JourneyStepLadder | `web/src/components/dashboard/journey-step-ladder.tsx` (+ test) | MOVE to /workspace/plan (Action plan hub root) as the plan's spine; deleted from landing. e2e `menu-structure.spec.ts:115` ("dashboard renders the 12-phase journey step ladder") re-targets /workspace/plan. |
| OnboardingProgressBar | `web/src/components/workspace/onboarding-progress-bar.tsx` (12 steps, `web/src/lib/onboarding-steps.ts`) | MERGE into the onboarding checklist inside the single wizard (B.3); dead link `/workspace/market-size` disappears with it. Deleted from shell. |
| NextBestActionWidget | `web/src/components/dashboard/next-best-action-widget.tsx` | DELETE (lived on /dashboard/svi, which redirects). |
| NextStepTile | `web/src/components/dashboard/next-step-tile.tsx` (+ test) | DELETE. |
| ScnActionPlanCard | `web/src/components/dashboard/scn-action-plan-card.tsx` | MOVE to /workspace/plan (it is the plan). |
| ScnDirectionNavigator ("guide-next" widget) | `web/src/components/dashboard/scn-direction-navigator.tsx` | MOVE to /workspace/plan. |
| UnlockPulseCard (sidebar) | `web/src/components/workspace/…` | DELETE — unlock signal shows as a lock icon on the dimmed tab. |
| GrowthRoadmap, GrowthProgressDashboard widgets | `web/src/components/dashboard/…` | MOVE to /workspace/plan. |
| QuickActionsList | dashboard | DELETE — block 2 + sidebar cover it. |

Result: one recommender engine, one surface on the landing, one plan page. Recommender contract change: `RecommendedNextStep` gains `impact?: { sviDelta?: number; moneyAud?: number }` so block 2 can state the benefit ("+6 SVI pts", "A$45k grant closes 30 Sep").

### B.3 Single onboarding wizard

Merge `/onboarding` (6 steps: segment → goal → tier → trial → payment → first startup) and `/dashboard/onboarding` (WelcomeWizard, 3 steps, hard-coded role founder, exits to /analyze) into ONE `/onboarding` (`web/src/app/(app)/onboarding/page.tsx`, outside `(founder)` so evaluators reach it too). Pricing/trial/payment steps are removed from the wizard: value first, paywall after first value (`cro-advisor`: activation before monetisation; Stripe trial already card-required on the pricing page).

| Step | Founder | Evaluator (angel / VC / advisor / accelerator) |
|---|---|---|
| 1 Who are you | persona pick (founder / investor / advisor / accelerator / other) — writes `app_users.account_type` | same screen |
| 2 Your startup / your mandate | startup name + website + one-line description (creates project) | sectors · stages · geos (AU states) · cheque band · min SVI — the BA taxonomy form (`InvestorPreferences` schema already in `web/src/lib/investor-portal.ts`) |
| 3 First value | "Run your first analysis" → /analyze (intake prefilled) | "Add the first startup you're evaluating" → /workspace/evaluations?add=1 (or pick from Startup Index) |

Exit: `/dashboard?onboarding=complete` for founders (welcome modal stays), `/workspace/investor?onboarding=complete` for evaluators. The 12-step `onboarding-steps.ts` checklist survives only as a collapsible "Setup checklist" inside block 2 for the first 14 days (dismissable), not as a permanent bar. Gate logic in `dashboard/page.tsx:418-437` (svi_analyses + intake counts) moves into a shared `needsOnboarding(user, scope)` helper in `web/src/lib/onboarding/needs-onboarding.ts` used by /dashboard and /workspace/investor.

### B.4 Empty states (every block must render something useful with zero data)

| Block | Empty state copy (EN) | CTA |
|---|---|---|
| 1 Where you stand | "No score yet. A free analysis takes 3 minutes and gives you a baseline on 8 dimensions." | Run analysis → /analyze |
| 2 Next best action | Recommender phase 0 already returns "Run your 8-dimension SVI evaluation" — re-pointed to /analyze (not /workspace/score/criteria, which needs a score first) | Start |
| 3 Money on the table | "Tell us your industry and state to match 56 grants and 199 programs." (if project lacks industry/state) | Complete profile → /onboarding?step=2 |
| 4 Evidence to add | "Connect one source (Stripe, GA4, GitHub, Xero, LinkedIn) or upload a document — evidence lifts your score fastest." | Connect → /workspace/evidence/connectors |
| 5 Your reports | "Your first Business Report is free (10 pages). It is what investors and evaluators read first." | Generate → /workspace/reports/business |

Member (non-owner) view: blocks 1, 4, 5 read-only; block 2 shows the owner's next action with "ask {owner}" copy; block 3 hidden (`ViewOnlyNote` pattern kept).

### B.5 Phase scale — canonical decision

Canonical = the 12 growth phases `GrowthPhaseId` in `web/src/lib/growth/phase-taxonomy.ts` (`GROWTH_PHASE_ORDER`, `GROWTH_PHASE_LABELS`). Rationale: it is what the founder sees in reports (13 criteria × 12 phases, brief item 4), what `projects.growth_phase_current` persists, and what the recommender map is keyed on.

- The 0..5 "nav phase" (`web/src/lib/nav/founder-phase-shared.ts`) stays as a DERIVED, INTERNAL band used only to collapse sidebar groups; it is never displayed as a number and never persisted. `resolveFounderNavPhase()` keeps its max(SVI band, growth phase) rule.
- The numeric `PHASE_LABELS` 1..12 in `web/src/lib/showcase/gallery.ts` is unified with `GROWTH_PHASE_ORDER` (one lookup, gallery imports from phase-taxonomy). `workflow-steps.ts` (6-bucket `growthPhase` on nav leaves) is deleted; leaves declare `minPhase` (0..5 band) only, and hubs declare tab-level `minPhase` the same way.
- UI copy always shows the phase LABEL ("Seed — traction proof"), never "Phase 7/12".

---

## C. INVESTOR / EVALUATOR POST-LOGIN

### C.1 Landing route and component

- Universal post-login URL stays `/dashboard` (login, magic-link, Google, register all point there today). `dashboard/page.tsx` gains a persona branch at the top: `if (isEvaluatorPersona(user.accountType)) redirect(PERSONAS[persona].landingHref)`. This is where `ROLE_SPECS.landingHref` finally gets wired — but through the new `web/src/lib/nav/persona.ts` (see C.3), not `role-taxonomy.ts`.
- Investor landing = `/workspace/investor` (existing hub route, rebuilt). Component `web/src/components/investor/investor-landing.tsx` (server) with four blocks; advisor and accelerator reuse the same component with persona props at `/workspace/advisor` and `/workspace/accelerator` (existing hub routes). Long-term the pages move into the empty `(investor)` route group; not in this plan (path unchanged, so it can happen later with zero redirects).

| # | Block | Data | Empty state | CTA |
|---|---|---|---|---|
| 1 **Startups I'm evaluating** | count, avg SVI, "movers this week" (top ±Δ from `evaluator_progress_sends` / `svi_index_snapshots`), consent state summary | "Add your first startup — paste a website or pick from the Startup Index." | Add startup → /workspace/evaluations?add=1 |
| 2 **Deal flow matching my mandate** | top 5 from `getDealFlow()` filtered by mandate (needs BA taxonomy + the W6 join fix in `web/src/lib/investor-portal.ts`) with sector · stage · state · SVI · fit % | if mandate empty → block 4 takes this slot | See all → /workspace/investor/dealflow |
| 3 **Reports quota / trial** | `report-quota.ts` (used / monthly cap), trial state (`trial-report-banner.tsx` logic), credits balance, plan name | "1 free Trust BizReport on trial" | Buy report → /workspace/evaluations (report dialog) or Upgrade → /pricing?tab=evaluator |
| 4 **Set your mandate** (only while mandate empty or < 3 fields) | mandate completeness | — | Set mandate → /workspace/investor/mandate |

Advisor variant: block 1 = "Clients" (roster), block 2 = "Client movers", block 3 quota, block 4 mandate ("coverage"). Accelerator variant: block 1 = "Cohort", block 2 = "Applications to review", block 3 quota + LP report status, block 4 program criteria.

### C.2 Renames / collisions (from A.4)

- `/workspace/evaluation` → `/workspace/score/criteria` ("Criteria"). `/workspace/evaluations` label "My evaluations".
- `/investors` → `/about/invest`; `/investor` remains "For investors".
- Founder "Portfolio" → "Compare"; investor "Portfolio" unchanged.
- `/workspace/investor/preferences` → `/workspace/investor/mandate` ("Mandate"); API `/api/investor/preferences` unchanged (server contract), UI copy "full preferences form ships in a follow-up release" removed when the BA taxonomy form lands.

### C.3 Replace `ROLE_SPECS` + `role-menu-overlay` with one persona table

New `web/src/lib/nav/persona.ts`:

```ts
export type PersonaKey = "founder" | "investor_angel" | "investor_vc" | "advisor" | "accelerator" | "reseller" | "mentor" | "innovator" | "journalist" | "admin";
export interface Persona { key; label; landingHref; navGroups: NavGroupId[]; tourSlug; onboardingFlow: "founder" | "evaluator" | "none" }
export const PERSONAS: Record<PersonaKey, Persona>
export function resolvePersona(user): PersonaKey   // account_type + role=admin + reseller entitlement
```

Consumers: `dashboard/page.tsx` (redirect), `auth/login` next-resolver, `WorkspaceLayout` (group filter = `persona.navGroups` — replaces `hiddenGroups` by label), `feature-tours.ts` (tourSlug), onboarding wizard (flow). `NAV_GROUPS[].segments` is kept for leaf-level gating; group-level visibility comes from persona. Deleted: `web/src/lib/roles/role-taxonomy.ts` (`ROLE_SPECS`, `menuGroupIds`), `web/src/lib/nav/role-menu-overlay.ts` (+ tests), `nav-schema.ts`, `filter-nav-for-user.ts`, `nested-sidebar.tsx`, `nav/journey-sidebar*.ts(x)`, `nav/persona-rail*.ts(x)`, `workflow-steps.ts`.

---

## D. GUIDANCE COPY

### D.1 Label rules (enforced by a unit test over `NAV_GROUPS`, `web/src/components/workspace/nav-groups.test.ts`)

1. Leaf labels ≤ 3 words, sentence case, no parentheses, no acronyms the founder did not choose (no "(13)", no "TBR" in the sidebar — "Business report" with tooltip "Trusted Business Report").
2. Group labels are one word, verb or place: Home · Prove · Money · Company / Home · Deal flow · Reports.
3. No lifecycle chips ("beta", "new") in the sidebar. Lifecycle shows as a small tag inside the page header only.
4. No two leaves share a label within a persona; no leaf label equals its group label (Equity › Equity was the old pattern; hub root tab carries the group's noun instead).
5. Tooltip (`title` + `aria-description`) = the benefit, ≤ 12 words: "Score — your SVI, trend and where you rank in your cohort".
6. Lock/upgrade state names the plan in the tooltip ("Starter plan unlocks this"), never a generic "Upgrade".
7. Route slug = label slug (kebab); no synonyms across route/label (`/raise` ↔ "Raise").
8. VI translations live next to EN in the same catalogue entry (`label: { en, vi }`), rendered by the existing locale switch; VI labels follow the same ≤ 3-word rule where Vietnamese allows.

### D.2 Misleading labels → replacements (EN / VI)

| Current | Why misleading | New EN | New VI |
|---|---|---|---|
| SVI Score (second dashboard) | reads like the landing; duplicates /dashboard | Score | Điểm SVI |
| Score History + Your Analyses | two lists of the same runs | History | Lịch sử |
| New Analysis | noun, not action | Run analysis | Chạy phân tích |
| Action Plan (page titled "Growth Roadmap") vs Roadmap (builder) | two roadmaps | Action plan / Product roadmap | Kế hoạch hành động / Lộ trình sản phẩm |
| Portfolio (beta) [founder] | collides with investor Portfolio | Compare | So sánh startup |
| Evaluation (13) | founder rubric, collides with "evaluations" | Criteria | Tiêu chí |
| Startups I'm evaluating | 3+ words, sentence in a menu | My evaluations | Đánh giá của tôi |
| Evidence Vault / Evidence Completeness | "vault" is jargon; "completeness" is a metric, not a task | Evidence / Gaps | Bằng chứng / Thiếu bằng chứng |
| Business Report (TBR) | acronym | Business report | Báo cáo doanh nghiệp |
| Weekly Reports | only one of six report types | Reports | Báo cáo |
| Grant & Program Finder | 4 words, tool-ish | Grants & programs | Tài trợ & chương trình |
| Fundraise Readiness / Raise Capital | two doors to one round | Raise (tabs Readiness · Your round) | Gọi vốn |
| Investor CRM | jargon | Investors | Nhà đầu tư |
| VC Valuation | scares pre-seed founders; it is all 5 methods | Valuation | Định giá |
| CFO Advisor | sounds like a person to book | CFO view | Góc nhìn CFO |
| Finance P&L | half-acronym | P&L (tab under Finance) | Lãi lỗ |
| ESOP Setup / ESOP Manage / ESOP Manager | three ESOPs | ESOP (tabs) | ESOP |
| Equity Setup / Equity Split | two equities | Equity (tabs Split · Setup) | Cổ phần |
| Team Planner / Team & Salaries | two teams | Team (tabs Plan · Salaries) | Đội ngũ |
| Data Room / Documents | same drawer | Documents (tab Data room) | Tài liệu |
| Compliance Panel / Compliance Calendar / ESIC Self-Assessment | three compliance doors | Compliance | Tuân thủ |
| Accelerator Tracker / Accelerator Criteria | tool names | Accelerators | Vườn ươm |
| Code & Web Analyzer | vague | Tech scan | Quét công nghệ |
| Blockchain Sync / Wallet | implementation detail | On-chain | Trên chuỗi |
| Exit Modeling / Exit Strategy Builder / Exit Benchmark | three exits | Exit (tabs) | Thoái vốn |
| Clean-Room Prep | jargon | Clean room | Phòng sạch dữ liệu |
| Tax Invoice Checker | tool name | Invoices | Hoá đơn |
| Growth Journal | vague | Journal | Nhật ký |
| Preferences [investor] | says nothing about deals | Mandate | Khẩu vị đầu tư |
| Client Roster | jargon | Clients | Khách hàng |
| Advisor Portal (under Enterprise) | it is founder-grants-access, not a portal | Access | Quyền truy cập |
| Feedback & Credits | two things | Feedback | Góp ý |
| Custom Branding / White-label / SSO / API Keys | four enterprise doors | Enterprise | Doanh nghiệp |
| Knowledge Base | not a task; lives in Help | Guides (help menu) | Hướng dẫn |
| Get Investor-Ready › Startup Package | nested one-item subgroup | Get investor-ready | Sẵn sàng gọi vốn |
| Market Size | tool name | Market | Thị trường |
| Validate / Build / Fundraise / Scale & Exit (groups) | lifecycle words that hide the task; a phase-4 founder still "validates" | Prove / Company / Money | Chứng minh / Công ty / Tiền |
| Roles (group) | meaningless to the user | (removed; persona groups have their own names) | — |
| "Demo · Live" topbar + Demo menu + showcase entry | three demo doors | one "Demo" in the marketing header only | Bản demo |

### D.3 Tooltip copy (benefit-first, EN only here; VI mirrored in catalogue)

Home › Dashboard "Where you stand and what to do next" · Run analysis "Score your startup on 8 dimensions in 3 minutes" · Reports "Everything investors and evaluators read about you" · Score "Your SVI, trend and cohort rank" · Evidence "Add proof — the fastest way to lift your score" · Action plan "Your 12-phase plan, one step at a time" · Get investor-ready "Guided pack: score → data room → cap table (A$149)" · Grants & programs "56 grants and 199 programs matched to you" · Investors "Matched investors, your pipeline and who can see what" · Valuation "Five methods in AUD, 500+ AU comparables" · Raise "Readiness check, your round, deck and term sheet" · Accelerators "Track applications and criteria" · Finance "Revenue, costs, invoices, dividends" · Equity "Split, cap table, shareholders, on-chain" · ESOP "Plans, grants, vesting, offers" · Team "Hiring plan and AU salary benchmarks" · Strategy "Market, competitors, tech, GTM, pricing, roadmap" · Documents "Files, data room and compliance" · Exit "Model, strategy, benchmark, listing readiness".

---

## E. EXECUTION PLAN

Cadence per house rule: each sprint ≤ 1 session, deploy immediately via `web/scripts/deploy-live.sh` (gate 11 hydrated smoke runs automatically), then review → `npm run qa:live` → fix before the next sprint. Every sprint is behind `feature-gate` flag `nav.ia_v4` for one deploy so rollback is a flag flip, then the flag is removed the following sprint.

Prioritisation (WSJF, job size in sessions): S-IA1 (value 9 + time-crit 8 + risk-red 8) / 1 = 25 · S-IA3 21 · S-IA2 15 · S-IA4 14 · S-IA5 9. Order below follows dependency, which matches WSJF except S-IA2 before S-IA3 (hubs must exist before the landing links to them).

### S-IA1 — Nav config v4 + redirects + delete dead nav systems

Files touched:
- `web/src/components/workspace/nav-groups.ts` — rewrite catalogue to §A.1/A.2 (groups: home, prove, money, company; evaluator: home, dealflow, reports; admin unchanged). Leaves gain `{ label: { en, vi }, tooltip: { en, vi }, minPhase }`; drop `lifecycle`, `growthPhase`, `journeyGroup`, `persona`, `minTier` alias.
- `web/src/lib/nav/persona.ts` — NEW (§C.3).
- `web/src/components/workspace/workspace-layout.tsx` — group filter by `persona.navGroups`; remove RecommendedNextStepTile, UnlockPulseCard, OnboardingProgressBar mounts; add Settings footer link; avatar menu items (Profile, Billing, Settings, Help › Guides, Sign out); GA4 `nav_click`.
- `web/next.config.ts` — redirects §A.5 (except the two deferred).
- DELETE: `web/src/lib/roles/role-taxonomy.ts`, `web/src/lib/nav/role-menu-overlay.ts` (+ tests), `web/src/components/workspace/nested-sidebar.tsx`, `web/src/lib/nav/nav-schema.ts`, `web/src/lib/nav/filter-nav-for-user.ts`, `web/src/components/nav/journey-sidebar*.{ts,tsx}`, `web/src/components/nav/persona-rail*.{ts,tsx}`, `web/src/lib/nav/workflow-steps.ts`, the 9 redirect-only alias page files.
- `web/src/lib/product-tour/feature-tours.ts` — read `PERSONAS[key].tourSlug`; update step selectors that target sidebar labels.
- `web/src/app/(app)/reseller/layout.tsx` — supply reseller + mentor groups locally.
- `web/src/app/(app)/admin/…/admin-layout.tsx` — no change (links follow redirects).
- `web/src/lib/analytics.ts` — add `nav_click: { group; item; href; persona; phase }` to the EventMap (event-name-limit + ga4-event-audit tests validate).
- `docs/user/menu-walkthrough.md` regenerated via `node scripts/docs/render-unlock-matrix.mjs` (its `--check` mode would fail the deploy gate otherwise); `web/scripts/docs/unlock-matrix.mts` updated for the new catalogue shape.

Tests: `web/tests/e2e/nav/menu-structure.spec.ts` — first-group assertion `/overview/i` → `/home/i` (note: the current assertion already mismatches the live label "Home", so this test is either skipped on the box or failing; fix regardless); phase-gating consistency test keeps working (group labels compared across pages); add "founder phase-0 sidebar has ≤ 10 links" and "investor sidebar has ≤ 3 groups and no Fundraise". `web/tests/e2e/nav/menu-progressive-disclosure.spec.ts` — update labels. `nav-groups.test.ts` — label rules §D.1 + "every old href in the previous catalogue snapshot resolves via redirects()" (snapshot the old href list into the test fixture). Redirect smoke: add a table-driven test in `web/tests/e2e/smoke/post-deploy.spec.ts` that HEADs every old route and expects 3xx to the mapped target. `npm run qa:live` after deploy.

Metrics: `nav_click` baseline; founder phase-0 visible link count 10 (was 20+); e2e nav suite green.

Rollback: revert the commit (catalogue is data; redirects are additive and harmless to keep). Flag `nav.ia_v4` off restores the old catalogue for one deploy window (keep `nav-groups.legacy.ts` for that window only).

### S-IA2 — Reports hub + Documents hub + all other hub tabs

Files touched: `web/src/components/workspace/hub-tabs.tsx` (NEW); per hub a `layout.tsx` under `web/src/app/(app)/(founder)/workspace/{score,evidence,plan,reports,investors,valuation,raise,accelerators,finance,equity,esop,team,strategy,documents,exit,settings,projects}/`; page files MOVED (git mv) per §A.1; `web/src/components/workspace/business-report-client.tsx` untouched (rendered inside `/workspace/reports/business`); `/workspace/reports/page.tsx` becomes the "All reports" list (union of weekly, TBR, investor pack, C-level, LP with type chips); `/workspace/investors/page.tsx` gets the Matches tab (move the investor-match panel out of `/workspace/funding`); `/workspace/investors/access` composes investor-links + data-room access + advisor portal + mentor access forms; `/workspace/documents/compliance` composes panel + calendar + ESIC.

Tests: hydrated smoke (`web/tests/e2e/smoke/post-deploy.spec.ts`) — add one hydrated assertion per hub root ("tablist visible, first tab selected"); `menu-structure.spec.ts` tab keyboard nav (ArrowRight moves `aria-selected`); `tests/e2e/regression` for TBR and investor pack generation paths at their new URLs; `qa:live` lanes for reports + data-room (the live suite provisions its own account).

Metrics: `landing_block_click` not yet; page-level `% sessions reaching a report` (GA4 page_view on `/workspace/reports/*` ÷ sessions) baseline vs prior 14 days; `report_unlock_click.page` values updated to new paths.

Rollback: hubs are additive; old routes redirect, so rollback = revert the move commit (redirects then point at pages that exist again). No data change.

### S-IA3 — Founder landing consolidation + single recommender

Files touched: `web/src/app/(app)/(founder)/dashboard/page.tsx` (rewrite to ~250 lines: scope + phase + 5 data loaders in `Promise.all` + 5 blocks); NEW `web/src/components/dashboard/landing/{where-you-stand,next-best-action,money-on-the-table,evidence-to-add,your-reports}.tsx` + `landing-grid.tsx`; `web/src/lib/nav/next-step-recommender.ts` (add `impact`, phase-0 href → /analyze); `/api/nudge/next-steps` route (return `impact`); `web/src/lib/dashboard/widget-ids.ts` + `WidgetGrid` + `LivingSVIDashboard` mounts move to `/workspace/score/page.tsx`; JourneyStepLadder, ScnActionPlanCard, ScnDirectionNavigator, GrowthRoadmap, GrowthProgressDashboard mount on `/workspace/plan/page.tsx`; DELETE per §B.2 table; `web/src/lib/analytics.ts` add `landing_viewed: { persona; blocks; empty_blocks }` and `landing_block_click: { block; action; persona }`.

Tests: `dashboard/page.test.tsx` rewrite (5 blocks render; empty states; member view); `next-step-recommender.test.ts` (impact + phase-0 href); `menu-structure.spec.ts:115` ladder test re-targets `/workspace/plan`; hydrated smoke: `/dashboard` block 2 CTA visible and clickable; `qa:live` founder lane.

Metrics: **time-to-first-action after login** = `login_*_success` → first `landing_block_click | nav_click` (GA4 funnel; target median < 20 s, p75 < 60 s); `landing_block_click` share by block (expect block 2 > 40 %); dashboard LCP < 2.5 s (fewer mounts); support "where is X" tickets via `/workspace/settings/feedback` category `cant-find` (target −50 % over 30 days).

Rollback: keep the old page as `page.legacy.tsx` behind `nav.ia_v4` for one deploy; flag off restores it.

### S-IA4 — Investor landing + onboarding merge

Files touched: `web/src/components/investor/investor-landing.tsx` (NEW, 4 blocks §C.1, persona props); `web/src/app/(app)/(founder)/workspace/{investor,advisor,accelerator}/page.tsx` (render it); `web/src/app/(app)/(founder)/dashboard/page.tsx` (persona redirect); `web/src/app/(app)/onboarding/page.tsx` (single wizard, 3 steps × 2 flows) + `web/src/lib/onboarding/needs-onboarding.ts`; DELETE `web/src/app/(app)/(founder)/dashboard/onboarding/` and `web/src/components/workspace/onboarding-progress-bar.tsx`; `web/src/lib/onboarding-steps.ts` reduced to the 14-day checklist; `/workspace/investor/mandate` page (rename of preferences; structured form using the BA taxonomy — if the taxonomy ships later, the form uses the existing `InvestorPreferences` enums and swaps sector options when the taxonomy lands); `web/src/lib/investor-portal.ts` W6 join fix (email → account_id) so block 2 is non-empty; `google-login.ts`, `auth/verify/route.ts`, `login-form.tsx` → resolve `next` through `PERSONAS`; redirect `/dashboard/onboarding → /onboarding` made permanent. Optional migration: none required (`app_users.account_type` already carries persona; the "virtual" mentor/innovator roles remain in-memory as today).

Tests: `web/tests/e2e/journeys/01-signup-trial.spec.ts` (wizard now 3 steps, no tier step — update selectors); NEW `tests/e2e/nav/investor-landing.spec.ts` (login as seeded evaluator → lands on /workspace/investor, sees 4 blocks, sidebar ≤ 3 groups, no Fundraise); `qa:live` evaluator lane (seed via `scripts/seed-test-users.mjs`); `evaluations` regression (claim token flow unchanged).

Metrics: evaluator time-to-first-action (login → `landing_block_click`), mandate completion rate (block 4 CTA → mandate saved; target > 60 % of new evaluators in 7 days), Trust BizReport purchases per evaluator session (G12 KPI), onboarding completion rate by persona (`onboarding_step` events, add to EventMap).

Rollback: persona redirect is one `if`; flag off sends evaluators back to /dashboard (old behaviour). Wizard: keep `/onboarding` old 6-step file as `page.legacy.tsx` one deploy.

### S-IA5 — Marketing header/footer dedupe + user menu + public rename

Files touched: `web/src/components/landing/nav-v2.tsx` becomes the ONLY header (mount it in the 51 pages using `web/src/components/site/navbar.tsx`, incl. login/onboarding with a `variant="light"` prop); DELETE `site/navbar.tsx`; `web/src/components/site/footer.tsx` deleted, `footer-columns.ts` gains the Company column, one `Footer` component; `USER_MENU_ITEMS` in nav-v2 → New analysis /analyze (drop /score hop), My score /workspace/score, My reports /workspace/reports, Dashboard /dashboard (or persona landing), Settings, Sign out — same list as the workspace avatar menu (shared `web/src/lib/nav/user-menu.ts`); one "Demo" entry (marketing header only; remove "Demo · Live" from the workspace topbar and FeatureSpotlight's third entry); `/investors → /about/invest` 301 + `web/src/app/about/invest/page.tsx` (moved), sitemap, JSON-LD org (Auschain), footer link; docs `docs/user/menu-walkthrough.md` regenerated.

Tests: `menu-structure.spec.ts` (max 7 top items, Demo reachable, funding dropdown — unchanged assertions, now on every public page: add login + docs pages to the loop); `web/tests/e2e/a11y` header landmark uniqueness (exactly one `<header>` + one `<footer>`); `smoke/public-hash-csp.spec.ts` unchanged; SEO check `/investors` 301 + canonical on `/about/invest`; `seo-audit` skill run post-deploy.

Metrics: header CTA CTR (`plan_cta_clicked`, `lead_form_submitted.source`), bounce on login page (one header = consistent), `nav_click` from user menu.

Rollback: header swap is component-level; revert commit. The 301 stays (safe) unless CMO objects, in which case swap to 302 first.

### Cross-sprint definition of done
- `npm run test` (unit) + `npm run test:e2e tests/e2e/nav tests/e2e/smoke` green locally on :4001 before deploy; `deploy-live.sh` gate 11 green; `npm run qa:live` green post-deploy; `render-unlock-matrix.mjs --check` clean; no console errors on /dashboard, /workspace/investor for guest → login → landing (the S32 guest-401 fix pattern).
- SOURCE-OF-TRUTH G13 row updated with sprint status; milestone report in `web/content/reports/`.

### Risk list

| # | Risk | P | I | Mitigation / owner |
|---|---|---|---|---|
| R1 | Deep links in emails and crons (`investor-weekly-digest`, `evaluator-progress-weekly`, `watchlist-digest`, `investor-followups`, weekly report mails) point at old `/dashboard/*` or alias routes | 5 | 3 | Redirects cover all; grep `href=` in `web/src/lib/email*`, `web/src/lib/cron*` in S-IA1 and rewrite to new paths anyway (avoid double hop); table-driven redirect test |
| R2 | Product tours (`feature-tours.ts`) + `docs/user/menu-walkthrough.md` + screenshot-tour pipeline (`tour-capture.mjs` against localhost:4001) reference sidebar labels/routes | 5 | 3 | Update selectors in S-IA1; re-run `screenshot-tour` skill after S-IA3 and S-IA4; regenerate walkthrough doc each sprint |
| R3 | SEO on public rename `/investors` | 2 | 3 | 301 + canonical + sitemap; CMO sign-off; deferred to S-IA5 |
| R4 | `next.config.ts` redirect volume (~95 new) slows edge routing / hits Vercel-style limits — N/A on self-hosted standalone, but middleware matchers (`(app)` auth gate) must include the new `/workspace/*` tab paths | 2 | 4 | They are already under `/workspace/*`; add `/onboarding` to the auth matcher explicitly |
| R5 | GA4 page-path continuity breaks historical reports (`/dashboard/svi` → `/workspace/score`) | 4 | 2 | Keep `PageTracker page="…"` names stable (they are logical names, not paths); document the cut date in the analytics skill notes |
| R6 | Stripe return URLs / pricing links to `/workspace/billing`, `/workspace/reports/upgrade` | 3 | 4 | `/workspace/billing` route is NOT moved; `/workspace/reports/upgrade` already redirects to /pricing — keep |
| R7 | Founder confusion during transition (labels changed) | 4 | 2 | One-time "We simplified the menu" toast with a link to the walkthrough; old label searchable in the command palette (`nav-groups` keeps `aliases: string[]` per leaf for search) |
| R8 | Reseller layout wraps `WorkspaceLayout` with phase 0 and relies on `roles.reseller` in `NAV_GROUPS` | 4 | 3 | Reseller groups move into the reseller layout in S-IA1; `tests/e2e/reseller` suite runs |
| R9 | `menu-structure.spec.ts` fixtures skip when QA founder not seeded → false green | 3 | 3 | Run `scripts/seed-test-users.mjs` in the deploy gate; make the persona-landing test fail (not skip) when the fixture is missing on the production box |
| R10 | Deleting 5 next-step components removes behaviour some pages import (`ScnPositionHero` test, `next-unlock-card.test`) | 3 | 2 | `tsc` build catches imports; move-not-delete for anything still imported outside the landing |
| R11 | Evaluator block 2 empty because deal-flow join is broken (W6) | 5 | 3 | Fix the join in S-IA4 (small); until then block 4 (mandate) takes the slot, never a blank card |
| R12 | Two phase scales still leak via `showcase/gallery.ts PHASE_LABELS` | 3 | 2 | Unify to `GROWTH_PHASE_ORDER` in S-IA3; unit test asserts a single source |

---

## Executive summary (10 lines)

1. The founder sidebar shrinks from 7 groups / 98 leaves to 4 groups (Home · Prove · Money · Company) with 10 leaves at phase 0; Account moves to the avatar menu + one Settings link.
2. Evaluators (angel / VC / advisor / accelerator) get their own 3-group sidebar (Home · Deal flow · Reports) and a persona-aware landing at `/workspace/investor|advisor|accelerator`; the founder Fundraise leak stops.
3. 17 hub pages with path-segment tabs absorb ~75 duplicate or orphan pages (8 report surfaces → one Reports hub; 4 document pages → Documents; 5 funding pages → Money; 3 roadmaps → Action plan + Product roadmap; 3 ESOP subgroups → ESOP; 3 exits → Exit).
4. Every old route keeps working through ~95 permanent redirects in `next.config.ts`; `/workspace/billing`, `/workspace/evaluations`, `/analyze`, `/startup-package` never move.
5. Collisions resolved by rename: `/workspace/evaluation` → Score › Criteria; founder "Portfolio" → "Compare"; investor Preferences → Mandate; public `/investors` → `/about/invest`.
6. `/dashboard` becomes five blocks in benefit order — Where you stand · Next best action · Money on the table · Evidence to add · Your reports — each with a defined empty state and one CTA.
7. One recommender survives (`next-step-recommender.ts` + `/api/nudge/next-steps`); RecommendedNextStepTile, NextUnlockCard, JourneyBar, JourneyStepLadder (moved to Action plan), OnboardingProgressBar, NextBestActionWidget, NextStepTile, ScnActionPlanCard (moved) and UnlockPulseCard leave the landing.
8. Canonical phase scale = the 12 `GrowthPhaseId`s; the 0..5 band stays internal for sidebar collapsing only; one onboarding wizard (3 steps, founder or evaluator flow) replaces two.
9. Three dead nav architectures (`nested-sidebar`, `journey-sidebar`/`persona-rail`, `role-taxonomy` + `role-menu-overlay`) are deleted and replaced by one `persona.ts` table that finally wires the landing href.
10. Five sprints (S-IA1 nav+redirects → S-IA2 hubs → S-IA3 founder landing → S-IA4 investor landing+onboarding → S-IA5 one header/footer + public rename), each ≤ 1 session, flag-gated for one deploy, measured by `nav_click`, `landing_block_click`, time-to-first-action after login, % sessions reaching a report, and "can't find" feedback tickets.
