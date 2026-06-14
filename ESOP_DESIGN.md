# BlockID.au ESOP Pool Design Document
**Date:** 2026-06-13  
**Version:** 1.0  
**Prepared by:** AI Self-Analysis Engine

---

## Executive Summary

BlockID.au requires an ESOP (Employee Stock Option Plan) pool before approaching institutional investors (Antler, accelerators, VCs). This document designs a 12% ESOP pool under Australian Corporations Act compliance, with standard 4-year vesting, 1-year cliff.

**Key Numbers:**
- Pool Size: 12% (12,000 shares of 100,000 total post-pool)
- Founder Shares: 88% (88,000 shares, vested retroactively at founding)
- Vesting Schedule: 4 years, 1-year cliff
- Allocation Framework: Flexible for future hires, advisors, investors

---

## 1. Current Cap Table (Pre-ESOP)

| Holder | Shares | % | Notes |
|--------|--------|---|-------|
| Do Van Long (Founder) | 100 | 100% | Solo founder, ACN 659 615 111 |
| **Total** | **100** | **100%** | |

### Legal Entity
- **Company Name:** Auschain Pty Ltd
- **ACN:** 659 615 111
- **ABN:** 79 659 615 111
- **Incorporation:** Ongoing (shell company for blockchain research initially)
- **State:** Victoria

---

## 2. Post-ESOP Cap Table (Target)

| Holder | Shares | % | Status |
|--------|--------|---|--------|
| Do Van Long (Founder) | 88,000 | 88% | Founder shares, 4yr/1yr vesting (retroactive) |
| ESOP Pool | 12,000 | 12% | Unallocated, reserved for future grants |
| **Total** | **100,000** | **100%** | |

### Share Split Mechanics
- Current 100 shares become 88,000 shares (88x split)
- ESOP pool created with 12,000 shares (12% pool)
- Total authorized shares: 100,000
- Ratio ensures clean math for future investor rounds (8x, 10x, etc.)

---

## 3. ESOP Pool Allocation Strategy

### Phase 1: Pre-Raise (Next 6 months)
**Allocation:** 0–2,000 shares (0–2% of pool)

| Role | Shares | Strike Price | Vesting | Status |
|------|--------|--------------|---------|--------|
| First Full-time Hire | 500 | A$0.10 | 4yr/1yr cliff | Planned Q3 2026 |
| Advisor (Technical) | 200 | A$0.10 | 4yr/1yr cliff | TBD |
| Advisor (Business) | 200 | A$0.10 | 4yr/1yr cliff | TBD |
| Reserve | 1,100 | — | — | Unallocated |

**Rationale:**
- Early hires/advisors get meaningful equity (0.2–0.5%)
- Low strike price (A$0.10) = no upfront tax burden
- Vesting encourages retention through pre-seed and seed rounds
- Reserve allows flexibility for unexpected opportunities

### Phase 2: Seed Round (6–12 months)
**Allocation:** 2,000–6,000 shares (2–6% of pool)

- Additional 3–4 full-time hires (engineering, sales, ops)
- Advisor topups for strong contributors
- Customer advisors (domain-specific expertise)
- Board observers / investor advisors

### Phase 3: Series A (12–24 months)
**Allocation:** 6,000–12,000 shares (100% of pool if needed)

- Expand team to 10–15 people
- Dilution consideration: ESOP pool normally carries through rounds (not diluted by investor allocation)
- However, may expand pool if growing significantly

---

## 4. Vesting Schedule & Cliff

### Standard Terms (4-Year Vesting, 1-Year Cliff)

**Rationale:** Australian startup best-practice. Aligns with US standard, recognized by all major VCs.

| Period | Vesting | Monthly Rate | Notes |
|--------|---------|--------------|-------|
| Month 0–11 | 0% (Cliff) | 0% | 1-year cliff: no shares vest if employee leaves before 12 months |
| Month 12 (Cliff Date) | 25% | — | 1/4 of total grant vests on cliff (sudden jump) |
| Month 13–48 | Remaining 75% | 1.5625% / month | Monthly vesting after cliff (36 additional months) |
| Month 48+ | 100% | — | All shares fully vested |

**Example: 500-share grant**
```
Month 0:   0 vested,   0 exercisable
Month 12: 125 vested, 125 exercisable (cliff)
Month 24: 312 vested, 312 exercisable (half-way through vesting)
Month 36: 437 vested, 437 exercisable (9 months left)
Month 48: 500 vested, 500 exercisable (fully vested)
```

### Acceleration Clauses (Optional, for future use)

1. **Double-Trigger Acceleration**
   - 50% acceleration if founder is terminated without cause or resigns for good reason within 12 months of acquisition
   - Applies to all employees, protects against acquirer changing terms
   - Standard in M&A (venture acquired by strategic buyer)

2. **Change of Control (100% Acceleration)**
   - If blockid.au is acquired at >10x valuation, full ESOP acceleration
   - Incentivizes exits; protects long-term employees

