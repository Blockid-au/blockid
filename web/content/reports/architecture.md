# Architecture — BlockID.au (living)

**Version:** v3.1.0  ·  **Last reviewed:** 2026-07-22T14:00:02.174Z

## Summary
BlockID.au — AI-powered startup valuation SaaS for AU founders (pre-seed → Series A). Next.js 16 standalone + Supabase + zero-downtime port-swap deploys. Multi-model AI engine (Claude Sonnet 4.6, Groq, Cerebras, SambaNova, OpenRouter fallback). C-Level AI agents (cto/cfo/cpo/cmo/cro/clo/chro/ciso/cdo/coo/rnd) self-research and self-upgrade domain modules under src/lib/agents/. CEO implementing-plan loop + daily cron pipeline (34+ jobs) ship continuous improvements off-peak (AEST 22:00-06:00). SCN model (Validation→Position→Value→Direction→Capital) drives the full product flow.

## Change notes
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
- v2.2.0 — Batch 9 (T0102-T0110): ESOP governance scoring engine (cfo-esop-scoring.ts), knowledge base API, /api/esop/score, SVI upgrade roadmap widget, ESOP legal checklist tool, data room readiness API.
- v2.1.0 — T0094–T0101: ESOP Manager (pool + grants UI + API), 36-month financial model, data room 13-section structure, BlockID SVI 68/100 self-analysis, C-Level knowledge base (4 modules), valuation A$440K pre-money.
- v2.0.0 — T0086–T0090 Feature Batch 8: Financial Projection Norms calculator, Term Sheet AI v2 persistence + Lawyer Questions, Fundraising Readiness Report v2 (checklist + AU comparable raises), Google Analytics OAuth evidence connector, SVI Cohort Benchmark page.
