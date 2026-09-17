---
version: "A1"
kind: "appendix"
date: 2026-09-17
entity: "Auschain PTY LTD"
acn: "659 615 111"
brand: "Startup Value Index — Appendix"
byline: "by BlockID"
ask: "reference material — not part of the ask"
audience: "Australian pre-seed investors — backup detail for deck v3"
positioning: "Six reference slides behind the pitch: rubric weights, competitors, unit economics, ARR scenarios, backtest v0, use of funds."
render: "web/scripts/generate-pitch-deck-v3.ts --appendix → web/public/pitch/SVI-Pitch-Appendix-2026-09.pptx"
feedback: "docs/plans/g14-investor-feedback-2026-09-16/00-pitch-feedback.md"
---

# Startup Value Index — Appendix to deck v3 (2026-09-17)

Backup detail for `pitch-deck-v3.md`, in the same one-`yaml`-block-per-slide format. Table rows are written as a block list of maps (not flow `[a, b, c]` lists) because the deck's dependency-free yaml-subset parser splits flow-list elements on every raw comma — thousands separators like `56,880` would otherwise be cut in half. These six slides are handed out, not spoken — they carry no 3-minute-cut allocation and no per-slide word ceiling, but every number still needs a home in `## Provenance` and the same wording guardrails from the main deck apply: the doctoral credential is always written "DBA", no inflated comparables count, no unverified customer-trust claims, no sign-up-restriction language, no reference to the marketing-only entity retired earlier this year. Entity Auschain PTY LTD, Australia-only.

## Slide 1 — Rubric detail: 8 dimensions, 13 criteria

```yaml
title: "Rubric detail: 8 dimensions, 13 criteria"
sub: Every weight and owner agent behind the score
hero:
  type: table
  description: Two tables — the 8 SVI dimension weights and the 13 evaluation-criteria weights, each with its primary owner agent
  data:
    tables:
      - heading: "8 SVI dimensions — dimension-owners.ts (weights sum to 100)"
        columns: [Dim, Dimension, Weight, Owner]
        rows:
          - dim: TRE
            name: Traction & Revenue Evidence
            weight: "20"
            owner: CRO
          - dim: MPC
            name: Market Pull & Category
            weight: "18"
            owner: CMO
          - dim: FTV
            name: Founder & Team Value
            weight: "15"
            owner: CHRO
          - dim: PTD
            name: Product & Tech Depth
            weight: "12"
            owner: CTO
          - dim: CGH
            name: Capital & Governance Health
            weight: "12"
            owner: CFO
          - dim: IRI
            name: Investor Readiness Index
            weight: "10"
            owner: CLO
          - dim: LCO
            name: Legal & Compliance
            weight: "8"
            owner: CLO
          - dim: SVM
            name: Strategic Vision & Moat
            weight: "5"
            owner: CEO
      - heading: "13 evaluation criteria — evaluation-criteria.ts (weights sum to 100)"
        columns: [Criterion, Weight, Primary dim, Owner]
        rows:
          - criterion: Idea & Innovation
            weight: "10"
            dim: MPC
            owner: CPO
          - criterion: Market Opportunity
            weight: "12"
            dim: MPC
            owner: CMO
          - criterion: Founder Profile
            weight: "8"
            dim: FTV
            owner: CHRO
          - criterion: Code & Git Repository
            weight: "6"
            dim: PTD
            owner: CTO
          - criterion: Website & Digital Presence
            weight: "5"
            dim: PTD
            owner: CMO
          - criterion: Team Composition
            weight: "8"
            dim: FTV
            owner: CHRO
          - criterion: Customer Base & Traction
            weight: "10"
            dim: TRE
            owner: CRO
          - criterion: Go-to-Market Strategy
            weight: "8"
            dim: MPC
            owner: CMO
          - criterion: Key Documents
            weight: "7"
            dim: IRI
            owner: CLO
          - criterion: Data Room
            weight: "5"
            dim: IRI
            owner: CLO
          - criterion: Team Structure & Governance
            weight: "5"
            dim: FTV
            owner: CHRO
          - criterion: Product Roadmap
            weight: "6"
            dim: SVM
            owner: CPO
          - criterion: Revenue & Unit Economics
            weight: "10"
            dim: TRE
            owner: CFO
    note: Two independent rubrics scoring the same evidence — each sums to 100.
bullets: []
speaker: Reference slide — the full weight and ownership table behind every score.
clusters: [C1]
sources:
  - web/src/lib/report-pipeline/dimension-owners.ts (DIMENSION_OWNERS — 8 entries, weights 20/18/15/12/12/10/8/5, sum 100)
  - web/src/lib/evaluation-criteria.ts (CRITERION_KEYS — 13 entries, weights 10/12/8/6/5/8/10/8/7/5/5/6/10, sum 100)
```