---

## 5. Strike Price & Tax Implications

### Strike Price Strategy

**Founder Shares:**
- Strike Price: A$0.0001 (nominal, effectively $0)
- Rationale: Retroactive issuance; founder earned by building; no tax on issuance

**Employee / Advisor Options:**
- Strike Price: A$0.10 per share (post-Founding 50 implied valuation)
- Rationale: Fair market value (FMV) at time of grant; complies with Australian tax law (ESS Act 2004)

### Tax Compliance

#### Australian Employee Share Scheme (ESS)
- BlockID.au should establish formal ESS plan to comply with **Income Tax Assessment Act 1997 Part 7A**
- Conditions:
  - Written plan adopted by board
  - Shares issued at/above FMV (A$0.10 ≈ FMV based on Founding 50 pricing)
  - Employee agreement (share plan deed)
  - Non-recourse loan option or cash payment
  - 5-year holding period (concessional CGT treatment)

#### Fringe Benefits Tax (FBT)
- Options (not yet exercised) = no FBT
- Once exercised: taxable benefit = (Market Value - Strike) × number of shares
- Timing: Employee taxed in FY of exercise or vesting (whichever earlier under ESS)

**Action:** Engage Australian tax advisor (BDO, Pitcher Partners, etc.) to draft formal ESS plan deed before first grant.

---

## 6. Governance & Administration

### Board Resolutions Required

1. **ESOP Pool Creation** (FD signature)
   - Authorize 12,000 shares for ESOP pool
   - Approve strike price (A$0.10)
   - Appoint ESOP administrator (CEO or CFO)

2. **Founder Share Issuance** (Retroactive)
   - Issue 88,000 founder shares at strike A$0.0001
   - Implement 4-year vesting retroactive to 2024-01-01 (or incorporation date)
   - Sign vesting confirmation deed with founder

3. **Share Plan Deed** (ESOP Terms)
   - Board adoption of formal ESOP plan
   - Define vesting, acceleration, exercise mechanics
   - Set out director's discretion for future grants

### Cap Table Administration

**Tool:** BlockID.au's own cap table system

- Create "ESOP Pool" as a virtual shareholder
- Track grants (employee name, grant date, share count, strike, vesting date)
- Auto-calculate monthly vesting
- Flag accelerations on trigger events
- Generate cap table reports showing fully diluted ownership

**Software Stack:**
- Use Supabase (existing) to store ESOP table
- Create `/api/esop/` endpoints for grant management
- Build UI in `/workspace/cap-table/` with ESOP tab

---

## 7. Investor Signaling & Fundraising Impact

### Why ESOP Matters to Investors

1. **Retention Signal:** ESOP = planned growth, not one-man-band
2. **Professionalism:** Shows founder planning for team scaling
3. **Clean Cap Table:** ESOP pool accepted by investors; protects startup equity story
4. **Anti-Dilution:** Well-structured ESOP doesn't dilute investors (standard practice)

### Antler Fundraising (July 2026 cohort)

- **Pre-ESOP:** Pitch shows 100% founder, no team structure → investor concern
- **Post-ESOP:** Pitch shows 88% founder + 12% ESOP pool + clear hiring plan → signals readiness

**Recommended in Pitch Deck:**
- Slide 4 (Team): "Founder 88% + 12% ESOP pool (first hires Q3 2026)"
- Slide 6 (Use of Funds): "A$88K pre-seed | $30K hiring (1 engineer) | $40K AI costs + infrastructure | $18K runway"

---

## 8. Compliance Checklist

### Australian Corporations Act & Tax Office

- [ ] **Corporations Act 2001 – Section 708** (Private Shares Exemption)
  - ESOP grants up to 12% pool exempt from prospectus requirement
  - Notify ASIC (Form 902A + 905A for capital raises)
  
- [ ] **Income Tax Assessment Act 1997 – Part 7A** (ESS Concessions)
  - Formal ESS plan deed required
  - Employee agreement template
  - Tax deduction claim (company deducts option expense, employee includes benefit)

- [ ] **Corporations Act 2001 – Continuous Disclosure** (if listed, N/A for now)

- [ ] **Privacy Act 1988** (if collecting employee/advisor data)
  - Privacy policy for option holders
  - Data handling for cap table

### Documents to Prepare

1. **Constitution Amendment** (if needed)
   - Update company constitution to allow options/ESO grants
   - Define director discretion for ESOP admin

2. **ESOP Plan Deed**
   - Terms of options (strike, vesting, exercise)
   - Acceleration triggers
   - Leaver/bad leaver provisions

3. **Share Plan Offer Letter** (per grant)
   - Employee name, share count, strike price
   - Vesting schedule
   - Tax acknowledgments (employee responsible for tax on exercise)

