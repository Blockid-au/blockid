---
version: "4.0"
date: 2026-09-20
entity: "Auschain PTY LTD"
acn: "659 615 111"
brand: "BlockID"
byline: "Evidence-backed startup assessment infrastructure"
ask: "One organisation paying to assess a live cohort"
audience: "Accelerators, startup programs and professional evaluators — Australia"
positioning: "BlockID helps accelerators and startup programs screen companies consistently by converting founder submissions and company evidence into one comparable, evidence-backed startup assessment."
render: "web/scripts/generate-pitch-deck-v4.ts → web/public/pitch/BlockID-Pitch-Deck-2026-09.pptx"
plan: "docs/plans/g21-fi-upgrade-2026-09-20.md § 0 + § P0-D"
claims: "web/content/claims-register.json (slide 8 may only carry proven / observed rows)"
---

# BlockID — pitch deck v4 (2026-09-20)

Ten slides plus an appendix (`pitch-deck-v4-appendix.md`). One fenced `yaml` block per slide with exactly one `hero`, at most three bullets, one speaker line (two sentences at most, twenty words per breath), the objection clusters it answers and the sources every number comes from. `## Provenance` lists every number on a slide. Wording rules (pinned by `src/lib/marketing/pitch-deck-v4.test.ts`): no agent counts, no A$3 anchor, no "beta", no "PhD" (always "doctoral research"), no "predict", no "PPL Food", no "better AI", entity from `lib/site/legal-entity.ts`, the three messages present, and slide 8 carries only numbers that the claims register classifies as proven or observed.

**One-liner.** BlockID helps accelerators and startup programs screen companies consistently by converting founder submissions and company evidence into one comparable, evidence-backed startup assessment.

**Three messages.** Screen faster · Trust the evidence · Track improvement.

**Institutional line.** BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.

**Business model — the answer when asked.** Organisations with repeated intake volume pay. The wedge is the annual program subscription itself — Cohort 25 at A$5,000 a year for up to 25 startups, Cohort 100 at A$15,000 a year for up to 100 — started on a 14-day card-required trial on the program's next real intake, and, later, institutional expansion — funds, universities and networks with an API and a sponsor report. Founders remain the data owner, the participant and a secondary paying customer (Free, Starter A$29 a month, Growth A$69 a month). We validate with real payment, not with sign-ups: the next milestone is one organisation paying to assess a live cohort.

## Slide 1 — Startup screening is inconsistent. BlockID makes every company comparable.

```yaml
title: Startup screening is inconsistent. BlockID makes every company comparable.
sub: Evidence-backed startup assessment infrastructure for accelerators, programs and professional evaluators
hero:
  type: messages
  description: Three message cards — Screen faster · Trust the evidence · Track improvement — with the one-liner beneath
  data:
    messages:
      - head: Screen faster
        body: Every application lands on the same evidence-backed framework, so the first pass takes minutes, not a weekend.
      - head: Trust the evidence
        body: Every claim is labelled by how it was verified; the methodology version and the audit trail are public.
      - head: Track improvement
        body: The same company is re-assessed over time, so programs and sponsors see movement, not a snapshot.
    contact: BlockID helps accelerators and startup programs screen companies consistently by converting founder submissions and company evidence into one comparable, evidence-backed startup assessment.
speaker: Startup screening is inconsistent, and BlockID makes every company comparable on the same evidence.
clusters: [C1, C7]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (positioning, three messages, one-liner)
  - docs/design/messaging.md § 4b
```

## Slide 2 — Screening was not designed to scale

```yaml
title: Screening was not designed to scale
sub: Three failures every program lives with
hero:
  type: tile
  description: Three tiles — Different inputs · Subjective review · Weak feedback — each with the consequence
  data:
    tiles:
      - head: Different inputs
        body: Decks, forms, spreadsheets and links — no two applications describe a company the same way.
      - head: Subjective review
        body: Each reviewer applies a private rubric; scores do not compare across reviewers or across intakes.
      - head: Weak feedback
        body: Founders who are passed on hear nothing specific, so the same company comes back unchanged next round.
      - head: The cost
        body: Reviewer hours spent restructuring inputs instead of judging companies; decisions that cannot be audited later.
bullets:
  - Different inputs — every application describes the company differently.
  - Subjective review — private rubrics; scores never compare.
  - Weak feedback — founders return with the same gaps.
speaker: Every program reads different inputs with a private rubric, and the founders it passes on learn nothing.
clusters: [C1, C7]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 2 P0-B (problem section — Different inputs → Subjective review → Weak feedback)
  - docs/plans/evaluator-traction-2026-09-10.md § 2 (screening load per cycle; reading time per deck)
```

