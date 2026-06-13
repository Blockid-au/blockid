---
title: "C-Level Startup Valuation Knowledge Base"
description: "Executive reference guide for applying BlockID SVI valuation methodology to any AU startup profile"
date: "2026-06-13"
category: "internal"
access: "admin"
version: "2.0.0"
---

# C-Level Startup Valuation Knowledge Base

**Version:** 2.0.0 | **Date:** 13 June 2026 | **Author:** BlockID System  
**Application:** Apply to all startup profiles in the BlockID platform

---

## Overview

This knowledge base codifies the BlockID valuation methodology for systematic application across all startup profiles. Every user with a startup profile on BlockID can receive a standardised, multi-method valuation report.

---

## Quick Reference: Valuation Formula by Stage

```
Final Valuation = Blended(8 methods) × Sector Multiplier × Evidence Confidence
```

### Stage Bases (AU, June 2026)

| Stage | Label | SVI Range | Base Valuation |
|-------|-------|-----------|----------------|
| 0 | Concept/Idea | 70–90 | A$300,000 |
| 1 | MVP / Beta | 90–110 | A$750,000 |
| 2 | Product-Market Fit | 100–125 | A$2,000,000 |
| 3 | Early Traction | 115–150 | A$3,500,000 |
| 4 | Scale / Series A | 140–180 | A$6,000,000 |
| 5 | Growth / Pre-IPO | 160–250 | A$12,000,000 |

### Sector Multipliers

| Sector | Multiplier | Notes |
|--------|-----------|-------|
| AI / DeepTech | ×1.5 | Patent premium; global exit potential |
| FinTech / RegTech | ×1.3 | AU regulatory moat; Stripe-like exits |
| HealthTech | ×1.4 | IP, TGA pathway, govt grants |
| B2B SaaS | ×1.2 | Recurring revenue premium |
| PropTech | ×1.1 | Strong AU market |
| Marketplace | ×1.0 | Network effects but binary outcomes |
| EdTech | ×0.9 | Lower ARPU, competitive |
| Consumer App | ×0.8 | High CAC, low retention |
| eCommerce | ×0.85 | Low margin, competitive |

---

## Applying Valuation to a New Startup Profile

### Step 1: Collect SVI Inputs

Required from startup profile:
```json
{
  "company": "Company Name Pty Ltd",
  "email": "founder@company.com",
  "stage": 2,
  "svi_score": 115,
  "ftv": 60, "mpc": 70, "ptd": 65, "tre": 45,
  "cgh": 40, "iri": 55, "lco": 60, "svm": 60,
  "mrr": 0,
  "monthly_growth": 0.10,
  "churn": 0.06,
  "arpu": 60,
  "burn_rate": 800,
  "sector": "B2B SaaS",
  "tam": 500000000,
  "evidence_tier": 1
}
```

### Step 2: Run Berkus Calculation

```python
BERKUS_MAX = 750_000  # AU-adjusted
pillars = {
    "idea":    mpc_score / 100,
    "product": ptd_score / 100,
    "team":    ftv_score / 100,
    "moat":    (iri_score + svm_score) / 2 / 100,
    "traction":tre_score / 100,
}
berkus_val = sum(p * BERKUS_MAX for p in pillars.values())
```

### Step 3: Run Scorecard Calculation

```python
BASE = 3_000_000  # AU seed median
weights = {"ftv":0.30,"mpc":0.25,"ptd":0.15,"svm":0.10,"tre":0.10,"iri":0.05,"lco":0.05}
scores  = {"ftv":ftv,"mpc":mpc,"ptd":ptd,"svm":svm,"tre":tre,"iri":iri,"lco":lco}
adj = sum(weights[k] * (scores[k]/100 - 0.5) * 2 for k in weights)
scorecard_val = BASE * max(1 + adj, 0.1)
```

### Step 4: SVI-Based Valuation

```python
STAGE_BASES = {0:300_000, 1:750_000, 2:2_000_000, 3:3_500_000, 4:6_000_000, 5:12_000_000}
base = STAGE_BASES[stage]
premium = (svi_score - 100) / 100
svi_low  = base * (1 + premium * 0.7)
svi_mid  = base * (1 + premium)
svi_high = base * (1 + premium * 1.4)
```

### Step 5: Risk Factor Summation

Assess 12 factors on scale −2 to +2. Base = A$3M. Each point = ±A$250K.

Key factors to assess from startup profile:
- **FTV score < 60** → Management Risk = −1 or −2
- **TRE score < 50** → Sales/Marketing Risk = −1
- **CGH score < 50** → Funding/Capital Risk = −1
- **PTD score > 80** → Technology Risk = +1 or +2
- **LCO score > 70** → Litigation Risk = +1

### Step 6: Apply Evidence Multiplier

