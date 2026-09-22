# Draft 0451: research reservation and account lifecycle

Financial draft only. No live SQL, worker, provider call, paid admission route, schema manifest or release allowlist activation. Depends on the reviewed draft receipt/job contracts, unchanged 0447 authority, and 0448–0450. Reviewed 0445 is unchanged.

## Economic decisions

A reservation reduces available balance without recording a captured spend. Cancellation returns exactly the held amount once, only to the original existing wallet ID belonging to an active payer. It does not increment lifetime earnings or reverse captured spending. Closed accounts, absent/replaced wallets and already reconciliating jobs retain their held amount with `reconciliation_required`; no balance is inserted and no payment refund is claimed. Reopening an account does not automatically settle a previously quarantined hold.

Captured jobs remain captured. Cancellation cannot refund them. Successful result publication and capture retain the existing atomic transaction. Exact successful finalization replay compares the stored result/source reference; erased content returns `content_erased` without exposing or recreating it. Existing financial operation receipts are unchanged.

Cancellation immediately clears the lease and durably releases/quarantines the hold. Any outstanding provider request may still finish externally; late database checkpoint/publication/capture cannot succeed. Grant revocation performs cancellation in the same transaction. Revocation and soft account closure preserve private research content; only actual account erasure removes it.

The service-only `reconcile_reanalysis_lifecycle(job_id)` checks one exact job. Natural quote/grant/association expiry, stale authority or missing authority triggers durable release or reconciliation. Claim/checkpoint/finish run that same check. This migration does not create a scheduler: an eventual trusted bounded dispatcher must invoke reconciliation for abandoned jobs. Valid-authority jobs with an expired worker lease remain retryable; quote expiry eventually makes their hold cancellable. Failure release requires the current unexpired worker token. Explicit cancellation is a separate trusted capability.

## Tables and privacy

- `reanalysis_accounting_evidence`: append-only job/payer IDs, original wallet UUID (deliberately no wallet FK), amount, intent/key hashes and creation time. The evidence survives deletion of the actual wallet.
- `reanalysis_lifecycle_events`: append-only per-job release/capture/reconciliation/erasure event, bounded reason, amount and timestamp. Erasure records the consent digest/accepted time and result digest, without raw content.
- `reanalysis_jobs`: retained minimal accounting identity/state; actual erasure replaces intent with a unique erased-job marker, hashes the original operation key in evidence, clears its checkpoint/lease, and records content erasure time. Held and captured classifications are preserved.
- `reanalysis_revisions`: private result/source reference deleted on actual erasure.
- `reanalysis_heads`: account's pointers deleted on actual erasure.
- `reanalysis_consents`: exact terms deleted only after the actual erased-account tombstone exists and matching immutable consent digest/time evidence has been inserted. No caller-controlled bypass flag or direct service-role write privilege is added.
- `analyses` and 0447 association snapshots/grants/quotes: actual 0445 deletes analyses before balances; existing FK cascades remove authority content first. The 0451 account-erasure trigger also deletes any remaining owned analyses before scrubbing job content.

Account locks serialize closure, cancellation, checkpoints, finalization and grant revocation. Authority paths retain account → analysis → wallet → authority rows → job/head ordering. The erasure trigger runs under the original account lock; actual 0445 erasure and late workers are tested together. Private saved implementation functions and internal settlement helpers lose service-role execute privileges, preventing bypass of lifecycle admission.

## Historical payload boundary and activation gates

New job intents reject unknown keys. Migration preflight rejects pre-existing unredacted jobs/capture intents with extra fields. `web/scripts/db/audit-reanalysis-payloads.sql` is a separate read-only count audit for job, receipt, ledger and usage intent shapes; any findings block activation. No customer payloads are printed.

Allowlisted keys alone do not prove arbitrary string values are content-free. Historical financial receipt fingerprints and ledger metadata can contain caller-supplied intent; this migration intentionally preserves their exact immutable replay contract. A separate versioned redaction design is required if a historical payload audit finds extra/source-bearing data. No assertion is made that historical data was checked on production or is inherently safe. Worker activation remains blocked until this audit, current privacy-function integration and complete financial release checks are reviewed.

SVI execution, browser routes and a background dispatcher remain disabled. This lifecycle does not grant cross-account authority or create new price/credit entitlements.

## Validation and checksum

17 isolated PostgreSQL tests passed on the final SQL: both erasure/finalization orders; concurrent cancel/failure release; actual0445 erasure with leases/consents/0447 cascades; no double release; natural quote expiry; revoked/stale authority; absent/replaced wallet; captured receipt preservation; soft closure content retention; helper privileges; extra-intent refusal; historical payload audit; and migration reapplication after erasure. Scratch container used no host network, binds or ports and was removed. No production data was inspected. `git diff --check` passed.

0451 SHA-256: `0caf6721173aa177cf1de013b6f8efccb96ed6cdf37e5c780ee772e3f298a481`. Existing 0443–0450 SQL bytes remain unchanged in this commit.
