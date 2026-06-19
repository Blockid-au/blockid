# Implementing Plan — BlockID.au

**Version:** v2.5.0  ·  **Updated:** 2026-06-19T04:02:28.671Z  ·  **Decided by:** ceo (2026-06-19T04:02:28.636Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0016 | RND | Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics) | major | ⬜ pending |
| T0087 | CLO | Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link | minor | ⬜ pending |
| T0088 | CFO | Fundraising Readiness Report v2 — checklist + AU comparable raises | minor | ⬜ pending |
| T0102 | CMO | AU startup percentile/positioning model integration | minor | ⬜ pending |
| T0203 | CMO | CMO content pillar tracker — 7 pillars × weekly LinkedIn queue | minor | ⬜ pending |
| T0110 | CFO | R&D Tax Incentive and ESIC data integration | minor | ⬜ pending |
| T0111 | RND | New AI tools & capabilities for startup tooling | minor | ⬜ pending |
| T0206 | CSO | Pricing & segment A/B test infra (/admin/pricing-test) | minor | ⬜ pending |
| T0211 | CMO | LinkedIn page launch — Startup Value Index (linkedin.com/company/startup-value-index) | minor | ⬜ pending |
| T0213 | CPO | SVI brand landing page at startupvalueindex.com | minor | ⬜ pending |
| T0120 | CFO | Financial projection norms integration | minor | ⬜ pending |
| T0121 | RND | Conversion/CTA experiment ideas & A/B test hypotheses | minor | ⬜ pending |
| T0122 | CFO | Integrate sector ARR/revenue multiples for valuation benchmarking | minor | ⬜ pending |
| T0123 | RND | Develop Conversion/CTA experiment ideas & A/B test hypotheses for startup tooling | minor | ⬜ pending |
| T0124 | CRO | Implement Funding Readiness scoring (CAPITAL) for investor readiness assessment | minor | ⬜ pending |

## Recently shipped
- ✅ `T0212` **CTO** — DNS + nginx vhost for startupvalueindex.com + startupindex.au
- ✅ `T0210` **CPO** — Funnel drop-off heatmap (/admin/funnel) — every assessment step instrumented (`b18238a`)
- ✅ `T0209` **IR** — Accelerator deadline tracker + pitch evidence binder
- ✅ `T0208` **CHRO** — AU salary benchmark + ESOP grant UI (Division 83A)
- ✅ `T0207` **CISO** — Security posture scoring + rate-limit/auth audit dashboard
- ✅ `T0205` **CTO** — Milestone reporter route + orchestrator hook (`abcb7e1`)
- ✅ `T0204` **CFO** — CFO founder finance dashboard (/dashboard/finance)
- ✅ `T0202` **CCSO** — CCSO workflow — NPS + referral + testimonial capture (`b18238a`)
- ✅ `T0201` **CRO** — CRO sales operating system — lead pipeline DB + admin UI (`b18238a`)
- ✅ `T0200` **COO** — 30-day CEO scoreboard page (/dashboard/30day)

## Milestones
- **M020** v2.2.0 — T0102-T0110 Batch 9: ESOP scoring engine, governance API, knowledge base API, SVI roadmap widget, ESOP checklist SEO tool, data room readiness API (2026-06-14, 7 tasks)
- **M019** v2.1.0 — T0094–T0101 ESOP + SVI + Data Room + Knowledge Base — investor-ready documents, ESOP Manager UI live (2026-06-14, 8 tasks)
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M017** v1.9.0 — T0084 — C-Level blended valuation engine + BlockID self-analysis financial model (2026-06-13, 1 tasks)
- **M016** v1.8.0 — T0075–T0083 — Onboarding flow, score confidence, SAFE calculator, investor email, GitHub evidence, /tools hub, SVI history, SEO content, AU comparables (2026-06-13, 9 tasks)
- **M007** v0.8.0 — Founding 50 conversion prompt (T0017) — UpgradePrompt banner in workspace when balance===1, CTA to founding50 checkout (2026-06-13, 1 tasks)
- **M006** v0.7.0 — Article pipeline fixed (T0015): 38 articles live, cron-runner auto-sync. T0011/T0013/T0014 verified done. Full self-analysis report generated. New tasks: T0016 (Evidence Vault), T0017 (Founding 50 conversion). (2026-06-13, 4 tasks)
- **M005** v0.6.0 — Berkus method 5th valuation for pre-revenue (T0010) + onboarding verified (T0012) + plan/agent sync (2026-06-13, 2 tasks)
- **M004** v0.5.0 — Feedback widget FAB (T0004) + CSV export (T0007) + SCN verified (T0009) — deployed sha 41ea308c (10/10 gates) (2026-06-13, 3 tasks)
- **M003** v0.4.0 — VC Valuation Dashboard (6 tabs) + /api/valuation/vc + /benchmarks page shipped (2026-06-13, 2 tasks)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (cfo-valuation.ts: 4 methods, projections, unit economics) (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated; reporting template, off-peak CI/CD, and QA integration shipped (2026-06-13, 3 tasks)
