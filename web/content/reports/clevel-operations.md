# C-Level Operations Model — BlockID.au

**Version:** v1.0 · **Date:** 2026-06-13 · **Standard:** Unicorn Startup Operating Model

---

## Philosophy: Continuous Improvement Loop

```
Research → Decide → Build → Deploy → Measure → Improve → Repeat (24h cycle)
```

Every C-Level agent operates on this loop. No agent sits idle — every 24h cycle either ships code, generates data, or produces a decision artefact.

---

## C-Level Structure

| Role | Focus | Cadence | Primary KPI |
|------|-------|---------|-------------|
| **CEO** | Strategy, implementing plan, cross-agent coordination | Daily | MRR, SVI score trend |
| **CTO** | Infrastructure, security, deploys, cost | Daily | Uptime, build time, AI cost/user |
| **CPO** | Product roadmap, user flows, feature value | Weekly | Feature adoption %, NPS |
| **CMO** | SEO, content, growth, social, email | Daily | Organic traffic, CAC |
| **CFO** | Pricing, revenue model, runway, unit economics | Weekly | MRR, burn rate, LTV:CAC |
| **CRO** | Conversion, funnel, A/B tests, CTAs | Daily | Free→Paid %, checkout CVR |
| **CDO** | Data quality, SVI accuracy, index foundation | Weekly | Data completeness %, index health |
| **CISO** | Security, compliance, AU privacy | Weekly | 0 CVEs, SOC2 readiness |
| **CHRO** | Team (agents + human), hiring plan | Monthly | Agent performance, response latency |
| **CLO** | Legal, ASIC compliance, term sheet accuracy | Monthly | 0 regulatory flags |
| **COO** | Operations, cron health, deployment quality | Daily | 0 failed deploys, cron uptime |

---

## Operating Cadence

### Daily (Automated — Cron)
1. **02:00 AEST** — CDO: SVI snapshot + data quality check
2. **04:00 AEST** — CMO: Growth insights + publish one SEO article
3. **07:00 AEST** — CTO: Auto-improve + deploy if CI passes
4. **08:00 AEST** — COO: Health check, security scan, error log review
5. **08:30 AEST** — CFO: Daily revenue report + burn tracking
6. **09:30 AEST** — CMO: Telegram C-Level summary
7. **10:00 AEST** — CEO: Daily summary → priorities → implementing-plan update

### Weekly (Sunday 03:00 AEST)
- CMO: Weekly insights email to all users
- COO: Disk cleanup, log rotation, npm cache clear
- CFO: Weekly unit economics review (LTV:CAC, payback period)
- CPO: Feature usage analysis, NPS request to active users

### Monthly
- CEO: SCN (Startup Context Node) update — stage, revenue, users, AI budget
- CHRO: Agent performance review, add/remove/upgrade agent capabilities
- CLO: Compliance scan — ASIC, ATO, AU Privacy Act
- CFO: Pricing review — credit pack performance, conversion by price point

---

## Continuous Improvement Protocol

Every agent follows this decision tree for self-upgrade:

```
1. Observe metric anomaly or opportunity
2. Research: read codebase + user data + market
3. Propose: write task to implementing-plan.md
4. Build: max 3 files changed per PR
5. Gate: tsc 0 errors + eslint clean + tests pass
6. Deploy: bash scripts/deploy-live.sh (off-peak)
7. Measure: GA4 events + Supabase analytics
8. Document: update implementing-plan.md (shipped)
9. Repeat
```

**Rules:**
- Never deploy during AEST 06:00–22:00 (peak hours)
- Never skip CI gates (--no-verify is banned)
- Always revert on regression (3 failed endpoints = rollback)
- Max 1 breaking change per deploy

---

## Customer-First Operating Rules

1. **Immediate value**: Every new user must get a meaningful result within 60 seconds (SVI score visible before any prompt to pay)
2. **Pay-for-results**: Only prompt to pay when the user is about to receive a specific valuable output (PDF, data room access, investor pack)
3. **Minimum friction**: Free tier must work completely without signup (anonymous SVI)
4. **Trust first**: Every page with user data must show AU data residency badge
5. **No dark patterns**: Never hide the free option, never auto-enroll in recurring billing
6. **Transparency**: Pricing page always shows credits cost per action

---

## Revenue Model (Pay-Per-Result)

```
FREE HOOK:         Full SVI score (instant, no CC, 5 free credits)
MICRO UPGRADE:     A$2 for 5 more credits — lowest possible barrier
VALUE UNLOCK:      Specific results require credits (PDF = 2cr, data room = 5cr)
BATCH DISCOUNT:    Credit packs scale: A$2→A$5→A$9→A$19
LIFETIME VALUE:    Founding 50 (A$49) = 100 credits = clear best value
POWER USERS:       Growth subscription (A$99/mo) = unlimited operational use
INDEX (future):    API subscription A$299/mo for VC/research firms
```

---

## Startup Index Integration (Phase 1 Active)

Every SVI analysis automatically contributes an anonymised snapshot to the BlockID Startup Index:
- No PII stored — only `{sector, stage, region, svi_score, week}`
- Founders opt-in via Terms (contribute to index = get benchmark comparison free)
- Index compounds in value with every analysis run

See: `content/reports/startup-index-vision.md` for full roadmap.

---

## Quality Gates (Non-Negotiable)

| Gate | Threshold | Action on breach |
|------|-----------|-----------------|
| TypeScript errors | 0 | Block deploy |
| ESLint errors | 0 | Block deploy |
| Unit tests | 100% pass | Block deploy |
| Smoke test (7 endpoints) | 100% 200 | Block deploy + rollback |
| Disk usage (root /) | < 75% | Auto-clean |
| AI budget | < 5%/day | Throttle cron agents |
| Error rate (prod) | < 1% | Page oncall |
| TTFB (p95) | < 800ms | CTO investigate |
