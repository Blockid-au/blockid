# G30 Q01/E03 — minimal report-truth regression fixtures

2026-09-22, source inspection only. No report source edits, paid model calls, DB operations, email or external research. The cases below are proposed failing-regression contracts, not claims that a new test suite has passed. Existing tests explicitly preserve two defects and must be corrected alongside implementation.

## Relevant paths and boundaries

- `web/src/lib/report-pipeline/auto-cite.ts`: `numericTokens`, `itemHasNumber`, `chooseItems`, `idsForClaim`, `autoCite`. A strong number allows source selection without metric identity. Currency is stored as a boolean, losing AUD/USD identity. The citable pool includes model-provided quotes if their IDs are allowed, without checking quote text against source text.
- `web/src/lib/report-pipeline/claim-gate.ts`: `hasCitationOrMarker` and `isMaterialClaim`. Citation syntax/catalogue membership is not entailment. With an empty allowed set, any detected marker/UUID currently passes. Explicitly unevidenced markers also pass the citation-disclosure predicate; this must not mean fact verified.
- `web/src/lib/report-pipeline/llm-auditor.ts`: `findUncitedClaims`, `auditSections`, `filterCriticFindings`. The first stage skips cited claims; standard/free paths may therefore never send false-but-cited assertions to the critic. The finding filter uses numeric matching to suppress some critic findings, which can repeat the original semantic mismatch.
- `web/src/lib/report-pipeline/orchestrator.ts`: `auditAllSections` builds the citable pool and audits executive, dimensions and criteria. Integration tests must cover both pipeline audit and later read-time projections.
- `web/src/lib/report-v2/grounding.ts`: `groundingAudit` marks any criterion with a nonempty citations array grounded without inspecting its verdict or quote.
- Existing `auto-cite.test.ts` case “uses the model’s own verbatim quotes as citable text, but only for allowed ids” supplies source “A founder gets a free score.” and invents a paid-cohort quote, then expects a citation. This is positive coverage of the unsafe behavior, not a missing-test-only issue.
- Existing `report-v2/grounding.test.ts` case “a chapter quoting a number outside its register…” changes a criterion verdict to A$9.9M ARR with a quote `mrr_aud = 100000`, then expects grounded=true. This likewise needs its expectation replaced.

## Fixture catalogue

Use deterministic IDs `11111111-1111-4111-8111-111111111111` (A) and `22222222-2222-4222-8222-222222222222` (B), synthetic businesses, no customer data. Keep each negative case paired with a legitimate control to avoid fixing accuracy by dropping all evidence.

| ID / priority | Source and generated assertion | Expected outcome |
|---|---|---|
| T01 / P0 forged quote | A source: “A founder gets a free score.” Model citation A quote: “Annual recurring revenue is A$77,000.” Draft repeats that assertion. | `autoCite.added=0`; quote rejected as unverified; assertion remains unsupported. A valid source ID cannot authorize new facts. Control: exact quote from A can support only its actual content. |
| T02 / P0 same percent, different metric | A source: “Customer churn was 20% in Q1 2026.” Draft: “Revenue grew 20% in Q1 2026.” | No automatic citation; metric mismatch; any critic finding about growth remains kept. Control: churn assertion with same entity/period permitted. |
| T03 / P0 currency collision | A source: “Annual revenue USD 100,000.” Draft: “Annual revenue AUD 100,000.” | Unsupported currency transformation; reject unless an explicit FX calculation with rate/date/source is attached. Control: USD paraphrase permitted. |
| T04 / P0 same metric, wrong period/entity | A source: “Business Alpha revenue A$100,000 in FY2024.” Draft: “Business Beta revenue A$100,000 in FY2026.” | No support despite amount match. Test entity and period independently. Control: Alpha FY2024 permitted. |
| T05 / P0 criterion citation bypass | Begin `demoReportV2`, set TRE criterion verdict “ARR is A$9.9M.” Add citation A quote `mrr_aud = 100000`; register contains only that MRR. | Criterion must not become grounded. No source proving A$9.9M; if deriving ARR, require explicit annualization and qualifiers, yielding A$1.2M only under supported assumptions. |
| T06 / P0 unknown citation on criterion | Same report, arbitrary unsupported verdict; criterion citations references unknown B, including empty or fabricated quote. | Unknown ID rejected; criterion not verified. An empty register must not accept arbitrary citation IDs in a report-truth evaluation. |
| T07 / P0 false-but-cited draft | Draft “Revenue grew 20% [ev:A].”; A says churn20%. Send through `auditSections` with mocked model and the allowed catalogue. | Cannot pass as verified without evaluating support; deterministic mismatch should mark unsupported even if no model budget remains. Claim coverage may be 100%, verified support is 0%. |
| T08 / P0 caveat without evidence | Draft “Estimated ARR is A$9.9M; evidence not provided.” No source. | Disclosure compliant but assumption/unsupported, never verified fact. Grounded/verified numerator excludes it; report may retain it only as clearly marked scenario, without investment conclusion treating it as actual ARR. |
| T09 / P1 mixed numeric units | A source: “Customers 25; annual subscription A$5,000.” Draft: “100 customers pay A$5,000.” | Strong-money token must not hide unsupported weak count100. Every material claim component is assessed, not only the strong subset. |
| T10 / P1 valid paraphrase and calculation | A verified MRR A$10,000 as of a known date; draft “Annualized run-rate A$120,000, assuming unchanged MRR.” | Preserve valid support with calculation input IDs, formula MRR×12 and assumption. Do not relabel annualized run-rate as realized annual revenue. |
| T11 / P1 inconsistent views | Feed the same forged/contradicted claim through pipeline audit and `groundingAudit`/adapter. | Executive, criterion card, expanded evidence, dashboard summary and export must preserve the same unsupported/contradicted status. Reading an old report must not upgrade truth via auto-citation. |
| T12 / P1 partial source excerpt | Register summary is truncated; a model quote is absent from summary but original saved full source is available. | Verify against immutable full source span, not truncated display text. If full source is unavailable, status remains unverified, not fabricated-by-default and not verified. |

