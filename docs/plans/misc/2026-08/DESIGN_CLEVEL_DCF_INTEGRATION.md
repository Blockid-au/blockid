# Enhanced C-Level Prompts with DCF Integration Feature

**Project:** BlockID.au C-Level Advisory Enhancement (P2 Priority)  
**Timeline:** 2–3 weeks  
**Status:** Design Phase  
**Date:** 2026-08-16  
**Owner:** CTO + CFO Advisory Agents

---

## Executive Summary

This design implements a 5-role C-level agent enhancement (CFO, CEO, CMO, CDO, CTO) expanding current 500–1500 word prompts to 3000–5000 words with Discounted Cash Flow (DCF) integration, sensitivity analysis, and 12-week trend tracking. The feature generates 5 roles × 3 scenarios (bear/base/bull) nightly via non-blocking cron, populates dashboard report cards, and feeds executive summaries into investor packs.

**Success Criteria:**
- Reports: 5000–7000 words (vs current ~2000)
- DCF accuracy: valuation midpoints r > 0.7 with actual raises
- Actionability: 70% of CFO action items adopted by founders
- Trend tracking: 90% of 12-week comparisons show meaningful deltas
- Advisory quality: Report satisfaction score 4.2+ (vs current 3.8)

---

## 1. CFO Prompt Enhancement (1800 words)

### Current State
The CFO persona focuses on burn rate, runway, and unit economics (500 words). Output: ship summary, 3–8 findings, top-3 actions.

### Enhanced Scope

#### A. Valuation & Financial Modeling (600 words)

**Prompt Section:**

```markdown
## DCF Valuation Analysis (5-Year Horizon)

You have access to the startup's financial data (MRR, burn rate, growth rate, churn).
Your role is to build a 5-year DCF valuation using these assumptions:

### DCF Parameters (AU Early-Stage Benchmark)
- **WACC (Weighted Average Cost of Capital):** 35% (reflects AU risk premium for pre-revenue/early-stage)
- **Terminal growth rate:** 3% (long-term GDP growth)
- **Tax rate:** 25% (AU corporate rate)
- **Time horizon:** 5 years

### Revenue Projection (Years 1–5)
For each year, project ARR as follows:
- **Pre-revenue startups:** Use market-based sizing (TAM × TAM-penetration %)
- **Early revenue:** Compound MRR growth at the stated monthly rate (e.g., 8% MoM → 152% YoY)
- **Post-Series A:** Apply stage-appropriate growth deceleration (e.g., -5% growth annually)

### EBIT Margin Assumptions (by Year)
| Year | Gross Margin | OpEx Burn | EBIT Margin |
|------|--------------|-----------|------------|
| 1 | 60–70% | Runway-bound | -30% to -60% |
| 2 | 65–75% | Scaled hiring | -10% to -20% |
| 3 | 70–80% | Marketing-heavy | 0% to 10% |
| 4 | 75–85% | Approaching breakeven | 10% to 25% |
| 5 | 78–90% | Profitability | 20% to 35% |

Adjust margins by sector (SaaS typical: Year 1 GM 70%, Year 5 GM 85%).

### Free Cash Flow Calculation
FCF = EBIT × (1 – tax rate) + D&A – CapEx – Δ Working Capital
- **Typical pre-revenue startup:** FCF ≈ EBIT × 0.95 (minimal D&A, CapEx)
- **D&A assumption:** 5% of revenue annually (assume A$50k SaaS infrastructure)
- **CapEx:** 0% of revenue (cloud-native, no physical assets)
- **Working capital:** Minimal for SaaS (<2% of revenue)

### Terminal Value Calculation
TV = FCF₅ × (1 + terminal_growth) / (WACC – terminal_growth)
PV(TV) = TV / (1 + WACC)⁵

### DCF Valuation Range
Report three scenarios (see Sensitivity Analysis below).
DCF output: **low / base / high AUD valuations** with percentage confidence (Low/Medium/High).

### Inputs & Data Sourcing
Pull these from the startup's evidence blob:
- **MRR (A$):** From revenue_events table or Stripe reconciliation
- **Monthly growth rate (%):** MoM compounding over last 6 months (or plan if pre-revenue)
- **Churn rate (%):** CAC payback, NRR if SaaS
- **Burn rate (A$/mo):** Runway calculation = cash on hand / monthly burn
- **Stage indicator:** Seed/Series A/Series B affects WACC (Stage 0–2: 40%, Stage 3–4: 35%, Stage 5+: 25%)
```

#### B. Sensitivity Analysis (600 words)

```markdown
## 3-Scenario Sensitivity Analysis

### Scenario Assumptions

#### Bear Case (Conservative)
- **ARR growth:** –25% vs plan (e.g., 10% MoM → 6%)
- **Churn rate:** +50% above plan (e.g., 5% → 7.5%)
- **CAC:** +20% above budget
- **Gross margin:** –5pp vs plan
- **OpEx:** +10% hiring freeze; cut marketing 40%
- **Outcome:** Slower path to profitability; may need bridge funding at lower valuation

**Bear Valuation:** DCF low-end (typically 40–60% of base case)

#### Base Case (Plan)
- **ARR growth, churn, CAC, margins:** As supplied in the startup's financial model
- **OpEx:** Current trajectory
- **Outcome:** Execution on plan; realistic Series A readiness at planned timeline

**Base Valuation:** DCF midpoint

#### Bull Case (Upside)
- **ARR growth:** +25% vs plan (e.g., 10% MoM → 14%)
- **Churn rate:** –25% below plan (e.g., 5% → 3.75%)
- **CAC:** –20% below budget (viral loop, strong product-market fit)
- **Gross margin:** +3pp above plan
- **OpEx:** Hire ahead of curve; invest in marketing 20% above plan
- **Outcome:** Rapid scale; Series A++, potential Series B bridge

**Bull Valuation:** DCF high-end (typically 140–180% of base case)

### Sensitivity Table (5 Drivers × 3 Scenarios)

Generate a table showing impact of each driver on valuation:

| Driver | Bear | Base | Bull | Impact (High/Medium/Low) |
|--------|------|------|------|--------------------------|
| **ARR Growth Rate** | –15% ARR impact | ±0% | +35% ARR impact | **HIGH** |
| **Churn Rate** | +7.5% → +20% valuation hit | Plan rate | –3.75% → +15% valuation lift | **HIGH** |
| **COGS % Revenue** | +3pp → –5% GM impact | Plan % | –2pp → +5% GM impact | **MEDIUM** |
| **OpEx Burn** | +10% cash drain | Plan | –10% extend runway | **MEDIUM** |
| **Tax Rate** | 26% (AMI relief ineligible) | 25% | 21% (R&D offset maximized) | **MEDIUM** |

**Key Insight:** The 3 highest-impact levers are ARR growth, churn rate, and gross margin.
Focus founder's next 90-day sprint on these. A 10% improvement in any one typically lifts valuation 15–25%.

### Scenario Valuation Summary

| Scenario | Valuation (AUD) | Key Assumption | Runway (months) |
|----------|-----------------|-----------------|-----------------|
| **Bear** | A$Xm – A$Ym | Growth slows 25%; churn rises | Z–Z months |
| **Base** | A$Xm – A$Ym | Plan execution | Z months |
| **Bull** | A$Xm – A$Ym | Growth +25%; churn –25% | Z–Z+ months |

## AU Tax Incentive Modeling

### R&D Tax Incentive (43.5% Refundable Offset)

**Eligibility:** Startups <A$20M revenue claiming R&D core activities (software dev, data analysis, algorithm development).

**Impact on Valuation:**
- Effective tax rate: 25% → 14% (43.5% offset reduces tax liability)
- For a startup with A$2M revenue, A$400k EBIT:
  - Standard tax: A$100k
  - With R&D offset: A$57k (save A$43k annual)
- **DCF adjustment:** Add back A$43k/year into FCF for years 1–3 (ramp-down post-Series A when claimable staff expand)

**Action Item:** Ensure startup has:
- IP Australia data audit trail (Git commits, design docs, test logs)
- Qualified scientist/engineer on staff (can contract externally)
- Annual R&D claim filed with ATO (due with tax return)

### ESIC (Early-Stage Investment Company) Tax Concessions

**Eligibility:** Investors ≤12 months post-issue; startup <5 years old; <A$50M market cap.

**Value to founders:** Investor tax incentive (50% capital gains exemption) → justifies 10–15% lower founder dilution in seed/Series A.

**Flag in report if ESIC eligibility is at risk** (e.g., Series A larger than A$5M, startup >5 years, previous capital raised).

### Loss Carryforward & Franking

- **Loss carryforward:** If startup is pre-profitability, losses can offset future tax (no expiry in AU).
- **Value:** Adds A$500k–A$1M to post-exit tax position if startup reaches A$5M+ revenue.
- **Franking:** If startup eventually pays dividends, AU investors get franking credits (50% extra benefit vs non-AU jurisdictions).

---

### C. Series A Readiness Checklist (300 words)

```markdown
## Series A Readiness Gate

