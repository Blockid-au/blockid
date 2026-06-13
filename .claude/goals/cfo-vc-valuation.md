# GOAL — VC-Grade Startup Valuation (CFO-owned)

**Owner:** CFO agent · **Module:** `web/src/lib/agents/cfo-valuation.ts` · **Research:** daily
**Status:** v1 engine shipped; dashboard + Excel I/O in implementing plan (T0006–T0008)

## Objective
Every startup on BlockID.au gets a valuation report at the depth and rigour a **professional VC / investment analyst** would produce — defensible, sourced, and interactive. No black-box single number: show the methodology, the inputs, the research basis, and let the founder explore scenarios and export the model.

## What "professional / VC-grade" means here
A complete report MUST contain:

1. **Market sizing** — TAM / SAM / SOM, both top-down (published market reports) and bottom-up (reachable accounts × ARPU × horizon), with CAGR and **cited sources**.
2. **Multi-method valuation** (never one method):
   - **Comparables** — forward ARR × sector multiple (Bessemer / SaaS Capital / PitchBook / Carta).
   - **VC Method** — exit value (exit ARR × multiple) discounted by a stage-based target return.
   - **DCF** — discounted projected EBITDA + terminal value.
   - **Risk-Factor Summation / Scorecard** — ±adjustment from unit-economics & qualitative risk.
   - → a **weighted blended** low/mid/high with a confidence score.
3. **Financial projections** — monthly 36-month model: MRR, revenue, COGS, opex, EBITDA, cash balance.
4. **Unit economics** — CAC, LTV, LTV/CAC, gross margin, CAC payback, **Rule of 40**, NRR, with a verdict vs sector targets.
5. **Break-even** — month, MRR at break-even, cumulative burn to get there.
6. **Payback period** — months to recover the round + ROI%.
7. **Financial injection (the "ask")** — recommended raise, pre/post-money, **dilution %**, runway extension, and a **use-of-funds** split, tied to the next milestone.
8. **Scenarios** — base / bull / bear.
9. **Sources** — every benchmark cites a published reference; CFO refreshes these from daily research.

## Research basis (CFO daily research keeps these current)
Bessemer Cloud Index · SaaS Capital valuation survey · PitchBook sector multiples · Carta State of Private Markets · a16z benchmarks · Rock Health (healthtech) · CB Insights (fintech) · AVCAL / Cut Through Venture (AU) · ATO R&D Tax Incentive & ESIC rules.

## Engine (shipped)
`cfo-valuation.ts` exports `buildVcValuationReport(input)` → `VcValuationReport` plus the building blocks (`estimateMarketSizing`, `projectFinancials`, `unitEconomics`, `findBreakEven`, `paybackPeriod`, `financialInjection`, `vcBenchmark`, `VC_BENCHMARKS`). Unit-tested in `cfo-valuation.test.ts`. Registered in `AGENT_DOMAIN_FILES` so the self-upgrade loop refreshes benchmarks/methods.

## Dashboard implementation (implementing plan)
When a logged-in user opens their workspace, add a **Valuation** section with submenus:

- **T0006 — Valuation dashboard UI:** `/dashboard` (or `/workspace/valuation`) submenu with cards/tabs: *Summary*, *Market (TAM/SAM/SOM)*, *Methods*, *Projections* (interactive chart), *Unit Economics*, *Break-even & Payback*, *The Ask (injection)*, *Scenarios*. Interactive inputs (sliders for growth/churn/margin) re-run the engine live.
- **T0007 — Excel I/O:** **Download** a fully-formatted multi-sheet workbook (Assumptions, Projections, Methods, Cap Table/Use-of-Funds, Sources) generated from the engine; **Upload** an actuals/assumptions workbook to override inputs and re-value. Add a workbook library (`exceljs`).
- **T0008 — API + report-pipeline wiring:** `/api/valuation/vc` returns `VcValuationReport`; wire the `valuation` report section so paid PDF/DOCX reports include the full VC analysis. Persist per-startup so values track over time.

## KPIs
- 4 valuation methods per report · benchmark freshness ≤ 7 days · Rule of 40 & LTV/CAC shown vs sector target · ≥1 downloadable Excel model per valuation · founders can re-run scenarios live.

## Guardrails
- Always AUD, always show the method + assumptions + sources (no unexplained numbers).
- Not financial advice — include the AU disclaimer (see /au-compliance).
- Engine changes ship via the CEO loop **off-peak**; keep `cfo-valuation.test.ts` green.
