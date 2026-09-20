# Startup Value Index — score governance

**Methodology version:** the current `SVI_VERSION` is printed on `/methodology` and on every report; this document describes the rules that version follows.
**Published at:** `https://blockid.au/methodology/governance` (rendered from `web/src/app/(marketing)/methodology/governance/governance-content.ts`, which reads the same code constants the engine runs on; the section list of that page is tested against this file).
**Audience:** accelerator and program managers, investment committees, university and government innovation programs, and auditors of any of them.
**Principle:** BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.

## 1. Purpose and scope

The Startup Value Index (SVI) is a deterministic, evidence-weighted assessment of a company across eight business dimensions. It exists so that every company in a cohort, a pipeline or an index is assessed on the same framework, with the same evidence rules, at every point in time. This document is the governance contract for that score: what the dimensions mean, how weights and versions are managed, what the score may and may not claim, how conflicts between claims and evidence are handled, when humans intervene and how that intervention is recorded, and how the score is corrected and re-run.

The score is information, not financial, legal or investment advice. Evaluators and founders make their own decisions.

## 2. The eight dimensions

Each dimension is scored 0–100 from structured signals, then carries a weight, a confidence value, the evidence rows it rests on, the items that are missing, a benchmark position (when the benchmark rules in § 7 allow one) and a next action. The names below are the engine's names (`web/src/lib/report-pipeline/dimension-owners.ts`); the public page uses the same strings.

| Code | Dimension | What it measures | Primary analytical lens |
|---|---|---|---|
| FTV | Founder & Team Value | Founding team credibility, domain expertise, execution track record, and team completeness | People (CHRO) |
| MPC | Market Pull & Category | Market size (TAM/SAM/SOM), problem severity, customer segment definition, and timing | Marketing (CMO) |
| PTD | Product & Tech Depth | Product differentiation, technical moat, IP, build stage, and scalability | Technology (CTO) |
| TRE | Traction & Revenue Evidence | Revenue, month-on-month growth, usage, retention, paying customers, and pipeline | Revenue (CRO) |
| CGH | Capital & Governance Health | Equity structure, vesting schedules, board composition, and investor governance | Finance (CFO) |
| IRI | Investor Readiness Index | Data-room completeness, pitch-deck quality, due-diligence readiness, and prior raises | Legal (CLO) |
| LCO | Legal & Compliance | Legal incorporation, IP protection, regulatory compliance, and contract hygiene | Legal (CLO) |
| SVM | Strategic Vision & Moat | Long-term defensibility, network effects, brand positioning, and exit potential | Strategy (CEO) |

Each dimension is assessed through a fixed set of evaluation criteria (thirteen across the eight dimensions). A criterion that has no evidence is reported as **pending**, never scored as zero and never imputed.

## 3. Weights

- Weights are fixed per methodology version and sum to 100. The published table lives in `web/src/lib/report-pipeline/dimension-owners.ts`; the scoring engine carries the same values, and consolidating every copy onto that one table (with a parity test) is scheduled for the next methodology release. No report, pipeline or reviewer can change a weight at run time.
- The heaviest dimension is Traction & Revenue Evidence; the lightest is Strategic Vision & Moat. The full weight table is shown to authenticated evaluators inside every report and is not published on the public page, so that the public rubric describes what is assessed rather than how to write to it.
- Program-specific rubric weights (BlockID Cohort) re-aggregate the eight dimension scores for the displayed cohort score only; the underlying dimension scores and the canonical SVI are never altered by a program's weights, and both are stored.

## 4. Evidence and confidence

Every signal that feeds a dimension carries an evidence level. The level sets the confidence multiplier applied to that signal:

| Level | Confidence | Who may set it |
|---|---|---|
| `self_declared` | 0.20 | founder text |
| `public_url` | 0.35 | founder text that links a page BlockID can open |
| `document_uploaded` | 0.50 | founder upload |
| `connected_source` | 0.75 | connector (machine-read from the source of record) |
| `transaction_data` | 0.90 | connector, for revenue and payouts |
| `third_party_verified` | 1.00 | a named BlockID reviewer, after the founder requests review; audit-logged |

Caps are enforced by origin (`web/src/lib/evidence/confidence-cap.ts`): typed prose cannot grade itself above `public_url`, an upload cannot post itself above `document_uploaded`, a connector cannot exceed `transaction_data`, and only a reviewer can set `third_party_verified`. Writing "audited" in a description changes nothing.

