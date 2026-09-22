# Business-specific competitor publication gate

## Gap and existing seams

BlockID `runScopedPublicResearch` deliberately ends at source collection with `readyForFinalCapture:false`; its source qualifier only permits literal own-business attribution and rejects unresolved competitor entities. Its criterion coverage correctly says comparisons remain unassessed. Those safe limits are not a semantic competitor evaluator and must not be relabeled as one.

SVI's existing `validateResearchContent` verifies retained source hashes and literal citation excerpts, but previously allowed the competitor question to pass with no candidates, a generic coverage string and no dimensional comparisons. The separate trusted `acceptEvidence` hook remains essential and production publication is still not instantiated.

## Change

New reusable pure `validateCompetitorAcceptance` is called by the **existing** `createResearchSupplementStore.publish` after authoritative identity resolution and structural/source validation, before `acceptEvidence`. It applies only to `q05_someone_doing_it_better`.

New q05 content includes `competitorAssessment`:

- Subject name, customer need/segment, geography and exact current report hash.
- Search status, subject-linked queries and specific limitations. Three to five candidates are expected; fewer are permitted only with explicit limited/not-run coverage. No-search cannot carry invented queries/candidates or pretend contrary evidence was searched.
- Candidates linked one-to-one to existing `competitors`, distinguished as direct, adjacent or substitute; relevance references an existing supporting finding with a cited excerpt naming the candidate.
- Five explicit dimensions per candidate: product, customers, pricing, traction and distribution. Each records comparability and uncertainty. A directional comparison needs two different existing source-backed findings, one naming the business and one the alternative. Missing evidence uses `unknown` instead of guessed superiority.
- Contrary evidence is either present, searched without reliable findings, or explicitly not searched with limitations. No fabricated negative finding is required. High confidence is rejected when search is limited or contrary research was not performed.
- Overall structured conclusion remains inconclusive or mixed dimensional evidence. Gate output is only `eligible_for_trusted_review`, with null score and valuation effects.

This gate **does not establish semantic truth**. A name in an excerpt does not prove relevance; two citations do not prove comparable metrics, dates, pricing units or customer segments. Free-form prose can still contain unsupported assertions. The mandatory trusted `acceptEvidence` implementation must examine those properties, establish claim support, review contrary evidence, detect copied sources and reject invented absence/superiority. Do not replace that hook with this validator or an AI `reviewed:true` flag.

## Compatibility and execution

Old immutable supplements without the new field remain readable/exportable. New q05 publication requires the gate; malformed or omitted assessment cannot reach trusted review. No public route, provider call, wallet charge, scoring update or valuation update is introduced. Production research remains disabled until the full producer/reviewer/publication lifecycle is complete. BlockID can reuse this comparison contract at its existing synthesis boundary after its unresolved-entity/evidence gates; this change does not pretend that synthesis already exists.

Validation: 27 focused Node tests across acceptance, supplement publication/read/export, identity integration, question briefs and intent; targeted TypeScript compilation passed. Tests cover a normal three-candidate comparison, legitimate scarce evidence, zero-search limitations, wrong report binding, generic coverage, wrong-entity citations, missing dimensions, insufficient two-sided comparisons, contrary-state mismatches, immutable legacy reads and unchanged authority/storage checks. No real companies were researched.

## Next implementation: authenticated reading and focused presentation

Inspection found **no accepted-supplement detail component or read API**. Existing `SavedAnalysisDetails` renders the original `RunState` answers/competitor list; `CompetitionTab` and `SixteenAnswers` likewise receive original report data. `ResearchRevision` currently has no component consumer. This release therefore improves publication acceptance only: it does not make new competitor evidence visible to customers. Do not add an unused optional prop or copy accepted material into the legacy report cache to imply otherwise.

Implement the next phase as one complete read-to-display path:

