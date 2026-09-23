# Website/text intake parity — source review and implementation basis

Date: 23/09/2026. Scope: `blockid.au` website URL and free-text intake, its saved ReportV2 path, and the related investor result surfaces. This review records source behaviour; it does not claim the new pipeline is live.

## Current source behaviour

- `web/src/lib/intake/analyze-input.ts` treats a URL as `website`, calls `scrapeUrl` once for the submitted page, builds signals from that page and recommends `/api/site-crawl/stream` as a later step. Free text is classified as idea/existing-company mostly through hints, length and one classifier call.
- `web/src/app/api/site-crawl/stream/route.ts` separately crawls up to eight same-host pages and emits progress/signals to the browser. `web/src/components/analyze/site-visitor-panel.tsx` displays those events, then only calls `onDone(intake)`. The collected page corpus, failures and source metadata are not returned to the saved intake or ReportV2 job.
- `web/src/lib/analyses/first-analysis/report-v2-job.ts` sends `intake.rawText` to the common report orchestrator, but passes an empty `evidenceItems` list. For the URL path that text is therefore normally the first-page scrape, while the richer visual crawl is not report evidence.
- `web/src/components/analyze/analyze-results.tsx` can show a fast SVI result derived from heuristically extracted signals before the final report arrives. This is useful as a preview, but it must not be confused with a researched investor assessment.
- The current intake contract has no durable, versioned representation of the user's decision intent: target investor question, investment stage, geography, cheque/deal context, requested depth, time horizon or explicitly requested focus. Text is used as business description rather than split into business claims and requested analysis.

## Material gaps

1. Website and pitch-deck paths do not yet produce equivalent evidence snapshots. A successful visual crawl can appear to the user without influencing the final report.
2. The submitted URL, fetched content, page-level provenance and research sources are not one immutable lineage. A later result cannot always explain which pages were actually used.
3. Free text can mix business facts, investor questions and instructions. Today those concerns are not separated, so the report can answer a generic rubric while missing the user's real question.
4. Website marketing claims are self-declared evidence. They need independent research and counter-evidence before supporting strong market, traction or valuation conclusions.
5. The fast result can surface a score/valuation before the deeper evidence pass. The UI needs explicit preview/final states and must keep decisive risks and missing data visible.
6. URL retrieval also needs one server-owned SSRF/redirect/DNS/content policy across root and multi-page fetching; client-visible progress is not an authority boundary.

## Target outcome

Website, text and deck submissions converge after extraction into one versioned `BusinessInputSnapshot` and one `InvestorIntentSnapshot`. The first stores permitted original/extracted evidence with page/section lineage. The second records what decision the user wants help with without treating instructions as business facts. A materiality planner then maps both snapshots to the canonical 13 criteria/52 questions and research tasks.

The investor result opens with a compact decision brief: current view and confidence; valuation status/range only when eligible; strongest supported factors; material weaknesses and risks; points requiring clarification; and the next diligence steps. Each item expands into company-specific reasoning, supporting and contrary evidence, limitations and the exact conditions that could change the conclusion. Website and text flows use the same ReportV2/revision/export contract as a pitch deck.

## Planning consequence

This is a P0 report-quality correction, merged into F01/E01/E02/R01–R04/A02–A03/V02–V03/U01/U02/Q01–Q02. It precedes broad visual redesign and any paid “refresh research” activation. Existing billing/authority gates remain in force. The source-of-truth section 6.8 defines the implementation sequence, acceptance evidence and rollout boundary.
