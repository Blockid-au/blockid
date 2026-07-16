# BlockID.au v2.0 — Master Implementation Plan (Pricing Upgrade)

**Chief Architect:** consolidation of 10 C-Level specs
**Date:** 2026-07-16
**Duration:** 8 weeks, 4 sprints
**Source docs:** `cpo|cto|cfo|cmo|cdo|cro|ciso|clo|qa|coo-spec.md`, `docs/pricing-upgrade-plan-2026-07-16.md`, `.claude/research/pricing-upgrade-research-2026-07-16.md`
**Rollout flag:** `NEXT_PUBLIC_UPGRADE_V2` (kill-switch, all new surfaces gated)

---

## 1. Executive Summary

- **What we ship:** Freemium 7-day CC-required Stripe trial, 12-SKU tier matrix across 4 segments (Founder / Investor / Advisor / Accelerator), DB-driven entitlement engine, homepage v2 with segment tabs, compliance-gated equity-for-solution "Request a Call" scaffold, and AU-compliant consent/audit chain — all behind `NEXT_PUBLIC_UPGRADE_V2`.
- **Why it matters:** Investor feedback demands 3 upgrades (freemium, per-segment SKUs, digital-shares scaffold). Base case A$240K ARR by Month 12; bull A$594K ARR (300 founders × A$65 + 60 investor seats × A$110 + 12 accel × A$1,200 + 3 institutional API × A$3,000). Trial→paid target 25–35% (research band).
- **How it stays safe:** All 5 migrations `0073→0077` are additive (no drops); flag rollback in <5 min via `deploy-live.sh`; equity/token surfaces fail-closed on `legal_review_passed=false` + Corps Act s949A/s911A general-advice warning enforced by hash-chained `consent_events` + `audit_events`.
- **Who owns what:** 8 workstreams (W1 Backend/Stripe, W2 UI/Homepage, W3 Onboarding, W4 Analytics, W5 Investor/Accel workspaces, W6 Equity scaffold, W7 QA, W8 Compliance) driven by CTO/CFO/CPO/CMO/CDO/CRO/CISO/CLO/QA/COO agents in isolated worktrees (`/data/worktrees/w1-w8`) to survive autonomous `git reset --hard`.
- **How we know it works:** 12 seeded QA accounts × 5 Playwright journeys = 60 flows; nightly `qa:release-gate.sh` blocks `deploy-live.sh`; Stripe test-clock advances trial 7 days for auto-charge assertion; k6 100 VU p95 < 800 ms checkout; axe WCAG 2.1 AA ≥ 95; hash-chain audit verified nightly.

---

## 2. Ordered Task List (Phase 0 → Phase 4)

Task IDs `T-01xx` (Phase 0/Kickoff), `T-02xx` (Phase 1/Foundation), `T-03xx` (Phase 2/Segment surfaces), `T-04xx` (Phase 3/Compliance + Phase 4/Go-live). Effort: S ≤ 4h, M ≤ 1d, L ≤ 3d.

### Phase 0 — Kickoff (Sprint 0, Wk 0)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| T-0101 | Provision 8 worktrees `/data/worktrees/w{1..8}` off `master`; symlink `knowledge-base/` outside repo | COO | S | `/data/worktrees/*`, `knowledge-base -> /data/knowledge-base` | — |
| T-0102 | Define feature-flag matrix in `.env.example` | CTO | S | `web/.env.example`, `web/src/lib/feature-flags.ts` | — |
| T-0103 | Initialise sprint board + risk register CSV | COO | S | `knowledge-base/upgrade-plan-2026-07-16/coo-sprint-board.md`, `coo-risk-register.csv` | T-0101 |
| T-0104 | Draft ROADMAP + CHANGELOG stubs for v2.0 tag | COO | S | `web/ROADMAP.md`, `web/CHANGELOG.md` | — |
| T-0105 | Provision GA4 property `G-BLOCKID2026` + BQ dataset `analytics_blockid` (australia-southeast1) | CDO | M | Vault creds; `.env` `GA4_MEASUREMENT_ID`, `BQ_*` | — |
| T-0106 | Create Stripe test-mode products/prices for 10 non-custom SKUs via `seed-stripe.ts` | CFO | M | `web/scripts/seed-stripe.ts`, Stripe dashboard | T-0102 |
| T-0107 | Author `clo-checklist.md` (20-item counsel sign-off list) | CLO | S | `knowledge-base/upgrade-plan-2026-07-16/clo-checklist.md` | — |
| T-0108 | Publish voice/tone guide + banned-words list | CMO | S | `web/content/marketing/voice-guide.md` | — |

### Phase 1 — Data + Entitlement Foundation (Sprint 1, Wk 1-2)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| T-0201 | Write + apply migration `0073_user_segments_and_jurisdiction.sql` | CTO+CISO | M | `web/supabase/migrations/0073_user_segments_and_jurisdiction.sql` | T-0102 |
| T-0202 | Write + apply migration `0074_plans_matrix_and_gst.sql` (seed 12 SKUs, stripe IDs nullable) | CTO+CFO | M | `web/supabase/migrations/0074_plans_matrix_and_gst.sql` | T-0106 |
| T-0203 | Write + apply migration `0075_entitlements_trial_and_webhook_state.sql` | CTO+CISO | M | `web/supabase/migrations/0075_entitlements_trial_and_webhook_state.sql` | T-0201 |
| T-0204 | Write + apply migration `0076_compliance_and_equity.sql` (consent, audit, disclaimers, wholesale, equity_requests) | CLO+CISO | L | `web/supabase/migrations/0076_compliance_and_equity.sql` | T-0203 |
| T-0205 | Write + apply migration `0077_analytics_and_conversion.sql` (analytics_events, conversion_events, ab_*, churn, lifecycle) | CDO+CRO | L | `web/supabase/migrations/0077_analytics_and_conversion.sql` | T-0204 |
| T-0206 | `web/scripts/build-plans.ts` — zod-validate `plans.csv`, emit `plans.generated.ts` + Stripe seed JSON | CFO | M | `web/src/config/pricing/plans.csv`, `web/scripts/build-plans.ts` | T-0202 |
| T-0207 | `web/src/lib/plans-db.ts` — 60s TTL cache, `getPlansCached`, `revalidateTag("plans")` | CTO | M | `web/src/lib/plans-db.ts`, `web/src/lib/plans.ts` (thin re-export) | T-0206 |
| T-0208 | `web/src/lib/entitlements.ts` — `can()`, `requireFeature()`, `usageRemaining()`, audit-log writes | CTO | M | `web/src/lib/entitlements.ts` | T-0207 |
| T-0209 | `web/src/lib/gst.ts` + unit tests (10 AU/non-AU × registered/not cases) | CFO | S | `web/src/lib/gst.ts`, `web/src/lib/__tests__/gst.test.ts` | T-0202 |
| T-0210 | `web/src/lib/trial.ts` — `isInTrial`, `trialEndsAt`, `daysRemaining` | CTO | S | `web/src/lib/trial.ts` | T-0203 |
| T-0211 | `web/src/lib/jurisdiction.ts` — IP+declared+billing triangulation + middleware cookie `bid_jur` | CISO | M | `web/src/lib/jurisdiction.ts`, `web/src/middleware.ts` | T-0201 |
| T-0212 | `web/src/lib/consent.ts` — append-only `recordConsent()` | CISO | S | `web/src/lib/consent.ts` | T-0204 |
| T-0213 | `web/src/lib/audit.ts` — HMAC-salted `appendAudit()` + `verify-audit-chain.ts` cron script | CISO | M | `web/src/lib/audit.ts`, `web/scripts/verify-audit-chain.ts` | T-0204 |
| T-0214 | `web/src/lib/legal/{gates,versions,surfaces}.ts` — `assertWholesale`, `assertLegalReview`, `requireAck` | CLO | M | `web/src/lib/legal/*.ts` | T-0204 |
| T-0215 | `web/src/lib/stripe/verify.ts` — signature+idempotency+replay window (300s) | CISO | S | `web/src/lib/stripe/verify.ts` | T-0203 |
| T-0216 | Extend `api/stripe/checkout/route.ts` — `trial_period_days=7`, `payment_method_collection=always`, `end_behavior.missing_payment_method=cancel` | CTO+CFO | M | `web/src/app/api/stripe/checkout/route.ts` | T-0208, T-0215 |
| T-0217 | Extend `api/stripe/webhook/route.ts` — `trial_will_end`, `updated`, `deleted`, `setup_intent.succeeded`; write `subscription_trial_state`, `stripe_webhook_events`, `revenue_events` (GST split) | CTO+CFO | L | `web/src/app/api/stripe/webhook/route.ts` | T-0216 |
| T-0218 | `api/stripe/change-plan/route.ts` — validate segment×plan | CTO | S | `web/src/app/api/stripe/change-plan/route.ts` | T-0207 |
| T-0219 | `api/stripe/trial-status/route.ts` (GET) — banner countdown | CTO | S | `web/src/app/api/stripe/trial-status/route.ts` | T-0210 |
| T-0220 | Refactor `credits.ts` — `PLAN_CREDITS` reads `plans.usage_limits->>'monthly_credits'` (fallback map) | CTO | M | `web/src/lib/credits.ts` | T-0207 |
| T-0221 | Grep-sweep: `plan === "growth"`, `email === "admin@blockid.au"`, `account_type === "investor"` → replace with `can()` | CTO | M | across `web/src/**` | T-0208 |
| T-0222 | Add CI grep-gate: `rg 'plan === "' web/src` returns 0 | CTO | S | `scripts/ci-grep-gate.sh` | T-0221 |

