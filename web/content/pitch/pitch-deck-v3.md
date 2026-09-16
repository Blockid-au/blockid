---
version: "3.0"
date: 2026-09-16
entity: "Auschain PTY LTD"
acn: "659 615 111"
brand: "Startup Value Index"
byline: "by BlockID"
ask: "A$500K pre-seed"
audience: "Australian pre-seed investors (evaluator-first narrative)"
positioning: "Startup Value Index: one live score every Australian evaluator screens on, and every founder gets feedback from."
render: "web/scripts/generate-pitch-deck-v3.ts → web/public/pitch/SVI-Pitch-Deck-PreSeed-2026-09.pptx"
feedback: "docs/plans/g14-investor-feedback-2026-09-16/00-pitch-feedback.md"
---

# Startup Value Index — Pre-seed deck v3 (2026-09-16)

Single source of truth for the investor deck. Each slide is one fenced `yaml` block with exactly one `hero`, at most three bullets (≤40 words of body), one speaker line (≤2 sentences, ≤20 words per breath), the judge clusters it answers (C1–C10, see the feedback file) and the sources every number comes from. The `## Provenance` table at the end must list every number that appears on a slide. Wording rules: "Startup Value Index" spelled out is fine; speaker lines carry no internal jargon (the four forbidden tokens are pinned by `hero-variants.ts` FORBIDDEN_TOKENS); the doctoral credential is always written "DBA"; no user counts, no inflated comparables count, no compliance-certification claims, no fake quotes, no sign-up restrictions, Australia-only market, entity Auschain PTY LTD. The colocated test greps the whole file for the banned strings.

## Slide 1 — Startup Value Index

```yaml
title: Startup Value Index
sub: The live score Australian evaluators screen on — by BlockID
hero:
  type: ring
  description: Score ring (illustrative stage-2 median score 115) beside the 8 weighted dimensions of the rubric
  data:
    score: 115
    label: Startup Value Index
    dims:
      - key: TRE
        name: Traction & Revenue Evidence
        weight: 20
      - key: MPC
        name: Market Pull & Category
        weight: 18
      - key: FTV
        name: Founder & Team Value
        weight: 15
      - key: PTD
        name: Product & Tech Depth
        weight: 12
      - key: CGH
        name: Capital & Governance Health
        weight: 12
      - key: IRI
        name: Investor Readiness Index
        weight: 10
      - key: LCO
        name: Legal & Compliance
        weight: 8
      - key: SVM
        name: Strategic Vision & Moat
        weight: 5
bullets:
  - One score across 8 dimensions, backed by evidence, updated weekly.
  - Built for Australian angel groups, accelerators, funds and advisers.
  - "Do Van Long, founder · Sydney · Pre-seed A$500K"
speaker: We're building the credit score for startups, for the people who back them.
clusters: [C4, C10]
sources:
  - web/src/lib/report-pipeline/dimension-owners.ts (weights)
  - web/src/lib/svi-analysis.ts (SVI_BENCHMARKS stage 2 p50 = 115)
```

## Slide 2 — Forty decks. One weekend. No rubric.

```yaml
title: Forty decks. One weekend. No rubric.
sub: What screening a cycle looks like today
hero:
  type: number
  description: The number 40 — Sydney Angels applicants per cycle — with the reading-time caption
  data:
    value: "40"
    caption: applicants per Sydney Angels cycle, 30–60 minutes each to read
bullets:
  - "Sydney Angels: about 40 applicants a cycle, 30–60 minutes each to read."
  - Every screener uses a different gut rubric; scores don't compare.
  - Founders who are passed on hear nothing — and pitch the same deck again.
speaker: Sydney Angels see about forty applicants a cycle — read at forty minutes each, that's a lost weekend and no shared score.
clusters: [C1, C7]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md §2 (Sydney Angels ~40 applicants × 6 cycles; 30–40 decks/day; 30–60 min per deck)
  - docs/plans/evaluator-traction-2026-09-10.md Appendix D (Sydney Angels 1,302 applications 2014–21)
```

