# G30 A02a / U01: detailed findings reader, first implementation slice

Source base: `5848e6403`; isolated branch `g30-assessment-findings`. This is a candidate implementation for SOT §6.6, not closure of A02, all 52 questions, full research, or sale readiness. No DB migration, inference, billing operation or deployment was performed by this task.

## Change and evidence boundary

The fresh `/analyze` and saved `/analyze/[id]` readers receive completed, unlocked, structurally valid ReportV2 content from their existing authorized full-report poll. They prefer its chapter verdicts, strengths, gaps, next requests, criteria and evidence records. They do not fetch additional report data or generate conclusions during rendering. A failed/locked/incomplete/malformed response cannot supply canonical findings.

The findings reader exposes eight canonical chapters and all criteria already present in them; the former permanent first-four-dimensions cap is removed. Native disclosure controls show the assessment, diligence context, uncertainties, next requests, criteria and recorded sources. High-severity consistency issues and unsupported chapter-audit limitations stay visible outside collapsed details. Criterion grounded/quality states and citation references remain visible. A model-written citation quote is explicitly a report citation to check against its source, not an authenticated source excerpt. Evidence IDs and recorded evidence confidence levels are visible; the current schema lacks per-record source URLs/page locators, so this change does not invent clickable provenance.

Canonical stage, score and radar replace the intake-derived versions once the final document is available. The old heuristic gap/action panels are omitted at that point because they can contradict final findings. A link leads to the existing full report and its canonical valuation instead of retaining the heuristic valuation beside final findings.

Before a canonical report is available, the reader presents nine review areas (eight existing dimensions, with problem and reachable market separated). It explicitly identifies them as preliminary reading guidance, not researched business conclusions or completed question coverage. Each area explains why its evidence matters and asks for concrete information. Input section excerpts appear only when the exact text exists in the original received input. Unsupported classifier text cannot become a source. Missing extraction does not imply missing business capability; no market figures, competitors, customer facts or source verification are invented. Legacy reports without a valid current canonical payload retain this explicit limited guidance rather than being reconstructed as a verified final report.

The interface labels and guidance support EN/VI. Existing report narrative and original source material retain their generation language; no translation model is invoked. Existing light design tokens, readable text, native keyboard disclosure and visible focus are used. No credit charge or network call occurs on expanding existing details; optional paid deep research is not implemented by this slice.

## Reader lifecycle correction

New parent handoffs are scoped to analysis ID and the exact intake object; the saved reader also binds the link token. Existing full-report view state now checks ID/intake/token synchronously before rendering, and invalid/failed responses clear old report content. The saved-analysis load state is scoped to requested ID/token. Changing A to B therefore cannot temporarily show A content with B download links. These are client display-scope guards, not new authorization rules or continuous account-session revalidation.

## Validation

- Six focused test files: 48 tests passed, including the real AnalyzeResults consumer, canonical correction over stale score/gap/action props, original-excerpt-only admission, all areas/criteria, EN/VI, escaping, legacy/degraded limits, critical conflicts, citation qualifications, and final handoff rejection states.
- TypeScript: initial default Node 4 GB checks ran out of heap; the first complete 8 GB check found a criterion quality type mismatch (actual schema is a string union); corrected to the canonical type. Final `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit` recheck completed with exit 0.
- ESLint: zero errors; one existing unused `_i` warning in AnalyzeRoot, outside the change.
- Offline real Chromium at 375px with reduced motion: completed authorized canonical handoff; immediate A→B report hiding; failed B cannot retain A; all nine preliminary areas; keyboard expand/collapse; no network calls on expansion; saved A→B scope and failed-load hiding. Four synthetic read requests, no external traffic or side effects. Repeat with `node web/scripts/report/check-business-findings-browser.mjs` from the repository root (requires installed esbuild/playwright-core and Chromium).
- The browser fixture stubs Next dynamic heavy report components and uses synthetic intercepted HTTP responses. It is not full-page visual acceptance, computed CSS contrast evidence, real account authorization testing or proof of export parity.

## Remaining implementation requirements

E01/A02b must produce actual question-level business-specific reasoning and supported investor implications, not merely richer display of potentially generic legacy criterion strings. The existing chapter phase context is used as diligence context; it is not represented as a newly verified investment recommendation. R01–R04 must supply real retrieved research and counter-evidence. Claim-level semantic support, full question states, method-aware valuation, source/page access navigation, complete cross-surface/export parity, credit quotes/top-up/supplements and full-page authenticated usability acceptance remain open. Existing preliminary heuristic scoring/valuation is not repaired by this reader slice. No report or source record is rewritten.
