# Revenue Forecast + Unit Economics Builder
## Quick Reference for Product & Design Teams

---

## Feature at a Glance

**Name:** Revenue Forecast + Unit Economics Builder (T0121)  
**Complexity:** P1 (2-week sprint)  
**ROI:** Highest — drives adoption, enables investor pack, feeds SVI scoring  
**User:** Founders (all tiers, focused on premium)  
**Success:** 60%+ adoption within 2 weeks of ship

---

## User Journey (Happy Path)

```
Founder enters dashboard
    ↓
[Click: Create Financial Projection]
    ↓
Step 1: Select model type (SaaS/Marketplace/Agency/Other)
    ↓
Step 2: Enter current ARR, monthly growth %, churn %
    ↓
Step 3: Enter COGS %, OpEx/month, fixed costs (sector defaults pre-filled)
    ↓
Step 4: Choose scenario (bear/base/bull), enable RDTI tax incentives
    ↓
Step 5: See 36-month chart, metrics, table
    ↓
[Click: Save to Profile] (costs 2 credits)
    ↓
Dashboard now shows: "Cash runway: $500K → 18 months to Series A"
Investor pack auto-includes: Revenue Projections section
SVI score increases: +15 points (FIN dimension)
```

**Time to completion:** <5 minutes

---

## Key Features

### Input Fields (Step 2-3)

| Field | Example | Auto-Filled? | Validation |
|-------|---------|--------------|-----------|
| Current ARR | $50,000 | No | 0 ≤ x ≤ 1 billion |
| Monthly Growth | 8.5% | No | -100% to 500% |
| Monthly Churn | 3% | No | 0% to 100% |
| COGS % | 25% | Yes (sector) | 0% to 100% |
| OpEx/month | $30,000 | Yes (sector) | 0 to 1 billion |
| Fixed Costs | $8,000 | No | 0 to 1 billion |
| Scenario | Base | No | bear/base/bull |
| RDTI Tax? | ☑ | Yes (default on) | Boolean |

### Output Metrics

**Summary Card:**
- ARR at 12 months
- ARR at 24 months
- ARR at 36 months
- Breakeven month
- Series A funding gate (month)
- Peak monthly burn
- Cash runway (months)

**Charts:**
- 36-month line chart: Revenue (ARR) + EBITDA line, crossing at breakeven
- Color coding: Green (profitable), Orange (high burn), Red (cash crisis)

**Table:**
- 36 rows (one per month)
- Columns: Month, Date, Revenue, COGS, Gross Margin, OpEx, EBITDA, Cash Burn, Cumulative Cash, Headcount, Tax Offset
- Virtualized (only render visible rows on mobile)

### Export Options

1. **Save to Profile** (2 credits)
   - Stores in DB with version history
   - Renameable ("Bull case - aggressive marketing")
   - Can use for investor pack (flag: "use_in_investor_pack")

2. **Download CSV**
   - 36-row table, all columns
   - Free (no credits)
   - Opens in Excel/Sheets

3. **Use in Investor Pack**
   - Flag checkbox: "Include in investor pack"
   - Auto-generates "Revenue Projections" section
   - Auto-generates "Use of Funds" subsection

---

## Integrations

### 1. Dashboard Widget

**Location:** Main dashboard grid

**Shows:**
```
Financial Forecast (Base Case)
Cash Runway: $500K → 18 months
Series A Gate: Month 20
ARR@12mo: $180K | ARR@24mo: $450K
[View Details] [Download] [Edit]
```

**Fetches:** Latest saved model (not deleted, not deleted)

---

### 2. Investor Pack Section

**Title:** "Revenue Projections"  
**Location:** Page 3 (after Team)  
**Content:**
- Model metadata (ARR, growth %, scenario)
- 12/24/36-month milestones
- Breakeven & Series A gate
- Key assumptions
- Founder notes

**Use-of-Funds:** Auto-calculated based on funding gap

**Compliance:** No named companies (e.g., "vs Stripe"), only anonymous comparisons ("vs AU SaaS median")

---

### 3. SVI Scoring

**FIN (Financial Strength) Dimension:**
- +15 points if Series A gate < 24 months (planning ahead)
- +10 points if breakeven < 24 months (path to profitability)
- +5 points if actual revenue ≥ 90% of projected (execution confidence)
- Max dimension: 50 points

**TRE (Traction & Revenue) Dimension:**
- +20 points if model confirms actual revenue growth (evidence-backed)
- Increases confidence score

---

## Scenarios Explained

### Bear Case (Conservative)
- **Growth decay:** 0.7x base sector growth
- **OpEx ramp:** +1% month-over-month
- **Hiring:** 1 new hire every 6 months
- **Use case:** Worst-case planning, risk-averse investors
- **Example:** ARR $50K, 8% growth → projects $150K@12mo (7×12) = $150K

### Base Case (Typical)
- **Growth decay:** 1.0x base sector growth (standard S-curve)
- **OpEx ramp:** +2% month-over-month
- **Hiring:** 1 new hire every 4 months
- **Use case:** Most likely scenario, default recommendation
- **Example:** ARR $50K, 8% growth → projects $180K@12mo

### Bull Case (Aggressive)
- **Growth decay:** 1.4x base sector growth (stronger momentum)
- **OpEx ramp:** +3.5% month-over-month (faster scaling)
- **Hiring:** 1 new hire every 2 months
- **Use case:** Optimistic pitch, well-funded startups
- **Example:** ARR $50K, 8% growth → projects $250K@12mo

