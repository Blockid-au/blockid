# BlockID.au v2.0 — Pricing & Positioning Upgrade Master Plan

> **Source of truth: [plans/SOURCE-OF-TRUTH.md](./plans/SOURCE-OF-TRUTH.md)** — this file is a specialised view; consult the source-of-truth first for status.

**Version:** v2.0 · **Date:** 2026-07-16 · **Status:** IN PROGRESS
**Trigger:** Investor feedback prompt `BlockID_Pricing_ResearchBuild_Prompt.md`
**Research brief:** `.claude/research/pricing-upgrade-research-2026-07-16.md`

---

## Executive Summary

4 upgrades chính (3 từ nhà đầu tư + 1 mandatory ops):

1. **Freemium 7 ngày → tự động charge** (Stripe `trial_period_days=7`, opt-out CC-required). Ước tính **5–6× revenue delta** vs cơ chế "free forever + 2 credits" hiện tại (opt-out 31–49% conversion vs opt-in 8–18%).
2. **Đa dạng pricing per segment** (Founder / Investor Angel / Investor VC / Advisor / Accelerator / LP). Hiện chỉ có Founder + SVI-API SKUs; 4 segment tiers còn thiếu.
3. **Digital shares + share management + equity-for-solution (5–10% equity in lieu of cash)** — Phase 3, compliance-gated. Scaffolding blockchain (SVToken, TokenFactory, blockchain-sync) đã có, chưa có equity-offer workflow + jurisdiction gate.
4. **[MANDATORY] Continuous CI/CD + 24/7 Uptime Guardian + Auto-heal + Auto-cleanup** — Không có sprint 8-tuần batched. Mỗi task hoàn thành → auto-pipeline (lint → typecheck → unit test → build → staging smoke → prod swap → post-deploy smoke → auto-rollback on fail). Uptime SLO ≥ 99.9%. Performance auto-tune. Disk/mem cleanup cron. Alert Telegram + email.

**Kỳ vọng Month 12 (bull):** A$594K ARR = 300 founders × A$65 + 60 investor seats × A$110 + 12 accelerator × A$1,200 + 3 institutional API × A$3,000.

**Kỳ vọng Month 12 (base):** A$240K ARR (6× Antler pre-seed math).

---

## Guardrails (không được vi phạm)

- Verified Startup Profile vẫn là front door.
- Compliance-gated: digital-shares + equity-for-solution sau `legal_review_passed=true` flag; mặc định "request-a-call" UX.
- Entitlement-only-from-Stripe (webhook idempotent).
- AU disclaimer "not financial/legal advice" trên mọi report/PDF/API.
- No Docker/CI deploy (build src → deploy standalone).
- Transparent pricing (hiện credit cost + word count trước khi chạy).

---

## Tier Matrix (12 SKUs)

### Founder side (self-serve, card-required 7-day trial)

| Tier | AUD/mo | Annual (16% off) | Trial | Fit |
|---|---|---|---|---|
| Free (anonymous) | A$0 | — | — | 1 anon SVI, no save/download — SEO |
| Starter | A$29 | A$290 | 7-day CC | Solo, idea→MVP; 1 profile, 10 SVI/mo |
| Growth | A$99 | A$990 | 7-day CC | Pre-seed→seed; 3 profiles, 50 SVI, cap-table sync, Term Sheet AI |
| Scale | A$299 | A$2,990 | 7-day CC | Seed→Series A; 10 profiles, unlimited SVI, ESOP, quarterly investor report, white-label |
| Enterprise | Custom (from A$1,500/mo) | Annual | Sales-led | SSO, multi-entity, API, dedicated CSM, SLA |

> **G12 amendment (2026-09-10, plan-only — [`docs/plans/evaluator-traction-2026-09-10.md`](./plans/evaluator-traction-2026-09-10.md)):** the investor/advisor rows below (Angel A$79 · Advisor A$149 · VC Small A$349) become the **public Evaluator ladder** relabelled **Scout / Firm / Program** with `reports_per_month` 10/30/100, tracked startups 25/50/200, seats 1/3/5, **7-day card-required trial** at registration; accelerator (A$500 / 1,500 / 3,500) and VC Enterprise stay Contact Sales; consulting firms also via reseller 0–40 %. **A$3 = full Trust BizReport** for founders and evaluators (pay-as-you-go per startup entered, = 3 credits; re-score A$1); `TRUST_REPORT_5AUD` (never sold) retired. Founder ladder unchanged. Lands with T0268 under SOT §6 rule 5.

