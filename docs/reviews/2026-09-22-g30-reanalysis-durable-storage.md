# G30 RA1 draft durable storage

Adds draft manual migration `0446_scoped_reanalysis_jobs.sql` and server adapter `src/lib/reanalysis/storage.ts`, based on the admitted-request contract. Billing owner confirmed0446 unused;0443 is a required dependency. No SQL was applied to production, routes enabled or customer fees activated. The current0443–0445 release/schema-transition allow-list must not silently include0446.

## Actual database behavior

- Service-only/RLS tables hold imported report heads, immutable scoped revisions and durable jobs. No application UPDATE/DELETE grant exists on stored revisions. Request stores exact base revision, input hash, private snapshot locator, scope/research policy, quote/price, requester/business owner/wallet references.
- Enqueue locks the payer in the same order as0443/erasure, verifies a non-erased account and unexpired quote binding, checks imported-head CAS, and creates one job/reservation atomically. Unique operation key plus payer/amount/economic-scope fingerprint prevents another arbitrary key repeating the same scope. Scope entries are validated, sorted and deduplicated in SQL too. Fingerprint hash alone never authenticates a replay: full original JSON intent/payer/amount must match; changed requester or quote yields identity conflict without returning another private job.
- Reservation escrow reduces **available** `credit_balances.balance`, while leaving lifetime spent/earned and usage unchanged. Held amount lives in the durable job. Existing atomic spend cannot spend these unavailable credits. On final accepted save, one transaction inserts a revision, verifies base head CAS, restores escrow and calls0443 `apply_credit_operation` spend, then advances the scoped head and completes the job. Restore and capture occur under locks inside the same transaction, so no other writer sees the temporary available amount. Repeated completion returns the existing revision; changed payload is an identity conflict.
- Claim leases use UUID tokens and bounded TTL. Only the current unexpired lease can checkpoint, mark partial or finish. Another worker cannot take a live lease. Expired leases can be reclaimed. Cancel changes server state; cancelled work cannot publish. Release is idempotent, requires the active worker or expired cancellation lease, and restores available balance without inflating earnings or spend.
- Erased payer during a hold cannot recreate or credit an erased wallet. Finish/release moves to `reconciliation_required` and keeps the old report head. This is a deliberate manual-reconciliation boundary, not a completed erasure/refund policy. Retention/erasure-map integration is still required before activation.
- Save/head/receipt failure rolls back capture and leaves the old head intact. A suppressed release-job update raises and rolls back balance restoration; it cannot return a false success then release twice. Partial state does not authorize partial billing: only full accepted scoped result captures in this draft.

## Server adapter

Validated intent now carries server-quote pricing version/expiry so callers cannot swap these through adapter options. Adapter converts integer microcredits to an exact decimal **only when divisible by10,000** (the existing ledger supports0.01 credit); it refuses rounding. Base snapshot reference must come from the authorized resolver. RPC errors and absent durable outcomes fail rather than falling back to old direct spend. Claim/checkpoint/cancel/release/finalize methods are explicit. No HTTP consumer or background worker invokes them yet.

## Scratch PostgreSQL evidence

`web/scripts/db/tests/scoped-reanalysis.py` reuses the existing0443 test fixture through `G30_RECEIPT_TEST_FIXTURE`. It starts only the existing postgres image in a random dedicated container: `--network none`, no host ports/bind mounts, tmpfs data,512MB limit; no image pull, production connection or secret material. The fixture executes actual0013/0015/0324/0443 plus0446 and reapplies0446.

Eight real database cases cover escrow+capture replay, cancel/release, parallel duplicate enqueue, canonical duplicate scopes under another operation key, existing legacy atomic spend versus held balance, competing same-base finalization, save failure rollback, worker lease/cancel behavior, requester conflict, suppressed release receipt rollback, and erased wallet non-resurrection. The erased-account case uses synthetic fixture users/balance deletion only. Eight request-contract tests also pass; targeted adapter/contract ESLint clean. No broad TypeScript or live acceptance is claimed.

## Required before activation

1. Authoritative per-site auth/resource/payer/quote resolvers and a durable stored consent/quote record. RPC is trusted-server-only and does not independently establish customer permissions or validate quote provenance.
2. Both canonical report writers must adopt the scoped-head CAS protocol, or a transaction must bind it to the real report pointer. Initial baseline adoption here trusts the resolver; this table cannot detect a legacy writer changing the external canonical report behind its back. Private analyst vs shared/public report ownership needs its own publication policy.
3. Durable worker/provider cancellation, recovery/reconciliation scheduler, retry policy, source/quality validation and accepted-result schema. PostgreSQL deadlocks/transaction aborts must retry boundedly under stable identity, not silently lose a hold.
4. Held-credit UI/accounting and all legacy wallet mutation paths, erased-account reconciliation and erasure-map/retention handling. Existing raw balance readers show available balance but do not explain holds; no paid activation until these semantics are exposed correctly.
5. Verified-compatible schema transition/rollback plan explicitly admitting0446 and actual source/report/payment acceptance. Do not delete jobs, holds or immutable revisions when reverting application code.

The scoped subsystem now has concrete storage/RPC behavior, but RA1 remains partial until these integrations exist. It does not reconcile previously reported customer credit deductions or prove24/7 operation.

## Root-review fixes: released attempts and deterministic replay

The initial permanent scope constraint prevented a fresh authorized retry after a failed/cancelled release. The draft now keeps one active/captured scope per payer, excludes volatile quote/requester/pricing fields from that scope fingerprint, and introduces `retry_of` with one child per parent. A new attempt requires an explicitly referenced released failed/cancelled parent, the same requester/business/input/scope, a different approved quote and a new deterministic attempt key derived from parent+quote. Price can be requoted after release; a concurrent active attempt still blocks another hold. Same-key retry always returns the original terminal job. Released history without a parent cannot silently become a new charge. Further retries follow the most recent released child; an old parent cannot branch into multiple attempts.

Enqueue now checks exact operation key first, active scope second, then parent/child lineage. It no longer uses a potentially multi-row key-OR-scope lookup. Every replay compares full intent and amount before returning private data. `finish_reanalysis` explicitly raises on suppressed revision insert, before restoring/capturing credits.

Ten real scratch PostgreSQL tests passed after these changes, including concurrent authorized retry after release, no second hold for duplicate requests, stale-parent lineage conflict, deterministic old-key identity conflict and a trigger-suppressed revision insert preserving balance/old report head. Migration remains an unapplied draft; the new enqueue signature has optional fifth `retry_of` argument. No production database had the prior0446 signature applied by this task.