```python
CONFIDENCE = {0: 0.20, 1: 0.40, 2: 0.60, 3: 0.80, 4: 0.95, 5: 1.00}
confidence = CONFIDENCE[evidence_tier]
# Apply to SVI-based valuation
svi_mid_adj = svi_mid * (0.4 + confidence * 0.6)  # min 40% even with no evidence
```

### Step 7: Blend & Apply Sector Multiplier

```python
WEIGHTS_BY_STAGE = {
    (0,1): {"svi":0.30,"scorecard":0.25,"berkus":0.25,"risk":0.15,"vc":0.05},
    (2,3): {"svi":0.25,"scorecard":0.25,"berkus":0.15,"risk":0.08,"vc":0.22,"dcf":0.05},
    (4,5): {"svi":0.15,"scorecard":0.20,"berkus":0.05,"risk":0.05,"vc":0.25,"dcf":0.30},
}
# Select weight set by stage
# Blended = Σ(weight × method_mid_value)
# Final = blended × sector_multiplier × confidence_adj
```

---

## Standard Valuation Report Template

When generating a valuation report for a startup profile, include:

### Section 1: Executive Summary
- Company name, date, SVI score, stage
- Valuation range: Low / Mid / High
- Key strength (highest SVI dimension)
- Key weakness (lowest SVI dimension)
- Recommended action (1 sentence)

### Section 2: SVI Dimension Breakdown
- Table: dimension | score | weight | weighted contribution
- Radar chart data points
- Comparison to AU peer median (by stage)

### Section 3: Valuation Methods
- Table: method | low | mid | high | confidence | weight
- Final blended valuation
- Notes on methodology

### Section 4: Financial Projections (if MRR data available)
- 12-month projection (base case)
- Break-even analysis
- Unit economics: LTV, CAC, LTV:CAC, gross margin

### Section 5: Comparable Transactions
- 3–5 AU comparables at same stage
- Valuation multiple applied
- Source: AVCAL, Cut Through Venture, Startmate data

### Section 6: Action Plan
- Top 3 actions to improve SVI score
- Expected valuation impact
- Timeline

---

## Interpretation Guide

### SVI Score Ranges

| Range | Label | Valuation Implication |
|-------|-------|----------------------|
| < 80 | Weak | Concept-stage only; Berkus primary method |
| 80–100 | Developing | Below median; significant risks |
| 100–120 | Average | AU seed median range |
| 120–140 | Above Average | Strong fundamentals; fundraising ready |
| 140–160 | Strong | Top quartile; institutional investor interest |
| 160–180 | Outstanding | Top decile; premium valuation justified |
| > 180 | Exceptional | Series A ready; 2×+ premium |

### Red Flags (auto-flag in reports)

- TRE < 40 → "Pre-revenue; heavy discounting applied"
- CGH < 40 → "No external validation; capital risk noted"
- FTV < 50 → "Team risk; solo founder without advisor board"
- Evidence Tier 0–1 → "Self-declared only; confidence multiplier 0.2–0.4"
- Churn > 10% → "Retention risk; LTV significantly impacted"

### Green Flags (positive signals)

- PTD > 85 → "Production-grade product; technical moat"
- MPC > 80 → "Clear market thesis; validated demand"
- LTV:CAC > 5× → "Exceptional unit economics"
- Stage 3+ with TRE > 70 → "Revenue evidence strong"

---

## Applying to Startup Profiles in BlockID Platform

### API Integration

```typescript
// POST /api/svi/valuate
const payload = {
  userId: "user_xxx",
  startupProfileId: "profile_yyy",
  sviData: { ftv, mpc, ptd, tre, cgh, iri, lco, svm },
  financialData: { mrr, monthlyGrowth, churn, arpu, burnRate },
  marketData: { sector, tam, sam },
  evidenceTier: 1,
  generateReport: true,
}
```

### Output: Valuation Snapshot

Store in `svi_snapshots` table:
```sql
INSERT INTO svi_snapshots (
  user_id, startup_profile_id, svi_score, stage,
  val_low, val_mid, val_high,
  method_details, generated_at
) VALUES (...);
```

### Report Generation Trigger

1. User completes startup profile (all 8 SVI dimensions)
2. System runs valuation engine
3. PDF report generated and stored in data room
4. Email notification sent to founder
5. Snapshot stored for historical tracking

---

## Calibration Notes (June 2026)

- AU pre-seed median: **A$2.5M–A$4M** (AVCAL H1 2026)
- Startmate cohort median: **A$4M–A$6M** (post-selection)
- Antler AU: **A$3.5M–A$5M** (post-residency)
- Angel round (solo founder): **A$1M–A$3M**
- AI multiplier: currently **×1.5** (elevated market; may compress)

---

*BlockID Startup Index™ — Proprietary Methodology — blockid.au — Confidential*  
*Version 2.0.0 | Updated: 13 June 2026 | admin@blockid.au*
