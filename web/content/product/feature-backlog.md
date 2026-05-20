# BlockID.au Feature Backlog (RICE Scored)

> **Last updated:** 2026-05-19 (S2026-10 Day 1)
> **Owner:** CPO
> **Source:** Phase 2-6 roadmap goals, CPO KPIs, CRO quick wins, CMO growth targets

## Scoring Legend

- **Reach (R):** Users/month impacted (1-10 scale, where 10 = every active user)
- **Impact (I):** 0.25 = minimal, 0.5 = low, 1 = medium, 2 = high, 3 = massive
- **Confidence (C):** 0.5 = low (gut feel), 0.8 = medium (some data), 1.0 = high (measured)
- **Effort (E):** Person-weeks to build (0.5 = few hours, 1 = 1 week, 4 = 1 month, 8 = 2 months)
- **RICE Score** = (R x I x C) / E

---

## Full Feature Backlog

| # | Feature | Phase | R | I | C | E | RICE | Priority |
|---|---------|-------|---|---|---|---|------|----------|
| 1 | Auto-scroll to results after SVI analysis (71% drop-off fix) | 2 | 10 | 3 | 1.0 | 0.5 | 60.0 | P0 |
| 2 | Fire 10 missing analytics events (checkout_completed, svi_form_started organic, etc.) | 2 | 10 | 2 | 1.0 | 1 | 20.0 | P0 |
| 3 | Referral program (2 credits per invite, viral loop) | 3 | 7 | 2 | 0.8 | 2 | 5.6 | P1 |
| 4 | Email nurture sequences (day-1, day-3, day-7 drip with SVI data) | 2 | 8 | 1 | 1.0 | 2 | 4.0 | P1 |
| 5 | Google Analytics OAuth connector (MAU/DAU auto-import) | 2 | 5 | 2 | 0.8 | 2 | 4.0 | P1 |
| 6 | Evidence-to-SVI feedback loop (auto-rescore after upload) | 2 | 6 | 2 | 1.0 | 2 | 6.0 | P1 |
| 7 | Milestone badges system (15 badges with celebration UI) | 2 | 7 | 1 | 0.8 | 3 | 1.87 | P2 |
| 8 | "At-risk" re-engagement emails (no login 7 days trigger) | 2 | 6 | 1 | 0.8 | 1.5 | 3.2 | P1 |
| 9 | Post-analysis action cards (3 CTAs: evidence, cap table, share) | 2 | 10 | 1 | 0.8 | 1 | 8.0 | P1 |
| 10 | Evidence wizard tracking + score-boost CTA copy | 2 | 8 | 1 | 1.0 | 0.5 | 16.0 | P0 |
| 11 | Stripe revenue connector (MRR/ARR auto-import) | 2 | 3 | 3 | 0.8 | 3 | 2.4 | P2 |
| 12 | Product metrics dashboard (MAU, MRR, retention trends) | 3 | 6 | 2 | 0.8 | 4 | 2.4 | P2 |
| 13 | Dollar valuation engine (DCF/comparable hybrid) | 3 | 8 | 3 | 0.5 | 6 | 2.0 | P2 |
| 14 | Living Report auto-update (SVI report refreshes after evidence) | 2 | 5 | 2 | 0.8 | 2 | 4.0 | P1 |
| 15 | Week-over-week SVI comparison in weekly reports | 2 | 5 | 1 | 0.8 | 1.5 | 2.67 | P2 |
| 16 | GitHub OAuth connector (repo stats -> hasSourceCode) | 2 | 4 | 1 | 0.8 | 2 | 1.6 | P3 |
| 17 | Persistent cap table (versioned, audit trail) | 4 | 4 | 2 | 0.8 | 4 | 1.6 | P3 |
| 18 | Vesting schedule manager (cliff, total, timeline viz) | 4 | 3 | 2 | 0.8 | 3 | 1.6 | P3 |
| 19 | ESOP management (pool config, grant tracking) | 4 | 3 | 2 | 0.8 | 4 | 1.2 | P3 |
| 20 | Guided onboarding tooltip tour (5-step first-visit walkthrough) | 2 | 9 | 1 | 0.8 | 1.5 | 4.8 | P1 |
| 21 | Segment nurture emails by SVI score (Founding 50 personalized) | 2 | 5 | 2 | 0.8 | 1 | 8.0 | P1 |
| 22 | Full-funnel GA4 tracking (landing -> SVI -> signup -> paid) | 2 | 10 | 1 | 1.0 | 1.5 | 6.67 | P1 |
| 23 | SVI input A/B test framework (3 variants on CTA/layout) | 2 | 10 | 1 | 0.5 | 2 | 2.5 | P2 |
| 24 | Mobile-optimized SVI search experience (touch-friendly) | 2 | 4 | 1 | 0.8 | 2 | 1.6 | P3 |
| 25 | Multi-project dashboard with portfolio view | 3 | 5 | 2 | 0.8 | 4 | 2.0 | P2 |
| 26 | Data room one-click generation from Evidence Vault | 6 | 3 | 2 | 0.5 | 4 | 0.75 | P3 |
| 27 | Comparable startup benchmarking (percentile rank UI) | 3 | 6 | 2 | 0.5 | 5 | 1.2 | P3 |
| 28 | Tool-to-SVI connection ("This improved your SVI by +X") | 3 | 8 | 1 | 0.8 | 1.5 | 4.27 | P1 |
| 29 | Progress dashboard (Idea -> Validated -> MVP -> Funded visual) | 3 | 7 | 1 | 0.8 | 2 | 2.8 | P2 |
| 30 | SVI historical line chart in workspace/reports | 2 | 5 | 1 | 1.0 | 1 | 5.0 | P1 |