## Expected state contract before implementation

Separate `citationPresent` / catalogue validity / quote-span verification / claim support / disclosure compliance. Suggested support states: `supported`, `contradicted`, `insufficient_evidence`, `assumption`, `not_assessed`; source provenance separately distinguishes founder-provided, independently retrieved and platform-calculated evidence. Founder-provided text is attributable evidence, not automatic independent confirmation.

Each material assertion needs claim text, entity, metric, value/unit/currency where relevant, period, source ID and source span/hash or calculation inputs. Store a reason when unresolved. Missing information must not be filled with model-generated quotes, guessed metric matches or synthetic evidence IDs. Numerical equality is at most a candidate-match signal.

The existing `groundedShare` is section-level citation/disclosure coverage, not a factual-accuracy measurement. Do not silently change its historical meaning. Introduce explicit versioned verification metrics and report-quality version, or migrate with a clearly documented definition. Unsupported critical claims block publication/valuation confidence; honest missing evidence remains visible and can trigger research or investor questions.

## Minimal implementation sequence and acceptance

1. Freeze these source/claim fixtures and truth-state contract (Q01/E03). Add negative assertions and positive controls to existing colocated tests when the corresponding code fix lands; do not commit a permanently failing default suite.
2. F01/E03: remove model quote-as-source trust; source-span verification and metric/currency/period/entity restrictions. Keep shortened-ID handling only as identity resolution, never support validation.
3. F02: replace criterion nonempty-citation bypass with the same evaluator used elsewhere. Audit all critical claims even when model budget is exhausted; unresolved remains unresolved.
4. Integrate critic/reviser: deterministic known mismatch cannot be suppressed by a same-number match. Mock caller responses to test unsupported findings survive and revised text is checked again.
5. Add pipeline/read-view parity fixture, immutable source snapshot and calculation trace. Then evaluate the plan’s broader 40-development/20-holdout corpus; these 12 cases are a focused regression subset, not the full sale-readiness benchmark.

Pass conditions: no forged quote or semantically mismatched source yields verified=true; legitimate supported paraphrases/calculations remain supported; unknown/assumption states survive cache/adapter/export; no paid model required for these deterministic regressions. Further adversarial cases should cover negation (“not profitable”), ranges, time zones, duplicate source IDs and competing sources once this minimum is implemented.

## First implementation boundary — source quotes only

The first E03 change rejects model-written quotes unless they match whitespace-normalized text in the supplied source. Any accepted quote retains its source context and topic restriction. Source-ID membership alone is no longer proof that a quote exists. New generation uses pipeline version `pipeline-v2.1-s-r4-source-quotes`, avoiding reuse of cached generation under the prior version; historical report records are not rewritten.

**I01 is only partially addressed:** numeric equality can still attach the wrong metric/entity/period, and pre-cited claims still need verification. I02 criterion citation bypass and the meaning of `groundedShare` are unchanged. No claim of semantic entailment or full report truth is made by the quote fix.

A stricter heuristic candidate and its adversarial tests were preserved in `/tmp/g30-strict-autocite-followup.patch` (development artifact against the then-current HEAD, not an approved patch to apply blindly). It checks number occurrence, currency/magnitude, recognized metrics and explicit entity/period qualifiers; broader regression revealed missing legitimate metric categories and old unsafe inference expectations. It must be rebuilt against normalized evidence/claim contracts, with independent positive/negative fixtures, rather than expanding aliases simply to satisfy a historical 85% coverage target. The deployed candidate must contain only the bounded source-quote fix until those contracts are ready.
