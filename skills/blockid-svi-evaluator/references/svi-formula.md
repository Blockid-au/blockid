# SVI Formula Reference (v2.0.0)

## Formula

```
totalSVI = 100 + Σ(dim_score × weight × confidenceMultiplier) + stageBonus - Σ(penalties)
```

- Base: **100**
- Clamp: **30–300**

## 8 Dimensions

| Key | Name | Weight | Focus |
|-----|------|--------|-------|
| `ftv` | Founder & Team Value | 15% | founder experience, co-founders, advisors, domain fit |
| `mpc` | Market & Problem Clarity | 18% | TAM/SAM, problem validation, customer proof |
| `ptd` | Product & Technical Depth | 12% | code quality, demo, GitHub, roadmap |
| `tre` | Traction & Revenue Evidence | 20% | MRR/ARR, customers, analytics, growth rate |
| `cgh` | Cap Table & Governance Health | 12% | equity split, vesting, SHA, board cadence |
| `iri` | Investor Readiness Index | 10% | pitch deck, data room, financial model |
| `lco` | Legal & Compliance | 8% | ABN/ASIC, IP, contracts, legal structure |
| `svm` | Strategic Vision & Moat | 5% | competitive moat, network effects, data advantage |

## Evidence Confidence Multiplier

| Level | Multiplier | Description |
|-------|-----------|-------------|
| `self_declared` | 0.20 | User states it, no proof |
| `public_url` | 0.35 | Public website or LinkedIn |
| `document_uploaded` | 0.50 | PDF/doc uploaded |
| `connected_source` | 0.75 | API/OAuth integration |
| `transaction_data` | 0.90 | Live revenue/analytics |
| `third_party_verified` | 1.00 | Audited or verified |

Default: `self_declared` (0.20)

## Stage Detection + Bonuses

| Stage | Label | Bonus |
|-------|-------|-------|
| 0 | Concept / Ideation | +0 |
| 1 | Pre-MVP / Research | +5 |
| 2 | MVP / Prototype | +10 |
| 3 | Early Traction | +15 |
| 4 | Product-Market Fit | +20 |
| 5 | Growth / Scaling | +25 |
| 6 | Expansion / Series A+ | +30 |
| 7 | Established / Corporation | +35 |

## 15 Risk Penalties

| Penalty | Impact |
|---------|--------|
| AI wrapper without moat | -15 |
| No founder information | -8 |
| Undefined or tiny market | -10 |
| Zero revenue at post-seed | -5 |
| Bad cap table signals | -12 |
| No legal structure (ABN/ASIC) | -7 |
| No product or demo | -8 |
| Regulatory red flags | -10 |
| Single founder, no co-founder | -5 |
| No traction after 12+ months | -8 |
| Overly broad market claim | -5 |
| High burn, no path to revenue | -7 |
| No IP or moat described | -6 |
| Missing investor materials | -4 |
| Compliance gaps detected | -6 |
