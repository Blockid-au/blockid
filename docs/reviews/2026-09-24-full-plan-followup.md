# G31/G32/G33 full-plan follow-up — 24/09/2026

## Latest evidence and acceptance boundary

Review source baseline: BlockID `192974ad2`, SVI `edebcea`. Concurrent new work
must receive its own source/test/release evidence; it is not implicitly live.
This follow-up supersedes current-status language in the 13:59 review where
the later deployment provides evidence, while retaining that historical audit.

[Production receipt](2026-09-24-cfo-production-deployment.md) records both sites
checked at **23:33 UTC**:

| Site | Serving source / build | Active / warm |
|---|---|---|
| BlockID | `871f2fee425f7faf5cbaa487fb4d14a78eb587ea` / `euTqmQtYoKNROtDD9i1TI` | 4143 / 4142 |
| SVI | `edebcea1127c6432282cf541f5b1f54e7bc47649` / `R5H7MK_-s_2Z6ee8OhAQZ` | 4212 / 4211 |

These are receipt identities, not a new production probe in this follow-up.
Operational release acceptance is complete under the authorized accelerated
policy. **Full G31/G32/G33 and financial/product acceptance remain open.** The
release did not activate official valuation, live SVI scoring or new financial
rights. Authenticated live scenario calculation, report canary, extended soak and
financial holdout were not demonstrated by that receipt.

Recorded validation includes 42,586 BlockID tests passed/2 skipped, 12 candidate
browser smokes, 142 public hydrated smokes/2 skipped, production builds, source
hash parity, and SVI focused checks. Counts from overlapping focused suites must
not be added together. ESLint baseline debt and extended review were explicitly
deferred/unverified. The login/sample-report edge CSP/hydration observations are
still open and should not be hidden by the passing scoped smoke.

## G31: complete IL inventory, with remaining dependencies

The 13-criterion summary and SVI 16-question reading/export surface are deployed
prerequisites. They are **not** the six-signal Investor Lens or the 52-question
score ledger. At the review SHA, tracked application source still has no
`investorLens` or `NEXT_PUBLIC_BLOCKID_INVESTOR_LENS`.

| IDs / phase | Current state | Remaining work / dependency |
|---|---|---|
| IL15 / R0 | Planned, not implemented | Golden SVI including dossier/degraded fixtures, guard and build-time flag; can proceed without inference |
| IL01, IL04, IL05 / R1a–b | Lens planned; criterion summary deployed | Shared schema/projection, 4 tiles/6 signals/3 strengths/3 blockers/3 questions, neutral labels and web/PDF/DOCX/email parity. `tbr-v3-strings.ts` still contains “Investable now”. Depends on R0 and meeting-label decision |
| IL02, IL06, IL07 / R2 | Planned | Versioned overlays; five evidence freshness bands; Team/Traction/Moat&IP; criterion lineage and prior-dimension scores. Depends on R1 and revision-writer handoff |
| IL03, IL08, IL09 / R3–R5 | Existing evaluator primitives only | Ranked evidence-driven questions, unknown risk probability, evaluator handoff and calibrated signal/cap-table/route thresholds. Current `investment-view.ts` still infers likelihood from evidence availability |
| IL10 / R4 + R4b | Founder tools exist; Lens integration absent | Privacy-safe cap-table aggregate/pro-forma, missing-data state; XLSX import after intake readiness. Depends on owner-scoped writer and IL03 thresholds |
| IL11 / R5 | Existing exit/comps tools only | Deterministic liquidity routes and buyer classes, sourced/date-labelled AU comps, blockers; no exit-money prediction. Named buyer research waits R01/R02 |
| IL12 / R6a–b | Planned | Revision-bound projection migration/backfill, cohort filters, CSV/API additive fields and access parity. Depends on earlier signal contracts and migration authority |
| IL13 / R7a–b | Partial generic report/export improvements | Full specified 16-section order, Brief/Full export, samples/methodology/API content; existing old 16-section report is not completion |
| IL14 / R7 | Not accepted | Real 20-person usability and demo A/B measurements; unit tests cannot substitute |
| IL00 / R7 | Open | Verify input slide's source or explicitly label unverified |