## Slide 3 — Evaluators pay. Founders get the feedback.

```yaml
title: Evaluators pay. Founders get the feedback.
sub: A two-sided loop that starts on the paying side
hero:
  type: loop
  description: Loop diagram — Founder → free score → A$3 report → Index → Evaluator (Scout / Firm / Program) → PASS / TRACK / PROCEED → reasons → re-score
  data:
    steps:
      - Founder
      - Free score
      - A$3 report
      - Index
      - Evaluator (Scout / Firm / Program)
      - PASS / TRACK / PROCEED
      - Reasons to founder
      - Re-score
bullets:
  - "Founder: free score → A$3 Trusted Business Report → joins the index."
  - "Evaluator: Scout, Firm or Program subscription; verdict PASS / TRACK / PROCEED."
  - Passed founders get the reasons and a re-score path back.
speaker: The people who screen pay us; the founders they pass on get the reasons and a way back.
clusters: [C2, C3, C8, C10]
sources:
  - web/src/config/pricing/plans.csv (Scout / Firm / Program rows)
  - web/src/lib/credits.ts (A$3 Trusted Business Report)
  - web/src/lib/evaluations/progress-radar.ts (weekly evaluator radar, re-score)
```

## Slide 4 — Add a startup. Read the dossier. Send verdict.

```yaml
title: Add a startup. Read the dossier. Send verdict.
sub: The evaluator workspace — one startup, one dossier, one decision
hero:
  type: screenshot
  description: Screenshot of /workspace/evaluations/[id] — dossier with score, 8 dimensions, evidence and the verdict panel
  data:
    path: public/video-assets/10-investor-dossier.png
    caption: /workspace/evaluations/[id] — investor dossier (seeded evaluator)
bullets:
  - Add a startup by deck, URL or ABN — scored in minutes.
  - "Dossier: score, 8 dimensions, evidence, red flags, questions to ask."
  - Record the verdict; the founder sees the reasons this quarter.
speaker: You add the startup, read the dossier and record a verdict — the founder gets the reasons, not a form letter.
clusters: [C8, C1]
sources:
  - web/src/lib/evaluations/progress-radar.ts (evaluations rows, dossier, reports)
  - docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md (dossier blocks)
  - G13 S-D2 (assessment write path — founder-visible share "this quarter")
```

## Slide 5 — Not a prompt. A rubric with receipts.

```yaml
title: Not a prompt. A rubric with receipts.
sub: Why the same startup gets the same score twice
hero:
  type: tile
  description: Four tiles — Rubric 8×13 with weights 20/18/15/12/12/10/8/5 · Evidence ladder 0.2→1.0 · Audit (auditor agent + hash chain) · Weekly Δ
  data:
    tiles:
      - head: Rubric 8 × 13
        body: "8 dimensions, 13 criteria, fixed weights 20/18/15/12/12/10/8/5 — engine v2.1.0"
      - head: Evidence ladder 0.2 → 1.0
        body: "self-declared 0.2 · public URL 0.35 · document 0.5 · connected source 0.75 · transactions 0.9 · third-party verified 1.0"
      - head: Audit
        body: Auditor agent flags unsupported claims; every event is hash-chained and re-verified by cron
      - head: Weekly Δ
        body: Score re-snapshotted weekly; evaluators see movers, new evidence and deadlines
bullets:
  - "Fixed rubric v2.1.0: 8 dimensions, 13 criteria, fixed weights."
  - Evidence weighted 0.2 (self-declared) to 1.0 (third-party verified).
  - An auditor agent checks claims; every event is hash-chained.
speaker: A chatbot gives you an opinion; we give you the same rubric every time, with the evidence weighted and audited.
clusters: [C5, C4]
sources:
  - web/src/lib/svi-analysis.ts (SVI_VERSION 2.1.0; EVIDENCE_CONFIDENCE ~L79)
  - web/src/lib/report-pipeline/dimension-owners.ts (weights 20/18/15/12/12/10/8/5)
  - web/src/lib/evaluation-criteria.ts (13 criteria)
  - web/src/lib/audit/chain-verify.ts (hash chain verification)
  - web/src/lib/evaluations/progress-radar.ts (weekly Δ)
  - docs/plans/evaluator-traction-2026-09-10.md §4 (llm-auditor, ChatGPT variance evidence)
```

