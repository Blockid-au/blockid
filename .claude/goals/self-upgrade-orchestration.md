# BlockID.au — Self-Upgrade Multi-Agent Orchestration System

## Vision
BlockID.au tự động nghiên cứu, tự nâng cấp, và cải thiện liên tục qua hệ thống Multi-Agent Orchestration. Mỗi C-Level agent có trách nhiệm riêng, chạy theo lịch cố định trên Anthropic cloud, và tổng hợp kết quả vào một dashboard thống nhất.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 CEO ORCHESTRATOR                      │
│  (Weekly strategy review + agent performance eval)    │
├─────────────┬──────────┬──────────┬─────────────────┤
│             │          │          │                   │
▼             ▼          ▼          ▼                   ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────────┐
│  CTO  │ │  CMO  │ │  CFO  │ │  CPO  │ │ RnD Agent │
│ Daily │ │ Daily │ │Weekly │ │Weekly │ │  Daily    │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └─────┬─────┘
    │         │         │         │             │
    ▼         ▼         ▼         ▼             ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────────┐
│ CISO  │ │  CRO  │ │  COO  │ │  CLO  │ │ CDO Agent │
│Weekly │ │ Daily │ │ Daily │ │Monthly│ │  Daily    │
└───────┘ └───────┘ └───────┘ └───────┘ └───────────┘
```

---

## Scheduled Routines (Anthropic Cloud)

### TIER 1: Daily Routines (6 AM AEST)

#### R1: CTO — Code Quality & Feature Delivery
```
Schedule: Daily 6:00 AM AEST (20:00 UTC prev day)
Duration: ~15 min
```
- Run lint on latest commit → auto-fix + PR if issues found
- Check for TypeScript errors → fix + PR
- Monitor build health (npm run build must pass)
- Check production uptime (curl https://blockid.au)
- Review any pending PRs from other agents
- **Output**: `cto-daily-report.md` committed to repo

#### R2: CMO — SEO & Content Pipeline
```
Schedule: Daily 7:00 AM AEST (21:00 UTC prev day)
Duration: ~20 min
```
- Run /seo-audit on blockid.au → auto-fix meta tags, sitemap, structured data
- Check Google Search Console for new indexed pages, crawl errors
- Generate 1 SEO article from topic queue (if publish-insight cron didn't run)
- Update competitor keyword rankings
- Post LinkedIn update from content calendar
- **Output**: `cmo-daily-report.md` + SEO fixes PR

#### R3: RnD — Competitor Intelligence & Feature Research
```
Schedule: Daily 8:00 AM AEST (22:00 UTC prev day)
Duration: ~10 min
```
- Scan competitor websites for pricing/feature changes
- Check Product Hunt, Hacker News for relevant launches
- Research emerging tools in startup infrastructure space
- Propose 1 feature improvement based on market gaps
- **Output**: `rnd-daily-brief.md`

#### R4: CRO — Conversion & Funnel Analysis
```
Schedule: Daily 9:00 AM AEST (23:00 UTC prev day)
Duration: ~10 min
```
- Pull GA4 metrics (visitors, conversions, bounce rate)
- Analyze signup → analysis → payment funnel
- Identify drop-off points
- A/B test recommendations for homepage CTA
- **Output**: Update `analytics-daily.json` in repo

#### R5: COO — System Health & Operations
```
Schedule: Daily 5:00 AM AEST (19:00 UTC prev day)
Duration: ~5 min
```
- Health check all endpoints (/api/auth/me, /api/svi, /api/stripe)
- Check Supabase connection, Redis, AI provider health
- Monitor disk space, memory, process uptime
- Alert if any service is down
- **Output**: `system-health.json`

#### R6: CDO — Data Quality & Analytics
```
Schedule: Daily 10:00 AM AEST (00:00 UTC)
Duration: ~10 min
```
- Verify SVI scoring consistency (sample 3 recent analyses)
- Check data integrity (orphan records, missing foreign keys)
- Auto-import GitHub metrics for connected accounts
- Monitor credit balance anomalies (double-spend detection)
- **Output**: `data-quality-report.md`

### TIER 2: Weekly Routines (Monday 8 AM AEST)

#### R7: CEO — Strategy Review & Agent Performance
```
Schedule: Monday 8:00 AM AEST (Sunday 22:00 UTC)
Duration: ~20 min
```
- Review all agent daily reports from the week
- Synthesize KPIs: users, MRR, SVI analyses, conversion rate
- Compare with targets from CEO sprint goal
- Identify blockers and re-prioritize
- Generate weekly summary email to admin
- **Output**: `ceo-weekly-review.md` + email

#### R8: CFO — Revenue & Cost Analysis
```
Schedule: Monday 9:00 AM AEST
Duration: ~15 min
```
- Pull Stripe revenue data (MRR, new subscribers, churn)
- Calculate unit economics (LTV, CAC, burn rate)
- AI budget tracking (spent vs $100/month limit)
- Credit pack sales analysis
- Pricing optimization recommendations
- **Output**: `cfo-weekly-report.md`

#### R9: CPO — Product & UX Analysis
```
Schedule: Monday 10:00 AM AEST
Duration: ~15 min
```
- Analyze user behavior patterns (most used features, drop-offs)
- Review onboarding completion rates
- Prioritize feature backlog based on usage data
- User feedback analysis (if feedback form exists)
- **Output**: `cpo-weekly-report.md`

#### R10: CISO — Security Posture Review
```
Schedule: Monday 11:00 AM AEST
Duration: ~10 min
```
- Full security headers audit (CSP, HSTS, etc.)
- Check for exposed secrets in recent commits
- Review rate limiting effectiveness
- SSL certificate expiry check
- OWASP Top 10 quick scan
- **Output**: `ciso-weekly-report.md`

### TIER 3: Monthly Routines (1st of Month)

#### R11: CLO — Compliance & Legal Review
```
Schedule: 1st of month, 10:00 AM AEST
Duration: ~15 min
```
- Review Terms of Service for new features
- Check ESIC compliance documentation
- Update financial disclaimer if needed
- Privacy policy audit for new data sources
- **Output**: `clo-monthly-report.md`

#### R12: CHRO — Team & Culture
```
Schedule: 1st of month, 11:00 AM AEST
Duration: ~10 min
```
- Review agent ecosystem health
- Propose new agent roles if needed
- ESOP/vesting schedule reminders
- Community engagement metrics
- **Output**: `chro-monthly-report.md`

---

## Mentor & Advisor System for Startups

### How BlockID Mentors Each Startup

```
USER INPUT → SVI ANALYSIS → PHASE DETECTION → STAGE-AWARE GUIDANCE
     ↓              ↓              ↓                    ↓
  Idea text    8 dimensions    0-5 phase       Personalized next steps
  URL detect   Weighted score  Auto-classify   Evidence suggestions
  Doc upload   Confidence      Stage badge     Feature recommendations
  GitHub       Percentile      Mentor tone     Roadmap timeline