## G32: every scoring and valuation phase remains accounted for

| Phase / IDs | Implemented/deployed evidence | Remaining acceptance and dependencies |
|---|---|---|
| SV0 / A04,A05 | Rubric contract described | Complete reviewed 52-question rubric@v1, applicability and examples; do not fabricate analyst labels |
| SV1 / A04 | Not complete at review SHA | Index-only reader/filter cap removal, no “/100” index label, version-aware delta and explicit method. Mandate/saved-view validators still cap100; confidence/dimension percentages must retain their own scale |
| SV2 / A04,A05 | Scenario evidence hashes exist, not score revision metadata | Immutable `svi_method`, rubric/profile/cutoff and per-question contribution ledger; no metadata backfill that invents history |
| SV3 / A05 | `svi/question-panel.ts` pure shadow reducer deployed | W1–W3 owner scores, two real independent-family judges, durable SCORE stage, accepted quote packs, persistent cache, shared C+S+T−A engine and budget accounting. Helper has no inference/cache store and does not close SV3; live shadow calls retain S1 seven-day gate/O08 dependency |
| SV4 / A04,A05 | No accepted calibration corpus | 30–50 firms, two human raters, α≥0.67/κ≥0.6, drift/sensitivity and cost qualification; single-valid-vote policy needs analyst review |
| SV5 / A04,A05 | No live activation | Both-site consumer migration, reviewed overrides/ledger/UI, full report SLO and calibrated constants; retain prior method history |
| SV6 / A04 | No accepted index publication | Divisor, stage-cohort publication rules, additive API, exclusion of samples/reruns/draft scores |
| V04a | Legacy score-to-money paths remain | Remove report adapter and first-analysis fallbacks; explicit method-local not-estimable. Do not pretend the scenario engine replaced all old consumers |
| V04b / V01–V03 | Shared deterministic scenario methods and projection/FCFE core deployed | Qualified financial source → method eligibility → independent calibration → immutable official valuation → all consumers. Pre-revenue eligibility must not require MRR; no unsupported anchor or WACC defaults |

The SVI `svi-evidence-state-v1-draft` still uses base100 plus adjustment; it is
not approved G32 no-base/no-cap scoring. Keep versioned migration explicit.

**Reader-audit correction:** `cohort-snapshots.ts:212` clamps the stored
`evidence_confidence` percentage, correctly, and must not be changed for SV1.
The index-specific cohort issue is the shared range parser in `cohort-rows.ts`;
split index parsing from confidence/traction ranges. Preserve dimension,
confidence and `min_fit` bounds. The earlier audit's snapshot-line attribution
was wrong and has been corrected explicitly in its SV1 row.

### CFO V04-P0…P8 substeps

| Slice | Latest state | Still required |
|---|---|---|
| P0 | Method/caller disposition documented | Analyst disposition/standards-basis review |
| P1 | Scenario provenance/rejection implemented | Authenticated, complete, entity-bound financial producer; meaningful positive and negative input tests; authority/canary before official admission |
| P2 | Scoped monthly/annual schedules and six templates deployed | Actual reconciliation, jurisdiction-specific schedules, complete three statements and corpus |
| P3 | Six method/anchor families and explicit FCFE adapter deployed | Qualified heuristics/First Chicago inputs, complex rights allocation and method review |
| P4 | Shadow reducer and bounded score-driver proposal contract deployed | Real rubric/panel/calibration, source revision integration and persistent ledger |
| P5 | Open | Independent transaction/forecast corpus, holdout, sensitivity and calibration |
| P6 | Scenario JSON/CSV/hash and criteria surface parity deployed | Official immutable valuation repository, CFO narrative number audit, all report outputs and full XLSX workbook |
| P7 | Shared new scenario files on both sites | Retire duplicate official engines; migrate share-price/vesting/dividends without rewriting issued rights |
| P8 | Scoped operational deployment accepted | Authenticated calculation, stable canary, independent financial/score acceptance and monitoring |

## G33: task and phase reconciliation