Business verification (L0 unverified → L5 continuous monitoring, `web/src/lib/verification/level-engine.ts`) applies a bounded multiplier to the confidence of the whole record (×0.85 at L0 to ×1.10 at L5), never above the next rung's ceiling and never above 1.0.

## 5. Versioning and version history

`SVI_VERSION` (`web/src/lib/svi-analysis.ts`) is stored on every snapshot and every report, together with the report-schema version and the pipeline version. A stored report keeps the versions it was produced with and is never silently re-scored by a newer rule set; a re-score is a new snapshot with the new version.

| Version | Date | Change | Type |
|---|---|---|---|
| 1.0.0 | 2026-05-19 | First engine: single composite score from text input | — |
| 2.0.0 | 2026-05-19 | Eight-dimension model, stage tracking, evidence wizard | **major** — dimension set defined |
| 2.1.0 | 2026-08-16 | Funding-readiness gates; enhanced finance, strategy and data analysis prompts | minor — criteria / narrative |
| 2.2.0 | 2026-09-16 | Confidence cap by evidence origin; business-verification multiplier | minor — evidence rules |

## 6. Change policy (semantic versioning)

| Change | Version step | Notice |
|---|---|---|
| Wording, narrative prompts, report layout | patch | changelog |
| A weight, a criterion, an evidence-level value, a cap or multiplier | **minor** | changelog + this page's history table before deploy |
| The set of dimensions, the score scale, or the benchmark rules in § 7 | **major** | this page, `/methodology`, and every institutional customer notified in writing before deploy; both versions run side by side for one full cohort cycle |

Every change is reviewed against the backtest (`/methodology/calibration`) before it ships. A change that improves agreement on the training cohort but worsens it on the held-out cohort does not ship.

## 7. Benchmark publication rules

A benchmark compares a company with others at the same stage (and, when the sample allows, the same sector). Publication follows the sample size `n` of the comparison set:

| n | What may be shown |
|---|---|
| fewer than 10 | no percentile, no rank — "not enough comparable companies (n = N)" |
| 10 – 29 | a percentile band labelled **indicative** |
| 30 – 99 | a basic percentile |
| 100 or more | segmented percentiles (stage × sector) |

`n` is always shown beside the figure. A national or sector "average" without its `n` is not permitted on any surface (`docs/design/messaging.md` § 11). Every cohort percentile, median and benchmark line is produced by one publication module (`web/src/lib/benchmarks/publication-rules.ts`, floor `BENCHMARK_MIN_N = 10`; `lib/svi/benchmark-rules.ts` re-exports it): below the floor the surface prints "not enough comparable companies (n = N)" or "no cohort benchmark yet (n = N)" instead of a number, 10–29 is labelled **indicative**, and a stored rank is read only through `publishedFromCohort()` — the `published` field of the cohort result, never the legacy `percentile` / `percentileRank` estimate. Routed through it (G21 P1-C + the P1 review): the cohort-percentile module (`COHORT_MIN_N` reads the same floor), the founder dashboard and the "How you compare" card, the SVI results panel, the ReportV2 adapter (cover rank + per-chapter "you: Nth percentile (n = N)"), the report web view / PDF / DOCX / e-mail, the free summary PDF and the paid SCN report PDF (rank, stage median, "AU average" removed), the SCN action-plan label, the Investor Dossier header, the IC memo / one-pager, the sector / stage indices, `/api/benchmarks` (n counts companies — one latest analysis per project — and the static fallback returns null figures with a `reason`) and the calibration backtest. The only figures outside the module are the per-dimension **stage reference anchors** (p25 / p50 / p75 from `lib/svi-dimension-benchmarks.ts`) printed beside a chapter score in the report, the cover table, the IC memo "p50" column and the `benchmark_only` visuals: an editorial table, always labelled "Stage", never presented as a cohort figure or a rank. The rule is enforced in code, not copy.

## 8. Conflict handling — claim states

Every claim a company makes is stored separately from the evidence for it and carries one of five states (the claim register ships with the Assessment Card, v3.19; until then the report shows the evidence ladder level and the verification state per dimension):

