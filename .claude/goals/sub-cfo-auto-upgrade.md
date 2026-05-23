# Sub-Goal: CFO Auto-Upgrade — Continuous Financial Excellence

Parent: `goals/ai-agent-ecosystem.md`

## Mandate
The CFO agent MUST continuously benchmark BlockID's pricing, unit economics, and financial strategy against market leaders (Carta, Pulley, Cake Equity, AngelList, Qapita) and automatically propose/implement improvements.

## Standing Orders

### 1. Pricing Intelligence (weekly)
- `/cfo` + `/rnd competitor` → Monitor competitor pricing changes
- Compare: Carta ($8K+/year), Pulley ($50-500/mo), Cake Equity (custom), BlockID (A$99/mo)
- Auto-generate pricing optimization proposals when gap detected
- Track willingness-to-pay signals from user behavior data

### 2. Unit Economics Optimization (daily)
- Track AI cost per analysis (target: $0.05 by Q1 2027)
- Monitor: AI provider costs, infrastructure costs, support costs
- Auto-switch AI providers based on cost/quality tradeoffs
- Alert when gross margin drops below threshold (target: 75%)

### 3. Revenue Modeling (weekly)
- `/cfo` → Generate 3-scenario revenue projections (bear/base/bull)
- Track actual vs projected MRR/ARR divergence
- Auto-update financial model when new pricing data arrives
- Feed into CFO section of customer reports

### 4. Credit Economy Optimization (ongoing)
- Analyze credit utilization patterns (which features, when, frequency)
- Identify under-priced features (high usage, low credit cost)
- Identify over-priced features (low adoption, high barrier)
- A/B test credit pricing (e.g., rnd_deep_dive: 1.5 vs 2.0 credits)
- Propose credit pack adjustments based on purchasing patterns

### 5. Customer Report Contribution
When generating customer reports, the CFO skill contributes:
- **Page 4 (Business Model)**: Revenue model assessment, pricing analysis
- **Page 8 (Financial Projections)**: 3-scenario revenue forecast, unit economics
- **Full Report Premium**: Detailed financial section with funding timeline
- **Evidence Analysis**: Financial document analysis (P&L, balance sheet)

## Auto-Upgrade Triggers

| Trigger | Action | Agent Chain |
|---------|--------|-------------|
| Competitor price change detected | Re-run pricing analysis, alert CEO | /cfo + /rnd |
| AI cost per analysis > $0.10 | Optimize prompts, switch model tiers | /cfo + /prompt-engineer |
| Gross margin < 70% | Cost reduction plan, identify waste | /cfo + /coo |
| Credit utilization < 20% | Pricing experiment proposal | /cfo + /cro |
| New feature shipped | Price the feature, update credit costs | /cfo + /cpo |
| Churn spike detected | Root cause analysis, retention offers | /cfo + /cro |

## Implementation Tasks
- [x] Weekly competitor research (rnd-competitor-research task with AI web search) (web search)
- [x] Daily unit economics (cfo-credit-economy task in agent-upgrade cron)
- [x] /api/admin/financial-health endpoint (users, credits, revenue, AI budget) (MRR, gross margin, AI costs)
- [x] /api/admin/financial-health implemented endpoint for automated monitoring
- [x] Feed CFO analysis into R- [ ] Integration: Feed CFO analysis into R&D report Pages 4, 8D report (valuation data + credit pricing in context)
- [x] Weekly admin growth report email to admin@blockid.au (sendWeeklyGrowthReport) breach thresholds

## Skills Used
`/cfo` `/analytics` `/stripe-test` `/rnd` `/prompt-engineer`