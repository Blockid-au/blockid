# Architecture — BlockID.au (living)

**Version:** v2.3.0  ·  **Last reviewed:** 2026-06-15T14:30:22Z

## Summary
BlockID.au — AI-powered startup valuation SaaS for AU founders (pre-seed → Series A). Next.js 16 standalone + Supabase + zero-downtime port-swap deploys. Multi-model AI engine (Claude Sonnet 4.6, Groq, Cerebras, SambaNova, OpenRouter fallback). C-Level AI agents (cto/cfo/cpo/cmo/cro/clo/chro/ciso/cdo/coo/rnd) self-research and self-upgrade domain modules under src/lib/agents/. CEO implementing-plan loop + daily cron pipeline (34+ jobs) ship continuous improvements off-peak (AEST 22:00-06:00). SCN model (Validation→Position→Value→Direction→Capital) drives the full product flow.

## Change notes
- v2.3.0 — SVI sub-brand split: startupvalueindex.com is the primary SVI brand site (landing + benchmarks); startupindex.au is the AU mirror; blockid.au remains the parent platform (auth, assessment engine, dashboard, payments). LinkedIn page Startup Value Index (org_id=129624133) launched 2026-06-15.
- v2.3.0 — Daily fan-out coverage: every 14 C-Level has ≥1 active task in plan.tasks (T0206–T0210 + T0202 reassignment). clevel-daily-reports route + crontab 23:45 UTC guarantees a daily file per agent.
- v2.3.0 — 30-day Validation MVP layer merged (.claude/goals/30day-validation-mvp.md). North Star: 10 paying customers + 100 company profiles + AUD $1k MRR. Queued 6 CRO/CCSO/CMO/CFO/COO/CTO P0 tasks: T0200, T0201, T0202, T0203, T0204, T0205. Milestone-report route now fires per-C-Level breakdown after every release.
- v2.3.0 — T0109 (CLO): ESOP Legal Checklist rebuilt as interactive client component (30 items, 6 categories, localStorage persistence). T0114 (CTO): RecentAnalyses localStorage scoped by projectId (userEmail) to prevent cross-user pollution.
- v2.2.0 — Batch 9 (T0102-T0110): ESOP governance scoring engine (cfo-esop-scoring.ts), knowledge base API, /api/esop/score, SVI upgrade roadmap widget, ESOP legal checklist tool, data room readiness API.
- v2.1.0 — T0094–T0101: ESOP Manager (pool + grants UI + API), 36-month financial model, data room 13-section structure, BlockID SVI 68/100 self-analysis, C-Level knowledge base (4 modules), valuation A$440K pre-money.
- v2.0.0 — T0086–T0090 Feature Batch 8: Financial Projection Norms calculator, Term Sheet AI v2 persistence + Lawyer Questions, Fundraising Readiness Report v2 (checklist + AU comparable raises), Google Analytics OAuth evidence connector, SVI Cohort Benchmark page.
- v0.5.0 — Feedback widget FAB (T0004, all workspace pages → /api/feedback, credits-on-submit) + CSV export on VC dashboard (T0007, full 36-month model) + SCN context detection verified live (src/lib/scn-detect.ts + /api/scn/detect, integrated in main dashboard).
- v0.4.0 — VC Valuation Dashboard (/dashboard/valuation, 6 tabs) + /api/valuation/vc endpoint + /benchmarks page (AU startup data by stage, FAQ JSON-LD). Cross-linked from navbar, footer, sitemap, 4 tool pages.
- v0.3.0 — CFO VC-grade valuation engine (src/lib/agents/cfo-valuation.ts): market sizing (TAM/SAM/SOM), 4 valuation methods, projections, unit economics, break-even, payback, financial injection.
- v0.2.0 — CEO implementing-plan loop (research → CEO plan → code → version/milestone/architecture), off-peak deploy gating.