---

## Sector Defaults (Pre-Filled)

### SaaS
- Base Growth: 8% monthly
- COGS: 25%
- OpEx: $35K/month
- R&D Intensity: 20%

### Fintech
- Base Growth: 7% monthly
- COGS: 20%
- OpEx: $45K/month
- R&D Intensity: 20%

### Marketplace
- Base Growth: 7% monthly
- COGS: 15%
- OpEx: $40K/month
- R&D Intensity: 15%

### Deeptech
- Base Growth: 5% monthly
- COGS: 30%
- OpEx: $50K/month
- R&D Intensity: 40%

---

## Warnings (Non-blocking, Founder Can Override)

| Condition | Message | Severity |
|-----------|---------|----------|
| ARR=0 AND growth=0 | "No revenue and no growth. Check assumptions." | Info |
| OpEx > Revenue | "Monthly burn exceeds revenue. Runway is 18 months." | Warning |
| Churn > Growth | "Churn exceeds growth. Negative unit economics?" | Warning |
| Growth > 50%/mo | "Hypergrowth assumption. Validate market size." | Info |
| ARR > 10M | "Projected ARR very high. Double-check inputs." | Info |

---

## Pricing & Credits

**Cost:** 2 credits per saved model (free to generate/preview)  
**Current Rate:** ~2,000 credits = $20/month subscription

**Credit Math:**
- Generate (preview only): 0 credits
- Save to DB: 2 credits
- Export CSV: 0 credits
- Investor pack section: 0 credits (included in save)

---

## Data Retention & Privacy

**Stored:** Full 36-month snapshot (immutable after save)  
**Soft-delete:** Models marked "is_deleted=true", never purged  
**Audit trail:** User ID, timestamps, version number (easy founder disputes resolution)  
**RLS:** Only project owner can access their models  
**Export:** Founder can download CSV anytime before deletion

---

## Compliance & Disclaimers

### Every Output Includes:

```
General information only. Not financial advice. Projections are 
illustrative estimates based on AU sector benchmarks and may differ 
materially from actual outcomes. Do not rely solely on this tool for 
investment decisions. Consult a qualified financial advisor.
```

### No Named Benchmarks in Output

**Prohibited:**
- "vs Stripe's growth rate"
- "vs Canva's burn efficiency"
- Any specific company data

**Allowed:**
- "vs AU SaaS median (8% monthly growth)"
- "vs fintech baseline COGS (30%)"
- "AU startup average runway (16 months)"

---

## Success Metrics (Measured at 2 Weeks)

| Metric | Target | Status |
|--------|--------|--------|
| Premium user adoption | 60%+ | — |
| Avg time-to-completion (p50) | <5 min | — |
| Save rate (% who complete) | 40%+ | — |
| Investor pack integration | 35%+ | — |
| Support ticket reduction | -30% | — |
| Credit revenue (2-credit saves) | TBD | — |

---

## FAQ

**Q: Can founders edit projections after saving?**  
A: Yes. Editing creates a new version (version 2, 3, etc.). Old versions retained for audit trail.

**Q: Does saving projection lock it for investor pack?**  
A: No. Founders can flag "use_in_investor_pack" anytime. Locking only happens at pack generation (immutable snapshot).

**Q: Can founders share projections with co-founders?**  
A: Not yet (v1). Future enhancement: share read-only link with collaborators.

**Q: What if a founder has multiple projects?**  
A: Each project gets its own models list. Projections are scoped to project_id (multi-startup architecture).

**Q: Does the tool charge credits even if founder doesn't save?**  
A: No. Only saving (POST /api/financial-model/save) costs 2 credits. Generating (GET /api/financial-model/generate) is free.

**Q: Can a founder upload their own financial model instead of using this tool?**  
A: Yes (future: document upload in investor pack). For now, use-of-funds can be manually edited in pack.

**Q: How does RDTI work?**  
A: Australian R&D Tax Incentive (RDTI): 43.5% premium on eligible R&D spend (capped by sector R&D intensity). Auto-calculated monthly if enabled.

**Q: What's a realistic monthly growth rate?**  
A: SaaS: 8% baseline. Marketplace: 7%. Fintech: 7%. See sector defaults above.

**Q: Can negative growth (contraction) be modeled?**  
A: Yes (growth range: -100% to 500%). Models declining ARR scenarios for startups in trouble.

---

## Rollout Checklist

- [ ] Database migration deployed (`20260817_financial_models.sql`)
- [ ] API routes tested (generate, save, list, update, delete)
- [ ] Wizard component builds & renders
- [ ] Charts render correctly (mobile + desktop)
- [ ] Investor pack section integrates
- [ ] SVI scoring updated
- [ ] Feature flag set to 10% traffic
- [ ] Monitoring configured (errors, latency, credit spend)
- [ ] Help docs updated
- [ ] Founder outreach (email, in-app notification)
- [ ] Full release (flag 100%)

---

## Visual: Scenario Comparison

```
                Bear Case    Base Case    Bull Case
Starting ARR    $50,000      $50,000      $50,000
Growth Rate     5.6%/mo      8%/mo        11.2%/mo
ARR@12mo        $120,000     $180,000     $250,000
ARR@24mo        $280,000     $520,000     $800,000
Breakeven       Month 20     Month 18     Month 14
Series A Gate   Month 24     Month 20     Never
```

---

**End of Quick Reference**

Print this page or share with product, design, and marketing teams. It covers everything needed to understand the feature without diving into code.