| IDs / phase | Latest evidence | Remaining gate |
|---|---|---|
| T01 / S0 | Aggregate report-down veto deployed;122 route tests | Reconcile original threshold requirement with current reducer: ≥2 no-report runs and ≥half window, or latest2 no-report. `degradedShare` measures any partial degradation, not fully absent reports |
| T02 / S0 | Earlier degraded-QA rejection fix live | Prove on actual free/paid report canaries; HTTP and generic UI smoke are insufficient |
| T03 / S0 | Cron-health timestamp tolerance fix in earlier live receipt | Ongoing cron operational evidence; do not call missing telemetry a pass |
| T04 / S0 | Latest full suite42,586pass/0fail,2skip | Specific original test repair evidence plus current suite support this code slice, not all S0 product gates |
| T05 / S1 | Streaming/model timeout/strike improvements live | Shared concurrency≤3/model, bounded queue and observed deadline behavior across real reports |
| T06 / S1 | Reservation sizing and summary protection improvements live | Unknown-attempt usage reconciliation, restart/retry budget invariants; dependency O08 |
| T07 / S1 | No replacement acceptance after historical13:36failure in reviewed receipts | Five consecutive real runs incl free and paid,≤1degraded,words>0,≤6min,targetcost,immutable read-back and24h status; do not infer from42k tests |
| T08 / S2 | Earlier graph verifier13,971rows/5pinned forks live receipt | Signed-reconciliation requirement vs pinned-fork design delta, ongoing chain verification |
| T09 / S2 | Snapshot schema fix live receipt | Two-day successful cron evidence |
| T10 / S2 | Revision migration source restored/pending-authority | Canonical migration/manifest/authority reconciliation |
| T11 / S2 | Erased-address mail guard live receipt | Operational no-erased-recipient evidence without sending test mail |
| F02,F04,T02,O05,O06,O08,E03 / S3 | Immutable foundations and warm releases live | All callers, durable jobs/reconciliation, semantic evidence verification and proved automatic quiescence. `paywall/report-generator.ts:415` still calls `insertCompletedAssembledReport`, not final immutable revision |
| T12 | Open | Refresh dependency evidence; PPTX compatibility, not old CVE assertion copied forward |
| T13 | Owner-access fix earlier live | Broader rate-limit/scanner coverage; owner fix alone is insufficient |
| T14 | Open | SSE MaxListeners cleanup and repeated connection validation |
| T15 | Open | Route/report performance budget and measured loading behavior |
| T16,T16b–i / S1 | Prior reserve/hedge/throughput improvements live | Acceptance remains attached to actual S1 completion/cost tests |
| T16j–k / S1 | Historical outside-DeepInfra fallback superseded by current restriction | Do not reactivate Groq as a shortcut to the stability gate; measure DeepInfra-only completion |
| S4–S6 | Some independent prerequisites/scenario helpers deployed | G31/SV/V04 exit requirements above remain; pure helper deployment is not phase completion |
| O09 offsite backup | Explicitly deferred | No host-loss/HA acceptance claimed; existing local recovery remains required |

## Highest-priority next implementation slices

1. **V01/E02/P1:** strict native-AUD recurring collector, verified project/user/entity
   binding and completeness; positive producer admission must be a separate
   evidence-backed gate. Registry was empty at this review SHA. Work happening
   concurrently must not be recorded as deployed here.
2. **F02/F04/A01–A03:** retain the full final answers/citations. SVI
   `job-runner-v2.ts:225,491–493` still truncates to600characters and uses empty
   evidence IDs. All16questions displaying successfully does not restore lost
   content. Recover old content only from source-linked stored artifacts.
3. **S3/P6:** unify paid/legacy final-writer and immutable delivery before claiming
   scenario results are the official saved valuation; require read-back and
   failed-retry preservation. No adapter should fabricate an official result.
4. **SV1 + G31R0:** safe index-reader/filter updates and unchanged-score goldens;
   this can proceed without model calls or scoring activation.
5. **SV0/SV2:** real rubric catalogue and metadata/revision contract. Then panel
   inference/calibration when gates permit, not a generated claim of52scores.
