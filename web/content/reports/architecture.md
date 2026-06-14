# Architecture — BlockID.au (living)

**Version:** v2.3.0  ·  **Last reviewed:** 2026-06-13T12:10:00.000Z

## Summary
BlockID.au — AI-powered startup valuation SaaS for AU founders (pre-seed → Series A). Next.js 16 standalone + Supabase + zero-downtime port-swap deploys. Multi-model AI engine (Claude Sonnet 4.6, Groq, Cerebras, SambaNova, OpenRouter fallback). C-Level AI agents (cto/cfo/cpo/cmo/cro/clo/chro/ciso/cdo/coo/rnd) self-research and self-upgrade domain modules under src/lib/agents/. CEO implementing-plan loop + daily cron pipeline (34+ jobs) ship continuous improvements off-peak (AEST 22:00-06:00). SCN model (Validation→Position→Value→Direction→Capital) drives the full product flow.

## Change notes
- v2.3.0 — T0109 (CLO): ESOP Legal Checklist rebuilt as interactive client component (30 items, 6 categories, localStorage persistence). T0114 (CTO): RecentAnalyses localStorage scoped by projectId (userEmail) to prevent cross-user pollution.
- v2.2.0 — Batch 9 (T0102-T0110): ESOP governance scoring engine (cfo-esop-scoring.ts), knowledge base API, /api/esop/score, SVI upgrade roadmap widget, ESOP legal checklist tool, data room readiness API.
- v2.1.0 — T0094–T0101: ESOP Manager (pool + grants UI + API), 36-month financial model, data room 13-section structure, BlockID SVI 68/100 self-analysis, C-Level knowledge base (4 modules), valuation A$440K pre-money.
- v2.0.0 — T0086–T0090 Feature Batch 8: Financial Projection Norms calculator, Term Sheet AI v2 persistence + Lawyer Questions, Fundraising Readiness Report v2 (checklist + AU comparable raises), Google Analytics OAuth evidence connector, SVI Cohort Benchmark page.
- v0.5.0 — Feedback widget FAB (T0004, all workspace pages → /api/feedback, credits-on-submit) + CSV export on VC dashboard (T0007, full 36-month model) + SCN context detection verified live (src/lib/scn-detect.ts + /api/scn/detect, integrated in main dashboard).
- v0.4.0 — VC Valuation Dashboard (/dashboard/valuation, 6 tabs) + /api/valuation/vc endpoint + /benchmarks page (AU startup data by stage, FAQ JSON-LD). Cross-linked from navbar, footer, sitemap, 4 tool pages.
- v0.3.0 — CFO VC-grade valuation engine (src/lib/agents/cfo-valuation.ts): market sizing (TAM/SAM/SOM), 4 valuation methods, projections, unit economics, break-even, payback, financial injection.
- v0.2.0 — CEO implementing-plan loop (research → CEO plan → code → version/milestone/architecture), off-peak deploy gating.