4. **Vesting Confirmation Deed** (Founder retroactive)
   - Confirm 88,000 shares issued retroactively
   - 4-year vesting from [incorporation date]
   - Cliff date + monthly vesting formula

5. **Cap Table Spreadsheet** (certified by auditor, if raising)
   - Before & after ESOP structure
   - Ownership %, fully diluted basis
   - Outstanding options

---

## 9. Implementation Timeline

| Week | Task | Owner | Status |
|------|------|-------|--------|
| 1 | Adopt ESOP pool resolution (board) | Founder | PENDING |
| 1 | Engage tax advisor for ESS plan deed | Founder | PENDING |
| 2 | Draft ESOP plan deed (tax advisor) | Tax Advisor | PENDING |
| 2 | Update cap table with founder shares + ESOP | FD/Ops | PENDING |
| 3 | Board signature on vesting confirmation deed | Founder | PENDING |
| 4 | Finalize share plan offer letter template | Legal | PENDING |
| 4 | Update Antler pitch deck with ESOP slide | Marketing | PENDING |
| 5 | **ESOP LIVE** — ready for first hire grant | All | **TARGET** |

---

## 10. Next Steps

1. **Immediate (Week 1):**
   - Founder (Do Van Long) approves this ESOP design
   - Engage tax advisor (recommendation: Pitcher Partners or BDO, both ESOP-experienced)
   - Schedule board meeting to adopt ESOP pool resolution

2. **Week 2:**
   - Tax advisor drafts formal ESS plan deed + share plan agreement
   - FD updates cap table in Supabase with founder shares + ESOP pool

3. **Week 3:**
   - Founder signs vesting confirmation deed
   - Cap table certified (if preparing for investor disclosure)

4. **Week 4+:**
   - Share plan offer letter template prepared
   - First hire can be offered grant (Q3 2026)
   - ESOP reflected in Antler pitch + financial models

---

## Appendix A: Example ESOP Grant Offer

```
EMPLOYEE SHARE OPTION GRANT OFFER
==================================

Date: [Grant Date]
To: [Employee Name]
From: Do Van Long, CEO, Auschain Pty Ltd (ACN 659 615 111)

Grant Details:
- Total Options: 500
- Strike Price: A$0.10 per option
- Vesting Schedule: 4 years, 1-year cliff
- Cliff Date: [Grant Date + 12 months]
- Final Vesting: [Grant Date + 48 months]
- Monthly Vesting: 1.5625% of total (after cliff)

Tax Acknowledgment:
You acknowledge that:
1. This offer complies with Australian ESS concessions (Part 7A ITAA 1997)
2. You may be taxed on exercise or vesting (your tax advisor will advise)
3. Company will provide tax guidance and documentation
4. You are responsible for your own tax liability

Acceptance:
By signing below, you accept this grant under the terms of BlockID.au ESOP Plan Deed.

[Signature] ________________________  Date: __________
Employee

[Signature] ________________________  Date: __________
CEO / Company

```

---

## Appendix B: Fully Diluted Ownership Table

**Scenario: Post-ESOP, Pre-Seed Funding (A$88K raise at A$440K pre-money valuation)**

| Holder | Pre-ESOP | ESOP Pool | Pre-Seed | Post-Seed | % |
|--------|----------|-----------|----------|-----------|---|
| Do Van Long | 88,000 | — | — | 88,000 | 71.8% |
| ESOP Pool | 12,000 | — | — | 12,000 | 9.8% |
| First Hire (500 opt) | — | (500 unvested) | — | 500 | 0.4% |
| Seed Investor | — | — | 40,000 | 40,000 | 32.8% |
| **Fully Diluted** | **100,000** | **12,000** | **40,000** | **140,500** | **100%** |

**Notes:**
- ESOP pool does not dilute on investor rounds (carry-through mechanism)
- First hire's 500 shares = 0.4% on fully diluted basis
- Investor receives 40,000 shares = A$88K / A$2.20 per share (post-money valuation A$529K)

---

## Appendix C: Australian Tax Rates & Marginal Tax (2026)

| Income | Tax Rate | Comments |
|--------|----------|----------|
| A$0–18,200 | Tax-free threshold | Most startups qualify |
| A$18,201–45,000 | 19% | Typical early-stage founder |
| A$45,001–120,000 | 32.5% | Bootstrapped founder post-revenue |
| A$120,001+ | 45% | Growth-stage founder |

**Capital Gains Tax (CGT):**
- Discount: 50% if held >12 months (individuals)
- Example: Sell 500 shares for A$2 each (A$1,000) after 2-year hold
  - Cost base: A$50 (500 × A$0.10)
  - Capital gain: A$950
  - CGT @ 50% discount: A$950 × 50% × 37% = A$176 (approx)
  - Net proceeds: A$824

**ESS Concessions:**
- If held 5+ years under formal ESS plan, concessional CGT treatment
- Effective CGT: ~18.75% (half of 37.5% top rate)
- Example above: A$89 CGT instead of A$176