6. **T07/O01:** gather the authorized canary/stability evidence and per-model cost
   and capacity data. Catalog price alone is not throughput/quota or cheapest
   qualified cost per accepted report.

All existing route inventory/persona/UI/billing/security/integration gates remain
under U06/O03/O04/S03. This document neither narrows the full plan to CFO alone
nor marks every inventoried route functionally reviewed. The baseline reconciliation
above changes documentation status only; the source follow-up is recorded separately below.

## Follow-up source implementation: SVI answer preservation (not deployed)

After the baseline review above, the authorized bounded F02/F04/A01–A03 slice
removed the 600-character cuts from both intermediate and final streaming-v2
answers. A new pure `job-runner-answer-persistence.ts` maps direct quote strings
to deterministic run/question/content-revision-bound references **only when the
quote exactly occurs in that question's submitted prompt excerpt**. The additive
`answer_sources` catalog accompanies the completed report (`schema_version:4`).
It records quote text, excerpt hash and offsets as `founder_submission` /
`exact_quote_only`; it never claims independently verified financial facts.

Shared findings resolve only same-run/question/revision baseline sources and
label quotes/locators consistently in web, email HTML/plaintext and DOCX. No
private accepted-research store is loaded or merged. Fabricated/nonmatching
quotes are excluded; duplicate or cross-scope catalog entries do not resolve.
Full narrative text is preserved. Missing criteria remain explicit, and old
reports without the optional catalog remain readable. Previously truncated
reports are **not automatically recovered**; that requires source-linked
historical artifacts or an authorized new revision.

Validation:16focused Node tests pass, including actual atomic temp-file
write/read/slug reload, bilingual answers beyond600characters, tail qualifiers,
escaped quote exports and withheld private/cross-scope sources. These tests do
not generate a production report or make model calls. Full SVI `npm run typecheck`
passed. No deployment has been performed for this slice.

**Next rollout authority:** `src/lib/decision/store.ts` changed (additive optional
type); its source SHA256 is
`8971b4637c3e458109caead7e0aee81e5e5e47fcdc0525d5098898e5a4ecb877`.
Release tooling must recompute source/store digests and reader-capability
admission rather than reuse the prior release's receipt. New readers support
legacy records; prior readers can retain the old `answers` shape but cannot
render the new quote catalog, so byte readability is not full surface-parity
rollback evidence. Do not alter requiredCapabilities or runtime authority to
bypass that review. No migration, runtime manifest or production record was
modified by this source slice.


## Additional implemented source slices

The [Stripe/index follow-up](2026-09-24-stripe-source-and-index-followup.md)
records the bound collector across callback/manual/background sync, observation
persistence without financial/scoring promotion, and saved-view/cohort index
filter fixes. Those source changes supersede the corresponding baseline open
items above only for their stated scope. Official source admission and full SV1
remain open.

The [provider follow-up](2026-09-24-g33-customer-provider-bypass-closure.md)
closes two customer Anthropic bypasses and constrains CFO explanation to
engine-owned statements selected by validated references. It does not qualify a
new cheapest model or prove production throughput. The [CSP follow-up](2026-09-24-csp-streaming-edge-review.md)
fixes the streamed footer boundary in source; independent edge-injected Google
Tags configuration and live verification remain open. None of these follow-up
source slices is implicitly deployed by the earlier production receipt.

## Final source verification (25/09 UTC)

Combined tests for all changed BlockID test files: **15 suites, 304 passed**.
Full BlockID TypeScript check passed after the final manual-sync and cohort
changes. ESLint for changed source/test files: **0 errors, 4 existing unused
parameter warnings** in the data-room test. `git diff --check` passed. These
focused counts overlap the individual receipts and are not additive.

SVI source commit: `20d7245` (complete answers and bound submitted quotes).
The new persistence test file was rerun independently: **5 tests passed**;
the earlier 16-test grouped receipt also included adjacent report checks.
Full SVI TypeScript check passed again. Neither site was deployed in this
follow-up. Live canary, source admission, calibration, migration and remaining
G31/G32/G33 acceptance gates remain as listed above.
