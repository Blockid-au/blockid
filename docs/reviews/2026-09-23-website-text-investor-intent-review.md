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

## WT1 source foundation

Commits `a8f511979` and `58b29c4eb` add versioned metadata contracts and attach them to every newly analysed file, URL or text input in source. `InvestorIntentSnapshot` records exact matched user spans, requested investor outputs, stage/geography only when explicit, and labels the default investor view as inferred. It is built only from caller-provided text, never fetched website/document content. `BusinessInputSnapshot` records per-page/slide/text locator, status, content hash and character count without embedding source text; an authorised retention flag requires a grant ID.

The existing intake persistence still stores its legacy bounded `rawText`; this phase does not claim to remove or newly authorise that behaviour. It adds metadata to the existing compact intake payload when deployed. Old stored records remain compatible because the new fields are optional. Current URL acquisition still contributes only the root page to the snapshot, now explicitly represented as such; WT2 must replace the separate display-only multi-page crawl with a single hardened producer before claiming website parity.

Validation: 46 focused intake/snapshot/payload tests passed. A focused strict TypeScript check passed, followed by the full repository TypeScript check with an 8 GiB Node heap. The first default-heap full check exhausted its 4 GiB process heap without a diagnostic; it was rerun successfully with unchanged source. No production build, route deployment, provider call, database migration, customer input, credit operation or website crawl occurred in this phase.

## WT2–WT3 source implementation

Commits `8ee814b8d` and `8253cbecf` complete the source foundation for acquisition and intent-aware synthesis:

- URL intake now uses one hardened, versioned `website-corpus-v1` producer. It follows at most six same-host pages, prioritises pricing/product/customers/about/team/security/legal/contact, removes tracking parameters, caps each page and the aggregate corpus, and records available/blocked/timeout/not-found/unsupported/failed states. The producer inherits the existing DNS/IP/redirect checks from `fetchText`.
- `/api/intake` persists that exact page ledger and uses the same bounded corpus for signals and the report. The site-visitor panel renders the returned ledger and no longer opens a second crawl. `/api/site-crawl/stream` remains a compatibility stream over the same producer.
- The ReportV2 job recovers the stored `InvestorIntentSnapshot`, passes it separately to the orchestrator, and turns only available website pages into `public_url` evidence at the lowest founder-provided trust level. Blocked or failed pages are never promoted to evidence.
- Every agent prompt and executive synthesis sees the requested outputs and exact user questions in a labelled “decision request, not business evidence” block. Missing support must become a specific point to clarify rather than a guessed answer. The executive brief continues to use the existing reasons-to-back, critical gaps/risks, verdict, valuation eligibility and deterministic investment-view contracts.

Validation: 70 focused WT2 tests and 250 combined WT2/WT3 tests passed; full TypeScript checking passed with the repository's 8 GiB script. No model/provider call, paid search, customer credit, database migration or live website request was made by these tests.

Remaining before website/text parity can be claimed live: bounded independent market/competitor research is not yet scheduled from each material intent; explicit per-intent coverage states are not yet stored/rendered; page text source markers are not yet upgraded into claim-level citation rows; WT4 score/valuation revision gates and WT5 investor UI/export parity remain. The source commits are merged but are not described as deployed by this review.
