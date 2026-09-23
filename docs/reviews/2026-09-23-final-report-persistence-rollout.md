# G30 — Final report persistence before completion

## Priority and authorization

Founder requested the most important G30 features first, followed by the remaining features, with incremental live deployment. This slice addresses false completion and incomplete saved documents (F02/T02/O01). DeepInfra-only and the shared US$0.50/report ceiling remain unchanged. Additional test suites, standalone lint, browser acceptance and paid inference are deferred by founder; production compilation and operational deployment admission remain required. No external notifications.

## BlockID source

Source compiled as `6f4e841308a96311fe45e2625df8015a69bb6b75` inserts the assembled row, canonical ReportV2 and complete status together. The returned row must match the requested ID, complete status and normalized full document before callers accept success. The project runner withholds terminal done/complete progress until that persistence succeeds. Missing storage fails before model dispatch; a persistence failure reaches existing caller failure handling. Optional telemetry failures cannot undo a confirmed saved report. The order generator requires a canonical document and binds its reportId to the UUID actually stored; every retry of the same order shares a durable DeepInfra budget scope.

Live assembled_reports schema was read with a zero-row query: id/status/report_json present, HTTP200. No migration required. Source contract expectations updated but not executed. Database RETURNING confirmation is not unknown-commit reconciliation; a lost response remains a failure and recovery/idempotent final commit is still open. Other snapshot/evaluation/delivery writers have not all been converted. This does not implement immutable shared revisions, close billing atomicity or certify all report output.

Origin4120 was explicitly retired under the shared deploy lock, outside active4123/warm4122, with zero tracked activities and unresolved registered jobs observed. Scoped unknown-work acknowledgement remained required: full quiescence was not proven. Artifacts preserved and cap unchanged.

## SVI source

Source compiled as `93478aa926f2db2283b4ebb74871594a7700ff27` replaces each report JSON file using an exclusive random temporary file, file sync, rename and directory sync. Concurrent readers see a complete document rather than a partially overwritten file. For completed writes, the slug document is published before the completed run state. V1 and V2 terminal completion events follow successful persistence. Post-save progress failures remain nonfatal; V1 does not replace the completed analysis with a synthetic preview when final persistence fails.

This is atomic replacement per file, not a transaction across both files, a compare-and-swap writer or immutable revisions. A crash/error between the two replacements can leave the slug published without a completed run; reconciliation remains open. Existing reader schemas, paths, skipSlug semantics and stored document fields remain compatible. No historical report backfill is performed. Auth, report identity, original-input and research source remain unchanged. The deploy operator pins the reviewed store content SHA256 `138639de07168f23b409d0c00587980e717595a4ca6e1fe17a158f65321bef5d` in both source and immutable release instead of falsely claiming the store is unchanged.

## Deployment

Completed23/09/2026 at12:32UTC.

- BlockID compiled `6f4e841308a96311fe45e2625df8015a69bb6b75`, BUILD_ID `zsba3pUtaZpMLTdL2KfNg`, active4124/warm4123. Production build/type compilation, public SHA identity, local/public/auth/static admission succeeded. GET `/api/intake` returned405. Operational mark-good completed with extended review deferred, after the authorized minimum soak.
- SVI compiled `93478aa926f2db2283b4ebb74871594a7700ff27`, BUILD_ID `vVgTuAjIj2VPwUg6B15av`, active4211/warm4210. Isolated production build/type gate succeeded in1m49s, peak1.9GiB. Static union and public identity verified; service boot enabled. Prior report changes0, operator provider calls0, customer writes0. Store source change explicitly reviewed and hash-pinned; other protected runtime unchanged.

Logs: `/tmp/g30-final-save-deploy.log`, `/tmp/g30-final-save-mark-good.log`, `/tmp/g30-svi-final-save-{build,launch,static,promote}.log`. Deferred suites and rollback drill are not passes.

## Next priorities

1. Complete final persistence across legacy snapshot/evaluation/delivery callers, then immutable report revisions and stable old share links using reader-first schema rollout.
2. Durable job/checkpoint and final-commit reconciliation across restart/deploy, building on the existing explicit origin retirement tool.
3. Stronger claim/entity/metric/period verification, question-led research execution and valuation method eligibility.
4. Integrate prepared financial fulfillment only after compatible runtimes/schema/rollback and fee policy gates, followed by remaining report/site UX.

The full45-item G30 plan remains open. Holdout/load/cost/sale qualification is unproven under the current deferred-test instruction; off-host backup remains explicitly deferred. No source or HTTP success is treated as proof that every feature is complete.
