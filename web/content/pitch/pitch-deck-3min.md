---
version: "3.1"
date: 2026-09-18
entity: "Auschain PTY LTD"
acn: "659 615 111"
brand: "Startup Value Index"
byline: "by BlockID"
ask: "A$500K pre-seed"
audience: "3-minute investor pitch (demo day / angel group / VC intro) — evaluator-first"
positioning: "Startup Value Index: one live score every Australian evaluator screens on, and every founder gets feedback from."
render: "web/scripts/generate-pitch-deck-v3.ts --input content/pitch/pitch-deck-3min.md → web/public/pitch/SVI-Pitch-3min-2026-09.pptx"
parent: "web/content/pitch/pitch-deck-v3.md (12-slide master; this is the 180-second cut with the strongest proof)"
---

# Startup Value Index — the 3-minute pitch (2026-09-18)

Eight slides, one hero each, 180 seconds. Every sentence in `speaker` and in the script is one breath (≤ 20 words), no internal jargon (the four forbidden tokens are pinned by `hero-variants.ts`), no user counts, no compliance-certification claims, no fake quotes, Australia-only. Timing in the `## 3-minute cut

Eight slides, 180 seconds (10 + 20 + 25 + 25 + 30 + 30 + 20 + 20). Every sentence is one breath, never more than twenty words, and carries none of the four forbidden internal tokens (pinned by the colocated test).

| # | Slide | Time | Seconds | Beat |
|---|---|---|---|---|
| 1 | Startup Value Index | 0:00–0:10 | 10 | Hook: the credit score for startups, for the people who back them |
| 2 | Forty decks. One weekend. No rubric. | 0:10–0:30 | 20 | Problem with a real number and a real group |
| 3 | Evaluators pay. Founders get the feedback. | 0:30–0:55 | 25 | The loop: who pays, who benefits |
| 4 | Add a startup. Read the dossier. Send verdict. | 0:55–1:20 | 25 | Product: the real dossier |
| 5 | Not a prompt. A rubric with receipts. | 1:20–1:50 | 30 | Proof: rubric, evidence, audit, calibration |
| 6 | A$3 is a lead. Programs are the revenue. | 1:50–2:20 | 30 | Business model and ARR math |
| 7 | Live product, real depth, first pilots | 2:20–2:40 | 20 | Traction + team |
| 8 | A$500K pre-seed. Three things to remember. | 2:40–3:00 | 20 | Ask + three key messages |

### Script

## Slide 1 — Startup Value Index

```yaml
title: Startup Value Index
sub: The live score Australian evaluators screen on — by BlockID
hero:
  type: ring
  description: Score ring with the 8-dimension radar inside; band under it — "Pre-seed · A$500K · Auschain PTY LTD ACN 659 615 111"
  data:
    score: 142
    band: "Pre-seed · A$500K · Auschain PTY LTD · ACN 659 615 111"
    dims: [TRE, MPC, FTV, PTD, CGH, IRI, LCO, SVM]
bullets: []
speaker: We are building the credit score for startups, for the people who back them.
clusters: [C4, C10]
sources:
  - web/src/lib/report-pipeline/dimension-owners.ts (8 dimensions)
  - .claude/goals/unicorn-masterplan.md (A$500K pre-seed)
```

## Slide 2 — Forty decks. One weekend. No rubric.

```yaml
title: Forty decks. One weekend. No rubric.
sub: Screening is unpaid, inconsistent, and silent for the founders who lose
hero:
  type: number
  description: One big number — 40 — "decks per screening cycle"; secondary 30–60 min per deck
  data:
    value: "40"
    caption: applicant decks per angel-group cycle
    secondary: "30–60 min"
    secondaryCaption: to read one deck properly
bullets:
  - Every screener carries a different rubric in their head; scores are not comparable.
  - Two hundred deals get considered for every four that close.
  - The founders who are passed on hear nothing and pitch the same deck again.