## Slide 2 — 12 comparables and their price anchors

```yaml
title: "12 comparables and their price anchors"
sub: One representative price point each — not a like-for-like feature match
hero:
  type: table
  description: 12 of the researched comparables (Appendix A superset) with one price anchor each, AUD unless noted
  data:
    tables:
      - heading: Comparable products
        columns: [Product, Category, Price anchor]
        rows:
          - product: Carta
            category: Cap table / fund admin
            price: US$2,988/yr entry tier (25 stakeholders free)
          - product: Equidam
            category: Founder-side valuation
            price: US$412 Advanced tier
          - product: Valutico
            category: Advisor valuation
            price: US$7,000/yr licence
          - product: Crunchbase Pro
            category: Data / search
            price: US$99/mo (7-day trial)
          - product: CB Insights
            category: Data / Mosaic score
            price: US$30,000/yr+ (10-day trial, no card)
          - product: PitchBook
            category: Data / comps
            price: US$12,000/seat/yr+
          - product: Affinity
            category: Deal-flow CRM
            price: US$2,000/user/yr+
          - product: Harmonic.ai
            category: AI sourcing
            price: US$20,000/seat/yr+ (3-seat minimum)
          - product: Kruncher
            category: AI diligence + CRM
            price: US$499/mo (100 credits)
          - product: F6S
            category: Accelerator management
            price: free basic; enterprise from €1,000/mo
          - product: Dealum
            category: Angel / accelerator management
            price: US$39/mo (10-day trial)
          - product: Techboard
            category: AU funding data
            price: A$1,625/user/yr + GST
    note: None price a single verdict the way the A$3 report does — Kruncher's per-analysis credit metering is the closest analogue.
bullets: []
speaker: None of the twelve price a single verdict the way we do.
clusters: [C3]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md Appendix A (competitor & comparable table, web research 2026-09-10, FX A$1 ≈ US$0.65)
```

## Slide 3 — Unit economics: the A$3 report

```yaml
title: "Unit economics: the A$3 report"
sub: Net margin at three AI-cost scenarios, ex-GST
hero:
  type: table
  description: GST/Stripe waterfall on the A$3 charge, then three AI-COGS scenarios and the resulting gross margin
  data:
    tables:
      - heading: "A$3 Trust BizReport — waterfall"
        columns: [Line, Amount]
        rows:
          - line: Charge (inc-GST)
            amount: A$3.00
          - line: GST component (÷1.1)
            amount: A$0.27
          - line: Net revenue, ex-GST
            amount: A$2.73
          - line: Stripe fee — AU domestic card, 1.75% + A$0.30
            amount: A$0.35
          - line: Net after Stripe, ex-GST
            amount: A$2.38
      - heading: AI COGS scenarios and resulting margin
        columns: [Scenario, AI COGS, Net margin, "GM %"]
        rows:
          - scenario: Observed floor — DeepInfra free-model chain
            cogs: A$0.001
            margin: A$2.38
            gm: "87%"
          - scenario: Expected — credits.ts blended run
            cogs: A$0.80
            margin: A$1.58
            gm: "58%"
          - scenario: Worst-case cap — enhanced_report_standard, paid fallback
            cogs: A$1.20
            margin: A$1.18
            gm: "43%"
    note: Subscription credits bind on the same enhanced_report_standard cost — worst-case grants hold ≥70% GM at full redemption; expected-cost GM runs ≈80%.
bullets: []
speaker: Three dollars in — forty-three cents of margin at the worst case, eighty-seven at the observed floor.
clusters: [C6]
sources:
  - web/src/lib/credits.ts:265-284 (enhanced_report_standard A$0.40-1.20/run, expected ~A$0.80/run; worst-case grant math ≥70% GM at the A$29/69/299 tiers)
  - web/content/pitch/pitch-deck-v3.md Slide 6 Provenance (COGS ~A$0.001/report, DeepInfra free-model chain)
  - Stripe Australia published pricing, domestic card rate 1.75% + A$0.30, applied to a A$3.00 charge
  - A New Tax System (Goods and Services Tax) Act 1999 — 10% GST, inc-GST ÷ 1.1 = ex-GST
```

