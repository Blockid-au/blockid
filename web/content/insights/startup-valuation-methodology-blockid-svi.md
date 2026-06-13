---
title: "Professional Startup Valuation Methodology: BlockID SVI Framework"
description: "Complete guide to valuing AU startups using 8 professional methods — Berkus, Scorecard, DCF, VC Method, Revenue Multiple, SVI-Based, Risk Factor Summation, and First Chicago"
date: "2026-06-13"
category: "valuation"
tags: ["valuation", "SVI", "startup", "financial-model", "australia", "berkus", "dcf", "seed", "fundraising"]
author: "BlockID"
sviRelevant: ["IRI", "TRE", "CGH"]
readingTime: "12 min"
---

# Professional Startup Valuation Methodology: BlockID SVI Framework

Valuing an early-stage startup is part science, part art. Unlike public companies with years of financial history, startups require a multi-method approach that accounts for team quality, market potential, product depth, and evidence quality.

BlockID uses **8 professional valuation methods**, then blends them by stage and confidence level to produce a defensible, investor-ready range.

---

## Why a Single Method is Insufficient

Each method captures a different dimension of startup value:

| Method | Best For | Limitation |
|--------|----------|------------|
| **Berkus** | Pre-revenue ideas | Caps at A$3.75M; doesn't scale |
| **Scorecard** | Seed benchmarking | Depends on comparable deals |
| **DCF** | Revenue-stage startups | Garbage in, garbage out for pre-revenue |
| **VC Method** | Fundraising context | Requires exit assumptions |
| **Revenue Multiple** | ARR-stage | Not useful pre-revenue |
| **SVI-Based** | BlockID platform | Proprietary; stage + score calibration |
| **Risk Factor Summation** | Holistic risk view | Subjective ratings |
| **First Chicago** | Scenario planning | Probability estimates are subjective |

**Recommended blend (weighted average):**
- SVI-Based: 25%
- Scorecard: 25%
- VC Method: 22%
- Berkus: 15%
- Risk Factor Summation: 8%
- DCF: 5% (low weight until revenue)

---

## Method 1: Berkus Method (AU-Adjusted)

Developed by Dave Berkus for pre-revenue startups. Allocates up to A$750,000 per pillar:

| Pillar | SVI Dimension | Max Value |
|--------|--------------|-----------|
| Sound Idea | MPC | A$750,000 |
| Prototype/Product | PTD | A$750,000 |
| Quality Team | FTV | A$750,000 |
| Strategic Relationships | IRI + SVM | A$750,000 |
| Product Rollout/Traction | TRE | A$750,000 |

**Formula:** `Berkus Value = Σ(score/100 × A$750,000)` per pillar  
**Max:** A$3,750,000 | **AU Seed Median:** A$1,500,000–A$2,500,000

**BlockID.au Result:** A$2,685,000 (based on SVI score = 156)

---

## Method 2: Scorecard Method

Compares against AU seed-stage median (A$3M). Weights SVI dimensions:

| Factor | Weight | SVI Source |
|--------|--------|-----------|
| Management Team | 30% | FTV |
| Market Size | 25% | MPC |
| Product/Technology | 15% | PTD |
| Competition/Moat | 10% | SVM |
| Traction Evidence | 10% | TRE |
| Need for Funding | 5% | IRI |
| Legal/Compliance | 5% | LCO |

**Formula:** `Scorecard = A$3M × [1 + Σ(weight × (score/100 - 0.5) × 2)]`

Higher-than-median scores on key dimensions increase valuation above the A$3M base.

**BlockID.au Result:** A$3,420,000

---

## Method 3: Discounted Cash Flow (DCF)

Best applied once a startup has MRR data. Uses:
- **WACC:** 35% (early-stage AU, high risk premium)
- **Terminal Growth Rate:** 3%
- **Horizon:** 5 years
- **EBIT progression:** -60% → -20% → 5% → 18% → 28% (typical SaaS trajectory)

