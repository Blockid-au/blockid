# G30 R02: exact public-statement qualification

Implemented from `fb4c4a396` in isolation. No network/search/model calls, customer mutations or paid evaluation were performed by this task. Retrieval already exists; this phase evaluates its stored snapshots locally.

## Supported evidence scope

The new qualifier promotes an **attributed source statement**, not a verified business fact. The only supported claim is the exact generated text `The page at <URL> states: <JSON-quoted complete excerpt>`. The quote must match the entire stored excerpt byte for byte, retain surrounding negation/comparisons, and include the complete business name on Unicode word boundaries. Request project/business/source URL must match the server-owned research snapshot. Source must be a successfully read business link with valid fetch date, content hash and the new stored-excerpt hash. Missing, blocked, older un-hashed, duplicate-ID, entity-mismatched and unresolved alternative sources stay pending with reasons.

An excerpt hash and snapshot hash make the result reproducible across serialization; they are integrity bindings, not signatures proving publisher identity. Callers must use the server-owned retrieved snapshot, never accept caller-supplied source records as attestation. The business-link role comes from supplied input, not independently verified domain ownership. A business name mention is not entity resolution or proof that a statement is true. The attributed quote may concern another company or contain a denial; it remains valid solely as a statement made by that page, with the entire context retained.

## Integration and citation boundary

The existing retrieval function creates deterministic proposals from already-read business excerpts without another model call, and stores optional `attributions` plus `qualificationPending` in `appendix.publicResearch`. Old reports remain valid and are not retroactively promoted. Raw sources remain `citable:false`; competitor relevance remains pending and verified competitor count stays zero. Existing market prompt receives this scope and warns that matched attributions cannot establish actual business metrics.

Promoted attribution IDs are deliberately separate from the generic evidence/citation register. The existing generic auto-cite can match numeric values and trust pre-existing IDs without complete entity/period/semantic validation. Admitting these page numbers there would let a same-number, wrong-company claim appear supported. `supportsPublicAttribution` therefore permits only the exact supported attribution text; a shortened quote, paraphrase, translation, revenue inference or same-number claim about another entity is rejected. Wiring a broader report citation-consumption path remains a separate gate, not hidden behind this implementation.

## Targeted evidence

15 focused tests passed across qualification/retrieval: exact quote with negation, fabricated quote, shortened context, same-number wrong-entity use, project/entity/source mismatch, unavailable source, changed/missing excerpt hash, unresolved alternatives, business-name substring, and stable snapshot JSON round-trip. ESLint was run only on the four changed research source/test modules. Full TypeScript and broad reviews are deferred to integration under the current pace preference.

## Still open

R02 independent corroboration, publisher ownership, competitor entity resolution, sector/geography/period applicability, arbitrary claim entailment, source freshness and material contradiction analysis are not completed here. The UI continues to present source relevance as pending. A quote match cannot raise revenue eligibility, valuation certainty, report score or research coverage to verified.