## Slide 3 — Application → evidence → index → dossier → cohort

```yaml
title: Application → evidence → index → dossier → cohort
sub: One methodology applied to every company and every point in time
hero:
  type: loop
  description: Six-step flow — Founder application → Evidence extracted and labelled → Startup Value Index with confidence → BlockID Dossier → BlockID Cohort table → Progress over time
  data:
    steps:
      - Founder application (form, deck, website, business ID)
      - Evidence extracted and labelled by verification level
      - Startup Value Index with confidence
      - BlockID Dossier for the evaluator
      - BlockID Cohort — every applicant side by side
      - Progress over time — the same company re-assessed
bullets:
  - "Application in: form, deck, website or business identifier."
  - "Out: an index with confidence, a dossier per company, a cohort table."
  - Re-assessed over time — improvement is visible, not assumed.
speaker: An application goes in, structured evidence comes out, and every company lands on the same index, dossier and cohort table.
clusters: [C8, C4]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (four layers L1–L4; naming architecture)
  - web/src/lib/report-pipeline/dimension-owners.ts (the eight dimensions the index scores)
  - web/src/lib/evidence/confidence-cap.ts (verification levels by origin)
```

## Slide 4 — One real company, assessed in public

```yaml
title: One real company, assessed in public
sub: BlockID's own report, produced by the same pipeline every founder gets — blockid.au/showcase/blockid/report
hero:
  type: tile
  description: Four tiles describing what an evaluator reads in the public BlockID showcase report — Score ledger · Evidence per dimension · Gaps marked pending · Valuation range with its method
  data:
    tiles:
      - head: Score ledger
        body: Every point of the index is accounted for — base, dimension adjustments, stage, risk, sector — nothing hidden in a prompt.
      - head: Evidence per dimension
        body: Each of the eight dimensions shows the evidence it rests on and how that evidence was verified.
      - head: Gaps marked pending
        body: What could not be assessed is labelled pending with the evidence that would close it — never scored as zero, never guessed.
      - head: Valuation range, with the method
        body: An honest pre-revenue range with the inputs and assumptions on the page, so a reviewer can disagree with a number, not a mood.
bullets:
  - We publish our own assessment — the same pipeline, no special treatment.
  - Every score is a ledger; every claim carries its verification level.
  - Gaps are labelled pending, with the evidence that would close them.
speaker: We assessed ourselves in public, with the same pipeline every founder gets, and left the gaps visible.
clusters: [C5, C4]
sources:
  - web/src/app/showcase/blockid/report/page.tsx (public BlockID Trusted Business Report, G19-S46)
  - web/src/lib/report-v2/schema.ts (score ledger; unassessed = pending, G19-S41)
  - web/src/lib/showcase/blockid-report.ts (newest stored ReportV2 on the canonical project)
```

## Slide 5 — Programs first. Investors second. Founders own the data.

```yaml
title: Programs first. Investors second. Founders own the data.
sub: Who pays, who benefits, who owns what
hero:
  type: tile
  description: Three tiles — Accelerators & programs (primary buyer) · Investors (secondary) · Founders (data owner, participant, secondary customer)
  data:
    tiles:
      - head: Accelerators & programs — primary
        body: Repeated intake volume, a selection committee and sponsors to report to. They pay for consistency and a defensible record.
      - head: Investors — secondary
        body: Angel groups, syndicates and funds standardise the first-pass review before human investment judgement begins.
      - head: Founders — data owners
        body: The company owns its record, controls disclosure by consent tier, sees what an evaluator can verify and what to improve.
bullets:
  - "Primary buyer: organisations that screen startups repeatedly — accelerators, incubators, universities, innovation programs."
  - "Secondary: investors standardising the first pass; diligence stays human."
  - Founders own their data and choose who sees what.
speaker: Programs with repeated intake pay first; investors follow; and the founder always owns the record.
clusters: [C2, C3, C10]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (primary buyer = organisations with repeated intake volume; founders = data owner)
  - web/src/lib/valuation-certificate/types.ts (DATA_PRINCIPLE_SENTENCE — consent tiers)
  - docs/design/messaging.md § 4b (buyer order)
```

