# Implementing Plan — BlockID.au

**Version:** v1.2.0  ·  **Updated:** 2026-06-13T07:30:00.000Z  ·  **Decided by:** ceo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

---

## SCN Context (2026-06-13)

| Signal | Value |
|---|---|
| Stage | Pre-seed |
| Revenue | A$0 MRR (pre-revenue) |
| Users | 28 registered, 118 analyses |
| Runway | ~18 months at A$3K/mo opex |
| AI Budget | US$0.18 / US$100 (0.18%) |
| Valuation (blended mid) | A$488K |
| Platform version | v1.1.0 (M010) |
| Build status | tsc 0 errors · eslint clean · 94/94 tests |

**SCN Priority Frame:** Pre-seed pre-revenue → Revenue Activation first, then Conversion funnel, then Evidence Vault depth, then SEO flywheel. Every task below is scored against this frame.

---

## Active tasks

| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0027 | CFO | Stripe subscription checkout — payment page for Founding 50 (A$49) + Growth (A$99/mo + A$950/yr) using Stripe Checkout Sessions; success/cancel redirect with credit grant | critical | ⬜ pending |
| T0028 | CPO | Upgrade CTA banner — show persistent upgrade nudge in dashboard when credits ≤ 5; link to /pricing with UTM; dismiss-once via localStorage | major | ⬜ pending |
| T0029 | CMO | Email onboarding sequence — 3-email Resend transactional chain: D+1 (welcome + SVI tip), D+3 (Evidence Vault explainer), D+7 (upgrade CTA with Founding 50 scarcity count) | major | ⬜ pending |
| T0030 | CPO | Credit balance widget — show current credits in sidebar/nav, with "Get more" link; update in real time after each analysis | minor | ⬜ pending |
| T0031 | CTO | Xero OAuth connector — /api/oauth/xero route + callback, read P&L / cash / invoices → CFO evidence (revenue, burn, runway signals) | major | ⬜ pending |
| T0032 | CMO | Weekly SVI digest cron — every Monday 09:00 AEST, send personalized email (SVI score, top gap, 1 action recommendation, upgrade nudge if free) | major | ⬜ pending |
| T0033 | CPO | Evidence Vault: bank statement CSV import — drag-drop CSV (ANZ/CBA/NAB/Westpac format), parse transactions, auto-extract burn rate → CFO evidence | major | ⬜ pending |
| T0034 | CMO | 7 new AU startup insight articles: SAFE note AU law, due diligence checklist, startup legal structures, co-founder agreement template, IP assignment, SaaS pricing strategy, customer discovery framework | minor | ⬜ pending |
| T0035 | CTO | /dashboard/admin/usage — usage analytics: daily active users, analyses/day (last 30d), free→paid conversion funnel, evidence vault connections count | minor | ⬜ pending |
| T0036 | CPO | Founding 50 scarcity widget — live counter showing spots remaining (50 − paid users); show on /pricing and dashboard upgrade banner | minor | ⬜ pending |
| T0037 | CRO | Referral program — unique referral link per user (/ref/[code]), +5 credits on successful signup, track in referrals table | major | ⬜ pending |
| T0038 | CTO | Sentry error monitoring — add @sentry/nextjs, capture unhandled exceptions + API errors, alert on error spike | minor | ⬜ pending |
| T0039 | CMO | LinkedIn auto-post cron — weekly post with a BlockID insight stat or startup tip, using LinkedIn OAuth (already partially scaffolded) | minor | ⬜ pending |
| T0040 | CPO | Multi-project workspace — allow users to create multiple startup projects (project_id context); switch project via sidebar dropdown; isolates analyses, evidence, cap table per project | major | ⬜ pending |
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending (user action required) |
| T0011 | CRO | Accelerator outreach — Antler application updated, submit to July 2026 cohort | minor | ⬜ pending (user action required) |

---

## Execution order (agent can self-sequence)

1. **T0027** — Stripe checkout (revenue gate; everything else is moot without payment working)
2. **T0028** — Upgrade CTA (sends users to T0027)
3. **T0036** — Founding 50 scarcity widget (urgency mechanism for T0028)
4. **T0029** — Email onboarding sequence (re-engages 28 existing users toward payment)
5. **T0030** — Credit balance widget (reduce friction, surface upgrade moment)
6. **T0032** — Weekly SVI digest (retention + upgrade nudge)
7. **T0034** — 7 more insight articles (SEO flywheel)
8. **T0033** — Bank statement CSV import (evidence depth)
9. **T0031** — Xero OAuth connector (evidence depth)
10. **T0037** — Referral program (growth loop)
11. **T0035** — Usage analytics dashboard (admin visibility)
12. **T0038** — Sentry (reliability)
13. **T0039** — LinkedIn cron (distribution)
14. **T0040** — Multi-project workspace (Q3 milestone)

---