### Financial Milestones
- [ ] **Runway:** >15 months remaining (VCs want buffer for Series B)
- [ ] **Growth:** Consistent month-over-month growth >5% (annualized >60%+)
- [ ] **CAC Payback:** <12 months (SaaS benchmark)
- [ ] **LTV:CAC Ratio:** >3x (world-class >5x)
- [ ] **Gross Margin:** >60% (SaaS); >40% (Marketplace)
- [ ] **Unit Economics:** Clear path to 40%+ net margin by Year 3

### Capital Planning
- [ ] **Series A ticket:** A$500k–A$3M (AU SaaS median)
- [ ] **Use of funds:** 12-month runway map (product 40%, sales 30%, ops 20%, admin 10%)
- [ ] **Cash buffer:** 6-month unopened account (emergency reserve)

### Investor Readiness
- [ ] **VCs identified:** 15–20 Series A/B managers with AU portfolio presence
- [ ] **Deck drafted:** 12-slide investor pitch (see investor-pack integration)
- [ ] **Data room:** Financial statements (3 years), cap table, SAFEs/share registers, customer list (anonymized), contracts
- [ ] **NDAs signed:** With potential leads

### Operational
- [ ] **Finance:** Bookkeeper on payroll or contract; monthly financial close (P&L, cash flow by line item)
- [ ] **Admin:** ABN, ACN, ASIC up-to-date; insurance active (D&O, cyber, professional indemnity)
- [ ] **Compliance:** ESIC eligibility locked in; no legal proceedings; tax filings current

### Scoring
- **Green (Go):** 12+ items checked — ready to close Series A within 3 months
- **Amber (Caution):** 8–11 items — 1–2 critical gaps (typically runway + unit economics)
- **Red (No-Go):** <8 items — defer Series A 6 months; focus on growth and efficiency
```

#### D. Financial Planning Roadmap (300 words)

```markdown
## 90-Day Financial Action Plan

Based on the DCF and sensitivity analysis, recommend a prioritized action matrix:

### Q1 Actions (Impact on Valuation & Runway)
1. **[HIGH IMPACT]** Improve ARR growth from X% to Y% MoM
   - Tactic: Channel optimization (see CMO report) + pricing test (+10% price-point test)
   - Owner: CEO + CRO
   - Timeline: 30 days experiment window
   - Expected impact: +15–20% DCF valuation lift

2. **[HIGH IMPACT]** Reduce churn from X% to Y%
   - Tactic: Win-back campaign (re-engage churned customers), NPS survey
   - Owner: CEO + CRO + Product
   - Timeline: 45 days
   - Expected impact: +10–15% valuation lift

3. **[MEDIUM IMPACT]** Secure R&D Tax Incentive claim (A$Xk annual)
   - Tactic: Hire qualified scientist/engineer (if not present); document IP trail
   - Owner: CFO + CTO
   - Timeline: 60 days
   - Expected impact: +A$43k annual cash (flows into FCF)

4. **[MEDIUM IMPACT]** Reduce CAC from A$X to A$Y
   - Tactic: Organic/referral push (see CMO); community building
   - Owner: CRO + CMO
   - Timeline: 60 days
   - Expected impact: +5–8% valuation, improve payback period

### Q2–Q3 Priorities
- **Product:** Ship 1–2 high-leverage features (see CTO + CPO roadmap)
- **Go-to-market:** Expand to 2nd customer segment (TAM expansion, see CMO)
- **Fundraising:** Open Series A conversations with 15+ VCs (cap table ready by month 6)
```

---

## 2. CEO Prompt Enhancement (2000 words)

### Current State
CEO persona synthesizes stage progress and investor readiness (600 words). Output: vision alignment, top 3 risks, critical path.

### Enhanced Scope

#### A. Competitive Moat Assessment (700 words)

```markdown
## Competitive Moat & Strategic Advantage

### Network Effects Assessment

**Definition:** Value of product increases as more users join (e.g., Slack, LinkedIn, marketplaces).

**Scoring:** 1–5 scale, with AU SaaS benchmark (typical: 2–3)

- **1 (Weak):** No user-to-user benefit (most early SaaS)
- **3 (Moderate):** Some multi-sided benefit (e.g., job board with both job seekers + employers)
- **5 (Strong):** Viral spiral; users drive 80%+ of growth (Canva's referral loop, Atlassian's Jira integrations)

**For this startup:** [Score X] — [Evidence: description of actual network dynamics or absence thereof]

**Impact on exit valuation:** +20% if strong, –15% if weak (network effects command 1.5–2x multiple uplift at exit).

### Switching Costs (Data Lock-In & Switching Pain)

**Definition:** Cost for customer to leave and adopt a competitor (time, data migration, retraining, switching fee).

**Scoring:** 1–5
- **1 (Low):** Stateless SaaS, easy CSV export (most early startups)
- **3 (Moderate):** Some data export effort, but feasible (<1 day migration)
- **5 (High):** Deep system integration, customer data interdepency, custom workflows (Shopify, Xero, HubSpot)

**For this startup:** [Score X] — [Evidence]

**Impact:** +10–15% valuation if high switching costs (reduces churn, increases LTV).

### Data Moat

**Definition:** Proprietary dataset that becomes more valuable over time (e.g., credit risk models, user behavior patterns, market data).

