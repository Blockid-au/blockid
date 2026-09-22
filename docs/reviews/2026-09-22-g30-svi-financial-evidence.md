# SVI financial evidence qualification — 2026-09-22

## Correctness change

The previous extractor treated generated investor answers and generated company summaries as source facts and instructed fixed USD→AUD 1.55 / GBP→AUD 2.0 conversions. Both report pipelines then restored unsupported/null values from regex extraction. This could turn model assertions or ambiguous currency into investor-facing measurements.

The extractor now receives only the first 32,000 characters of original deck text. It proposes structured measurements with exact source lines, scalar text, period and scope. Deterministic qualification—not the prompt alone—checks exact source location, complete line context, attached metric label, finite numeric value and scale, explicit AUD currency, metric units, ranges/qualifiers, nonnegative constraints where appropriate, and basic period consistency. Cropped source quotes, unsupported currencies, ambiguous dollar amounts, forecasts/negations/competitor context, repeated excerpts, and multiple candidates for one metric are withheld. These conservative checks do not establish that management's statement is true.

Optional `provenance` persists `version: deck-evidence-v1` and a per-field record with `status: stated | derived | withheld`, optional `quote`, `period`, `basis`, `reason`, and `inputs`. Existing nullable numeric fields remain compatible; legacy reports have no inferred provenance. Reasons describe extraction qualification, not a conclusion that the entire deck lacks a number.

Both pipelines now preserve unsupported/null financial measurements and no longer use `heuristicFinancials` to fill them, including streamed stage summaries. Both main pipelines skip valuation calculation when no finite scalar measurement exists; provenance metadata does not count, and an explicitly stated zero does. Their empty-metric fallback omits optional provenance rather than setting it to null. No stored report was rewritten.

Derived runway and LTV/CAC require qualified, explicitly matching period and scope; denominator must be positive. Post-money/ownership additionally require explicit priced-equity round context. Scope must be a copied `Company:`, `Cohort:` or `Round:` label; period must contain a supported year/quarter form. This deliberately excludes many ordinary decks from automatic derivation until a stronger compatibility model exists. Calculations never replace a rejected explicit measurement. Every result must be finite; ownership cannot exceed 100%.

## Verification

`node --experimental-strip-types --test src/lib/decision/financial-evidence.test.mjs`: 8 groups pass. Tests cover valid AUD scaling and zero, missing/foreign currency, truncated source number/scale, unit/period mismatch, projected/negated/cropped source context, missing evidence, conflicting periods, compatible calculations, zero denominators, no unjustified financing calculation, and both pipeline assembly paths.

The mocked extractor test intercepts the AI client module before import; no provider or registry request runs. It proves generated answers/company fields never reach the financial prompt and persisted evidence survives schema parsing. `tsc --noEmit --incremental false` passes in the isolated worktree. No dependency install, paid/provider test, production build or deployment was performed by this change's author.

## Remaining limits

This is conservative text evidence qualification, not an external financial audit or full semantic verification. English label grammar, line-oriented PDF text, explicit per-quote AUD and the 32,000-character excerpt limit reduce recall. Context elsewhere in the document, tables, foreign-language labels, period/cohort ownership and management accuracy still require review. A future evidence-aware parser can increase coverage without restoring unsupported figures or fixed FX guesses.

The valuation engine's heuristic methods, generated company extraction and downstream scoring were not rewritten here. They must not be represented as audited valuations merely because financial scalars are now source-qualified. UI should distinguish management statements, derived calculations, unavailable measurements and legacy source-unavailable values. Customer research admission, paid re-analysis, wallet holds, raw report store, report deletion and scoring revisions are unchanged.

## Root integration / release scope

This annex belongs to the single G30 SOURCE-OF-TRUTH. Concrete P0 input errors were prioritized before automatic research-driven valuation: fixed FX, numbers repeated from AI summaries, and heuristic rescue of rejected fields. UI now discloses original excerpts/period/scope and compatible-input calculations in a collapsed light-theme panel. Historical figures without provenance are labelled as lacking per-KPI source excerpts; raw saved reports are not rewritten. Valuation UI explains preset assumptions and calls outputs scenarios. No claim that the existing heuristic valuation engine has become market-calibrated.

Confidence coverage counts only finite numeric financial fields, not the new provenance object. Root reproduced and corrected truncated space-grouped amounts (AUD100000 cannot become100 by cropping value_text);9 focused groups passed after this fix.14 EN/VI source-detail SSR assertions passed; two synthetic full FinancialsTab browser cases passed (EN1440/VI375, keyboard44px target, no overflow/requests/pageerrors, withheld quote hidden, HTML escaped). Evidence `/tmp/svi-financial-integrated-tests.log`, `/tmp/svi-financial-browser-evidence.json` and `/tmp/svi-financial-ui-check.cjs`. These are synthetic checks; no paid model request was made.

Initial candidatee821daf built successfully but was not launched/promoted after the truncation defect was found. Corrected candidate1489a1a has a new immutable build; final deployment identity/evidence is recorded below after promotion. Both pipelines preserve unsupported fields as unavailable and skip main-path valuation when no scalar financial data is present. English/line-oriented qualification remains conservative; absence does not mean the business lacks that metric. Some raw reasons remain English in VI detail. Real semantic/economic validation, currency normalization, source authority and cross-site paid research remain open.

## LIVE release acceptance —22/09/2026,14:30UTC

Compiled1489a1ac109e96e6001502d41e4070b542e9f6fd is live at4208, BUILD QyiuFvycNi4k1lykKS9wT, immutable release `/data/startupvalueindex-releases/1489a1ac109e96e6001502d41e4070b542e9f6fd`; unit `svi-release-1489a1ac109e96e6001502d41e4070b542e9f6fd.service` enabled at boot. Normal full Next build/type gate passed (1m46s,1.9GB peak). Actual4207→4208 promotion,4208→4207 rollback and4207→4208 forward succeeded; six static samples preserved.4207/919f911 warm;4206/4205/4204/4203/4202/4002 retained.

Raw report store reader hash unchanged; exact two financial producer paths and finite-number confidence counting were explicitly reviewed, not claimed unchanged.81 pre-existing raw report file hashes unchanged across release. No Server Actions introduced; no synthetic paid/provider call, admission POST or financial transaction. Public/live and/vi/live return200 without error boundary. Monitor active; non-SVI nginx and BlockID canonical robots unchanged. Logs `/tmp/svi-g30-financial-{final-build,launch,static,promote,rollback,forward,finish}.log`; private rollout receipt holds identity/parity proof.

Deployment and focused checks do not constitute a real-model extraction benchmark or full valuation/research acceptance. Provider/model quality, multilingual/table support, market research, ownership/lifecycle, atomic paid operations and longitudinal customer score activation remain open. This phase is delivered; overall G30 remains in progress.
