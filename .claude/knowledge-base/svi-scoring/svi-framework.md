# SVI Scoring Framework — BlockID C-Level Agent Knowledge

## Formula
```
SVI_t = Base(100) + Σ(Dimension_i × Weight_i × ConfidenceMultiplier_i) - RiskPenalties
```

## 8 Dimensions & Weights

| # | Dimension | Weight | Key Signals |
|---|-----------|--------|-------------|
| 1 | Founder & Team Value (FTV) | 15% | Experience, team size, domain fit, advisors |
| 2 | Market & Problem Clarity (MPC) | 18% | TAM/SAM, problem validation, customer proof |
| 3 | Product & Technical Depth (PTD) | 12% | Code quality, GitHub activity, demo, roadmap |
| 4 | Traction & Revenue Evidence (TRE) | 20% | Users, analytics, MRR/ARR, customer proof |
| 5 | Cap Table & Governance Health (CGH) | 12% | Equity split, vesting, SHA, board cadence |
| 6 | Investor Readiness Index (IRI) | 10% | Pitch deck, data room, financial model |
| 7 | Legal & Compliance (LCO) | 8% | ASIC, ABN, IP protection, contracts |
| 8 | Strategic Vision & Moat (SVM) | 5% | Competitive moat, network effect, data advantage |

## Evidence Confidence Multipliers
- 0.20: Self-declared (text, checkboxes)
- 0.35: Public URL (website, LinkedIn)
- 0.50: Document uploaded (PDF, cap table)
- 0.75: Connected source (GitHub OAuth, GA API)
- 0.90: Transaction verified (Stripe revenue, invoices)
- 1.00: Third-party verified (audit, ASIC, investor letter)

## Risk Penalties
- AI wrapper without moat: -15
- No founder background: -8
- Undefined market: -10
- No cap table: -12
- Unverified claims only: -8

## Stage Benchmarks

| Stage | SVI Range | Investor Readiness |
|-------|-----------|-------------------|
| Raw Idea | 0-25 | Too early |
| Validated Idea | 25-45 | Angel interest possible |
| MVP | 45-60 | Pre-seed ready |
| Early Traction | 60-75 | Seed ready |
| Revenue | 75-85 | Series A ready |
| Growth | 85-95 | VC fundable |
| Scale | 95-100 | Institutional grade |

## BlockID.au Reference Score: 68/100 (June 2026)
- FTV: 72/100 — strong technical founder
- MPC: 71/100 — clear AU market
- PTD: 74/100 — MVP quality, live site
- TRE: 45/100 — pre-revenue, 28 users
- CGH: 50/100 — no ESOP yet
- IRI: 58/100 — data room 47% complete
- LCO: 68/100 — ASIC registered
- SVM: 81/100 — AU identity verification moat

## Quick Upgrade Actions (by score impact)
1. Launch ESOP pool → +8 SVI
2. First paid customer → +5 SVI
3. Hire co-founder/advisor → +6 SVI
4. Complete data room → +4 SVI
5. Hit 100+ users → +3 SVI
