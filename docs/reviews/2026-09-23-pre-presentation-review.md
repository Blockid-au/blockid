# Pre-presentation & pre-sale review — 2026-09-23

**Historical review — diagnosis corrected:** the token/reasoning root-cause
claim below was withdrawn by the subsequent routing plan and degradation
handover. See the [source/log/test revalidation](2026-09-23-report-quality-plan-revalidation.md)
for the current findings and disposition. This document remains the original
review record; neither its diagnosis nor its word-count smoke target is a
current release acceptance gate.

Read-only review of the plan, the source and the live product before the founder
presentation. No code, DB, Stripe or deploy changes were made. Live at review time:
**v3.33.3 `cba40ad1e`** (18 commits unreleased; last deploy attempt failed).

---

## 0. The one thing to fix before you present

**The report generator has produced zero words on every run since 2026-09-21 11:34 —
38 hours, 29 consecutive runs, 8 of 8 chapters degraded every time.**

`web/content/reports/tbr-quality.jsonl` (latest 2026-09-23T01:12): `groundedShare 0`,
`degradedSections 8`, `words 0`, `pages 0`, `calls 37`, `costUsd 0.0019`.
`/api/status.tbr_quality` reads `status: "watch"`, `degradedShare: 1`.

### Root cause — proven by measurement, not inference

It is **not** provider capacity and **not** a pipeline regression. It is a token-budget
interaction with reasoning models:

1. The daily free-model refresh has rotated the whole 10-rung chain onto **reasoning
   models** — `openai/gpt-oss-120b`, `gpt-oss-20b`, `nvidia/nemotron-*-reasoning`,
   `inclusionai/ling-3.0-*` (`web/content/ai-provider-registry.json`).
2. Standard tier — the A$3 report **and every free report** — allows
   **1,500 max tokens per agent**, ×0.85 = **1,275** for normal tasks
   (`web/src/lib/report-pipeline/types.ts:32`, `agent-dispatcher.ts:589`).
3. Reasoning tokens are billed against that same budget. Measured against DeepInfra
   `openai/gpt-oss-120b` with a long prompt:

   | max_tokens | content | reasoning | finish_reason |
   |---|---|---|---|
   | 400 | **0 chars** | 2,042 | `length` |
   | 800 | 239 chars | 3,926 | `length` |
   | 1,500 | 1,782 chars | 2,586 | `stop` |

   The reasoning trace eats the budget, `message.content` comes back empty, and the
   client logs `Empty DeepInfra response` / `Empty Groq response` / `Empty response`
   — exactly the lines in `/data/logs/blockid-production.log`.
4. An empty answer strikes the provider out for the run (`RUN_STRIKE_THRESHOLD = 2`,
   `src/lib/ai/run-strikes.ts:24`), the next rung is another reasoning model, and the
   run ends "All AI providers are blocked".

The paid provider is healthy and cheap. Measured live during this review:
DeepInfra `DeepSeek-V4-Flash` (non-reasoning) answered a 3,649-token report prompt in
**11.6 s**, and **8 parallel chapter calls all returned in ≤ 7 s**, at
**US$0.0004 per call** — about **US$0.015 for a 37-call report**.

### Fix (surgical, ~30 minutes, testable before the meeting)

1. Pin the `report` task class to a **non-reasoning** model — DeepInfra
   `deepseek-ai/DeepSeek-V4-Flash` — or exclude reasoning models from the report
   ladder in the model auto-refresh.
2. Give reasoning models reasoning headroom (≈ 3× budget) or send
   `reasoning_effort: "low"`; never let them inherit the 1,275-token budget.
3. Treat empty content with `finish_reason: "length"` as a **model** failure that
   advances to the next model, not a **provider** strike.
4. Regenerate the showcase, confirm `groundedShare > 0`, then present.

Until that lands: **do not demo the live free-report flow.** `/tbr/demo` renders a
hand-written fixture (`src/lib/report-v2/fixtures.ts`) — it demos copywriting, not the
generator. Demo the stored 2026-09-21 snapshot and say it is a stored run.

---

## 1. Report quality — the honest assessment

### Genuinely strong, and defensible under questioning (lead with these)

| Feature | Where | Why it beats a chatbot |
|---|---|---|
| **Score ledger** — base → each signal ±points → × weight × evidence confidence | `components/tbr/v2/chapter.tsx:70-137` | Fully reconstructible arithmetic on every chapter. Nobody else shows their working. |
| **The model is clamped to ±10 of the deterministic score, and the attempt is printed** | `report-pipeline/agent-dispatcher.ts:1430-1443` | "The model may move our number by at most 10 points, and we print when it tried" is a claim ChatGPT structurally cannot make. **This is the strongest asset in the repo and it appears nowhere in the marketing.** |
| **n ≥ 10 or no number** | `lib/benchmarks/publication-rules.ts` | One chokepoint for every percentile on web/PDF/DOCX/email. Below n = 10 the product refuses to print. |
| **Unverified claims argued in public** | `report-v2/investment-view.ts:292,366` | Uncited material claims become a chip, a risk row and a condition on the verdict. The product argues against itself. |
| **Deterministic A–D verdict** that records which rule fired; when the CEO agent disagrees it renders below as "Analyst synthesis" rather than overwriting | `investment-view.ts:244-257,420-422` | Re-runnable, auditable. |
| **Pre-revenue honesty** — revenue methods print "Needs revenue: connect Stripe/Xero" instead of faking; founder-stated ARR halves method weight | `agents/cfo-valuation.ts:786-797` | |
| Appendix, 90-day plan (lift ÷ effort), Money on the table | §14–16 | Real, differentiated work. |