| State | Meaning | Effect on the score |
|---|---|---|
| **claimed** | Stated by the founder; no evidence attached | counts at `self_declared` confidence |
| **evidence-backed** | A document, link or connector supports the claim | counts at the evidence's level |
| **verified** | A named reviewer confirmed the evidence against its source | counts at `third_party_verified` |
| **unverified** | Evidence was requested or has expired and is not on file | counts as a **gap** (pending), not as false |
| **conflicting** | Two sources disagree (for example, a stated revenue figure and connected transaction data) | the higher-confidence value is used for the score, the lower-confidence value is kept on the record, and the conflict is shown on the report with both figures |

Conflicts are never averaged and never hidden. A conflicting claim is flagged to the founder with the evidence that would resolve it; while it is open, the dimension's confidence reflects the disagreement.

## 9. Human review and overrides

- **Reviewer decisions** (marking evidence `third_party_verified`, rejecting an upload) are made by a named BlockID reviewer, only after the founder requests review, and are written to the append-only, hash-chained audit log with the reviewer, the time and the reason.
- **Evaluator decisions** (pass, track, proceed, with conviction and private notes) are recorded per evaluator per company and are separate from the score; they never change the SVI.
- **Overrides** of a score or a dimension inside a cohort view (BlockID Cohort, v3.20) are recorded as an override row: original value, new value, who, when and why. The canonical score is unchanged; the cohort view shows both and labels the override. An override is never silent and never retroactive. Until the cohort override row ships, evaluators record disagreement as a decision with private notes (above), which never changes the score.
- **Automation never decides.** The engine produces the assessment; the program's committee, the investor or the founder makes the decision and records it.

## 10. Corrections and appeals

1. A founder (or an evaluator with access) flags a specific item — a score input, an evidence row, a benchmark, a narrative statement — from the report.
2. The flag is logged (item, reporter, time, reason) and acknowledged.
3. BlockID checks the item against its evidence. If the input or the evidence handling was wrong, it is corrected at the source and a **new report version** is produced with the new `SVI_VERSION`/snapshot; the old version is kept.
4. If the item is a genuine gap, the founder is told which evidence closes it, and a re-score follows once it is supplied.
5. Outcomes are recorded on the audit log. Corrections that reveal a rule defect are handled under § 6.

Appeals about a program's decision go to the program; BlockID can only correct the assessment, not the decision.

Implementation (G21 P1-C): the founder files from `/workspace/evidence/corrections` (kinds: incorrect data · stale data · misunderstood evidence · duplicate company · wrong sector / stage · unsupported report statement) into the `corrections` table (migration `0418_corrections.sql`); the admin queue is `/admin/corrections`. A correction is logged, never applied in place: an accept records a resolution (`correction.accepted` audit row, founder e-mailed) and only a sector / stage correction with a proposed value is written, through the project update path (`updateProject`, versioned and audit-logged); the resolution text states exactly what was — or was not — changed. The same page shows what BlockID holds about the startup (evidence status counts, who has access, what was shared, last refreshed) with links to the existing revoke controls.

## 11. Re-score policy

- A re-score happens when evidence is added, verified, expires or is corrected; on the scheduled daily snapshot for tracked companies; or when the methodology version changes.
- Each re-score writes a new snapshot; the history is kept so movement over time is real movement, not a rule change. When the version changes, the report states the version of every snapshot it compares.
- Cohort batches are scored on one version; a batch is never mixed across versions.

## 12. Model provenance

The deterministic score never touches a language model. Narrative chapters do, and every run records the model that produced each chapter plus an auditor stamp: whether the text is grounded in the evidence rows, how many statements went uncited, and whether the auditor revised it. Models are routed by availability and cost and can change between runs; the record of which one ran does not. BlockID makes no claim that any vendor's model is better than another's.

## 13. Data limitations

- The assessment reflects the evidence on file at the time of the snapshot. Missing evidence is reported as pending, not inferred.
- Self-declared inputs carry low confidence by design; a company that supplies only prose will show a low-confidence score, not a low score.
- Benchmarks depend on the size and composition of the comparison set (§ 7). Early cohorts and rare sectors will show "indicative" or no percentile.
- Outcome calibration (`/methodology/calibration`) is a backtest on a curated Australian cohort; it is published with `n` and confidence intervals, and it does not forecast an individual company.
- Connectors read what the source of record exposes; they do not audit it. `third_party_verified` is the only state that involves a human check against the source.

## 14. Contact

Questions about this document, requests for the weight table under an evaluator agreement, and correction requests: [support@blockid.au](mailto:support@blockid.au) (the founder correction workflow inside the workspace ships in v3.19). Institutional customers receive written notice of every major change (§ 6).