## Slide 4 — ARR bottom-up: bear, base, bull

```yaml
title: "ARR bottom-up: bear, base, bull"
sub: Eight SKUs, month 12 and month 24, units and dollars
hero:
  type: table
  description: The full plan §3.3 ARR bottom-up table by SKU, reproduced verbatim for reference
  data:
    tables:
      - heading: "Recurring ARR by SKU, AUD (plan §3.3, Appendix D of G12)"
        columns: [SKU, Universe, "Bear M12", "Base M12", "Base M24", "Bull M24"]
        rows:
          - sku: Scout
            universe: ~1,200 angels
            bear12: 60 → 56,880
            base12: 120 → 113,760
            base24: 250 → 237,000
            bull24: 400 → 379,200
          - sku: Firm
            universe: 4,345 firms
            bear12: 10 → 17,880
            base12: 25 → 44,700
            base24: 60 → 107,280
            bull24: 120 → 214,560
          - sku: Program
            universe: ~400 orgs
            bear12: 10 → 41,880
            base12: 20 → 83,760
            base24: 40 → 167,520
            bull24: 60 → 251,280
          - sku: Fund
            universe: ~38
            bear12: 1 → 11,988
            base12: 4 → 47,952
            base24: 8 → 95,904
            bull24: 12 → 143,856
          - sku: Cohort 25
            universe: "56"
            bear12: 3 → 15,000
            base12: 8 → 40,000
            base24: 15 → 75,000
            bull24: 25 → 125,000
          - sku: Cohort 100
            universe: ~10
            bear12: "0"
            base12: 2 → 30,000
            base24: 4 → 60,000
            bull24: 6 → 90,000
          - sku: Intake link
            universe: ~25
            bear12: 2 → 5,976
            base12: 5 → 14,940
            base24: 10 → 29,880
            bull24: 15 → 44,820
          - sku: Index API
            universe: ~20
            bear12: 1 → 3,588
            base12: 3 → 10,764
            base24: 6 → 21,528
            bull24: 10 → 35,880
          - sku: Recurring ARR
            universe: "—"
            bear12: A$153K
            base12: A$386K
            base24: A$794K
            bull24: A$1.28M
    note: Bear/Base counts are unit sales at month 12; Base/Bull at month 24 — same table as pitch-deck-v3.md Slide 6 and 11 sources.
bullets: []
speaker: Base case — three hundred eighty-six thousand at month twelve, seven hundred ninety-four thousand at month twenty-four.
clusters: [C2]
sources:
  - docs/pricing-upgrade-plan-2026-07-16.md §v4 "ARR bottom-up AU" table (plan §3.3, Appendix D of G12)
```

## Slide 5 — Backtest v0: rank calibration only

