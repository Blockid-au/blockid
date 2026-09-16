# G14 — Investor pitch feedback (3-minute pitch, 19 judges) → Deck v3 traceability

**Date recorded:** 2026-09-16 · **Goal:** G14 "Investor Feedback: credibility loop" · **Plan:** `/home/dovanlong/.claude/plans/ph-n-t-tch-t-on-b-snuggly-panda.md` §0–§2, §5
**Deck answer:** `web/content/pitch/pitch-deck-v3.md` (source of truth) → `web/public/pitch/SVI-Pitch-Deck-PreSeed-2026-09.pptx`
**Entity on every investor document:** Auschain PTY LTD · ACN 659 615 111 (marketing pages stay PPL Food PTY LTD — deliberate split, see memory `business_entity.md`).

This file follows the G13 companion-folder pattern (`docs/plans/<goal>/00-*.md`). It is the only place the judge comments live; do not paraphrase them elsewhere — link here.

---

## 1. The judge comments (verbatim, unedited)

18 named entries were handed over from the 3-minute pitch session (the session counted 19 comments; nothing below has been dropped or edited — one judge's note was not attributed by name).

1. **Bill Trestrail:** Problem needs to be clearer.
2. **James Moody:** Challenge here is that this feels a bit like a claude skill
3. **Bjorn Halfmann:** I like your idea of a two sided market place for startups and investors, the ideas has potential if you can establish yourself as a trusted platform. Your business model needs to be clearer explained in your pitch deck, I've missed it completely. Good luck
4. **Brendan Yell:** I like a score number that is nto just valuation. Integrations into systems that vc use. You will need a large amount of trust. Look at historical crunchbase and pithcbox data (if you can get it). PS change the name
5. **Sameer Babbar:** brilliant but will need some tweaks
6. **GRAEME OGILVIE:** Needs to simplify the problem and soliution to clearly articulate the opportunity
7. **Keith Forbes:** Well prepared deck and clearly knowledgeable on his subject matter. It's a complex subject matter so some degree of simplification and real world examples would assist. I'd like to see 3 strong key messages at the end that highlight the main reasons the customer should buy.
8. **Rae Wang:** This tool seems to produce some polish for a slide deck, but doesn't really build a compelling story for startups that truly move investors – eg. 10X vision, differentiating product/technical strategy, customer traction, innovative experience etc.
9. **Dane Eldridge:** Competitive space… with existing data sets… feel like you need a major advantage to get to scale… which wasn't clear in the pitch. The numbers – pricing seems very cheap – are going to need huge volume to make that work commercially.
10. **Christopher Krainer:** Angels, pre-seed and seed seem the wrong audience, is mostly narrative based. Heavily underpriced with 3$ per report. Problem is real and big, solution seems to require adjustment. How do you take execution capability of the founder team into account?
11. **Roger Do:** The party paying for the service are not the main recipient of the reports. This is a mismatch of problem and space.
12. **Alex Sy:** need more clarity of the pitch
13. **Liane Briner:** dont understand what's on offer and who it's for – would be good to refine offering
14. **Anne Marie Elias:** It's a great idea – VCs, founders hubs, startup accelerators just need more work on pitch & competitor landscape
15. **Shreya Gupta:** It's a simple idea, presentation needs to be simple too. Research and data on and from target customers is missing. GTM, and how the business will make money.
16. **Jo Ann Suchard:** Slides too busy. Clarity on customer, product abd competitive landscape. Why are you the right person to execute your vision.
17. **Anne McGuire:** Needs clearer proposition of what the solution is. Focus on core offering for presentation. The presentation slide deck contained a lot of information that was quite overwhelming and I struggled to read or able to consume. Granted 3 minutes is so short, so get really targeted with your narrative and what the offering is.
18. **Helen Flitcroft:** I love that this is an objective, digital tool designed to evaluate a startup. I was unclear exactly who the tool was for and building the 'library' manually sounds onerous. I could imagine it being used as a founder-fed pitch ingestion machine that not only supports investor decisions but that actually provides useful rejection feedback for founders.

---

## 2. Traceability — cluster → judges → deck slide → site change → G14 sprint

Clusters C1–C10 are the plan's §1 grouping. "Site change" refers to plan §2.4 items (1–4). Sprint ids are G14 S33–S40 (plan §5).

| Cluster | Theme | Judges | Deck v3 slide(s) | Site change (§2.4) | G14 sprint |
|---|---|---|---|---|---|
| C1 | Problem / offer unclear, too complex, slides too busy | Bill Trestrail, Graeme Ogilvie, Keith Forbes, Alex Sy, Liane Briner, Anne McGuire, Jo Ann Suchard, Shreya Gupta (8/19) | S2 problem (one number), S12 three key messages; every slide ≤3 bullets, ≤40 words, one hero | §2.4-1 hero line I2 rewrite (EN/VI) | — (deck) |
| C2 | Business model invisible; payer ≠ recipient; angels/pre-seed wrong audience | Bjorn Halfmann, Roger Do, Christopher Krainer, Shreya Gupta, Dane Eldridge | S3 "Evaluators pay. Founders get the feedback.", S6 pricing ladder, S7 who buys, S11 ask | §2.4-2 `solutions.investor.headline`; §2.4-3 `/pricing?persona=investor` | S33 (traction snapshot + investor update); Pricing v4 (plan §3) |
| C3 | A$3 too cheap, needs huge volume | Christopher Krainer, Dane Eldridge | S6 "A$3 is a lead. Programs are the revenue." with month-12 ARR callout | §2.4-3 pricing tab | Pricing v4 (Fund A$999, Intake link A$249, Cohort 25/100 public) |
| C4 | Trust, VC-tool integrations, historical Crunchbase/PitchBook data, competitor landscape, change the name | Brendan Yell, Dane Eldridge, Anne Marie Elias, Jo Ann Suchard | S1 brand "Startup Value Index", S5 audit + evidence ladder, S8 competitive 2×2 | §2.4-4 `/compare` row `dealdata` (Crunchbase/PitchBook) + price anchors | S36 verification integrity + `/methodology`; S38 Evaluator API + Slack/Affinity/Airtable; S39 backtest v0; S40 open AU external signals |
| C5 | "Feels like a Claude skill" / polish, no 10X story | James Moody, Rae Wang | S5 "Not a prompt. A rubric with receipts.", S8 moat (live judgement vs static deal data) | — | S36 (`/methodology` public); S39 (calibration published) |
| C6 | Founder execution capability? Why you? | Christopher Krainer, Jo Ann Suchard | S10 team (DBA research, product shipped, commercial co-founder search); S9 proof of shipping | — | S37 founder execution profile |
| C7 | Three key messages at the end; real-world examples | Keith Forbes | S12 three key messages; S2 Sydney Angels ~40 applicants/cycle example | — | — (deck) |
| C8 | Founder-fed pitch ingestion + useful rejection feedback | Helen Flitcroft | S3 loop (PASS/TRACK/PROCEED → reasons → re-score); S4 dossier → verdict screenshot | §2.4-2 headline "send every founder you pass on the reasons why" | S34 founder feedback letter; S35 program intake link + scored inbox |
| C9 | Customer research and data missing; GTM | Shreya Gupta | S7 bottom-up AU buyer count; S9 pilots pipeline; S11 milestones | — | S33 traction snapshot; GTM 90-day (plan §4: 10 interviews, 5 pilots, intake wedge) |
| C10 | Positive: score ≠ valuation, objective, two-sided if trusted, good for VC / hubs / accelerators | Brendan Yell, Helen Flitcroft, Bjorn Halfmann, Anne Marie Elias | S1, S12 — kept as the three key messages | — | — (kept) |

Judges with a single positive/neutral note and no actionable cluster: Sameer Babbar ("brilliant but will need some tweaks") — treated as C1 support.

---

## 3. Live numbers used on 2026-09-16

Numbers a slide may carry are marked **slide-safe**; the rest are for this doc / investor update only.

| Number | Value | Slide-safe | Source |
|---|---|---|---|
| `svi_analyses` rows | 182 | yes (S9 "182 startups analysed") | `docs/plans/reviews/capacity-audit-2026-09-13.md` (pg_stat sizes table); `web/content/reports/ceo-daily-2026-09-16.md` "Analyses: 182" |
| `svi_snapshots` rows | 3,302 | yes (S9 "3,302 weekly snapshots") | `docs/plans/reviews/capacity-audit-2026-09-13.md` sizes table |
| `app_users` rows | 116 | **never on a slide** — partly seeded (qa-*, demo, evaluator seeds) | `web/content/reports/ceo-daily-2026-09-16.md` "Users: 116"; capacity audit shows 88 rows on 2026-09-13 |
| Insight articles | 97 published (107 files in `web/content/insights/` incl. drafts/indexes) | no | `web/content/insights/` |
| Grants + programs seeded | 56 grants + 199 programs | no (site says "every open Australian grant" — directory, not a count) | `web/content/reports/project-state.json` (G11 S0/S1 note) |
| Comparable rows (hand-curated) | 72 per plan §1 C4; counted today 38 (`au-comparable-raises.ts`) + 33 (`data/au-comparables.ts`) = 71 | no — never "500+ comparables" | `web/src/lib/au-comparable-raises.ts`, `web/src/lib/data/au-comparables.ts` |
| Stripe | 0 subscriptions · 5 one-off charges (A$1–9) | no | plan §0 (Stripe dashboard read 2026-09-16) |
| Evaluator ladder live | Scout A$79 · Firm A$149 · Program A$349 (monthly, 7-day card-required trial) | yes (S6) | `web/src/config/pricing/plans.csv` |
| Founder ladder live | Free · A$3 Trusted Business Report · Starter A$29 · Growth A$69 | yes (S6) | `web/src/config/pricing/plans.csv`, `web/src/lib/credits.ts` |
| Rubric | 8 dimensions (TRE 20 · MPC 18 · FTV 15 · PTD 12 · CGH 12 · IRI 10 · LCO 8 · SVM 5) × 13 criteria, engine v2.1.0 | yes (S5) | `web/src/lib/report-pipeline/dimension-owners.ts`, `web/src/lib/evaluation-criteria.ts`, `web/src/lib/svi-analysis.ts` `SVI_VERSION` |
| Evidence ladder | 0.20 → 0.35 → 0.50 → 0.75 → 0.90 → 1.00 | yes (S5) | `web/src/lib/svi-analysis.ts` `EVIDENCE_CONFIDENCE` (~L79) |

Source files for the operational counts: `web/content/reports/ceo-daily-2026-09-1{4,5,6}.md`, `docs/plans/reviews/capacity-audit-2026-09-13.md`.

---

## 4. What changes because of this file

- Deck v3 replaces v1 (`web/content/pitch/pitch-deck-v1.md`), v2 (`.claude/goals/pitch-deck-v2-investor.md`) and the video slide guide (`web/public/video-assets/blockid_pitch_slides.md`) — all three carry a SUPERSEDED banner.
- `web/public/pitch/BlockID-Pitch-Deck-Antler-2026.pptx` (May 2026, generated by `web/scripts/generate-pitch-deck.ts`) is kept for history; the current deck is `web/public/pitch/SVI-Pitch-Deck-PreSeed-2026-09.pptx` (`npm run pitch:v3`).
- Executive summary rewritten to the v3 narrative (`web/content/pitch/executive-summary.md`).
- `.claude/skills/investor-relations/SKILL.md` Context block updated to the evaluator-first model and the entity rule.
