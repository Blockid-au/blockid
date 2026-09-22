# Uncapped SVI: source audit, model proposal and implementation boundary

Date2026-09-22. SVI baseline `732a704a55ad40b7573b3a12aa48a9852f367181`; isolated branch `g30-uncapped-svi`. BlockID source was read only. No paid/free inference, dependency install, shared cache writes, primary edits, SQL, UI activation or rewriting historic reports/valuation values.

## Decision

Use a versioned, uncapped **business evidence-state index**. It totals weighted criterion contributions from current supported business measurements. Supplemental analysis can add a newly supported criterion, update a measurement, resolve a contradiction or correct/retract an earlier claim. It does not add points for analyses performed, reports bought, credit expenditure, uploaded pages or repeated source citations.

Keep Investor Score, criterion quality, confidence/coverage and percentile distinct. They may remain0–100 where their definitions require it. SVI index points have no `/100`, currency unit, percent interpretation or upper bound. A fixed set of bounded criterion quality scores alone necessarily has a finite total; simply summing more question answers or removing a final clamp does not solve that mathematical problem.

## Confirmed current-source paths

| Repo/path | Current behavior | Required integration decision |
|---|---|---|
| BlockID `web/src/lib/svi-analysis.ts:15,1711` | version2.2.0; total is floor0 of100 +8 dimension adjustments +stage/sector/metrics/CI terms. No explicit final upper clamp. Several ingredients are bounded; metricsBonus is described0–50 but supplied externally. | Preserve legacy version and inputs. Do not claim every historical total was capped100 or that arbitrary external bonuses establish a principled unbounded index. |
| BlockID `web/src/lib/evaluation-criteria.ts` |13 evidence-collection criteria map onto8 underlying scoring dimensions. | New version uses an explicit criterion budget; avoid counting the same evidence once as criterion and again as dimension. |
| BlockID `web/src/lib/svi/three-case-valuation.ts:87` | valuation preview clamps incoming SVI to100 before applying a stage/sector multiplier. | Never feed new index points into this legacy multiplier. Keep old valuations immutable; separately revalidate/remove score-to-money heuristic before new valuation integration. |
| BlockID `web/src/lib/svi/with-tech-boost.ts`, `assessment-card.ts:194` | tech boost clamps total to100; assessment band mapping clamps argument to100. Evidence-confidence clamp at188 is legitimately a bounded subscore. | Inventory call sites and split index display/bands from bounded confidence. Do not blanket-remove every min100. |
| BlockID `web/src/lib/report-pipeline/run-for-project.ts` | writes rounded SVI into snapshot/current_svi paths, diffs against prior numeric total. | Persist method/profile/knowledge time; refuse cross-version growth deltas and mixed-method rankings. |
| SVI `src/lib/decision/svi-weights.ts` | running SVI is weighted mean of bounded criterion inputs over8 dimensions; normalization over only measured dimensions can change totals as coverage changes. | Keep as legacy running score until new evidence ledger is ready; new stream should show pending coverage separately, not animate guaranteed growth. |
| SVI `src/lib/enrichment/investor-score.ts` |11 dimensions clamped0–100; default50 for some missing evidence; weights vary by preset. Some points depend on claim counts. | This is Investor Score, not the new index. Do not migrate its values into new measurements or reward extra claim extraction. |
| SVI `src/lib/pitchdeck/job-runner-v2.ts:654` | emits svi_hint from investor_score.score. | Version/type separation required before any user-facing claim the number is the new SVI. |
| SVI `src/lib/decision/types.ts`, `components/company/CompanyOverview.tsx`, `dashboard/ScoreRing.tsx` | Investor Score/confidence schemas bounded100; overview prints `/100`; ring clamps for geometry. | Retain these for bounded metrics. Introduce a separate uncapped number/trend component for new SVI, not a progress ring. |
| SVI `src/lib/history-sync.ts` | sends numeric total_score without new method/profile metadata. | Add parallel versioned snapshot contract before history sync or ranking use. |
| SVI `src/lib/decision/valuation-engine.ts` | inspected financial-method engine; no new index consumption added here. | Preserve money estimates. Absence of direct SVI use in this file does not prove all valuation/rank consumers elsewhere are compatible. |

