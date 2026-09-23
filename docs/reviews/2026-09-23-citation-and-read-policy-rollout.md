# G30 — Citation integrity and saved-report read policy

## Authorization and scope

Founder requested continued G30 implementation and live deployment. Existing policy remains DeepInfra-only and US$0.50/report across text/vision. No additional test suites, standalone lint/browser acceptance or operator-paid inference were run. Production build and operational identity/HTTP admission remain necessary.

## BlockID

Source `4ed643201` removes near-match repair of full evidence identifiers. Unique shortened prefixes remain scoped to the provided catalogue. An empty catalogue no longer authenticates an arbitrary ID. Shared web/export/plain-text citation projections show unknown references as unverified rather than silently erasing them; explicit marker-stripping helpers for previews remain intentionally separate.

The deterministic audit now receives the section's source text and checks strong numeric tokens against the cited sources, including magnitude/currency/percentage consistency. A known ID with an invented amount no longer automatically passes. This is a necessary compatibility check, NOT a semantic entailment verifier: entity, metric, period, negation and source truth still need stronger verification. Automatic numeric matching and full-material-claim coverage are not certified by this change. Pipeline version advances to `pipeline-v2.1-s-r10-citation-integrity` so previous generated caches are not reused under the new policy.

Origin4119 was explicitly retired under the shared deploy lock, outside active4122/warm4121, after observing zero tracked activities and unresolved registered jobs. Scoped unknown-work acknowledgement retained, full quiescence unproven, artifacts preserved, cap unchanged.

## SVI

Source `6ace6b0df7a3030299ad40f8f9287a64edba4271` (including `7404415`/`2de747c`) makes saved report charts a pure projection of existing report data. Removed view-time OpenAI/Anthropic enrichment, anonymous generated comparables and speculative milestones. No call is moved to another provider. Legacy Claude synthesis is blocked at its entry guard when scoped report policy is active, independent of the Fable enable flag.

Missing/invalid dimension values no longer become50/100; missing/invalid valuation no longer becomes0. Consumers render explicit unavailable messages. Chart and report-header valuation comes from the saved canonical valuation rather than an independent legacy meta-summary adjustment. Old stored report rows are not rewritten. Risk likelihood and severity now use the corresponding recorded fields; no likelihood is inferred from severity. This does not independently validate historical stored scores/valuations, legacy meta-summary narratives or every report surface.

## Deployment

Completed23/09/2026 at12:07UTC.

- BlockID compiled `4ed64320123d1691a60dd6a2ef8c2fc569c68579`, BUILD_ID `ibXgw13tyX2ep_-mo5nIG`, active4123/warm4122. Build/type compilation, public SHA identity, local/public/auth/static checks succeeded. GET `/api/intake` returned405. All13 sharp ESM files match the installed dependency. Operational mark-good completed after the founder-authorized60-second minimum soak with extended review deferred.
- SVI compiled `6ace6b0df7a3030299ad40f8f9287a64edba4271`, BUILD_ID `uxpZJToqVshWOmL2vqXYD`, active4210/warm4209. Isolated production build/type gate succeeded in1m52s, peak1.9GiB; static union and public build identity verified; service boot enabled. Prior report changes0, operator provider calls0, customer writes0. Protected store/auth/research runtime unchanged.

Operational logs: `/tmp/g30-citation-integrity-deploy.log`, `/tmp/g30-citation-integrity-mark-good.log`, `/tmp/g30-svi-read-policy-{build,launch,static,promote}.log`. Source contract expectations updated; no extra suites or inference acceptance run.

## G30 completion boundary

This slice does not complete the45-item plan. Remaining source work includes full claim/entity/metric/period verification, immutable final revisions/legacy delivery, question-led research execution, valuation method eligibility, durable job recovery, billing fulfillment and site-wide UX. Financial migrations0443–0445 and new paid research remain unactivated pending compatible runtime/ledger gates and settled fee policy. Holdout/human review, load/cost qualification and sale-readiness remain deferred/unproven under the current no-additional-tests instruction. Off-host backup remains explicitly deferred by founder. No pending item is marked complete by inference from an HTTP200 or source commit. Saved report metadata no longer asserts “investor-grade” or promises comparable evidence regardless of availability.