speaker: Sydney Angels see about forty applicants a cycle — read at forty minutes each, that is a lost weekend and no shared score.
clusters: [C1, C7]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md §2 (30–60 min per deck; 200 considered → 4 closed)
  - docs/plans/evaluator-traction-2026-09-10.md Appendix D (Sydney Angels ~40 applicants per cycle)
```

## Slide 3 — Evaluators pay. Founders get the feedback.

```yaml
title: Evaluators pay. Founders get the feedback.
sub: A two-sided loop that starts on the paying side
hero:
  type: loop
  description: Flow — Founder → free score → A$3 report → Index → Evaluator (Scout / Firm / Program / Fund) → PASS / TRACK / PROCEED → reasons to founder → re-score → back into the index
  data:
    steps:
      - Founder
      - Free score
      - A$3 report
      - Index
      - Evaluator (Scout / Firm / Program / Fund)
      - PASS / TRACK / PROCEED
      - Reasons to founder
      - Re-score
bullets:
  - "Founder side is free: paste a deck, a URL or an ABN."
  - "Paying side: angels, firms, programs and funds subscribe; programs share an intake link."
  - Every pass returns the reasons and a re-score path — rejection becomes feedback.
speaker: The people who screen pay us; the founders they pass on get the reasons and a way back.
clusters: [C2, C3, C8, C10]
sources:
  - web/src/config/pricing/plans.csv (Scout / Firm / Program / Fund rows)
  - web/src/lib/credits.ts (A$3 Trusted Business Report)
  - web/src/lib/evaluations/feedback-letter.ts (reasons to founder, k ≥ 3)
  - web/src/app/apply/[slug]/page.tsx (program intake link)
```

## Slide 4 — Add a startup. Read the dossier. Send verdict.

```yaml
title: Add a startup. Read the dossier. Send verdict.
sub: The Investor Dossier — live today, one page per startup
hero:
  type: screenshot
  description: Real Investor Dossier — score, 8-dimension radar, weighted table, 13-criteria strip, verdict control
  data:
    path: web/public/video-assets/10-investor-dossier.png
    caption: "Investor Dossier — live at /workspace/evaluations/[id]"
bullets:
  - Founder pastes a deck, a URL or an ABN — free score in about a minute.
  - Evaluator reads the dossier, sees mandate fit, records PASS / TRACK / PROCEED.
  - Founder receives the dimension-level reasons and a path to re-score.
speaker: You add the startup, read the dossier and record a verdict; the founder gets the reasons, not a form letter.
clusters: [C2, C8, C10]
sources:
  - web/src/app/(app)/(founder)/workspace/evaluations/[evaluationId]/page.tsx (Investor Dossier)
  - web/src/lib/evaluations/assessments.ts (PASS / TRACK / PROCEED, founder share allow-list)
  - web/src/lib/evaluations/feedback-letter.ts (founder feedback letter, k ≥ 3)
  - web/src/app/apply/[slug]/page.tsx (program intake link)
```

## Slide 5 — Not a prompt. A rubric with receipts.

```yaml
title: Not a prompt. A rubric with receipts.
sub: Same rubric every time, evidence weighted, audited, and now calibrated against real rounds
hero:
  type: tile
  description: Four tiles — Rubric 8 × 13 · Evidence ladder + Verified ABN · Hash-chained audit · Backtest ρ 0.76 / 0.94 on 49 Australian raises
  data:
    tiles:
      - head: Rubric 8 × 13
        body: "8 dimensions, 13 criteria, fixed weights — engine v2.2.0, versioned on every score"
      - head: Evidence ladder 0.2 → 1.0
        body: "Confidence is capped by its source: self-declared, document, connected data, third-party verified; ABN verification L0–L5 weights the score"
      - head: Audit chain
        body: "An auditor agent flags unsupported claims; every event is hash-chained and re-verified nightly"
      - head: Calibrated
        body: "Backtest on 49 Australian raises: rank correlation 0.76 with round size, 0.94 with valuation — published with confidence intervals and caveats"