### Phase 2 — Segment Surfaces + UX (Sprint 2, Wk 3-4)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| T-0301 | `web/src/lib/segments.ts` — `Segment`, `PlanId` types; refactor `NavItem`/`NavGroup` | CPO | S | `web/src/lib/segments.ts` | T-0208 |
| T-0302 | Extract `NAV_GROUPS` → `nav-groups.ts` with `minPlan`+`segments[]` on every item | CPO | M | `web/src/components/workspace/nav-groups.ts` | T-0301 |
| T-0303 | `useEntitlement()` hook → `/api/entitlement/me` | CPO | S | `web/src/hooks/useEntitlement.ts` | T-0208 |
| T-0304 | `<FeatureGate>` component (server+client safe) with upgrade-CTA fallback slot | CTO+CPO | S | `web/src/components/access/FeatureGate.tsx` | T-0208 |
| T-0305 | Refactor `<UpgradePrompt>` to consume `EntitlementDeniedEvent` payload; `useUpgradePrompt()` hook | CPO | M | `web/src/components/ui/upgrade-prompt.tsx`, `web/src/hooks/useUpgradePrompt.ts` | T-0304 |
| T-0306 | `<TrialBanner>` in `workspace-layout.tsx` header (amber day 5-6, red day 7) | CPO | S | `web/src/components/workspace/trial-banner.tsx`, `workspace-layout.tsx` | T-0219 |
| T-0307 | Rewrite `hero.tsx` — "Get Fundable in 7 Days" H1, sub, trust strip, 2 CTAs | CPO+CMO | S | `web/src/components/landing/hero.tsx` | T-0108 |
| T-0308 | New `<SegmentTabs>` component (Founder/Investor/Advisor/Accelerator) | CPO+CMO | M | `web/src/components/landing/segment-tabs.tsx` | T-0301 |
| T-0309 | New `<PricingMatrix segment=…>` — 4 segment tabs × 3-4 SKU cards; "Most Popular" highlight; Contact sales for Enterprise/VC-Ent | CPO+CFO | L | `web/src/components/landing/pricing-matrix.tsx`, `web/src/lib/plans-v2.ts` | T-0207 |
| T-0310 | `<TrialStrip>` sticky footer strip on homepage | CPO+CMO | S | `web/src/components/landing/trial-strip.tsx` | T-0307 |
| T-0311 | Swap `web/src/app/page.tsx` sections → Hero → SegmentTabs → SocialProof → Bento → Pricing → FAQ → CTA (gated by `NEXT_PUBLIC_UPGRADE_V2`) | CPO | S | `web/src/app/page.tsx` | T-0307–T-0310 |
| T-0312 | Update FAQ with 6 new Q&As (trial, refund, card required, equity-for-solution, digital shares, segment switch) | CPO+CMO | S | `web/src/components/landing/faq.tsx` | T-0311 |
| T-0313 | New `/pricing` route wrapping `<PricingMatrix>` (direct-link for ads) | CPO | S | `web/src/app/pricing/page.tsx` | T-0309 |
| T-0314 | Onboarding shell `/onboarding` + `OnboardingWizard.tsx` (useReducer, URL step) | CPO | M | `web/src/app/onboarding/page.tsx`, `OnboardingWizard.tsx` | T-0301 |
| T-0315 | `StepSegment`, `StepGoal`, `StepTier`, `StepTrial`, `StepPayment` (Stripe Elements) | CPO | L | `web/src/components/onboarding/Step*.tsx` | T-0314 |
| T-0316 | `/for/[segment]` dynamic route (founders/investors/advisors/accelerators) MDX loader | CMO+CTO | M | `web/src/app/(marketing)/for/[segment]/page.tsx` | T-0311 |
| T-0317 | `/vs/[competitor]` comparison pages (cake/carta/foundersuite/visible/f6s/angellist) | CMO | M | `web/src/app/(marketing)/vs/[competitor]/page.tsx` | T-0311 |
| T-0318 | `/pricing/[tier]` deep-link pages, 12 SKUs | CMO | L | `web/src/app/(marketing)/pricing/[tier]/page.tsx` | T-0313 |
| T-0319 | `homepage-v2.{en,vi}.md` + `segments/*.md` (EN+VI) + `tiers/*.md` (12 SKUs EN+VI) | CMO | L | `web/content/marketing/**` | T-0108 |
| T-0320 | `seo-map.json` + `next-sitemap` + hreflang wiring | CMO+CTO | S | `web/content/marketing/seo-map.json`, `next-sitemap.config.js` | T-0316–T-0318 |

### Phase 3 — Analytics, Conversion, Investor/Accel Workspaces (Sprint 3, Wk 5-6)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| T-0401 | `web/src/lib/analytics/events.ts` — 20 typed events + zod PII rejection | CDO | M | `web/src/lib/analytics/events.ts` | T-0205 |
| T-0402 | `web/src/lib/analytics/consent.ts` — AU consent-mode v2 (default deny) | CDO+CLO | S | `web/src/lib/analytics/consent.ts` | T-0212 |
| T-0403 | `web/src/lib/analytics/server.ts` — Measurement Protocol + Supabase mirror | CDO | M | `web/src/lib/analytics/server.ts` | T-0401 |
| T-0404 | `POST /api/analytics/ingest` — batched writes to `analytics_events` | CDO | S | `web/src/app/api/analytics/ingest/route.ts` | T-0403 |
| T-0405 | `<ConsentBanner/>` mount in `app/layout.tsx` + gtag `consent default = denied` | CDO+CPO | M | `web/src/components/analytics/consent-banner.tsx`, `app/layout.tsx` | T-0402 |
| T-0406 | Instrument critical events 1–8, 11, 18 in Stripe/auth/entitlement paths | CDO+CTO+CFO | M | `web/src/lib/stripe.ts`, `entitlements.ts`, `auth/*` | T-0401 |
| T-0407 | Instrument events 9, 10, 16, 17, 20 (reports, dashboard, credits, agents) | CDO | S | across `web/src/app/**` | T-0401 |
| T-0408 | Instrument equity events 12, 13 with `disclaimer_shown=true` guard | CDO+CLO | S | `web/src/app/api/equity/request/route.ts` | T-0212 |
| T-0409 | `web/scripts/bq-export-events.ts` + cron `15 2 * * *` (idempotent via `event_id` UUID MERGE) | CDO | M | `web/scripts/bq-export-events.ts`, `/etc/cron.d/blockid` | T-0403 |
| T-0410 | `web/src/lib/conversion/triggers.ts` + `experiments.ts` (deterministic hash bucketing) + `lifecycle.ts` | CRO | M | `web/src/lib/conversion/*.ts` | T-0205 |
| T-0411 | `web/config/experiments.json` — 4 launch A/B (trial_cc_required, pricing_anchor_order, cap_hit_copy, day5_email_subject) | CRO | S | `web/config/experiments.json` | T-0410 |
| T-0412 | `<UpgradeModal>` + `<UpgradeBanner>` (1-per-session cap, 24h cool-down per trigger) | CRO+CPO | M | `web/src/components/upsell/*.tsx` | T-0304, T-0410 |
| T-0413 | `POST /api/conversion/track`, `/api/experiments/expose` | CRO | S | `web/src/app/api/conversion/track/route.ts`, `experiments/expose/route.ts` | T-0410 |
| T-0414 | Lifecycle email templates (React Email): day0/3/5/6/7/14/winback | CRO+CMO | M | `web/src/emails/lifecycle/*.tsx` | T-0410 |
| T-0415 | `web/cron/lifecycle-mailer.mjs` — cron `*/15 * * * *`, guarded by `lifecycle_state` unique upsert + `select … for update skip locked` | CRO | M | `web/cron/lifecycle-mailer.mjs`, `/etc/cron.d/blockid` | T-0414 |
| T-0416 | Stripe coupons `COMEBACK30`, `DOWNGRADE_STARTER50` via CLI; pin IDs | CFO+CRO | S | `web/src/lib/stripe.ts` | T-0106 |
| T-0417 | `<ExitSurvey>` + `<DowngradeOffer>` in `api/stripe/cancel` flow | CRO+CPO | M | `web/src/components/churn/*.tsx`, `api/stripe/cancel/route.ts` | T-0416 |
| T-0418 | Retention crons per segment (`web/cron/weekly-retention.mjs`) | CRO | M | `web/cron/weekly-retention.mjs` | T-0415 |
| T-0419 | Investor workspace (deal-flow inbox, watchlist, saved-search digest) | CTO+CPO | L | `web/src/app/workspace/investor/**` | T-0201, T-0208 |
| T-0420 | Advisor workspace (client roster, engagement notes, per-client SVI) | CTO+CPO | L | `web/src/app/workspace/advisor/**` | T-0201 |
| T-0421 | Accelerator workspace (cohort mgmt, batch SVI, LP-ready quarterly report) | CTO+CPO | L | `web/src/app/workspace/accelerator/**` | T-0201 |
| T-0422 | CFO admin dashboard tile `/admin` (MRR, ARR, GST accrual, runway) | CFO | L | `web/src/app/admin/pricing-metrics/page.tsx` | T-0217, T-0409 |
| T-0423 | Metabase/Looker dashboards: Trial funnel, SKU MRR, Gate-hit heatmap, Equity offer pipeline | CDO | S | `docs/analytics/dashboards.md` | T-0409 |