---

## Top 10 by RICE Score

| Rank | # | Feature | RICE | Phase | Priority |
|------|---|---------|------|-------|----------|
| 1 | 1 | Auto-scroll to results (71% drop-off fix) | 60.0 | 2 | P0 |
| 2 | 2 | Fire 10 missing analytics events | 20.0 | 2 | P0 |
| 3 | 10 | Evidence wizard tracking + score-boost CTA copy | 16.0 | 2 | P0 |
| 4 | 9 | Post-analysis action cards (3 CTAs) | 8.0 | 2 | P1 |
| 5 | 21 | Segment nurture emails by SVI score | 8.0 | 2 | P1 |
| 6 | 22 | Full-funnel GA4 tracking | 6.67 | 2 | P1 |
| 7 | 6 | Evidence-to-SVI feedback loop | 6.0 | 2 | P1 |
| 8 | 3 | Referral program (2 credits/invite) | 5.6 | 3 | P1 |
| 9 | 30 | SVI historical line chart | 5.0 | 2 | P1 |
| 10 | 20 | Guided onboarding tooltip tour | 4.8 | 2 | P1 |

---

## Sprint Assignment

| Sprint | Dates | Features | Total Effort | Theme |
|--------|-------|----------|-------------|-------|
| S2026-10 | May 19 - May 30 | #1 (auto-scroll), #2 (missing events), #10 (evidence CTA) | 2.0 weeks | Analytics foundation + quick UX wins |
| S2026-11 | Jun 2 - Jun 13 | #9 (action cards), #21 (segmented nurture), #22 (GA4 funnel), #30 (SVI chart) | 4.5 weeks | Conversion + retention basics |
| S2026-12 | Jun 16 - Jun 27 | #6 (evidence feedback loop), #20 (onboarding tour), #4 (email nurture) | 5.5 weeks | Onboarding + engagement loops |
| S2026-13 | Jun 30 - Jul 11 | #5 (GA connector), #14 (living report), #8 (re-engagement) | 5.5 weeks | Connectors + living data |
| S2026-14 | Jul 14 - Jul 25 | #3 (referral program), #7 (badges), #15 (weekly comparison) | 6.5 weeks | Viral growth + gamification |
| S2026-15 | Jul 28 - Aug 8 | #11 (Stripe connector), #28 (tool-to-SVI), #23 (A/B framework) | 6.5 weeks | Revenue data + experimentation |
| S2026-16 | Aug 11 - Aug 22 | #12 (metrics dashboard), #29 (progress dashboard) | 6.0 weeks | Phase 3 dashboards |
| S2026-17 | Aug 25 - Sep 5 | #13 (valuation engine - start), #25 (multi-project) | 10.0 weeks | Phase 3 core |
| S2026-18 | Sep 8 - Sep 19 | #13 (valuation engine - complete), #27 (benchmarking) | 6.0 weeks | Phase 3 complete |
| S2026-19+ | Sep 22+ | #16 (GitHub), #17 (cap table), #18 (vesting), #19 (ESOP), #24 (mobile), #26 (data room) | 19.0 weeks | Phase 4 equity |

---

## Notes

### Scoring Rationale

- **#1 scores highest (60.0)** because it affects every user (R=10), has massive impact on conversion (I=3), is validated by the 71% drop-off data (C=1.0), and takes only a few hours (E=0.5). Already implemented -- validate with analytics.
- **#2 scores 20.0** because without analytics events firing, we are blind to the funnel. This blocks all optimization work. High-R (every user generates events), medium impact (visibility, not direct conversion), near-zero effort.
- **#10 scores 16.0** because evidence uploads are the core engagement action and current rate is ~5%. Better CTA copy with "+10-20 pts" framing is validated by CRO analysis and takes only a few hours.
- **Phase 4+ features score lower** primarily due to higher effort and lower confidence at this stage. Re-score these when Phase 3 completes and we have real user data.

### Capacity Assumptions

- Solo developer + AI agent augmentation
- Effective capacity: ~8-10 person-weeks per sprint (2 calendar weeks)
- Sprint overload acceptable in S2026-14/15 as some features will carry over
- Effort estimates include design, implementation, testing, and deployment

### Re-scoring Triggers

Re-score the backlog when:
1. Analytics baseline is established (after #2 ships) -- real Reach data replaces estimates
2. Phase 2 is complete -- Phase 3 features get updated Confidence scores
3. Any feature takes 2x estimated Effort -- recalibrate similar features
4. User feedback contradicts Impact assumptions