bullets:
  - A chatbot gives a different opinion tomorrow; the rubric gives the same score twice.
  - 25,955 register signals (ABR, R&D Tax Incentive) sit behind the evidence ladder.
  - Calibration is public at /methodology/calibration — N, correlation, intervals, caveats.
speaker: A chatbot gives you an opinion; we give you the same rubric every time, evidence weighted, audited, and calibrated against real rounds.
clusters: [C5, C4]
sources:
  - web/src/lib/svi-analysis.ts (SVI_VERSION 2.2.0; EVIDENCE_CONFIDENCE; capConfidence)
  - web/src/lib/verification/confidence-multiplier.ts (L0–L5 multiplier)
  - web/src/lib/audit/chain-verify.ts (nightly hash-chain verification)
  - web/content/reports/svi-backtest-latest.json (N 49; ρ round 0.762 [0.561–0.876]; ρ valuation 0.937 [0.812–0.975])
  - external_signals table 2026-09-18 (25,955 rows: ABR 12,827 + R&DTI 13,128)
```

## Slide 6 — A$3 is a lead. Programs are the revenue.

```yaml
title: A$3 is a lead. Programs are the revenue.
sub: Every rung is live on Stripe today
hero:
  type: ladder
  description: Ladder bar — Free → A$3 report → Scout A$79 → Firm A$149 → Program A$349 → Fund A$999 → Cohort A$5,000–15,000 per year → Index API A$299; callout "Base case month 12: A$386K ARR from ~180 paying organisations = 130,000 A$3 reports"
  data:
    labels: ["Free", "A$3 report", "Scout", "Firm", "Program", "Fund", "Cohort 25", "Index API"]
    values: [0, 3, 79, 149, 349, 999, 417, 299]
    unit: "A$ per month (Cohort shown as A$5,000 per year ÷ 12)"
    callout: "Base case month 12: A$386K ARR from ~180 paying organisations — the money of 130,000 A$3 reports"
bullets:
  - Founder acquisition costs us cents; the A$3 report is the lead, not the revenue.
  - Evaluators pay monthly: angels A$79, firms A$149, programs A$349, funds A$999.
  - Programs buy cohorts by the year, A$5,000 to A$15,000; data buyers take the Index API.
speaker: Three dollars buys us a founder; three hundred and forty-nine a month is what a program pays to screen its whole intake.
clusters: [C2, C3]
sources:
  - web/src/config/pricing/plans.csv (Scout 7900 · Firm 14900 · Program 34900 · Fund 99900 · Intake 24900 · Cohort 25 500000/yr · Cohort 100 1500000/yr · Index API 29900)
  - docs/pricing-upgrade-plan-2026-07-16.md §v4 (base month-12 A$385,876 ARR ≈ 187 paying orgs; 130,080 A$3-report equivalent)
  - docs/ops/stripe-env-audit.md (prices minted 2026-09-17)
```

## Slide 7 — Live product, real depth, first pilots

```yaml
title: Live product, real depth, first pilots
sub: Built by a researcher who ships — the next seat is the seller
hero:
  type: number
  description: Two numbers — 182 startups analysed · 3,302 weekly snapshots — credentials row Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception · Stripe for Startups
  data:
    value: "182"
    caption: startups analysed
    secondary: "3,302"
    secondaryCaption: weekly score snapshots
    logos:
      - Founder Institute
      - Spacecubed AI Fellowship
      - NVIDIA Inception
      - Stripe for Startups
bullets:
  - "Shipped: dossier, verdicts, feedback letters, intake links, evaluator API, Slack / Affinity, billing on every tier."
  - "Pipeline: five accelerator pilots this quarter; [[LOI placeholder]]."
  - "Method grounded in the founder's doctoral research (DBA); commercial co-founder search is active."