## Slide 6 — Annual program → institutional

```yaml
title: Annual program → institutional
sub: Validation with real payment — the founder ladder stays free-first
hero:
  type: ladder
  description: Bar ladder — Cohort 25 A$5K a year (≤ 25 startups) → Cohort 100 A$15K a year (≤ 100) → institutional (API, sponsor report, custom); callout carries the founder tiers
  data:
    unit: A$ (programs per year)
    bars:
      - label: Cohort 25 (per year)
        value: 5000
      - label: Cohort 100 (per year)
        value: 15000
    callout: "Founders: Free · Starter A$29 a month · Growth A$69 a month — the participant, not the anchor"
bullets:
  - "Wedge: Cohort 25 at A$5K a year (≤ 25 startups) or Cohort 100 at A$15K a year (≤ 100), on the next intake."
  - "Then: institutional expansion — funds, universities and networks with an API and a sponsor report."
  - "Founders: Free, Starter A$29, Growth A$69 a month — secondary revenue."
speaker: A program starts an annual subscription on its next live cohort — a fourteen-day trial with a card on file, then five thousand dollars a year. The first cohort proves it; the renewal validates it.
clusters: [C2, C3]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 5 F-3 (ladder unchanged); founder decision 2026-09-21 (G25 — the paid pilot and its coupon retired, evaluators start on the sold ladder)
  - web/src/config/pricing/plans.csv (accelerator_starter 500000 / accelerator_growth 1500000 annual cents; founder_starter 2900; founder_growth 6900)
  - docs/ops/pricing-truth.md (sold ladder G18)
```

## Slide 7 — Why BlockID: evidence, audit, benchmark, history

```yaml
title: "Why BlockID: evidence, audit, benchmark, history"
sub: The moat is the flywheel — evidence, method, verification, comparability, history
hero:
  type: loop
  description: Seven-step flywheel — More programs → More startups assessed → More structured evidence → More longitudinal outcomes → Better benchmarks and calibration → More useful assessments → Higher evaluator trust
  data:
    steps:
      - More programs
      - More startups assessed
      - More structured evidence
      - More longitudinal outcomes
      - Better benchmarks and calibration
      - More useful assessments
      - Higher evaluator trust
bullets:
  - "Evidence: every dimension shows its evidence level, what is verified and what is still unsupported."
  - "Audit and method: hash-chained trail, public methodology version, human review logged."
  - "Benchmark and history: comparable companies, re-assessed over time — a chatbot keeps none of it."
speaker: A chatbot analyses what you paste; we keep a structured record and apply one method across every company and every point in time.
clusters: [C4, C5]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (moat = evidence + methodology + verification + comparability + longitudinal history + institutional workflow)
  - web/src/lib/audit/chain-verify.ts (hash-chained audit trail)
  - docs/product/score-governance.md (versioning, benchmark rules, human review, corrections)
```

## Slide 8 — What is proven, what is observed, what first cohorts will measure

