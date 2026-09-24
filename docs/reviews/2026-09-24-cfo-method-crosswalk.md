# CFO V04-P0 — methodology disposition and caller inventory

24 September 2026. Source-grounded implementation crosswalk for the [CFO projection/valuation plan](../plans/g32-cfo-projection-valuation-implementation-2026-09-24.md). **Analyst review pending.** This document records proposed dispositions, not completed retirement, migration or financial-method certification. Existing persisted reports, share allocations and dividend rights are not rewritten.

Scope: named financial modules in the plan, direct executable imports/call sites under BlockID `web/src` and SVI `src`, and references searched in BlockID `scripts`/`web/scripts`. Tests/type-only consumers are distinguished from executable callers. This is not a generated proof of repository-wide reachability: dynamic imports, scripts outside these roots, DB-stored jobs and runtime feature activation require the later P7 inventory gate. No live jobs or connector calls were executed.

Disposition vocabulary: **keep** means reuse a narrowly identified primitive after its stated gate; **correct** preserves the role but changes inputs/math/provenance; **replace** migrates active calculation to the common methodology contract; **retire** removes an unsuitable calculation from new outputs; **legacy-read-only** preserves versioned history, not ongoing execution.

## 1. Old CFO v1 report engine

Source: `web/src/lib/agents/cfo-valuation.ts`.

| Export/current method | Disposition | Required correction / validation |
| --- | --- | --- |
| `buildVcValuationReport` and automatic method weighting | **replace**; saved `VcValuationReport` becomes **legacy-read-only** | Keep compatibility reader. New reports use method-local eligibility and explicit CFO reconciliation; no forced numerical blend |
| `revenue_multiple` row | **correct** | Actual metric/currency/period, approved comparable selection, EV/equity basis, source date and source eligibility; no static sector lookup promoted to observed comparables |
| `dcf_proxy` row | **retire** as a DCF method | Current formula is ARR × (sector lower multiple + 1); row rationale now acknowledges no discounted cash flows. Map any retained illustration to a named multiple heuristic, not DCF |
| `comparables` row | **replace** | Current result uses related ARR/growth drivers; cannot treat agreement with revenue multiple as independent corroboration |
| `risk_factor_summation` row | **correct** | Calibrated risk/driver rationale and bounds; no multiple inflation or tax benefit double counting |
| `berkus` / `calculateBerkusValuation` | **correct** | Current A$500k per pillar and ±30% bands require regional transaction calibration and source-backed milestone eligibility |
| `scorecard` / `scorecardFactors` / `scorecardMethod` | **replace** | Question-level reviewed mappings and regional references; no total-SVI monetary multiplier |
| `stage_baseline` / `sviStageFor` | **retire** as automatic valuation; historical **legacy-read-only** | Stage mapping can remain classification only; a stage anchor is not a sourced business value |
| `calculateVcMethodValuation` | **correct** | Exit basis, horizon, required return, dilution and rights explicit; use common deterministic VC implementation after scope review |
| `calculateRoundDynamics` | **keep**, arithmetic only | Explicit simple primary priced round; independent pre/post-money oracle; reject complex rights/fees/secondary |
| `calculateRuleOf40`, `evaluateUnitEconomics`, `monthlyRevenuePerCustomer`, `unitEconomics` | **correct** | Missing ≠ zero, units/periods/source binding; ratios are operating indicators, not automatic price drivers |
| `calculateRdtiBenefit` | **correct** | Qualified eligible expenditure and tax schedule, explicit timing; no universal refund or mechanical EV premium |
| `applyMarketSizingDiscount` | **retire** uncalibrated automatic haircut | Replace with documented market feasibility assessment/scenario assumptions |
| `vcBenchmark`, `classifyGrowthBand`, `growthAdjustedSectorMultiple`, `growthTierAdjustment` | **correct** | Reuse resolver/version machinery; source/calibrate growth adjustments, separate static fallback from admitted market data |
| `estimateMarketSizing` | **correct** | Market sizing is a capacity check, not generated company revenue or value |
| `projectFinancials`, `auExitRealisationCheck` | **replace** calculation / **correct** exit check | Linked cash/capex/NWC/financing and consistent EV/equity basis; exit-realisation assumptions need source and suitability review |
| `normaliseRevenueSource` | **keep** for labels only | Label normalisation cannot attest authentic connected revenue |
| `generatePricingTiers` | **keep** as separate product-pricing suggestion | Not business valuation; retain AI suggestion labels and separate from CFO financial authority |

