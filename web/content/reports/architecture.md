# Architecture — BlockID.au (living)

**Version:** v3.7.0  ·  **Last reviewed:** 2026-08-28T12:05:16.963Z

## Summary
BlockID.au — AI-powered startup valuation SaaS for AU founders (pre-seed → Series A). Next.js 16 standalone + Supabase + zero-downtime port-swap deploys. Multi-model AI engine (Claude Sonnet 4.6, Groq, Cerebras, SambaNova, OpenRouter fallback). C-Level AI agents (cto/cfo/cpo/cmo/cro/clo/chro/ciso/cdo/coo/rnd) self-research and self-upgrade domain modules under src/lib/agents/. CEO implementing-plan loop + daily cron pipeline (34+ jobs) ship continuous improvements off-peak (AEST 22:00-06:00). SCN model (Validation→Position→Value→Direction→Capital) drives the full product flow.

## Change notes
- v3.7.0 — CMO: Create Competitor Feature Release Tracker module
- v3.5.0 — Code & Website Analyzer: deterministic PTD sub-score 0-100 from GitHub signals (commits, tests, CI, license, README) + website signals (HTTPS, TTFB, Lighthouse/heuristic perf/SEO/a11y). Valuation adjuster -10/0/+5/+12%. Full dashboard UI with arc gauge, bar chart, rationale items. analyzer_runs table migrated. Added to Build→Strategy nav.
- v3.4.0 — Visual upgrade: dashboard health-score-widget (2-col, glow gauge, valuation estimate, action cards), value-impact-banner (SVI delta, AUD gain, readiness %, milestones). Lifecycle email templates fully rebranded (navy header, stat grid, SVI progress bars). PDF cover page: 3-stat row. Auth UX: login shows already-signed-in card; LogoutButton broadcasts SIGNED_OUT to all tabs; SIGNED_IN broadcast after Google/password/magic-link login. Stripe credit-reset cron bug fixed (grantCredits instead of raw insert). v2 SKU audit extended.
- v3.1.0 — CFO: Implement R&D Tax Incentive & ESIC Valuation Modifier
- v3.0.0 — CPO: Implement First‑Principles Question Engine to generate Socratic prompts and route founders to appropriate BlockID features
- v3.0.0 — CFO: Integrate VC valuation methods library (VC Method, DCF, comparables, Berkus, Scorecard, Risk‑Factor Summation) with formulae and usage guidance
- v3.0.0 — RND: Develop Conversion/CTA experiment ideas & A/B test hypotheses for startup tooling
- v3.0.0 — RND: Conversion/CTA experiment ideas & A/B test hypotheses
- v3.0.0 — CSO: Pricing & segment A/B test infra (/admin/pricing-test)
- v3.0.0 — RND: New AI tools & capabilities for startup tooling
- v3.0.0 — CFO: Fundraising Readiness Report v2 — checklist + AU comparable raises
- v3.0.0 — CLO: Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link
- v3.0.0 — RND: Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics)
- v2.7.0 — CFO: R&D Tax Incentive and ESIC data integration
- v2.6.0 — CFO: Integrate sector ARR/revenue multiples for valuation benchmarking
- v2.4.3 — T0201 (CRO sales pipeline /admin/sales), T0202 (CCSO NPS widget + testimonials /admin/ccso), T0210 (CPO funnel heatmap /admin/funnel). 3 P0 30-day-MVP tasks shipped.
- v2.3.0 — SVI sub-brand split: startupvalueindex.com is the primary SVI brand site (landing + benchmarks); startupindex.au is the AU mirror; blockid.au remains the parent platform (auth, assessment engine, dashboard, payments). LinkedIn page Startup Value Index (org_id=129624133) launched 2026-06-15.
- v2.3.0 — Daily fan-out coverage: every 14 C-Level has ≥1 active task in plan.tasks (T0206–T0210 + T0202 reassignment). clevel-daily-reports route + crontab 23:45 UTC guarantees a daily file per agent.
- v2.3.0 — 30-day Validation MVP layer merged (.claude/goals/30day-validation-mvp.md). North Star: 10 paying customers + 100 company profiles + AUD $1k MRR. Queued 6 CRO/CCSO/CMO/CFO/COO/CTO P0 tasks: T0200, T0201, T0202, T0203, T0204, T0205. Milestone-report route now fires per-C-Level breakdown after every release.
- v2.3.0 — T0109 (CLO): ESOP Legal Checklist rebuilt as interactive client component (30 items, 6 categories, localStorage persistence). T0114 (CTO): RecentAnalyses localStorage scoped by projectId (userEmail) to prevent cross-user pollution.