**Limitations:** Highly sensitive to growth assumptions. Weight this method low (<10%) for pre-revenue startups.

---

## Method 4: VC Method (Return-Based)

Works backwards from an exit assumption:

```
Exit Value = ARR Year 5 × Exit Multiple (8× for AU SaaS)
Post-Money = Exit Value ÷ Target Return (10×)
Pre-Money = Post-Money − Raise Amount
```

**BlockID.au parameters:** ARR Y5 (Base) × 8 = Exit Value → ÷10 → Post-Money → Pre-Money A$2,700,000+

---

## Method 5: Revenue Multiple

For startups with measurable ARR:

| ARR Stage | Multiple Range | AU Benchmark |
|-----------|---------------|--------------|
| A$0 | N/A | Use Berkus/Scorecard |
| A$10K–$100K | 5×–8× | Seed stage |
| A$100K–$1M | 8×–12× | Series A ready |
| A$1M+ | 12×–20× | Scale stage |

**Apply sector multiplier:** FinTech ×1.3, DeepTech/AI ×1.5, EdTech ×0.9

---

## Method 6: BlockID SVI-Based Valuation (Proprietary)

The **BlockID Startup Index™** maps SVI score + stage to a valuation range using calibrated AU market data:

### Stage Base Values (AU Pre-Seed Median)

| Stage | Description | Base Valuation |
|-------|-------------|----------------|
| Stage 0 | Concept | A$300,000 |
| Stage 1 | MVP | A$750,000 |
| Stage 2 | Product-Market Fit | A$2,000,000 |
| Stage 3 | Early Traction | A$3,500,000 |
| Stage 4 | Scale | A$6,000,000 |
| Stage 5 | Growth | A$12,000,000 |

### SVI Premium Formula

```
SVI Premium = (SVI Score − 100) ÷ 100
SVI Valuation Mid = Stage Base × (1 + SVI Premium)
SVI Valuation Low = Stage Base × (1 + SVI Premium × 0.7)
SVI Valuation High = Stage Base × (1 + SVI Premium × 1.4)
```

**Example — BlockID.au (Stage 3, SVI 156):**
- Premium = (156 − 100) / 100 = 56%
- Mid = A$3,500,000 × 1.56 = **A$5,460,000**
- Low = A$3,500,000 × 1.39 = **A$4,872,000**
- High = A$3,500,000 × 1.78 = **A$6,237,000**

### Evidence Confidence Multipliers

SVI scores are adjusted by evidence tier:

| Tier | Multiplier | Type |
|------|-----------|------|
| T0 | 0.20 | No evidence |
| T1 | 0.40 | Self-declared |
| T2 | 0.60 | Documented |
| T3 | 0.80 | Third-party |
| T4 | 0.95 | Audited |
| T5 | 1.00 | Independently verified |

---

## Method 7: Risk Factor Summation

Adjusts a base valuation by ±A$250,000 per risk factor:

| Factor | Rating |
|--------|--------|
| Management Risk | −2 to +2 |
| Stage of Business | −2 to +2 |
| Legislation/Political | −2 to +2 |
| Manufacturing/Production | −2 to +2 |
| Sales & Marketing | −2 to +2 |
| Funding/Capital | −2 to +2 |
| Competition | −2 to +2 |
| Technology | −2 to +2 |
| Litigation | −2 to +2 |
| International Risk | −2 to +2 |
| Reputation | −2 to +2 |
| Potential Exit Value | −2 to +2 |

**Formula:** `RFS Value = A$3M Base + Σ(rating × A$250,000)`

**BlockID.au Result:** +A$1.5M adjustment → **A$4,500,000**

---

## Method 8: First Chicago Method

Probability-weighted scenarios:

| Case | Probability | Typical Value |
|------|-------------|---------------|
| Success (IPO/M&A) | 15–30% | 12×–20× ARR Year 5 |
| Base (Profitable) | 40–55% | 6×–10× ARR Year 5 |
| Sideways (Pivot) | 10–20% | A$500K–A$2M |
| Failure | 10–15% | A$0 |

