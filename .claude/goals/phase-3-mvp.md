# Phase 3: MVP & Valuation — PLANNED (Q4 2026)

## Goal: Track product metrics and evolve SVI into MVP Value Index

### Sub-goal 3.1: Product Metrics Tracking
- [x] Metrics input form (monthly form with 15 fields + notes)
- [x] startup_metrics database table (migration 0038 applied)
- [x] Auto-import from OAuth (cdo-metrics-auto-import cron task from GitHub) (GitHub, Analytics, Stripe)
- [x] Metrics dashboard with trends (MetricsDashboard + history table)
- **Acceptance:** Founder can see MAU, MRR, retention over time

### Sub-goal 3.2: MVP Value Index
- [x] Metric-aware SVI (computeMetricsBonus 0-50 pts from MRR/users/churn/NPS) (PTD, TRE use real data)
- [x] SVI v3: Base SVI + Metrics Bonus (metricsBonus param in computeSVI) (0-50 points)
- [x] Stage-appropriate benchmarks (SVI_BENCHMARKS per stage + valuation baselines per stage)
- **Acceptance:** SVI automatically incorporates connected product metrics

### Sub-goal 3.3: Comparable Startup Benchmarking
- [x] Benchmark data model (SVI_BENCHMARKS per stage in svi-analysis.ts + valuation baselines) (anonymized sector/stage data)
- [x] Percentile rank (calcPercentileRank in svi-analysis.ts, displayed in report)
- [x] AI comparable analysis (competitive research auto-injected + valuation comparables)
- **Acceptance:** User sees "Your startup is in the 75th percentile for your stage"