These are source observations, not a claim that every inspected branch is the currently served deployment. Full export/DB/ranking consumer inventory remains an integration phase; no live data was queried.

## Methodological basis and limits

OECD/JRC guidance treats composite indices as theoretical models requiring explicit normalization, missing-data handling, weighting/aggregation and robustness assessment. It does not validate these proposed BlockID weights or imply an index measures monetary value. [OECD/JRC handbook](https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html)

JRC warns weights affect results/rankings and correlated indicators can double-count a phenomenon even with equal weights. Use explicit construct ownership and group budgets, not every new source as another independent positive signal. [JRC weighting guidance](https://knowledge4policy.ec.europa.eu/composite-indicators/toolkit_en/navigation-page/10-step-guide_en/step-6-weighting_en)

Evaluate sensitivity to weights, anchors, normalization, missing data and freshness assumptions before ranking businesses or presenting score deltas as robust. Compare multiple plausible profiles; publish uncertainty and reasons if conclusions change. [JRC sensitivity guidance](https://knowledge4policy.ec.europa.eu/composite-indicators/toolkit_en/navigation-page/10-step-guide_en/step-8-sensitivity-analysis_en)

The asinh transform and following governance weights are **proposed design choices**, not recommendations or empirical findings of those sources. Transforming unbounded actual measurements is a principled way to avoid a finite score cap while reducing domination by raw scale. It does not make scale identical to investment attractiveness; risk, valuation and confidence remain separate.

## Proposed criterion weights and measurement ownership

Weights sum100%; supplemental analysis inherits its criterion's existing budget. These are initial review weights, not fitted or validated return predictors.

| Criterion | Weight | Primary construct / evidence required |
|---|---:|---|
| idea |8%|Problem severity and demonstrated customer need; supported rubric, not clarity of deck wording alone.|
| market |10%|Serviceable demand and competitive position; verified scope/segment research. Raw claimed TAM alone earns nothing.|
| founder_profile |8%|Relevant delivery history; avoid counting the same team fact again.|
| code_git |7%|Product/delivery execution assets and quality; no points per commit or repository.|
| website |2%|Observed customer-facing product clarity/function; no points merely for having a URL.|
| team |10%|Execution capability beyond founder history; verified responsibilities/outcomes.|
| customer_size |12%|Distinct active paying-customer stock/cohorts; distinguish users/trials, period and churn. An actual count can be unbounded.|
| gtm_strategy |8%|Repeatable acquisition economics/distribution; not volume of marketing claims.|
| documents |4%|Substantive governance/contracts/IP coverage; no points per file.|
| dataroom |3%|Reconciliation, traceability and material diligence completeness; no points per page or source count.|
| team_structure |5%|Accountability/key-person controls; no repeated headcount reward.|
| roadmap |7%|Validated milestone execution/customer relevance; future promises aren't achievements.|
| revenue |16%|Supported economic output such as consistent-currency recurring revenue; no ARR/MRR/trial-income double count. Actual supported scale can be unbounded.|

Founder/team/structure share a23% budget; product assets/website/roadmap16%; customer/revenue28%; need/market18%; GTM8%; governance/data7%. This reduces accidental inflation from correlated evidence but does not prove statistical independence. Calibration must test customer/revenue correlation and concentration sensitivity.

For nonsoftware sectors, mark code_git's software-specific construct not applicable and explicitly redistribute its budget within delivery/product constructs in a versioned profile; do not penalize missing GitHub. The prototype permits zero weights with total budget preserved. A criterion/profile cannot silently change meaning mid-series.

## Uncapped formula and meaning

For criterion c, with measured value x, frozen reference r, positive scale s, orientation d∈{−1,+1}, weight w summing1:

`contribution_c = 100 × w_c × asinh(d_c × (x_c − r_c) / s_c) × freshness_c`

`SVI_vNext = 100 + sum(current supported criterion contributions)`

100 means reference-profile alignment when all relevant criteria are evidenced; it is not a percentage or converted legacy SVI. Missing all evidence returns null/pending, not100. Missing criteria stay explicit and weights are not renormalized over whichever answers happen to finish. Partial results are experimental and unavailable for ranking. Negative totals are permitted rather than hiding severe deficits under a zero floor.

At least one positive-weight construct must have genuinely unbounded positive measurement domain—e.g. supported recurring revenue/customer stock. For fixed finite freshness>0, as x→∞, asinh(x)→∞, so a fixed13-criterion model has **no finite mathematical upper bound**. Bounded0–100 quality rubrics can coexist, but an all-bounded profile is rejected. Machine-number overflow rejects rather than silently capping to a business score ceiling. There is no finite ladder of badges or arbitrary maximum event count providing the illusion of uncapped scoring.

Example: recurring revenue increases with unchanged anchor/scale and adequate evidence; its contribution rises logarithmically without bound. Ten extra analyses of the same revenue fact add zero. A correction reducing the revenue figure lowers its contribution. Do not substitute index points into an AUD valuation formula or label a high score an investment recommendation.

## Stage, sector and time policy

Freeze profile ID/hash, reference stage/sector, exact units/currency basis, anchors/scales, weights and freshness policy for a comparable series. Derive anchors from adequate reviewed cohorts where available; otherwise label assumptions explicitly. No market benchmark numbers are invented in the library. The checked-in fixtures use synthetic anchors only.

Stage progression is business context, not an automatic bonus. Continue the frozen-reference series to measure actual progress; optionally open a separately labelled current-stage-relative series. A seed→SeriesA profile change is a methodological rebase, not growth. Illustrative stage weighting proposals for review: early stage can shift5 points from revenue toward founder/team; growth can shift toward revenue/acquisition evidence. These are not implemented presets or validated coefficients. Sector-specific unit economics and applicable constructs require separately versioned profiles, with no default AI-sector premium.

Freshness uses measurement/effective date, never fetch/analysis/payment date. Positive evidence decays by an explicitly set half-life; stale negative evidence does not automatically improve simply with time. Dynamic customer/revenue data might use90–180-day half-lives and slow governance/team facts longer periods, subject to calibration. Document resolution evidence before releasing adverse findings. Reverification of the same fact cannot relabel its measurement period to manufacture a fresh positive score.

## Supplemental analysis, reversals and history

- Canonical fact identity is business + underlying economic fact/measurement period, not URL/report/run ID. One fact cannot be reassigned across criteria or dates to create extra points. One document may support genuinely distinct facts; upstream resolver must establish that distinction.
- V1 holds one canonical metric per criterion. New question research updates that construct or fills missing evidence; it does not create an extra point-bearing channel. New economic period replaces the prior stock measurement; it is not added on top of every prior month. A cumulative-sales construct would need a separately approved metric definition.
- Corrections/retractions form an explicit linear supersedes chain. Ambiguous forks reject until reconciled; no cherry-picking the highest score. A retraction leaves the affected construct unknown rather than resurrecting a stale earlier observation. Negative correction deltas are retained.
- Maintain two times: observedAt for business state, recordedAt for when BlockID knew it. Historical as-original views exclude later-known corrections; restated views show a different knowledgeCutoff and preserve the original snapshot. Matching profile hash/method/business and same assessed constructs are required for a direct delta. New coverage must be explained separately.
- Store raw authoritative event provenance, evaluator policy, currency/period normalization and model/source revisions. The pure helper trusts reviewed event admission; hashes are not proof a source is true and cannot detect an upstream resolver inventing new fact IDs. This admission gate must precede activation.

## Implemented now

`src/lib/scoring/svi-longitudinal.ts` is a deterministic, dependency-free scoring contract/library. It validates fixed weight budget and unbounded domain, unit/profile binding, duplicates/fact reuse, corrections/retractions, bitemporal views, positive freshness decay and comparison eligibility. Every output is explicitly experimental and `eligibleForRanking=false`. No legacy scorer, schemas, history store, paid report, valuation or UI consumer is changed.

Ten focused Node built-in tests passed using `--experimental-strip-types`; no dependency/shared cache writes. Tests cover scores exceeding1000 and increasing further, rejection of hidden all-bounded profiles, rerun/credit nonreward, double counting, later-period replacement, adverse correction/retraction, historical restatement/forks, freshness and unit/profile comparability. No broad build/typecheck was run.

## Prioritized integration plan

1. **P0 meaning/data contract:** approve index naming/formula/weight assumptions; keep Investor Score/confidence/valuation separate. Freeze current legacy snapshots and label their method. Inventory all display/export/rank/valuation/persistence consumers across both sites before using the new field.
2. **P0 evidence admission:** trusted metric/fact registry, source claim/entity/unit/period support, dedup across deck/web/connected data, permission and immutable revision storage. Reanalysis quote/consent/jobs must reference this ledger without rewarding credits or reruns.
3. **P1 shadow scoring:** build explicit stage/sector profiles and audited reference datasets; score parallel immutable snapshots. Test plausible weights/anchors/half-lives, dependency/correlation, missingness, bad news, concentration, manipulation and outcome association. Publish no mixed-version ranks or unjustified financial interpretations.
4. **P1 UI/history:** uncapped numeric total + version/reference badge + contribution ledger + missing coverage + evidence freshness + signed change reasons. Keep quality/confidence rings bounded. Offer original vs restated history, never overwrite old reports or paid exports. Compare only matching cohorts/methods or label not comparable.
5. **P2 controlled activation:** explicit versioned API/database field, additive migration and rollback to legacy reader. No in-place replacement of investor_score, svi_hint, total_score, current_svi or old valuation calculations. Live checks must verify every consumer and correction/reanalysis lifecycle before enabling rankings. Root owns deployment and activation.

## Smallest honest report consumption boundary

The intended first reader is `src/components/company/CompanyOverview.tsx`, alongside the existing Investor Score, with a compact native disclosure listing criterion weight, measured value/unit, signed contribution, effective date and source revision. Use a separately persisted `longitudinal_svi` snapshot with exact `method`, profile hash, business/report revision, asOf and knowledgeCutoff; show a numeric total only from admitted events. Without that snapshot, show “Not yet assessed / Chưa đủ dữ liệu đã kiểm chứng” if the feature is explicitly enabled. Do not recalculate old reports during rendering. This boundary is specified, **not implemented or live** in this commit.

A numeric projection from today's generic claims would be fabricated normalization: `src/lib/decision/types.ts` ClaimSchema stores prose, verdict, evidence IDs and checked_at, not canonical numeric metric/unit/measurement date. EvidenceSchema has optional period/currency/hash and arbitrary `data`; “SUPPORTED” or “VERIFIED” alone does not establish normalized ARR, active paying-customer count or distinct fact identity. No approved reference profile or 13-criterion measurement resolver exists in those contracts. The library therefore cannot honestly assign a real business a numeric new-method score merely because a legacy report exists.

The smallest next implementation is a trusted server adapter admitting an explicit structured measurement (business/revision, metric, numeric value, unit/currency basis, effective date, evidence hash and fact identity) against an explicit reviewed reference profile. Persist its event and snapshot additively; invoke the helper at revision finalization, then read that immutable result in the overview. This needs no new provider or charge and can initially cover a supported subset with an explicit partial label. Existing prose claims remain evidence for human review until admission; unknown values remain unknown. New snapshots cannot enter ranks before profile calibration and cohort comparability are established.

Critical unresolved risks must remain visible and may gate ranking/investment eligibility independently of the additive total: sufficiently large positive economic scale can mathematically offset negative criterion contributions. An uncapped index is therefore not a replacement for risk findings, source confidence, investment judgement or business valuation. Risk gates must never silently rewrite the index formula or disguise a numeric cap.
