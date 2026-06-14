# Implementing Plan — BlockID.au

**Version:** v2.1.0  ·  **Updated:** 2026-06-14T01:30:00.000Z  ·  **Decided by:** ceo (2026-06-14T01:30:00.000Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks — Batch 9 (v2.1.x)
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0102 | CFO | cfo-esop-scoring.ts — ESOP governance scoring engine + valuation integration | minor | ✅ done |
| T0103 | CDO | /api/knowledge-base — C-Level knowledge base search API | minor | ✅ done |
| T0104 | CFO | /api/esop/score — ESOP + governance health scoring API | minor | ✅ done |
| T0105 | CTO | cfo-valuation.ts upgrade — ESOP governance inputs in risk factor model | minor | ✅ done |
| T0106 | CMO | SEO: 5 new articles (ESOP AU, valuation 2026, Antler tips, data room guide, cap table) | patch | ⬜ pending |
| T0107 | CRO | Founding 50 conversion page upgrade — social proof + urgency | minor | ⬜ pending |
| T0108 | CFO | SVI upgrade roadmap widget — personalized 68→75 action plan | minor | ⬜ pending |
| T0109 | CLO | ESOP legal checklist tool (/tools/esop-checklist) — free SEO page | minor | ⬜ pending |
| T0110 | CDO | Data room readiness score API + badge for user dashboard | minor | ⬜ pending |

## Active tasks — Batch 8 (v2.0.x — mostly done, verify)
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0016 | RND | Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics) | major | ⬜ pending |
| T0033 | CFO | Financial projection norms calculator | minor | ✅ done (page exists) |
| T0034 | CFO | Market sizing methodology framework | minor | ⬜ pending |
| T0035 | CMO | AU startup marketing benchmarks 2026 report | patch | ⬜ pending |
| T0086 | CFO | Financial Projection Norms Calculator (/tools/financial-projections) | minor | ✅ done |
| T0087 | CLO | Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link | minor | ✅ done (page exists) |
| T0088 | CFO | Fundraising Readiness Report v2 — checklist + AU comparable raises | minor | ⬜ pending |
| T0089 | CTO | Google Analytics OAuth evidence connector | minor | ⬜ pending |
| T0090 | CDO | SVI Cohort Benchmark page (/dashboard/benchmark) | minor | ✅ done |

## Recently shipped
- ✅ `T0085` **CEO** — Sync implementing-plan.md and project-state.json with shipped tasks
- ✅ `T0084` **CFO** — C-Level blended valuation engine + BlockID self-analysis (`4f9def9`)
- ✅ `T0083` **RND** — AU comparable companies data — 30+ startups (`23974fb`)
- ✅ `T0082` **CMO** — 5 SEO articles — AU funding, SAFE, equity split, Antler (`306b1a7`)
- ✅ `T0081` **CTO** — SVI score history trend chart (`3e39de6`)
- ✅ `T0080` **CMO** — /tools hub page — SEO aggregator (`7d32c8a`)
- ✅ `T0079` **RND** — GitHub Activity Evidence Integration (`4782f63`)
- ✅ `T0078` **CRO** — Investor View Notification Email (`85edaa8`)
- ✅ `T0077` **CMO** — SAFE Note Calculator (Free SEO tool) (`cf4a1fe`)
- ✅ `T0076` **CPO** — AI Score Confidence + Action Plan Cards (`7b9c23a`)

## Milestones
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M017** v1.9.0 — T0084 — C-Level blended valuation engine + BlockID self-analysis financial model (2026-06-13, 1 tasks)
- **M016** v1.8.0 — T0075–T0083 — Onboarding flow, score confidence, SAFE calculator, investor email, GitHub evidence, /tools hub, SVI history, SEO content, AU comparables (2026-06-13, 9 tasks)
- **M007** v0.8.0 — Founding 50 conversion prompt (T0017) — UpgradePrompt banner in workspace when balance===1, CTA to founding50 checkout (2026-06-13, 1 tasks)
- **M019** v2.1.0 — T0094–T0101 ESOP Manager UI + API + C-Level knowledge base (4 modules). T0102-T0105 governance scoring engine. (2026-06-14, 8 tasks)
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M006** v0.7.0 — Article pipeline fixed (T0015): 38 articles live, cron-runner auto-sync. T0011/T0013/T0014 verified done. Full self-analysis report generated. New tasks: T0016 (Evidence Vault), T0017 (Founding 50 conversion). (2026-06-13, 4 tasks)
- **M005** v0.6.0 — Berkus method 5th valuation for pre-revenue (T0010) + onboarding verified (T0012) + plan/agent sync (2026-06-13, 2 tasks)
- **M004** v0.5.0 — Feedback widget FAB (T0004) + CSV export (T0007) + SCN verified (T0009) — deployed sha 41ea308c (10/10 gates) (2026-06-13, 3 tasks)
- **M003** v0.4.0 — VC Valuation Dashboard (6 tabs) + /api/valuation/vc + /benchmarks page shipped (2026-06-13, 2 tasks)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (cfo-valuation.ts: 4 methods, projections, unit economics) (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated; reporting template, off-peak CI/CD, and QA integration shipped (2026-06-13, 3 tasks)
