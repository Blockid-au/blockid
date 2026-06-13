# Implementing Plan — BlockID.au

**Version:** v0.5.0  ·  **Updated:** 2026-06-13T04:00:00.000Z  ·  **Decided by:** ceo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0003 | RND | Pilot a new valuation-model feature (allocate ≥10% AI budget) | minor | ⬜ pending |
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending (user action required) |
| T0011 | CRO | Accelerator outreach — Antler application updated, submit to July 2026 cohort | minor | ⬜ pending (user action required) |

## Recently shipped
- ✅ `T0004` **CRO** — FeedbackWidget FAB on all workspace pages: category selector, credits-on-submit, connects to /api/feedback (2026-06-13)
- ✅ `T0007` **CFO** — CSV export on VC Valuation Dashboard: full report export (blended, methods, 36-month projections, unit economics, raise plan) (2026-06-13)
- ✅ `T0009` **CPO** — SCN context detection live: src/lib/scn-detect.ts + /api/scn/detect, integrated in main dashboard (2026-06-13)
- ✅ `T0008` **CFO** — /api/valuation/vc endpoint (buildVcValuationReport, GET+POST, sector inference) (2026-06-13)
- ✅ `T0006` **CFO** — Valuation dashboard UI (/dashboard/valuation) with 6 tabs: Summary, Market, Methods, Projections, Unit Economics, Raise Plan (2026-06-13)
- ✅ `BENCHMARKS` **CMO** — /benchmarks page: AU startup benchmark data by stage, FAQ schema, cross-links from 5+ pages (2026-06-13)
- ✅ `T0005` **COO** — Daily QA health-check — automated test suite in the QA dashboard
- ✅ `T0002` **CTO** — Off-peak daily auto-upgrade CI/CD pipeline (first deploy < 48h)
- ✅ `T0001` **COO** — Mandatory daily C-Level reporting template + EOD enforcement

## Milestones
- **M004** v0.5.0 — Feedback widget (T0004), CSV export on VC dashboard (T0007), SCN verified (T0009). Deployed in same build as M003 (sha 41ea308c, 10/10 gates) (2026-06-13)
- **M003** v0.4.0 — VC valuation dashboard + /api/valuation/vc + AU benchmarks page shipped. 5 commits deployed to production this session (2026-06-13)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (market sizing, 4 methods, projections, unit economics, break-even, payback, financial injection) + CFO registered in loop + daily research + /goal (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated + board directives Q seeded; reporting template, off-peak CI/CD, and QA test integration shipped (2026-06-13, 3 tasks)
