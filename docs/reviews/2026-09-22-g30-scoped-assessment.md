# G30 RA2 scoped assessment draft — 2026-09-22

Baseline: isolated `g30-scoped-research` at `0eeda62df`; no primary edits, live calls, SQL, fees or deployment.

## Implemented

`web/src/lib/reanalysis/scoped-assessment.ts` consumes the actual scoped-public-research collector and server-loaded original CriterionCard records. It checks job/business/base/input/current scope version and recomputes the collector snapshot digest before inference. Duplicate canonical criterion records or mismatched result scopes reject. The draft retains the existing verdict/strengths/gaps/nextAction shape, adding per-question investor implications, optional explicitly unverified comparison hypotheses with evidence needed, limitations and change rationale. Missing original criterion data remains visible as absent context, never a manufactured score.

The transport is mandatory and injected with the existing AICallOptions/AICallResult contract, fixed `blockid-report-v1` policy, synthesis task, bound user and bounded call budget. Response policy must confirm the policy. This module has no default live transport. An adapter must check lease/cancellation/authorization before and after inference; cancellation discards generated output. Public source text is untrusted data; only already-collected sources enter synthesis, no additional search/network tool or raw private deck input is accepted here. Original report findings may be private: the future worker must load them under authorized revision access and the existing inference policy, not from browser-provided data.

Observations are separate from inference narrative. Each citation must exactly match a freshly requalified source ID, full excerpt and complete literal page-attribution statement in the selected scope. Quote matching establishes only what that snapshot says, not ownership, truth, competitor relevance or that a number applies to a business. Snapshot digest binds source collection, original findings, generated sections, model/provider and policy. These observations are local scoped-draft records, not promoted into the legacy report citation registry.

## Intentional quality boundary / remaining work

The model can still make an unsupported semantic claim in free text: JSON validation and exact quotes cannot prove semantics. Therefore **every output remains `draft_partial`, narrativeVerification=not_semantically_verified, scoreChange=null, readyForFinalCapture=false**, even with valid observations. Invalid attribution/shape/policy rejects the whole draft. No charge-eligible result or report-head replacement is produced. No comparison count, competitor identity, valuation, Investor Score or SVI recomputation is inferred from read pages. Consumer UI must label the entire narrative as a provisional assessment and must not turn local source observations into generic fact citations.

Remaining integration: durable job worker + lease adapter, trusted original revision resolver (both sites retain separate account/wallet policy), approved budget enforcement before transport, semantic claim/entity/unit/time qualification, score dependency evaluation with explicit insufficient evidence, final revision persistence and atomic receipt settlement. No route activation before these dependencies. Existing no-evidence/not-run collector states remain explicit; a complete market assessment is not claimed.

## Focused verification

`vitest run --root web src/lib/reanalysis/scoped-assessment.test.ts src/lib/reanalysis/scoped-public-research.test.ts`: 11 cases passed, mock inference and fixture page reads only. Covers stale base, changed source snapshot, fabricated quote, same-number wrong-entity attribution, duplicate scope, unauthorized numeric score field, absent policy confirmation, cancellation and unavailable research. Targeted ESLint only; broad type/build/review deferred to root phase integration.
