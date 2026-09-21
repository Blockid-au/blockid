# Trusted Business Report — render runbook (v3, G27)

**Since:** 2026-09-21 (G27). **Spec:** `docs/design/tbr-v3-investor-report-spec.md` (+ `docs/design/tbr-v3/wireframes.md`). **Contract:** `web/src/lib/report-v2/schema.ts` (`ReportV2`, optional `investmentView` / `investorTakeaway`).

## 1. One document, four surfaces

| Surface | Entry | Renders from |
|---|---|---|
| Web (`/tbr/demo`, `/tbr/[token]`, founder workspace, showcase, paid order) | `web/src/components/tbr/v2/report.tsx` `<TbrReportV2>` | stored `report_v2` (or the read-time adapter) + the Assessment Card |
| PDF (`/api/svi/report/pdf`, e-mail attachment) | `web/src/lib/pdf/tbr-pdf.tsx` `renderTbrPdf` | same |
| DOCX (founder export) | `web/src/lib/docx/tbr-docx.ts` | same |
| E-mail (report delivery, G25-C grant) | `web/src/lib/svi/email-report.ts` — the 1-page investment view + PDF attached + link | same |

Every derived block — verdict band A–D, conviction, conditions, key points, risk matrix, 90-day plan, per-dimension investor takeaways, the dashboard tiles and the 8-dimension bar chart — is **pure derivation** from the stored document: `lib/report-v2/investment-view.ts` (`buildInvestmentView`, `ensureInvestmentView`) and `lib/report-v2/dashboard-view.ts`. No pipeline (LLM) change, no migration: `resolveReportV2` (`adapter.ts`) fills `investmentView` at read, and each surface rebuilds it when the UI locale or the evidence confidence differs (`investmentViewFor`). Evidence confidence is **one number** on every surface: always build after `alignReportWithAssessmentCard`.

## 2. Section order (all surfaces)

1 Dashboard · 2 Investment view · 3 Key points · 4 Valuation · 5–12 the eight dimension chapters (DIM_ORDER: tre, mpc, ftv, ptd, cgh, iri, lco, svm — identical 10-slot anatomy, spec § 3) · 13 Risk matrix · 14 90-day improvement plan · 15 Money on the table · 16 Appendix (method · phase-gate matrix · score ledgers · evidence register · audit log · sources · data principle · disclaimer) + Evidence cited (footnotes, only when something is cited).

Anchors (web, PDF outline, DOCX headings): `tbr-dashboard`, `tbr-investment-view`, `tbr-key-points`, `tbr-valuation`, `tbr-dim-<dim>`, `tbr-risk-matrix`, `tbr-plan-90d`, `tbr-money`, `tbr-appendix`, `tbr-evidence-cited`. The pre-v3 ids (`tbr-cover`, `tbr-executive`, `tbr-phase-gates`, `tbr-action-plan`) stay as aliases in `TBR_V2_SECTION_IDS`.

## 3. The verdict rubric (never hand-edited on a surface)

`verdictBand()` in `investment-view.ts`, first match wins: `P ≥ 3` or `EC < 30` → **D** · `early` or `F ≥ 2` or (`EC < 50` and not strong) → **C** · `developing` or `F = 1` or `EC < 70` or `U ≥ 1` or ask above consensus or a blocker → **B** · otherwise **A**. Inputs: composite = Σ weight × score over *assessed* dims (never the uncapped index), EC = the Assessment Card's evidence confidence, F = floor misses, U = unverified material claims, B = phase-gate blockers. Wording (EN + VI) lives in `lib/i18n/tbr-v3-strings.ts`; the mandatory sub-line — *"BlockID structures the evidence; evaluators and founders make the decision."* — is verbatim on every band. The CEO agent's own label shows as "Analyst synthesis" only when it disagrees; never a silent overwrite.

## 4. Free vs paid (spec § 6)

Grant reports (G25-C) = the full document. Post-grant free tier: sections 1–3 in full, valuation range + method names/weights (no derivation), chapters 1–4 full, chapters 5–8 compact cards (or the G16-B locked preview + one unlock rail → A$3 quote-then-pay), risk matrix top 5, plan 5 steps, appendix counts only. `free-tier.ts` trim levels still drive the PDF's 10-page budget (`page-estimate.ts` → `renderTbrPdf` reads the real page count back).

## 5. Guards and tests to run after touching a report surface

```sh
cd web
npx vitest run src/lib/report-v2/investment-view.test.ts src/components/tbr/v2 --project unit   # rubric table, section order, anatomy, never-say, citations
npx vitest run src/lib/i18n/tbr-strings.test.ts --project unit                                     # EN/VI key parity incl. the v3 block
NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --project pdf                                # PDF twin: order, page breaks, 10-page free budget
npx vitest run src/lib/docx src/lib/svi/email-report.test.ts --project unit                        # DOCX heading sequence, e-mail summary
npx playwright test tests/e2e/smoke/tbr-contrast.spec.ts                                           # light contrast ≥ 4.5:1 + 375 px no horizontal scroll
```

Never-say (docs/design/messaging.md § 11) is asserted over the *rendered* text on every surface: no "AI decides", "predicts", "accurate", "Australian average", and no `median N` without its `n =` in the same sentence (`lib/benchmarks/publication-rules.ts`). A benchmark figure reaches a surface only with its n; below n = 10 the surface prints "not enough comparable companies (n = N)".

## 6. Showcase / demo

`/tbr/demo` renders `demoReportV2()` (fixtures) — every number illustrative. `/showcase/blockid/report` renders the stored BlockID report and picks v3 up on read; live-qa lane 31 checks the v3 landmarks fail-soft until the showcase is re-run. Band fixtures for tests: `investmentBandFixture("A" | "B" | "C" | "D")`.