## Slide 6 — A$3 is a lead. Programs are the revenue.

```yaml
title: A$3 is a lead. Programs are the revenue.
sub: One ladder, priced per year (list price × 12)
hero:
  type: ladder
  description: Bar ladder Free → A$3 → Scout 79 → Firm 149 → Program 349 → Fund 999 → Cohort A$5K–15K/yr, with the month-12 ARR callout
  data:
    unit: A$ per year (monthly list × 12)
    bars:
      - label: Free
        value: 0
      - label: A$3 report (one-off)
        value: 3
      - label: Scout A$79/mo
        value: 948
      - label: Firm A$149/mo
        value: 1788
      - label: Program A$349/mo
        value: 4188
      - label: Cohort 25 A$5K/yr
        value: 5000
      - label: Fund A$999/mo
        value: 11988
      - label: Cohort 100 A$15K/yr
        value: 15000
    callout: "Base case month 12: A$386K ARR from ~180 paying orgs = the money of 130,000 A$3 reports"
bullets:
  - The A$3 report is the lead; it costs cents to produce.
  - "Evaluator subscriptions A$79 to A$999 a month; cohorts A$5K–15K a year."
  - "Base case month 12: A$386K ARR from ~180 paying organisations."
speaker: Three dollars buys us a founder; three hundred and forty-nine a month is what a program pays to screen its whole intake.
clusters: [C2, C3]
sources:
  - web/src/config/pricing/plans.csv (Scout 7900 / Firm 14900 / Program 34900 cents per month; Cohort Starter 500000 / Growth 1500000 cents annual)
  - plan §3.2 pricing ladder v4 (Fund A$999, Cohort 25 A$5,000/yr, Cohort 100 A$15,000/yr — planned, Stripe mint human-gated)
  - plan §3.3 ARR bottom-up (base M12 A$386K; 187 paying orgs)
  - plan §0 (COGS ≈ A$0.001 per report, DeepInfra)
```

## Slide 7 — Australia, counted one evaluator at a time

```yaml
title: Australia, counted one evaluator at a time
sub: Bottom-up, Australia only — organisations that screen startups for a living
hero:
  type: bars
  description: Bar chart by segment — ~249 accelerators · 18 VCs · 135 investor orgs · ~1,000 active angels · 4,345 accounting firms → ≈A$12M ARR serviceable, ~5,700 orgs
  data:
    unit: organisations
    bars:
      - label: Accelerators & incubators
        value: 249
      - label: Early-stage VC funds
        value: 18
      - label: Investor organisations
        value: 135
      - label: Active angels
        value: 1000
      - label: Accounting firms (ESIC / R&D)
        value: 4345
    callout: "≈A$12M ARR serviceable across ~5,700 organisations at list price"
bullets:
  - "~249 accelerators and incubators; 18 early-stage VC funds; 135 investor organisations."
  - "~1,000 active angels; 4,345 accounting firms touching ESIC and R&D claims."
  - "Serviceable: ~5,700 organisations ≈ A$12M ARR at list prices."
speaker: We counted the buyers one by one — roughly five and a half thousand Australian organisations screen startups for a living.
clusters: [C9, C2]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md §2 + Appendix D (18 VC funds, 135 investor orgs, ~249 accelerators, ~1,000 Cut Through contributors, 4,345 accounting firms)
  - plan §2.2 slide 7 (≈A$12M ARR serviceable, ~5,700 orgs)
```

## Slide 8 — Data about deals vs judgement about a startup