**Scoring:** 1–5
- **1:** No meaningful proprietary data
- **3:** Aggregated customer data + trends (useful but replicable)
- **5:** Defensible dataset (e.g., 10-year historical + ML models that competitors can't replicate in <3 years)

**For this startup:** [Score X] — [Data sources, collection method, competitive defensibility, IP protection]

**Impact:** +15–25% valuation if defensible (attracts acquirers, becomes moat for cross-sells).

### Brand & Regulatory Barriers

**Definition:** Brand recognition, regulatory approval, or legal monopoly that prevents competition.

**Scoring:** 1–5
- **1:** Generic brand, no regulatory moat
- **3:** Emerging brand recognition in niche; some regulatory preference (e.g., SOC 2 certified fintech)
- **5:** Category-defining brand (Atlassian, Canva, Stripe); regulatory approval that competitors lack

**For this startup:** [Score X] — [Brand positioning, regulatory moats, IP (patents, trademarks)]

**Impact:** +10–20% valuation if brand leadership clear.

### Competitive Positioning Map

Generate a 2D plot:
- X-axis: Feature completeness (Basic → Full-featured)
- Y-axis: Price point (Low-cost → Premium)

Plot 3–5 competitors + startup. Highlight white space.

Example:
```
Premium ┌─────────────────────────────────────────┐
        │  Competitor A (Premium, feature-rich)   │
        │                                         │
        │  Startup (Niche, disruptive pricing)    │
        │              Competitor B (Mid-market)  │
        │                                         │
Low-cost└─────────────────────────────────────────┘
         Basic                            Feature-Rich
```

**Narrative:** Startup occupies [white space]. Defensibility: [high/medium/low] because [reason].

### Moat Summary Scorecard

| Moat Type | Score | AU Sector Benchmark | Gap | Action |
|-----------|-------|---------------------|-----|--------|
| Network Effects | X/5 | 2–3 | [delta] | Build [tactic] |
| Switching Costs | X/5 | 2–3 | [delta] | Deepen integration |
| Data Moat | X/5 | 1–2 | [delta] | 12-month collection plan |
| Brand | X/5 | 1–2 | [delta] | Launch product hunt / PR |
| **Overall Moat Strength** | **X/5** | **2–3** | | **Medium confidence in defensibility** |

---

#### B. Investor Readiness Gates (CAPITAL Scorecard) (400 words)

```markdown
## CAPITAL Scorecard: Series A Readiness

A five-point checklist for VCs evaluating this startup:

### C = Customer Traction
- [ ] **Paying customers:** >50 (or >A$10k MRR if SMB-focused)
- [ ] **NRR:** >100% (expansion revenue signals willingness to pay more)
- [ ] **Customer acquisition:** Repeatable and cost-efficient (CAC <12-month payback)
- [ ] **Score:** [1–5]; Gap: [if <3, add action]

### A = Addressable Market
- [ ] **TAM:** >A$500M (AU/NZ scope)
- [ ] **Market timing:** Tailwind (regulatory, tech, macro) supporting growth
- [ ] **SAM penetration:** Clear path to 1–5% SAM (within 5 years)
- [ ] **Score:** [1–5]; Gap: [if <3, TAM re-sizing needed]

### P = Product-Market Fit
- [ ] **Usage metrics:** >30% DAU/MAU (tech SaaS benchmark 40–50%)
- [ ] **NPS:** >50 (delighted users); <40 (re-design risk)
- [ ] **Feature differentiation:** Clear 1–2 killer features competitors lack
- [ ] **Roadmap credibility:** 12-month feature plan with customer input
- [ ] **Score:** [1–5]; Gap: [if <3, UX overhaul or feature gap]

### I = Investor & Founder Fit
- [ ] **Founder:** CEO has relevant domain expertise (founder score >3/5)
- [ ] **Team:** Technical co-founder or CTO hire locked (team score >3/5)
- [ ] **Advisory board:** 2–3 domain experts advising (governance score >2/5)
- [ ] **Prior venture experience:** At least one founder has raised capital or exited
- [ ] **Score:** [1–5]; Gap: [if <3, recruit advisors or co-founder]

### T = Trajectory & Unit Economics
- [ ] **Growth:** MoM ARR growth >5% (annualized >60%)
- [ ] **Unit economics:** LTV:CAC >3x, payback <12 months
- [ ] **Path to profitability:** EBITDA breakeven projected within 36 months (Series B)
- [ ] **Burn efficiency:** Monthly burn <A$50k with >12-month runway
- [ ] **Score:** [1–5]; Gap: [if <3, focus on efficiency for 6 months]

### L = Legal & Compliance
- [ ] **Cap table:** Clean (no weird SAFEs, founder dilution justified)
- [ ] **IP:** Assigned to company; no IP disputes
- [ ] **Compliance:** ESIC eligible; tax returns current; no litigation
- [ ] **Score:** [1–5]; Gap: [if <3, resolve immediately]

### Overall CAPITAL Score: [Avg of 6 scores]

**Interpretation:**
- **4.5–5.0:** Ready for Series A closing; expect A$1–3M round
- **3.5–4.4:** Series A-ready with 1–2 gap fixes (90 days)
- **2.5–3.4:** Pre-Series A: focus on customer/growth traction (6 months)
- **<2.5:** Seed-stage; focus on product-market fit (12 months)

**Investor expectation:** Most Series A candidates score 3.5–4.2 at initial pitch (VCs expect to see 4.5+ before close).
```

#### C. Market-Fit Signals & Go/No-Go Decision Framework (400 words)

```markdown
## Go/No-Go Market-Fit Decision

### Quantitative Signals (Red/Yellow/Green)

| Signal | Green | Yellow | Red | Weight |
|--------|-------|--------|-----|--------|
| **NRR** | >105% | 95–105% | <95% | 25% |
| **Churn (monthly)** | <3% | 3–5% | >5% | 25% |
| **CAC Payback** | <9mo | 9–12mo | >12mo | 20% |
| **Customer Concentration** | <20% from top 3 | 20–30% | >30% | 15% |
| **Feature Adoption (top 2)** | >60% of users | 40–60% | <40% | 15% |

**Calculate:** Weighted average of signals. Score >70 = Green; 50–70 = Yellow; <50 = Red.

### Qualitative Signals (Founder Confidence Check)

- [ ] **Product enthusiasm:** Customers ask for feature (not pitched)
- [ ] **Viral coefficient:** Word-of-mouth driving >20% of new user signups
- [ ] **Usage stickiness:** 80%+ of users logging in ≥2x/week (retention proxy)
- [ ] **Founder conviction:** Willing to bet personal capital or reduce salary to extend runway
- [ ] **Press & social:** Organic mentions in niche press / Twitter (not paid ads)

**Score:** 4+ checks = Strong fit; 2–3 = Building fit; <2 = Needs validation

### Go/No-Go Framework

```
IF (Quantitative Score >= 70 AND Qualitative Score >= 4):
  → GO: Product-market fit confirmed
        Next: Scale customer acquisition
        Timeline: Raise Series A in 3–6 months

ELSE IF (Quantitative 50–70 AND Qualitative 2–3):
  → CAUTIOUS: Market-fit signals present, but not yet proven
        Next: Run 6-week validation sprint (price test, feature adoption, churn deep-dive)
        Timeline: Revisit go/no-go in 60 days

ELSE:
  → NO-GO: Insufficient evidence of product-market fit
        Next: Pivot or iterate (new customer segment, feature rethink, GTM change)
        Timeline: Re-validate in 120 days; consider raising bridge/extension if runway permits

END
```

### Recommended Next Step
Based on framework outcome:
- **GO:** CEO + CRO to schedule 20 Series A introductions (see investor plan in investor-pack integration)
- **CAUTIOUS:** Focus 90 days on: [1] Retention (fix churn), [2] Feature adoption (UX refresh), [3] Viral (referral program)
- **NO-GO:** CEO + team to decide: pivot to new segment, or wind down gracefully

---

## 3. CMO Prompt Enhancement (1500 words)

### Current State
CMO focuses on growth channels and competitive positioning (500 words). Output: TAM/SAM/SOM, channel assessment, GTM risks.

### Enhanced Scope

#### A. CAC Benchmarking vs AU Cohort (400 words)

```markdown
## CAC Analysis vs AU SaaS P25–P75 Benchmarks

### CAC by Acquisition Channel

For each active customer acquisition channel, estimate CAC and volume potential:

#### Content/SEO (Organic)
- **Typical AU SaaS CAC:** A$80–200 (long-tail)
- **Payback period:** 6–12 months (requires initial 3–6mo content investment)
- **Startup's CAC:** A$X (from revenue data: [acquisition cost / acquired customers over period])
- **Gap:** [Better/Worse than benchmark]; Recommendation: [scale/reduce/pivot]
- **Volume ceiling:** [estimate % of TAM reachable via SEO in 12 months]

#### Paid Search (Google, LinkedIn ads)
- **Typical AU SaaS CAC:** A$250–600 (depends on keyword competition)
- **Payback period:** 3–6 months (near-term ROI critical)
- **Startup's CAC:** A$X
- **Gap & recommendation:** [same structure]

#### Direct Sales / Partnerships
- **Typical AU SaaS CAC:** A$300–800 (sales +demo time)
- **Payback period:** 9–18 months (requires contract wins)
- **Startup's CAC:** A$X (if applicable)
- **Recommendation:** [scale only if LTV:CAC >5x]

#### Referral / Viral
- **Typical AU SaaS CAC:** A$0–50 (net negative if strong incentive)
- **Payback period:** Immediate if organic; 3–6 months if incentivized
- **Startup's current:** [A$X or "not yet attempted"]
- **Recommendation:** [implement referral loop; A$ incentive to test]

### Comparative CAC Scorecard

| Channel | Startup CAC | AU Median | AU P25 | AU P75 | Competitive Position |
|---------|------------|-----------|--------|--------|----------------------|
| Content | A$X | A$140 | A$80 | A$200 | [Below/At/Above] |
| Paid | A$X | A$400 | A$250 | A$600 | [Below/At/Above] |
| Sales | A$X | A$550 | A$300 | A$800 | [Below/At/Above] |
| Referral | A$X | A$25 | A$0 | A$50 | [Below/At/Above] |

**Insight:** Startup's best channel vs AU competitors = [name channel]. Focus 70% of marketing budget here.
Poor channels (Above P75): [name channels]. Reduce spend by 50% or eliminate.

---

#### B. LTV:CAC Sustainability Check (400 words)

```markdown
## LTV:CAC Sustainability Analysis

### LTV Calculation (AU Early-Stage Benchmark)

**Formula:** LTV = (ARPU × Gross Margin) / (Monthly Churn Rate)

Example:
- ARPU: A$500/month (annual contract)
- Gross margin: 70%
- Monthly churn: 3%

LTV = (500 × 12 × 0.70) / 0.03 = A$1.4M (5-year value)

**For this startup:**
- ARPU: A$X
- GM: X%
- Churn: X%
- **LTV = A$X** (5-year gross value)

**Note:** Use 15% AU discount rate for LTV calculation (reflects opportunity cost of capital):
LTV (discounted) = LTV × (1 – 0.15)^5 / (1 + 0.15) ≈ 0.62 × nominal LTV

**Discounted LTV = A$X**

### LTV:CAC Ratio Assessment

| Metric | Target | Startup | Gap | Status |
|--------|--------|---------|-----|--------|
| **CAC** | <A$Y | A$X | [delta] | [Red/Amber/Green] |
| **LTV** | >A$Z | A$X | [delta] | [Red/Amber/Green] |
| **LTV:CAC** | >3x | X:1 | [delta] | [Red/Amber/Green] |
| **Payback Period** | <12mo | Xmo | [delta] | [Red/Amber/Green] |

**Interpretation:**
- **LTV:CAC >5x:** Highly sustainable; scale aggressively
- **LTV:CAC 3–5x:** Sustainable; OK to scale gradually
- **LTV:CAC 1–3x:** Tight; focus on churn + ARPU before scaling
- **LTV:CAC <1x:** Unsustainable; stop customer acquisition, fix unit economics

### Churn Sensitivity

**Question:** At what churn rate does LTV:CAC drop below 3x?

If LTV:CAC = 3 is target and CAC = A$X:
- Required LTV = 3 × A$X = A$X
- Solving for churn: Churn rate = (ARPU × GM × 12) / LTV
- **Maximum churn = X% monthly**

**Insight:** Every 1% increase in churn above plan reduces LTV by ~20%. Prioritize retention.

### Gross Margin Sensitivity

**Question:** Do we need to increase pricing or reduce COGS to achieve LTV:CAC >3x?

Option 1: Raise pricing by X% (test +10%, +20%)
Option 2: Reduce COGS by Y% (e.g., renegotiate vendor contracts, optimize product)
Option 3: Improve retention (reduce churn by Z%)

**Recommendation:** [Rank 1–3 by effort + impact]
```

---

#### C. Market Sizing Accuracy & Incumbent Capture (400 words)

```markdown
## TAM/SAM/SOM Refinement vs Incumbent Analysis

### TAM Validation Against AU Market Data

**Current claim:** TAM = A$Xm

**Validation sources:**
- **IBIS World reports:** Australia SaaS market sub-sectors
- **ABS (Australian Bureau of Statistics):** Industry revenue data
- **Crunchbase:** Funding in category (proxy for market size)
- **LinkedIn:** Job postings in category (proxy for company count)

**Refined TAM:** A$X–Xm (range based on conservative–aggressive assumptions)

**Gap:** [If claim higher than validated, note risk; if lower, note opportunity]

### SAM Calculation (Specific Addressable Market)

**Formula:** SAM = TAM × [startup's target customer segment % of market]

Example:
- TAM: A$4B (Australian SaaS market)
- Startup focuses on: Mid-market B2B SaaS (not enterprise, not SMB)
- Mid-market % of TAM: ~30%
- **SAM = A$1.2B**

**For this startup:**
- TAM: A$X
- Target segment: [describe]
- Segment % of TAM: X%
- **SAM = A$X**

### SOM Calculation (Serviceable Obtainable Market)

**Formula:** SOM (Year 1) = SAM × [startup's realistic market share % given competition]

Realistic market share (early stage): 0.1–0.5% of SAM
- Low competition / white space: 0.3–0.5%
- Medium competition: 0.1–0.3%
- High competition: 0.05–0.1%

**For this startup:**
- SAM: A$X
- Competitive intensity: [Low/Medium/High]
- Realistic share: X%
- **SOM (Year 1) = A$X–Xm**
- **SOM (Year 5) = A$X–Xm** (assuming 2–3x annual growth in share)

### Incumbent Capture Assessment

**Q1:** Are incumbents defending this market (Atlassian, HubSpot, Salesforce, etc.)?
- **Yes (High threat):** Expect aggressive price competition, bundling, M&A acquisition
  - Defense: Niche differentiation, superior UX, 10x faster/cheaper
- **Weak (Low threat):** White space; first-mover advantage
  - Strategy: Scale fast; establish defensible moat before incumbent notices

**Q2:** Can incumbents easily copy the feature/solution?
- **Yes (2–6 months):** Startup must offer >2 defensible moats (network effect, data, brand)
- **No (6–18 months):** First-mover advantage; scale customer base before incumbent launches

**Q3:** Will incumbents acquire this startup instead of competing?
- **Likely:** Acquisition most probable exit (3–5 year timeline; valuation 2–4x series A)
- **Unlikely:** IPO or strategic partnership more likely (5–7 year timeline; higher exit multiple)

**Recommendation:** [Acquisition path vs independent growth path]
```

---

## 4. CDO Prompt Enhancement (1200 words)

### Current State
CDO assesses data quality, event tracking, and analytics readiness (400 words). Output: data completeness score, evidence gaps, pipeline health.

### Enhanced Scope

#### A. Per-Dimension Evidence Completeness (300 words)

```markdown
## SVI Dimension Evidence Audit (8 Dimensions × 5 Completeness Levels)

### Completeness Scoring

| Level | Definition | Example |
|-------|-----------|---------|
| **0% — No evidence** | No data collected; dimension unmeasured | Zero revenue-generating customers; no customer interviews |
| **25% — Minimal evidence** | Anecdotal or partial data; <10 data points | 2–3 customer conversations; basic cohort retention data |
| **50% — Moderate evidence** | Sufficient for analysis; documented but incomplete | 50+ customers; 3–6 months cohort data; basic product analytics |
| **75% — Strong evidence** | Comprehensive dataset; multivariate analysis possible | 200+ customers; 12+ months trends; detailed funnel analytics |
| **100% — Definitive evidence** | Audited, third-party validated, statistically robust | 500+ customers; 24+ months data; cohort retention >3 years |

### Per-Dimension Audit

#### 1. FTV (Founder, Team, Vision)
- **Evidence sources:** LinkedIn profiles, founder interviews, cap table, team org chart, vision deck
- **Current completeness:** X%
- **Gaps:** [list missing evidence items]
- **Priority to collect:** [High/Medium/Low]
- **Owner:** CHRO + Founder
- **Timeline:** [days]

[Repeat for: MPC, PTD, TRE, CGH, IRI, LCO, SVM]

### Completeness Summary Table

| Dimension | Current % | Target % | Gap | Collection Timeline |
|-----------|-----------|----------|-----|---------------------|
| FTV | X% | 85% | [delta]% | [X days] |
| MPC | X% | 85% | [delta]% | [X days] |
| PTD | X% | 85% | [delta]% | [X days] |
| TRE | X% | 85% | [delta]% | [X days] |
| CGH | X% | 85% | [delta]% | [X days] |
| IRI | X% | 85% | [delta]% | [X days] |
| LCO | X% | 85% | [delta]% | [X days] |
| SVM | X% | 85% | [delta]% | [X days] |
| **Average** | **X%** | **85%** | | **[Timeline]** |

**Insight:** Startup is [on track / behind] on evidence collection. Critical gaps: [list top 3].
```

#### B. Compliance Readiness (300 words)

```markdown
## Compliance & Data Protection Audit

### SOC 2 Type I/II Readiness

**Current status:** [Not started / In progress / Certified]

**Gap assessment:**
- [ ] Security: Vulnerability assessment, pen testing, incident response plan
- [ ] Availability: Uptime monitoring (99.5%+ target), disaster recovery
- [ ] Processing integrity: Data validation, error detection
- [ ] Confidentiality: Encryption (in transit & at rest), access controls
- [ ] Privacy: Data retention policy, customer data deletion

**Timeline to SOC 2 Type I:** [3–6 months typical; hire security consultant A$15k–30k]
**Timeline to SOC 2 Type II:** [12 months post-Type I; requires audit period]

**Cost estimate:** A$40k–80k total (consultant + internal time)

### GDPR & Privacy Compliance (if EU customers)

- [ ] Privacy policy (GDPR Art. 13–14 compliant)
- [ ] Data processing agreement (DPA) in place
- [ ] Data subject rights: Access, deletion, portability
- [ ] DPIA (Data Protection Impact Assessment) if high-risk processing
- [ ] Subprocessor audit (all third-party vendors covered)

**Risk level:** [Low / Medium / High] if non-compliant
**Action:** [Audit contract templates; hire Privacy Officer if >100 EU customers]

### ASIC (Australian Securities & Investments Commission) Compliance

If startup involves fintech/investment products:
- [ ] Market Conduct License (MCA) if offering financial advice
- [ ] AFS Licence if dealing in financial products
- [ ] Deferred Compliance Agreement if startup <A$25M revenue

**Risk:** Operating without required license = A$100k+ fine + forced shutdown
**Action:** Early legal review (A$5k) to confirm scope
```

#### C. Cap Table Cleanliness & Data Room Readiness (300 words)

```markdown
## Cap Table & Legal Documentation Audit

### Cap Table Cleanliness

- [ ] **ESIC eligibility locked:** No capital raised outside 12-month window (would trigger reset)
- [ ] **No weird instruments:** All SAFEs/convertible notes have clear terms + conversion triggers
- [ ] **Founder dilution justified:** Series A dilution 20–30% (acceptable); >35% (red flag)
- [ ] **Employee share scheme:** 10–20% pool allocated for hires (standard)
- [ ] **No pending disputes:** No disagreement with co-founders over equity split

**Cleanest cap table:** Founder shares + one simple seed round (angel/accelerator) + ESOP pool

**Red flags:** Multiple convertible notes with unclear terms, co-founder leaving mid-round, missing documentation

### Data Room Checklist

**Financial:**
- [ ] P&L statements (last 24 months, monthly)
- [ ] Cash flow projections (12 months forward)
- [ ] Balance sheet
- [ ] Revenue breakdown by customer/product line
- [ ] Tax returns (last 2 years)

**Legal:**
- [ ] Cap table + SAFEs/share agreements
- [ ] Founder employment agreements
- [ ] Employee offer letters + share scheme documents
- [ ] Customer contracts (sample LOI, standard terms)
- [ ] IP assignment agreements (code ownership, patents)
- [ ] Insurance policies (D&O, cyber, professional indemnity)

**Product & Traction:**
- [ ] Customer list (anonymized names + revenue)
- [ ] Cohort retention data (12+ months if available)
- [ ] Product roadmap
- [ ] Code repository access (GitHub)
- [ ] Analytics dashboard (product usage, retention)

**Compliance:**
- [ ] ASIC registration (ACN, ABN)
- [ ] SOC 2 / ISO 27001 (if applicable)
- [ ] Privacy policy + DPA
- [ ] Board minutes (if formal board exists)

**Target:** 100% completeness before Series A pitch (VCs expect full data room in 24 hours)
**Current:** X% complete
**Timeline to 100%:** [X days with dedicated owner]
```

---

## 5. CTO Prompt Enhancement (1500 words)

### Current State
CTO evaluates code quality, security posture, and tech debt (500 words). Output: architecture score, security gaps, scalability risks.

### Enhanced Scope

#### A. Tech Debt Assessment & Dependency Security (500 words)

```markdown
## Technical Debt & Dependency Security Audit

### Tech Debt Scoring Framework

Rate each item 1–5 (5 = critical, 1 = minor):

#### Code Quality Debt
- [ ] **Test coverage:** Current <30% (target >70% for Series A)
  - Impact: 2–3 months rework; blocks 40% of deployment velocity
  - Effort to fix: 60 days engineer-hours (M priority)

- [ ] **Monolithic architecture:** Single codebase; hard to scale team
  - Impact: Adding 2nd engineer slows by 20–30% (coordination overhead)
  - Effort to fix: 90 days; consider microservices if >5 microservices planned (L priority)

- [ ] **Documentation gap:** <30% of codebase documented (API specs, architecture diagrams)
  - Impact: Onboarding new engineers takes 4 weeks vs 2 weeks
  - Effort to fix: 20 days for critical paths (M priority)

#### Infrastructure Debt
- [ ] **Manual deployment:** Still running `git pull && npm start` on prod (vs CI/CD)
  - Impact: 4+ hours downtime per deploy; no rollback capability
  - Effort to fix: 10 days CI/CD setup (S priority, HIGH impact)

- [ ] **No monitoring / logging:** Incident detection via customer report (not alerts)
  - Impact: 2–4 hour mean-time-to-resolution (MTTR) vs best-practice <15min
  - Effort to fix: 15 days (DataDog/Sentry setup) (S priority)

- [ ] **Single database:** No read replicas, replication, or backup automation
  - Impact: Any schema change risks data loss or 1–2 hour downtime
  - Effort to fix: 20 days (M priority)

#### Total Tech Debt Score: [Sum of priorities]
- **Green (<5 days effort):** OK for next 6 months
- **Amber (5–30 days):** Plan debt paydown over 2–3 sprints
- **Red (>30 days):** Blocks Series A readiness; allocate 25% of sprint capacity to debt

**Recommendation:** [Prioritized debt paydown plan for Q3–Q4]

### Dependency Security Audit

#### Outdated Dependencies

Run `npm audit` or `cargo audit`:
- **Critical vulnerabilities:** 0 allowed (block deploy)
- **High severity:** <5 acceptable (<5 days to patch)
- **Medium:** <20 acceptable

**Current status:** X critical, Y high, Z medium
**Timeline to patch all:** [X days]

#### Supply Chain Risk

- [ ] **Any unmaintained packages:** (0 commits in 12 months) → Consider fork or replace
- [ ] **Single-person maintained:** Essential but unpopular packages (e.g., express, lodash) → Low risk
- [ ] **Typosquatter risk:** Did we install correct npm package name? (Verify against official source)

**Action:** Quarterly dependency audit (set calendar reminder)

---

#### B. 3-Scenario Infrastructure Cost Projection (500 words)

```markdown
## Infrastructure Cost Scenarios (12-Month Projection)

### Current Infrastructure

**Components:**
- Database: Supabase (Postgres) — A$X/month
- Compute: Vercel (Next.js) — A$X/month
- Storage: S3 (or Supabase Storage) — A$X/month
- Analytics: PostHog / Segment — A$X/month
- **Current total:** A$X/month (A$Xk/year)

### Scaling Assumptions (ARR growth from A$X to A$Xm)

**By customer count:**
- **Scenario 1 (Bear):** 50 → 150 customers (3x growth)
- **Scenario 2 (Base):** 50 → 250 customers (5x growth)
- **Scenario 3 (Bull):** 50 → 500 customers (10x growth)

**By data volume:**
- **Database size:** Current Xgb → Bear: Xgb, Base: Xgb, Bull: Xgb
- **Request volume:** Current X req/day → Bear: X, Base: X, Bull: X req/day

### Cost Projections

#### Bear Case (3x Growth)
| Component | Current | Month 1 | Month 3 | Month 12 | Annual Cost |
|-----------|---------|---------|---------|----------|------------|
| Database | A$X | A$X | A$X | A$X | A$X |
| Compute | A$X | A$X | A$X | A$X | A$X |
| Storage | A$X | A$X | A$X | A$X | A$X |
| Other | A$X | A$X | A$X | A$X | A$X |
| **Total** | **A$X** | **A$X** | **A$X** | **A$X** | **A$X** |

**Insight:** Infrastructure cost stays <10% of ARR (healthy for SaaS)

#### Base Case (5x Growth)
[Same structure; mid-range costs]

#### Bull Case (10x Growth)
[Same structure; likely hits limits of current vendor; may need migration to AWS/GCP for cost optimization]

#### Scaling Strategies by Scenario

**Bear case:** No infrastructure change needed; current stack sufficient

**Base case:** 
- Month 3: Upgrade database to higher tier (anticipate load)
- Month 6: Consider AWS migration if Vercel/Supabase costs exceed budget
- Month 12: Evaluate CDN (CloudFront) for large file serving

**Bull case:**
- Month 1: Provision dedicated database (vs shared Supabase)
- Month 3: Self-host compute (Kubernetes / ECS) for cost optimization
- Month 6: Multi-region deployment (AU + US) for compliance + latency

**Total capex for scaling:** A$X–Y (S = small 1-time infra project)

---

#### C. IP Defensibility & Patent Strategy (300 words)

```markdown
## IP Defensibility Assessment

### Trade Secrets & Code Protection

- [ ] **Codebase hosted on private repo** (GitHub private, or GitLab self-hosted)
- [ ] **Access control:** Only core team has read access; contractors sign NDAs
- [ ] **Proprietary algorithms:** Document core innovation (even if not patented)
- [ ] **Employee agreements:** All code assignment clause (standard at hire)

**Risk level:** [Low / Medium / High]

### Patent Opportunity

**Patentable aspects:** [List 1–3 novel technical approaches]

**Patent consideration:**
- **Cost:** A$2–5k filing + A$500–1k/year maintenance (AU Patent Office)
- **Timeline:** 18 months to provisional, 3–4 years to full examination
- **Benefit:** Defensible moat if core algorithm; attracts acquirers; can license

**Recommendation:**
- [ ] File provisional patent now (cheap, buys 12-month examination window)
- [ ] Defer full application until series A is likely (cost-benefit)
- [ ] Maintain trade secret discipline (don't publish core IP in blog/talks)

### Competitive Reverse Engineering Risk

**Q:** Can a competitor easily reverse-engineer the core innovation?
- **Yes (2–4 weeks):** Focus on network effects, data moat, brand (not IP)
- **No (3–6 months+):** Patent + trade secret protection justified

**Verdict:** [Assessment based on product complexity]
```

---

## 6. Database Schema: `clevel_reports_v2`

### Table Definition

```sql
CREATE TABLE IF NOT EXISTS clevel_reports_v2 (
  -- Identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  
  -- Report metadata
  role VARCHAR(20) NOT NULL CHECK (role IN ('cfo', 'ceo', 'cmo', 'cdo', 'cto', 'cpo', 'clo', 'chro', 'cro')),
  scenario VARCHAR(10) NOT NULL CHECK (scenario IN ('bear', 'base', 'bull')),
  report_version VARCHAR(20) NOT NULL DEFAULT '2.0.0',
  
  -- Report content
  title TEXT NOT NULL,
  summary TEXT,
  sections JSONB NOT NULL, -- { "section_name": { "title": "...", "body": "...", "subsections": {...} } }
  key_findings TEXT[] NOT NULL, -- Array of finding bullets
  action_items JSONB NOT NULL, -- [{ priority: "high", description: "...", owner: "...", deadline: "..." }]
  
  -- Valuation & financials (CFO-specific)
  dcf_valuation_low BIGINT,
  dcf_valuation_base BIGINT,
  dcf_valuation_high BIGINT,
  sensitivity_drivers JSONB, -- { "arr_growth": { "bear": -25, "base": 0, "bull": +25 }, "churn": {...} }
  
  -- Trend tracking
  12_week_history JSONB, -- [{ week: 1, svi_score: 145, arr: 5000, runway: 18, ... }]
  
  -- Audit & versioning
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  generated_by VARCHAR(50) NOT NULL, -- "nightly-cron-v2" or "manual-override"
  model_used VARCHAR(50), -- "claude-sonnet-4-5", etc.
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd_estimate NUMERIC(8,4),
  
  -- Compliance & privacy
  is_confidential BOOLEAN DEFAULT TRUE,
  has_real_startup_names BOOLEAN DEFAULT FALSE CHECK (
    NOT (role IN ('cfo', 'cmo', 'cdo') AND has_real_startup_names = TRUE)
  ), -- Only CEO/CTO can have named comparables
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(project_id, role, scenario, DATE(generated_at))
);

CREATE INDEX idx_clevel_reports_v2_project_role_scenario ON clevel_reports_v2(project_id, role, scenario);
CREATE INDEX idx_clevel_reports_v2_generated_at ON clevel_reports_v2(generated_at DESC);
CREATE INDEX idx_clevel_reports_v2_startup_id ON clevel_reports_v2(startup_id);
```

### Columns Explained

| Column | Type | Purpose |
|--------|------|---------|
| `role` | varchar | Which C-level persona (cfo, ceo, etc.) |
| `scenario` | varchar | Bear/base/bull case |
| `sections` | jsonb | Structured report (allows flexible sub-sections) |
| `dcf_valuation_*` | bigint | Valuation range in AUD cents (for precision) |
| `sensitivity_drivers` | jsonb | 5-driver × 3-scenario sensitivity table |
| `12_week_history` | jsonb | Weekly snapshots for trend widget |
| `is_confidential` | boolean | Flag for Stripe admin views (never share publicly) |
| `has_real_startup_names` | boolean | Compliance check (enforce anonymization) |

---

## 7. API Routes

### POST `/api/cron/clevel-review-v2/generate`

**Trigger:** Nightly cron (2 AM Sydney time)

**Request body:**
```json
{
  "startup_ids": ["uuid-1", "uuid-2"],
  "roles": ["cfo", "ceo", "cmo"],
  "scenarios": ["bear", "base", "bull"],
  "force_regenerate": false
}
```

**Response:**
```json
{
  "success": true,
  "generated": {
    "cfo": { "bear": "uuid-report-1", "base": "uuid-report-2", "bull": "uuid-report-3" },
    "ceo": { "bear": "...", "base": "...", "bull": "..." },
    "cmo": { "bear": "...", "base": "...", "bull": "..." }
  },
  "total_cost_usd": 45.23,
  "duration_ms": 120000,
  "errors": []
}
```

**Logic:**
1. For each (startup, role, scenario):
   - Fetch latest financial/product data
   - Load role-specific prompt + scenario modifiers
   - Call Claude API (claude-sonnet-4-5, max_tokens=8000)
   - Parse response into structured sections
   - Calculate DCF + sensitivity drivers
   - Store in `clevel_reports_v2`
   - Record cost + tokens in history

2. After all reports generated:
   - Compute 12-week trend (compare to prior week's reports)
   - Update startup's `svi_index.confidence_multiplier` based on DCF credibility

3. Non-blocking: Telegram digest sent asynchronously

---

### GET `/api/cron/clevel-review-v2/historical/[role]/[projectId]`

**Purpose:** Fetch historical reports for trend dashboard

**Query params:**
- `weeks`: Number of weeks of history (default 12)
- `scenario`: "base" (default), or "bear"/"bull" for sensitivity
- `format`: "json" (default) or "markdown"

**Response:**
```json
{
  "role": "cfo",
  "project_id": "uuid",
  "scenario": "base",
  "weeks": 12,
  "data": [
    {
      "week": 1,
      "date": "2026-07-19",
      "report_id": "uuid-report-1",
      "svi_score": 148,
      "arr": 15000,
      "runway_months": 24,
      "dcf_valuation_base": 2500000,
      "cac_payback_months": 10,
      "key_action": "Improve churn by 2pp to lift valuation 18%"
    },
    { "week": 2, ... },
    ...
  ],
  "trend": {
    "svi_score_delta": +5,
    "arr_growth_pct": 12.5,
    "runway_trend": "stable",
    "valuation_trend": "upward"
  }
}
```

---

## 8. Component Wireframes

### CFO Report Card (Dashboard)

```
┌─────────────────────────────────────────────────────────┐
│ 💰 CFO Report Card — SaaS Startup XYZ                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 📊 Valuation (12-month DCF)                            │
│ ┌─────────────────────────────────────────────────────┐│
│ │ Bear:    A$1.2M  ·  Base: A$2.5M  ·  Bull: A$4.1M  ││
│ │ Confidence: Medium (revenue 6mo history)           ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ 📈 Unit Economics                                      │
│ ┌────────────────────────────────────────────────────┐ │
│ │ LTV:CAC Ratio:  3.2x (Target >3x) ✓                │ │
│ │ CAC Payback:    10 months (Target <12mo) ✓        │ │
│ │ Gross Margin:   72% (Target >70%) ✓               │ │
│ │ Churn (MoM):    3.1% (Target <3%) ⚠              │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ 💵 Runway & Cash                                       │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Current Runway:  18 months (Target >15mo) ✓       │ │
│ │ Monthly Burn:    A$8.5k (Trending ↓)             │ │
│ │ Next Milestone:  Series A in 6 months            │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ 🎯 Top 3 Actions (90-day sprint)                      │
│  1. Reduce churn 3.1% → 2.5% [Priority: HIGH]       │
│  2. Secure R&D Tax Incentive claim [Priority: MED]   │
│  3. Expand to customer segment #2 [Priority: MED]    │
│                                                         │
│ [View Full Report] [Download PDF]                     │
└─────────────────────────────────────────────────────────┘
```

### 12-Week Trend Panel

```
┌────────────────────────────────────────────┐
│ 📊 12-Week Trend: CFO Metrics              │
├────────────────────────────────────────────┤
│                                            │
│ SVI Score           (↑ +8 pts, 12 weeks)  │
│ ████████░░  148                           │
│                                            │
│ ARR (A$k)           (↑ +32%, 12 weeks)   │
│ ████████░░  15.2k                        │
│                                            │
│ Runway (months)     (→ stable, 12 weeks)  │
│ ████████░░  18mo                         │
│                                            │
│ Valuation (A$M)     (↑ +18%, 12 weeks)   │
│ ████████░░  2.5M                         │
│                                            │
│ [Export CSV]                              │
└────────────────────────────────────────────┘
```

### Sensitivity Table (Interactive)

```
┌────────────────────────────────────────────────────────┐
│ 🔍 Sensitivity Analysis — 5 Drivers × 3 Scenarios    │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Scenario:  [Bear] [Base] [Bull]  [Edit Assumptions] │
│                                                        │
│ ┌────────────────────────────────────────────────────┐│
│ │ Driver       │ Bear      │ Base      │ Bull       ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ ARR Growth   │ 6% MoM    │ 10% MoM   │ 14% MoM   ││
│ │ Effect:      │ ↓ 20%     │ ——        │ ↑ 35%    ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ Churn Rate   │ 7.5%      │ 5%        │ 3.75%    ││
│ │ Effect:      │ ↓ 18%     │ ——        │ ↑ 22%    ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ Gross Margin │ 69%       │ 72%       │ 75%      ││
│ │ Effect:      │ ↓ 8%      │ ——        │ ↑ 12%    ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ OpEx Burn    │ +10%      │ Plan      │ –10%     ││
│ │ Effect:      │ ↓ 6%      │ ——        │ ↑ 8%     ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ Tax Rate     │ 26%       │ 25%       │ 21%      ││
│ │ Effect:      │ ↓ 2%      │ ——        │ ↑ 4%     ││
│ ├──────────────┼───────────┼───────────┼────────────┤│
│ │ **Valuation**│ **A$1.2M**│ **A$2.5M**│ **A$4.1M**││
│ └────────────────────────────────────────────────────┘│
│                                                        │
│  💡 Insight: Churn is the most-impactful lever.      │
│  Reduce churn 5%→3% to unlock A$500k valuation lift. │
│                                                        │
│  [Show 2-way sensitivity] [Download Excel]           │
└────────────────────────────────────────────────────────┘
```

---

## 9. Test Scenarios (40+ Cases)

### DCF Accuracy Tests

```typescript
describe("clevel-dcf", () => {
  test("DCF deterministic: 5-yr projection with hand-calced example", () => {
    const input = {
      mrrAud: 10_000,
      monthlyGrowthRate: 0.10,
      burnRateAud: 5_000,
      churnRate: 0.03,
      // ... other fields
    };
    const result = computeDCFValuation(input);
    expect(result.baseValuation).toBe(2_500_000); // Expected hand-calc
  });

  test("DCF: pre-revenue startup (use TAM-based projection)", () => {
    const input = {
      mrrAud: 0,
      tamAud: 4_000_000_000,
      tamPenetrationPct: 0.001,
      monthlyGrowthRate: 0.15,
    };
    const result = computeDCFValuation(input);
    expect(result.baseValuation).toBeGreaterThan(500_000);
    expect(result.confidence).toBe("Low"); // Uncertain without revenue
  });

  test("DCF: high-growth SaaS (50% MoM → ensure compounding works)", () => {
    const input = { mrrAud: 5_000, monthlyGrowthRate: 0.50 };
    const result = computeDCFValuation(input);
    // Year 1 ARR should be: 5k * 12 * (1.5^12 - 1) / 0.5 ≈ 36M
    expect(result.year1Arr).toBeGreaterThan(30_000_000);
  });

  test("DCF: negative growth (declining startup)", () => {
    const input = { mrrAud: 10_000, monthlyGrowthRate: -0.05 };
    const result = computeDCFValuation(input);
    expect(result.baseValuation).toBeLessThan(1_000_000);
  });

  test("DCF vs VC Method: ensure results within 50% range", () => {
    const input = { mrrAud: 20_000, monthlyGrowthRate: 0.12 };
    const dcf = computeDCFValuation(input);
    const vc = computeVCValuation(input);
    const ratio = dcf.baseValuation / vc.baseValuation;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.0);
  });
});
```

### Sensitivity Analysis Tests

```typescript
describe("clevel-sensitivity", () => {
  test("Sensitivity: 3-scenario generation for 5 drivers", () => {
    const scenarios = generateScenarios({
      baseAssumptions: {
        arrGrowth: 0.10,
        churnRate: 0.05,
        cogsPct: 0.22,
        opexBurn: 10_000,
        taxRate: 0.25,
      },
    });

    expect(scenarios).toHaveLength(3); // bear, base, bull
    expect(scenarios[0].arrGrowth).toBeLessThan(scenarios[1].arrGrowth);
    expect(scenarios[1].arrGrowth).toBeLessThan(scenarios[2].arrGrowth);
  });

  test("Sensitivity: impact table (verify low/mid/high bounds)", () => {
    const base = 2_500_000;
    const table = generateSensitivityTable({ baseValuation: base });

    table.drivers.forEach(driver => {
      expect(driver.bearImpact).toBeLessThanOrEqual(0); // Negative impact
      expect(driver.bullImpact).toBeGreaterThanOrEqual(0); // Positive impact
      expect(Math.abs(driver.bearImpact)).toBeLessThan(0.5); // <50% downside
      expect(driver.bullImpact).toBeLessThan(1.0); // <100% upside
    });
  });

  test("Sensitivity: churn sensitivity (breakeven churn for LTV:CAC >3x)", () => {
    const breakeven = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.72,
      cac: 3_000,
      targetRatio: 3.0,
    });
    expect(breakeven).toBeGreaterThan(0.02); // >2% monthly
    expect(breakeven).toBeLessThan(0.10); // <10% monthly
  });

  test("Sensitivity: ARR growth impact on valuation (linear?)", () => {
    const val1 = computeDCFValuation({ mrrAud: 10_000, monthlyGrowthRate: 0.10 });
    const val2 = computeDCFValuation({ mrrAud: 10_000, monthlyGrowthRate: 0.12 });
    const val3 = computeDCFValuation({ mrrAud: 10_000, monthlyGrowthRate: 0.14 });

    const lift1to2 = (val2.baseValuation - val1.baseValuation) / val1.baseValuation;
    const lift2to3 = (val3.baseValuation - val2.baseValuation) / val2.baseValuation;
    expect(lift1to2).toBeGreaterThan(0.10); // >10% per 2pp growth
  });
});
```

### Trend Tracking Tests

```typescript
describe("clevel-trends", () => {
  test("12-week trend: fetch historical reports and calculate delta", async () => {
    const history = await fetch12WeekHistory({
      projectId: "test-project",
      role: "cfo",
      weeks: 12,
    });

    expect(history).toHaveLength(12);
    expect(history[0].week).toBe(1);
    expect(history[11].week).toBe(12);
    expect(history[0].date < history[11].date).toBe(true);
  });

  test("Trend: SVI score progression (upward if good execution)", () => {
    const scores = history.map(w => w.sviScore);
    const trend = calculateTrend(scores);
    expect(trend.direction).toMatch(/upward|downward|stable/);
    expect(trend.deltaPts).toBeDefined();
  });

  test("Trend: runway depletion (should decrease unless funded)", () => {
    const runways = history.map(w => w.runwayMonths);
    const trend = calculateTrend(runways);
    // Assuming no funding event: runway should decrease 1–2 months per week
    expect(runways[0]).toBeGreaterThan(runways[11]);
  });

  test("Edge case: 12-week history with funding event (jump in runway)", () => {
    const history = [
      { week: 1, runwayMonths: 8 },
      { week: 2, runwayMonths: 6 },
      { week: 5, runwayMonths: 18 }, // Series A close!
      { week: 12, runwayMonths: 16 },
    ];
    const trend = detectFundingEvent(history);
    expect(trend.eventDetected).toBe(true);
    expect(trend.week).toBe(5);
    expect(trend.fundingEstimate).toBeGreaterThan(500_000);
  });
});
```

### Regression & Edge Cases

```typescript
describe("clevel-edge-cases", () => {
  test("Nightly cron: 10,000 projects, all roles, all scenarios = 30k reports", async () => {
    const start = Date.now();
    const result = await generateNightlyReports({
      startupCount: 10_000,
      roles: ALL_ROLES,
      scenarios: ["bear", "base", "bull"],
      parallel: true,
    });
    const duration = Date.now() - start;

    expect(result.generated).toBe(30_000);
    expect(result.failed).toBe(0);
    expect(duration).toBeLessThan(600_000); // <10 min with parallel
  });

  test("Nightly cron: idempotency (re-run same startup = same report ID)", async () => {
    const run1 = await generateNightlyReports({ startupIds: ["xyz"] });
    const run2 = await generateNightlyReports({ startupIds: ["xyz"] });

    expect(run1[0].reportId).toBe(run2[0].reportId);
    expect(run1[0].generatedAt).toBe(run2[0].generatedAt);
  });

  test("Pre-revenue startup: DCF handles zero MRR gracefully", () => {
    const input = { mrrAud: 0, tamAud: 1_000_000_000, tamPenetrationPct: 0.001 };
    const result = computeDCFValuation(input);
    expect(result.baseValuation).toBeGreaterThan(0);
    expect(result.confidence).toBe("Low");
  });

  test("Missing data: startup has no growth rate → use stage benchmark", () => {
    const input = { mrrAud: 5_000, monthlyGrowthRate: undefined };
    const result = computeDCFValuation(input);
    expect(result.usedBenchmarkGrowth).toBe(true);
    expect(result.growthRateUsed).toBe(STAGE_GROWTH_BENCHMARKS[3]); // Default to Seed benchmark
  });

  test("Extreme growth rate: 300% MoM → ensure WACC doesn't go negative", () => {
    const result = computeDCFValuation({ mrrAud: 100, monthlyGrowthRate: 3.0 });
    expect(result.baseValuation).toBeGreaterThan(0);
    expect(result.wacc).toBe(0.35); // Unchanged
  });

  test("Database constraint: unique(project_id, role, scenario, DATE) enforced", async () => {
    const report1 = await createReport({
      projectId: "xyz",
      role: "cfo",
      scenario: "base",
      date: "2026-08-16",
    });

    const report2Promise = createReport({
      projectId: "xyz",
      role: "cfo",
      scenario: "base",
      date: "2026-08-16", // Same day
    });

    await expect(report2Promise).rejects.toThrow("UNIQUE constraint");
  });
});
```

---

## 10. Implementation Checklist

### Phase 1: Prompt Expansion (Days 1–7)

- [ ] Expand CFO prompt to 1800 words (DCF + tax + Series A gate)
- [ ] Expand CEO prompt to 2000 words (moat + CAPITAL scorecard + go/no-go)
- [ ] Expand CMO prompt to 1500 words (CAC benchmarking + LTV:CAC + TAM)
- [ ] Expand CDO prompt to 1200 words (dimension evidence + compliance audit + cap table)
- [ ] Expand CTO prompt to 1500 words (tech debt + infra cost projection + IP)
- [ ] Peer review all prompts (10+ test runs, manual quality check)
- [ ] Update prompt files in `/web/scripts/lib/clevel-prompts/`

### Phase 2: DCF Engine & Sensitivity (Days 8–14)

- [ ] Implement `computeDCFValuation()` TypeScript function
- [ ] Implement `generateSensitivityTable()` (5 drivers × 3 scenarios)
- [ ] Add scenario modifiers (bear/base/bull) to prompt context
- [ ] Build tax incentive calculator (R&D offset, ESIC, loss carryforward)
- [ ] Write 20+ unit tests for DCF, sensitivity, edge cases
- [ ] Validate DCF against hand-calced examples (r > 0.9)

### Phase 3: Database & API (Days 15–18)

- [ ] Create `clevel_reports_v2` table + indexes
- [ ] Write migration script (safe to deploy in CI)
- [ ] Build `/api/cron/clevel-review-v2/generate` (POST) endpoint
- [ ] Build `/api/cron/clevel-review-v2/historical/[role]/[projectId]` (GET) endpoint
- [ ] Add request validation + error handling
- [ ] Write API tests (happy path + edge cases)

### Phase 4: Nightly Cron (Days 19–21)

- [ ] Update `nightly-clevel-review.mjs` to use v2 schema
- [ ] Add scenario generation loop (bear, base, bull)
- [ ] Wire up DCF + sensitivity to CFO report
- [ ] Implement 12-week trend calculation
- [ ] Test on 100 projects (dry-run mode)
- [ ] Deploy to cron (2 AM Sydney time)
- [ ] Monitor cost/token usage first week

### Phase 5: Dashboard Integration (Days 22–25)

- [ ] Build CFO Report Card component (Valuation + Unit Economics + Runway)
- [ ] Build 12-Week Trend panel (SVI, ARR, Runway, Valuation)
- [ ] Build Sensitivity Analysis table (interactive, export CSV/Excel)
- [ ] Wire components to `/api/cron/clevel-review-v2/historical` API
- [ ] Add report card to `/dashboard/[role]` pages (cfo, ceo, cmo, cdo, cto)
- [ ] Test with 50+ reports on staging

### Phase 6: Investor Pack Integration (Days 26–28)

- [ ] Build `/api/investor-pack/executive-summary` (pulls CFO/CEO reports)
- [ ] Extract valuation consensus (median of 3 scenarios)
- [ ] Extract go/no-go recommendation from CEO framework
- [ ] Format as 1-page PDF (DCF table + risks + next steps)
- [ ] Wire to `/investor-pack/[projectId]/download` endpoint
- [ ] Test PDF generation with 20+ reports

### Phase 7: Testing & QA (Days 29–30)

- [ ] Run 40+ test scenarios (see Test Scenarios section)
- [ ] Regression testing: nightly cron on 10,000 projects
- [ ] Load testing: parallel scenario generation
- [ ] UAT with 5 founder accounts
- [ ] Compliance review: no real company names in benchmarks

---

## 11. Investor Pack Summary Integration Specs

### Investor Pack Document Structure

```markdown
# Investor Pack — Executive Summary

## At a Glance
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Valuation (DCF)** | A$2.5M (base) | Series A-ready | ✓ Green |
| **Runway** | 18 months | >15 months | ✓ Green |
| **Unit Economics** | LTV:CAC 3.2x | >3x | ✓ Green |
| **Growth** | 12% MoM | >5% | ✓ Green |
| **CAPITAL Score** | 4.1 / 5.0 | Series A-ready | ✓ Amber |

## Valuation Summary

### DCF 3-Scenario Range
- **Bear (Conservative):** A$1.2M — [Key driver: Growth slows 25%]
- **Base (Plan):** A$2.5M — [Execution on financial model]
- **Bull (Upside):** A$4.1M — [Growth +25%, churn improves]

**Confidence:** Medium (6-month revenue history + strong traction signals)

## Financial Health

### Key Levers (From Sensitivity Analysis)
| Driver | Impact on Valuation |
|--------|---------------------|
| ARR Growth (+10%) | +35% valuation lift |
| Churn Rate (–1pp) | +22% valuation lift |
| Gross Margin (+3pp) | +12% valuation lift |

### Series A Readiness

**CAPITAL Framework Score: 4.1 / 5.0**
- C (Customer Traction): 4.5 / 5
- A (Addressable Market): 4.0 / 5
- P (Product-Market Fit): 4.0 / 5
- I (Investor Fit): 4.0 / 5
- T (Trajectory): 4.2 / 5
- A (Advisor Board): 3.5 / 5
- L (Legal): 4.2 / 5

**Readiness:** Ready to close Series A within 3 months with 1–2 final optimizations

## Go/No-Go Recommendation

**Verdict: GO** — Product-market fit confirmed

Quantitative signals: NRR 108% ✓ | Churn 3.1% ✓ | CAC payback 10mo ✓ | Customer concentration <20% ✓
Qualitative signals: Organic feature requests ✓ | 30% word-of-mouth growth ✓ | Founder conviction high ✓

**Next 90 days:** Reduce churn to 2.5% (unlock +18% valuation); secure Series A term sheet

## Key Risks & Mitigants

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Churn rising above 5% | High | Monthly NPS survey; support investment |
| Competitor launch (major incumbent) | Medium | Deepen switching costs (integration); brand |
| Series A market conditions tighten | Medium | Accelerate revenue (expand to segment 2) |

---

## To Learn More

- [CFO Full Report](/reports/cfo-base-2026-08-16.md) — Detailed unit economics + 12-week trends
- [CEO Full Report](/reports/ceo-base-2026-08-16.md) — Moat assessment + competitive landscape
- [CMO Full Report](/reports/cmo-base-2026-08-16.md) — TAM/SAM/SOM + GTM efficiency
- [Data Room](/admin/data-room) — Cap table, contracts, financials, compliance docs

---

*Generated by BlockID Startup Index™ C-Level Advisory (v2.0.0)*  
*Disclaimer: Valuations are illustrative only. This report is not financial advice.*
```

### API Endpoint: `/api/investor-pack/executive-summary`

**Request:**
```json
{
  "project_id": "uuid",
  "format": "markdown" | "pdf" | "json"
}
```

**Response (JSON):**
```json
{
  "title": "Investor Pack — Executive Summary",
  "project_id": "uuid",
  "project_name": "Startup XYZ",
  "generated_at": "2026-08-16T09:30:00Z",
  "valuation": {
    "bear": 1200000,
    "base": 2500000,
    "bull": 4100000,
    "confidence": "Medium",
    "key_drivers": ["arr_growth", "churn_rate", "gross_margin"]
  },
  "capital_score": {
    "overall": 4.1,
    "breakdown": { "c": 4.5, "a": 4.0, "p": 4.0, "i": 4.0, "t": 4.2, "a": 3.5, "l": 4.2 },
    "interpretation": "Ready for Series A within 3 months"
  },
  "go_no_go": {
    "verdict": "GO",
    "confidence": 0.92,
    "quantitative_score": 0.85,
    "qualitative_score": 0.90
  },
  "sections": {
    "at_a_glance": { "markdown": "...", "table": [...] },
    "valuation_summary": { "markdown": "...", "table": [...] },
    "financial_health": { "markdown": "...", "table": [...] },
    "risks_and_mitigants": { "markdown": "...", "table": [...] }
  }
}
```

---

## 12. Historical Trend API Design

### `/api/cron/clevel-review-v2/historical/[role]/[projectId]`

**Response schema:**
```typescript
interface TrendResponse {
  role: string;
  project_id: string;
  scenario: "base" | "bear" | "bull";
  weeks: number;
  data: TrendDataPoint[];
  trend_summary: TrendSummary;
}

interface TrendDataPoint {
  week: number;
  date: string; // ISO 8601
  report_id: string;
  svi_score: number;
  arr: number; // in AUD
  mRR: number; // in AUD
  runway_months: number;
  dcf_valuation_low?: number;
  dcf_valuation_base?: number;
  dcf_valuation_high?: number;
  ltv_cac_ratio?: number;
  cac_payback_months?: number;
  churn_rate_pct?: number;
  gross_margin_pct?: number;
  key_action?: string;
  metadata?: Record<string, unknown>;
}

interface TrendSummary {
  svi_score_delta: number; // (latest - oldest) / oldest * 100
  arr_growth_pct_12w: number;
  runway_trend: "improving" | "stable" | "declining";
  valuation_trend: "upward" | "stable" | "downward";
  funding_event_detected?: boolean;
  funding_week?: number;
  critical_alerts?: string[];
}
```

---

## Summary & Next Steps

This design delivers:
1. **5x deeper prompts** (500 → 2500–3000 words per role)
2. **DCF valuation engine** with 3-scenario sensitivity
3. **12-week trend tracking** for founder accountability
4. **Series A readiness gates** (CAPITAL scorecard + go/no-go framework)
5. **Nightly cron generation** (non-blocking, cost-controlled)
6. **Investor pack integration** (executive summary auto-generated)
7. **Dashboard visibility** (report cards + trend panels)

**Effort:** 30 days (design → testing)  
**Cost:** ~A$500–1000/month for API usage (Claude Sonnet at scale)  
**Success metrics:** 4.2+ satisfaction (vs current 3.8), 70% action adoption, r > 0.7 valuation correlation

---

*Design authored: 2026-08-16*  
*Review status: Ready for engineering intake*