**Formula:** `FC Expected Value = Σ(probability × case_value)`

---

## How to Apply to Other Startup Profiles

### Step-by-Step Process

1. **Run SVI analysis** via blockid.au/workspace/svi
2. **Note:** SVI Score, Stage, and dimension scores (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)
3. **Calculate Berkus** using dimension scores mapped to pillars
4. **Apply Scorecard** using AU seed median (A$3M) as base
5. **Apply Risk Factor** ratings based on startup context
6. **Apply SVI-Based** using stage base + SVI premium
7. **Model DCF** only if ARR > A$50K/mo
8. **Blend** using recommended weights
9. **Apply sector multiplier** (FinTech, SaaS, HealthTech, etc.)
10. **Store snapshot** in startup profile with date, SVI score, valuation range

### Blended Weighting by Stage

| Stage | SVI | Scorecard | Berkus | Risk Factor | VC Method | DCF |
|-------|-----|-----------|--------|-------------|-----------|-----|
| 0–1 (Pre-revenue) | 30% | 25% | 25% | 15% | 5% | 0% |
| 2–3 (Early Traction) | 25% | 25% | 15% | 8% | 22% | 5% |
| 4–5 (Scale) | 15% | 20% | 5% | 5% | 25% | 30% |

---

## BlockID.au Self-Analysis Summary

**Date:** 13 June 2026 | **SVI Score:** 156 | **Stage:** 3 (Early Traction)

### Dimension Scores

| Dimension | Score | Weight | Confidence |
|-----------|-------|--------|-----------|
| FTV — Founding Team | 68/100 | 15% | T1 (self-declared) |
| MPC — Market Clarity | 82/100 | 18% | T2 (documented) |
| PTD — Product Depth | 91/100 | 12% | T2 (code = evidence) |
| TRE — Traction | 52/100 | 20% | T1 (pre-revenue) |
| CGH — Capital History | 45/100 | 12% | T1 (bootstrapped) |
| IRI — Investor Ready | 78/100 | 10% | T2 (pitch deck exists) |
| LCO — Legal/Compliance | 63/100 | 8% | T2 (ASIC pending) |
| SVM — Strategic Moat | 74/100 | 5% | T2 (trademark filing) |

### Valuation Range (6-Method Blended)

| Scenario | Valuation |
|----------|-----------|
| Conservative | A$2,409,785 |
| Base Case | **A$2,911,121** |
| Optimistic | A$3,517,675 |
| Risk Factor Method | A$4,500,000 |
| First Chicago | A$2,502,173 |

### Key Financial Metrics (Base Scenario, 36-month)

- Monthly Burn: **A$1,056/month**
- Break-Even: **Month 9** (Base scenario)
- ARR Month 12: Projected positive trajectory
- LTV:CAC Ratio: **16.7× Base** (A$1,500 LTV ÷ A$90 CAC)
- Gross Margin: **78%**

### Strategic Recommendations

**Priority 1 (30 days) — Increase TRE score from 52 → 72:**
- Activate 50 Founding50 subscribers (A$2,450 ARR immediately)
- Launch ProductHunt → target 200+ signups
- Collect 5 founder testimonials with permission

**Priority 2 (60 days) — Improve CGH from 45 → 65:**
- Apply to Startmate S24 / Antler AU Residency
- File for AU Company registration if not done
- Pursue angel funding A$200K–$500K

**Priority 3 (90 days) — Protect moat:**
- Register BlockID Startup Index™ trademark (AU)
- Patent SVI algorithm methodology
- Publish methodology whitepaper (establishes IRI + SVM)

---

*This analysis was generated by BlockID's SVI engine. For live analysis and fundraising tools, visit blockid.au.*

*BlockID Startup Index™ is a trademark of BlockID.au — Confidential.*
