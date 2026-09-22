# G30 A02: detailed criterion reading experience

Implemented from `d9bc2885b` in an isolated branch, using the UI/UX Pro Max guidance already read for the source-detail phase: progressive disclosure, readable semantic light tokens, keyboard-friendly controls and compact summaries. No new model/search request, credits, database mutation or deployment.

## What changes

The eight canonical report areas already exposed nested criteria but primarily repeated verdict/gaps and citation IDs. Each recorded criterion now adds:

- Its unchanged canonical verdict, strengths, gaps and requested next action.
- Clearly labelled investor diligence guidance and a concrete criterion-specific follow-up request for all13 existing criteria. Problem guidance explains buyer/user, workflow cost/frequency and paid validation. Market guidance distinguishes TAM/SAM/SOM, scope, sales capacity, time horizon and source-backed inputs; no fixed percentage or market size is invented.
- Only consistency issues explicitly linked to that criterion, with a warning in its summary. Existing material area warnings remain visible before opening details.
- Limitations when the assessment lacks grounding, citations or a full pipeline chapter; absent evidence does not become a claim that the business lacks capability.
- A matched chapter or appendix evidence record alongside each citation: label, stored value and observation date. A matching ID means the source is recorded, not that the quoted claim is semantically verified.

VI uses existing localized criterion titles, localized quality labels and dedicated diligence wording. Canonical business statements and source text are preserved without machine translation. Native nested disclosures stay in the existing area, with no extra navigation, job or charge. Existing lightweight/final report consumers share the projection.

## Evidence and limits

14 focused projection/reader tests passed, covering preserved canonical content, known source records, missing assessment/no invented findings, criterion-scoped contradictions, EN/VI, and no checkout on reading. ESLint targeted changed modules. Full browser, broad TypeScript and full report evaluation are deferred under the current pace preference.

This adds specific **reading guidance**, not a new model-generated business conclusion. The canonical schema does not provide a separate verified investor implication for every question, so the UI labels guidance honestly. It does not mark52 questions answered, independently verify a source or resolve contradictions. Missing criteria are not fabricated into canonical chapters. This phase does not change score, valuation, research, billing or export rendering. Full§6.6 and sale gates remain open.