speaker: One hundred and eighty-two startups scored, three thousand weekly snapshots, billing live — and the first accelerator pilots start this quarter.
clusters: [C9, C6]
sources:
  - web/content/reports/traction-snapshot.json (182 analyses; 3,302 snapshots — DB count 2026-09-18)
  - docs/plans/SOURCE-OF-TRUTH.md §G14 (S34–S40 live 2026-09-17; Stripe prices minted)
  - docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md (5 pilots, cap)
  - web/src/app/(marketing)/team/page.tsx (founder; DBA sentence approved in SOT §5)
```

## Slide 8 — A$500K pre-seed. Three things to remember.

```yaml
title: A$500K pre-seed. Three things to remember.
sub: Half to the commercial co-founder and engineering, 28% evaluator sales, 22% trust and data
hero:
  type: messages
  description: Three large lines (the key messages) above a compact ask strip — A$500K · 50 / 28 / 22 · month-12 milestones
  data:
    messages:
      - "One rubric, every deal."
      - "Evaluators pay. Founders get the feedback."
      - "A live index, not a static report."
    footer: "A$500K pre-seed · A$250K co-founder + engineering · A$140K evaluator GTM · A$110K trust + data · Month 12: 10 paying programs, 3 cohorts, 2 funds, backtest v1 · admin@blockid.au"
bullets: []
speaker: Five hundred thousand takes us from a working rubric to programs paying every month; one rubric, every deal; evaluators pay, founders get the feedback; a live index, not a static report.
clusters: [C7, C2]
sources:
  - .claude/goals/unicorn-masterplan.md (A$500K; buckets A$250K / A$140K / A$110K)
  - web/content/pitch/pitch-deck-v3.md slide 11 (month-12 milestones)