1. Add a server-only read adapter around the existing supplement store, using the existing verified SVI session and authoritative active-BlockID-account check. Resolve creator ownership and the current sealed canonical/raw report hashes using the report identity store on every read. Accept only run ID and supported question ID from the request; actor and report identity come from trusted server resolution. Never infer private access from a public company slug, cache presence, an email match or caller-supplied report hashes.
2. Read the existing accepted head through `store.read`, preserving its scope-revocation, immutable hash, current identity and private-filesystem checks. Return only the authorized accepted revision needed for the question. A missing head means no accepted supplement, not permission to synthesize one or run research. Stale identities or revoked/closed accounts fail closed. Use private/no-store responses and avoid shared caches; make source snapshot/export access follow the same authorization and retention boundary. No provider or billing call belongs on this read path.
3. Attach the result to the existing **private creator report view**, after tracing actual page ownership/caching boundaries. Shared/public company pages must not receive private supplements. Use `SavedAnalysisDetails` as the presentation seam where the page is authorized; preserve existing parent links and question navigation. The legacy report remains the baseline and clearly dated accepted research appears as an additional revision, not a silent replacement.
4. Within the existing detail expansion, show the business-specific answer and coverage summary first. Each candidate expands into five dimension rows/cards: comparison outcome, business finding, alternative finding, comparability and uncertainty. Link each cited finding to its retained excerpt/source and retrieval date. Explicit unknowns remain visible; do not convert unknown into a zero, tie or winner. Group search limits and contrary findings in an expandable evidence section. Explain that this supplement itself does not update SVI or valuation.
5. Follow the applied `ui-ux-pro-max` guidance relevant to this existing interface: progressive disclosure, existing light surface/dark text tokens and fonts, native keyboard-operable details/summary, visible focus, at least 44px summary targets, wrapping source URLs, responsive stacked comparisons and unchanged back navigation. No new hero, funnel, decorative badge system or animation is needed. Local installed Next15 package has no `dist/docs` guide directory; this documentation slice changes no framework or UI code.
6. Verify actual session/account/creator isolation, stale-revision rejection, revoked scope, no-cache headers and zero charge/provider calls. Add a focused rendered-component check covering limited coverage, contrary evidence, unknown dimensions and legacy reports with no supplement. Check mobile wrapping and keyboard navigation when the real wired UI exists. Do not activate publishing or paid research as a side effect of implementing reading.

The skill's local design-system query was consulted, but its generic funnel/vibrant-style recommendations do not fit the narrowly scoped existing report detail. Only the relevant accessibility, readable light styling and progressive-disclosure guidance above is adopted. No UI or provider code was changed in this planning follow-up.

## Live release — 22 September 2026

Compiled `e1e74e961b1bef0f3a5c962e1da443faed6e1d81`, BUILD `YRShHfO72XrKtks9c8OxP`, is live on4213; previous81e47ee/4212 is warm. Initial1767cbe build failed strict TypeScript narrowing before launch; e1e74e9 corrected the terminating helper declaration. Twenty related tests passed after the fix, then full production build/type checks passed. Initial implementation's27 focused checks are not substituted for the production build gate.

Actual promotion→rollback4212→forward4213 passed, with six static samples each step,81 pre-existing raw reports unchanged, public health and invalid-token auth/cache/referrer checks. Boot unit enabled, monitor active, non-SVI nginx/BlockID robots/legacy-analysis guard preserved. Signed cross-site missing-account denial verified after both releases. Current and warm SVI now both contain the account-status consumer; current BlockID4110 and warm4109 both contain its authority.

This ships the new acceptance source in an immutable release, not a newly enabled research producer or visible competitor finding. The supplement publication boundary remains uninstantiated; its authenticated reader and UI integration are the next documented phase. No customer score/valuation update, new provider call or paid research was activated. Existing report contents remain unchanged. Operational logs: `/tmp/svi-g30-quality-{build-final,launch,static,switch,finish}.log`; private rollout receipt records the exact process and artifact identities.
