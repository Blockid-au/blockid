# Goal: First Impression Excellence — The First Report Decides Everything

## Mission
The FIRST report a user receives determines whether they return, buy credits, or leave forever. Optimize the first-time experience to maximize retention, return visits, and credit purchases.

## Why This Matters
- 80% of SaaS churn happens within the first 7 days
- Users decide within 60 seconds if a product is worth their time
- The free SVI preview IS the product trial — it must be exceptional
- Every returning user is 5x more likely to purchase than a new one

## First Report Strategy

### The Free Preview Must Be INCREDIBLE
```
User submits idea/URL → 60 seconds later:
  ✅ SVI Score + Stage (instantly meaningful)
  ✅ 10-page narrative analysis (not bullet lists)
  ✅ Each page opens with a market insight hook
  ✅ Real competitor names mentioned
  ✅ Specific next steps (not generic advice)
  ✅ Locked preview teasers (make them WANT more)
  ✅ Estimated AUD valuation range
  ✅ "Your startup is at the Xth percentile for your stage"
```

### Content That Makes Users Come Back
1. **Personalized market insight** — "The Australian [industry] market grew 23% in 2025..."
2. **Named competitors** — "You're competing with [X], [Y], and [Z] — here's your advantage..."
3. **Specific financial context** — "At your stage, similar startups raise A$300K-$1M..."
4. **Actionable next step** — "Upload your pitch deck to boost your score by +8-20 points"
5. **Progress tracking** — "Come back next week to see how your score changes"

### Locked Preview Teasers (Drive Upgrades)
Each page shows 1-2 sentences of what the paid deep dive contains:
- "Unlock: 5 named competitor profiles with funding data and threat levels..."
- "Unlock: 3-scenario financial projection model for your first 12 months..."
- "Unlock: 90-day action plan with budget estimates and hiring timeline..."

### Credit Pricing Psychology for First-Time Users
- First report: FREE (10 pages, enough value to hook them)
- First upgrade: A$0.50 (one section deep dive — low friction)
- After first purchase: Show "You saved A$299 vs consultant pricing"
- Bundle offer: "Unlock all 10 sections at Expert depth for A$3 (85% savings)"

## Self-Upgrade Tasks (Agent-Powered, Zero Cost)

### Daily (Non-AI, automatic)
- Track first-time user conversion: free preview → return visit → credit purchase
- Monitor time-on-page for each report section (GA4 data)
- Flag reports with <30 second view time (quality issue)

### Weekly (AI-powered, subscription models only)
- Sample 5 recent first-time reports → evaluate quality with AI
- Compare with competitor report quality (manual benchmark initially)
- Analyze which locked preview teasers get most clicks
- A/B test different report opening hooks

### Monthly (Research)
- Web search for competitor updates (Carta, Pulley, Equidam pricing/features)
- Analyze credit purchase patterns → optimize pricing tiers
- Review user feedback/support tickets for report quality issues
- Check Australian startup ecosystem data updates (ABS, ESIC, R&D Tax changes)

## Implementation Tasks

### P0 (This Sprint)
- [x] Report narrative prose style (not bullet lists) — DONE in SYSTEM_STANDARD
- [x] Locked preview teasers in report pages — DONE (lockedPreview field)
- [x] Mentoring tone with "Next Steps" per section — DONE
- [x] AI thinking status during generation — DONE
- [x] Track first-time vs returning user in analytics (localStorage + first_report_completed event)
- [x] Add "Your First Report" onboarding banner for new users (svi-entrance.tsx)

### P1 (Next Sprint)
- [ ] A/B test 3 different report opening hooks
- [x] Implement "Share with co-founder" button on report (rnd-locked-section.tsx)
- [x] Weekly report quality sampling via agent-upgrade cron (/api/cron/agent-upgrade)
- [x] Credit purchase nudge: "Upgrade this section for A$0.50" (rnd-locked-section.tsx)

### P2 (Following Sprint)
- [ ] Competitor pricing comparison dashboard (admin)
- [ ] User cohort analysis: first report → 7-day return rate
- [x] Personalized email 24h after first report (nurture cron): "3 things you can do today"

## Success Metrics

| Metric | Current | Target (30 days) | Target (90 days) |
|--------|---------|------------------|-------------------|
| First report completion rate | ~70% | 85% | 90% |
| First report → return (7 days) | ~10% | 25% | 35% |
| First report → credit purchase | ~5% | 12% | 20% |
| Report view time (avg) | Unknown | >3 min | >5 min |
| Locked preview click rate | Unknown | 15% | 25% |
| First upgrade amount | A$0 | A$0.50 avg | A$1.00 avg |

## Agent Assignments

| Agent | Responsibility | Cadence |
|-------|---------------|---------|
| CPO | Report UX, onboarding flow, A/B test design | Weekly review |
| CRO | Credit pricing optimization, conversion CTAs | Weekly optimization |
| CMO | Report content quality, market data freshness | Bi-weekly research |
| CDO | Analytics tracking, cohort analysis, data quality | Daily monitoring |
| CFO | Credit economy health, pricing experiments | Weekly analysis |
| COO | Report quality sampling, system health | Daily + weekly AI audit |
