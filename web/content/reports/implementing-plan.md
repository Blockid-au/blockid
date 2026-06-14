# Implementing Plan — BlockID.au

**Version:** v2.3.0  ·  **Updated:** 2026-06-14T12:04:02.438Z  ·  **Decided by:** ceo (2026-06-14T12:04:02.438Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0016 | RND | Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics) | major | ⬜ pending |
| T0033 | CFO | Financial projection norms calculator | minor | ⬜ pending |
| T0034 | CFO | Market sizing methodology framework | minor | ⬜ pending |
| T0035 | CMO | AU startup marketing benchmarks 2026 report | patch | ⬜ pending |
| T0086 | CFO | Financial Projection Norms Calculator (/tools/financial-projections) | minor | ⬜ pending |
| T0087 | CLO | Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link | minor | ⬜ pending |
| T0088 | CFO | Fundraising Readiness Report v2 — checklist + AU comparable raises | minor | ⬜ pending |
| T0089 | CTO | Google Analytics OAuth evidence connector | minor | ⬜ pending |
| T0090 | CDO | SVI Cohort Benchmark page (/dashboard/benchmark) | minor | ⬜ pending |
| T0101 | CFO | Financial projection norms calculator enhancements | minor | ⬜ pending |
| T0102 | CMO | AU startup percentile/positioning model integration | minor | ⬜ pending |
| T0103 | CTO | Next-Best-Action engine prototype | major | ⬜ pending |

## Recently shipped
- ✅ `T0106` **CMO** — 5 SEO blog articles — ESOP, valuation methods, Antler tips, data room checklist, cap table 101
- ✅ `T0114` **CTO** — Fix: recent-analyses.tsx localStorage project-scoped
- ✅ `T0109` **CLO** — ESOP Legal Checklist Tool (/tools/esop-checklist) — Interactive client component
- ✅ `T0110` **CDO** — /api/dataroom/readiness — 13-section weighted data room scoring API (`ab11688`)
- ✅ `T0109` **CMO** — ESOP Legal Checklist tool (/tools/esop-checklist) — SEO page (`96951eb`)
- ✅ `T0108` **CRO** — SVI Upgrade Roadmap widget — personalized 68→75 action plan (`96951eb`)
- ✅ `T0105` **CTO** — cfo-valuation.ts upgrade — ESOP governance inputs in risk factor model (`45ebabf`)
- ✅ `T0104` **CTO** — /api/esop/score — ESOP governance health score API (`45ebabf`)
- ✅ `T0103` **CDO** — /api/knowledge-base — C-Level knowledge base search API (`45ebabf`)
- ✅ `T0102` **CFO** — cfo-esop-scoring.ts — ESOP governance scoring engine + valuation integration (`45ebabf`)

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
