# G19 audit 2 — founder-facing UX, inputs, surfaces, i18n, analytics (2026-09-20, read-only)

Paths under `web/src/`. Back-link: [`../g19-report-quality-2026-09-20.md`](../g19-report-quality-2026-09-20.md).

## Demo report as rendered (`/tbr/demo`, fixture `lib/report-v2/fixtures.ts`)
Standard tier 1,705 words / 26 visuals / ≈15 pages (free 1,083 words / 9 pages). Cover 33 w; Executive 76 w (thesis = templated sentence; strengths/gaps = score restatements, "0 below the strong band"; confidence 50 %); 8 chapters 73–241 w each with 0 evidence rows, next actions from `DIMENSION_ACTIONS[dim][0]` ("Register ABN" for a Verified-ABN company, "Find a co-founder" for 3 co-founders), `expectedLift` ≈ +1 everywhere; Valuation 6 × "n/a" rows (adapter path) confidence 35 %; Phase Gates 0 prose; Money 0 matched; 90-day plan 2 steps in Day 0–30 only; Appendix "not yet audited" ×10, groundedShare 0. Phase-lens line repeated ×8. ~40 % boilerplate.

## Inputs → report CTA?
| Input | Read at | Feeds | Report asks for it? |
|---|---|---|---|
| Founder text | `run-for-project.ts:329-336` | all | no |
| 13 criteria (`evaluation_criteria`) | `:350-353`, map `dimension-owners.ts` | cards | quality label only, no link |
| Evidence uploads | reads **`svi_evidence`** (account) `:338-341,568`; **never `svi_dimension_evidence`** (Evidence Hub) | — | "No evidence rows…" text, no link; hub uploads ignored |
| Connectors Stripe/Xero/GA4/GitHub | `gather.ts:558-592` | tre/iri/mpc/ptd/ftv/cgh | raw enum "evidence: stripe" (`chapter.tsx:150`) |
| GitHub audit / LinkedIn / cap table / grant profile | `gather.ts:537,639,371-404,401-432` missing rows with hints in `EvidenceRow.value` | ptd,ftv,cgh,iri | **`value` never rendered** (`chapter.tsx:100-106`, `appendix.tsx:28-34`) |
| External signals (S40) | `gather.ts:262,729-748` (needs verified ABN) | lco,iri,tre | no "verify ABN" CTA |
| CFO valuation | `gather.ts:434` pipeline only | valuation | adapter path: all n/a |
Intake form: `workspace/score/criteria` (`components/evaluation/evaluation-client.tsx`); `computeQuality` (`evaluation-criteria.ts:360`), `computeEvaluationProgress` (`:379`); no admin stat on empty intake.

## Surfaces
Web `/workspace/reports/business` (`business-report-client.tsx`), share `/tbr/[token]`, demo, PDF `lib/pdf/tbr-pdf.tsx`, DOCX `lib/docx/tbr-docx.ts`, email `lib/svi/email-report.ts`, dossier — all ReportV2. **Not ReportV2:** first analysis (`lib/analyses/first-analysis/*`), **paid A$3 order page `/workspace/reports/order?order=`** (`components/paywall/ReportOrderView.tsx:30,247-274` markdown + legacy `svi-report-pdf.tsx`/`svi-report-docx.ts`; reached from `unlock-rail.tsx:99` / `lib/paywall/report-delivery.ts:429`), saved report `/workspace/reports/[id]` (16 markdown sections).

## Layout (`components/tbr/v2/report.tsx`)
Cover → Executive → 8 chapters → live `<ActionPlan>` widget → Valuation → Phase Gates → Money → 90-day plan → Appendix; founder page adds leads/views/peer-5/chat; sticky TOC. Issues: score shown 3–4× per chapter; chapter strengths/gaps duplicate card bullets (`adapter.ts:474-475`); four to-do lists; mixed vocabularies (TRE codes, long/short titles, ceo/cfo mono badges, Phase vs Stage, raw enums, "good · CPO · uncited"); empty sections (Money, Phase Gates prose, plan 30–60/60–90, evidence tables, Pctl "—"); empty-state copy blames founder ("re-run the analysis", `money.tsx:41`); no above-the-fold current-value headline; `print:break-before-auto` everywhere.

## i18n
Report chrome in `lib/i18n/tbr-strings.ts` (en/vi/es/ja) — VI ASCII-stripped ("Bao cao Kinh doanh Tin cay"), `CRITERIA[].titleVi` too; hard-coded English in `shared.tsx` (bands, states, auditor), `chapter.tsx`, `executive.tsx`, `valuation.tsx`, `money.tsx`, `action-plan.tsx`, `appendix.tsx`, `unlock-rail.tsx`; adapter narrative English-only; `ReportV2.locale` typed en|vi.

## Analytics
`report_view` (server), `paywall_view`, `tbr_share_created`, view beacon `tbr_views` + `read_ms`, `tbr_qa_asked`, `tbr_lead`. No section-read, no export event. **Clarity survey (G13 KPI ≥ 8.5) not implemented**; `components/nps/nps-widget.tsx` unmounted; `app/nps/page.tsx` + `POST /api/nps` exist.

## Tests
`report-v2/schema.test.ts` (14), `adapter.test.ts` (18), `fixtures/page-estimate/free-tier/load/storage`, `tbr/v2/report.test.tsx` (12), `tbr-pdf.test.tsx`, `tbr-docx.test.ts`, prompt-eval `TBR-<dim>-v2.0.0.json` ×8 + `AIR-*` ×10 (`tbr-fixtures.test.ts`). Nothing tests copy quality, VI internals, or non-empty Money/plan on the pipeline path.

## Top 8 fixes
1 paid view = ReportV2 · 2 Evidence Hub into pipeline + CTA rows with links · 3 Money wired · 4 real next actions + lifts, dedupe, spread 30/60/90 · 5 cut redundant blocks, one to-do list, hide n/a method table, drop Pctl when null · 6 current-value hero, jargon to appendix · 7 i18n parity + diacritics · 8 clarity survey + `tbr_section_view`/`tbr_export`.
