# Revenue Forecast Builder — Founder User Guide

**Feature Status:** Live in v3.6.9 (Aug 23, 2026)  
**What It Does:** Model your 3-year revenue growth with Australian tax incentives, scenario planning, and founder payout estimates

---

## Quick Start (5 Minutes)

### 1. Open the Forecast Builder
- Go to **Workspace** → **Financial Forecast**
- Click **"New Forecast"**

### 2. Fill the Wizard (4 Steps)

**Step 1: Basic Information**
- **Forecast Name:** "2026 Growth Plan" (or your scenario name)
- **Current ARR:** Your annual recurring revenue (A$0 if pre-revenue)
- **Monthly Growth Rate:** % MoM (e.g., 8% = typical SaaS)
- **Monthly Churn Rate:** Customer churn % (e.g., 2% = low churn)

*💡 Tip: If pre-revenue, enter 0 for ARR and use your planned growth rate*

**Step 2: Cost Structure**
- **COGS % of Revenue:** Cost of goods sold (20–40% for SaaS)
- **Monthly Operating Expenses:** Fixed costs (salaries, rent, tools)
- **R&D Tax Incentive:** Enable if you're eligible for the AU RDTI (43.5% refund)

*💡 Check [ATO R&D Tax Incentive](https://www.business.gov.au/support-and-grants/research-and-development-tax-incentive) to confirm eligibility*

**Step 3: Growth Scenario**
- **Bear Case:** Conservative (growth slows, cost controls)
- **Base Case:** Plan execution (what you expect)
- **Bull Case:** Upside (growth accelerates, strong PMF)

*Select the scenario most realistic for your business*

**Step 4: Review & Save**
- Preview 36-month projection
- Verify key metrics (Year 1 revenue, breakeven month, runway)
- Click **"Save Forecast"**

### 3. View Results

You'll see your **36-month financial projection** with 3 tabs:

1. **36-Month Projection** — Month-by-month revenue, EBITDA, cumulative cash
2. **Yearly Summary** — Year 1–3 totals and EBITDA
3. **Metrics** — Key assumptions recap

### 4. Export & Share

- Click **"Export CSV"** to download all 36 months for Excel/Sheets
- Download link appears in your **Investor Pack** (Chapter: "Revenue Forecast")
- Share with advisors, investors, board members

---

## Common Scenarios

### Scenario A: Pre-Revenue SaaS Startup

**Inputs:**
- ARR: 0
- Monthly Growth: 10% (typical early SaaS)
- Churn: 1% (low churn, early stage)
- COGS: 25% (software costs low)
- OpEx: $40K/month (lean team)
- Scenario: **Base** (conservative)

**Expected Outcome:**
- Breakeven: Month ~18–24
- Year 1 Revenue: ~$180K
- Year 3 Revenue: ~$2.5M
- Runway: 8–10 months

---

### Scenario B: Series A Funded ($500K+)

**Inputs:**
- ARR: $300K–$600K (your current MRR × 12)
- Monthly Growth: 8–12% (post-launch growth)
- Churn: 2–4% (as observed)
- COGS: 30% (scaling costs)
- OpEx: $80K–$150K/month (team + marketing)
- Scenario: **Bull** (optimistic execution)

**Expected Outcome:**
- Year 1 Revenue: $1.5M–$2.5M
- Year 3 Revenue: $8M–$15M
- Breakeven: Month 12–15
- Runway: Indefinite (positive cash flow)

---

### Scenario C: Revenue-Positive (Bootstrapped)

**Inputs:**
- ARR: $100K–$500K
- Monthly Growth: 5–8% (sustainable, profitable)
- Churn: 2–5% (depends on product fit)
- COGS: 25–35% (mature margins)
- OpEx: $30K–$60K/month (core team only)
- Scenario: **Base** (plan execution)

**Expected Outcome:**
- Year 1 Revenue: $120K–$600K
- Breakeven: Already profitable (Month 1 EBITDA > 0)
- Runway: Indefinite (self-funding)

---

## Key Metrics Explained

### 36-Month Projection Table

| Column | Meaning |
|--------|---------|
| **Month** | 1–36 (3-year timeline) |
| **Revenue** | Monthly recurring revenue (A$) |
| **COGS** | Cost of goods sold (% of revenue) |
| **Gross Margin** | Revenue – COGS (profit after direct costs) |
| **OpEx** | Operating expenses (salaries, marketing, etc.) |
| **EBITDA** | Gross Margin – OpEx (operating profit) |
| **Cumulative Cash** | Total cash burned/generated from Month 1 |

### Summary Cards

- **Year 1 Revenue:** 12-month total (Month 1–12)
- **Breakeven Month:** When EBITDA first turns positive
- **Runway (months):** How long cash lasts before depletion
- **Year 3 Revenue:** 36-month total revenue

---

## Tips & Tricks

### 1. Create Multiple Scenarios
Create 3 forecasts:
- **Conservative:** Bear case (worst case)
- **Plan:** Base case (what you expect)
- **Upside:** Bull case (growth accelerates)

This helps with investor conversations ("We model X downside, Y upside").

### 2. Adjust for Seasonality
- If business is seasonal, use a blended growth rate
- Example: Austrlian retail sees peaks Dec–Jan, dips Feb–Apr
- Use a conservative overall rate if seasonal impact is >20%

### 3. Factor in Series A/B Timing
- Adjust OpEx 6 months before Series A (hiring ramp)
- Model revenue dip if you hire sales team (investment before ROI)
- Plan for dilution from equity rounds (use Exit Strategy feature instead)

### 4. Use RDTI for Tax Benefit
- AU startups: Enable R&D Tax Incentive if you do software dev
- Typical refund: 43.5% of eligible R&D spend
- Example: $100K R&D spend → $43.5K refund over 12 months
- Improves cash flow significantly

### 5. Validate Against Benchmarks
- **SaaS:** 8–20% MoM growth is strong, 40%+ is exceptional
- **Marketplace:** 10–15% MoM is strong (supply/demand liquidity)
- **Agency:** 3–8% MoM is healthy (human-intensive business)
- Compare your growth against competitors

---

## FAQ

### Q: How accurate are these forecasts?
**A:** Forecasts are **illustrative projections** based on your assumptions. They're useful for:
- Planning cash runway
- Identifying breakeven timing
- Stress-testing your plan (bear case)
- Investor conversations

They're **not** financial advice. Actual results will differ (hopefully better!). Consult your accountant/CFO for binding projections.

### Q: Can I edit a forecast after saving?
**A:** Not yet. For now:
1. Create a new forecast with updated assumptions
2. Compare side-by-side by exporting both to CSV
3. Share the "most realistic" forecast with investors

*Future: In-line editing coming in v3.7*

### Q: What if my business is pre-revenue?
**A:** Enter ARR = 0 and use your **planned** monthly growth rate. Example:
- "We'll launch in Month 3 with $10K MRR"
- Start with Month 1–2 revenue = $0
- Input monthly growth = 10%
- Month 3 revenue = $10K, grows from there

### Q: Does this account for fundraising dilution?
**A:** Not directly. Use the **Exit Strategy** feature instead (coming Week 2):
- Model Series A/B funding rounds
- See founder stake dilution round-by-round
- Estimate exit payouts

For now, this forecast shows operational revenue only.

### Q: Can I share forecasts with my board/advisors?
**A:** Yes!
1. Export the forecast as CSV
2. Send via email or Slack
3. Or download the Investor Pack (includes forecast chapter)

CSV shows all 36 months + key assumptions. Investors can model alternative scenarios.

### Q: Why does cumulative cash go negative?
**A:** Cumulative cash shows **total burn** if you started with $0 cash.

Example:
- Month 1 EBITDA: –$20K (burning $20K/month)
- Month 2 EBITDA: –$21K (growing revenue, still burning)
- Cumulative: –$41K (you've burned $41K total)

**Actual cash status depends on:**
- How much cash you have today
- How much you raised
- This model shows the "burn rate requirement"

Add your current cash balance to the cumulative cash to see realistic runway.

### Q: What's the RDTI calculation?
**A:** R&D Tax Incentive = 43.5% × eligible R&D spend

**Eligible activities:**
- Software development
- Algorithm research
- Data analysis for product
- Infrastructure/DevOps for core product

**Not eligible:**
- Sales & marketing
- Finance & admin
- Overhead costs

Typical eligible spend: 20–30% of OpEx for SaaS.

---

## Next Steps

1. **Create your first forecast** (takes 5 min)
2. **Export & share** with your board
3. **Compare scenarios** (bear/base/bull)
4. **Track over time** — Re-run forecast monthly to see actual vs. plan
5. **Connect to Exit Strategy** (Week 2) — Model dilution from funding rounds

---

## Support & Feedback

**Issues or suggestions?**
- Email: support@blockid.au
- Slack: #support channel
- Feature requests: [BlockID feedback form](https://blockid.au/feedback)

**Related Features:**
- 📊 **SVI Dashboard** — Funding readiness score
- 💰 **Exit Strategy** (Week 2) — Dilution + founder payouts
- 📈 **C-Level Reports** (Week 6) — DCF valuation + sensitivity analysis
- 📦 **Investor Pack** — All reports in one PDF

---

**Version:** v3.6.9 (August 23, 2026)  
**Last Updated:** [System timestamp]  
**Disclaimer:** For planning purposes only. Not financial advice. Consult a qualified accountant before making fundraising decisions.