Direct runtime consumers observed:

- `web/src/app/api/valuation/vc/route.ts` → `buildVcValuationReport`.
- `web/src/lib/scn-detect.ts` → `buildVcValuationReport`.
- `web/src/lib/valuation-certificate/server.ts` → `buildVcValuationReport`, `vcBenchmark`.
- `web/src/app/api/score/route.ts` imports CFO helpers; this scoring integration must not let valuation inflate assessment.
- `web/src/lib/share-price.ts`, `web/src/lib/valuation-mrr-bridge.ts` → `vcBenchmark`.
- `web/src/lib/financial-projections.ts`, `web/src/lib/agents/cfo-projection-norms.ts`, `web/src/app/api/financial-projections/route.ts` import `VC_BENCHMARKS`.
- `web/src/app/api/founder/pricing-tiers/ai-fill/route.ts` imports pricing helpers.
- Type/display consumers include `lib/pdf/valuation-report-pdf.tsx`, `app/api/valuation/pdf/route.ts`, and `(app)/(founder)/workspace/valuation/vc-valuation-dashboard.tsx`; preserve legacy render compatibility while migrating new writes.

## 2. Competing valuation implementations

| Module and exported/current methods | Disposition and reason | Current direct callers observed |
| --- | --- | --- |
| `web/src/lib/c-level/compute-c-level-dcf.ts`: `buildCFODCFValuation`; internal five-year cash-flow discount, Gordon/exit terminal, sensitivity/tornado and presentation | **correct/reuse selected arithmetic**, then **replace** competing engine. Existing actual discounting must not be described as absent. Scenario WACC 42/38/34%, tax presets and terminal assumptions are not accepted inputs; FCF requires capex/NWC/reinvestment audit. Gordon numerator/timing and alternative terminal selection need independent oracle | No non-test executable caller of `buildCFODCFValuation` found in searched source/scripts. `lib/investor-pack-assembler.ts` and `lib/investor-pack/c-level-chapter.ts` import output **types**, not this generator |
| Same module: `scanForRealNames` | **keep** only as presentation check; unrelated to numerical correctness or standards compliance | `web/src/lib/investor-pack/c-level-chapter.ts` |
| `web/src/lib/clevel-valuation.ts`: `computeCLevelValuation`; Berkus, Scorecard, `dcfValuation`, `vcValuation`, `sviValuation`, blended ranges and `deriveActionPlan` | **replace** engine; **retire** SVI-to-money component and fixed 35% WACC/10× return/8× ARR choices as business facts. Historical results **legacy-read-only**; action text may be reused only against new results | `web/src/app/api/valuation/clevel/route.ts` |
| `web/src/lib/agents/deep-valuation.ts`: `buildDeepValuationAnalysis`; investor/market/operational/ecosystem perspectives; revenue scenarios, peer comparables and weighted result | **replace** calculation; **retire** aggregate-SVI dependence and invented growth/margin/LTV-CAC defaults. Keep narrative structure only after source and numeric audit. Multiple perspectives are not independent valuations | `web/src/lib/guest-analysis/runner.ts`; `web/src/lib/analyses/first-analysis/build.ts`; `web/src/app/api/svi/route.ts`. `agents/scn-action-plan.ts` imports result type |
| SVI `src/lib/decision/valuation-engine.ts`: `computeValuationTriangulation`; private `revenueMultipleMethod`, `vcMethod`, `berkusMethod`, `scorecardMethod`; median consensus and ask comparison | **replace** new calculation with shared qualified contract; historical schema **legacy-read-only**. Claim counts cannot substitute for calibrated team/product assessment; preset multiples and automatic median do not establish fair value. Ask-vs-model comparison requires suitable admitted model | SVI `src/lib/pitchdeck/analyse.ts`, `src/lib/pitchdeck/job-runner-v2.ts`. Type-only consumers: `lib/enrichment/investor-score.ts`, `lib/enrichment/risk-register.ts`, `components/company/dashboard/ValuationBars.tsx`, `components/company/ValuationTab.tsx` |

