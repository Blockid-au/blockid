# Valuation Engine V2 — Evidence-Based Startup Valuation

## Status: DEPLOYED

## Methodology
Blends 3 academic/industry methods with stage-dependent weights:

### 1. Berkus Method (Pre-revenue, A$750K/pillar)
- 5 pillars: Sound Idea, Prototype, Quality Team, Strategic Relations, Product Rollout
- Max pre-revenue: A$3.75M
- Maps to SVI dimensions: mpc, ptd, ftv, iri+svm, tre

### 2. Scorecard Method (Bill Payne weights)
- Regional AU median pre-money × weighted dimension adjustments
- Weights: Team 30%, Market 25%, Product 15%, Competition 10%, Traction 10%, Investor 5%, Other 5%
- Base: AU regional median from Cut Through Venture 2025

### 3. Revenue Multiple (Sector-specific)
| Sector | Multiple Range | Metric |
|--------|---------------|--------|
| SaaS | 5-15x | ARR |
| Fintech | 4-12x | Revenue |
| Marketplace | 2-5x | Net Revenue |
| HealthTech | 4-10x | Revenue |
| DeepTech | 2-8x | Revenue |
| E-commerce | 1-3x | Revenue |

Adjustments: +1x per 25% growth above 50% YoY, +30% AI premium, -1x per 5% churn above 3%

## Stage Baselines (AUD, Pre-Money)
| Stage | Label | Low (P25) | Mid (P50) | High (P75) | Source |
|-------|-------|-----------|-----------|------------|--------|
| 0 | Concept | A$100K | A$300K | A$750K | Berkus |
| 1 | Validated | A$300K | A$750K | A$2.0M | Berkus + AU data |
| 2 | MVP | A$1.5M | A$3.0M | A$5.0M | AU pre-seed median |
| 3 | Traction | A$4.0M | A$7.5M | A$12.0M | AU seed median |
| 4 | Revenue | A$8.0M | A$14.0M | A$20.0M | AU Series A median |
| 5 | Growth | A$14.0M | A$22.0M | A$35.0M | AU late Series A |
| 6 | Scale | A$35.0M | A$60.0M | A$100.0M | AU Series B |
| 7 | Corporation | A$80.0M | A$150.0M | A$300.0M | AU Series C+ |

## Data Sources
- Cut Through Venture 2024-2025 (AU funding data)
- Carta Pre-Seed/Seed 2025 (global benchmarks, AU discount 0.55-0.70x)
- AVCAL / ScaleSuite funding reports
- AU SAFE cap data (Blackbird, AirTree, Square Peg)
- SaaS Capital 2025 (private SaaS multiples)
- Finro Fintech Multiples 2025

## OKR for Scoring Agent

### Objective: Make SVI valuation estimates accurate to ±30% of actual fundraise outcomes

**KR1**: Validate against 20+ real AU startup raises (compare SVI estimate vs actual pre-money)
- [ ] Collect 20 public AU startup fundraise data points
- [ ] Run SVI scoring on each startup's public data
- [ ] Compare estimateValuation output vs actual raise valuation
- [ ] Adjust baselines/weights if systematic bias found

**KR2**: Add sector-specific benchmarking
- [ ] Track which sectors produce higher/lower SVI-to-valuation ratios
- [ ] Create sector modifier library (health, fintech, SaaS, marketplace)
- [ ] Auto-detect sector from startup description

**KR3**: Improve dimension scoring accuracy
- [ ] Weight dimensions more heavily that correlate with actual valuations
- [ ] Add revenue/growth data as direct inputs (not just text signals)
- [ ] Evidence verification increases confidence + tightens valuation band

**KR4**: Continuous model calibration
- [ ] Weekly: compare new raises against SVI predictions
- [ ] Monthly: adjust baselines if AU market median shifts
- [ ] Quarterly: re-research market multiples via R&D agent