### Phase 4 — Compliance, QA, Deploy (Sprint 4, Wk 7-8)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| T-0424 | Seed disclaimer registry (AU/GLOBAL × not_financial_advice, equity_offer, share_issuance, trial, tos, privacy) | CLO | S | seed SQL | T-0204 |
| T-0425 | `<NotFinancialAdvice/>`, `<withDisclaimer>` HOC, PDF/DOCX footer stamper | CLO+CISO | M | `web/src/components/legal/*.tsx`, `web/src/lib/pdf/disclaimer-footer.ts` | T-0424 |
| T-0426 | `<AdviceWarningModal>`, `<AutoRenewNotice>`, `<WholesaleGate>`, `<PrivacyBanner>` | CLO | M | `web/src/components/legal/*.tsx` | T-0425 |
| T-0427 | `POST /api/legal/{ack,wholesale-verify}`, `GET /api/legal/current-versions` | CLO | S | `web/src/app/api/legal/**` | T-0426 |
| T-0428 | Wire ToS/Privacy v2 MDX + change-log; effective_from = launch+14d (ACL notice) | CLO | M | `web/content/legal/{terms,privacy}-v2.mdx`, `change-log.md` | T-0424 |
| T-0429 | Disclaimer MDX 5 surfaces × 2 locales (10 files) — [VERIFY-COUNSEL] | CLO | M | `web/content/legal/disclaimers/**` | T-0424 |
| T-0430 | `POST /api/equity/request` intake (always 202, writes `equity_requests`+`consent_events`+`audit_events`) | CLO+CISO | M | `web/src/app/api/equity/request/route.ts` | T-0427 |
| T-0431 | Static grep gate: no `blockchain-sync|tokenization` reachable from equity path unless `legal_review_passed=true` | CISO | S | `scripts/verify-equity-gate.sh` | T-0430 |
| T-0432 | `scripts/seed-test-users.mjs` — 12 accounts × states (idempotent) | QA | M | `scripts/seed-test-users.mjs` | T-0203 |
| T-0433 | `scripts/stripe-mock-webhook.mjs` — HMAC-signed synthetic events + `--at T+Nd` clock offset | QA | S | `scripts/stripe-mock-webhook.mjs` | T-0217 |
| T-0434 | Playwright fixtures `accounts.ts`, `stripe.ts` (advanceTrialClock, simulatePaymentFailure, assertEntitlement) | QA | S | `web/tests/e2e/fixtures/*.ts` | T-0432 |
| T-0435 | Journey specs 01-signup-trial → 05-cancel-reactivate × 12 accounts | QA | L | `web/tests/e2e/journeys/*.spec.ts` | T-0434 |
| T-0436 | Regression specs: menu-visibility, gate-blocks, credits, disclaimers, equity-request-call | QA | M | `web/tests/e2e/regression/*.spec.ts` | T-0435 |
| T-0437 | Visual regression baseline (light+dark, desktop+mobile) + axe a11y sweep 20 routes | QA | M | `web/tests/e2e/visual/*.spec.ts`, `a11y/axe.spec.ts` | T-0311 |
| T-0438 | k6 load: pricing (100 VU p95<400ms), checkout (20 VU p95<800ms) | QA | M | `web/tests/load/*.js` | T-0217 |
| T-0439 | `scripts/qa-release-gate.sh` — orchestrator; wire into `deploy-live.sh` pre-flight | QA+COO | S | `scripts/qa-release-gate.sh`, `deploy-live.sh` | T-0435–T-0438 |
| T-0440 | Cron `trial-end-reminder.ts`, `dunning-retry.ts`, `weekly-metrics.ts`, `coo-daily-standup.ts` | COO+CFO+CTO | M | `scripts/cron/*.ts`, `/etc/cron.d/blockid` | T-0217 |
| T-0441 | Nightly `verify-audit-chain` + `qa:all` cron; results into `web/content/reports/*.md` + `cron-health.jsonl` | CISO+QA | S | `/etc/cron.d/blockid`, `web/content/reports/cron-health.jsonl` | T-0213, T-0439 |
| T-0442 | `security-audit` skill run — CSP + RLS on all new tables + webhook signature | CISO | M | audit report | all |
| T-0443 | `code-review --fix` sweep across W1-W8 diffs | COO+CTO | M | — | all |
| T-0444 | Staged rollout via `NEXT_PUBLIC_UPGRADE_V2` — 10% → 50% → 100% over 5 days | COO+CTO | M | env flip + `deploy-live.sh` | T-0442, T-0443 |
| T-0445 | Announce v2.0 (insights article + email + Telegram + LinkedIn + F6S + Vietnamese Zalo) | CMO+COO | M | `web/content/marketing/launch/2026-07-launch.md` | T-0444 |
| T-0446 | Retro + metrics readout + investor update | COO+CEO | S | `knowledge-base/upgrade-plan-2026-07-16/coo-retro.md` | T-0444 |

**Total: ~90 tasks.** Blocking chain: `T-0201 → T-0207 → T-0208 → all Phase 2/3/4 gates`. CTO must ship T-0201..T-0208 by Wk1 Day 4 or Sprint 1 slips.

---

## 3. Migration Order (`0073 → 0077`, additive only)

All migrations applied via `docker exec supabase-db psql` + `NOTIFY pgrst, 'reload schema'` per `reference_db_migrations.md`. No drops; every column `if not exists`; every table guarded.

### `0073_user_segments_and_jurisdiction.sql`

```sql
-- Segment axis (CTO + CISO account_type expansion)
alter table app_users
  add column if not exists segment text not null default 'founder',
  add column if not exists jurisdiction_declared text,
  add column if not exists jurisdiction_ip text,
  add column if not exists jurisdiction_billing text,
  add column if not exists jurisdiction_effective text;

alter table app_users
  drop constraint if exists app_users_account_type_check;

alter table app_users
  add constraint app_users_segment_check check (segment in
    ('founder','investor_angel','investor_vc','advisor','accelerator','lp','admin'));

update app_users set segment = case
  when account_type = 'investor' then 'investor_angel'
  when account_type = 'journalist' then 'advisor'
  else 'founder' end
where segment = 'founder';

create index if not exists app_users_segment_idx on app_users(segment);

create table if not exists jurisdiction_history (
  id bigserial primary key,
  user_id uuid references app_users(id) on delete cascade,
  effective text, signals jsonb, confidence text,
  created_at timestamptz not null default now()
);
```

### `0074_plans_matrix_and_gst.sql`

```sql
create table if not exists plans (
  id text primary key,
  segment text not null,
  display_name text not null,
  price_aud_cents integer not null,
  interval text not null check (interval in ('once','monthly','yearly','custom')),
  trial_days integer not null default 0,
  stripe_price_id text,
  stripe_price_id_yearly text,
  feature_flags jsonb not null default '[]'::jsonb,
  usage_limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_segment_active_idx on plans(segment, is_active, sort_order);

-- Seed 12 SKUs (Stripe IDs backfilled by T-0106)
insert into plans(id,segment,display_name,price_aud_cents,interval,trial_days,feature_flags,usage_limits,sort_order) values
 ('founder_free','founder','Free',0,'once',0,'["svi.run.limited"]','{"profiles":1,"svi_per_month":1,"monthly_credits":0}',10),
 ('founder_starter','founder','Starter',2900,'monthly',7,'["svi.run","evidence.upload","report.basic"]','{"profiles":1,"svi_per_month":10,"monthly_credits":200}',20),
 ('founder_growth','founder','Growth',9900,'monthly',7,'["cap_table.write","data_room.read","term_sheet.ai","investor_links"]','{"profiles":3,"svi_per_month":50,"monthly_credits":800}',30),
 ('founder_scale','founder','Scale',29900,'monthly',7,'["esop.manage","blockchain.sync","advisor_portal","white_label"]','{"profiles":10,"svi_per_month":9999,"monthly_credits":3000}',40),
 ('founder_enterprise','founder','Enterprise',150000,'custom',0,'["sso","api","multi_entity","sla"]','{"profiles":9999,"svi_per_month":99999,"monthly_credits":9999}',50),
 ('investor_angel','investor_angel','Angel',7900,'monthly',7,'["watchlist","svi.feed","diligence_pack"]','{"watchlist":25,"diligence_packs":5,"seats":1,"monthly_credits":400}',60),
 ('investor_advisor','advisor','Advisor',14900,'monthly',7,'["cohort.view","white_label","advisory_equity"]','{"cohort":25,"seats":1,"monthly_credits":1000}',70),
 ('investor_vc_small','investor_vc','VC Small',34900,'monthly',7,'["portfolio","lp_export","svi.feed"]','{"seats":5,"portfolio":50,"monthly_credits":3500}',80),
 ('investor_vc_ent','investor_vc','VC Enterprise',250000,'custom',0,'["api","custom_benchmark","multi_fund"]','{"seats":25,"portfolio":9999}',90),
 ('accel_starter','accelerator','Cohort Starter',50000,'monthly',7,'["cohort.manage","weekly_delta"]','{"founders":15,"seats":3,"monthly_credits":5000}',100),
 ('accel_growth','accelerator','Cohort Growth',150000,'monthly',7,'["cohort.manage","lp_report","weekly_delta"]','{"founders":50,"seats":5,"monthly_credits":20000}',110),
 ('accel_enterprise','accelerator','Cohort Enterprise',350000,'monthly',7,'["cohort.manage","lp_report","api","white_label"]','{"founders":100,"seats":10,"monthly_credits":80000}',120)
on conflict (id) do update set display_name=excluded.display_name, price_aud_cents=excluded.price_aud_cents,
  feature_flags=excluded.feature_flags, usage_limits=excluded.usage_limits, updated_at=now();

-- GST + revenue ledger (CFO)
create table if not exists org_tax_state (
  org_id uuid primary key,
  rolling_12mo_turnover_aud numeric(14,2) not null default 0,
  gst_registered_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists revenue_events (
  id bigserial primary key,
  stripe_invoice_id text unique,
  plan_id text references plans(id),
  customer_id text,
  amount_ex_gst_aud numeric(12,2),
  gst_amount_aud numeric(12,2),
  country text,
  occurred_at timestamptz not null default now()
);

-- Public read (pricing page anonymous); admin write only
alter table plans enable row level security;
create policy plans_public_read on plans for select using (is_active);
```