```yaml
title: "Backtest v0: rank calibration only"
sub: A live number, not a valuation model — caveats verbatim below
hero:
  type: table
  description: Headline N / rho / CI and the by-quartile round-size medians from svi-backtest-latest.json
  data:
    tables:
      - heading: Headline numbers
        columns: [Metric, Value]
        rows:
          - metric: N (scorable rows)
            value: "49"
          - metric: rho pooled, round size
            value: 0.762 (CI 0.5612-0.8757)
          - metric: rho pooled, valuation
            value: 0.9366 (CI 0.8118-0.9747)
          - metric: Rows with a next round known
            value: "13"
          - metric: Bootstrap resamples per CI
            value: "1,000"
      - heading: By SVI quartile — round size, AUD
        columns: [Quartile, "SVI range", n, "Median round"]
        rows:
          - quartile: Q1, lowest
            range: 100-116
            n: "10"
            median: A$8,250,000
          - quartile: Q2
            range: 118-128
            n: "11"
            median: A$50,000,000
          - quartile: Q3
            range: 129-141
            n: "10"
            median: A$47,500,000
          - quartile: Q4, highest
            range: 142-156
            n: "10"
            median: A$147,500,000
    note: Caveats — survivorship, hand-curated profiles, small N, rank-only claim, source-table fidelity, mixed stage labels — quoted verbatim in Provenance below.
bullets: []
speaker: Forty-nine rounds, rank-only, and the caveats matter more than the headline number.
clusters: [C6]
sources:
  - web/content/reports/svi-backtest-latest.json (generated_at 2026-09-17T00:07:42.936Z, git_sha 4395dcf60, svi_version 2.1.0, claim rank_calibration_only)
```

## Slide 6 — Use of funds, milestones, pre-money

```yaml
title: "Use of funds, milestones, pre-money"
sub: Same numbers as deck v3 Slide 11, standalone reference form
hero:
  type: table
  description: Use-of-funds split, month-12 milestones and round terms — reproduced from Slide 11
  data:
    tables:
      - heading: "Use of funds — A$500K"
        columns: [Bucket, Amount, Share]
        rows:
          - bucket: Commercial co-founder + engineering
            amount: A$250K
            share: "50%"
          - bucket: Evaluator GTM
            amount: A$140K
            share: "28%"
          - bucket: Trust + data
            amount: A$110K
            share: "22%"
      - heading: Month-12 milestones
        columns: [When, What]
        rows:
          - when: M3
            what: Co-founder hired; 5 pilots running; feedback letters live
          - when: M6
            what: Intake links live; 300 evaluator sign-ups; A$5K MRR
          - when: M12
            what: 10 Programs, 3 Cohort 25, 2 Funds, 5 Intake links, 500 evaluator sign-ups, backtest published, A$10K MRR floor
      - heading: Round terms
        columns: [Term, Value]
        rows:
          - term: Pre-money range
            value: A$2.5-4.0M
          - term: SAFE cap
            value: A$3.5M
          - term: Discount
            value: "20%"
          - term: Runway
            value: ~18 months
    note: Identical figures to deck v3 Slide 11 — repeated here as a standalone leave-behind page.
bullets: []
speaker: The same five-hundred-thousand-dollar plan as Slide 11, without the animation.
clusters: [C2, C9]
sources:
  - web/content/pitch/pitch-deck-v3.md Slide 11 (use of funds, milestones, pre-money — plan §7 F-1/F-2, §2.2, §4; web/src/lib/au-comparable-raises.ts)
```

## 3-minute cut

This appendix is reference material handed out alongside the pitch, not part of the timed 3-minute cut — see `pitch-deck-v3.md` for that script.

### Script

Not applicable — appendix slides are read, not spoken.

## Provenance

Every number that appears in a slide title, sub-line, bullet or hero data is listed here with the file or URL it was confirmed against. Tables are reproduced verbatim from their source where practical so every cell value is traceable at a glance.

### Slide 1 — rubric weights (dimension-owners.ts / evaluation-criteria.ts)

| Dim | Weight | Owner |
|---|---|---|
| TRE | 20 | CRO |
| MPC | 18 | CMO |
| FTV | 15 | CHRO |
| PTD | 12 | CTO |
| CGH | 12 | CFO |
| IRI | 10 | CLO |
| LCO | 8 | CLO |
| SVM | 5 | CEO |

8 dimension rows, weights sum to 100 (`web/src/lib/report-pipeline/dimension-owners.ts` `DIMENSION_OWNERS`).

