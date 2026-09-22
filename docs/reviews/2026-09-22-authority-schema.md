# Personal report authority — 0447

Source-only migration and isolated PostgreSQL verification. No production migration, report, wallet or provider operation performed.

## Supported boundary

The service-role backend can preview and explicitly connect its verified session actor's own `analyses` report to the existing `credit_balances.id`. Preview creates nothing. Connection requires a completed full report, nonempty untruncated input, current owner and active `app_users` (`deleted_at` and `erased_at` both null), and an exact opaque SHA256 echo from the preview. User locking uses `FOR NO KEY UPDATE` to remain compatible with wallet-first legacy spending foreign-key locks. Report and wallet rows are locked before the preview terms are recomputed. Backend routes must enforce authentication, same-origin mutations and derive actor exclusively from the verified application session.

RPCs:
- `preview_owned_analysis_wallet(p_actor uuid,p_analysis uuid)` returns version, terms and displayedTermsSha256.
- `connect_owned_analysis_wallet(p_actor uuid,p_analysis uuid,p_explicit_acceptance boolean,p_expected_terms_sha256 text)` returns associationId, grantId, walletId, accountId, businessId, revision, inputSha256, rawSha256 and expiresAt.
- `revoke_owned_analysis_wallet(p_actor uuid,p_analysis uuid,p_grant uuid)` validates report/actor/grant; repeated revoke returns false.

Initial connection lasts at most seven days. Reconnecting a revoked grant retains the sealed association's original expiry; an expired association fails closed. Renewal past that point is deliberately not implemented. UI must say **up to seven days**, not promise a fresh seven-day grant after every click.

`accountId` is always the personal `app_users.id`; `businessId` is the analysis UUID representing a report subject, not a legal company ownership claim. The immutable snapshot stores only the explicitly selected report/input fields, excluding operational email/anonymous identifiers. Revision is `sha256:` plus SHA256 of PostgreSQL JSONB text; this is a versioned DB serialization contract, not JavaScript JSON serialization. The exact input text has its own independent SHA256. Snapshots are private and never returned by these RPCs.

## Locked paths and remaining work

Generic connection/revocation helpers and all table mutations remain inaccessible to browser and service roles. Only the own-report producer can seal an association. SVI signed filesystem creator proof needs a separate reviewed bridge validating actor, run, revision, both hashes and freshness; there is no RPC accepting arbitrary SVI ownership claims. Quotes have stored immutable terms/hash, scoped foreign keys and .01-credit precision, but **no quote producer or pricing authority is enabled**. Existing 0446 consent must be reused.

Connection creates no charge, hold, research job, provider search or score update. Before paid activation, extend the existing reservation/worker/finalization path to lock and re-read current associations/grants/quotes and source revision; integrate all report writers. Existing associations do not alone prevent source updates or owner transfer after connection. Owned snapshots have an `analyses` foreign key with cascading deletion, cascading through grants and quotes. Immutable guards permit deletion only after the relevant parent is gone, so deleting a report removes its duplicated input/report payload. Future 0446 financial/consent references require explicit retention reconciliation before paid activation. Table owner administration is not an application authority producer.

## Verification

`scripts/db/tests/run-reanalysis-authority.sh` starts a temporary PostgreSQL instance in a Docker container with no network, host ports or production volume, bootstrapped independently of Supabase initialization; removes it on exit. Applies migration twice, then checks read-only preview, role privileges, genuine wallet identity, exact owner binding, explicit acceptance, deleted/erased accounts, stale terms, truncated input, changed report revision, idempotent connection, immutable grants/quotes, monotonic owner-scoped revocation, and deletion of the report cascading through private snapshots/grants/quotes. This is schema/contract verification; it does not claim 0446 integration, concurrency reservation tests or production activation.

## Existing account-erasure compatibility

The follow-up isolated suite executes the **actual unmodified 0442 `erase_account` migration**, not a simulated deletion helper. It supplies representative account/report/wallet tables and allows the routine's normal missing-table path to skip unrelated subsystems. A real private snapshot, active grant and quote are created first. Dry-run preserves them; service-role erasure deletes the owned analysis, cascades snapshot/grant/quote deletion, removes the wallet and tombstones the account. Preview then denies access and repeating erasure remains successful. This verifies the relevant erasure dependency order; it is not a complete production-schema restore drill.

`CASCADE_ERASURE_COVERAGE` records all seven new app_users foreign keys as covered by `analyses.user_id` deletion. These entries deliberately do not enter the direct-delete SQL map: direct deletion would violate the sealed-record guard while the original report remains. The FK fixture now includes seven explicitly source-derived 0447 rows, pending the normal live catalog refresh. The 0442 routine and the pinned 0447 migration bytes remain unchanged. SVI association creation stays disabled; before enabling it, its non-analyses source needs a separate erasure mechanism and coverage.

Validation: isolated schema plus actual-erasure suite passed; privacy map suite **12 tests passed**. No production database writes.