### `0075_entitlements_trial_and_webhook_state.sql`

```sql
create table if not exists subscription_trial_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  stripe_subscription_id text not null,
  plan_id text not null references plans(id),
  trial_start timestamptz not null,
  trial_end timestamptz not null,
  status text not null check (status in ('trialing','active','past_due','canceled','ended')),
  payment_method_id text,
  reminder_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists entitlement_events (
  id bigserial primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  feature text not null,
  allowed boolean not null,
  plan_id text,
  reason text,
  request_path text,
  created_at timestamptz not null default now()
);
create index entitlement_events_user_time_idx on entitlement_events(user_id, created_at desc);
create index entitlement_events_feature_idx on entitlement_events(feature, allowed);

create table if not exists stripe_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  signature_ok boolean not null,
  payload_hash text not null
);

alter table entitlement_events enable row level security;
create policy ee_self_read on entitlement_events for select using (user_id = auth.uid());
```

### `0076_compliance_and_equity.sql`

Merges CLO (`0073_compliance_gates`) + CISO (`0076_consent_events`, `0077_audit_events`, `0080_equity_requests`, `0082_disclaimer_registry`).

```sql
-- Disclaimer registry (immutable per version)
create table if not exists disclaimers (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('AU','NZ','US','EU','GB','GLOBAL')),
  category text not null,
  version text not null,
  hash text not null,
  body_md text not null,
  locale text not null default 'en',
  effective_from timestamptz not null default now(),
  superseded_at timestamptz,
  unique (region, category, version, locale)
);

-- Legal versions + acknowledgements
create table if not exists legal_versions (
  surface text primary key,
  version text not null,
  effective_from timestamptz not null default now(),
  content_hash text not null,
  locale text not null default 'en'
);

create table if not exists legal_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  surface text not null, version text not null, locale text not null,
  ack_at timestamptz not null default now(), ip inet, user_agent text,
  unique (user_id, surface, version)
);

-- Consent events (append-only)
create table if not exists consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete restrict,
  category text not null check (category in
    ('tos','privacy','not_financial_advice','trial_optin','equity_request','share_issuance','marketing')),
  disclaimer_id uuid references disclaimers(id),
  disclaimer_hash text not null,
  ip inet, user_agent text, jurisdiction text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index consent_user_cat_idx on consent_events(user_id, category, created_at desc);
create rule consent_no_update as on update to consent_events do instead nothing;
create rule consent_no_delete as on delete to consent_events do instead nothing;

-- Audit chain (HMAC-salted)
create table if not exists audit_events (
  id bigserial primary key,
  actor_id uuid, action text not null,
  subject_type text not null, subject_id text not null,
  payload jsonb not null,
  prev_hash bytea not null, row_hash bytea not null,
  created_at timestamptz not null default now()
);
create unique index audit_row_hash_idx on audit_events(row_hash);
create rule audit_no_update as on update to audit_events do instead nothing;
create rule audit_no_delete as on delete to audit_events do instead nothing;

-- Wholesale investor verification (s708)
create table if not exists wholesale_investor_verifications (
  user_id uuid primary key references app_users(id) on delete cascade,
  method text not null check (method in ('accountant_certificate','net_assets','gross_income','professional')),
  evidence_url text, verified_by uuid,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','approved','rejected','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Equity requests (fail-closed)
create table if not exists equity_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id),
  startup_id uuid,
  request_type text not null check (request_type in ('equity_for_solution','digital_shares','secondary')),
  proposed_equity_pct numeric(5,2),
  status text not null default 'received'
    check (status in ('received','triage','legal_review','approved','rejected','withdrawn')),
  legal_review_passed boolean not null default false,
  compliance_notes text,
  consent_event_id uuid references consent_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- User-level compliance flags
alter table app_users
  add column if not exists tos_version_accepted text,
  add column if not exists privacy_version_accepted text,
  add column if not exists advice_warning_ack_at timestamptz,
  add column if not exists auto_renew_ack_at timestamptz,
  add column if not exists nda_signed_at timestamptz;

-- Per-startup compliance flags
alter table startup_profiles
  add column if not exists legal_review_passed boolean not null default false,
  add column if not exists legal_review_passed_at timestamptz,
  add column if not exists legal_review_notes text,
  add column if not exists csf_offer_live boolean not null default false,
  add column if not exists s708_offer_active boolean not null default false,
  add column if not exists ess_scheme_active boolean not null default false,
  add column if not exists tokenised_share_display_enabled boolean not null default false;

-- RLS
alter table consent_events enable row level security;
create policy consent_self_read on consent_events for select using (user_id = auth.uid());
alter table audit_events enable row level security;
create policy audit_admin_read on audit_events for select using (
  exists (select 1 from app_users where id = auth.uid() and segment = 'admin'));
alter table equity_requests enable row level security;
create policy equity_self_rw on equity_requests for all using (user_id = auth.uid());
```

### `0077_analytics_and_conversion.sql`

Merges CDO (`0077_ga4_events_mirror`) + CRO (`0073_conversion_events`, `0074_experiments`, `0075_churn_events`, `0076_lifecycle_state`).

```sql
create table if not exists analytics_events (
  id bigserial primary key,
  event_id uuid not null default gen_random_uuid() unique,
  event_name text not null,
  event_date date not null default (now() at time zone 'utc')::date,
  ts timestamptz not null default now(),
  user_id_hash text, session_id text,
  plan_tier text, plan_segment text, account_type text, is_trial boolean,
  experiment_id text, params jsonb not null default '{}'::jsonb,
  ingested_from text not null check (ingested_from in ('client','server','stripe','cron'))
);
create index ae_name_date_idx on analytics_events(event_name, event_date);
create index ae_user_idx on analytics_events(user_id_hash);
create index ae_params_gin on analytics_events using gin(params);

create table if not exists conversion_events (
  id bigserial primary key,
  user_id uuid references app_users(id) on delete cascade,
  session_id text, segment text, event text not null,
  source text, target_plan text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ab_assignments (
  user_id uuid references app_users(id) on delete cascade,
  exp_key text not null, variant text not null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, exp_key)
);
create table if not exists ab_exposures (
  id bigserial primary key, user_id uuid, exp_key text not null,
  variant text not null, event text,
  created_at timestamptz not null default now()
);

create table if not exists churn_events (
  id bigserial primary key,
  user_id uuid references app_users(id) on delete cascade,
  from_plan text, to_plan text,
  reason_code text, reason_text text,
  offer_shown text, offer_taken boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists lifecycle_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  trial_started timestamptz,
  day0_sent_at timestamptz, day3_sent_at timestamptz, day5_sent_at timestamptz,
  day6_sent_at timestamptz, day7_sent_at timestamptz, day14_sent_at timestamptz,
  winback_sent_at timestamptz
);

-- Views for CFO/CMO dashboards
create or replace view v_trial_cohorts as
  select event_date as cohort_date, plan_tier, plan_segment, count(*) trials
  from analytics_events where event_name='trial_start' group by 1,2,3;

create or replace view v_trial_conversion as
  with s as (select user_id_hash, min(ts) t0, max(plan_tier) sku from analytics_events where event_name='trial_start' group by 1),
       c as (select user_id_hash, min(ts) t1 from analytics_events where event_name='subscribe' group by 1)
  select s.sku, count(*) trials, count(c.user_id_hash) converted,
         round(100.0*count(c.user_id_hash)/nullif(count(*),0),2) conv_pct
  from s left join c using (user_id_hash) where c.t1 is null or c.t1 between s.t0 and s.t0 + interval '14 days'
  group by 1;

create or replace view v_gate_hit_funnel as
  select params->>'feature_key' feature, params->>'required_tier' tier,
         count(*) hits, count(distinct user_id_hash) users
  from analytics_events where event_name='feature_gate_hit' group by 1,2 order by hits desc;

-- RLS: analytics_events self-read
alter table analytics_events enable row level security;
create policy ae_self_read on analytics_events for select using (
  user_id_hash = encode(digest(auth.uid()::text || current_setting('app.hash_salt'), 'sha256'),'hex'));
```

---

## 4. 12-SKU Pricing Matrix

All prices AUD ex-GST. GST applied only when `orgIsRegistered=true` AND customer country `AU` (see T-0209). Annual = 10× monthly (17% saving vs 12×). Trial = 7 days CC-required unless flagged.