```yaml
title: Data about deals vs judgement about a startup
sub: Where the existing tools sit — and the empty corner
hero:
  type: quadrant
  description: 2×2 — X axis data about deals ↔ judgement about one startup; Y axis static ↔ live weekly. Crunchbase / PitchBook / Techboard (deal data, static); Affinity / Dealum / F6S (workflow, live); Equidam / valuers / ChatGPT (judgement, static); Startup Value Index (judgement, live)
  data:
    xAxis: [Data about deals, Judgement about one startup]
    yAxis: [Static, Live weekly]
    items:
      - name: Crunchbase · PitchBook · Techboard
        x: 0.2
        y: 0.25
        tag: PitchBook US$15–20k/seat
      - name: Affinity · Dealum · F6S
        x: 0.3
        y: 0.75
        tag: Affinity US$2–2.7k/seat
      - name: Equidam · valuers · ChatGPT
        x: 0.75
        y: 0.25
        tag: valuers A$2,985–3,990 per report
      - name: Startup Value Index
        x: 0.8
        y: 0.8
        tag: from A$3 per startup, weekly
bullets:
  - "Deal data (Crunchbase, PitchBook US$15–20k/seat) tells you about other companies."
  - "CRMs (Affinity US$2–2.7k/seat) track relationships; valuers charge A$2,985+ per report."
  - We are the only live, evidence-weighted judgement about one startup.
speaker: Crunchbase tells you what happened to other companies; we tell you what's true about this one, this week.
clusters: [C4, C5]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md §2 (PitchBook US$15–20k/seat; Affinity US$2,000–2,700/seat/yr; AU desktop valuation A$2,985–3,990)
  - docs/plans/evaluator-traction-2026-09-10.md Appendix A (54-row competitor table)
```

## Slide 9 — Live product, real depth, first pilots

```yaml
title: Live product, real depth, first pilots
sub: What is live today, and what starts this quarter
hero:
  type: number
  description: Two big numbers — 182 startups analysed · 3,302 weekly snapshots — with a credentials row (Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception · Stripe for Startups)
  data:
    value: "182"
    caption: startups analysed
    secondary: "3,302"
    secondaryCaption: weekly snapshots
    logos:
      - Founder Institute
      - Spacecubed AI Fellowship
      - NVIDIA Inception
      - Stripe for Startups
bullets:
  - "Shipped: rubric, dossier, evaluator ladder with billing, weekly snapshots, audit chain."
  - "Pipeline: 5 accelerator pilots Sep–Nov 2026; [[LOI placeholder]]."
  - "Programs: Founder Institute, Spacecubed AI Fellowship, NVIDIA Inception, Stripe for Startups."
speaker: One hundred and eighty-two startups scored, three thousand weekly snapshots, and the first accelerator pilots start this month.
clusters: [C9, C6]
sources:
  - docs/plans/reviews/capacity-audit-2026-09-13.md (svi_analyses 182; svi_snapshots 3,302)
  - web/content/reports/ceo-daily-2026-09-16.md (Analyses 182)
  - plan §4 GTM (5 pilots cap, Sep–Nov; LOI names only with written consent — F-9)
  - memory feedback_accelerator_pitch_rules.md (confirmed credentials FI / Spacecubed AI Fellowship / NVIDIA Inception)
```

## Slide 10 — A researcher who ships, hiring the seller

```yaml
title: A researcher who ships, hiring the seller
sub: Team today, and the one seat this raise fills first
hero:
  type: team
  description: Founder card with DBA caption; grid of 11 specialist agents plus the auditor; an OPEN card for the commercial co-founder
  data:
    founder:
      name: Do Van Long
      role: Founder & CEO — Auschain PTY LTD
      caption: Method grounded in the founder's doctoral research (DBA) on startup valuation; built and shipped the product
    agents:
      - CEO
      - CFO
      - CMO
      - CTO
      - COO
      - CPO
      - CRO
      - CHRO
      - CLO
      - CISO
      - CDO
    auditor: Auditor agent (checks every report)
    open: OPEN — Commercial co-founder (evaluator sales), active search
bullets:
  - "Do Van Long — founder; method grounded in doctoral research (DBA) on startup valuation."
  - "Built and shipped the product solo: 11 specialist agents plus an auditor."
  - "OPEN: commercial co-founder for evaluator sales — active search."
speaker: I built the method in my doctoral research and the product with my own hands; the next seat is the person who sells it.
clusters: [C6]
sources:
  - docs/plans/evaluator-traction-2026-09-10.md §4a row 2 (11 C-Level agents + llm-auditor) and row 6 (DBA wording rule)
  - web/content/team-roster.json (agent roster)
  - memory feedback_accelerator_pitch_rules.md (commercial co-founder = active priority)
```