```

### Evidence Sources → SVI Impact

| Source | What's Analyzed | SVI Dimensions | Confidence |
|--------|----------------|----------------|------------|
| **Idea text** | Problem clarity, market size, team signals | All 8 | 0.20 |
| **Website URL** | Tech stack, security, performance, maturity | PTD, SVM, TRE, LCO | 0.75 |
| **GitHub repo** | Code quality, CI/CD, testing, activity | PTD, FTV, TRE | 0.75 |
| **LinkedIn** | Founder experience, network, endorsements | FTV, CGH | 0.75 |
| **Documents** | Pitch deck, financials, legal docs | Variable | 0.50 |
| **Stripe** | Revenue, MRR, transaction count | TRE | 0.90 |
| **Google Analytics** | MAU, DAU, retention, traffic sources | TRE, MPC | 0.75 |
| **Chat exports** | Slack, Discord, Notion (future) | TRE, FTV | 0.50 |

### Valuation Model

```
BASE_VALUATION = f(SVI_score, stage, industry_multiplier)

Stage 0 (Idea):       $0 - $100K (pre-revenue, idea-only)
Stage 1 (Validated):   $50K - $500K
Stage 2 (MVP):         $200K - $2M
Stage 3 (Traction):    $500K - $5M
Stage 4 (Revenue):     $1M - $20M
Stage 5+ (Growth):     $5M - $100M+

