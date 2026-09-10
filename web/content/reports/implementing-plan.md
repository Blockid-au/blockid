# Implementing Plan — BlockID.au

**Version:** v3.10.0  ·  **Updated:** 2026-09-10T13:10:52.620Z  ·  **Decided by:** ceo (2026-09-10T12:04:03.482Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0254 | CMO | AU startup percentile/positioning model integration | minor | ⬜ pending |
| T0214 | CTO | AI provider chain audit — Codex subscription expired + ai-token-guardian Codex refresh broken | patch | ⬜ pending |
| T0216 | CTO | Fix orchestrator stageUpdateArtifacts — agent commit match closes pending tasks prematurely | patch | ⬜ pending |
| T0129 | CTO | Add Security Benchmark Compliance module (Essential Eight, OWASP) to CI pipeline with automated scans and reporting | minor | ⬜ pending |
| T0165 | CFO | Implement Multi-Method Valuation Engine | minor | ⬜ pending |
| T0166 | CFO | Build TAM/SAM/SOM Calculation Framework | minor | ⬜ pending |
| T0171 | RND | Add a new AI insight provider (e.g., GPT‑4o) to the AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0172 | CFO | Integrate VC valuation methods and sector ARR/revenue multiples into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0174 | RND | Integrate new AI tools and capabilities for founder narrative generation and startup ecosystem analysis | minor | ⬜ pending |
| T0177 | RND | Deploy Founder Pain‑Point Insight Service (API) | minor | ⬜ pending |
| T0179 | CFO | Build Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0181 | CFO | Implement Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0182 | CRO | Develop Next-Best-Action/DIRECTION engine for SCN layer sequencing | major | ⬜ pending |
| T0183 | CISO | Integrate ACSC Essential Eight Compliance Scanner | minor | ⬜ pending |
| T0184 | RND | Deploy Founder Pain-Point Insight Service (API) | minor | ⬜ pending |
| T0187 | RND | Deploy Founder Pain-Point Insight API | minor | ⬜ pending |
| T0188 | CFO | Implement Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0190 | CLO | Integrate Privacy Act and ASIC Guidance Compliance Module | minor | ⬜ pending |
| T0191 | CFO | Build Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0192 | CMO | Implement Startup Percentile/Positioning Model | minor | ⬜ pending |
| T0199 | RND | Add GPT-4o to AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0258 | CTO | First-Principles Redesign | minor | ⬜ pending |
| T0259 | CLO | SCN Report + PDF Redesign | major | ⬜ pending |
| T0260 | CRO | Implement VC Method Valuation & Pricing Strategy | minor | ⬜ pending |
| T0261 | CTO | Update Essential Eight Vulnerabilities to reflect ACSC alerts | minor | ⬜ pending |
| T0262 | CFO | Refine Startup Valuation Engine for PitchBook benchmark comparison | minor | ⬜ pending |
| T0263 | CRO | ACSC alerts integration | patch | ⬜ pending |
| T0265 | CRO | CISA alerts integration | patch | ⬜ pending |
| T0240 | CFO | lib/agents/grant-advisor.ts — matchGrants/matchPrograms/buildTimeline (pure) + narrative via callAI with llm-auditor; reuses estimateRdti/evaluateEsic; colocated tests | minor | 🔄 in_progress |
| T0242 | CRO | /funding landing + 3-question intake + POST /api/funding/preview + A$3 guest SKU FUNDING_REPORT_3AUD + webhook scope funding_report + POST /api/funding/report (credits grant_match / flag grant_finder) | minor | ⬜ pending |
| T0243 | CTO | lib/funding/fetch-source.ts + api/cron/refresh-funding-sources (GrantConnect RSS, Qld CKAN, state portals) + crontab line + goal-tree research topics + gitignored review queue | minor | ⬜ pending |
| T0244 | CPO | /funding/report/[id] (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + lib/dataroom/save-deliverable.ts + /workspace/funding + nav leaf validate.discover + recommender secondary money lane | minor | ⬜ pending |
| T0245 | CTO | funding_matches + api/cron/money-radar-sweep + notification kinds (grant_deadline, program_intake, event_match, weekly_next_step, new_matches, analysis_refresh) + bell repoint + money_radar email category + /api/funding/calendar.ics | minor | ⬜ pending |
| T0246 | CMO | Radar drips radar_t30/t14/t3 + weekly digest money block (founder-digest-weekly) + events via recommendConferences({source}) + svi_trend_alert writer | minor | ⬜ pending |
| T0247 | CRO | Founder Radar packaging: plans.csv flags money_radar/grant_finder (Starter, Growth, Package), pricing matrix row, A$3→subscribe upsell card, GA4 radar_upsell_* | minor | ⬜ pending |
| T0248 | CPO | MoneyRadarTile (5 states) on /dashboard + /workspace/funding tabs + lib/funding/copy.ts messaging keys + VI review | minor | ⬜ pending |
| T0249 | CMO | /pricing matrix row, insight cross-links, AnalyticsEventMap funding_* events, sync-stripe-pricing credit-pack drift fix, /features card, docs | patch | ⬜ pending |
| T0250 | CMO | Hero one-liners: lib/marketing/hero-variants.ts (F1/F2/F3 arms) + GA4 hero_variant + hero-section + layout SITE_DESCRIPTION + messages hero.* (EN/VI) + 5-second test protocol | patch | 🔄 in_progress |
| T0251 | IR | Growth extras: investor reverse-match (getDealFlow inverted), per-grant application_prompts drafts, quarterly expert analysis refresh | minor | ⬜ pending |
| T0270 | CTO | S3 Evaluations object: "Startups I am evaluating" — POST /api/evaluations (owner_kind evaluator, attribution, invite-the-founder magic link, consent tiers) + migrations for investor_portfolio, watchlist_digest, advisor_client_roster, engagement_notes, advisor_notes, advisor_portal, evaluations | minor | ⬜ pending |
| T0271 | CFO | In-workspace Trust BizReport purchase for evaluators: POST /api/evaluations/[id]/report (3 credits or plan quota) + re-score A$1 + PDF/TBR token | minor | ⬜ pending |
| T0272 | CPO | Program batch scoring: queue N startups off-peak, cohort table + CSV, sponsor/LP report export (extend /api/reports/quarterly), custom rubric weights | minor | ⬜ pending |
| T0273 | CMO | Evaluator Progress Radar digest: extend watchlist-digest to evaluator-owned projects, merge G11 Money Radar signals (grant deadlines, program intakes) for tracked startups | minor | ⬜ pending |
| T0274 | CMO | S1/S4 Solutions + comparison: real /solutions/advisor (Firm A$149) + /for/advisor 301, /solutions/investor|accelerator rewrite (6 differentiators), /investors + /docs stale pricing copy removed, "BlockID vs ChatGPT vs a valuer" page (S4), evaluator messaging EN/VI, GA4 evaluator funnel, contact form reads ?plan= + Telegram | patch | 🔄 in_progress |

## Recently shipped
- ✅ `T0275` **CLO** — S1 Compliance: one privacy policy (/legal/privacy canonical, /privacy 301), AI provider list = actual chain (groq/cerebras/sambanova/deepinfra/anthropic/openrouter/ollama), approved data sentence (no training claim either way), general-advice disclaimer on evaluator reports, doctoral-research sentence, PPL Food PTY LTD entity (`95b7033ef`)
- ✅ `T0269` **CTO** — S1 Evaluator signup: account_type enum + DB CHECKs (investor, accelerator, incubator, advisor, service_provider→advisor segment), app_users.segment set from account_type, trial_days from plan, card-required 7-day Stripe trial on Scout/Firm/Program, trial-end-reminder copy fixed, evaluator TrialBanner copy (`dcd9e5603`)
- ✅ `T0268` **CRO** — S1 Evaluator ladder public: plans.csv flags → gate vocabulary (investor.dealflow, watchlist, portfolio, lp_export, advisor_portal, advisor.cohort, white_label, accelerator.cohort, lp_report, api.access), profiles 25/50/200, reports_per_month 10/30/100, public:true, 2-tab /pricing (Founder/Evaluator), A$5.50 SKU re-priced in place to A$3 Trust BizReport, tier-visibility snapshot regenerated (`af0e05644`)
- ✅ `T0241` **CMO** — Public SEO directories /funding/grants, /funding/programs/[city] + JSON-LD + sitemap (server-rendered from au_* tables) (`181bc4ce2`)
- ✅ `T0239` **CTO** — Migration 0308_au_funding.sql (au_grants, au_programs, funding_reports, project_grant_profiles, public-read RLS) + web/scripts/seed-au-funding.mjs + /admin/funding review page (`d5669457d`)
- ✅ `T0238` **CPO** — Public nav → 5 items + "Do you need money?" CTA; shared lib/nav/public-menu.ts; NavV2 useAuthUser; legacy navbar mirrors; footer Funding column; unlock-preview strip (`862d5b85e`)
- ✅ `T0237` **CTO** — S0 hygiene: re-id orchestrator ID collisions, nextTaskId max+1, TaskStatus merged, stagePlan content select, self-upgrade priority list [T0249,T0250,T0274] + T-id rule, migration 0309_sync_b2b_plan_rows (DB plans = csv), legal entity → PPL Food PTY LTD site-wide, ROADMAP/deploy header drift (`59abcac77`)
- ✅ `T0193` **CFO** — Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator (`557222041`)
- ✅ `T0180` **CFO** — Implement Cap Table Dilution & Round Sizing Simulator (`a4aa14f01`)
- ✅ `T0178` **CFO** — Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator (`557222041`)

## Milestones
- **M020** v3.9.0 — CFO: Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator; CFO: Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator (2026-08-31, 2 tasks)
- **M019** v3.8.1 — CFO: Sector-Specific Revenue Multiple Library (2026-08-30, 1 tasks)
- **M018** v3.8.0 — CFO: Implement Cap Table Dilution & Round Sizing Simulator (2026-08-29, 1 tasks)
- **M017** v3.7.0 — CMO: Create Competitor Feature Release Tracker module (2026-08-28, 1 tasks)
- **M016** v3.1.0 — CFO: Implement R&D Tax Incentive & ESIC Valuation Modifier (2026-07-22, 1 tasks)
- **M015** v3.0.0 — RND: Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics); CLO: Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link; CFO: Fundraising Readiness Report v2 — checklis (2026-07-20, 9 tasks)
- **M014** v2.7.0 — CFO: R&D Tax Incentive and ESIC data integration (2026-07-19, 1 tasks)
- **M013** v2.6.0 — CFO: Integrate sector ARR/revenue multiples for valuation benchmarking (2026-07-18, 1 tasks)
- **M020** v2.2.0 — T0102-T0110 Batch 9: ESOP scoring engine, governance API, knowledge base API, SVI roadmap widget, ESOP checklist SEO tool, data room readiness API (2026-06-14, 7 tasks)
- **M019** v2.1.0 — T0094–T0101 ESOP + SVI + Data Room + Knowledge Base — investor-ready documents, ESOP Manager UI live (2026-06-14, 8 tasks)
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M017** v1.9.0 — T0084 — C-Level blended valuation engine + BlockID self-analysis financial model (2026-06-13, 1 tasks)
