# Implementing Plan — BlockID.au

**Version:** v1.0.0  ·  **Updated:** 2026-06-13T05:00:00.000Z  ·  **Decided by:** ceo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0024 | CMO | Insight cross-linking — add related article links at bottom of each insight page | minor | ⬜ pending |
| T0025 | CPO | SVI score sharing — shareable URL with og:image preview (open graph meta from analysis) | major | ⬜ pending |
| T0026 | CTO | Rate limit dashboard — /dashboard/admin show per-user rate limit usage (admin only) | minor | ⬜ pending |
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending (user action required) |
| T0011 | CRO | Accelerator outreach — Antler application updated, submit to July 2026 cohort | minor | ⬜ pending (user action required) |

## Recently shipped
- ✅ `T0021` **CFO** — Valuation report PDF export: 2-page @react-pdf/renderer PDF (blended valuation, market sizing, methods, unit economics, projections, raise plan). Export PDF button on valuation dashboard (2026-06-13, sha ff33fac)
- ✅ `T0022` **CPO** — Post-signup onboarding: new users redirect to /workspace/evidence?onboarding=true, welcome banner with CTA to connect first source (2026-06-13, sha 75b6d9e)
- ✅ `T0019+T0020` **CPO+CTO** — OAuth success/error toast, disconnect button per connector, DELETE /api/evidence/disconnect, STRIPE_CLIENT_ID docs (2026-06-13, sha 80bbce6)
- ✅ `T0018` **CMO** — 7 new AU startup insight articles: ASIC registration, VC landscape 2026, cap table red flags, government grants, employee equity, VC term sheet, startup runway (2026-06-13, sha 1070d9d)
- ✅ `T0016` **CTO** — Evidence Vault Phase 2: Stripe Connect OAuth + GA4 OAuth, CSRF, HEAD checks, TRE+MPC+PMF evidence, connector UI updated (2026-06-13, sha b659f83)
- ✅ `T0003` **RND** — AU comparable company multiples in cfo-valuation.ts: AU-stage discount factors (AVCAL Q1 2025), sector-specific AU comparables, 7/7 tests pass (2026-06-13, sha 0b48584)
- ✅ `self_analysis.md` — Full project self-analysis: website, source, captable, financial injection, risks, next 90 days (2026-06-13)
- ✅ `T0004` **CRO** — FeedbackWidget FAB on all workspace pages (2026-06-13)
- ✅ `T0007` **CFO** — CSV export on VC Valuation Dashboard (2026-06-13)
- ✅ `T0009` **CPO** — SCN context detection live (2026-06-13)
- ✅ `T0008` **CFO** — /api/valuation/vc endpoint (2026-06-13)
- ✅ `T0006` **CFO** — Valuation dashboard UI (2026-06-13)
- ✅ `BENCHMARKS` **CMO** — /benchmarks page (2026-06-13)
- ✅ `T0005` **COO** — Daily QA health-check (2026-06-13)
- ✅ `T0002` **CTO** — Off-peak CI/CD pipeline (2026-06-13)
- ✅ `T0001` **COO** — Daily C-Level reporting template (2026-06-13)

## Milestones
- **M009** v1.0.0 — T0021: Valuation PDF export. T0022: Post-signup onboarding flow. All tsc 0 errors, eslint clean, 7/7 cfo-valuation tests (2026-06-13, sha ff33fac)
- **M008** v0.9.0 — T0019+T0020: OAuth toast UX, disconnect button, env docs. T0018: 7 SEO articles (2026-06-13, sha 80bbce6)
- **M007** v0.8.0 — T0016: Stripe Connect OAuth + GA4 OAuth connectors (2026-06-13, sha b659f83)
- **M006** v0.7.0 — T0003: AU comparable company multiples (2026-06-13, sha 0b48584)
- **M005** v0.6.0 — Berkus method, 94/94 tests (2026-06-13, sha e234613)
- **M004** v0.5.0 — Feedback widget, CSV export, SCN (sha 41ea308c)
- **M003** v0.4.0 — VC valuation dashboard + AU benchmarks (2026-06-13)
- **M002** v0.3.0 — CFO VC-grade valuation engine (2026-06-13)
- **M001** v0.2.0 — CEO implementing-plan loop activated (2026-06-13)