| # | id | Segment | Display Name | Monthly A$ | Annual A$ | Trial | ARPU | CAC ceil | LTV | GM% | Payback | Feature flags | Usage limits |
|---|----|---------|--------------|-----------:|----------:|:-----:|-----:|--------:|----:|----:|--------:|---------------|--------------|
| 1 | `founder_free` | founder | Free (anon) | 0 | 0 | — | — | — | — | — | — | `svi.run.limited` | 1 profile, 1 SVI/mo, 0 credits |
| 2 | `founder_starter` | founder | Starter | 29 | 290 | 7d | 29 | 90 | 350 | 82 | 3.8 | `svi.run`, `evidence.upload`, `report.basic` | 1/10/200 |
| 3 | `founder_growth` | founder | **Growth** ★ | 99 | 990 | 7d | 99 | 300 | 1,400 | 84 | 3.6 | +`cap_table.write`, `data_room.read`, `term_sheet.ai`, `investor_links` | 3/50/800 |
| 4 | `founder_scale` | founder | Scale | 299 | 2,990 | 7d | 299 | 900 | 5,200 | 85 | 3.5 | +`esop.manage`, `blockchain.sync`, `advisor_portal`, `white_label` | 10/9999/3000 |
| 5 | `founder_enterprise` | founder | Enterprise | custom (≥1,500) | annual | 14d | — | — | — | — | — | +`sso`, `api`, `multi_entity`, `sla` | 9999/99999/9999 |
| 6 | `investor_angel` | investor_angel | Angel | 79 | 790 | 7d | 79 | 240 | 1,100 | 86 | 3.5 | `watchlist`, `svi.feed`, `diligence_pack` | 25 watch, 5 packs |
| 7 | `investor_advisor` | advisor | Advisor | 149 | 1,490 | 7d | 149 | 450 | 2,400 | 86 | 3.5 | `cohort.view`, `white_label`, `advisory_equity` | 25 cohort |
| 8 | `investor_vc_small` | investor_vc | VC Small | 349 (5-seat min) | 3,490 | 7d | 349 | 1,050 | 6,800 | 87 | 3.4 | `portfolio`, `lp_export`, `svi.feed` | 5 seats, 50 portfolio |
| 9 | `investor_vc_ent` | investor_vc | VC Enterprise | custom (≥2,500) | annual | 14d | — | — | — | — | — | +`api`, `custom_benchmark`, `multi_fund` | 25 seats |
| 10 | `accel_starter` | accelerator | Cohort Starter | 500 | 5,000 | 14d | 500 | 1,500 | 8,000 | 80 | 3.75 | `cohort.manage`, `weekly_delta` | ≤15 founders |
| 11 | `accel_growth` | accelerator | Cohort Growth | 1,500 | 15,000 | 14d | 1,500 | 4,500 | 27,000 | 80 | 3.75 | +`lp_report` | ≤50 founders |
| 12 | `accel_enterprise` | accelerator | Cohort Enterprise | 3,500 (+A$50/founder over 100) | 35,000 | 14d | 3,500 | 10,500 | 70,000 | 80 | 3.75 | +`api`, `white_label` | 100+ founders |

Add-ons (metered): credit packs A$5/10, A$15/50, A$25/100 · extra profile A$10/mo · Term Sheet AI 1 credit/doc · AU compliance pack A$49/report · Investor-Ready Report A$99 · Data-room concierge A$499 flat · Extra investor seat A$79/seat/mo · Institutional API A$1,000/mo · SVI Index license A$5,000/mo.

**Base 12-month projection:** MRR A$85K / ARR A$1.02M / 1,200 paid subs. **Bull:** A$180K MRR / A$2.16M ARR (assumes 1 accelerator white-label at `accel_enterprise`).

---

## 5. Menu Matrix (segment × plan visibility)

`nav-groups.ts` items carry `minPlan` + `segments[]`. Items above entitlement render dimmed with `<Lock/>` chip and fire `EntitlementDeniedEvent` on click.

| Nav item | Founder Free | Founder Starter | Founder Growth | Founder Scale | Founder Ent | Investor Angel | Advisor | VC Small | VC Ent | Accel S | Accel G | Accel E |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Overview | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SVI Score | ✅(anon) | ✅ | ✅ | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| Evidence Upload | 🔒 | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — | — | — |
| Reports (basic) | ✅(10pg) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cap Table | 🔒 | 🔒 | ✅ | ✅ | ✅ | — | — | — | — | — | — | — |
| Data Room | 🔒 | 🔒 | ✅(read) | ✅(rw) | ✅ | 🔒 | ✅ | ✅ | ✅ | — | — | — |
| Term Sheet AI | 🔒 | 🔒 | ✅ | ✅ | ✅ | — | — | — | — | — | — | — |
| Investor Links | 🔒 | 🔒 | ✅ | ✅ | ✅ | — | — | — | — | — | — | — |
| ESOP / Vesting | 🔒 | 🔒 | 🔒 | ✅ | ✅ | — | — | — | — | — | — | — |
| Blockchain Sync | 🔒 | 🔒 | 🔒 | ✅ | ✅ | — | — | — | — | — | — | — |
| Advisor Portal | — | — | — | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| White Label | — | — | — | ✅ | ✅ | — | ✅ | — | ✅ | — | — | ✅ |
| SSO / API / Multi-entity | — | — | — | — | ✅ | — | — | — | ✅ | — | — | ✅ |
| Deal Flow Inbox | — | — | — | — | — | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Watchlist | — | — | — | — | — | ✅(25) | ✅ | ✅ | ✅ | — | — | — |
| Diligence Packs | — | — | — | — | — | ✅(5) | ✅ | ✅ | ✅ | — | — | — |
| Portfolio | — | — | — | — | — | 🔒 | 🔒 | ✅(50) | ✅ | — | — | — |
| LP Export / Report | — | — | — | — | — | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
| Custom Benchmarks | — | — | — | — | — | 🔒 | 🔒 | 🔒 | ✅ | — | — | — |
| Cohort Manage | — | — | — | — | — | — | 🔒 | — | — | ✅ | ✅ | ✅ |
| Weekly Delta | — | — | — | — | — | — | 🔒 | — | — | ✅ | ✅ | ✅ |
| Equity Offer (Request-a-Call) | 🔒 | 🔒 | 🔒 | 🔒(gated) | 🔒(gated) | — | — | — | — | — | — | — |

Legend: ✅ visible + unlocked · 🔒 visible + locked (upgrade CTA) · — hidden. `Equity Offer` additionally requires `startup_profiles.legal_review_passed=true` + `WholesaleGate` pass.

---

## 6. GA4 Event Catalog (20 events)

Baseline params on every event: `user_id_hash` (SHA-256 with salt), `session_id`, `plan_tier`, `plan_segment`, `account_type`, `is_trial`, `experiment_id?`, `ts`, `disclaimer_shown?` (on equity/valuation surfaces).

| # | event | Trigger | Extra params | Owner |
|---|-------|---------|--------------|-------|
| 1 | `sign_up` | Post-Supabase signup | `method`, `segment`, `referrer_slug?` | T-0406 |
| 2 | `login` | Auth success | `method` | T-0406 |
| 3 | `trial_start` | Stripe sub w/ `trial_end>now` | `sku`, `trial_days`, `cc_required` | T-0406 |
| 4 | `trial_end` | `trial_will_end` or trial→active | `sku`, `outcome` | T-0406 |
| 5 | `subscribe` | `invoice.paid` first cycle | `sku`, `amount_aud`, `currency`, `stripe_sub_id` | T-0406 |
| 6 | `plan_upgrade` | Sub item price ↑ | `from_sku`, `to_sku`, `delta_aud` | T-0406 |
| 7 | `plan_downgrade` | Sub item price ↓ | `from_sku`, `to_sku`, `delta_aud` | T-0406 |
| 8 | `plan_cancel` | `subscription.deleted` | `sku`, `reason?`, `tenure_days` | T-0406 |
| 9 | `report_generate` | `/api/reports/*` success | `report_type`, `credits_spent`, `word_count`, `agent` | T-0407 |
| 10 | `dashboard_view` | SCN dashboard route hit | `dashboard_id`, `phase` | T-0407 |
| 11 | `feature_gate_hit` | Entitlement denial | `feature_key`, `required_tier`, `current_tier`, `cta_shown` | T-0406 |
| 12 | `equity_offer_request` | Request-a-call click | `offer_type`, `pct_offered?`, `disclaimer_shown=true` | T-0408 |
| 13 | `equity_offer_qualified` | `legal_review_passed=true` | `offer_id` | T-0408 |
| 14 | `share_link_open` | `/s/[slug]` view | `slug`, `viewer_type`, `utm_*` | T-0407 |
| 15 | `svi_score_view` | Public/private SVI page | `slug`, `svi_index`, `phase` | T-0407 |
| 16 | `credit_purchase` | Credit top-up | `credits`, `amount_aud`, `pack_id` | T-0407 |
| 17 | `credit_spend` | Credit-gated action | `feature_key`, `credits`, `balance_after` | T-0407 |
| 18 | `checkout_start` | Stripe session created | `sku`, `amount_aud`, `trial` | T-0406 |
| 19 | `checkout_abandon` | 24h no-conversion after start | `sku`, `stage` | T-0407 |
| 20 | `agent_task_run` | C-Level agent job | `agent`, `task_id`, `credits`, `duration_ms`, `outcome` | T-0407 |

Consent-mode v2: `analytics_storage=denied` until banner accept; server-side Measurement Protocol mirror is source of truth (30% AU ad-block coverage). Property `G-BLOCKID2026`; BQ dataset `analytics_blockid` (australia-southeast1); nightly cron `15 2 * * *` T-0409.

---