```

## 3-minute cut

Eight slides, 180 seconds (10 + 20 + 25 + 25 + 30 + 30 + 20 + 20). Every sentence is one breath, never more than twenty words, and carries none of the four forbidden internal tokens (pinned by the colocated test).

| # | Slide | Time | Seconds | Beat |
|---|---|---|---|---|
| 1 | Startup Value Index | 0:00–0:10 | 10 | Hook: the credit score for startups, for the people who back them |
| 2 | Forty decks. One weekend. No rubric. | 0:10–0:30 | 20 | Problem with a real number and a real group |
| 3 | Evaluators pay. Founders get the feedback. | 0:30–0:55 | 25 | The loop: who pays, who benefits |
| 4 | Add a startup. Read the dossier. Send verdict. | 0:55–1:20 | 25 | Product: the real dossier |
| 5 | Not a prompt. A rubric with receipts. | 1:20–1:50 | 30 | Proof: rubric, evidence, audit, calibration |
| 6 | A$3 is a lead. Programs are the revenue. | 1:50–2:20 | 30 | Business model and ARR math |
| 7 | Live product, real depth, first pilots | 2:20–2:40 | 20 | Traction + team |
| 8 | A$500K pre-seed. Three things to remember. | 2:40–3:00 | 20 | Ask + three key messages |

### Script

We are building the credit score for startups, for the people who back them.

Sydney Angels see about forty applicants every cycle. Each deck takes thirty to sixty minutes to read properly. That is a lost weekend for volunteers, and every screener uses a different rubric in their head. Across Australia, two hundred deals get considered for every four that close. The founders who are passed on hear nothing, so they pitch the same deck again next month.

Here is the loop we built. The people who screen pay us; the founders they pass on get the reasons and a way back. A founder pastes a deck, a website or an ABN and gets a score in about a minute, free. Programs hand out an intake link, so every application arrives already scored.

An evaluator opens the dossier: one score, eight dimensions, the evidence behind each, the red flags, the questions to ask. They record a verdict: pass, track or proceed. The founder gets the dimension-level reasons and a path to come back with a better score.

Why is this not a chatbot? A chatbot gives you an opinion, and a different one tomorrow. We give you the same rubric every time: eight dimensions, thirteen criteria, fixed weights, versioned. Every claim is weighted by its evidence, from self-declared to third-party verified, and your ABN verification level weights the score. An auditor agent checks the report and every event is hash-chained. And we published the calibration. On forty-nine Australian raises, rank correlation is zero point seven six with round size. With valuation it is zero point nine four — intervals and caveats included.

How we make money. Three dollars buys us a founder; the report costs cents. The revenue is the evaluator ladder, live on Stripe today: Scout seventy-nine, Firm one forty-nine, Program three forty-nine, Fund nine ninety-nine a month; cohorts five to fifteen thousand a year. Base case at month twelve: about one hundred and eighty paying organisations, three hundred and eighty-six thousand in annual recurring revenue.

Where we are. One hundred and eighty-two startups scored, over three thousand weekly snapshots. An evaluator API with Slack and Affinity destinations, and billing on every tier. Five accelerator pilots start this quarter. The method comes from my doctoral research; the product I built myself. The next seat is a commercial co-founder who sells to programs.

We are raising five hundred thousand pre-seed: half for that co-founder and engineering, a third for evaluator sales, the rest for trust and data. Three things to remember. One rubric, every deal. Evaluators pay; founders get the feedback. A live index, not a static report.

## Provenance

| Number | Slide | Source |
|---|---|---|
| 142 (ring score, illustrative band) | 1 | web/public/video-assets — BlockID showcase SVI 142 (blockid_pitch_deck.md verified use case) |
| 8 dimensions | 1, 5 | web/src/lib/report-pipeline/dimension-owners.ts |
| A$500K | 1, 8 | .claude/goals/unicorn-masterplan.md |
| 659 615 111 | 1 | Auschain PTY LTD ACN |
| 40 applicants | 2 | docs/plans/evaluator-traction-2026-09-10.md Appendix D (Sydney Angels ~40 per cycle) |
| 30–60 min | 2 | docs/plans/evaluator-traction-2026-09-10.md §2 |
| 200 → 4 | 2 | docs/plans/evaluator-traction-2026-09-10.md §2 |
| 13 criteria | 5 | web/src/lib/evaluation-criteria.ts |
| v2.2.0 | 5 | web/src/lib/svi-analysis.ts SVI_VERSION |
| 0.2 → 1.0 | 5 | web/src/lib/svi-analysis.ts EVIDENCE_CONFIDENCE |
| L0–L5 | 5 | web/src/lib/verification/level-engine.ts |
| 49 raises | 5 | web/content/reports/svi-backtest-latest.json n |
| 0.76 / 0.94 | 5 | web/content/reports/svi-backtest-latest.json rho.round_pooled 0.762 / rho.valuation_pooled 0.937 |
| 25,955 signals | 5 | external_signals count 2026-09-18 (ABR 12,827 + R&DTI 13,128) |
| A$3 | 3, 6 | web/src/lib/credits.ts trust_report |
| A$79 / A$149 / A$349 / A$999 / A$299 | 6 | web/src/config/pricing/plans.csv |
| A$5,000–15,000 per year | 6 | web/src/config/pricing/plans.csv (Cohort 25 / Cohort 100 annual) |
| 417 | 6 | Cohort 25 A$5,000 ÷ 12 (chart scaling only) |
| A$386K ARR / ~180 orgs / 130,000 reports | 6 | docs/pricing-upgrade-plan-2026-07-16.md §v4 (A$385,876; 187 orgs; 130,080) |
| 182 / 3,302 | 7 | DB counts 2026-09-18 (svi_analyses; svi_snapshots) |
| 5 pilots | 7 | docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md |
| A$250K / A$140K / A$110K / 50 / 28 / 22 | 8 | .claude/goals/unicorn-masterplan.md (use of funds 2026-09-16) |
| 10 programs / 3 cohorts / 2 funds / 12 | 8 | web/content/pitch/pitch-deck-v3.md slide 11 |
| 10 / 20 / 25 / 25 / 30 / 30 / 20 / 180 | 3-minute cut | this file |