```yaml
title: What is proven, what is observed, what first cohorts will measure
sub: Every number here is classified in the public claims register
hero:
  type: tile
  description: Four tiles — Proven (production facts) · Observed (production runs) · Programs (credentials) · To be measured (first paying cohorts)
  data:
    tiles:
      - head: Proven
        body: Live product on production with billing; eight dimensions checked against the evidence; hash-chained audit trail; methodology version published with a governance page.
      - head: Observed
        body: A first score on screen in about 60 seconds; the written report delivered in 1 to 3 minutes on production runs.
      - head: Programs
        body: Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception.
      - head: First cohorts will measure
        body: Reduction in first-pass screening time, agreement between evaluators on the same cohort, and founder improvement between assessments.
bullets:
  - "Proven: live product, billing, eight dimensions, audit trail, published methodology."
  - "Observed: first score in about 60 seconds; report in 1 to 3 minutes."
  - "First paying cohorts will measure screening time, evaluator agreement and founder improvement."
speaker: What is proven is the product and the method; what the first paying cohorts will measure is the time saved and the agreement gained.
clusters: [C9, C6]
sources:
  - web/content/claims-register.json (svi-eight-dimensions, free-score-sixty-seconds, first-analysis-delivery — proven / observed rows only)
  - docs/design/public-claims-policy.md § 3 rule 8
  - memory feedback_accelerator_pitch_rules.md (confirmed credentials FI / Spacecubed AI Fellowship / NVIDIA Inception)
```

## Slide 9 — A researcher who ships, and the seat this milestone fills

```yaml
title: A researcher who ships, and the seat this milestone fills
sub: Founder advantage — method from doctoral research, product built and shipped, the commercial co-founder search active
hero:
  type: tile
  description: Four tiles — Founder · Method · Credentials · Next seat (commercial co-founder, active search)
  data:
    tiles:
      - head: Founder — Do Van Long
        body: Built and shipped the platform end to end; runs the assessments, the pipeline and the governance himself.
      - head: Method
        body: Grounded in the founder's doctoral research on startup valuation — a fixed rubric with an evidence ladder, not a prompt.
      - head: Credentials
        body: Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception.
      - head: Next seat — commercial co-founder
        body: Sells to programs and evaluators; the search is active and is the priority hire.
bullets:
  - "Do Van Long — founder; method grounded in doctoral research on startup valuation."
  - "Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception."
  - "Open seat: commercial co-founder for program and evaluator sales — active search."
speaker: I built the method in my doctoral research and the product with my own hands; the next seat is the person who sells it to programs.
clusters: [C6]
sources:
  - docs/plans/g14-investor-feedback-2026-09-16.md (doctoral-research wording rule; commercial co-founder priority)
  - memory feedback_accelerator_pitch_rules.md (credentials; co-founder = active priority)
```

## Slide 10 — The next milestone: one paying cohort

```yaml
title: "The next milestone: one paying cohort"
sub: What we are asking this room for
hero:
  type: number
  description: The number 1 — one organisation paying to assess a live cohort — with the three messages as the strap line beneath
  data:
    value: "1"
    caption: organisation paying to assess a live cohort — the milestone that validates the wedge
    secondary: "25–100"
    secondaryCaption: startups tracked on Cohort 25 / Cohort 100 (A$5K / A$15K a year)
    logos:
      - Screen faster
      - Trust the evidence
      - Track improvement
bullets:
  - "Ask: an introduction to one program running an intake this quarter."
  - "Offer: a Cohort plan on the next intake — up to 25 or 100 startups on one framework, with a cohort report."
  - "Then we publish what the first cohort measured — screening time, agreement, improvement."
speaker: Introduce us to one program with an intake this quarter; we will assess the cohort on a Cohort plan, and publish what the first cohort measured.
clusters: [C2, C9]
sources:
  - docs/plans/g21-fi-upgrade-2026-09-20.md § 0 (validation = real payment); G25 (2026-09-21): the wedge is the Cohort plan itself (caps 25 / 100 from plans.csv)
  - docs/design/messaging.md § 4b (three messages)
```

## 3-minute cut

Six slides, under 420 words. Every sentence is one breath or two, never more than twenty words per breath, and carries none of the forbidden internal tokens.

| # | Slide | Time | Seconds | Beat |
|---|---|---|---|---|
| 1 | S2 — Screening was not designed to scale | 0:00–0:25 | 25 | The problem |
| 2 | S3 — Application → evidence → index → dossier → cohort | 0:25–1:05 | 40 | The product |
| 3 | S7 — Why BlockID: evidence, audit, benchmark, history | 1:05–1:35 | 30 | Why not a chatbot |
| 4 | S6 — Annual program → institutional | 1:35–2:10 | 35 | Business model |
| 5 | S8 → S9 — Proven, observed, to be measured (+ founder) | 2:10–2:35 | 25 | Validation and founder |
| 6 | S10 — The next milestone: one paying cohort | 2:35–3:00 | 25 | Ask and close |