## 7. Homepage v2 Wireframe (from CPO + CMO)

Section order (all gated by `NEXT_PUBLIC_UPGRADE_V2`): **Hero → SegmentTabs → SocialProof → Bento → PricingMatrix → FAQ → CTAStrip**. Sticky trial strip in footer.

```
+----------------------------------------------------------------+
|  [Logo]  Product  Pricing  Investors  Docs   [Sign in] [Start free]
+----------------------------------------------------------------+
|                                                                |
|      GET FUNDABLE IN 7 DAYS                                    |
|      AI valuation + investor-ready reports.                    |
|      Free 7-day trial. Cancel anytime.                         |
|      [ Start free trial ]   [ See a sample report ]            |
|      * no card lock-in  * built in Australia (ACN 659 615 111) |
|      [ hero visual: SVI dial + sample report card ]            |
+----------------------------------------------------------------+
|  Trusted by 1,200+ founders  ·  ★★★★★ 4.8  ·  logo row        |
+----------------------------------------------------------------+
|  [ Founder ][ Investor ][ Advisor ][ Accelerator ]  <- tabs    |
|  "Validate your startup, score your idea, raise faster."       |
|  [ Bento: SVI · Cap Table · Deal Room · Reports ]              |
+----------------------------------------------------------------+
|                 PRICING (segment tab active)                   |
|  +---------+  +---------+  +---------+  +----------+           |
|  |  Free   |  | Starter |  | Growth★ |  |  Scale   |           |
|  |  A$0    |  |  A$29   |  |  A$99   |  |  A$299   |           |
|  | [Start] |  | [Trial] |  | [Trial] |  | [Trial]  |           |
|  +---------+  +---------+  +---------+  +----------+           |
|              Enterprise → [ Talk to sales ]                    |
+----------------------------------------------------------------+
|  FAQ  ·  Compliance strip (Not financial advice)  ·  Footer   |
+----------------------------------------------------------------+
| Sticky: "7-day trial · cancel anytime"           [Start >]     |
+----------------------------------------------------------------+
```

Brand tokens (locked): navy `#0A1628`, gold `#C9A961`, cyan `#22D3EE`, ink `#E5E7EB`, muted `#94A3B8`. Inter UI, Fraunces marketing display. 200ms ease-out; hover raise 2px; 2px cyan focus ring.

Copy contract for hero (`web/content/marketing/homepage-v2.en.md`):
- **eyebrow:** "APAC's Verified Startup Index"
- **H1:** "Get Fundable in 7 Days."
- **sub:** "Score your Startup Viability Index (SVI), fix the gaps with AI C-suite agents, and get in front of investors — free for 7 days, no card lock-in."
- **CTAs:** primary "Start 7-day free trial" → `/onboarding?trial=1` · secondary "See a sample report" → `/s/demo` · ghost "I'm an investor" → `/for/investors`
- **trust:** `["ASIC-registered (ACN 659 615 111)","Auschain PTY LTD","Not financial advice"]`

VI mirror `homepage-v2.vi.md`: H1 **"Sẵn sàng gọi vốn trong 7 ngày."** — adaptation (native copywriter), not machine translation.

---

## 8. Compliance Disclaimer Copy Blocks (EN + VI)

Every equity/valuation-shaped output MUST embed `disclaimer_ref: { id, hash, version }`. Bodies are DB-immutable per version (`disclaimers` table); new copy = new row + new hash + `superseded_at` on old. Counsel sign-off required before `T-0429` seeds prod. Every block below is **[VERIFY-COUNSEL]** — Auschain PTY LTD (ACN 659 615 111) must not ship without a signed memo.

### 8.1 Not Financial Advice (SVI report, valuation, dashboard) — AU

**EN:** *"This information is general in nature and does not constitute financial product advice under s911A of the Corporations Act 2001 (Cth). BlockID.au and Auschain PTY LTD (ACN 659 615 111) are not licensed to provide personal financial, legal, or tax advice. Scores, valuations, and projections are computed from the information you provide and public data; they are illustrative only and not a formal valuation. You should consider whether the information is appropriate to your circumstances and obtain independent professional advice before making any decision."*

**VI:** *"Thông tin này chỉ mang tính chất chung và không cấu thành lời khuyên về sản phẩm tài chính theo mục 911A Corporations Act 2001 (Cth) của Úc. BlockID.au và Auschain PTY LTD (ACN 659 615 111) không được cấp phép cung cấp tư vấn tài chính, pháp lý hoặc thuế cá nhân. Điểm số, định giá và dự phóng được tính từ thông tin bạn cung cấp cùng dữ liệu công khai — chỉ mang tính minh họa, không phải định giá chính thức. Bạn nên cân nhắc mức độ phù hợp với hoàn cảnh của mình và tham vấn chuyên gia độc lập trước khi ra quyết định."*

### 8.2 Trial + Auto-Renewal (Stripe checkout summary) — AU

**EN:** *"Your 7-day free trial begins today. On day 7 your saved payment method will be charged A${price} inc. GST unless you cancel from your billing page. We will email you a reminder 3 days before, 1 day before, and on the day of the first charge. Cancel any time from Settings → Billing. Full terms at /legal/terms. Not financial advice."*

**VI:** *"Bản dùng thử 7 ngày miễn phí bắt đầu hôm nay. Vào ngày thứ 7, phương thức thanh toán đã lưu sẽ bị trừ A${price} đã bao gồm GST trừ khi bạn hủy từ trang thanh toán. Chúng tôi sẽ gửi email nhắc trước 3 ngày, 1 ngày, và vào đúng ngày tính phí đầu tiên. Bạn có thể hủy bất kỳ lúc nào tại Settings → Billing. Điều khoản đầy đủ: /legal/terms. Không phải lời khuyên tài chính."*

### 8.3 Equity-for-Solution (Request-a-Call) — AU

**EN:** *"'Equity-for-solution' is a bespoke arrangement between you and BlockID.au (Auschain PTY LTD). It is not an offer to issue securities, nor an invitation to apply for shares. No equity, tokens, or share entitlements are created or transferred by submitting this request. Any subsequent issuance would be executed off-chain under s708 (small-scale offer), ESS (employee share scheme), or another applicable exemption, subject to legal review and independent advice on both sides. Not financial or legal advice."*

**VI:** *"'Trả bằng cổ phần cho giải pháp' là thỏa thuận riêng giữa bạn và BlockID.au (Auschain PTY LTD). Đây không phải lời mời chào bán chứng khoán, cũng không phải lời mời đăng ký mua cổ phần. Không có cổ phần, token hay quyền chia cổ nào được tạo ra hoặc chuyển nhượng khi bạn gửi yêu cầu này. Bất kỳ việc phát hành nào sau đó sẽ được thực hiện off-chain theo s708 (chào bán quy mô nhỏ), ESS (chương trình cổ phần cho nhân viên), hoặc miễn trừ khác — với điều kiện có kiểm duyệt pháp lý và tư vấn độc lập cho cả hai bên. Không phải lời khuyên tài chính hoặc pháp lý."*

### 8.4 Tokenised Share Display (Phase 3, display-only) — AU

**EN:** *"The token displayed here mirrors an off-chain share record maintained under the Australian Corporations Act 2001. The ASIC company register (or the issuer's private register) is the sole authoritative source of ownership. No on-chain transfer confers legal share ownership without a corresponding entry in the authoritative register. This display is not an offer to sell, issue, or transfer securities. Not financial or legal advice."*

**VI:** *"Token hiển thị ở đây phản chiếu bản ghi cổ phần off-chain được duy trì theo Corporations Act 2001 của Úc. Sổ đăng ký công ty ASIC (hoặc sổ đăng ký riêng của tổ chức phát hành) là nguồn quyền sở hữu duy nhất có giá trị pháp lý. Không có giao dịch on-chain nào tự nó chuyển quyền sở hữu cổ phần hợp pháp nếu không có bản ghi tương ứng trong sổ đăng ký có thẩm quyền. Hiển thị này không phải lời chào bán, phát hành hoặc chuyển nhượng chứng khoán. Không phải lời khuyên tài chính hoặc pháp lý."*

### 8.5 General-Advice Warning Modal (Corps Act s949A) — AU

Blocking modal on first-time entry to valuation / equity / tokenised surface. Writes `advice_warning_ack_at` on `app_users` + `consent_events` row (category=`not_financial_advice`).

**EN:** *"The information you are about to view is general in nature and does not take into account your objectives, financial situation, or needs. Before acting on it you should consider its appropriateness and, where relevant, obtain independent financial, legal, or tax advice. I understand and wish to continue."* [ Continue ] [ Learn more ]

**VI:** *"Thông tin bạn sắp xem chỉ mang tính chất chung, không tính đến mục tiêu, tình hình tài chính hay nhu cầu cá nhân của bạn. Trước khi hành động dựa trên thông tin này, bạn nên cân nhắc mức độ phù hợp và, khi cần, tham vấn tư vấn tài chính, pháp lý hoặc thuế độc lập. Tôi đã hiểu và muốn tiếp tục."* [ Tiếp tục ] [ Tìm hiểu thêm ]

---

## 9. QA Plan (12 accounts × 5 journeys + regression)

### 9.1 Test-account matrix (T-0432 seeds these idempotently)