> **G11 amendment (2026-09-10, plan-only — [`docs/plans/money-finder-2026-09-10.md`](./plans/money-finder-2026-09-10.md)):** no new tier. **Starter A$29** additionally bundles **Founder Radar** (grant/program deadline alerts T-30/14/3, monthly re-match, weekly next-step digest money block, ICS, capital map, application drafts via credits) behind feature flag `money_radar`; **Growth** adds investor reverse-match + unlimited drafts + quarterly expert refresh; **Startup Package A$149** includes 1 Money Finder report + 3 months Radar. New one-off SKU **`FUNDING_REPORT_3AUD` (A$3 inc GST, guest)** mirrors `ONE_CLICK_REPORT_3AUD`. `FEATURE_COSTS.grant_match = 3` credits. Per SOT §6 rule 5 the `plans.csv` + this doc + SOT §2 change lands together in G11-P4/P11 — not before. (Note: the matrix above still shows Growth A$99 / Scale A$299 from the v2 draft; the live ladder since v3.9.23 is Free / Starter A$29 / Growth A$69 — see SOT G5.)

> **Shipped 2026-09-10 (T0247, G11 S4):** Founder Radar is **bundled into Starter A$29** — label stays "Starter" (founder decision, no rename) with a "Founder Radar" chip on the card; feature line *"Founder Radar — grant & program deadline alerts, monthly re-match, weekly next step, capital map"*; Free row shows "Money Finder preview" + "Trust BizReport A$3 pay-as-you-go"; Growth adds *"+ investor matching, unlimited application drafts, quarterly expert refresh (coming)"* — the "(coming)" stays until T0251 lands; Scout / Firm / Program add "Money Finder & Progress Radar included". Flags `grant_finder` + `money_radar` are **live on `plans.csv` and in the DB via migration 0316** (T0242) for Starter, Growth, Enterprise, Package and the three evaluator rungs. **Startup Package A$149** copy now states "1 Money Finder report + 3 months Founder Radar included"; the Stripe webhook (`handleStartupPackagePurchase`) stamps `app_users.money_radar_until = now() + 90 days` via **migration 0319** and `can(user, "money_radar")` honours the stamp through `entitlements/timed-grants.ts` (union-only, fail-closed, like the add-on layer). The A$3 report page and the /funding paywall (after the 3rd A$3 purchase) carry the approved upsell card (`radar-upsell-card.tsx`, copy computed from the report's timeline, GA4 `radar_upsell_view` / `radar_upsell_click`) → `/signup?plan=founder_starter&trial=1`, with a Scout A$79 secondary for evaluators. No price, SKU or Stripe change; SOT §2 row status is flipped by the sprint close, not here.

### Investor / advisor side (per-seat)

| Tier | AUD/seat/mo | Fit | PRC-INV status |
|---|---|---|---|
| Angel | A$79 | Solo angel; watchlist 25, SVI feed, 5 diligence packs/mo | ✅ Shipped with placeholder Stripe ID (2026-07-23, iter-6 #4). Real `STRIPE_PRICE_INVESTOR_ANGEL` deferred to P8.5 human-blocked task. |
| Advisor | A$149 | Lawyer/accountant/consultant; cohort 25, white-label | ✅ Shipped with placeholder Stripe ID (2026-07-23, iter-6 #4). Real `STRIPE_PRICE_INVESTOR_ADVISOR` deferred to P8.5. |
| VC Small | A$349 (5-seat min) | Micro-VC/family office; portfolio, LP export | ✅ Shipped with placeholder Stripe ID + `usage_limits.seats=5` seat-min guard (2026-07-23, iter-6 #4). Real `STRIPE_PRICE_INVESTOR_VC_SMALL` deferred to P8.5. |
| VC Enterprise | Custom (from A$2,500/mo) | Multi-fund; API, custom benchmarks | ✅ Shipped with placeholder Stripe ID + "Contact sales" CTA per `investor_vc_ent` row (interval=custom, seats=-1). Real `STRIPE_PRICE_INVESTOR_VC_ENT` deferred to P8.5. |

### Accelerator / program side

| Tier | AUD/mo | Fit | Status |
|---|---|---|---|
| Cohort Starter | A$500 (≤15 founders) | Uni programs, bootcamps | ✅ Shipped with placeholder Stripe ID + `usage_limits.seats=15`, `monthly_credits=2000`, 14d trial (2026-07-23, iter-7 PRC-ACC). Feature flags: `cohort_dashboard`, `cohort_reports`, `program_curriculum_hub`. Real `STRIPE_PRICE_ACCEL_STARTER` deferred to P8.5. |
| Cohort Growth | A$1,500 (≤50) | Regional accelerators | ✅ Shipped with placeholder Stripe ID + `usage_limits.seats=50`, `monthly_credits=8000`, 14d trial. Adds `co_mentor_pool`, `cohort_batch_reports`, `alumni_network_tools`. Real `STRIPE_PRICE_ACCEL_GROWTH` deferred to P8.5. |
| Cohort Enterprise | A$3,500 + A$50/founder over 100 | Antler-scale | ✅ Shipped with placeholder Stripe ID + `usage_limits.seats=-1` (unlimited), `monthly_credits=-1`, 14d trial, "Contact sales" CTA. Adds `multi_cohort_management`, `white_label_reports`, `dedicated_success_manager`, `sso`. Real `STRIPE_PRICE_ACCEL_ENTERPRISE` deferred to P8.5. |

### Add-ons / metered

- Credit packs A$5/10, A$15/50, A$25/100
- Extra profile A$10/mo
- Term Sheet AI 1 credit/doc
- AU compliance pack (ESIC/R&D/ASIC) A$49/report
- Investor-Ready Report A$99 (1/mo free on Growth+)
- Data-room concierge A$499 flat
- Extra investor seat A$79/seat/mo
- Institutional API A$1,000/mo
- SVI Index license A$5,000/mo

---

## Architecture Decisions

1. **Entitlement system mới** `web/src/lib/entitlements.ts` — thay hard-coded `plan === "growth"` checks. Function `can(user, "cap_table.write")` là single source of truth. Load `Plan.feature_flags[]` + `Plan.usage_limits{}` từ DB.
2. **Segment axis mới**: `app_users.segment` enum (`founder`, `investor_angel`, `investor_vc`, `advisor`, `accelerator`, `lp`, `admin`). Migration `0073_user_segments.sql`.
3. **Plan matrix data-driven**: bảng `plans` (migration `0074_plans_matrix.sql`); cột `id, segment, price_aud_cents, interval, trial_days, stripe_price_id, feature_flags jsonb, usage_limits jsonb`. Seed 12 SKUs.
4. **Stripe 7-day trial**: `checkout/route.ts` set `subscription_data.trial_period_days=7`; SetupIntent capture card at signup; webhook thêm handler `customer.subscription.trial_will_end` → email T-3d + T-1d + T-0h.
5. **GA4 event catalog** — chuẩn hóa: `sign_up`, `trial_start`, `trial_end`, `subscribe`, `plan_upgrade`, `plan_downgrade`, `report_generate`, `dashboard_view`, `feature_gate_hit`, `equity_offer_request`, `share_link_open`. GA4 property + BigQuery export.
6. **Homepage v2** — luxury dark theme default (deep navy #0A1628 + gold #C9A961 + electric cyan #22D3EE); hero "Get Fundable in 7 Days"; 3-column value prop (Founder / Investor / Accelerator); pricing tabs per segment; trust logos + testimonials.
7. **Menu progressive disclosure**: Starter thấy Overview + Evaluation + Evidence + Reports basic; Growth mở Cap Table + Data Room + Investor Links; Scale mở ESOP + Blockchain Sync + Advisor Portal + White-label; Enterprise mở API + SSO + Custom.
8. **QA + random test accounts** — `scripts/seed-test-users.mjs` tạo 12 accounts (2 per segment × 6 segments); Playwright suite full user journey per tier.

---

## Phases

### Phase 0 — Kickoff (Day 0, hôm nay)
- Master plan file (this doc) ✅
- C-Level orchestrator Workflow (12 agents Phase 1 → 1 synthesis) 🔄
- Update `web/ROADMAP.md` + `web/content/reports/ceo-current-plan.json`

### Phase 1 — Research + Detailed Specs (Day 1, parallel)
12 C-level agents write specs to `knowledge-base/upgrade-plan-2026-07-16/<agent>-spec.md`:
CPO/UI-UX · CTO · CFO · CMO · CDO · CRO · CISO · CLO · CHRO · COO · QA Lead · DevRel

### Phase 2 — Synthesis (Day 1 end)
Architect consolidates → `docs/upgrade-implementation-plan-2026-07-16.md`

### Phase 3 — Implementation (Day 2-14, 7 parallel workers in isolated worktrees)
- **W1** Backend/Stripe/Entitlement (`cto` + `secure-code-guardian`)
- **W2** UI/UX Homepage v2 + Menu (`ui-ux-pro-max` + `react-expert` + `nextjs-developer`)
- **W3** Onboarding & Upgrade UX per Tier (`cpo` + `react-expert`)
- **W4** GA4 + Analytics + Metrics Dashboard (`cdo` + `analytics`)
- **W5** Investor + Accelerator dashboards (`fullstack-guardian` + `nextjs-developer`)
- **W6** Equity-for-Solution "Request a Call" scaffold (`clo` + `secure-code-guardian`)
- **W7** QA + Test Accounts + Playwright (`qa-lead` + `test-master`)

### Phase 4 — Verification & Deploy (Day 15)
- Full QA regression, `verify` skill, `security-audit`, `code-review`
- `deploy.sh` → staging smoke → production
- Update `web/ROADMAP.md`, `web/CHANGELOG.md`, `web/content/reports/version.json`
- Announce v2.0 (insights + email + Telegram)

### GOAL 4 — Continuous CI/CD + Uptime Guardian (parallel, MANDATORY, no batching)

**Trigger:** mỗi khi 1 task hoàn thành → auto-pipeline chạy ngay, không đợi sprint end.

**Pipeline per task (`web/scripts/ship-task.sh` — mới):**
```
1. git add + commit (single task, atomic)
2. Lint (eslint --max-warnings=0) → fail = stop
3. Typecheck (tsc --noEmit) → fail = stop
4. Unit test scoped (vitest --changed) → fail = stop
5. Build standalone (next build) → fail = stop, alert Telegram
6. Migration dry-run (supabase db diff) → if migrations changed
7. Push to GitHub (backup + collaboration)
8. Deploy staging (deploy-live.sh --env=staging) → smoke → fail = stop
9. Deploy prod (deploy-live.sh --swap) → smoke 3× → fail = auto-rollback
10. GA4 pageview probe + Stripe webhook probe → fail = auto-rollback
11. Announce Telegram (task ID + version + duration)
12. Update version.json + CHANGELOG.md
```

**Uptime Guardian v2 (extend existing `web/scripts/uptime-watcher.sh`):**
- Existing: 1-min HTTP probe, graduated response (3 fails → restart, 5 fails → rollback), Telegram alert.
- ADD: `/api/healthz` deep probe (Supabase ping, Stripe ping, Anvil chain ping, Redis ping if enabled) every 2 min.
- ADD: Response-time SLO alert (p95 > 800ms 3 samples → Telegram + auto-profile).
- ADD: Memory > 85% for 5 min → auto-restart PM2/next-server + Telegram.
- ADD: Disk > 90% → auto-run cleanup routine + Telegram.

**Auto-cleanup routine (`web/scripts/server-cleanup.sh` — new, cron 4h):**
- Docker: `docker system prune -af --volumes` (per existing `web/content/reports/cron-health.jsonl` weekly-disk-cleanup baseline).
- npm/pnpm cache: > 30 days.
- `.next/` cache: keep last 3 builds only.
- Logs: rotate `/tmp/blockid-*.log` at 100KB, gzip after 24h, delete after 14d.
- Report bloat: `web/content/reports/` — archive files older than 90d to `/data/archives/reports/YYYY-MM/`.

**Performance auto-tune (`api/cron/performance-audit`, hourly):**
- Lighthouse CI on 5 critical routes (/, /pricing, /dashboard, /score, /workspace/billing) → JSON to `content/reports/perf-YYYY-MM-DD.jsonl`.
- Alert if score < 85 (mobile) or < 90 (desktop) for any route.
- Auto-file GitHub issue via API if perf regression > 10% vs 7d baseline.

**Rollback safety net:**
- Every deploy stamps `web/.deploy-manifest.json` (git SHA + timestamp + `.next` hash).
- Retention: last 5 releases in `/data/blockid-releases/YYYY-MM-DD-SHA/`.
- Rollback: `deploy-live.sh --rollback` restores previous manifest, auto-tested with smoke suite.
- Auto-rollback triggers: (a) post-deploy smoke fail, (b) 5 consecutive uptime fails, (c) 3 consecutive `/api/healthz` deep fails, (d) manual `POST /api/admin/rollback` from admin.

**Self-fix agent (`api/cron/agent-guardian` extension, 10-min):**
- Existing: disk/mem/cron-fail watchdog.
- ADD: known-issue playbook lookup table (`web/content/reports/self-fix-playbook.json`) — pattern-match on error signature → auto-remediate:
  - `EADDRINUSE :4001` → kill stale pid + restart.
  - `PGRST refresh timeout` → `docker exec -it supabase-db psql -c "NOTIFY pgrst, 'reload schema'"`.
  - `Stripe webhook 401` → rotate secret + redeploy.
  - `Build cache full` → cleanup + retry.
- Every auto-fix logs to `guardian-history.jsonl` + Telegram summary.

**Version bump (`web/scripts/version-bump.mjs`):**
- After each successful prod swap, bump patch version in `web/content/reports/version.json`.
- Format: `v{major}.{minor}.{patch}` — major on breaking, minor on Goal 1-3 milestones, patch on incremental fixes.
- Auto-append to `web/CHANGELOG.md` with commit list + task ID.

**Alerting stack (Telegram + email + admin dashboard):**
- Existing: `api/cron/telegram-report` daily.
- ADD: severity levels (INFO / WARN / ALERT / CRITICAL) with different channels.
- CRITICAL (auto-rollback fired, > 5 min downtime, security event) → SMS via Twilio + phone call via VAPI stub.
- Admin dashboard widget `dashboard/admin/uptime-guardian` — live status + last 24h incidents + auto-fix log.

---

## Critical Files

- **Plan & entitlement**: `web/src/lib/plans.ts` (rewrite → DB-backed), `web/src/lib/entitlements.ts` (new), `web/src/lib/credits.ts` (integrate)
- **Stripe**: `web/src/app/api/stripe/{checkout,webhook,change-plan}/route.ts`
- **Menu**: `web/src/components/workspace/workspace-layout.tsx`, `web/src/components/site/navbar.tsx`
- **Homepage**: `web/src/app/page.tsx`, `web/src/components/landing/{hero,pricing}.tsx`
- **Analytics**: `web/src/lib/analytics/ga4.ts` (new), `web/src/app/layout.tsx`
- **Onboarding**: `web/src/app/onboarding/onboarding-wizard.tsx`
- **Migrations**: `0073_user_segments.sql`, `0074_plans_matrix.sql`, `0075_entitlements_audit.sql`, `0076_equity_offers.sql`, `0077_ga4_events_mirror.sql`
- **Test seeds**: `web/scripts/seed-test-users.mjs` (new)
- **Docs**: `web/ROADMAP.md`, `web/CHANGELOG.md`

## Reuse (đừng viết lại)

- `web/src/lib/stripe.ts` (extend, don't replace)
- `web/src/lib/credits.ts` `FEATURE_COSTS` → integrate as `usage_limits` override
- `web/src/lib/investor-links.ts` → reuse cho investor dashboard
- `web/src/lib/blockchain-sync.ts` + `web/src/lib/tokenization.ts` → reuse cho equity anchoring (KHÔNG viết on-chain issuance mới)
- `web/src/lib/badges.ts` + `web/src/lib/svi-badges.ts` → reuse cho tier badges
- `web/src/components/workspace/workspace-layout.tsx` `NAV_GROUPS` → extend với `minPlan` + `segments[]`
- `web/scripts/scn-build-agent.sh` pattern → reuse cho test-user seeding
- `web/src/lib/report-pipeline/*` → reuse cho Investor-Ready Report SKU

---

## Verification

- **End-to-end drive** (`verify` skill): 12 test accounts, trial start/upgrade/cancel journey, GA4 DebugView events, webhook idempotency.
- **Stripe test-mode** (`stripe-test`): 7-day trial → force-end → auto-charge → entitlement flip.
- **Playwright** (`qa-lead`): 12 journey specs headless + screenshots per tier.
- **Security** (`security-audit`): CSP + RLS + webhook signature + secrets.
- **Compliance sanity**: manual check equity/share pages có "not financial advice" disclaimer.
- **Homepage visual**: Playwright screenshot desktop + mobile luxury theme.
- **Rollback**: flag `NEXT_PUBLIC_UPGRADE_V2=false` revert; migrations additive-only (no drops).

---

## Competitor Positioning (30-sec lines)

- **vs Carta/Pulley/Cake/Eqvista** (cap-table): *"Carta manages cap table AFTER you raise. BlockID gets you fundable — SVI + evidence + cap table + AI copilot in one, priced for pre-seed."*
- **vs Crunchbase/PitchBook/Dealroom** (deal intel): *"They score you as a data point. BlockID scores you as a founder — evidence you control, updated weekly."*
- **vs Visible/Foundersuite** (investor-update): *"Stop sending emails no-one reads. Send a live SVI page — verified, tamper-evident, real-time."*
- **vs F6S/AcceleratorApp**: *"F6S lists your cohort. BlockID scores it — weekly SVI delta per founder + LP-ready quarterly reports."*
- **vs AdvisorShare/Slicing Pie**: *"Templates don't vest. BlockID issues, tracks, notifies and settles advisory equity into your live cap table."*

---

## AU Regulatory Guardrails [verify with counsel]

- **CSF (RG 261/262)**: BlockID NOT operate as CSF intermediary without licence. Discovery/matching safer perimeter.
- **s911A financial-product-advice**: SVI + valuation ship với general-advice warning + not-a-formal-valuation disclaimer. Never personalise.
- **MIS**: Investor tiers non-pooled (discovery/report only).
- **Tokenised shares**: still shares under Corps Act — off-chain-first, blockchain mirror only; ASIC register = source of truth.
- **Advisory-SAFE / equity-for-services**: s708 small-offer or ESS employee rules; per-issuer counsel review.
- **GST**: 10% once turnover ≥ A$75K rolling 12mo.
- **Privacy Act 1988**: cap-table + shareholder data triggers APP + NDB.
- **ACL / Fair Trading**: GST-inclusive on consumer pages; auto-renewal disclosure at signup AND during trial.

---

## Metrics (must instrument for pre-seed pitch)

| Metric | Month-6 target |
|---|---|
| Trial→paid (7-day opt-out) | 25–35% |
| Free→paid (organic) | 2–4% |
| ARPU by segment | Founder A$49, Investor A$120, Accelerator A$1,000 |
| CAC blended | <A$150 (SEO <A$50) |
| LTV/CAC Founder | ≥ 3× |
| Logo churn/mo | <5% Growth, <3% Scale |
| Net revenue churn | <2% |
| Gross margin | Founder 88–95%, Investor 92%, Accelerator 80% |
| Payback | <9 mo Founder, <18 mo Enterprise |
| WAU/paid | ≥40% |
| Time-to-first-report | <10 min |
| Investor share-link opens/founder | >3 = viral loop |
| NPS | ≥40 |
| K-factor | ≥0.5 |

Ship `/dashboard/admin/pricing-metrics` graphing these weekly.

## v4 evaluator-first (2026-09-16)

Source: `.claude/plans/ph-n-t-tch-t-on-b-snuggly-panda.md` §3 (goal G14, CFO). Founder decisions 2026-09-16: evaluator-first, keep the A$3 wedge, raise the B2B tiers. **No live price changed** — a price change is always a new Stripe Price + grandfather via `plans.active`; annual = 10× monthly. Code: `web/src/config/pricing/plans.csv` (16 rows, 15 active) → `plans.generated.ts` / `stripe-seed.json` (`npx tsx scripts/build-plans.ts`), `web/src/lib/plans-v2.ts`, `web/src/lib/entitlements/tier-ladder.ts`, migration `0400_sync_plan_rows_v4.sql`.

### Ladder v4

| Tab | id | Name | A$/mo | A$/yr | Change | usage_limits |
|---|---|---|---|---|---|---|
| Evaluator | `investor_angel` | Scout | 79 | 790 | none | unchanged |
| | `investor_advisor` | Firm | 149 | 1,490 | none | unchanged |
| | `investor_vc_small` | Program | 349 | 3,490 | copy only | unchanged |
| | **`investor_fund`** NEW | Fund | **999** | 9,990 | new, public, 7-day trial | `{"profiles":500,"portfolio_size":500,"reports_per_month":-1,"seats":10}` + Program flags + `custom_benchmark`, `multi_fund`, `weekly_delta` (no `sso`) |
| | `investor_vc_ent` | VC Enterprise | custom | 30,000 | contact | unchanged |
| Programs (annual-first, 14-day trial) | **`accelerator_intake`** NEW | Intake link | **249** | 2,490 | new, public | `{"profiles":60,"reports_per_month":40,"seats":3}` + `cohort.view`, `cohort.view.stats`, `accelerator.cohort`, `investor.dealflow`, `watchlist`, `svi.feed`, `diligence_pack`, `lp_report`, `grant_finder`, `money_radar` |
| | `accelerator_starter` | **Cohort 25** | 500 | 5,000 | public + limits (price kept) | `{"profiles":25,"reports_per_month":50,"seats":5,"monthly_credits":200}`; flags ⊇ Intake |
| | `accelerator_growth` | **Cohort 100** | 1,500 | 15,000 | public + limits (price kept) | `{"profiles":100,"reports_per_month":200,"seats":15,"monthly_credits":800}`; flags ⊇ Cohort 25 + `cohort.manage` |
| | `accelerator_enterprise` | Cohort Enterprise | 3,500 | 35,000 | contact | adds `"reports_per_month":-1`; flags ⊇ Cohort 100 + `white_label`, `api`, `api.access`, `sso` |
| Data | **`index_api`** NEW | Index API | **299** | 2,990 | new, `public:false` — sold from `/startup-index`, `/developers`, the /pricing contact-sales row; also `STRIPE_PRICE_MAP.svi_api_team` | `{"profiles":0,"reports_per_month":0,"seats":2,"api_daily_calls":1000}` + `api`, `api.access`, `svi.feed` |

Notes:
- `intake.manage` (plan §3.2) does not exist in the `Feature` union yet — it ships with G14 S35; the Intake row carries the evaluator flags instead, which is what batch scoring (`lp_export OR accelerator.cohort`) and the sponsor / LP export (`lp_report`) gate on today.
- The cohort rows gained the Intake flags because the tier ladder requires each rung to be a superset of the rung below (`tier-ladder.test.ts` invariant b) — a A$500 Cohort 25 must not have fewer capabilities than a A$249 Intake link.
- The Fund card names only shipped things: 10 seats, unlimited reports, 500 tracked startups, read-only API, quarterly LP / sponsor report, weekly Progress Radar, your own rubric weights. **Never Affinity / Slack / Airtable** until G14 S38 ships (truth rule). `custom_benchmark` / `multi_fund` / `weekly_delta` are on the row for future gating; no page gates on them yet, so the copy does not sell a "benchmark set".
- `/pricing` now has three tabs — Founder | Evaluator (4 cards, `lg:grid-cols-4`) | Programs (annual-first via `billing_default: "annual"`). `?persona=` is accepted as a `?segment=` alias (deck v3 links).
- `svi-api-auth.ts` Team tier A$199 → A$299 (mirrors `index_api`); `POST /api/svi-api/checkout` no longer 503s once `STRIPE_PRICE_INDEX_API` / `STRIPE_PRICE_INVESTOR_VC_ENT` are set.

### Credit decision

**1 credit = A$1 list** (`lib/credits.ts`); credit packs discount to A$0.60 (`credit-packs.ts`, 100 credits = A$60). The "1 credit ≈ A$0.025 (200 credits = A$5 report)" spec in `lib/pricing/v3-skus.ts` and its unshipped §8.5 ladder (Growth A$53.90 / Professional A$163.90 / Programme A$5,389 / Enterprise) were removed on 2026-09-16 — nothing imported them and no Stripe Product carried those ids. `v3-skus.ts` now holds only the three A$3 report SKUs.

### ARR bottom-up AU (plan §3.3, Appendix D of G12) — deck S6/S11

| SKU | Universe | Bear M12 | Base M12 | Base M24 | Bull M24 |
|---|---|---|---|---|---|
| Scout | ~1,200 angels | 60 → 56,880 | 120 → 113,760 | 250 → 237,000 | 400 → 379,200 |
| Firm | 4,345 firms | 10 → 17,880 | 25 → 44,700 | 60 → 107,280 | 120 → 214,560 |
| Program | ~400 orgs | 10 → 41,880 | 20 → 83,760 | 40 → 167,520 | 60 → 251,280 |
| Fund | ~38 | 1 → 11,988 | 4 → 47,952 | 8 → 95,904 | 12 → 143,856 |
| Cohort 25 | 56 | 3 → 15,000 | 8 → 40,000 | 15 → 75,000 | 25 → 125,000 |
| Cohort 100 | ~10 | 0 | 2 → 30,000 | 4 → 60,000 | 6 → 90,000 |
| Intake link | ~25 | 2 → 5,976 | 5 → 14,940 | 10 → 29,880 | 15 → 44,820 |
| Index API | ~20 | 1 → 3,588 | 3 → 10,764 | 6 → 21,528 | 10 → 35,880 |
| **Recurring ARR** | | **A$153K** | **A$386K** | **A$794K** | **A$1.28M** |

### Stripe steps (founder-gated — never run by an agent)

1. `cd web && npx tsx scripts/build-plans.ts` (already committed; re-run = only `generated_at` changes).
2. Dry-run in test mode: `node scripts/seed-stripe.mjs --test-mode --dry-run --skus=investor_fund,accelerator_intake,index_api`.
3. Test mode for real: `node scripts/seed-stripe.mjs --test-mode --skus=investor_fund,accelerator_intake,index_api` → check the three Products (metadata `plan_id`) and six Prices (`tax_behavior: inclusive`, monthly + annual) in the test dashboard; run a test checkout on each.
4. Live: `node scripts/seed-stripe.mjs --skus=investor_fund,accelerator_intake,index_api` — writes `plans.stripe_price_id` / `stripe_price_id_annual` on the three rows.
5. Copy the six ids into **both** `web/.env` and `web/.env.runtime`: `STRIPE_PRICE_INVESTOR_FUND(_ANNUAL)`, `STRIPE_PRICE_ACCEL_INTAKE(_ANNUAL)`, `STRIPE_PRICE_INDEX_API(_ANNUAL)`. `STRIPE_PRICE_INVESTOR_VC_ENT` powers `svi_api_institutional`.
6. Verify on the dashboard that `STRIPE_PRICE_ACCEL_STARTER(_ANNUAL)` and `STRIPE_PRICE_ACCEL_GROWTH(_ANNUAL)` were actually minted (G12 §9.6 checkbox was never ticked) — if not, `node scripts/seed-stripe.mjs --skus=accelerator_starter,accelerator_growth` — otherwise the Programs cards show "(unavailable)" on `/signup`.
7. `node scripts/sync-stripe-pricing.mjs` — the audit now lists every evaluator / programs row (monthly + annual, inclusive) and flags `MISSING_ID` / `DRIFT` / `CADENCE_DRIFT`.
8. Apply the migration: `scripts/db/apply-migration.sh web/supabase/migrations/0400_sync_plan_rows_v4.sql`, then `node scripts/db/migration-status.mjs --write` and commit `web/content/reports/schema-migrations.json`.

### Grandfather rule

Existing subscribers keep their Stripe Price id and their row's entitlements. A rename (Cohort Starter → Cohort 25) changes `plans.name` only. A limits change on an existing row (0400) applies to every subscriber on it — v4 only ever *adds* to the accelerator rows (`reports_per_month`, flags) and re-bases seats / credits to the figures the founder approved; the Stripe amount is untouched. Any future price move = new Stripe Price + `active=false` on the old row (never delete a Price), exactly as founder_scale (Pro) was retired on 2026-09-08.

Reseller never touches Stripe; Auschain PTY LTD is seller of record; all prices GST-inclusive.