| Criterion | Weight | Primary dim | Owner |
|---|---|---|---|
| Idea & Innovation | 10 | MPC | CPO |
| Market Opportunity | 12 | MPC | CMO |
| Founder Profile | 8 | FTV | CHRO |
| Code & Git Repository | 6 | PTD | CTO |
| Website & Digital Presence | 5 | PTD | CMO |
| Team Composition | 8 | FTV | CHRO |
| Customer Base & Traction | 10 | TRE | CRO |
| Go-to-Market Strategy | 8 | MPC | CMO |
| Key Documents | 7 | IRI | CLO |
| Data Room | 5 | IRI | CLO |
| Team Structure & Governance | 5 | FTV | CHRO |
| Product Roadmap | 6 | SVM | CPO |
| Revenue & Unit Economics | 10 | TRE | CFO |

13 criteria rows, weights sum to 100 (`web/src/lib/evaluation-criteria.ts` `CRITERION_KEYS`).

### Slide 2 — comparable price anchors (`docs/plans/evaluator-traction-2026-09-10.md` Appendix A, web research 2026-09-10, FX A$1 ≈ US$0.65)

| Product | Price anchor |
|---|---|
| Carta | US$2,988/yr entry tier (25 stakeholders free) |
| Equidam | US$412 Advanced tier |
| Valutico | US$7,000/yr licence |
| Crunchbase Pro | US$99/mo (7-day trial) |
| CB Insights | US$30,000/yr+ (10-day trial, no card) |
| PitchBook | US$12,000/seat/yr+ |
| Affinity | US$2,000/user/yr+ |
| Harmonic.ai | US$20,000/seat/yr+ (3-seat minimum) |
| Kruncher | US$499/mo (100 credits) |
| F6S | free basic; enterprise from €1,000/mo |
| Dealum | US$39/mo (10-day trial) |
| Techboard | A$1,625/user/yr + GST |

### Slide 3 — unit economics on the A$3 report

| Number | Source | Note |
|---|---|---|
| 3.00 · 0.27 · 2.73 | GST math: A$3.00 charge ÷ 1.1 = A$2.7273 ex-GST, rounded to A$2.73; GST component A$0.27 | A New Tax System (GST) Act 1999, 10% rate |
| 1.75 · 0.30 · 0.35 | Stripe Australia published pricing — domestic card rate 1.75% + A$0.30; on A$3.00 that is 0.0525 + 0.30 ≈ A$0.35 | public rate card, not repo-sourced |
| 1.1 | GST divisor (inc-GST ÷ 1.1 = ex-GST) | 10% GST |
| 2.38 | Net after Stripe, ex-GST: 2.73 − 0.35 | derived |
| 0.001 | AI COGS observed floor, DeepInfra free-model chain | `web/content/pitch/pitch-deck-v3.md` Slide 6 Provenance |
| 0.80 · 1.58 · 58 | Expected AI COGS ≈A$0.80/run (credits.ts); net margin 2.38 − 0.80 = 1.58; GM 1.58 ÷ 2.73 ≈ 58% | `web/src/lib/credits.ts:265-284` |
| 1.20 · 1.18 · 43 | Worst-case AI COGS cap A$1.20/run (enhanced_report_standard, paid-model fallback); net margin 2.38 − 1.20 = 1.18; GM 1.18 ÷ 2.73 ≈ 43% | `web/src/lib/credits.ts:265-284` |
| 87 | GM at the observed floor: 2.38 ÷ 2.73 ≈ 87% | derived |
| 70 · 80 | Subscription credit grants hold ≥70% GM at full redemption (A$29/69/299 tiers); ≈80% GM at the expected A$0.80/run cost | `web/src/lib/credits.ts:265-284` |

### Slide 4 — ARR bottom-up by SKU (`docs/pricing-upgrade-plan-2026-07-16.md` §v4 "ARR bottom-up AU" — plan §3.3 / Appendix D of G12) — reproduced verbatim

