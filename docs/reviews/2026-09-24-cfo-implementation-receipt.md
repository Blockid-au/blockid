# CFO implementation receipt — 24/09/2026

## Authority and scope

Founder’s follow-up “hãy làm toàn bộ” supersedes the prior plan-only instruction for implementation. This receipt records actual work against [V04-P0…P8](../plans/g32-cfo-projection-valuation-implementation-2026-09-24.md), G31 criteria presentation and G33 provider/status correctness. **Source implementation is in progress; no production deployment or full-plan acceptance is claimed.**

Baseline: BlockID `c2e147066`, SVI `565250b`. Existing dirty runtime/content files were not part of these changes. No migrations, paid benchmarks, official score updates, share issuance, vesting rewrites or production connector writes were performed.

## Delivered in source

- Deterministic CFO registry/core: FCFF/WACC, FCFE/cost of equity, matching market multiples, VC scenario, adjusted net assets and simple-primary transaction anchor. Explicit provenance/entity/revision/date/currency/units, terminal policy and EV→equity bridge. No assumed WACC, aggregate SVI-to-money formula or automatic blend. Primary-round identity is post-money = cash/ownership, pre-money = post-money−cash.
- Monthly operating/cash/debt/capex/working-capital/tax-loss schedules and annual rollups; six explicit revenue driver templates. Missing inputs reject rather than become zero. Funding gaps remain visible. This is a scoped model, **not a fully reconciled three-statement forecast**.
- Projection→FCFE adapter using complete rolling 12-month blocks, explicit annual-end-period convention and sourced cost of equity. Equity injections/dividends are excluded from FCFE; debt movements are counted once. Funding/rights review remains required.
- Shadow-only three-family question panel validates exact evidence quotes, question/rubric/revision bindings, founder-claim cap2, N/A and disagreement handling. Exposes a stable cache key and CFO-compatible assessment; no inference calls or live point changes. Literal SOT permits a single remaining valid ordinal vote; this quorum policy is explicitly pending analyst review before activation.
- Question-level score-to-driver proposals require matching evidence revision/rubric, bounded calibration, reviewer, reference and expiry. Overlapping drivers reject. No production 52-question calibration has been invented or activated.
- Authenticated, project/user-scoped scenario APIs and interactive five-year FCFF forms: BlockID `/workspace/valuation/scenario`; SVI `/valuation/scenario`. Result payloads retain source assumptions, method versions and deterministic SHA256. JSON/CSV derive from the calculation; no AI recalculation or accepted-report write. These are **scenario_only**, not official company valuations.
- `scripts/sync-cfo-engine.mjs` produces exact five-file shared artifacts plus hash manifest in SVI. `--check` fails on drift. The two sites do not maintain independent hand-edited copies of the new formulas.
- BlockID summary of all 13 existing criteria, with missing states distinct from zero, with web/TOC/PDF/DOCX parity. SVI web, email HTML/plaintext and DOCX share all16stored questions, localized narratives/reference IDs and an explicit valuation-unavailable section; report findings are static for print/PDF capture. No private accepted research is added. These are the existing taxonomies, not a claim that the G32 52-question panel is complete.
- DeepInfra-only report policy and explicit customer C-level adapter restrictions. Existing admitted models retained: Flash classification and V3.2 narrative baseline. Cheaper unqualified candidates are not promoted by price alone. See [provider coverage](2026-09-24-clevel-provider-coverage.md). SVI customer task transport uses the attested scoped proxy; report budget scopes are retained. Optional legacy Claude synthesis is disabled, historical outputs remain readable.

## Slice status