No-caller-found means source search found no executable reference in the stated scope; it does not prove that a module has never run, nor that historical reports can be deleted.

## 3. Projection and benchmark implementations

| Module/exports | Disposition | Direct callers observed / acceptance |
| --- | --- | --- |
| `web/src/lib/forecast-builder.ts`: `computeProjection`, `validateForecastInput`, `getAfslDisclaimer` | **correct** reusable operating-model calculations and validation; retain disclaimer as copy only | `web/src/app/api/financial/forecast/generate/route.ts` calls computation/validation. Reconcile monthly identities, capex/NWC/debt/tax and missing inputs before adapter activation; a disclaimer is not method validation |
| `web/src/lib/financial-projections.ts`: `generateMonthlyProjection`, `generateProjection`, `isProjectionScenario`, `projectionToCsv` | **correct/replace calculation** with common schedule; **keep** serializers/schema compatibility after parity tests | `web/src/lib/clevel-valuation.ts`, `web/src/app/tools/financial-projections/projections-tool.tsx`, `web/src/app/api/financial-projections/route.ts`. Cash roll-forward must include funding and balance-sheet movements; export from same payload |
| Same module: `calculateValuationMultiples`, `calculateMarketCapture`, `calculatePaybackPeriod` | **correct**, separate indicators from company valuation | Above module consumers; require metric/period/currency and denominator gates, source-backed market feasibility, not automatic TAM share |
| `web/src/lib/agents/cfo-financial-projection.ts`: `generateFinancialProjection` | **replace** model-generated numerical authority; **keep** CFO narrative role | Dynamic import in `web/src/app/api/startup-package/deliverable/[slug]/route.ts`; `lib/pdf/financial-projection-pdf.tsx` is typed output renderer. CFO proposes assumptions; deterministic engine calculates; narrative must match results |
| `web/src/lib/agents/cfo-projection-norms.ts`: `computeProjectionNorms` | **correct**, reviewed norms registry with version/date/source; unsupported or assumed norms explicitly labelled | No executable call found in searched source/scripts; `report-pipeline/dimension-owners.ts` references module as ownership metadata. It imports static `VC_BENCHMARKS`; metadata reference does not prove integration |
| `web/src/lib/valuation/sector-multiples.ts`: `resolveSectorMultiples`, `getSectorMultiples`, `primeSectorMultiples`, cache/admin/date helpers | **keep** approved-override/version mechanics; **correct** eligibility of static fallback and market basis | `agents/cfo-valuation.ts`, `share-price-server.ts`, `app/api/valuation/vc/route.ts`, `app/api/valuation/route.ts`, admin sector-multiple routes/pages. `isoDate`, `overrideLabel`, `invalidateSectorMultiplesCache`, `cachedApprovedOverrides` are infrastructure; `setSectorMultiplesOverridesForTests` is test seam |
| `web/src/lib/valuation/comparables-repo.ts`: `deriveArrMultiple`, `rowToCompany`, `topComparables`, snapshot/count/source-window helpers and loader/cache functions | **keep** storage/review plumbing; **correct** interpretation/eligibility | `report-v2/adapter.ts`, `report-pipeline/valuation-chapter.ts`; `.server` loader used by `report-v2/load.ts`, `report-pipeline/orchestrator.ts`, admin/report KPI pages. `deriveArrMultiple` uses post-money/ARR where available: do not relabel this equity-derived ratio as EV/ARR without bridge. Round proceeds ≠ valuation; illustrative static rows ≠ observed comparables |