| # | Email | Segment | Tier | Stripe state | Trial days left |
|---|-------|---------|------|--------------|:---------------:|
| 1 | `qa-founder-starter@blockid.test` | founder | starter | trialing | 5 |
| 2 | `qa-founder-growth@blockid.test` | founder | growth | active | 0 |
| 3 | `qa-founder-scale@blockid.test` | founder | scale | active | 0 |
| 4 | `qa-founder-enterprise@blockid.test` | founder | enterprise | active | 0 |
| 5 | `qa-angel@blockid.test` | investor_angel | angel | trialing | 3 |
| 6 | `qa-advisor@blockid.test` | advisor | advisor | active | 0 |
| 7 | `qa-vc-small@blockid.test` | investor_vc | vc_small | active | 0 |
| 8 | `qa-vc-ent@blockid.test` | investor_vc | vc_enterprise | active | 0 |
| 9 | `qa-cohort-starter@blockid.test` | accelerator | cohort_starter | trialing | 6 |
| 10 | `qa-cohort-growth@blockid.test` | accelerator | cohort_growth | active | 0 |
| 11 | `qa-cohort-ent@blockid.test` | accelerator | cohort_enterprise | active | 0 |
| 12 | `qa-lp@blockid.test` | lp | lp | canceled | 0 |

### 9.2 Five canonical journeys (× 12 accounts = 60 flows)

1. **01-signup-trial** — anon → `/` → segment tab → `Start free trial` → onboarding steps 1-5 → mock Stripe `4242…` → land on tier dashboard → `<TrialBanner>` correct days → GA4 `trial_start` fires within 60s.
2. **02-upgrade** — Starter → Growth mid-trial + post-trial; proration correct (assertion values documented by CFO); entitlement refresh ≤ 2s; `plan_upgrade` GA4 event.
3. **03-trial-end-autocharge** — Stripe test-clock `advanceTrialClock(7d)` → `invoice.paid` → entitlements retained → GA4 `subscribe` → `revenue_events` row with GST split.
4. **04-downgrade** — Scale → Growth at period end; features remain until anchor date; `plan_downgrade` fires.
5. **05-cancel-reactivate** — Cancel-at-period-end → `<ExitSurvey>` → `<DowngradeOffer>` → dunning banner → reactivate within grace → entitlements resume.

### 9.3 Regression suite (data-driven from `plans.feature_flags`)

- `menu-visibility.spec.ts` — each segment×tier sees only allowed nav items.
- `gate-blocks.spec.ts` — each `can()` capability × wrong tier → `<UpgradePrompt>`, no data leak, `feature_gate_hit` fires with correct `required_tier`.
- `credits.spec.ts` — free 0-credit / paid deduction / transparent-pricing modal shows cost+word-count pre-run.
- `disclaimers.spec.ts` — every equity/valuation surface renders `<AuDisclaimer data-testid="au-disclaimer">` + `disclaimer_ref` in DOM.
- `equity-request-call.spec.ts` — non-wholesale + `legal_review_passed=false` → "Request a Call" modal, NEVER hits smart-contract mint path.
- `visual/homepage.spec.ts` — Playwright screenshot diff (light+dark, desktop+mobile), `maxDiffPixelRatio: 0.001`, timestamps masked.
- `a11y/axe.spec.ts` — axe on 20 top routes; 0 WCAG 2.1 AA violations; Lighthouse a11y ≥ 95.

### 9.4 Non-functional gates

- **k6** — pricing p95 < 400ms @ 100 VU; checkout p95 < 800ms @ 20 VU; `http_req_failed < 1%`.
- **Consent-mode v2** — Playwright asserts zero GA4 network hits before banner accept.
- **Chain integrity** — `verify-audit-chain.ts` prints `OK n=<count>` nightly.
- **Grep gate** — `rg 'plan === "' web/src` = 0 hits; `grep -R "blockchain-sync|tokenization" web/src/app/api/equity` shows gate call before any mint.

### 9.5 Release-gate exit codes

`0` pass · `10` seed fail · `20` playwright fail · `30` axe fail · `40` k6 threshold breach · `50` visual diff > 0.1% pixels. `scripts/qa-release-gate.sh` blocks `deploy-live.sh` on any non-zero.

---

## 10. 8-Week Sprint Plan (from COO)

| Sprint | Dates | Theme | Task IDs | Demo Gate |
|--------|-------|-------|----------|-----------|
| **S0** | Wk 0 (2026-07-16 → 2026-07-19) | Kickoff | T-0101…T-0108 | Worktrees provisioned, GA4/Stripe/BQ creds live, sprint board initialised |
| **S1** | Wk 1-2 (2026-07-20 → 2026-08-02) | Foundation: Entitlement + Trial + Homepage v2 (Founder tab only) | T-0201…T-0222, T-0301…T-0311 (Founder-tab subset) | E2E trial signup → Stripe test card → entitlement flips → reminder emails in staging inbox |
| **S2** | Wk 3-4 (2026-08-03 → 2026-08-16) | Menu + Onboarding + Upgrade + GA4 base | T-0301…T-0320 (full), T-0401…T-0409, T-0410…T-0418 | New user completes onboarding, hits gate, sees upgrade modal, GA4 funnel populates real-time DebugView |
| **S3** | Wk 5-6 (2026-08-17 → 2026-08-30) | Investor + Advisor + Accelerator workspaces + segment tabs 2-4 live | T-0419…T-0423 | One live account per new segment completes checkout, lands in correct workspace |
| **S4** | Wk 7-8 (2026-08-31 → 2026-09-13) | Equity scaffold + Compliance + QA + Prod staged rollout | T-0424…T-0446 | Prod traffic on new pricing, first paid conversions from trial, zero P1 in first 72h |

**Weekly cadence:** Mon 09:00 AEST `weekly-metrics` cron posts Telegram digest (shipped/slipped/metrics/blockers). Wk2/4/6/8 Fri 15:00 AEST demo → `/data/knowledge-base/demos/sprint-<n>.mp4` → CEO + investor observer sign-off.

**Blocking chain:** `T-0201 → T-0207 → T-0208 → all downstream`. If CTO slips T-0201/T-0208 past Wk1 Day 4, Sprint 1 slips → cascade delay. Mitigation: CTO+CISO pair on migration `0073` day 1.

---

## 11. Rollback Plan (`NEXT_PUBLIC_UPGRADE_V2` + additive migrations)

**Kill-switch:** `NEXT_PUBLIC_UPGRADE_V2=false` in `.env` → `./deploy-live.sh` → legacy checkout/pricing/homepage/nav restored in < 5 min. Stripe subs remain valid (no data loss); trial `subscription_trial_state` rows preserved; entitlement layer falls back to legacy `plan === "growth"` code path (temporarily re-enabled behind flag).

**Additive-only migrations:** Every migration `0073→0077` uses `add column if not exists`, `create table if not exists`, no `drop`, no `alter … type`. Legacy columns (`app_users.account_type`) retained; `plans` and `subscription_trial_state` are net-new. `PLAN_CREDITS` fallback map in `credits.ts` remains. Legacy plan ID mapping in `plans-db.ts`: `founding50 → founder_starter`, `growth → founder_growth` — grandfathered users flagged `entitlement.grandfathered=true`.

**Per-workstream flags** (individual kill-switches, all default `false` in `.env.example`):

| Flag | Guards |
|------|--------|
| `NEXT_PUBLIC_UPGRADE_V2` | Master kill-switch (homepage v2, onboarding, PricingMatrix, new checkout path) |
| `NEXT_PUBLIC_FF_TRIAL_ENABLED` | Stripe 7-day trial in checkout |
| `NEXT_PUBLIC_FF_NEW_PRICING` | 12-SKU matrix rendering |
| `NEXT_PUBLIC_FF_INVESTOR_WS` | Investor workspace routes |
| `NEXT_PUBLIC_FF_EQUITY_OFFER` | Equity-for-solution Request-a-Call CTA (compliance gate) |
| `conversion.prompts.enabled` | UpgradeModal + UpgradeBanner (per-user via DB config) |

**Rollback drill (T-0444):** Before 100% cutover, exec `NEXT_PUBLIC_UPGRADE_V2=false` on staging, confirm all 5 canonical journeys still pass against pre-v2 behaviour; document elapsed time in `coo-sprint-board.md`.

---

## 12. Cutover Checklist (T-0442 → T-0446)

### Pre-cutover (T-14d → T-0)

- [ ] All Sprint 4 tasks green in `coo-sprint-board.md`
- [ ] `scripts/qa-release-gate.sh` exit 0 on staging (full matrix, not smoke)
- [ ] `security-audit` skill run — 0 P1/P2 findings; CSP + RLS + webhook signature verified
- [ ] `code-review --fix` sweep across W1-W8 diffs completed
- [ ] External counsel signed `clo-checklist.md` (all 20 items green)
- [ ] Disclaimer MDX EN+VI (10 files) approved; `disclaimer_registry` seeded in prod
- [ ] Screenshot pack of every disclaimer surface (EN+VI) attached to counsel memo
- [ ] ASIC RG 261/262 self-assessment archived
- [ ] NDB tabletop exercise completed with CISO
- [ ] Stripe test-clock trial → auto-charge asserted 12/12 accounts
- [ ] k6 load thresholds green (checkout p95 < 800ms, pricing p95 < 400ms)
- [ ] axe a11y sweep 20 routes → 0 violations; Lighthouse a11y ≥ 95 on mobile
- [ ] Consent-mode v2 QA: zero GA4 hits before banner accept
- [ ] Grep gates green: no `plan === "growth"`, no direct blockchain calls from equity path
- [ ] Nightly `verify-audit-chain` reports success in `cron-health.jsonl` for 7 consecutive nights
- [ ] Rollback drill completed on staging; elapsed < 5 min documented
- [ ] ROADMAP.md + CHANGELOG.md + `web/content/reports/version.json` updated to v2.0
- [ ] ToS v2 + Privacy v2 published with `effective_from = launch_date + 14 days` (ACL notice)
- [ ] Announcement drafts approved: insights article, launch email, Telegram, LinkedIn, F6S, Zalo VI
- [ ] Deploy checklists `docs/deploy/checklist-sprint-4.md` all ticked

