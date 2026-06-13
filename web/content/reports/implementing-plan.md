# Implementing Plan — BlockID.au

**Version:** v0.7.0  ·  **Updated:** 2026-06-13T12:03:53.171Z  ·  **Decided by:** ceo (2026-06-13T12:03:53.170Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0016 | RND | Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics) | major | ⬜ pending |
| T0033 | CFO | Financial projection norms calculator | minor | ⬜ pending |
| T0034 | CFO | Market sizing methodology framework | minor | ⬜ pending |
| T0035 | CMO | AU startup marketing benchmarks 2026 report | patch | ⬜ pending |

## Recently shipped
- ✅ `T0017` **CRO** — Founding 50 conversion push — in-app upgrade prompt after 2nd analysis
- ✅ `T0015` **CTO** — Article sync fix — cron-runner.sh post-hook for publish-insight
- ✅ `T0014` **CTO** — SVI score history — trend chart per user
- ✅ `T0013` **CMO** — SEO: /tools hub page with all 10 free tools
- ✅ `T0012` **CRO** — Onboarding wizard — 3-step welcome flow for new users
- ✅ `T0011` **CMO** — Weekly SEO roundup post — AU startup funding news
- ✅ `T0010` **RND** — Berkus method + AU comparables in valuation engine (`e234613`)
- ✅ `T0009` **CPO** — SCN context detection — auto-detect startup phase from input
- ✅ `T0008` **CFO** — /api/valuation/vc — VC-grade valuation API endpoint (`4039c36`)
- ✅ `T0007` **CFO** — CSV export of the full valuation model (`41ea308`)

## Milestones
- **M007** v0.8.0 — Founding 50 conversion prompt (T0017) — UpgradePrompt banner in workspace when balance===1, CTA to founding50 checkout (2026-06-13, 1 tasks)
- **M006** v0.7.0 — Article pipeline fixed (T0015): 38 articles live, cron-runner auto-sync. T0011/T0013/T0014 verified done. Full self-analysis report generated. New tasks: T0016 (Evidence Vault), T0017 (Founding 50 conversion). (2026-06-13, 4 tasks)
- **M005** v0.6.0 — Berkus method 5th valuation for pre-revenue (T0010) + onboarding verified (T0012) + plan/agent sync (2026-06-13, 2 tasks)
- **M004** v0.5.0 — Feedback widget FAB (T0004) + CSV export (T0007) + SCN verified (T0009) — deployed sha 41ea308c (10/10 gates) (2026-06-13, 3 tasks)
- **M003** v0.4.0 — VC Valuation Dashboard (6 tabs) + /api/valuation/vc + /benchmarks page shipped (2026-06-13, 2 tasks)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (cfo-valuation.ts: 4 methods, projections, unit economics) (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated; reporting template, off-peak CI/CD, and QA integration shipped (2026-06-13, 3 tasks)
