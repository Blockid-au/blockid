# Implementing Plan — BlockID.au

**Version:** v0.9.0  ·  **Updated:** 2026-06-13T04:45:00.000Z  ·  **Decided by:** ceo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0021 | CFO | Valuation report PDF export — downloadable PDF from /dashboard/valuation (jsPDF or Puppeteer) | major | ⬜ pending |
| T0022 | CPO | Onboarding flow: post-signup redirect to /workspace/evidence with guided first-step prompt | minor | ⬜ pending |
| T0023 | CMO | /insights sitemap.xml — add all 38 article slugs to sitemap for SEO indexing | minor | ⬜ pending |
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending (user action required) |
| T0011 | CRO | Accelerator outreach — Antler application updated, submit to July 2026 cohort | minor | ⬜ pending (user action required) |

## Recently shipped
- ✅ `T0019+T0020` **CPO+CTO** — OAuth success/error toast on ?connected= param, disconnect button per connector, DELETE /api/evidence/disconnect, STRIPE_CLIENT_ID docs in .env.example (2026-06-13, sha 80bbce6)
- ✅ `T0018` **CMO** — 7 new AU startup insight articles: ASIC registration, VC landscape 2026, cap table red flags, government grants, employee equity, VC term sheet, startup runway (2026-06-13, sha 1070d9d)
- ✅ `T0016` **CTO** — Evidence Vault Phase 2: Stripe Connect OAuth + GA4 OAuth, CSRF, HEAD checks, TRE+MPC+PMF evidence, connector UI updated (2026-06-13, sha b659f83)
- ✅ `T0003` **RND** — AU comparable company multiples in cfo-valuation.ts: AU-stage discount factors (AVCAL Q1 2025, Cut Through Venture 2025), sector-specific AU comparable companies, 7/7 tests pass (2026-06-13, sha 0b48584)
- ✅ `self_analysis.md` — Full project self-analysis: website, source, captable, financial injection, risks, next 90 days (2026-06-13)
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
- **M008** v0.9.0 — T0019+T0020: OAuth toast UX, disconnect button, env docs. T0018: 7 SEO articles. All tsc 0 errors, eslint clean (2026-06-13, sha 80bbce6)
- **M007** v0.8.0 — T0016: Stripe Connect OAuth + GA4 OAuth — 4 new routes, CSRF-verified, HEAD checks, evidence TRE+MPC+PMF, connector UI updated (2026-06-13, sha b659f83)
- **M006** v0.7.0 — T0003: AU comparable company multiples + AU stage discount in comparablesMethod. self_analysis.md added at project root. 7/7 cfo-valuation tests, tsc 0 errors (2026-06-13, sha 0b48584)
- **M005** v0.6.0 — Berkus method (5-element pre-revenue valuation, 30% weight when mrrAud=0), onboarding wizard verified. 94/94 tests passing (2026-06-13, sha e234613)
- **M004** v0.5.0 — Feedback widget (T0004), CSV export on VC dashboard (T0007), SCN verified (T0009). Deployed in same build as M003 (sha 41ea308c, 10/10 gates) (2026-06-13)
- **M003** v0.4.0 — VC valuation dashboard + /api/valuation/vc + AU benchmarks page shipped. 5 commits deployed to production this session (2026-06-13)
- **M002** v0.3.0 — CFO VC-grade valuation engine shipped (market sizing, 4 methods, projections, unit economics, break-even, payback, financial injection) + CFO registered in loop + daily research + /goal (2026-06-13, 0 tasks)
- **M001** v0.2.0 — CEO implementing-plan loop activated + board directives Q seeded; reporting template, off-peak CI/CD, and QA test integration shipped (2026-06-13, 3 tasks)
