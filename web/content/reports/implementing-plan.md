# Implementing Plan — BlockID.au

**Version:** v0.4.0  ·  **Updated:** 2026-06-13T03:30:00.000Z  ·  **Decided by:** ceo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0003 | RND | Pilot a new valuation-model feature (allocate ≥10% AI budget) | minor | ⬜ pending |
| T0004 | CRO | Power-user survey + interview program (self-healing feedback + upsell) | minor | ⬜ pending |
| T0007 | CFO | Excel download/upload of the valuation model (exceljs) | minor | ⬜ pending |
| T0009 | CPO | SCN context detection — auto-detect startup phase from input (idea/URL/GitHub/revenue) and drive valuation + report | major | ⬜ pending |
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending |
| T0011 | CRO | Accelerator outreach — email to Startmate + Antler with BlockID demo link | minor | ⬜ pending |

## Recently shipped
- ✅ `T0008` **CFO** — /api/valuation/vc endpoint (buildVcValuationReport, GET+POST, sector inference) (2026-06-13)
- ✅ `T0006` **CFO** — Valuation dashboard UI (/dashboard/valuation) with 6 tabs: Summary, Market, Methods, Projections, Unit Economics, Raise Plan (2026-06-13)
- ✅ `BENCHMARKS` **CMO** — /benchmarks page: AU startup benchmark data by stage, FAQ schema, cross-links from 5+ pages (2026-06-13)
- ✅ `T0005` **COO** — Daily QA health-check — automated test suite in the QA dashboard
- ✅ `T0002` **CTO** — Off-peak daily auto-upgrade CI/CD pipeline (first deploy < 48h)
- ✅ `T0001` **COO** — Mandatory daily C-Level reporting template + EOD enforcement

## Milestones
- **M003** v0.4.0 — VC valuation dashboard + /api/valuation/vc + AU benchmarks page shipped. 5 commits deployed to production this session (2026-06-13)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (market sizing, 4 methods, projections, unit economics, break-even, payback, financial injection) + CFO registered in loop + daily research + /goal (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated + board directives Q seeded; reporting template, off-peak CI/CD, and QA test integration shipped (2026-06-13, 3 tasks)