## Slide 11 — A$500K pre-seed: rubric to revenue

```yaml
title: "A$500K pre-seed: rubric to revenue"
sub: Use of funds and the month-12 milestones the money buys
hero:
  type: donut
  description: Donut with 3 buckets — Commercial co-founder + engineering A$250K (50%) · Evaluator GTM A$140K (28%) · Trust + data A$110K (22%) — and M3 / M6 / M12 milestone strip
  data:
    total: A$500K
    slices:
      - label: Commercial co-founder + engineering
        value: 250
        pct: 50
      - label: Evaluator GTM
        value: 140
        pct: 28
      - label: Trust + data
        value: 110
        pct: 22
    milestones:
      - when: M3
        what: Co-founder hired; 5 pilots running; feedback letters live
      - when: M6
        what: Intake links live; 300 evaluator sign-ups; A$5K MRR
      - when: M12
        what: 10 Programs · 3 Cohort 25 · 2 Funds · 5 Intake links · 500 evaluator sign-ups · backtest published · A$10K MRR floor
bullets:
  - "Co-founder + engineering A$250K (50%) · Evaluator GTM A$140K (28%) · Trust + data A$110K (22%)."
  - "Month 12: 10 Programs, 3 Cohort 25, 2 Funds, 5 Intake links, 500 evaluator sign-ups."
  - "Pre-money A$2.5–4.0M; SAFE cap A$3.5M, 20% discount; ~18 months runway."
speaker: Five hundred thousand takes us from a working rubric to a six-figure annual run-rate, sold to programs.
clusters: [C2, C9]
sources:
  - plan §7 F-1 (use of funds 50/28/22) and F-2 (pre-money A$2.5–4.0M, SAFE cap A$3.5M, 20% discount)
  - plan §2.2 (M12 milestones; bear A$153K / base A$386K ARR; runway ≈ 18 months at ~A$27K/month)
  - plan §4 (D30/D60/D90 evaluator sign-ups 120/300/500; MRR A$1.5K/5K/10K)
  - web/src/lib/au-comparable-raises.ts (pre-seed rows: Antler A$1.5M, Startmate A$1.8M, Blackbird Giants A$5.0M valuation)
  - .claude/goals/unicorn-masterplan.md (Pre-Seed A$500K row — use-of-funds table superseded by F-1)
```

## Slide 12 — Three things to remember

```yaml
title: Three things to remember
sub: Startup Value Index — by BlockID
hero:
  type: messages
  description: Three key messages as large cards, with the contact line beneath
  data:
    messages:
      - head: One rubric, every deal.
        body: Same 8 dimensions, 13 criteria, evidence-weighted.
      - head: Evaluators pay. Founders get the feedback.
        body: Programs, firms and angel groups buy; founders they pass on get the reasons, not silence.
      - head: A live index, not a static report.
        body: The score moves weekly; the index gets more valuable with every startup scored.
    contact: Do Van Long · admin@blockid.au · blockid.au/pricing?persona=investor · Auschain PTY LTD ACN 659 615 111
bullets:
  - One rubric, every deal — 8 dimensions, 13 criteria, evidence-weighted.
  - Evaluators pay; founders get the feedback, not silence.
  - A live index, not a static report — more valuable with every startup scored.
speaker: One rubric for every deal; evaluators pay and founders get the feedback; a live index, not a static report.
clusters: [C7, C1]
sources:
  - plan §2.1 (positioning + KM1–KM3)
  - web/src/lib/marketing/hero-variants.ts (I3 brand-forward line, speakability rules)
```

## 3-minute cut

