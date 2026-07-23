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

### Investor / advisor side (per-seat)

| Tier | AUD/seat/mo | Fit |
|---|---|---|
| Angel | A$79 | Solo angel; watchlist 25, SVI feed, 5 diligence packs/mo |
| Advisor | A$149 | Lawyer/accountant/consultant; cohort 25, white-label |
| VC Small | A$349 (5-seat min) | Micro-VC/family office; portfolio, LP export |
| VC Enterprise | Custom (from A$2,500/mo) | Multi-fund; API, custom benchmarks |

### Accelerator / program side

| Tier | AUD/mo | Fit |
|---|---|---|
| Cohort Starter | A$500 (≤15 founders) | Uni programs, bootcamps |
| Cohort Growth | A$1,500 (≤50) | Regional accelerators |
| Cohort Enterprise | A$3,500 + A$50/founder over 100 | Antler-scale |

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