ADJUSTMENTS:
+ Revenue multiplier (MRR × 12 × industry_multiple)
+ Team experience bonus (serial founder = +30%)
+ Market size bonus (TAM > $1B = +20%)
+ IP/moat bonus (patents, network effects = +15%)
- Competition penalty (saturated market = -10%)
- Compliance risk (no ABN, no legal = -15%)
```

### Auto-Generated Templates (Google Drive)

Templates auto-created for each startup based on phase:

| Phase | Templates Generated | Sync to Google Drive |
|-------|-------------------|---------------------|
| Idea | Lean Canvas, Problem Statement, Customer Persona | ✓ |
| Validation | Survey Template, Interview Script, Competitor Matrix | ✓ |
| MVP | Tech Stack Guide, Sprint Plan, User Story Template | ✓ |
| Equity | SHA Template, Vesting Schedule, Cap Table | ✓ |
| Fundraise | Pitch Deck, Financial Model, Data Room Checklist | ✓ |
| Growth | Board Report, KPI Dashboard, Exit Model | ✓ |

---

## Self-Upgrade Mechanism

### How Agents Self-Improve the Platform

```
1. RnD Agent researches competitor feature
2. CPO Agent evaluates impact vs effort (RICE score)
3. CTO Agent implements if approved (creates PR)
4. CISO Agent reviews security implications
5. COO Agent schedules deployment
6. CMO Agent creates marketing content for the feature
7. CRO Agent monitors adoption metrics
8. CFO Agent tracks revenue impact
```

### Continuous Improvement Loop

```
WEEKLY CYCLE:
Mon: CEO reviews → priorities set
Tue-Thu: CTO implements priority features
Fri: QA Agent tests + CISO security review
Sat: Deploy (if all checks pass)
Sun: CDO data quality check + RnD research

DAILY CYCLE:
5 AM: COO health check
6 AM: CTO lint + build check
7 AM: CMO SEO audit + content
8 AM: RnD competitor scan
9 AM: CRO funnel analysis
10 AM: CDO data quality
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [x] Agent-upgrade cron exists (23 tasks, budget-gated)
- [x] 10 existing cron jobs running
- [x] AI provider chain (9 providers)
- [ ] Set up Claude Code Routines on Anthropic cloud
- [ ] Create R1-R6 daily routines
- [ ] Create R7-R10 weekly routines

### Phase 2: Intelligence (Week 2-3)
- [ ] Connect Google Analytics API for auto-import
- [ ] Connect Slack/Discord webhook for team evidence
- [ ] Connect Notion API for document evidence
- [ ] Build living valuation engine (auto-recalculate on SVI change)
- [ ] Build startup benchmark database (anonymized SVI data)

### Phase 3: Automation (Week 3-4)
- [ ] Auto-generate phase-appropriate templates to Google Drive
- [ ] Auto-create vesting schedules from equity setup
- [ ] Auto-share cap table updates with shareholders
- [ ] Weekly SVI revaluation for all active startups
- [ ] Auto-publish SEO articles from research

### Phase 4: Scale (Month 2+)
- [ ] Multi-agent team coordination via Agent Teams
- [ ] API triggers between routines for chain reactions
- [ ] Startup-to-startup benchmarking
- [ ] Investor matching based on SVI dimensions
- [ ] White-label reports for accelerators

---

## Cost Model

### AI Budget (Monthly)
| Provider | Monthly Limit | Cost/1K tokens | Usage |
|----------|--------------|----------------|-------|
| Gemini Flash | Free tier | $0 | Primary for crons |
| Groq | Free tier | $0 | Backup for crons |
| Claude (subscription) | Included | $0 extra | Heavy analysis |
| OpenAI (subscription) | Included | $0 extra | Backup |
| **Total AI budget cap** | **$100/month** | | Tracked in budget.json |

### Routine Costs (Anthropic Cloud)
| Routine Type | Count | Est. tokens/run | Monthly cost |
|-------------|-------|-----------------|-------------|
| Daily (6 routines) | 180 runs/mo | ~5K each | ~$15 |
| Weekly (4 routines) | 16 runs/mo | ~10K each | ~$5 |
| Monthly (2 routines) | 2 runs/mo | ~10K each | ~$1 |
| **Total** | **198 runs/mo** | | **~$21/mo** |

---

## Success Metrics

| Metric | Current | Month 1 | Month 3 |
|--------|---------|---------|---------|
| Auto-generated PRs/week | 0 | 3 | 10 |
| SEO articles published/week | ~1 | 3 | 5 |
| Competitor insights/week | 0 | 1 | 3 |
| SVI accuracy (vs manual) | ~70% | 80% | 90% |
| System uptime | ~99% | 99.5% | 99.9% |
| Agent tasks completed/day | ~5 | 15 | 30 |