Six slides, 414 words. Every sentence is one breath or two, never more than twenty words per breath, and carries none of the four forbidden internal tokens (pinned by the colocated test).

| # | Slide | Time | Seconds | Beat |
|---|---|---|---|---|
| 1 | S2 — Forty decks. One weekend. No rubric. | 0:00–0:25 | 25 | The problem, one number |
| 2 | S4 — Add a startup. Read the dossier. Send verdict. | 0:25–1:05 | 40 | The product and the loop |
| 3 | S5 — Not a prompt. A rubric with receipts. | 1:05–1:35 | 30 | Why it is not a chatbot |
| 4 | S6 — A$3 is a lead. Programs are the revenue. | 1:35–2:10 | 35 | Business model and month-12 base case |
| 5 | S9 — Live product, real depth, first pilots (+ one team sentence) | 2:10–2:35 | 25 | Traction and founder |
| 6 | S11 → S12 — A$500K pre-seed → Three things to remember | 2:35–3:00 | 25 | Ask and close |

### Script

Sydney Angels see about forty applicants every cycle. Each deck takes thirty to sixty minutes to read. That is a lost weekend for volunteers, and there is no shared score. Every screener uses a different gut rubric. The founders who are passed on hear nothing, so they pitch the same deck again next month.

Here is what we built. You add a startup — a deck, a website or an ABN — and in minutes you have a dossier. One score, eight dimensions, the evidence behind each, the red flags, and the questions to ask. You record a verdict: pass, track or proceed. The founder gets the reasons, not a form letter, and a path to come back with a better score. The evaluator saves the weekend, and the founder finally learns why. That is the loop: the people who screen pay us, and the founders they pass on get the feedback.

Why is this not just a chatbot? A chatbot gives you an opinion, and a different one tomorrow. We give you the same rubric every time: eight dimensions, thirteen criteria, fixed weights. Every claim is weighted by its evidence — self-declared counts a fifth, third-party verified counts in full. An auditor agent checks the report, and every event is hash-chained. The score moves weekly as the startup changes. Receipts, not vibes.

How we make money. Three dollars buys us a founder — the report costs cents to produce, so it is our lead, not our revenue. The revenue is the evaluator ladder: Scout at seventy-nine, Firm at one forty-nine, Program at three forty-nine a month. Funds pay nine ninety-nine; cohorts pay five to fifteen thousand a year. Base case at month twelve: about one hundred and eighty paying organisations, three hundred and eighty-six thousand in annual recurring revenue.

Where we are today. One hundred and eighty-two startups scored, over three thousand weekly snapshots, billing live on every tier. The first accelerator pilots start this month. I built the method in my doctoral research and the product with my own hands. The next seat is a commercial co-founder who sells to programs; that search is active.

We are raising five hundred thousand dollars pre-seed. Half funds that co-founder and engineering; twenty-eight percent goes to evaluator sales; twenty-two percent to trust and data. Twelve months out: ten paying programs, three cohorts, two funds, and a published backtest. Three things to remember. One rubric, every deal. Evaluators pay; founders get the feedback. A live index, not a static report.

## Provenance

Every number that appears in a slide title, sub-line, bullet or hero data is listed here with the file or URL it was confirmed against on 2026-09-16. Numbers marked *soft* could not be confirmed to the digit and are worded as approximations on the slide.