| SKU | Universe | Bear M12 | Base M12 | Base M24 | Bull M24 |
|---|---|---|---|---|---|
| Scout | ~1,200 angels | 60 → 56,880 | 120 → 113,760 | 250 → 237,000 | 400 → 379,200 |
| Firm | 4,345 firms | 10 → 17,880 | 25 → 44,700 | 60 → 107,280 | 120 → 214,560 |
| Program | ~400 orgs | 10 → 41,880 | 20 → 83,760 | 40 → 167,520 | 60 → 251,280 |
| Fund | ~38 | 1 → 11,988 | 4 → 47,952 | 8 → 95,904 | 12 → 143,856 |
| Cohort 25 | 56 | 3 → 15,000 | 8 → 40,000 | 15 → 75,000 | 25 → 125,000 |
| Cohort 100 | ~10 | 0 | 2 → 30,000 | 4 → 60,000 | 6 → 90,000 |
| Intake link | ~25 | 2 → 5,976 | 5 → 14,940 | 10 → 29,880 | 15 → 44,820 |
| Index API | ~20 | 1 → 3,588 | 3 → 10,764 | 6 → 21,528 | 10 → 35,880 |
| Recurring ARR | — | A$153K | A$386K | A$794K | A$1.28M |

### Slide 5 — backtest v0 (`web/content/reports/svi-backtest-latest.json`, generated_at 2026-09-17T00:07:42.936Z, git_sha 4395dcf60)

| Metric | Value |
|---|---|
| N (scorable rows) | 49 |
| rho pooled, round size | 0.762 (CI 0.5612 to 0.8757) |
| rho pooled, valuation | 0.9366 (CI 0.8118 to 0.9747) |
| Rows with a next round known | 13 |
| Bootstrap resamples per CI | 1,000 |

| Quartile | SVI range | n | Median round (AUD) |
|---|---|---|---|
| Q1 (lowest) | 100–116 | 10 | 8,250,000 |
| Q2 | 118–128 | 11 | 50,000,000 |
| Q3 | 129–141 | 10 | 47,500,000 |
| Q4 (highest) | 142–156 | 10 | 147,500,000 |

Caveats, quoted **verbatim** from `svi-backtest-latest.json` `caveats[]`:

1. "Survivorship: every row in this set raised. It says nothing about startups that pitched and did not raise, so ρ cannot be read as predictive power; v1 adds a control group after S40."
2. "Hand-curated profiles: each pre-raise profile was written by a curator from public sources as of the raise, not from the founder's own evidence. Fields with no public fact were left at the engine's no-evidence default, which is why most rows score below the live median for their stage."
3. "N is small (49 scorable rows). Stage buckets with fewer than 5 rows report no ρ (pre-seed, series-c, unicorn); every interval is a percentile bootstrap of 1,000 seeded resamples and is wide."
4. "Rank-only claim: ρ measures whether a higher SVI went with a larger round or valuation inside this set. It is not a valuation model, not a prediction of any single startup's round, and not financial advice."
5. "Source figures are taken as written from the two hand-entered comparable tables (AUD approximations near the announcement date). Where the two tables disagree the row notes it; nothing was corrected or invented, and a missing figure stays null."
6. "Stage labels follow the source tables — 'Series B' is a 'Series B or later' bucket in one of them — so within-stage results mix lettered rounds."

### Slide 6 — use of funds, milestones, pre-money (`web/content/pitch/pitch-deck-v3.md` Slide 11, plan §7 F-1/F-2, §2.2, §4)

| Item | Value |
|---|---|
| Commercial co-founder + engineering | A$250K (50%) |
| Evaluator GTM | A$140K (28%) |
| Trust + data | A$110K (22%) |
| M3 | Co-founder hired; 5 pilots running; feedback letters live |
| M6 | Intake links live; 300 evaluator sign-ups; A$5K MRR |
| M12 | 10 Programs, 3 Cohort 25, 2 Funds, 5 Intake links, 500 evaluator sign-ups, backtest published, A$10K MRR floor |
| Pre-money range | A$2.5–4.0M |
| SAFE cap | A$3.5M |
| Discount | 20% |
| Runway | ~18 months |

Numbers deliberately **not** on any appendix slide: user counts, any comparables count beyond the 12 chosen for Slide 2 (the curated superset is not re-totalled here), grants/programs counts, Stripe charge counts.