### Script

Every accelerator reads different inputs. A deck here, a form there, a spreadsheet from the sponsor. Each reviewer applies a private rubric, so the scores never compare. The founders who are passed on hear nothing specific, and they come back next round with the same gaps.

Here is what BlockID does. A founder submits an application, a deck, a website or a business identifier. We extract the evidence and label each claim by how it was verified. Every company lands on the same index with a confidence level. Each gets a dossier, and every applicant sits side by side in one cohort table. The same company is re-assessed over time, so improvement is visible rather than assumed. BlockID structures the evidence and standardises the first pass. Humans make the decision.

Why is this not a chatbot? A chatbot analyses what you paste and remembers nothing. We keep a structured, evidence-backed record of the company. Then we apply one method across every company and every point in time. Every score is a ledger. Every claim carries its verification level. The methodology version is public, the audit trail is hash-chained, and human overrides are logged. More programs mean more companies assessed, more structured evidence, better benchmarks, and higher trust.

How we make money. Programs with repeated intake pay first. The wedge is the annual subscription itself, started on the next real intake. Five thousand a year for twenty-five companies, fifteen thousand for a hundred. A two-week trial, card on file. The first cohort proves it; the renewal validates it. Founders stay free first, with paid plans as a secondary line. We validate with payment, not with sign-ups.

What is proven today is the product and the method: live on production with billing, eight dimensions checked against the evidence, an audit trail, and a published methodology. What is observed is speed: a first score in about a minute. What the first paying cohorts will measure is screening time saved, agreement between evaluators, and founder improvement. I built the method in my doctoral research and the product with my own hands. The next seat is a commercial co-founder who sells to programs, and that search is active.

The ask is simple. Introduce us to one program running an intake this quarter. We will assess the cohort on one framework and publish what the first cohort measured. Screen faster. Trust the evidence. Track improvement.

## Provenance

Every number that appears in a slide title, sub-line, bullet or hero data is listed here with the file it was confirmed against on 2026-09-20. Slide 8 is restricted further: its numbers must be proven or observed rows of `web/content/claims-register.json`.

| Number | Slide | Source file / URL | Note |
|---|---|---|---|
| 5K / 5000 (Cohort 25 per year) · 15K / 15000 (Cohort 100 per year) | 6, 10 | `web/src/config/pricing/plans.csv` `accelerator_starter` 500000 / `accelerator_growth` 1500000 annual cents; `docs/ops/pricing-truth.md` | live; G25 (2026-09-21) retired the paid pilot — the Cohort plan is the wedge |
| 25 / 100 (Cohort sizes) · 25–100 | 6, 10 | `web/src/config/pricing/plans.csv` (`profiles` 25 / 100) | |
| 29 (Starter per month) · 69 (Growth per month) | 6 | `web/src/config/pricing/plans.csv` `founder_starter` 2900 / `founder_growth` 6900 cents | live |
| 60 (seconds to a first score) | 8 | `web/content/claims-register.json` `free-score-sixty-seconds` (observed) | observed on production runs |
| 1 to 3 (minutes to the written report) · 1 · 3 | 8 | `web/content/claims-register.json` `first-analysis-delivery` (observed) | observed range |
| eight (dimensions) | 3, 4, 8 | `web/content/claims-register.json` `svi-eight-dimensions`; `web/src/lib/report-pipeline/dimension-owners.ts` | proven; written as a word on the slides |
| 1 (organisation paying to assess a live cohort) | 10 | `docs/plans/g21-fi-upgrade-2026-09-20.md` § 0 (next milestone) | the milestone, not traction |
| 659 615 111 (ACN) | footer, front-matter | `web/src/lib/site/legal-entity.ts` `LEGAL_ENTITY.acn` | the generator reads the config; the test asserts parity |

Numbers deliberately **not** on any slide: startup / report / snapshot counts (not yet a claims-register row with a dated script), agent counts (messaging § 11), the legacy three-dollar report price (never an anchor), market-size estimates, any funding ask or valuation (next-milestone framing only).
