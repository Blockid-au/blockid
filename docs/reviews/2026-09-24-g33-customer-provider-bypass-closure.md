# G33 customer provider bypass closure — 2026-09-24

Source baseline: `192974ad2`. This is a local source review and mocked verification receipt; no deployment, paid inference, capacity benchmark or runtime configuration change occurred in this slice.

## Closed source gaps

Two customer CLO tools bypassed the previously enumerated `callAI` adapters by calling the Anthropic SDK directly:

- `web/src/app/api/data-room/auto-fill/route.ts` now calls the admitted dispatcher with `providerPolicy: "deepinfra-only"`, `agentId: "clo-data-room-auto-fill"`, authenticated user ID, report task class and the existing 4,096-token output limit. Empty output uses the existing document-template fallback. Authentication, credits and persistence remain unchanged.
- `web/src/lib/term-sheet/analyze.ts` now uses the same explicit provider restriction with `agentId: "clo-term-sheet"`, report task class and the existing 8,192-token limit. Its API route forwards authenticated user ID for dispatcher accounting. The existing Zod schema is supplied as JSON schema in the prompt and validated locally against decoded JSON; malformed, incomplete or failed generation returns the existing explicitly labelled demo mode. Deterministic cap-table dilution is unchanged. Provider-reported token counters remain observable; missing cache counters do not imply a cache discount.

The customer AST boundary inventory now covers 43 adapter files, including these two. Generic/background provider routes were not changed. A scan for direct Anthropic SDK usage in application/lib source leaves provider internals and the background score-feedback cron; structured helper transports still require the existing caller-specific policy and are not evidence of a new customer SDK bypass.

## Policy and accounting

No models, admission criteria, prices or ordering changed. Existing restricted report routing remains V3.2 / Qwen3-235B Instruct / V4 Flash according to task and deadline policy. Candidate models are not admitted by this patch. This is not a claim that those models are cheapest at equivalent quality, or that any account quota/capacity is verified.

`blockid-report-v1` report admission and the US$0.50 report ceiling remain unchanged. These standalone document tools use existing dispatcher accounting; `providerPolicy` alone does not create a durable report scope or claim per-report budget enforcement. Their pre-existing feature-credit behavior was preserved.

SVI source review found that `src/lib/ai/client.ts` customer generation calls the scoped proxy, with `customer-provider-policy.ts` requiring scoped inference even for unknown runtime task values and denying legacy customer synthesis. Existing legacy provider helper code is not used by that customer generation entrypoint. This observation is source evidence, not a deployed traffic receipt.

## Remaining semantic findings

Provider correctness does not establish narrative truth. In `web/src/lib/agents/cfo-financial-projection.ts`, model narrative fields are checked for string types and truncated, but their numeric claims are not validated against deterministic totals. An AI paragraph can therefore contradict the authoritative calculated projection. This finding was subsequently addressed in the bounded narrative follow-up below. Projection formulas and valuation calculations remain unchanged.

Data-room generation still uses its pre-existing plausible-placeholder instructions/template fallback, zero substitution for some missing financial values, and credit/persistence behavior. Migrating its provider does not certify those generated claims or alter its billing contract. Term-sheet failure retains labelled demo output; no live-quality qualification is implied by schema validity.

## Validation

- Five focused suites passed: **290 tests**, including dispatcher provider/accounting behavior, the 43-file customer boundary guard, both customer API routes and the term-sheet analyzer. Invalid JSON, invalid schema and failed generation preserve labelled fallback and deterministic dilution.
- Full web TypeScript check (`tsc --noEmit --incremental false`) passed with no diagnostics.
- Targeted ESLint passed with zero errors and four existing unused mock-parameter warnings in the data-room route test. `git diff --check` passed.
- No external inference or outbound messages were sent.

## CFO narrative integrity follow-up

The separate authorized narrative follow-up changes `web/src/lib/agents/cfo-financial-projection.ts`: the model now selects non-empty arrays of approved, section-specific reference IDs. Application code owns the complete rendered sentence for each reference, including metric name, unit, value and year. Arbitrary generated strings, numeric overrides, unknown or misplaced IDs, duplicates, missing fields and extra fields reject the entire payload and use the deterministic full narrative. Output types remain three strings for existing consumers; no AI-authored prose is displayed.

This deliberately bounds the model's editorial freedom: it can select supported facts but cannot supply novel financial interpretations or revised figures. No loose numeric matching is used, so number words, percentage substitutions and year reassignment cannot pass as supported claims. The fallback uses the same authoritative catalog as accepted selections.

Narrative-only accuracy corrections distinguish zero net burn from the capped finite-runway marker, label runway as a static estimate, avoid describing declining revenue as growth, and remove the unsupported claim that configured assumptions are sector-standard. No projection formulas, inputs/defaults, provider restriction, output token budget or spend policy changed. This guard does not validate the quality of the underlying input/default assumptions, and it is not a deployed valuation activation.

Validation: **67 tests across two suites passed**, including 24 CFO projection tests and the 43-file customer policy guard. Cases cover contradictory money, percentages and number words; mismatched year labels; malformed/missing/extra references; legitimate supported selection; deterministic schedule preservation; declining revenue; finite capped runway and no finite runway. Targeted ESLint passed without warnings or errors; `git diff --check` passed. The parent is running the combined final TypeScript check.