| Slice | Source status | What remains before acceptance |
| --- | --- | --- |
| P0 method crosswalk | [Method/caller disposition inventory](2026-09-24-cfo-method-crosswalk.md) completed in docs | Analyst review of standard/version/basis and legacy disposition |
| P1 inputs/producers | Explicit scenario provenance and source rejection implemented | Authenticated complete connector producer with verified entity binding; no allowlist-only bypass |
| P2 projections | Deterministic scoped schedules and drivers implemented/tested | Historical reconciliation, jurisdiction schedules, full three statements and corpus validation |
| P3 methods | Six method/anchor families implemented/tested | Reviewed calibration/First Chicago/heuristic inputs, complex instrument allocation and qualification |
| P4 scoring sync | Shadow panel and bounded reviewed mapping contract implemented/tested | 52-question panel/ledger, real calibrated mappings, accepted revision integration |
| P5 calibration | Open | Qualifying transaction corpus, independent reviewers, predeclared holdout thresholds and backtesting |
| P6 parity/publish | Scenario hash/JSON/CSV; criteria web/export parity implemented/tested | Accepted immutable valuation repository, all CFO narrative/export consumers, full XLSX workbook and official save/read-back |
| P7 migration | Shared scenario engine on both apps | Retire duplicate official engines after source/calibration gates; preserve historical rights |
| P8 rollout | Open | Stable G33 runs, exact build/deploy receipts, canary and financial/score acceptance |

## Validation

- CFO core/projection/adapter/driver/scenario/API plus touched legacy CFO suites: **9 suites, 181 tests passed**.
- DeepInfra dispatcher and CFO adapters: **240 tests passed**. Customer boundary expansion: **27 suites, 752 tests passed**. These runs overlap; counts must not be summed as unique coverage.
- SVI scenario/auth/body-boundary/UI checks: **4 tests passed**; transport/provider restriction checks: **6 tests passed**.
- Shared five-file hashes: check passed; deliberate drift in a temporary target correctly rejected.
- BlockID full `npm run typecheck`: passed after correcting overloaded-result narrowing.
- SVI initially lacked installed `tesseract.js` despite both manifest and lock declaring 7.0.0. Restored declared local dependencies using `npm install --ignore-scripts --no-audit --no-fund --package-lock=false`; this restoration did not edit manifest/lock. The subsequent explicit test-dependency correction is recorded below.

Final additional checks:

- Criteria web/shared/DOCX: **56 tests passed**; PDF: **17 tests passed** and standard/free visual inspection (free remains 10 pages). Artifacts: `output/pdf/criteria-parity-demo.pdf`, `output/pdf/criteria-parity-free.pdf`.
- SVI question/export parity: **11 tests passed**, covering EN/VI, escaping, missing data, recorded zero and private-content isolation.
- G33 status: **122 tests passed**, including public/trusted no-report outage regressions. [Status receipt](2026-09-24-g33-status-fix.md).
- Stripe/connected-revenue containment: **81 existing tests passed**, not positive producer acceptance. [Producer disposition](2026-09-24-cfo-stripe-producer-disposition.md).
- SVI full `npm run typecheck`: **passed** after restoring declared dependencies. The existing accepted-research UI tests also depended on undeclared `esbuild`; added pinned **dev-only** `esbuild@0.28.1` to manifest/lock. Combined scenario, provider transport and existing research UI: **17 tests passed**.
 No claim of production browser/end-to-end acceptance is made from unit/static rendering checks.

## Release constraints

The Stripe source currently cannot justify official revenue eligibility: pagination/completeness, currency/amount treatment and project/entity binding need repair and validation. Raising the reported valuation by accepting this data without those checks would conceal the underlying defect. The new scenario path makes assumptions visible while this gate remains closed.

The new model/provider policy removes outside-DeepInfra fallbacks for covered customer tasks. This is intentional and means a DeepInfra/proxy outage can surface a failure instead of switching provider. Standalone customer tasks without report scope retain existing gateway accounting; they do not acquire fictional per-report attribution.

No assertion of IVS/IPEV certification, “lowest possible cost”, financial forecast accuracy, all G31/G32/G33 completed, or all routes E2E validated is supported by this receipt.

Final independent code review found no material must-fix in the scenario arithmetic, authorization, hashing and export scope. All acceptance limitations above remain. Founder was asked for the existing analyst-labelled financial/transaction golden/holdout location; no dataset was fabricated.