### Cutover (T-0: staged rollout over 5 days)

- [ ] Day 1: `NEXT_PUBLIC_UPGRADE_V2=true` for 10% cohort (hash-bucket by `user_id`) → monitor `cron-health.jsonl` + Stripe webhook 5xx + `feature_gate_hit` volume
- [ ] Day 2: hold 10% if error rate > baseline + 2σ; else 50%
- [ ] Day 3-4: 50% steady-state → collect trial-start rate, verify against A/B `trial_cc_required` MDE
- [ ] Day 5: 100% → announce v2.0 (CMO + COO ship launch pack) → CEO investor update

### Post-cutover (T+72h → T+30d)

- [ ] Zero P1 incidents in first 72h
- [ ] Trial-start rate ≥ 6% (visitor→trial) after 7 days
- [ ] Trial→paid measurable in `v_trial_conversion` after 14 days; band 25–35%
- [ ] CFO dashboard `/admin/pricing-metrics` live with MRR/ARR/GST accrual/runway
- [ ] Metabase dashboards live: Trial funnel, SKU MRR, Gate-hit heatmap, Equity offer pipeline
- [ ] Wk 8 Fri retro → `knowledge-base/upgrade-plan-2026-07-16/coo-retro.md`
- [ ] Investor readout published (`coo-daily-2026-09-XX.md` + Telegram)

---

## Cross-Reference Appendix

- **Migrations owned by CTO** (T-0201 authors, T-0217 relies on): `0073`, `0074`, `0075`
- **Migrations owned by CLO+CISO** (T-0204 authors, T-0430/T-0442 relies on): `0076`
- **Migrations owned by CDO+CRO** (T-0205 authors, T-0409/T-0415 relies on): `0077`
- **Entitlement engine** (`web/src/lib/entitlements.ts`): T-0208 authors, consumed by T-0221, T-0303, T-0304, T-0406, T-0410
- **Stripe checkout** (`api/stripe/checkout/route.ts`): T-0216 modifies, gated by T-0208+T-0215, tested by journey 01 (T-0435)
- **Homepage v2**: T-0307…T-0311 build, T-0437 visual regression, T-0311 gated by `NEXT_PUBLIC_UPGRADE_V2`
- **Equity Request-a-Call**: T-0430 endpoint, T-0426 UI (`<WholesaleGate>` + `<AdviceWarningModal>`), T-0431 static grep gate, journey `equity-request-call.spec.ts` (T-0436)
- **Analytics event `feature_gate_hit`**: fired inside `can()` (T-0208), catalog #11 (T-0401), asserted by `gate-blocks.spec.ts` (T-0436)
- **`legal_review_passed`** column (T-0204): consumed by T-0214 (`assertLegalReview`), T-0430 intake, T-0431 grep gate

---

---

## 13. GOAL 4 ADDENDUM — Continuous CI/CD + 24/7 Uptime Guardian (MANDATORY, overrides 8-week batching)

**Rule:** No 8-week batch cutover. Each completed task ships through auto-pipeline immediately. Sprint = weekly demo cadence only; deploys are continuous.

**Full spec:** `knowledge-base/upgrade-plan-2026-07-16/guardian-spec.md`

### 13.1 Goal-4 tasks (run FIRST in Phase 3, before W1-W8)

| ID | Task | Owner | Effort | Files | Deps |
|----|------|-------|--------|-------|------|
| G-01 | `web/src/app/api/healthz/route.ts` — deep probe (db+stripe+chain+ga4) | Guardian | S | new | — |
| G-02 | `web/scripts/ship-task.sh` — 12-step per-task pipeline (lint→typecheck→test→build→migrate→push→deploy→smoke→ga4-probe→auto-rollback→announce→version bump) | Guardian | M | new | — |
| G-03 | Extend `web/scripts/uptime-watcher.sh` — p95 + mem + disk hooks | Guardian | M | edit | G-01 |
| G-04 | `web/scripts/server-cleanup.sh` — docker prune, npm cache, .next keep 3, log rotation, reports archive | Guardian | S | new | — |
| G-05 | `api/cron/server-cleanup` cron 4h | Guardian | S | new | G-04 |
| G-06 | `api/cron/performance-audit` — Lighthouse CI hourly on 5 routes → auto-file issue on >10% regress | Guardian | M | new | — |
| G-07 | Migrations `0078_deploy_incidents.sql` + `0079_perf_samples.sql` | Guardian | S | new | — |
| G-08 | Extend `api/cron/agent-guardian` — playbook lookup + auto-fix | Guardian | M | edit | G-04 |
| G-09 | `web/content/reports/self-fix-playbook.json` — 5 pattern seed | Guardian | S | new | G-08 |
| G-10 | `api/admin/rollback/route.ts` — admin-gated + audit-logged | Guardian | S | new | G-11 |
| G-11 | `.deploy-manifest.json` stamping in `deploy-live.sh` | Guardian | S | edit | — |
| G-12 | Retention: last 5 releases in `/data/blockid-releases/YYYY-MM-DD-SHA/` | Guardian | S | edit | G-11 |
| G-13 | `web/scripts/version-bump.mjs` + CHANGELOG appender | Guardian | S | new | G-02 |
| G-14 | Severity levels in Telegram alerter (INFO/WARN/ALERT/CRITICAL) | Guardian | S | edit | — |
| G-15 | Twilio SMS + VAPI phone on CRITICAL | Guardian | M | new | G-14 |
| G-16 | `dashboard/admin/uptime-guardian/page.tsx` — live status + last 24h + rollback button | Guardian | M | new | G-01, G-07 |
| G-17 | Integration test: fake failure → auto-rollback verified | Guardian | M | new | G-02, G-11 |
| G-18 | `docs/CONTINUOUS-DEPLOY.md` — runbook | Guardian | S | new | all |

### 13.2 Continuous-deploy contract for all W1-W8 tasks

Every task in W1-W8 must:
1. Live in a single commit (atomic) with commit message `T-0xxx: <summary>` (task ID first).
2. Include unit/integration test if it touches business logic.
3. Not violate CI grep gates (`plan === "growth"`, `email === "admin@..."`, etc.).
4. Be feature-flagged if user-visible (per §11 flag matrix).
5. Get shipped via `bash web/scripts/ship-task.sh` immediately after commit (owner runs it; guardian cron monitors).

### 13.3 SLOs (enforced, alert if violated)

| SLO | Target | Auto-action on breach |
|-----|--------|-----------------------|
| Uptime probe | ≥99.9% (43 min/mo) | 3 fails: auto-restart · 5 fails: auto-rollback |
| p95 latency `/` | ≤800 ms | Auto-profile + Telegram |
| Deploy pipeline duration | ≤8 min | Telegram WARN if >12 min |
| Auto-rollback duration | ≤90s from detect | CRITICAL alert if >3 min |
| Disk usage | ≤80% | ≥90%: auto-cleanup |
| Memory usage | ≤75% avg | ≥85% 5min: auto-restart |
| Lighthouse mobile | ≥85 | GitHub issue auto-filed on <85 |
| Time-to-detect incident | ≤60s | — |
| Time-to-notify Telegram | ≤15s | — |

### 13.4 Replace COO's 8-week sprint plan

- **Retire:** the Sprint 1→4 gated cutover, staged rollout via `NEXT_PUBLIC_UPGRADE_V2` 10%→50%→100% over 5 days.
- **Keep:** the task IDs, dependency chain, per-workstream flags, additive-only migrations.
- **Change:** every task ships to prod behind its own feature flag as soon as it passes `ship-task.sh`. Master flag `NEXT_PUBLIC_UPGRADE_V2` still exists but toggles the composite v2 experience, not individual tasks.
- **New cadence:** weekly Fri demo + weekly retro; daily standup via `coo-daily-standup.ts` cron; no waiting for sprint-end to ship.

### 13.5 Rollback playbook (per-task)

Every ship-task automatically:
1. Stamps `.deploy-manifest.json` with git SHA + task ID + `.next` hash.
2. Retains last 5 releases in `/data/blockid-releases/`.
3. On smoke fail (step 9 or 10 of ship-task) → `deploy-live.sh --rollback` restores previous manifest, runs smoke, on success returns 0.
4. Two rollbacks within 1h → escalate CRITICAL + require manual `/api/admin/rollback` confirm before next deploy.

---

**End of master implementation plan.** Total scope: **~110 tasks** (90 upgrade + 18 guardian + 2 net-new migrations) · **7 migrations** (`0073→0079`) · 12 SKUs · 20 GA4 events · 60 QA flows · continuous ship-per-task (no 8-week batching) · 8 worktrees · SLO ≥99.9% uptime · single kill-switch `NEXT_PUBLIC_UPGRADE_V2` + per-workstream flags + per-task auto-rollback.

*Not financial advice. All figures illustrative; execution dependent on market conditions and counsel sign-off. Auschain PTY LTD (ACN 659 615 111 · ABN 79 659 615 111) — Sydney NSW.*