| Number | Slide | Source file / URL | Note |
|---|---|---|---|
| 8 (dimensions) | 1, 4, 5, 12 | `web/src/lib/report-pipeline/dimension-owners.ts` | 8 `DIMENSION_OWNERS` entries |
| 13 (criteria) | 5, 12 | `web/src/lib/evaluation-criteria.ts` | `CRITERION_KEYS` has 13 keys |
| 20 / 18 / 15 / 12 / 12 / 10 / 8 / 5 (weights) | 1, 5 | `web/src/lib/report-pipeline/dimension-owners.ts` | TRE 20 · MPC 18 · FTV 15 · PTD 12 · CGH 12 · IRI 10 · LCO 8 · SVM 5 (sum 100) |
| 115 (illustrative score) | 1 | `web/src/lib/svi-analysis.ts` `SVI_BENCHMARKS[2].p50` | stage-2 median band; illustrative only |
| 2.1.0 (engine version) | 5 | `web/src/lib/svi-analysis.ts` `SVI_VERSION` | |
| 0.2 · 0.35 · 0.5 · 0.75 · 0.9 · 1.0 (evidence ladder) | 5 | `web/src/lib/svi-analysis.ts` `EVIDENCE_CONFIDENCE` (~L79) | self_declared 0.20 → third_party_verified 1.00 |
| 40 (applicants per cycle) | 2 | `docs/plans/evaluator-traction-2026-09-10.md` §2 | "Sydney Angels ~40 applicants × 6 cycles/yr" — *soft*, "about 40" |
| 30–60 (minutes per deck) | 2 | `docs/plans/evaluator-traction-2026-09-10.md` §2 / plan §2.2 slide 2 | "30–60 min" reading time — *soft* |
| A$3 (Trusted Business Report) | 3, 6, 8 | `web/src/lib/credits.ts`; `web/src/config/pricing/plans.csv` | live price |
| A$79 / A$149 / A$349 (Scout / Firm / Program per month) | 3, 6 | `web/src/config/pricing/plans.csv` rows `investor_angel` 7900, `investor_advisor` 14900, `investor_vc_small` 34900 | live |
| 0 (Free tier) · 3 (A$3 one-off) | 6 | `web/src/config/pricing/plans.csv` `founder_free` 0 cents; `web/src/lib/credits.ts` | chart values |
| 948 / 1788 / 4188 / 11988 (annual = monthly × 12) | 6 | plan §3.3 ARR table (Scout 120 → 113,760 ⇒ 948 each; Firm 25 → 44,700 ⇒ 1,788; Program 20 → 83,760 ⇒ 4,188; Fund 4 → 47,952 ⇒ 11,988) | chart values only |
| A$999 (Fund per month) | 6 | plan §3.2 (`investor_fund` NEW, A$999/mo) | planned — Stripe mint human-gated |
| A$5K / 5000 (Cohort 25 per year) · A$15K / 15000 (Cohort 100 per year) | 6 | `web/src/config/pricing/plans.csv` `accelerator_starter` 500000 / `accelerator_growth` 1500000 annual cents; plan §3.2 | live prices, public flag pending v4 |
| 25 / 100 (Cohort sizes) | 6, 11 | plan §3.2 (`profiles` 25 / 100) | |
| A$386K (base ARR month 12) | 6 | plan §3.3 "Recurring ARR — Base M12 A$386K" | sum of base M12 column |
| ~180 (paying organisations month 12) | 6 | plan §3.3 base M12 counts 120+25+20+4+8+2+5+3 = 187 | rounded per plan §2.2 wording "~180" |
| 130,000 (A$3 reports equivalent) | 6 | plan §2.2 slide 6; 386,000 ÷ 3 ≈ 128,700 | rounded to 130,000 |
| 12 (month 12; × 12 months) | 6, 11 | plan §3.3 column "Base M12" | |
| 249 (accelerators & incubators) | 7 | `docs/plans/evaluator-traction-2026-09-10.md` Appendix D "~249 (Tracxn)" | *soft*, "~249" |
| 18 (early-stage VC funds) | 7 | `docs/plans/evaluator-traction-2026-09-10.md` §2 + Appendix D (Side Stage / Dealroom 2026) | |
| 135 (investor organisations) | 7 | `docs/plans/evaluator-traction-2026-09-10.md` Appendix D (Cut Through Q2 2026 survey base) | |
| 1,000 / 1000 (active angels) | 7 | `docs/plans/evaluator-traction-2026-09-10.md` Appendix D "~1,000 contributors annual" (Cut Through) | *soft*, "~1,000" |
| 4,345 / 4345 (accounting firms) | 7 | `docs/plans/evaluator-traction-2026-09-10.md` Appendix D (RevenueBase) | |
| ~5,700 (serviceable organisations) | 7 | plan §2.2 slide 7; 249 + 18 + 135 + 1,000 + 4,345 = 5,747 | rounded |
| A$12M (serviceable ARR) | 7 | plan §2.2 slide 7; segments × matching tier list price ≈ A$11.6M (4,345 × 1,788 + 1,000 × 948 + 249 × 4,188 + 153 × 11,988) | rounded, "≈A$12M" |
| US$15–20k (PitchBook per seat) | 8 | `docs/plans/evaluator-traction-2026-09-10.md` §2 (Appendix A shows US$12–30k+) | §2 range used |
| US$2–2.7k (Affinity per seat) | 8 | `docs/plans/evaluator-traction-2026-09-10.md` §2 / Appendix A (US$2,000–2,700/user/yr) | |
| A$2,985 / A$2,985–3,990 (AU valuers per report) | 8 | `docs/plans/evaluator-traction-2026-09-10.md` §2 (AU accountant desktop valuation A$2,985–3,990 + GST) | |
| 0.2 / 0.25 / 0.3 / 0.75 / 0.8 (quadrant coordinates) | 8 | layout positions only — not data | |
| 182 (startups analysed) | 9 | `docs/plans/reviews/capacity-audit-2026-09-13.md` (svi_analyses 182 rows); `web/content/reports/ceo-daily-2026-09-16.md` | |
| 3,302 (weekly snapshots) | 9 | `docs/plans/reviews/capacity-audit-2026-09-13.md` (svi_snapshots 3,302 rows) | |
| 5 (accelerator pilots) · Sep–Nov 2026 | 9 | plan §4 GTM ("Cap 5 pilot"; pilots 2/4/5 at D30/D60/D90) | pipeline, not signed — `[[LOI placeholder]]` until F-9 consent |
| 11 (specialist agents) | 10 | `docs/plans/evaluator-traction-2026-09-10.md` §4a row 2; `web/content/team-roster.json` | 11 C-Level agents + auditor |
| A$500K (raise) | 1, 11 | plan header (founder decision 2026-09-16); `.claude/goals/unicorn-masterplan.md` Pre-Seed row | |
| A$250K (50%) · A$140K (28%) · A$110K (22%) (use of funds) · 250 / 140 / 110 · 50 / 28 / 22 | 11 | plan §7 F-1 (default yes) | supersedes the 5-bucket table in `unicorn-masterplan.md` |
| 10 Programs · 3 Cohort 25 · 2 Funds · 5 Intake links · 500 evaluator sign-ups (M12) | 11 | plan §2.2 "Số liệu chốt cho S11" | targets |
| 300 evaluator sign-ups · A$5K MRR (M6) · A$10K MRR floor (M12) | 11 | plan §4 metrics D60 sign-ups 300, MRR A$5K; plan §2.2 A$10K MRR floor | targets |
| M3 / M6 / M12 (milestone months) | 11 | plan §2.2 | |
| A$2.5–4.0M (pre-money) · A$3.5M (SAFE cap) · 20% (discount) | 11 | plan §7 F-2 (default yes); anchors `web/src/lib/au-comparable-raises.ts` pre-seed rows (A$1.5M / A$1.8M / A$5.0M valuations) + Cut Through pre-seed median A$1.0–1.3M (Appendix D) | range, not a price |
| ~18 (months runway) | 11 | plan §2.2 ("Runway ≈ 18 tháng ở burn ~A$27K/tháng post-raise") | *soft* |
| 659 615 111 (ACN) | 12, footer | ASIC register; `web/content/pitch/pitch-deck-v1.md` header | Auschain PTY LTD |

Numbers deliberately **not** on any slide: user counts (116 `app_users`, partly seeded), any comparables count (the curated sets hold 38 + 33 rows — the old "500+" site copy is retired), insight article counts, grants/programs counts, Stripe charge counts.

Title adjustment against plan §2.2: slide 4 is "Add a startup. Read the dossier. Send verdict." (8 words) — the plan's 9-word version broke the ≤8-word title rule from §8.1; meaning unchanged.
