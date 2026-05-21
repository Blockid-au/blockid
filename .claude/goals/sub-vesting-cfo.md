# CFO Sub-Goal: Vesting & Share Structure — Pricing & Unit Economics

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Ensure the vesting/equity AI features are priced to maximize adoption while maintaining healthy unit economics. Model revenue contribution, optimize credit pricing, and prepare investor-grade financial projections for the equity management module.

---

## Credit Pricing Analysis

### Cost Basis (per AI call)
| Component | Cost per Call |
|-----------|-------------|
| Claude Sonnet 4 API (2K tokens out) | ~A$0.03 |
| Supabase DB reads/writes | ~A$0.001 |
| Compute (Vercel serverless) | ~A$0.002 |
| **Total cost per AI feature** | **~A$0.033** |

### Pricing vs Margin

| Feature | Credits | AUD Value | Cost | Margin | Margin % |
|---------|---------|-----------|------|--------|----------|
| ai_equity_split | 1.00 | A$1.00 | A$0.04 | A$0.96 | 96% |
| ai_vesting_schedule | 0.50 | A$0.50 | A$0.03 | A$0.47 | 94% |
| ai_share_structure | 0.75 | A$0.75 | A$0.03 | A$0.72 | 96% |
| ai_esop_pool | 0.50 | A$0.50 | A$0.03 | A$0.47 | 94% |
| ai_vesting_review | 1.50 | A$1.50 | A$0.06 | A$1.44 | 96% |

**All margins >94%** — AI equity features are extremely profitable per-call.

### Competitive Pricing Benchmark
| Competitor | Equity Setup | Monthly Fee | Per-Feature |
|------------|-------------|-------------|-------------|
| Carta | Free basic | $99-999/mo | N/A (bundled) |
| Pulley | Free basic | $49-599/mo | N/A (bundled) |
| Cake Equity | Free basic | $79-599/mo | N/A (bundled) |
| **BlockID** | **Free basic** | **$0 (credit-based)** | **$0.50-1.50** |

**Key differentiator**: BlockID uses pay-per-use credits instead of monthly subscriptions, making it accessible to early-stage founders who can't justify $99/mo.

---

## Revenue Projections (Vesting Module)

### Assumptions
- 50 startups using vesting features by Q4 2026
- Average 3 AI recommendations per startup = 150 AI calls
- Average revenue per startup from vesting: A$2.75 (1 equity split + 2 vesting schedules)
- Growth: 20% MoM after launch

### Quarterly Revenue Forecast

| Quarter | Active Startups | AI Calls/Mo | Revenue/Mo | Cumulative |
|---------|----------------|-------------|------------|------------|
| Q3 2026 (launch) | 15 | 45 | A$67 | A$200 |
| Q4 2026 | 50 | 150 | A$225 | A$875 |
| Q1 2027 | 120 | 360 | A$540 | A$2,495 |
| Q2 2027 | 250 | 750 | A$1,125 | A$5,870 |

### Contribution to Overall MRR
- Q3 2026: Vesting contributes ~13% of $500 MRR target
- Q4 2026: Vesting contributes ~11% of $2,000 MRR target
- Q1 2027: Vesting contributes ~11% of $5,000 MRR target

---

## Free vs Paid Feature Split

### Free (drives adoption + CGH score improvement)
- Manual vesting schedule creation
- Vesting computation/preview
- Share structure configuration
- Vesting dashboard view
- Monthly vesting processing (cron)
- SVI evidence auto-creation

### Paid (AI-powered, credit-gated)
- AI equity split recommendation
- AI vesting schedule suggestion
- AI share structure mode advice
- AI ESOP pool sizing
- AI comprehensive vesting review

### Rationale
- **Free setup drives the engagement loop**: Set up vesting → CGH improves → SVI goes up → founder sees value → more likely to use paid AI features
- **AI features are high-margin**: 94-96% margin means even low volume is profitable
- **Credit-based = no commitment barrier**: A$0.50 for a vesting suggestion vs $99/mo subscription

---

## Unit Economics per User

### CAC Allocation
- Vesting features are upsell to existing SVI users (CAC already amortized)
- Incremental acquisition cost: A$0 (organic from SVI → equity workflow)

### LTV Contribution
- Average lifetime AI calls from vesting: 5-8 calls per startup
- Average lifetime revenue from vesting: A$4.50-7.25 per startup
- Combined with SVI + R&D report LTV: contributes 15-20% of total ARPU

### Payback Period
- First AI call (equity split) pays back immediately (A$1.00 revenue, A$0.04 cost)
- No subscription lock-in needed

---

## Pricing Experiments to Run

1. **Entry pricing**: Test ai_equity_split at 0.75 vs 1.00 vs 1.25 credits
2. **Bundle pricing**: "Full equity setup pack" — all 5 AI features for 3.00 credits (vs 4.25 à la carte, 29% discount)
3. **First-time free**: First ai_equity_split free for new accounts (acquisition hook)
4. **Founding 50 bonus**: Include 5 free equity AI calls for Founding 50 members

---

## Financial Reporting

### New Metrics to Track
- Vesting AI revenue (daily/weekly/monthly)
- AI feature adoption rate (% of cap table users who use AI)
- Credits consumed per startup (vesting features only)
- Conversion: free vesting setup → paid AI recommendation

### Dashboard Additions
- Add "Equity AI Revenue" row to CFO P&L dashboard
- Track in Stripe metadata: `feature: ai_equity_split`

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI pricing too high → low adoption | Medium | Medium | A/B test, bundle discounts |
| AI pricing too low → leaves money on table | Low | Low | Can always increase later |
| Free tier too generous → no reason to pay | Low | Medium | Free = manual only, AI = smart |
| Competitor offers free AI equity | Medium | High | Differentiate on accuracy + AU-specific |

---

## Skills Used
- `/cfo` — Revenue modeling, pricing strategy
- `/analytics` — Metric tracking, conversion analysis

## Success Metrics
- [ ] Vesting AI features achieve >94% gross margin
- [ ] Revenue contribution >A$200/mo by Q4 2026
- [ ] AI feature adoption >25% of cap table users
- [ ] Bundle pricing increases average revenue per startup by >20%
- [ ] No negative ROI on any AI feature