### The five weakest points

1. **The generator is dead** (§0).
2. **The valuation blend is one estimator in four costumes.** `cfo-valuation.ts:737-770`:
   `dcf_proxy = ARR × (low multiple + 1)` — no cash flows, no discount rate, no terminal
   value; `risk_factor_summation = ARR × median × (1 + tax uplift)` — no risk factors;
   `comparables = ARR × median × growth tier`. Together with `revenue_multiple` that is
   **90 % of the weight on a single ARR multiple**, presented as "consensus across 5
   methods". In the demo the four land within 4 % of each other (A$8.1M / 8.4M / 8.1M /
   8.19M). **This is the first thing a VC who knows valuation will test.**
   *Fix tonight (copy only, no model change): rename `dcf_proxy` → "Growth-adjusted
   forward multiple", `risk_factor_summation` → "Tax-incentive-adjusted multiple", and
   change "consensus across N methods" to "N weighted methods".*
3. **Chapter prose is capped below diligence depth.** Verdict truncated to 60 words
   (`chapter.tsx:553`), criterion verdicts to 20 (`:334`), and the long-form narrative is
   **withheld entirely** unless the section audited perfectly clean
   (`criterion-analysis.ts:26`). A 20 %-weight dimension gets ~110 visible words.
4. **`groundedShare 0.82` overstates the assurance** (and is below the 0.85 KPI). 18 of
   22 sections were `skipped: "clean"` — never LLM-audited; "grounded" is satisfied by
   citing a row whose own provenance says *"platform rule of thumb… not measured for this
   startup"* (`computed-facts.ts:80-84`). It measures citation hygiene, not evidential
   strength.
5. **The benchmarks have no peers.** `svi-dimension-benchmarks.ts:32-40` is hand-authored
   anchor numbers interpolated across stages. The n = 49 backtest used as a valuation
   cross-check is non-monotonic across quartiles (Q1 A$8.25M → Q2 A$50M → Q3 A$47.5M →
   Q4 A$147.5M) with **ρ = 0.09 at series-A**. The n ≥ 10 rule is rigorously enforced on
   numbers that were not measured.

### Defects visible on the live demo page today

- **"Why back" / "What weighs against" rows are mis-paired** — the bold lead and the body
  come from different lists, joined by index: *"Key-person risk on the CEO — Connect
  GitHub to audit the repository"*, *"Cohort retention M6 = 88 % — A$1.2M ARR…"*. This is
  the most-read block in the report.
- **The report contradicts itself about Stripe**: the chapter says *"No revenue connector
  in this snapshot"* while Evidence used lists *"Stripe revenue (last sync) · evidenced"*
  and the valuation cites *"connector-evidenced: stripe"*.
- **"no published cohort"** in the chapter header while the same chart plots
  p25 37 / p50 52 / p75 67.
- Internal provenance labels leak to the reader: `uncited`, `Auditor: grounded`, `cro`.
- All three risks carry an identical `+6 SVI`, which reads as templated.

---

## 2. Our report vs what an AI agent gives an investor

### What we can prove

One fixed rubric with fixed weights; a deterministic score with the model clamped to ±10
and the reconciliation printed; pending ≠ zero; every benchmark carries n or is suppressed
(code-enforced); a 6-rung evidence ladder with origin caps prose cannot self-upgrade; an
auto-citer plus auditor with a published grounded share; a verdict band that cannot be
hand-edited on any surface; the same 16 sections on web/PDF/DOCX/email; an append-only
hash-chained audit log; published governance and versioning.

### What we claim but cannot prove — fix before the deck goes out

| Claim | Where | Reality |
|---|---|---|
| "72 Australian comparable raises, growing weekly" | `i18n/messages/en.json:462` | `AU_COMPARABLES` holds ~33 rows; backtest used n = 49. The figure is hard-coded, and the code comment admits it. |
| "A score that updates every week" | `en.json:423,466` | The daily snapshot copies dimension scores out of the last stored analysis; it does not re-run the pipeline. Re-analysis is quarterly. |
| "A C-suite of AI agents, each with its own domain module" | `en.json:454,505` | `supportingAgents` **never executes** — supporting agents are prompt context. `DimensionChapter.modules` is persisted but read by exactly one component. One voice per criterion, one per dimension. |
| "Inside-out review with Australian market context" | `/compare` | The market branch is two general-knowledge model calls with **no retrieval** (`lib/adk/agents/market-research.ts:22`). **On market and competitors we do exactly what we accuse ChatGPT of doing.** This is the sharpest credibility hole. |
| "30–60 min of prompting per company" | claims register | Graded `hypothesis` — no measurement. |
| 88–99.9 % gross margins | claims register | `hypothesis`, model output. Label it or drop it from any slide. |

