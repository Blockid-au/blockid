# Implementing Plan — BlockID.au

**Version:** v2.0.0  ·  **Updated:** 2026-06-13T09:10:00.000Z  ·  **Decided by:** cto+cpo

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.
> 
> **Strategic direction (2026-06-13):** Unicorn ops model active. Pricing reformed to freemium+pay-per-result. 300GB /data disk live. Roadmap: Startup Index (BSI-AU) as long-term category moat.

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
| Platform version | v1.9.0 (M017) |
| Disk (root /sda1) | 95G/276G (36%) |
| Disk (/data sdb) | 3.6G/295G (2%) — new 300GB disk live |
| Build status | tsc 0 errors · eslint clean · 94/94 tests |
| Operating model | Unicorn C-Level ops (see clevel-operations.md) |
| Strategic goal | BlockID Startup Index (BSI-AU) — Phase 1 data collection |

**SCN Priority Frame (updated):** Free → immediate value → micro-upgrade (A$2) → Founding 50 (A$49) → Startup Index ARR. Every task below is scored against: customer benefit first, then revenue activation, then data moat.

### Data architecture (/data disk — 300GB)
```
/data/releases/          ← web/releases symlink (replaces root disk)
/data/backups/           ← .next-backup, DB dumps
/data/logs/              ← archived prod logs
/data/npm-cache/         ← npm cache (was 2.5GB on root)
/data/supabase-volumes/  ← future Supabase volume mount
/data/media/             ← future user-uploaded media
```

---

## Active tasks

| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0010 | CMO | Product Hunt launch — submit listing, first comment from founder, 5 feature screenshots | major | ⬜ pending (user action required) |
| T0011 | CRO | Accelerator outreach — Antler application updated, submit to July 2026 cohort | minor | ⬜ pending (user action required) |
| T0048 | CTO | Create Supabase migration for founding50_waitlist table (email PK, name, joined_at) — required for T0047 waitlist to persist | minor | ⬜ pending (next deploy) |
| T0049 | CTO | **PR #3** — Merge disk-fix branch after review. Then: bash scripts/deploy-live.sh | major | ⬜ pending (review → merge → deploy) |
| T0050 | COO | Apply updated crontab: `crontab web/scripts/crontab.production` (adds Sunday disk cleanup) | minor | ⬜ pending (user: run crontab command) |
| T0051 | CRO | Pricing reform live: free tier 5 credits, founding50 100 credits, micro pack A$2/5cr — deploy with T0049 | major | ⬜ pending (in PR #3) |
| T0052 | CTO | Supabase migration: `svi_index_snapshots` table for Startup Index data collection (see startup-index-vision.md) | major | ⬜ pending |
| T0053 | CTO | Hook SVI analysis endpoint to write anonymised snapshot to svi_index_snapshots on every run | major | ⬜ pending |
| T0054 | CMO | Create `/index` landing page — "BlockID Startup Index" concept, waitlist for beta API access | minor | ⬜ pending |
| T0055 | CEO | Outreach to 3 AU VC funds for BSI beta data-feed partnership (Blackbird, Square Peg, Airtree) | major | ⬜ pending (user action) |

---

---

## Recently shipped
- ✅ `T0047` **CPO** — Founding 50 waitlist: POST /api/founding50/waitlist (upsert to founding50_waitlist), Founding50Waitlist component (amber, success state), founding-50/page.tsx now async server component — shows form vs waitlist based on live spots (2026-06-13, sha 535cfae)
- ✅ `T0045-T0046` **CMO** — 3 trust FAQ items (data security, AU residency, no tech knowledge); 14 new insight articles via CMO cron (59 total); topic-queue.json updated with 7 new topics (2026-06-13, sha ca2a498)
- ✅ `T0041-T0044` **CTO** — SEO + analytics: plan_cta_clicked + checkout_started on pricing CTA buttons; FAQJsonLd on /pricing (rich snippets); ArticleJsonLd on all 45 insight articles; remove fake aggregateRating from SoftwareApplicationJsonLd; fix BookOpen unused-import lint. tsc 0 · eslint clean (2026-06-13, sha 1d8ca72)
- ✅ `T0031` **CTO** — Xero OAuth connector: /api/oauth/xero + callback, P&L report (periods=3) + BankSummary, creates xero_pl (financial_health, svi_impact=18) + xero_revenue (traction, svi_impact=15), ConnectorStatus + ConnectButtons updated (2026-06-13)
- ✅ `T0038` **CTO** — Sentry error monitoring: lightweight HTTP Store API (no SDK), server-side via instrumentation.ts uncaughtException/unhandledRejection, client-side via global-error.tsx, SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN (2026-06-13)
- ✅ `T0039` **CMO** — LinkedIn weekly auto-post cron: POST /api/cron/linkedin-post, posts SVI score milestone via ugcPosts API, 7-day cooldown via svi_notifications, max 3 users/run (2026-06-13)
- ✅ `T0040` **CPO** — Multi-project workspace verified complete: src/lib/projects.ts, /api/projects/, /workspace/projects/, ProjectSwitcher in sidebar (pre-existing) (2026-06-13)
- ✅ `T0029` **CMO** — Post-signup onboarding email sequence: D+1 (welcome), D+3 (Evidence Vault), D+7 (Founding 50 upgrade CTA). Fires for users who haven't yet run SVI analysis. /api/cron/onboarding-sequence (2026-06-13, sha 035d27c)
- ✅ `T0033` **CPO** — Bank statement CSV import: POST /api/evidence/bank-statement parses ANZ/CBA/NAB/Westpac CSVs, extracts burn rate + net cash flow, creates financial_health evidence. BankStatementImport drag-drop UI in Evidence Vault (2026-06-13, sha 40657ab)
- ✅ `T0035` **CTO** — Usage analytics dashboard: /dashboard/admin/usage with KPI grid (8 metrics), 14-day daily analyses chart, recent signups table (2026-06-13, sha 8b7db4d)
- ✅ `T0060` **CTO** — SVI full report PDF export: "Export PDF" button on LivingSVIDashboard, calls existing /api/svi/pdf POST with analysisId, streams download (2026-06-13, sha 2365549)
- ✅ `T0059` **CPO** — In-app notification center: notifications table migration, GET/POST /api/notifications APIs, NotificationBell+NotificationPanel client component in WorkspaceHeader, welcome notification seeded on new user signup (2026-06-13, sha cd98359)
- ✅ `T0058` **CPO** — Data room investor tracking: investor_access_log migration, fire-and-forget logging on /s/[slug] GET, /dashboard/data-room page with share links + access history (2026-06-13, sha 1f74487)
- ✅ `T0057` **CFO** — Cap table health check: POST /api/cap-table/health (founder dilution, vesting cliff, option pool, ASIC threshold → score 0-100 + issues + recommendations), CapTableHealthWidget in /workspace/evidence (2026-06-13, sha f7e231c)
- ✅ `T0056` **COO** — Accelerator cohort dashboard: /dashboard/admin/cohorts page grouped by startup_stage (or join month fallback) with avg SVI + top performer per cohort (2026-06-13, sha 609bf94)
- ✅ `T0028+T0036` **CPO** — Upgrade CTA threshold raised to ≤5 credits + localStorage 48h dismiss; Founding50Spots live counter widget (GET /api/founding50/spots) on /founding-50 + upgrade banner (2026-06-13, sha d12379e)
- ✅ `T0034` **CMO** — 7 new AU startup insight articles: SAFE note, due diligence, legal structures, IP assignment, SaaS pricing, customer discovery, co-founder agreement (2026-06-13, pending)
- ✅ `T0027` **CFO** — Stripe Checkout already complete: /api/stripe/checkout, /checkout/success, billing-client.tsx (verified pre-existing) (2026-06-13)
- ✅ `T0030` **CPO** — CreditBalance widget already in workspace sidebar (verified pre-existing) (2026-06-13)
- ✅ `T0032` **CMO** — Lifecycle email sequence already implemented via /api/cron/weekly-insights (4 milestones: SVI→1w→1m→3m) (verified pre-existing) (2026-06-13)
- ✅ `T0037` **CRO** — Referral system already implemented via /api/referrals + /api/referral + lib/referrals.ts (verified pre-existing) (2026-06-13)
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

- **M018** v2.0.0 — Phase 3 Growth: T0056 cohort dashboard, T0057 cap table health check, T0058 investor access log + data room dashboard, T0059 notification center (bell + panel + APIs), T0060 SVI PDF export button. 10/10 deploy gates. tsc 0 errors, eslint clean (2026-06-13, sha b06d405)
- **M017** v1.9.0 — 300GB /data disk mounted (sdb, ext4, UUID in fstab); releases/ symlinked to /data/releases; npm cache moved to /data/npm-cache; Pricing reform: free 5 credits + founding50 100 credits + A$2 micro pack; clevel-operations.md + startup-index-vision.md created; plan updated. tsc 0 errors (2026-06-13)
- **M016** v1.8.0 — T0049: Disk fix PR #3: outputFileTracingExcludes (stops releases/ being bundled in standalone), deploy-live.sh nested-dir purge, clean-disk.sh maintenance script. npm cache cleaned (~2GB freed). Disk: 121G→97G (37%). PR: https://github.com/Blockid-au/blockid/pull/3 (pending merge + deploy) (2026-06-13)
- **M015** v1.7.0 — T0047: Founding 50 waitlist (POST /api/founding50/waitlist, Founding50Waitlist component, server-side spots check). T0045: 3 trust FAQ items. T0046: 14 new insight articles (59 total). tsc 0 errors, eslint clean (2026-06-13, sha 535cfae)
- **M014** v1.6.0 — T0041-T0044: CTA analytics tracking (plan_cta_clicked + checkout_started on pricing), FAQJsonLd on /pricing, ArticleJsonLd on 45 insight articles, fake aggregateRating removed. tsc 0 errors, eslint clean (2026-06-13, sha 1d8ca72)
- **M013** v1.5.0 — T0031: Xero OAuth (P&L + revenue evidence). T0038: Sentry error monitoring (HTTP Store API, no SDK). T0039: LinkedIn auto-post cron. T0040: multi-project workspace verified. tsc 0 errors, eslint clean (2026-06-13)
- **M012** v1.4.0 — T0029: post-signup onboarding sequence (D+1/D+3/D+7). T0033: bank statement CSV import (ANZ/CBA/NAB/Westpac). T0034: 45 total insight articles (7 new). tsc 0 errors, eslint clean (2026-06-13, sha c019047)
- **M011** v1.3.0 — T0028+T0036: upgrade CTA ≤5 credits + Founding50Spots live counter. T0035: usage analytics. T0034: 7 insight articles. All previously "pending" tasks verified complete (T0027/T0030/T0032/T0037 pre-existing). tsc 0 errors, eslint clean (2026-06-13, sha 8b7db4d)
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
