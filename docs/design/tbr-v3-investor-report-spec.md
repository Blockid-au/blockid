# TBR v3 — investor-grade valuation + investment report (G27 research + spec)

**Date:** 2026-09-21 · **Lane:** G27 research/spec · **Builds from:** ReportV2 (`web/src/lib/report-v2/schema.ts`), today's render (`web/src/components/tbr/v2/report.tsx`), the light template (G26) · **Wireframes:** `docs/design/tbr-v3/wireframes.md`
**Founder ask (2026-09-21):** a clear, coherent Trusted Business Report — the 8 dimensions read like a full startup-value + investment report: is it worth investing in, what must improve, key points made obvious, pro layout.

## 0. What the research says (and what we take from it)

| Standard document | Structure we adopt | Source |
|---|---|---|
| VC investment-committee memo | Recommendation in the first paragraph; deal header (valuation/terms) up front; "Risks & mitigants" as the last substantive section; the 2–3 risks that matter, not a list | [VC Factory IC memo guide](https://thevcfactory.com/investment-committee-memos/), [Bessemer memo library](https://visible.vc/blog/bessemer-investment-memos/) |
| Sell-side / CFA equity research | Front matter → **Recommendation + target** → company → industry → financials → **Valuation** (methods, key inputs) → **Risks**; every number footnoted | [CFA "Elements of a company research report"](https://analystprep.com/cfa-level-1-exam/equity/elements-of-company-research-report/), [CFA Research Challenge essentials](https://www.cfainstitute.org/sites/default/files/-/media/documents/support/research-challenge/challenge/rc-equity-research-report-essentials.pdf) |
| 409A / independent valuation | Executive summary → scope → company → financials → **methodologies** → risk → comparables → **reconciliation with explicit weights** → limiting conditions; always a range + weighting logic | [409.ai walkthrough](https://www.409.ai/articles/decoding-a-409a-valuation-report-walkthrough), [Transaction Capital sample](https://txncapitalllc.com/blog/409a-valuation-report/) |
| VC due-diligence report | Fixed domains (financial, team, market, product/tech, legal/governance, ops) each with the same anatomy; findings → evidence → gap | [Wall Street Prep VC diligence](https://www.wallstreetprep.com/knowledge/venture-capital-diligence/), [ACA due-diligence playbook](https://www.angelcapitalassociation.org/data/Documents/Members%20Only/BestPractices/E3e%20-%20Due%20Diligence%20Checklists%20and%20Reports/Due_Diligence_Playbook_Generic_with_Appendices.pdf) |
| Pre-revenue scorecards | Berkus (5 pillars, capped) and Payne scorecard (weighted vs regional median) are shown as **rows with weights**, never a single figure | [Venionaire — Payne scorecard](https://www.venionaire.com/startup-valuation-payne-scorecard-method/), [Allied VC — Berkus](https://www.allied.vc/guides/berkus-method-vs-other-valuation-models) |
| Australian context | Cut Through Venture reports valuation/term dynamics **with deal counts** — a benchmark always carries n; ASIC RG 244: a general-advice warning must convey "prepared without regard to your objectives, financial situation or needs" in plain words | [Cut Through — State of AU Startup Funding](https://www.cutthrough.com/insights/state-of-australian-startup-funding-2025), [ASIC RG 244](https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-244-giving-information-general-advice-and-scaled-advice) |
| Report design | One-page executive dashboard, 5–7 metrics; same template every period so comparisons hold; tables for data, prose for judgement | [Jirav — executive summary](https://www.jirav.com/blog/executive-summary-report-financial-reporting-best-practices), [appdeck — exec dashboard](https://appdeck.com/blog/executive-summary-dashboard-guide) |

**Gap in today's render** (`/showcase/blockid/report`, `/tbr/demo`): the verdict sits in section 3 and the valuation in section 12; the eight chapters open with a score ledger and a raw evidence table (UUID ids) before the reader learns the judgement; no risk matrix; no per-dimension investor takeaway; the executive summary prints "evidence confidence 0 %" while the cover prints 64 % (alignment bug); the valuation table overflows at 375 px.

## 1. Target reader and the three page-1 answers

Readers, in priority: **evaluator** (angel / fund analyst / program screener — decides in 3 minutes whether to read on), **founder** (wants the improvement path), **advisor**. Page 1 must answer, in this order:

1. **Is this worth investing in?** — a verdict band with conditions (§ 4), evidence confidence beside it, and "evaluators make the decision" in the sub-line.
2. **What is it worth?** — the consensus range in A$ (`valuation.consensus`), the number of methods that ran, and the ask alignment when an ask exists.
3. **What must improve?** — the top 3–5 improvements ranked by expected SVI lift ÷ effort, each with its lift.

## 2. Section order v3

| # | Section (EN / VI) | Rationale | ReportV2 source | NEW derived |
|---|---|---|---|---|
| 1 | **Dashboard** (cover) / Bảng tổng quan | One page = memo deal header + research front matter | `cover.*`, `cover.svi`, `cover.evidenceLevel`, `cover.verification`, `valuation.consensus`, Assessment Card (`lib/svi/assessment-card.ts`) | `investmentView.band`, `compositeScore` |
| 2 | **Investment view** / Góc nhìn đầu tư | Recommendation first (IC memo rule) | `executive.structured` (summary, reasons, gaps, phaseNow, verdict), `phaseGates.blockers`, `valuation.ask` | `investmentView` (§ 4) |
| 3 | **Key points** / Điểm chính | Five bullets a screener can paste into notes | `executive.structured.headline/keyInsight`, top reason, top gap, valuation line, verdict line | `keyPoints[5]` |
| 4 | **Valuation** / Định giá | Research + 409A order: methods → weights → range → reconciliation → what moves it | `valuation.methods/consensus/ask/inputs/derivation/crossChecks/sectorMultiples/comparables/scenarios/narrative` (`valuation-view.ts`) | `whatMovesIt[]` |
| 5–12 | **8 dimension chapters** (DIM_ORDER) | Diligence-report domains, identical anatomy (§ 3) | `dimensions[i]` | `investorTakeaway` |
| 13 | **Risk matrix** / Ma trận rủi ro | Memo's "risks & mitigants" closes the argument | chapter `gaps`, `phaseGates.blockers`, unverified claims, `valuation.ask` | `riskMatrix[]` |
| 14 | **90-day improvement plan** / Kế hoạch 90 ngày | Prioritised by lift ÷ effort | `actionPlan.steps`, `dimensions[].nextAction`, `criteria[].nextAction`, `actionPlan.evidenceToAdd` | `improvementPlan[]` |
| 15 | **Money on the table** / Nguồn vốn phi pha loãng | Kept, after the plan (funds the plan) | `moneyOnTable` | — |
| 16 | **Appendix** — method · phase-gate matrix · score ledger · evidence register · audit log · Evidence cited · disclaimers | Limiting conditions last (409A) | `appendix.*`, `phaseGates.matrix`, `cover.sviLedger`, `dimensions[].scoreBreakdown`, citations | — |

Phase gates move into the appendix as the matrix; the current phase + blocker stays on page 2 (`phaseNow`). The executive prose (`executive.structured.summary`) becomes the first paragraph of the Investment view; the Assessment Card is absorbed by the dashboard (same `AssessmentCardData`, rendered once).

## 3. Per-dimension anatomy (identical for all 8)

Order and caps (web = PDF = DOCX; caps applied by the projection, never by the renderer):

1. **Header row** — kicker `Dimension n/8 · weight W %`; title (`title` / `titleVi`); score tile `S / 100` (mono, tabular); band chip (`strong` / `developing` / `early` / `pending`, label + dot, never colour alone); benchmark line via `publication-rules.ts`: `stage median 65 (n = 42, benchmark) · p25 50 · p75 80 · 30th percentile` — n < 10 → `not enough comparable companies (n = 7)`, no percentile; floor chip `Phase · floor 55 ✓/✗`.
2. **Verdict** — `chapter.verdict`, ≤ 60 words, first sentence carries the judgement; footnote markers kept.
3. **Evidence used** — ≤ 5 rows: label · confidence rung (`self-declared … third-party verified`) · status · footnote no.; `+N more in the evidence register`. Evidence ids are never printed in a chapter (appendix only).
4. **Strengths** ≤ 3 × 25 words (chapter + criteria, de-duplicated as today).
5. **Risks / gaps** ≤ 3 × 25 words; a gap that is an uncited material claim carries the `unverified` chip.
6. **Criteria** — mini-table `criterion · score · quality · one-line verdict (≤ 20 words)`; full cards (strengths/gaps/next) on the paid view only.
7. **What to improve** — 1–3 rows `action · +lift SVI · window · evidence to add` (`nextAction` first, then criteria `nextAction`, then `evidenceToAdd` CTAs; dedup by normalised title).
8. **Investor takeaway** — one line ≤ 25 words, navy left-rule callout (template § 4.3).
9. **How this score was built** — `scoreBreakdown` in a collapsed `<details>` on web; appendix table in PDF/DOCX.
10. **Audit line** — owner agent · grounded/uncited · auditor stamp (muted, 12 px).

**Unassessed / pending** (`scoreBreakdown.assessed === false` or band `pending`): header shows `— / 100` and the chip `Pending`; items 2–8 collapse to one card: EN *"Pending — not assessed. No evidence has been supplied for this dimension, so no score is shown; a pending dimension is not a low score. Add: {CTA rows}."* · VI *"Đang chờ — chưa đánh giá. Chưa có bằng chứng cho chiều này nên không hiển thị điểm; chiều đang chờ không phải là điểm thấp. Bổ sung: {CTA}."* Takeaway for pending: EN *"No view on {dim} until evidence is supplied."* · VI *"Chưa có nhận định về {dim} cho đến khi có bằng chứng."*

**Unverified claims:** a sentence with a `MATERIAL_PATTERNS` hit (`claim-gate.ts`) and no `[ev:]` citation, or whose only support is `self_declared`, renders the outline chip `unverified` (muted, not bear) with the footnote *"self-declared, not yet verified"*; the count feeds `unverifiedMaterialClaims` on the dashboard.

## 4. Verdict rubric (deterministic, `lib/report-v2/investment-view.ts`)

**Inputs** (all already in ReportV2 or the Assessment Card): `EC` = evidence confidence 0–100 (`card.evidenceConfidence`, one number for the whole document); `P` = pending dims; `composite` = Σ weightᵢ × scoreᵢ over assessed dims, renormalised (0–100, NEW — the uncapped `cover.svi.total` is the index, not the band input); `band` = `bandFor(composite)`; `F` = dims with `phaseLens.floorMet === false`; `B` = `phaseGates.blockers.length`; `U` = unverified material claims; `ask` = `valuation.ask?.verdict`.

| Rule (first match wins) | Band | EN wording | VI wording |
|---|---|---|---|
| `P ≥ 3` or `EC < 30` | **D — Insufficient evidence** | "Not enough evidence to form a view" | "Chưa đủ bằng chứng để đánh giá" |
| `band = early` or `F ≥ 2` or (`EC < 50` and `band ≠ strong`) | **C — Not yet** | "Not yet — build evidence" | "Chưa đến lúc — cần bổ sung bằng chứng" |
| `band = developing` or `F = 1` or `EC < 70` or `U ≥ 1` or `ask = above_consensus` or `B ≥ 1` | **B — With conditions** | "Investable with conditions" | "Có thể xem xét đầu tư, kèm điều kiện" |
| otherwise (`strong`, `EC ≥ 70`, `F = 0`, `U = 0`, `P = 0`, `B = 0`) | **A — Investable now** | "Evidence supports investment consideration now" | "Bằng chứng đủ để xem xét đầu tư ngay" |

**Conviction** = EC tier: `< 50 low · 50–69 medium · ≥ 70 high`, printed as *"Evidence confidence 64 % · conviction: medium"*. **Sub-line on every band (verbatim):** EN *"Based on the evidence supplied and the SVI rubric. BlockID structures the evidence; evaluators and founders make the decision. General information, not financial product advice."* · VI *"Dựa trên bằng chứng đã cung cấp và bộ tiêu chí SVI. BlockID sắp xếp bằng chứng; nhà đánh giá và nhà sáng lập tự ra quyết định. Thông tin chung, không phải lời khuyên về sản phẩm tài chính."* Never: "AI decides", "predicts", "accurate", "Australian average", percent-accuracy, a benchmark without n (guard in `messaging.test.ts` + new `investment-view.test.ts`).

**Conditions** (band B/C, ≤ 3, ≤ 20 words each, in this order): each floor-unmet dim → *"Lift {dim} to the {phase} floor of {floor} (now {score})"*; `U ≥ 1` → *"Verify {U} self-declared material claims (documents or connected sources)"*; `ask = above_consensus` → *"Re-anchor the ask: {gapPct} % above the A${low}–{high} consensus"*; then `phaseNow.blocker`. Band A prints no conditions; band D prints the evidence CTAs instead.

**Mapping to the stored executive label:** A ↔ `back`, B ↔ `back_with_conditions`, C ↔ `watch` / `not_yet`, D ↔ `not_yet`. The deterministic band is what renders; when the CEO agent's `structured.verdict.label` disagrees, the agent's sentence is shown beneath as *"Analyst synthesis"* with its own label — one reconcile step in the `alignReportWithAssessmentCard` pattern, no silent overwrite.

**4.1 Reasons for / risks (3 + 3):** use `executive.structured.reasonsToBack` / `criticalGaps` when present (already capped at 3); fallback = top / bottom 3 dims by `(score − p50)` with the template *"{dim} {score}/100, {±Δ} vs stage median (n = N)"*.

**4.2 Key points (5):** ① headline ② top reason ③ top gap + lift ④ *"Consensus A${low}–{high} across {k} methods; {m} revenue methods did not run (pre-revenue)"* ⑤ verdict band + first condition. Each ≤ 30 words.

**4.3 Investor takeaway template per dim:** strong → *"{dim} supports the case: {score}/100, {+Δ} vs stage median (n = N)."* · developing → *"{dim} is neutral: {score}/100; conditions attach until {top gap}."* · early → *"{dim} weighs against the case until {top gap}."* No benchmark (n < 10) → the Δ clause is dropped. VI twins in `tbr-strings.ts`. When a chapter later carries an LLM-written `investorTakeaway`, it wins only if it passes the claim gate.

**4.4 Risk matrix rows:** from each chapter's `gaps[0..1]`, each `phaseGates.blockers[]`, `U` as one row, `ask` above consensus as one row. `likelihood` = evidence status of the row's dim (`missing → high`, `partial → medium`, `evidenced → low`); `impact` = `weight × max(0, p50 − score)` tiers (≥ 6 high · 2–6 medium · < 2 low; blockers = high). Rendered as a 3×3 grid (counts) + table sorted high-high first; ≤ 8 rows on the paid view, top 5 on free.

**4.5 Improvement plan ranking:** `priority = expectedLift ÷ effort`, effort = `this_week 1 · 30d 2 · 90d 3`; ties → lower-scoring dim first. Print `expected lift +N SVI` exactly as the catalogue gives it — no cumulative "you will reach X".

## 5. Visual / UX spec (light template only)

- **Grid:** page `max-w-6xl`, 12-col grid at ≥ 1024; dashboard row = 4 tiles (3 cols each) + chart full width; prose measure 65ch; chapters two-column at ≥ 1024 (main 8 / rail 4: evidence used + what to improve), single column below.
- **Type scale:** Space Grotesk display — hero number 48, h1 32, h2 24, h3 18; Inter body 16/1.6, secondary 14, caption 12 (never below 12); IBM Plex Mono `tabular-nums` for every score, %, A$ and n.
- **Colour (tokens only):** ink `--ds-ink`; navy `#1B2A5E` (`--color-brand-navy`) for headings' accent, primary buttons and the takeaway rule; cyan `#0891B2` as the single secondary accent (links, active TOC); semantic `--ds-success` bull / `--ds-warn` / `--ds-danger` bear only with an icon + label; band chips keep `BAND_COLOUR` for the dot only, text stays ink.
- **Dashboard tiles** (stat tiles, not charts): ① SVI index `135` + band chip + Δ vs last ② Evidence confidence `64 %` + rung + verification badge ③ Verdict band (A–D label, conviction) ④ Valuation `A$3.0M – 6.6M` + `k methods` + ask chip. Each tile: label 12 px uppercase muted, value 32–48 mono, one sub-line.
- **8-dimension chart** — horizontal bar chart (readable at 375, prints, no area distortion; **no radar**): one series "your score" in navy; benchmark p25–p75 as a `--ds-surface-sunken` band behind each bar with a 2 px p50 tick in muted ink; direct value labels on every bar (8 values — allowed, the dataset is small); x-axis ticks 0 / 50 / 100 only, no gridlines; caption *"Stage median band p25–p75, n = N ({label})"* — when n < 10 the band is omitted and the caption says so; legend row (score · stage band · median) always present; `<figcaption>` + a table twin (`<details>`) for screen readers. Series colour never changes with the number of dims shown (colour follows entity).
- **Valuation:** methods table (method · applicable · weight · low · mid · high · rationale) with a bold consensus row; a range bar (low – mid – high on one axis, the ask as a marker when stated); cross-check rows with n and as-of date.
- **Tables:** `TABLE_CLASS` / `THEAD_CLASS` from `shared.tsx`; zebra sunken rows, sticky `<thead>`, 44 px rows, numeric columns right-aligned mono. At < 768 the wrapper is `overflow-x-auto` with `min-w-[640px]` and a sticky first column (`position: sticky; left: 0; background: var(--ds-surface)`).
- **Callouts:** takeaway = 4 px navy left rule on sunken; risk = 4 px bear rule + triangle icon; improve = 4 px warn rule + arrow icon; note = 4 px muted rule. Body ink, never coloured text.
- **Footnotes / Evidence cited:** superscripts from `buildCitationIndex` unchanged; 44 px hit area; "Evidence cited" closes the appendix.
- **375 px:** tiles stack 1-col; bar chart reflows (labels above bars); tables scroll as above; the TOC becomes a sticky top select; the chapter rail moves under the verdict.
- **Print / PDF:** `@page { size: A4; margin: 18mm 16mm }`; sections 4–16 and each chapter `break-before: page`; `h2, h3 { break-after: avoid }`; `table, figure, .callout, .tile { break-inside: avoid }`; `thead { display: table-header-group }`; running footer *"Startup Value Index · {startup} · {date} · p. X"* + *"Not financial advice."* (react-pdf `fixed`); dashboard + investment view are pages 1–2, key points + valuation page 3.
- **DOCX parity:** `tbr-docx.ts` emits the same 16 sections in order with Heading 1/2/3 styles, header-row repeat on tables, the four tiles as a 2×2 table, the bar chart as the same SVG rasterised; callouts as single-cell shaded tables.

## 6. Free vs paid

| View | Who | Content |
|---|---|---|
| **Grant report** (G25-C: first two full reports per e-mail) | guest / founder with an unused grant | The **full standard document** (16 sections, no trim). E-mail = 1-page summary in the body (tiles ①–④, verdict + conditions, 5 key points, top 3 improvements) + the full PDF attached + secure link. |
| **Free tier** (after the two grants; the 10-page budget) | founder / anonymous demo | Pages 1–3 in full (dashboard, investment view, key points, valuation **range + method names/weights only**, no derivation); chapters 1–4 full anatomy, 5–8 as locked compact cards (score · band · verdict ≤ 40 words · takeaway); risk matrix top 5; plan 5 steps; appendix counts only. The unlock rail after the first locked chapter → A$3 quote-then-pay (G19) or plan-included. `free-tier.ts` trim levels keep working; the projection adds the new blocks to level 0 and drops the risk table (the grid stays) at level ≥ 3. |
| **Paid / plan-included / share / showcase** | evaluator, subscriber | Everything; criteria full cards; ≤ 8 risk rows; ledger tables in the appendix. |

## 7. Implementation plan for the build lane

**Pure derivation, no pipeline (LLM) change** — every new block is computed from stored ReportV2 fields, so every stored report renders v3 on read. Optional phase 2 (LLM): `dimensions[].investorTakeaway` and `executive.structured.keyPoints` written by the owner / CEO prompts, gated by the claim gate; the renderer falls back to the templates.

| File | Change |
|---|---|
| `lib/report-v2/schema.ts` | Add **optional** `investmentView?: InvestmentView` on `ReportV2` and `investorTakeaway?: string` on `DimensionChapter` (Zod `.optional()`); export `INVESTMENT_BANDS = ["A","B","C","D"]`; never a required field, never a migration. |
| `lib/report-v2/investment-view.ts` (NEW, pure) | `buildInvestmentView(report, card)` → band, conviction, conditions, reasons, risks, keyPoints, riskMatrix, improvementPlan, whatMovesIt, compositeScore, per-dim takeaways; EN/VI strings from `tbr-strings.ts`. |
| `lib/report-v2/adapter.ts` / `load.ts` | `ensureInvestmentView()` at read (same pattern as `ensureExecutiveStructured`), after `alignReportWithAssessmentCard` so EC is the one number. |
| `lib/report-v2/free-tier.ts` + `page-estimate.ts` | Project the new blocks (§ 6); estimate pages for the dashboard / risk sections. |
| `components/tbr/v2/` | `dashboard.tsx` (replaces `cover.tsx`, absorbs `assessment.tsx`), `investment-view.tsx`, `key-points.tsx`, `risk-matrix.tsx`, `improvement-plan.tsx` (replaces `action-plan.tsx`); `chapter.tsx` → the § 3 anatomy; `valuation.tsx` moves up + range bar + 375 fix; `phase-gates.tsx` renders inside `appendix.tsx`; `report.tsx` + `tbrV2Toc` new order; `shared.tsx` adds `Callout`, `StatTile`, `DimBarChart` (SVG via `report-visuals`). Land after the G26-R restyle; tokens only. |
| `lib/pdf/tbr-pdf.tsx`, `lib/docx/tbr-docx.ts` | Same 16 sections, pagination rules § 5, tiles + chart. |
| `lib/svi/email-report.ts` | Summary body per § 6; attach the full PDF for grant deliveries. |
| `lib/report-v2/fixtures.ts` | One fixture per band A–D (drives snapshot tests + `/tbr/demo?band=`). |

**Tests to pin:** `investment-view.test.ts` — the rubric table (one case per row + boundary values, EN/VI, conditions order, band D CTAs, no cumulative lift, `composite` ignores pending dims); `report.test.tsx` — section order + TOC ids + one primary `svg[role=img]` per chapter still; `messaging.test.ts` reach extended to `lib/report-v2/**` + `components/tbr/**` (never-say list + a "benchmark without n" regex `median \d+(?![^.]*n = )`); `tbr-strings.test.ts` VI parity for every new key; `tbr-contrast.spec.ts` light contract ≥ 4.5:1 on the new callouts / chips; `free-tier.test.ts` page budget ≤ 10 for the four fixtures; `tbr-pdf.test.tsx` page-break assertions (no heading as the last line on a page — page-count reader + text-position probe); `tbr-docx.test.ts` heading sequence; live-qa `21-reports` gains `/tbr/demo` at 375 with no horizontal page scroll.

**Fixes folded in:** executive EC "0 %" vs cover 64 % (one number after alignment); valuation table overflow at 375; evidence UUIDs out of chapters.

**Migration:** none (optional fields; stored `report_v2` JSON stays valid). **Size:** ~2,200 LOC across 12 files; one worktree lane, ~1.5 days + review; PDF/DOCX twins ~0.5 day in parallel. **Deploy gate:** full unit suite, pdf suite, `qa:live` after the G26-R merge, serialised behind any peer deploy.
