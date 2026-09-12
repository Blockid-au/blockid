# Architecture — BlockID.au (living)

**Version:** v3.12.1  ·  **Last reviewed:** 2026-09-11T16:00:02.024Z

## Summary
BlockID.au — AI-powered startup valuation SaaS for AU founders (pre-seed → Series A). Next.js 16 standalone + Supabase + zero-downtime port-swap deploys. Multi-model AI engine (Claude Sonnet 4.6, Groq, Cerebras, SambaNova, OpenRouter fallback). C-Level AI agents (cto/cfo/cpo/cmo/cro/clo/chro/ciso/cdo/coo/rnd) self-research and self-upgrade domain modules under src/lib/agents/. CEO implementing-plan loop + daily cron pipeline (34+ jobs) ship continuous improvements off-peak (AEST 22:00-06:00). SCN model (Validation→Position→Value→Direction→Capital) drives the full product flow.

## Change notes
- v3.12.0 — CTO: Update Essential Eight Vulnerabilities to reflect ACSC alerts
- v3.11.0 — CMO: Evaluator Progress Radar digest: extend watchlist-digest to evaluator-owned projects, merge G11 Money Radar signals (grant deadlines, program intakes) for tracked startups
- v3.11.0 — IR: Growth extras: investor reverse-match (getDealFlow inverted), per-grant application_prompts drafts, quarterly expert analysis refresh
- v3.11.0 — CPO: MoneyRadarTile (5 states) on /dashboard + /workspace/funding tabs + lib/funding/copy.ts messaging keys + VI review
- v3.11.0 — CRO: Founder Radar packaging: plans.csv flags money_radar/grant_finder (Starter, Growth, Package), pricing matrix row, A$3→subscribe upsell card, GA4 radar_upsell_*
- v3.11.0 — CMO: Radar drips radar_t30/t14/t3 + weekly digest money block (founder-digest-weekly) + events via recommendConferences({source}) + svi_trend_alert writer
- v3.11.0 — CTO: funding_matches + api/cron/money-radar-sweep + notification kinds (grant_deadline, program_intake, event_match, weekly_next_step, new_matches, analysis_refresh) + bell repoint + money_radar email category + /api/funding/calendar.ics
- v3.11.0 — CPO: /funding/report/[id] (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + lib/dataroom/save-deliverable.ts + /workspace/funding + nav leaf validate.discover + recommender secondary money lane
- v3.9.0 — CFO: Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator
- v3.9.0 — CFO: Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator
- v3.8.0 — CFO: Implement Cap Table Dilution & Round Sizing Simulator
- v3.7.0 — CMO: Create Competitor Feature Release Tracker module
- v3.5.0 — Code & Website Analyzer: deterministic PTD sub-score 0-100 from GitHub signals (commits, tests, CI, license, README) + website signals (HTTPS, TTFB, Lighthouse/heuristic perf/SEO/a11y). Valuation adjuster -10/0/+5/+12%. Full dashboard UI with arc gauge, bar chart, rationale items. analyzer_runs table migrated. Added to Build→Strategy nav.
- v3.4.0 — Visual upgrade: dashboard health-score-widget (2-col, glow gauge, valuation estimate, action cards), value-impact-banner (SVI delta, AUD gain, readiness %, milestones). Lifecycle email templates fully rebranded (navy header, stat grid, SVI progress bars). PDF cover page: 3-stat row. Auth UX: login shows already-signed-in card; LogoutButton broadcasts SIGNED_OUT to all tabs; SIGNED_IN broadcast after Google/password/magic-link login. Stripe credit-reset cron bug fixed (grantCredits instead of raw insert). v2 SKU audit extended.
- v3.1.0 — CFO: Implement R&D Tax Incentive & ESIC Valuation Modifier
- v3.0.0 — CPO: Implement First‑Principles Question Engine to generate Socratic prompts and route founders to appropriate BlockID features
- v3.0.0 — CFO: Integrate VC valuation methods library (VC Method, DCF, comparables, Berkus, Scorecard, Risk‑Factor Summation) with formulae and usage guidance
- v3.0.0 — RND: Develop Conversion/CTA experiment ideas & A/B test hypotheses for startup tooling
- v3.0.0 — RND: Conversion/CTA experiment ideas & A/B test hypotheses
- v3.0.0 — CSO: Pricing & segment A/B test infra (/admin/pricing-test)
