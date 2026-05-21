# Credit Charging Model — AI Evidence Analysis & Full Reports

## Goal
Implement a comprehensive credit-based charging model where every user interaction
with AI analysis costs credits, proportional to complexity. Evidence items get
"Analyze with BlockID AI" buttons, dimension-specific deep dives are available,
and paid users get unlimited-length reports.

## Credit Pricing

### Evidence Analysis Tiers
| Feature Key | Credits | Description |
|---|---|---|
| evidence_scan | 0.10 | Quick validation, authenticity check |
| evidence_analyze | 0.50 | Standard: extract signals, map dimensions, gaps |
| evidence_deep_dive | 1.50 | Comprehensive: benchmarking, roadmap, investor view |

### Dimension Analysis
| Feature Key | Credits | Dimension |
|---|---|---|
| dim_ftv_analysis | 0.75 | Founder & Team |
| dim_mpc_analysis | 0.75 | Market & Problem |
| dim_ptd_analysis | 0.75 | Product & Technical |
| dim_tre_analysis | 1.00 | Traction & Revenue |
| dim_cgh_analysis | 0.75 | Cap Table & Governance |
| dim_iri_analysis | 0.75 | Investor Readiness |
| dim_lco_analysis | 0.50 | Legal & Compliance |
| dim_svm_analysis | 0.75 | Strategic Vision & Moat |

### Full Reports (no page limit for paid users)
| Feature Key | Credits | Output |
|---|---|---|
| full_report_standard | 2.00 | All 8 dimensions, 2000+ words |
| full_report_premium | 5.00 | Investor memo, financial projections, 5000+ words |

## Architecture
- DB table: `evidence_analyses` stores per-evidence AI analysis results
- API: `/api/evidence/analyze` — tiered analysis endpoint
- API: `/api/svi/full-report` — comprehensive report (no page limit)
- API: `/api/svi/dimension-analyze` — dimension-specific deep dive
- UI: `AnalyzeTierModal` — tier selection with credit cost display
- UI: "Analyze with BlockID AI" button on each evidence item
- Auto-rescore after each analysis

## Status: In Progress