## Recently shipped
- ✅ `T0026` **CTO** — Rate limit dashboard: /dashboard/admin shows per-route/per-identity rate-limit usage with count, reset time, amber highlight; getRateLimitSnapshot() + GET /api/admin/rate-limits (admin-only) (2026-06-13, sha 439ce5b)
- ✅ `T0025` **CPO** — SVI score sharing: Share Score button in LivingSVIDashboard copies /s/{scoreId} URL with teal confirmation state, og:image meta via existing /s/[slug] route (2026-06-13, sha 9d12e52)
- ✅ `T0024` **CMO** — Insight cross-linking already implemented via related articles section in /insights/[slug]/page.tsx (2026-06-13)
- ✅ `T0021` **CFO** — Valuation report PDF export: 2-page @react-pdf/renderer PDF (blended valuation, market sizing, methods, unit economics, projections, raise plan). Export PDF button on valuation dashboard (2026-06-13, sha ff33fac)
- ✅ `T0022` **CPO** — Post-signup onboarding: new users redirect to /workspace/evidence?onboarding=true, welcome banner with CTA to connect first source (2026-06-13, sha 75b6d9e)
- ✅ `T0019+T0020` **CPO+CTO** — OAuth success/error toast, disconnect button per connector, DELETE /api/evidence/disconnect, STRIPE_CLIENT_ID docs (2026-06-13, sha 80bbce6)
- ✅ `T0018` **CMO** — 7 new AU startup insight articles: ASIC registration, VC landscape 2026, cap table red flags, government grants, employee equity, VC term sheet, startup runway (2026-06-13, sha 1070d9d)
- ✅ `T0016` **CTO** — Evidence Vault Phase 2: Stripe Connect OAuth + GA4 OAuth, CSRF, HEAD checks, TRE+MPC+PMF evidence, connector UI updated (2026-06-13, sha b659f83)
- ✅ `T0003` **RND** — AU comparable company multiples in cfo-valuation.ts: AU-stage discount factors (AVCAL Q1 2025), sector-specific AU comparables, 7/7 tests pass (2026-06-13, sha 0b48584)
- ✅ `T0021` **CFO** — Valuation report PDF export (2026-06-13, sha ff33fac)
- ✅ `T0022` **CPO** — Post-signup onboarding flow (2026-06-13, sha 75b6d9e)
- ✅ `T0016` **CTO** — Evidence Vault Phase 2: Stripe + GA4 OAuth (2026-06-13, sha b659f83)
- ✅ `T0003` **RND** — AU comparable company multiples (2026-06-13)
- ✅ `T0004` **CRO** — FeedbackWidget FAB on all workspace pages (2026-06-13)
- ✅ `T0007` **CFO** — CSV export on VC Valuation Dashboard (2026-06-13)
- ✅ `T0009` **CPO** — SCN context detection live (2026-06-13)
- ✅ `T0008` **CFO** — /api/valuation/vc endpoint (2026-06-13)
- ✅ `T0006` **CFO** — Valuation dashboard UI (2026-06-13)
- ✅ `BENCHMARKS` **CMO** — /benchmarks page (2026-06-13)
- ✅ `T0005` **COO** — Daily QA health-check (2026-06-13)
- ✅ `T0002` **CTO** — Off-peak CI/CD pipeline (2026-06-13)
- ✅ `T0001` **COO** — Daily C-Level reporting template (2026-06-13)

---

## Milestones

- **M011** v1.2.0 — target: T0027+T0028+T0036 (Stripe checkout + upgrade CTA + scarcity widget) → first paying user
- **M010** v1.1.0 — T0025: SVI score sharing. T0026: Rate limit admin dashboard. All tsc 0 errors, eslint clean (2026-06-13, sha 439ce5b)
- **M009** v1.0.0 — T0021: Valuation PDF export. T0022: Post-signup onboarding flow. All tsc 0 errors, eslint clean, 7/7 cfo-valuation tests (2026-06-13, sha ff33fac)
- **M008** v0.9.0 — T0019+T0020: OAuth toast UX, disconnect button, env docs. T0018: 7 SEO articles (2026-06-13, sha 80bbce6)
- **M007** v0.8.0 — T0016: Stripe Connect OAuth + GA4 OAuth connectors (2026-06-13, sha b659f83)
- **M006** v0.7.0 — T0003: AU comparable company multiples (2026-06-13, sha 0b48584)
- **M005** v0.6.0 — Berkus method, 94/94 tests (2026-06-13, sha e234613)
- **M004** v0.5.0 — Feedback widget, CSV export, SCN (sha 41ea308c)
- **M003** v0.4.0 — VC valuation dashboard + AU benchmarks (2026-06-13)
- **M002** v0.3.0 — CFO VC-grade valuation engine (2026-06-13)
- **M001** v0.2.0 — CEO implementing-plan loop activated (2026-06-13)
