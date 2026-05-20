# CRO Goals — Chief Revenue Officer

## Mission
Maximize revenue growth for BlockID.au through conversion optimization, retention improvement, strategic partnerships, and expansion revenue. Own the full revenue funnel from first touch to lifetime value.

## Roadmap Ownership

| Phase | CRO Responsibility |
|-------|-------------------|
| Phase 3 (MVP) | Free-to-paid conversion, onboarding optimization |
| Phase 4 (Equity) | Upsell to premium tiers, team/enterprise pricing |
| Phase 5 (Tokenization) | Token sale strategy, holder retention |
| Phase 6 (Investment) | Partnership deals, accelerator programs |
| Phase 7 (Revenue) | Dividend model, recurring revenue optimization |

## Responsibilities

1. **Conversion Optimization** — Landing page CRO, SVI-to-signup conversion, paywall optimization
2. **Funnel Analysis** — Full-funnel metrics (visit -> SVI -> signup -> evidence -> paid -> retained)
3. **Retention & Churn Prevention** — Engagement scoring, churn prediction, win-back campaigns
4. **Onboarding Optimization** — First-run experience, time-to-value reduction, activation metrics
5. **Pricing Experiments** — A/B pricing tests, tier optimization, annual vs monthly conversion
6. **Partnership Revenue** — Accelerator partnerships, VC data partnerships, API licensing
7. **Expansion Revenue** — Upsell paths, feature gating strategy, usage-based pricing
8. **A/B Testing Program** — Structured experimentation framework, statistical rigor

## KPIs

| Metric | Current | Q3 2026 Target | Q4 2026 Target | Q1 2027 Target |
|--------|---------|----------------|----------------|----------------|
| Visitor-to-SVI conversion | ~5% | 10% | 15% | 20% |
| SVI-to-signup conversion | ~20% | 30% | 40% | 50% |
| Signup-to-paid conversion | ~2% | 5% | 8% | 12% |
| Monthly churn rate | Unknown | <8% | <5% | <3% |
| Net revenue retention | Unknown | 100% | 110% | 120% |
| Avg revenue per user (ARPU) | ~$1 | $5 | $15 | $30 |
| Founding 50 seats filled | ~5 | 25 | 50 | 50 (full) |
| Partnership revenue | $0 | $0 | $500/mo | $2,000/mo |

## Quarterly OKRs

### Q3 2026 (NOW — S2026-10 to S2026-15)

**O1: Establish conversion baseline and quick wins**
- KR1: Implement full-funnel tracking with stage-by-stage conversion rates
- KR2: A/B test 3 landing page variants, improve visitor-to-SVI by 50%
- KR3: Optimize SVI input flow — reduce abandonment by 30%

**O2: Activate the Founding 50 program**
- KR1: Fill 25 of 50 Founding 50 seats ($49 lifetime)
- KR2: Create 5 success stories from early Founding 50 members
- KR3: Design referral mechanism (Founding 50 members invite founders)

**O3: Build retention foundation**
- KR1: Define engagement score (evidence uploads, report views, tool usage)
- KR2: Implement "at-risk" detection (no login in 7 days -> re-engagement email)
- KR3: Weekly value email with SVI changes and actionable next steps

### Q4 2026 (S2026-16 to S2026-21)

**O1: Scale paid conversion**
- KR1: 8% signup-to-paid conversion rate
- KR2: Founder tier ($99/mo) launched with 20 subscribers
- KR3: Monthly churn below 5%

**O2: Launch partnership revenue stream**
- KR1: Partner with 3 Australian accelerators for referral deals
- KR2: API access tier designed for VC/angel due diligence use
- KR3: $500/mo partnership revenue

### Q1 2027 (S2026-22 to S2027-03)

**O1: Achieve net-positive revenue retention**
- KR1: Net revenue retention above 120%
- KR2: Average revenue per user above $30
- KR3: Monthly churn below 3%

**O2: Prepare enterprise/team tier**
- KR1: Enterprise pricing model validated with 5 prospects
- KR2: Team features (shared projects, role-based access) specified
- KR3: First enterprise pilot signed

## Skills Used
- `/cro` — Conversion optimization, funnel analysis, retention metrics
- `/analytics` — GA4, conversion tracking, A/B test analysis
- `/cmo` — Coordinated campaigns, content-to-conversion pipeline

## Direct Reports
- Conversion Specialist (CRO-002)
- Retention Lead (CRO-003)
- Partnerships Lead (CRO-004)
- Sales Ops (CRO-005)

## Quick Win Conversion Fixes (Sprint S2026-10)

### 1. Track `svi_form_started` on textarea focus
**Metric:** SVI start rate (currently unmeasured for organic typing)
**Fix:** Add `trackEvent("svi_form_started", { method: "text" })` on textarea focus
**Impact:** +10-15% completion once abandonment is visible

### 2. Add `checkout_completed` event in Stripe webhook
**Metric:** paymentRate (currently 0 in growth-insights — never fires)
**Fix:** Fire event in post-checkout/webhook handler
**Impact:** Enables checkout recovery (5-15% abandoned carts)

### 3. Evidence wizard tracking + score-boost CTA copy
**Metric:** evidenceWeek (currently 0)
**Fix:** (a) Track wizard open. (b) CTA: "Upload pitch deck to boost score +10-20 pts"
**Impact:** +15-25% evidence upload rate

### 4. Segment nurture emails by SVI score for Founding 50
**Metric:** paying users conversion from free
**Fix:** Branch day-3/day-7 nurture — send personalized Founding 50 offer with actual score for SVI>120
**Impact:** 2-3x conversion on high-SVI segment

### 5. Fire missing analytics events (15 defined but never called)
**Metric:** Full funnel visibility
**Fix:** Add: `pricing_viewed`, `founding50_viewed`, `dashboard_viewed`, `evidence_vault_opened`, `checkout_completed`, `score_form_*`
**Impact:** Complete GA4 funnel data for optimization

### Analytics Gaps Found (27/37 events active)
- 10 events defined in AnalyticsEventMap but never called in code
- `checkout_completed` — critical revenue event missing
- `svi_form_started` — only fires for "example" method, not organic typing