## 4. Financial-rights consumers: migrate prospectively

| Module/exports | Disposition | Direct callers observed |
| --- | --- | --- |
| `web/src/lib/share-price.ts`: `sviValuationRange`, `computeSharePrice`, `revenueSourceLabel` | **retire** SVI-to-price and automatic SVI/ARR blend for new official results; **replace** with accepted equity/instrument revision divided by appropriate shares/rights. **keep** display label helper without attestation claims | `web/src/lib/share-price-server.ts` calls calculator |
| `web/src/lib/share-price-server.ts`: scope loader and mid-price loader | **correct** source of future price, preserve existing issued rights | `web/src/app/api/share-price/route.ts`; `web/src/lib/listing/server.ts`; `web/src/app/api/dividends/[recordId]/statements/route.ts`; `web/src/app/api/dividends/drip/elections/route.ts` |
| `web/src/lib/vesting.ts`: `computeVestingTimeline`, `getCurrentVested` | **keep** schedule arithmetic after regression checks; do not migrate historical vesting rights based on scenario results | `web/src/app/api/cron/vesting/route.ts`, `web/src/app/api/vesting/[id]/route.ts`, workspace ESOP vesting client; `components/workspace/vesting-chart.tsx` consumes type |
| Same module: `computeSharePrice(sviScore, authorizedShares)` | **retire** from future valuations; historic curve **legacy-read-only** | Imported as `basicSharePrice` by `web/src/lib/share-structure.ts`. Formula is A$100k plus SVI delta × A$2k/A$500, floor A$10k; not a qualified valuation |
| `web/src/lib/share-structure.ts`: `computeSharePriceFromSVI`, `shouldRecompute` | **replace** valuation dependency and trigger; score change alone must not reprice financial rights | `web/src/app/api/share-structure/route.ts` imports `computeSharePriceFromSVI` and defaults |
| Same module: `computeShareAllocation`, `computeAllAllocations`, `getDefaultShareStructure` | **keep/correct** share arithmetic separately from valuation | Above API imports defaults; no independent runtime consumer of the other allocation helpers established by this limited inventory. Defaults must not assert issued shares or accepted company value |

Migration requires explicit legal/instrument basis and versioned effective date; no scenario endpoint may trigger issuance, DRIP election changes, dividend recalculation or retrospective price replacement.

## 5. New shared CFO implementation: restricted reuse status

The new `web/src/lib/valuation/cfo-methodology-core.ts`, `cfo-projection-core.ts`, `cfo-assessment-drivers.ts`, `cfo-projection-valuation.ts` and `cfo-scenario.ts` are **keep for scenario-only execution**, pending broader P1/P5/P6/P8 acceptance. SVI receives exact copies through `scripts/sync-cfo-engine.mjs` with hash manifest and drift check; it does not maintain separate formulas.

The scenario API/UI are positive implementations of explicit financial arithmetic, not a new accepted revenue producer. [Stripe producer disposition](2026-09-24-cfo-stripe-producer-disposition.md) explains why report revenue admission remains blocked. No old engine is automatically retired merely because these new modules exist.

## 6. Review/closure gates still pending

- Analyst signs method suitability, source versions and restrictions; map IVS/IPEV requirements from accessible authoritative editions rather than equating a method name with compliance.
- Confirm every executable consumer under runtime configuration, jobs and scripts; record migration owner and compatibility contract. Code import is not live execution evidence.
- Independent oracle per method, source-at-date calibration, comparable selection log, cash/EV/equity/instrument bridge and negative-case corpus.
- Accepted evidence producer/read-back, immutable valuation publication and web/PDF/DOCX/email/workbook parity.
- Explicit old-result legacy labels and migration gates protecting issued rights. Only then change these proposed dispositions to completed P7 records.