**There is no head-to-head measurement against a chatbot anywhere in the repo** — no A/B
fixture, no blind-rater study, no baseline column. Every "better than ChatGPT" claim rests
on structural arguments. Those arguments are true and code-enforced; say *that*, and stop
short of comparative performance claims.

### Investor perspectives we do not cover (a VC will notice)

1. **No return math** — no ownership at entry, dilution path, exit scenarios, MOIC or IRR.
   The report says what the company is worth, never what *your cheque* returns. Biggest
   gap versus a real IC memo.
2. **No real competitive analysis** — the competitor set is model recall; the demo's own
   chart admits *"competitor set arrives with GATHER research"*. No funding data, no
   feature matrix, no incumbent response.
3. **No runway / use of funds** — "burn multiple 1.4" is the only cash signal; no months
   of runway, no raise, no use of proceeds.
4. **No customer evidence layer** — no references, no NPS, no retention curves.
5. **No deal terms** — preference, pro-rata, board composition; the term-sheet tool exists
   but never enters the report.
6. **No "why now" and no "what would have to be true"** falsifiable-hypothesis block.
7. **Series-A blind spot** — ρ = 0.09 at the stage institutional buyers mostly buy at.

---

## 3. Plan and governance state

- **`docs/plans/SOURCE-OF-TRUTH.md:3` now says "APPROVED IMPLEMENTATION".** Every other
  doc — `ROADMAP.md:3`, eleven `docs/plans/g*.md` headers, `docs/ops/ready-to-sale.md:3`,
  `docs/ops/founder-items.md:3` — still says "PROPOSED, implementation not started".
  Reconcile before presenting; do not show both.
- **Three versions of truth**: `ready-to-sale.md` header v3.27.2 · `package.json` 3.33.0 ·
  `version.json` v3.33.3 · `project-state.json` 3.17.0 (whose architecture summary still
  describes the product as "evaluator-first", the positioning G30 replaced).
- **QA evidence is stale.** `ready-to-sale.md` cites live-qa 306/0 — that run is
  2026-09-21 against v3.27.x, ~200 commits ago. No full QA has run against v3.30–3.33.
- **Deploy hygiene has slipped**: recent deploys pass **8/10 gates with 2 skipped and
  `lint: not-run`**; the last attempt failed ("Candidate resource pressure persisted");
  202 unpushed commits at the last security snapshot.
- **G28 closed against an unmet acceptance criterion** (its lane A required
  `groundedShare ≥ 0.85`; it closed "pinned, not verified live"). **G29 is still OPEN** in
  its own file while its code shipped.
- **Zero customer validation exists**: `validation-tracker.json` has 0 entries;
  `docs/research/evaluator-interviews-2026-09.md` shows 0 of 10 interviews. Your own plan
  file says not to call shipped tasks validation. Own it rather than be caught.
- **Security posture 64/100 (yellow)**: rate limiting 0/10 (28 of 687 routes), 63 tables
  without RLS, 147 ungated API routes, 2 high CVEs. `secrets_hygiene 0/10` is a false
  positive on the detector's own pattern list — explainable in ten seconds, but it is on a
  public dashboard.
- **Live 404s on linked surfaces**: `/for/investors` and `/checkout/review` both 404.
- **`/samples` says "Three real runs… nothing here is invented"** but the numbers are
  constants in `sample-runs.ts` with no analysis id behind them. If someone asks to see
  those three runs, we cannot produce them. Soften the copy or regenerate real runs.

---

## 4. Priority order before the presentation

**Tonight (P0)**
1. Fix the reasoning-model token budget; regenerate the showcase; confirm
   `groundedShare > 0`. (§0)
2. Relabel `dcf_proxy` / `risk_factor_summation` and drop "consensus across N methods". (§1.2)
3. Fix the mis-paired "Why back / What weighs against" rows and the Stripe
   connector contradiction on the demo. (§1)
4. Decide: demo the stored snapshot, or the live flow once (1) is verified.

**Before the deck goes out (P1)**
5. Correct or remove: "72 comparables growing weekly", "updates every week", the C-suite
   agent claim, the 30–60 min anchor, the 88–99.9 % margin line. (§2)
6. Reconcile the status headers and the four version numbers. (§3)
7. Fix `/for/investors` and `/checkout/review`. Soften the `/samples` provenance line.

**Have an answer ready for**
- "Walk me through your DCF." → it is a growth-adjusted multiple; here is the ledger.
- "What n is behind your benchmarks?" → dimension anchors are authored; cohort
  percentiles publish only at n ≥ 10; here is the rule in code.
- "How many customers have you talked to?" → zero so far; here is the instrument and the
  October target.
- "How is this better than ChatGPT?" → lead with the ±10 clamp, the n-floor and the
  unverified-claims register. Do not claim measured superiority; we have not measured it.

**After the presentation (P2)** — return math (ownership/dilution/MOIC), real competitive
analysis with retrieval, runway and use of funds, chapter word caps, and a head-to-head
evaluation fixture against a generic model answer.
